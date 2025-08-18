# MoodMixDjangoApp/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone

class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
        unique=True,
    )
    # Firebase identity
    firebase_uid = models.CharField(max_length=128, unique=True, db_index=True)
    firebase_email = models.EmailField(null=True, blank=True, unique=True)

    # Spotify identity + tokens (nullable until connected)
    spotify_user_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    spotify_email = models.EmailField(null=True, blank=True)
    spotify_name = models.CharField(max_length=255, null=True, blank=True)

    spotify_access_token = models.TextField(null=True, blank=True)
    spotify_refresh_token = models.TextField(null=True, blank=True)
    spotify_scope = models.TextField(null=True, blank=True)
    spotify_token_type = models.CharField(max_length=32, default="Bearer")
    spotify_expires_at = models.DateTimeField(null=True, blank=True)

    created_time = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"profile:{self.id} uid:{self.firebase_uid}"


class SpotifyAuthState(models.Model):
    """
    Many states per profile to allow multi-tab flows.
    Each row is single-use and time-limited.
    """
    profile = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="spotify_states",
    )
    state = models.CharField(max_length=128, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    def is_valid(self) -> bool:
        now = timezone.now()
        return self.used_at is None and self.expires_at > now

    def __str__(self):
        return f"state:{self.state} profile:{self.profile_id} used:{bool(self.used_at)}"
