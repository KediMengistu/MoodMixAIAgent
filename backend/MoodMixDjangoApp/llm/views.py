from django.db import transaction
from django.utils import timezone
from datetime import timedelta
import os

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from MoodMixDjangoApp.models import UserProfile
from .planner import make_plan_from_mood

# Reuse build cooldown flag here too
ENABLE_BUILD_COOLDOWN = os.getenv("MOODMIX_ENABLE_BUILD_COOLDOWN", "false").lower() in ("1", "true", "yes")

# Planning lease TTL (to prevent stuck pendings)
PENDING_LEASE_TTL_SECONDS = int(os.getenv("MOODMIX_PENDING_LEASE_TTL_SECONDS", "900"))  # 15 min
COOLDOWN_SECONDS = 24 * 60 * 60  # 24h


def _ensure_profile_locked(user) -> UserProfile:
    """
    Fetch (or create) the user's profile and lock the row for the duration
    of the transaction so that pending/cooldown checks and updates are atomic.
    """
    profile, _ = UserProfile.objects.select_for_update().get_or_create(
        user=user,
        defaults={
            "firebase_uid": user.username,
            "firebase_email": user.email or None,
        },
    )
    if user.email and profile.firebase_email != user.email:
        profile.firebase_email = user.email
        profile.save(update_fields=["firebase_email"])
    return profile


def _remaining_lease_seconds(started_at) -> int:
    if not started_at:
        return PENDING_LEASE_TTL_SECONDS
    elapsed = (timezone.now() - started_at).total_seconds()
    return max(0, PENDING_LEASE_TTL_SECONDS - int(elapsed))


@api_view(["POST"])
def plan_from_mood(request):
    """
    Body: { "mood": "<free text>" }

    Guard:
      - Row-lock the user profile.
      - If lease pending and not expired -> 429 with retry info.
      - If lease expired -> clear and continue.
      - If cooldown enabled and last build < 24h -> 429.
      - Grant lease (pending=True, started_at=now) then release lock.
      - If planner fails, clear lease so the user is not stuck.
    """
    body = request.data or {}
    mood = body.get("mood")
    if not isinstance(mood, str) or not mood.strip():
        return Response({"detail": "Provide a non-empty 'mood' string."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            profile = _ensure_profile_locked(request.user)
            now = timezone.now()

            # Optional cooldown shared with /playlist_build
            if ENABLE_BUILD_COOLDOWN and profile.last_playlist_create_time:
                next_allowed = profile.last_playlist_create_time + timedelta(seconds=COOLDOWN_SECONDS)
                if now < next_allowed:
                    retry_after = int((next_allowed - now).total_seconds())
                    return Response(
                        {
                            "detail": "Rate limit: one MoodMix build per 24h. Planning is blocked accordingly.",
                            "retry_after_seconds": retry_after,
                            "retry_at": next_allowed.isoformat(),
                            "last_created_at": profile.last_playlist_create_time.isoformat(),
                        },
                        status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )

            # Concurrency lease
            if profile.plan_then_build_pending:
                if profile.plan_then_build_started_at and (now - profile.plan_then_build_started_at).total_seconds() < PENDING_LEASE_TTL_SECONDS:
                    return Response(
                        {
                            "detail": "A playlist planning/build is already in progress.",
                            "retry_after_seconds": _remaining_lease_seconds(profile.plan_then_build_started_at),
                            "pending_since": profile.plan_then_build_started_at.isoformat(),
                        },
                        status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )
                # expired lease -> clear
                profile.plan_then_build_pending = False
                profile.plan_then_build_started_at = None
                profile.save(update_fields=["plan_then_build_pending", "plan_then_build_started_at"])

            # Grant lease
            profile.plan_then_build_pending = True
            profile.plan_then_build_started_at = now
            profile.save(update_fields=["plan_then_build_pending", "plan_then_build_started_at"])
    except Exception as e:
        return Response({"detail": "Failed to acquire planning lease", "error": str(e)}, status=500)

    # Outside lock: run planner
    try:
        plan = make_plan_from_mood(mood.strip())
        return Response(plan.model_dump(), status=status.HTTP_200_OK)
    except Exception as e:
        # Clear lease on any planner failure
        try:
            UserProfile.objects.filter(user=request.user).update(
                plan_then_build_pending=False,
                plan_then_build_started_at=None,
            )
        finally:
            pass
        return Response({"detail": "Planner failed", "error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
