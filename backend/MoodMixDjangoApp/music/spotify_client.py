import os
from datetime import timedelta
from typing import Any, Dict, List, Optional

import requests
from django.utils import timezone

from MoodMixDjangoApp.models import UserProfile

SPOTIFY_API = "https://api.spotify.com/v1"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"

CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")


class SpotifyHttpError(RuntimeError):
    def __init__(self, status: int, payload: Any):
        super().__init__(f"Spotify HTTP {status}: {payload}")
        self.status = status
        self.payload = payload


def _chunk(seq: List[str], size: int):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


class SpotifyClient:
    """
    Thin wrapper over the Spotify Web API with:
      - auto token refresh on 401
      - paging helpers
      - ONLY non-deprecated endpoints.
    """

    def __init__(self, profile: UserProfile, timeout: int = 15):
        if not profile.spotify_access_token:
            raise RuntimeError("UserProfile is missing spotify_access_token.")
        if not CLIENT_ID or not CLIENT_SECRET:
            raise RuntimeError("Server missing SPOTIFY_CLIENT_ID/SECRET.")
        self.profile = profile
        self.timeout = timeout
        self.session = requests.Session()

    # ---------------- token / headers ----------------

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.profile.spotify_access_token}"}

    def _needs_refresh(self) -> bool:
        exp = getattr(self.profile, "spotify_expires_at", None)
        if not exp:
            return False
        return timezone.now() >= (exp - timedelta(seconds=30))

    def _refresh_token(self) -> None:
        if not self.profile.spotify_refresh_token:
            raise RuntimeError("No refresh_token stored for this user.")
        import base64
        basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
        headers = {
            "Authorization": "Basic " + basic,
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {"grant_type": "refresh_token", "refresh_token": self.profile.spotify_refresh_token}
        r = self.session.post(SPOTIFY_TOKEN_URL, data=data, headers=headers, timeout=self.timeout)
        if r.status_code != 200:
            raise SpotifyHttpError(r.status_code, self._safe_json(r))

        payload = r.json()
        self.profile.spotify_access_token = payload["access_token"]
        expires_in = int(payload.get("expires_in", 3600))
        self.profile.spotify_expires_at = timezone.now() + timedelta(seconds=expires_in - 60)

        new_rt = payload.get("refresh_token")
        if new_rt:
            self.profile.spotify_refresh_token = new_rt
        if payload.get("scope"):
            self.profile.spotify_scope = payload["scope"]

        update_fields = ["spotify_access_token", "spotify_expires_at"]
        if new_rt:
            update_fields.append("spotify_refresh_token")
        if payload.get("scope"):
            update_fields.append("spotify_scope")
        self.profile.save(update_fields=update_fields)

    def _ensure_token(self) -> None:
        if self._needs_refresh():
            self._refresh_token()

    # ---------------- core request ----------------

    def _req(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        retry_on_401: bool = True,
    ) -> Any:
        self._ensure_token()
        url = f"{SPOTIFY_API}{path}"
        r = self.session.request(
            method, url, params=params, json=json, headers=self._headers(), timeout=self.timeout
        )
        if r.status_code == 401 and retry_on_401:
            self._refresh_token()
            r = self.session.request(
                method, url, params=params, json=json, headers=self._headers(), timeout=self.timeout
            )
        if r.status_code < 200 or r.status_code >= 300:
            raise SpotifyHttpError(r.status_code, self._safe_json(r))
        return self._safe_json(r)

    @staticmethod
    def _safe_json(r: requests.Response) -> Any:
        try:
            return r.json()
        except Exception:
            return {"text": r.text}

    # ---------------- paging helpers ----------------

    def _paged_get(self, path: str, params: Dict[str, Any], key: str, max_items: int) -> List[Dict[str, Any]]:
        params = dict(params or {})
        params.setdefault("limit", 50)
        items: List[Dict[str, Any]] = []
        while True:
            data = self._req("GET", path, params=params)
            page_items = data.get(key, []) or data.get("items", []) or []
            items.extend(page_items)
            if len(items) >= max_items:
                return items[:max_items]
            next_url = data.get("next")
            if not next_url:
                break
            r = self.session.get(next_url, headers=self._headers(), timeout=self.timeout)
            if r.status_code == 401:
                self._refresh_token()
                r = self.session.get(next_url, headers=self._headers(), timeout=self.timeout)
            if r.status_code < 200 or r.status_code >= 300:
                raise SpotifyHttpError(r.status_code, self._safe_json(r))
            data = self._safe_json(r)
            params = {}
        return items

    # ---------------- profile / library ----------------

    def get_me(self) -> Dict[str, Any]:
        return self._req("GET", "/me")

    def get_top_tracks(self, time_range: str = "medium_term", limit: int = 50) -> List[Dict[str, Any]]:
        limit = max(1, min(50, limit))
        params = {"time_range": time_range, "limit": limit}
        data = self._req("GET", "/me/top/tracks", params=params)
        return data.get("items", []) or []

    def get_saved_tracks(self, max_items: int = 200) -> List[Dict[str, Any]]:
        items = self._paged_get("/me/tracks", {"limit": 50}, key="items", max_items=max_items)
        return [it["track"] for it in items if isinstance(it, dict) and it.get("track")]

    def get_recent_tracks(self, max_items: int = 50) -> List[Dict[str, Any]]:
        items = self._paged_get("/me/player/recently-played", {"limit": 50}, key="items", max_items=max_items)
        return [it["track"] for it in items if isinstance(it, dict) and it.get("track")]

    # ---------------- allowed catalog helpers ----------------

    def get_tracks(self, track_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for group in _chunk(list(dict.fromkeys(track_ids)), 50):
            data = self._req("GET", "/tracks", params={"ids": ",".join(group)})
            for t in data.get("tracks", []) or []:
                if t and t.get("id"):
                    out[t["id"]] = t
        return out

    def get_artists(self, artist_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for group in _chunk(list(dict.fromkeys(artist_ids)), 50):
            data = self._req("GET", "/artists", params={"ids": ",".join(group)})
            for a in data.get("artists", []) or []:
                if a and a.get("id"):
                    out[a["id"]] = a
        return out

    # ---------------- playlists (read/write) ----------------

    def get_playlist(self, playlist_id: str) -> Dict[str, Any]:
        return self._req("GET", f"/playlists/{playlist_id}")

    def get_playlist_tracks(self, playlist_id: str, max_items: int = 1000) -> List[Dict[str, Any]]:
        items = self._paged_get(f"/playlists/{playlist_id}/tracks", {"limit": 50}, key="items", max_items=max_items)
        out: List[Dict[str, Any]] = []
        for it in items:
            tr = (it or {}).get("track")
            if tr and tr.get("id"):
                out.append(tr)
        return out

    def search_tracks(self, q: str, limit: int = 10, market: Optional[str] = None) -> List[Dict[str, Any]]:
        limit = max(1, min(50, limit))
        params: Dict[str, Any] = {"q": q, "type": "track", "limit": limit}
        if market:
            params["market"] = market
        data = self._req("GET", "/search", params=params)
        return (data.get("tracks") or {}).get("items", []) or []

    def create_playlist(
        self,
        user_id: str,
        name: str,
        public: bool = False,
        description: Optional[str] = None,
        collaborative: bool = False,
    ) -> Dict[str, Any]:
        body = {"name": name, "public": public, "collaborative": collaborative}
        if description is not None:
            body["description"] = description
        return self._req("POST", f"/users/{user_id}/playlists", json=body)

    def add_items_to_playlist(self, playlist_id: str, uris: List[str], position: Optional[int] = None) -> Optional[str]:
        last_snapshot: Optional[str] = None
        for group in _chunk(uris, 100):
            body = {"uris": group}
            if position is not None:
                body["position"] = position
            resp = self._req("POST", f"/playlists/{playlist_id}/tracks", json=body)
            if isinstance(resp, dict) and resp.get("snapshot_id"):
                last_snapshot = resp["snapshot_id"]
        return last_snapshot

    # ---------- NEW: details update for rare post-create reconciliation ----------

    def update_playlist_details(
        self,
        playlist_id: str,
        *,
        name: Optional[str] = None,
        public: Optional[bool] = None,
        collaborative: Optional[bool] = None,
        description: Optional[str] = None,
    ) -> Any:
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if public is not None:
            body["public"] = public
        if collaborative is not None:
            body["collaborative"] = collaborative
        if description is not None:
            body["description"] = description
        if not body:
            return None
        return self._req("PUT", f"/playlists/{playlist_id}", json=body)
