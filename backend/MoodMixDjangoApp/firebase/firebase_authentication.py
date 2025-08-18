# MoodMixDjangoApp/firebase/firebase_authentication.py
import os
import firebase_admin
from firebase_admin import credentials, auth as fb_auth
from rest_framework import authentication, exceptions
from django.contrib.auth import get_user_model

def _credentials_from_env() -> credentials.Certificate:
    private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    if not project_id or not private_key:
        raise RuntimeError("Missing Firebase env vars")
    return credentials.Certificate({
        "type": "service_account",
        "project_id": project_id,
        "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
        "private_key": private_key,
        "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
        "client_id": os.getenv("FIREBASE_CLIENT_ID"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://accounts.google.com/o/oauth2/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_CERT_URL"),
        "universe_domain": "googleapis.com",
    })

def ensure_firebase_initialized():
    if not firebase_admin._apps:
        cred = _credentials_from_env()
        firebase_admin.initialize_app(cred)

class FirebaseAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        ensure_firebase_initialized()

        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return None  # Let other classes try (or IsAuthenticated will deny)

        id_token = auth_header.split(" ", 1)[1].strip()
        try:
            decoded = fb_auth.verify_id_token(id_token)  # <— verification happens on EVERY request
        except Exception:
            raise exceptions.AuthenticationFailed("Invalid Firebase ID token")

        uid = decoded.get("uid")
        if not uid:
            raise exceptions.AuthenticationFailed("No UID in Firebase token")

        email = decoded.get("email")

        User = get_user_model()
        user, created = User.objects.get_or_create(username=uid, defaults={"email": email})
        if created:
            user.set_unusable_password()
            user.save()
        else:
            # keep email in sync if Firebase sends a new/updated email
            if email and user.email != email:
                user.email = email
                user.save(update_fields=["email"])

        return (user, None)  # <-- do NOT return claims
