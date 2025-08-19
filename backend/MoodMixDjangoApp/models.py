# MoodMixDjangoApp/models.py
import re
import unicodedata
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator

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

    class Meta:
        indexes = [
            models.Index(fields=["expires_at"]),
            models.Index(fields=["used_at"]),
        ]

    def is_valid(self) -> bool:
        now = timezone.now()
        return self.used_at is None and self.expires_at > now

    def __str__(self):
        return f"state:{self.state} profile:{self.profile_id} used:{bool(self.used_at)}"

def normalize_name_key(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.strip()
    s = re.sub(r"\s+", " ", s)  # collapse internal whitespace
    return s.casefold()         # better than lower()

class PlaylistProfile(models.Model):
    owner = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="playlists",
    )
    name = models.CharField(max_length=120)        # display as typed
    name_key = models.CharField(max_length=140, editable=False)  # normalized key
    mood = models.CharField(max_length=64)
    length = models.PositiveSmallIntegerField(
        default=10,
        validators=[MinValueValidator(4), MaxValueValidator(10)],
        help_text="Number of tracks (4–10). Defaults to 10.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=~models.Q(mood__regex=r"^\s*$"),
                name="playlist_mood_not_blank",
            ),
            # Prevent “blank” names after trimming
            models.CheckConstraint(
                check=~models.Q(name__regex=r"^\s*$"),
                name="playlist_name_not_blank",
            ),
            # Enforce uniqueness per owner on the normalized key
            models.UniqueConstraint(
                fields=["owner", "name_key"],
                name="uniq_playlist_name_key_per_owner",
            ),
            models.CheckConstraint(
                check=models.Q(length__gte=4) & models.Q(length__lte=10),
                name="playlist_length_between_4_10",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["owner", "name_key"]),
        ]
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        # Optionally also trim display name (keeps original casing/spacing except edges)
        self.name = self.name.strip()
        self.name_key = normalize_name_key(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} (owner:{self.owner_id})"
