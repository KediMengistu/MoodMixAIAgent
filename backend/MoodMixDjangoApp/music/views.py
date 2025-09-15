from __future__ import annotations

import os
from datetime import timedelta
from typing import Optional, Set, Dict, Any

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
COOLDOWN_SECONDS = 24 * 60 * 60  # 24h

# Cache TTL for PlaylistProfile.spotify metadata refresh (default: 24h)
CACHE_TTL_SECONDS = int(os.getenv("MOODMIX_PLAYLIST_CACHE_TTL_SECONDS", "86400"))


# ---------------- helpers ----------------

def _get_profile(user) -> UserProfile:
    profile = UserProfile.objects.filter(user=user).first()
    if not profile:
        raise RuntimeError("No profile found for this user.")
    if not profile.spotify_access_token:
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


def _clear_plan_pending(user) -> None:
    UserProfile.objects.filter(user=user).update(
        plan_then_build_pending=False,
        plan_then_build_started_at=None,
    )


def _refresh_stale_playlists_for_user(profile: UserProfile, ttl_seconds: int) -> Dict[str, Any]:
    """
    Refresh ALL stale PlaylistProfile rows for this user.
    - Stale: last_synced_at is NULL OR older than ttl_seconds.
    - No max-refresh cap.
    - Single retry for 429/5xx per playlist.
    - On 429 after retry, abort loop and bubble Retry-After.
    - On 404, delete the row.
    """
    metrics = {"refreshed": 0, "deleted": 0, "skipped": 0, "rate_limited": False, "retry_after": None}

    try:
        client = SpotifyClient(profile)
    except Exception:
        return metrics  # No spotify connection; just serve DB cache

    rows = PlaylistProfile.objects.filter(owner=profile).only(
        "id",
        "spotify_playlist_id",
        "last_synced_at",
        "cached_name",
        "cached_description",
        "cached_images",
        "cached_length",
        "is_public",
        "snapshot_id",
        "spotify_url",
    )

    for pp in rows:
        if not pp.spotify_playlist_id:
            metrics["skipped"] += 1
            continue

        if not pp.is_cache_stale(ttl_seconds=ttl_seconds):
            metrics["skipped"] += 1
            continue

        def _attempt_fetch():
            return client.get_playlist(pp.spotify_playlist_id)

        try:
            try:
                doc = _attempt_fetch()
            except SpotifyHttpError as e:
                if e.status == 404:
                    try:
                        pp.delete()
                        metrics["deleted"] += 1
                    except Exception:
                        metrics["skipped"] += 1
                    continue
                if e.status == 429:
                    # single retry
                    try:
                        doc = _attempt_fetch()
                    except SpotifyHttpError as e2:
                        if e2.status == 429:
                            ra = e2.headers.get("Retry-After") or e2.headers.get("retry-after") or e.headers.get("Retry-After") or e.headers.get("retry-after")
                            metrics["rate_limited"] = True
                            metrics["retry_after"] = str(ra) if ra is not None else None
                            break  # stop refreshing further
                        metrics["skipped"] += 1
                        continue
                elif 500 <= e.status <= 599:
                    try:
                        doc = _attempt_fetch()
                    except Exception:
                        metrics["skipped"] += 1
                        continue
                else:
                    metrics["skipped"] += 1
                    continue

            # Success -> update cache
            pp.update_cache_from_spotify_doc(doc)
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
            metrics["refreshed"] += 1

        except Exception:
            metrics["skipped"] += 1
            continue

    return metrics


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

    NOTE: This endpoint ALWAYS clears the plan_then_build lease in a finally block.
    """
    body = request.data or {}

    # Resolve plan
    if "plan" in body and isinstance(body["plan"], dict):
        try:
            plan = MoodPlan.model_validate(body["plan"])
        except Exception as e:
            _clear_plan_pending(request.user)  # unblock if client sent bad plan after planning
            return Response({"detail": "Invalid plan", "error": str(e)}, status=400)
    else:
        mood = body.get("mood")
        if not isinstance(mood, str) or not mood.strip():
            _clear_plan_pending(request.user)
            return Response({"detail": "Provide either 'plan' (object) or 'mood' (string)."}, status=400)
        try:
            plan = make_plan_from_mood(mood.strip())
        except Exception as e:
            _clear_plan_pending(request.user)
            return Response({"detail": "Planner failed", "error": str(e)}, status=502)

    length = max(4, min(10, int(body.get("length") or plan.length or 10)))
    public_requested = _to_bool(body.get("public"), False)
    collaborative_requested = _to_bool(body.get("collaborative"), False)
    if public_requested and collaborative_requested:
        _clear_plan_pending(request.user)
        return Response({"detail": "A playlist cannot be both public and collaborative."}, status=400)

    try:
        try:
            profile = _get_profile(request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=401)

        # Optional cooldown
        if ENABLE_BUILD_COOLDOWN:
            last = getattr(profile, "last_playlist_create_time", None)
            if last:
                next_allowed = last + timedelta(seconds=COOLDOWN_SECONDS)
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

            if not preview.uris or len(preview.uris) < length:
                return Response(
                    {"detail": "No tracks matched the plan under current constraints or could not fill requested quota.",
                     "plan": plan.model_dump(),
                     "debug": preview.debug},
                    status=422,
                )

            me = client.get_me()

            created_doc = client.create_playlist(
                user_id=me["id"],
                name=name,
                public=public_requested,
                collaborative=collaborative_requested,
                description=description,
            )

            _ = client.add_items_to_playlist(created_doc["id"], preview.uris)

            pp = PlaylistProfile.objects.create(
                owner=profile,
                name=name,
                mood=(plan.normalized_mood or plan.intent or "mood").strip()[:64],
                length=len(preview.uris),
                spotify_playlist_id=created_doc["id"],
                spotify_url=(created_doc.get("external_urls") or {}).get("spotify"),
            )

            # Best-effort full doc cache
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
                pass

            # Reconcile visibility if needed
            try:
                if full_doc is not None and full_doc.get("public") is not None:
                    if bool(full_doc.get("public")) != bool(public_requested):
                        client.update_playlist_details(created_doc["id"], public=public_requested)
                        try:
                            full_doc = client.get_playlist(created_doc["id"])
                            if full_doc:
                                pp.update_cache_from_spotify_doc(full_doc)
                                pp.save(update_fields=[
                                    "is_public", "cached_name", "cached_description", "cached_images", "snapshot_id", "last_synced_at"
                                ])
                        except Exception:
                            pass
            except SpotifyHttpError:
                pass

            # Record last creation time
            try:
                profile.last_playlist_create_time = pp.created_at
                profile.save(update_fields=["last_playlist_create_time"])
            except Exception:
                pass

            name_final = (full_doc.get("name") if isinstance(full_doc, dict) else created_doc.get("name"))
            public_final = (full_doc.get("public") if isinstance(full_doc, dict) else None)
            if public_final is None:
                public_final = bool(getattr(pp, "is_public", public_requested))
            collab_final = (full_doc.get("collaborative") if isinstance(full_doc, dict) else created_doc.get("collaborative"))
            external_urls_final = ((full_doc.get("external_urls") if isinstance(full_doc, dict) and full_doc.get("external_urls") else created_doc.get("external_urls")))
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
            retry_after = e.headers.get("Retry-After") or e.headers.get("retry-after")
            headers = {"Retry-After": str(retry_after)} if retry_after else None
            data = {"detail": "spotify_error", "status": e.status, "payload": e.payload}
            return Response(data, status=e.status, headers=headers or {})
        except Exception as e:
            return Response({"detail": "Build failed", "error": str(e)}, status=500)
    finally:
        # Always clear the lease so the user isn't stuck pending
        _clear_plan_pending(request.user)


@api_view(["GET"])
def playlist_list(request):
    """
    Returns a paginated list of PlaylistProfile rows created by the authenticated user.
    On each invocation, stale rows (last_synced_at older than TTL or NULL) are refreshed
    BEFORE pagination, with a single retry for 429/5xx per stale playlist.

    Query params:
      - limit: 1..200 (default 50)
      - offset: >=0 (default 0)

    Notes:
      - If Spotify returns 429 while refreshing, we abort more refreshes,
        bubble the Retry-After header (if provided), and still return DB data.
      - If a playlist 404s, we delete its PlaylistProfile row.
    """
    # Parse pagination
    try:
        limit = int(request.query_params.get("limit", "50"))
    except ValueError:
        limit = 50
    limit = max(1, min(200, limit))

    try:
        offset = int(request.query_params.get("offset", "0"))
    except ValueError:
        offset = 0
    offset = max(0, offset)

    profile = UserProfile.objects.filter(user=request.user).first()

    retry_after_header = None
    if profile and profile.spotify_access_token:
        metrics = _refresh_stale_playlists_for_user(profile, ttl_seconds=CACHE_TTL_SECONDS)
        if metrics.get("rate_limited"):
            retry_after_header = metrics.get("retry_after")

    qs = PlaylistProfile.objects.filter(owner=profile).order_by("-created_at") if profile else PlaylistProfile.objects.none()
    total = qs.count()
    items = qs[offset: offset + limit]

    def _ser(pp: PlaylistProfile) -> dict:
        return {
            "id": pp.id,
            "name": pp.name,
            "mood": pp.mood,
            "length": pp.length,
            "spotify_playlist_id": pp.spotify_playlist_id,
            "spotify_url": pp.spotify_url,
            "cached_name": pp.cached_name,
            "cached_description": pp.cached_description,
            "cached_images": pp.cached_images,
            "cached_length": pp.cached_length,
            "is_public": pp.is_public,
            "snapshot_id": pp.snapshot_id,
            "created_at": pp.created_at.isoformat(),
            "last_synced_at": pp.last_synced_at.isoformat() if pp.last_synced_at else None,
        }

    results = [_ser(pp) for pp in items]
    next_offset = offset + limit if (offset + limit) < total else None

    headers = {}
    if retry_after_header is not None:
        headers["Retry-After"] = str(retry_after_header)

    if not profile:
        return Response(
            {"count": 0, "limit": limit, "offset": offset, "next_offset": None, "results": []},
            status=200,
            headers=headers,
        )

    return Response(
        {
            "count": total,
            "limit": limit,
            "offset": offset,
            "next_offset": next_offset,
            "results": results,
        },
        status=200,
        headers=headers,
    )
