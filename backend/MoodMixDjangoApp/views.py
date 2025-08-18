import os
import base64
import secrets
import urllib.parse
from datetime import timedelta

import requests
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from .models import UserProfile, SpotifyAuthState

# --- Spotify endpoints ---
SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"

# --- Config via environment variables (.env) ---
CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI")  # must EXACTLY match the allowlisted redirect
SCOPES = os.getenv("SPOTIFY_SCOPES")  # e.g. "user-read-email user-read-private"
STATE_TTL_SECONDS = int(os.getenv("SPOTIFY_STATE_TTL_SECONDS", "600"))  # 10 minutes default


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response(status=status.HTTP_200_OK)


def _build_spotify_authorize_url(state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "state": state,  # CSRF protection stored in DB
    }
    return f"{SPOTIFY_AUTH_URL}?{urllib.parse.urlencode(params)}"


@api_view(["POST"])  # or GET if you prefer
def auth_moodmix(request):
    """
    Ensure the custom UserProfile exists for the Firebase-authenticated user.
    Creates it on first login; no-op on subsequent logins (but updates email if changed).
    """
    user = request.user
    firebase_uid = user.username
    firebase_email = user.email or None

    profile, created = UserProfile.objects.get_or_create(
        user=user,
        defaults={"firebase_uid": firebase_uid, "firebase_email": firebase_email},
    )
    if not created and firebase_email and profile.firebase_email != firebase_email:
        profile.firebase_email = firebase_email
        profile.save(update_fields=["firebase_email"])

    return Response(
        {
            "created": created,
            "auth_user_id": user.id,
            "firebase_uid": profile.firebase_uid,
            "firebase_email": profile.firebase_email,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
def auth_spotify(request):
    """
    Start the Spotify OAuth flow (Firebase-protected).
    Generates a per-attempt state row (scoped to the user's profile), and 302-redirects.
    """
    if not CLIENT_ID or not REDIRECT_URI:
        return Response(
            {"detail": "Server misconfigured: missing SPOTIFY_CLIENT_ID or SPOTIFY_REDIRECT_URI."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Ensure profile exists
    user = request.user
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"firebase_uid": user.username, "firebase_email": user.email or None},
    )

    # Create single-use state row tied to the profile
    state = secrets.token_urlsafe(32)
    expires_at = timezone.now() + timedelta(seconds=STATE_TTL_SECONDS)
    SpotifyAuthState.objects.create(profile=profile, state=state, expires_at=expires_at)

    authorize_url = _build_spotify_authorize_url(state)
    return Response(status=status.HTTP_302_FOUND, headers={"Location": authorize_url})


@api_view(["GET"])
@permission_classes([AllowAny])
def auth_spotify_callback(request):
    """
    Public callback. Atomically *claims* the state (single-use), exchanges code for tokens,
    fetches /v1/me, and stores Spotify fields on that profile.
    """
    error = request.query_params.get("error")
    if error:
        return Response({"detail": f"Spotify error: {error}"}, status=status.HTTP_400_BAD_REQUEST)

    returned_state = request.query_params.get("state")
    code = request.query_params.get("code")
    if not returned_state or not code:
        return Response({"detail": "missing state or code"}, status=status.HTTP_400_BAD_REQUEST)

    # Sanity check env before consuming state
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        return Response(
            {"detail": "Server misconfigured: missing SPOTIFY_CLIENT_ID/SECRET or SPOTIFY_REDIRECT_URI."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # === OPTION 2: ATOMIC CLAIM ===
    # Mark this state as used in a single conditional UPDATE. Only one concurrent
    # callback can succeed; others will see 0 rows updated and fail gracefully.
    now = timezone.now()
    claimed = (SpotifyAuthState.objects
               .filter(state=returned_state, used_at__isnull=True, expires_at__gt=now)
               .update(used_at=now))
    if claimed != 1:
        return Response({"detail": "state expired or already used"}, status=status.HTTP_400_BAD_REQUEST)

    # Now safely load the state (for its profile) after claiming it.
    srec = (SpotifyAuthState.objects
            .select_related("profile", "profile__user")
            .get(state=returned_state))
    profile = srec.profile

    # Exchange code -> tokens
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    headers = {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    try:
        resp = requests.post(SPOTIFY_TOKEN_URL, data=form, headers=headers, timeout=10)
    except requests.RequestException as e:
        return Response({"detail": "Token exchange failed", "error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    if resp.status_code != 200:
        try:
            payload = resp.json()
        except Exception:
            payload = {"raw": resp.text}
        return Response({"detail": "Token exchange failed", "spotify_response": payload}, status=resp.status_code)

    token_payload = resp.json()
    access_token   = token_payload["access_token"]
    refresh_token = token_payload.get("refresh_token")
    scope          = token_payload.get("scope", "")
    token_type     = token_payload.get("token_type", "Bearer")
    expires_in     = int(token_payload.get("expires_in", 3600))

    # Fetch Spotify profile
    me = requests.get(
        "https://api.spotify.com/v1/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if me.status_code != 200:
        try:
            m = me.json()
        except Exception:
            m = {"raw": me.text}
        return Response({"detail": "Failed to fetch Spotify profile", "spotify_response": m},
                        status=me.status_code)

    me_json = me.json()
    spotify_id   = me_json["id"]
    spotify_email = me_json.get("email")
    display_name  = me_json.get("display_name")

    # Persist onto the profile referenced by the claimed state
    if profile.firebase_email is None and srec.profile.user.email:
        profile.firebase_email = srec.profile.user.email

    profile.spotify_user_id       = spotify_id
    profile.spotify_email         = spotify_email
    profile.spotify_name          = display_name
    profile.spotify_access_token  = access_token
    if refresh_token:  # only update if provided
        profile.spotify_refresh_token = refresh_token
    profile.spotify_scope         = scope
    profile.spotify_token_type    = token_type
    profile.spotify_expires_at    = timezone.now() + timedelta(seconds=expires_in - 60)
    profile.save()

    return Response({"detail": "Spotify connected"}, status=status.HTTP_200_OK)
