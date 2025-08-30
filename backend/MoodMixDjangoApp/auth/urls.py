# MoodMixDjangoApp/auth/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("moodmix/", views.auth_moodmix, name="auth_moodmix"),
    path("spotify/", views.auth_spotify, name="auth_spotify"),
    path("spotify/callback/", views.auth_spotify_callback, name="auth_spotify_callback"),
    path("spotify/refresh/", views.auth_spotify_refresh, name="auth_spotify_refresh"),
]
