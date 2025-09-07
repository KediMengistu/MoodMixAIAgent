from __future__ import annotations

import os
import json
from datetime import timedelta
from typing import Optional, Set, List

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from MoodMixDjangoApp.models import UserProfile, PlaylistProfile, normalize_name_key
from MoodMixDjangoApp.llm.planner_schema import MoodPlan
from MoodMixDjangoApp.llm.planner import make_plan_from_mood
from MoodMixDjangoApp.music.spotify_client import SpotifyClient, SpotifyHttpError
from MoodMixDjangoApp.music.builder import PlaylistBuilder

# Feature flag: enable/disable 24h cooldown for /playlist_build
ENABLE_BUILD_COOLDOWN = os.getenv("MOODMIX_ENABLE_BUILD_COOLDOWN", "false").lower() in ("1", "true", "yes")

# ---------------- helpers ----------------

def _get_profile(user) -> UserProfile:
    profile = UserProfile.objects.filter(user=user).first()
    if not profile or not profile.spotify_access_token:
        raise RuntimeError("Spotify is not connected for this user.")
    return profile

def _require_scopes(
    profile: UserProfile,
    *,
    include_write: bool = True,
    public: bool = False,
    extra: Optional[Set[str]] = None,
) -> Optional[Response]:
    have = set((profile.spotify_scope or "").split())
    required = {"user-top-read", "user-library-read", "user-read-recently-played"}
    if include_write:
        required.add("playlist-modify-public" if public else "playlist-modify-private")
    required.add("playlist-read-private")
    if extra:
        required |= set(extra)
    missing = required - have
    if missing:
        return Response(
            {"detail": "Missing required scopes", "required": sorted(list(required)), "missing": sorted(list(missing))},
            status=403,
        )
    return None

def _derive_playlist_name(plan: MoodPlan, *, fallback: str = "MoodMix") -> str:
    base = plan.normalized_mood or plan.intent or fallback
    base = base.strip().title()
    date_str = timezone.localdate().strftime("%m/%d/%Y")
    return f"{base} • MoodMix • {date_str}"

def _derive_description(plan: MoodPlan) -> str:
    tags = ", ".join((plan.semantic_tags or [])[:5]) if plan.semantic_tags else ""
    stages = ", ".join((plan.plan.ordering if plan.plan and plan.plan.ordering else [])[:5])
    return f"MoodMix • intent: {plan.intent or '—'} • tags: {tags} • flow: {stages}"[:300]

def _unique_playlist_name(owner: UserProfile, desired: str) -> str:
    base = (desired or "").strip() or "MoodMix"
    left = base.split("•", 1)[0].strip() if "•" in base else base.strip()
    date_str = timezone.localdate().strftime("%m/%d/%Y")
    start_n = PlaylistProfile.objects.filter(owner=owner).count() + 1
    for offset in range(0, 500):
        n = start_n + offset
        candidate = f"{left} • MoodMix PL {n} • {date_str}"
        key = normalize_name_key(candidate)
        if not PlaylistProfile.objects.filter(owner=owner, name_key=key).exists():
            return candidate
    ts = timezone.now().strftime("%H:%M:%S")
    return f"{left} • MoodMix PL {start_n} • {date_str} • {ts}"

def _to_bool(v, default: bool = False) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in {"1", "true", "t", "yes", "y", "on"}
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return bool(v)
    return default

# ---------------- endpoints ----------------

@api_view(["POST"])
def playlist_preview(request):
    """
    POST body:
      { "plan": <MoodPlan JSON>, "length": int (4..10, optional) }
    Returns 200 with preview or 422 if quota can't be satisfied.
    """
    body = request.data or {}
    plan_in = body.get("plan")
    if not isinstance(plan_in, dict):
        return Response({"detail": "Provide 'plan' as an object."}, status=400)
    try:
        plan = MoodPlan.model_validate(plan_in)
    except Exception as e:
        return Response({"detail": "Invalid plan", "error": str(e)}, status=400)

    length = max(4, min(10, int(body.get("length") or plan.length or 10)))

    try:
        profile = _get_profile(request.user)
    except Exception as e:
        return Response({"detail": str(e)}, status=401)

    missing = _require_scopes(profile, include_write=False)
    if isinstance(missing, Response):
        return missing

    try:
        client = SpotifyClient(profile)

        since = timezone.now() - timedelta(days=14)
        rows = (PlaylistProfile.objects
                .filter(owner=profile, created_at__gte=since, spotify_playlist_id__isnull=False)
                .only("spotify_playlist_id"))
        disallowed_ids: Set[str] = set()
        disallowed_pairs = []
        for row in rows:
            try:
                for t in client.get_playlist_tracks(row.spotify_playlist_id, max_items=200):
                    tid = t.get("id")
                    if tid:
                        disallowed_ids.add(tid)
                        nm = (t.get("name") or "").strip()
                        arts = (t.get("artists") or [])
                        if nm and arts:
                            an = (arts[0] or {}).get("name") or ""
                            if an:
                                disallowed_pairs.append({"title": nm, "artist": an})
            except Exception:
                continue

        seen_pair = set()
        uniq_pairs = []
        for p in disallowed_pairs:
            key = (p["title"].casefold(), p["artist"].casefold())
            if key in seen_pair:
                continue
            seen_pair.add(key)
            uniq_pairs.append(p)

        builder = PlaylistBuilder(client)
        preview = builder.preview(
            plan,
            length=length,
            disallowed_ids=disallowed_ids,
            disallowed_title_artist=uniq_pairs,
        )
    except SpotifyHttpError as e:
        # Pass through Spotify's real status (401/403/429/5xx...) and propagate Retry-After when present.
        retry_after = e.headers.get("Retry-After") or e.headers.get("retry-after")
        headers = {"Retry-After": str(retry_after)} if retry_after else None
        data = {"detail": "spotify_error", "status": e.status, "payload": e.payload}
        return Response(data, status=e.status, headers=headers or {})
    except Exception as e:
        return Response({"detail": "Preview failed", "error": str(e)}, status=500)

    if not preview.uris:
        return Response(
            {"detail": "No tracks matched the plan under current constraints.",
             "plan": plan.model_dump(),
             "debug": preview.debug},
            status=422,
        )

    return Response({
        "plan": plan.model_dump(),
        "preview": {
            "uris": preview.uris,
            "tracks": preview.tracks,
            "debug": preview.debug,
        },
    }, status=200)

@api_view(["POST"])
def playlist_build(request):
    """
    Build using selector+search fallback.

    Body:
      - Either { "mood": "<string>" } OR { "plan": <MoodPlan JSON> }
      - Optional: "length": int (4..10)
      - Optional: "public": bool (default False)
      - Optional: "name": string (default derived from plan)
      - Optional: "collaborative": bool (default False)
    """
    body = request.data or {}

    # Resolve plan
    if "plan" in body and isinstance(body["plan"], dict):
        try:
            plan = MoodPlan.model_validate(body["plan"])
        except Exception as e:
            return Response({"detail": "Invalid plan", "error": str(e)}, status=400)
    else:
        mood = body.get("mood")
        if not isinstance(mood, str) or not mood.strip():
            return Response({"detail": "Provide either 'plan' (object) or 'mood' (string)."}, status=400)
        try:
            plan = make_plan_from_mood(mood.strip())
        except Exception as e:
            return Response({"detail": "Planner failed", "error": str(e)}, status=502)

    length = max(4, min(10, int(body.get("length") or plan.length or 10)))
    public_requested = _to_bool(body.get("public"), False)
    collaborative_requested = _to_bool(body.get("collaborative"), False)
    if public_requested and collaborative_requested:
        return Response({"detail": "A playlist cannot be both public and collaborative."}, status=400)

    try:
        profile = _get_profile(request.user)
    except Exception as e:
        return Response({"detail": str(e)}, status=401)

    # Optional cooldown
    if ENABLE_BUILD_COOLDOWN:
        last = getattr(profile, "last_playlist_create_time", None)
        if last:
            next_allowed = last + timedelta(hours=24)
            now = timezone.now()
            if now < next_allowed:
                retry_after = int((next_allowed - now).total_seconds())
                return Response(
                    {
                        "detail": "Rate limit: one MoodMix build per 24h.",
                        "retry_after_seconds": retry_after,
                        "retry_at": next_allowed.isoformat(),
                        "last_created_at": last.isoformat(),
                    },
                    status=429,
                )

    missing = _require_scopes(profile, include_write=True, public=public_requested)
    if isinstance(missing, Response):
        return missing

    desired_name = body.get("name") or _derive_playlist_name(plan)
    name = _unique_playlist_name(profile, desired_name)
    description = _derive_description(plan)

    try:
        client = SpotifyClient(profile)

        # Build disallowed set from last-14-days MoodMix playlists
        since = timezone.now() - timedelta(days=14)
        rows = (PlaylistProfile.objects
                .filter(owner=profile, created_at__gte=since, spotify_playlist_id__isnull=False)
                .only("spotify_playlist_id"))
        disallowed_ids: Set[str] = set()
        disallowed_pairs = []
        for row in rows:
            try:
                for t in client.get_playlist_tracks(row.spotify_playlist_id, max_items=200):
                    tid = t.get("id")
                    if tid:
                        disallowed_ids.add(tid)
                        nm = (t.get("name") or "").strip()
                        arts = (t.get("artists") or [])
                        if nm and arts:
                            an = (arts[0] or {}).get("name") or ""
                            if an:
                                disallowed_pairs.append({"title": nm, "artist": an})
            except Exception:
                continue

        seen_pair = set()
        uniq_pairs = []
        for p in disallowed_pairs:
            key = (p["title"].casefold(), p["artist"].casefold())
            if key in seen_pair:
                continue
            seen_pair.add(key)
            uniq_pairs.append(p)

        builder = PlaylistBuilder(client)
        preview = builder.preview(
            plan,
            length=length,
            disallowed_ids=disallowed_ids,
            disallowed_title_artist=uniq_pairs,
        )

        # Strict quota check
        if not preview.uris or len(preview.uris) < length:
            return Response(
                {"detail": "No tracks matched the plan under current constraints or could not fill requested quota.",
                 "plan": plan.model_dump(),
                 "debug": preview.debug},
                status=422,
            )

        me = client.get_me()

        # Create playlist
        created_doc = client.create_playlist(
            user_id=me["id"],
            name=name,
            public=public_requested,
            collaborative=collaborative_requested,
            description=description,
        )

        # Add tracks
        _ = client.add_items_to_playlist(created_doc["id"], preview.uris)

        # Persist PlaylistProfile quickly
        pp = PlaylistProfile.objects.create(
            owner=profile,
            name=name,
            mood=(plan.normalized_mood or plan.intent or "mood").strip()[:64],
            length=len(preview.uris),
            spotify_playlist_id=created_doc["id"],
            spotify_url=(created_doc.get("external_urls") or {}).get("spotify"),
        )

        # Fetch canonical playlist doc for authoritative fields (public/collaborative/images/snapshot)
        full_doc = None
        try:
            full_doc = client.get_playlist(created_doc["id"])
            pp.update_cache_from_spotify_doc(full_doc)
            pp.save(update_fields=[
                "cached_name",
                "cached_description",
                "cached_images",
                "cached_length",
                "is_public",
                "snapshot_id",
                "spotify_url",
                "last_synced_at",
            ])
        except Exception:
            pass  # best-effort cache; continue

        # Optional reconciliation: if visibility doesn't match request, try to correct it
        try:
            if full_doc is not None and full_doc.get("public") is not None:
                if bool(full_doc.get("public")) != bool(public_requested):
                    client.update_playlist_details(created_doc["id"], public=public_requested)
                    # Try to re-fetch quickly (best-effort)
                    try:
                        full_doc = client.get_playlist(created_doc["id"])
                        if full_doc:
                            pp.update_cache_from_spotify_doc(full_doc)
                            pp.save(update_fields=["is_public", "cached_name", "cached_description", "cached_images", "snapshot_id", "last_synced_at"])
                    except Exception:
                        pass
        except SpotifyHttpError:
            pass  # ignore if scopes/region disallow; DB still holds last known state

        # Record last creation time
        try:
            profile.last_playlist_create_time = pp.created_at
            profile.save(update_fields=["last_playlist_create_time"])
        except Exception:
            pass

        # Build response using canonical fields
        name_final = (full_doc.get("name") if isinstance(full_doc, dict) else created_doc.get("name"))
        public_final = (
            (full_doc.get("public") if isinstance(full_doc, dict) else None)
        )
        if public_final is None:
            # fall back to DB cache; if absent, fall back to request
            public_final = bool(getattr(pp, "is_public", public_requested))

        collab_final = (
            (full_doc.get("collaborative") if isinstance(full_doc, dict) else created_doc.get("collaborative"))
        )

        external_urls_final = (
            (full_doc.get("external_urls") if isinstance(full_doc, dict) and full_doc.get("external_urls") else created_doc.get("external_urls"))
        )
        uri_final = (full_doc.get("uri") if isinstance(full_doc, dict) and full_doc.get("uri") else created_doc.get("uri"))

        return Response({
            "playlist": {
                "id": created_doc["id"],
                "name": name_final,
                "public": bool(public_final),
                "collaborative": bool(collab_final),
                "external_urls": external_urls_final,
                "uri": uri_final,
            },
            "added": len(preview.uris),
            "plan": plan.model_dump(),
            "selected_uris": preview.uris,
            "debug": preview.debug,
        }, status=200)

    except SpotifyHttpError as e:
        # Pass through Spotify's real status (401/403/429/5xx...) and propagate Retry-After when present.
        retry_after = e.headers.get("Retry-After") or e.headers.get("retry-after")
        headers = {"Retry-After": str(retry_after)} if retry_after else None
        data = {"detail": "spotify_error", "status": e.status, "payload": e.payload}
        return Response(data, status=e.status, headers=headers or {})
    except Exception as e:
        return Response({"detail": "Build failed", "error": str(e)}, status=500)
