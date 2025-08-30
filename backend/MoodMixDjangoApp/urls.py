# MoodMixDjangoApp/urls.py
from django.urls import path, include
from . import views as root_views
from .llm import views as llm_views
from .music import views as music_views

urlpatterns = [
    path("health/", root_views.health, name="health"),
    path("auth/", include("MoodMixDjangoApp.auth.urls")),
    path("plan/", llm_views.plan_from_mood, name="plan_from_mood"),
    path("playlist/preview/", music_views.playlist_preview, name="playlist_preview"),
    path("playlist/build/", music_views.playlist_build, name="playlist_build"),
]
