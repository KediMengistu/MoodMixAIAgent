from django.contrib import admin
from .models import UserProfile
from .models import SpotifyAuthState
from .models import PlaylistProfile

# Register your models here.

admin.site.register(UserProfile)
admin.site.register(SpotifyAuthState)
admin.site.register(PlaylistProfile)