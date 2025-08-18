from django.urls import path


from . import views

urlpatterns = [
    path("health/", views.health, name="index"),
    path("auth/moodmix/", views.auth_moodmix, name="auth_moodmix"),
    path("auth/spotify/", views.auth_spotify, name="auth_spotify"),
    path("auth/spotify/callback/", views.auth_spotify_callback, name="auth_spotify_callback"),
]