# MoodMixDjangoApp/apps.py
import os
import sys
import logging
from django.apps import AppConfig

log = logging.getLogger(__name__)

MGMT_CMDS_TO_SKIP = {
    "makemigrations",
    "migrate",
    "collectstatic",
    "shell",
    "shell_plus",
    "check",
    "dbshell",
    "test",
    "showmigrations",
    "loaddata",
    "dumpdata",
}

def _is_management_command_invocation(argv: list[str]) -> bool:
    # manage.py <command> [args...]
    if len(argv) >= 2 and argv[0].endswith("manage.py"):
        cmd = argv[1]
        return (cmd in MGMT_CMDS_TO_SKIP) or any(cmd.startswith(x) for x in MGMT_CMDS_TO_SKIP)
    return False

class MoodmixdjangoappConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'MoodMixDjangoApp'

    def ready(self):
        # Optional kill-switch if you ever want to disable eager init (e.g., local dev):
        if os.getenv("FIREBASE_EAGER_INIT", "true").lower() in {"0", "false", "no"}:
            log.info("Skipping Firebase eager init: FIREBASE_EAGER_INIT disabled")
            return

        if _is_management_command_invocation(sys.argv):
            log.info("Skipping Firebase eager init during management command: %s", sys.argv[1:])
            return

        # Eager init for web/worker processes (will raise if env missing → fail fast).
        from .firebase.firebase_authentication import ensure_firebase_initialized
        ensure_firebase_initialized()
        log.info("Firebase initialized eagerly at startup")
