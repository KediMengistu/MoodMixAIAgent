import re
import unicodedata
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator


# ---- ID generation: 22-char base62 (alphanumeric) from UUID4 ----
_ALPHABET62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

def gen_alphanum_id() -> str:
    """
    Deterministically encodes a UUID4 (128 bits) into base62.
    Result length is always 22 chars (since 62^22 > 2^128).
    """
    n = uuid.uuid4().int
    out = []
    while n:
        n, rem = divmod(n, 62)
        out.append(_ALPHABET62[rem])
    s = "".join(reversed(out)) or "0"
    return s.zfill(22)  # fixed width


def normalize_name_key(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.strip()
    s = re.sub(r"\s+", " ", s)  # collapse internal whitespace
    return s.casefold()         # better than lower()


class UserProfile(models.Model):
    """
    App-level profile for an auth.User. Uses a string primary key.
    """
    id = models.CharField(primary_key=True, max_length=22, default=gen_alphanum_id, editable=False)

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
        unique=True,  # redundant for OneToOneField but fine to keep
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

    # last successful MoodMix playlist creation time (for 24h cooldown)
    last_playlist_create_time = models.DateTimeField(null=True, blank=True, db_index=True)

    # ---- plan-then-build concurrency lease ----
    plan_then_build_pending = models.BooleanField(default=False, db_index=True)
    plan_then_build_started_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_time = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"profile:{self.id} uid:{self.firebase_uid}"


class SpotifyAuthState(models.Model):
    """
    Many states per profile to allow multi-tab flows.
    Each row is single-use and time-limited.
    """
    id = models.CharField(primary_key=True, max_length=22, default=gen_alphanum_id, editable=False)

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


class PlaylistProfile(models.Model):
    """
    Persisted row whenever we create a playlist via /build.
    Also holds a *minimal* cache/snapshot of display metadata from Spotify.
    Spotify remains the source of truth; the cache is for latency & quota.
    """
    id = models.CharField(primary_key=True, max_length=22, default=gen_alphanum_id, editable=False)

    owner = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="playlists",
    )
    # original creation-time display name (typed)
    name = models.CharField(max_length=120)
    name_key = models.CharField(max_length=140, editable=False)  # normalized key of 'name'
    mood = models.CharField(max_length=64)

    # number of tracks we *initially* added when creating this playlist
    length = models.PositiveSmallIntegerField(
        default=10,
        validators=[MinValueValidator(4), MaxValueValidator(10)],
        help_text="Number of tracks (4–10). Defaults to 10.",
    )

    # Spotify identifiers/links
    spotify_playlist_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    spotify_url = models.URLField(null=True, blank=True)  # public URL

    # --- Minimal cache of display metadata from Spotify (lazy-refreshed) ---
    cached_name = models.CharField(max_length=200, null=True, blank=True)
    cached_description = models.TextField(null=True, blank=True)
    cached_images = models.JSONField(default=list, blank=True)   # array of {url,width,height}
    cached_length = models.PositiveIntegerField(null=True, blank=True)  # tracks.total
    is_public = models.BooleanField(default=False)
    snapshot_id = models.CharField(max_length=128, null=True, blank=True)

    last_synced_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=~models.Q(mood__regex=r"^\s*$"),
                name="playlist_mood_not_blank",
            ),
            models.CheckConstraint(
                check=~models.Q(name__regex=r"^\s*$"),
                name="playlist_name_not_blank",
            ),
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
        # Trim display name (keeps original casing/spacing except edges)
        self.name = (self.name or "").strip()
        self.name_key = normalize_name_key(self.name)
        super().save(*args, **kwargs)

    # ---------------- cache helpers ----------------

    def is_cache_stale(self, ttl_seconds: int, fresh_within_seconds: int | None = None) -> bool:
        """
        Returns True if the cached metadata is too old.
        - ttl_seconds: general TTL for lazy refresh (e.g., 24h)
        - fresh_within_seconds: stricter freshness requirement the caller can pass
        """
        required_fresh = int(fresh_within_seconds) if fresh_within_seconds is not None else int(ttl_seconds)
        if not self.last_synced_at:
            return True
        age = (timezone.now() - self.last_synced_at).total_seconds()
        return age >= max(0, required_fresh)

    def update_cache_from_spotify_doc(self, doc: dict) -> None:
        """
        Update our minimal cache from a Spotify playlist object (source of truth).
        """
        if not isinstance(doc, dict):
            return
        self.cached_name = doc.get("name") or self.cached_name
        self.cached_description = doc.get("description") or self.cached_description
        self.is_public = bool(doc.get("public", self.is_public))
        self.snapshot_id = doc.get("snapshot_id") or self.snapshot_id

        ext = doc.get("external_urls") or {}
        url = ext.get("spotify")
        if url:
            self.spotify_url = url

        images = doc.get("images") or []
        if isinstance(images, list):
            # keep first 4 entries to avoid bloat
            self.cached_images = images[:4]

        tracks = doc.get("tracks") or {}
        total = tracks.get("total")
        if isinstance(total, int):
            self.cached_length = total

        self.last_synced_at = timezone.now()

    def __str__(self):
        return f"{self.name} (owner:{self.owner_id})"
