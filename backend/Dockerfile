# ---- build ----
FROM python:3.13.3-slim AS build
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1
COPY requirements.txt .
RUN python -m pip install --upgrade pip \
 && pip wheel --wheel-dir /wheels -r requirements.txt

# ---- runtime ----
FROM python:3.13.3-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Non-root
RUN adduser --disabled-password --gecos "" appuser

# Deps
COPY --from=build /wheels /wheels
COPY requirements.txt .
RUN python -m pip install --upgrade pip \
 && pip install --no-index --find-links=/wheels -r requirements.txt

# App
COPY . /app

# Collect static at build time.
# Provide a dummy SECRET_KEY just for this step so Django doesn't complain.
# (Cloud Run env vars will override this at runtime.)
RUN SECRET_KEY=dummy-for-collectstatic python manage.py collectstatic --noinput

RUN chown -R appuser:appuser /app
USER appuser

# Cloud Run expects the app to listen on $PORT (default 8080)
EXPOSE 8080

# Tunables (adjust later based on load)
ENV WEB_CONCURRENCY=2 \
    WEB_THREADS=8 \
    GUNICORN_TIMEOUT=120 \
    GUNICORN_MAX_REQUESTS=1000 \
    GUNICORN_MAX_REQUESTS_JITTER=100

# Better logging to stdout, and bind to $PORT
CMD ["bash", "-lc", "gunicorn MoodMixDjangoProject.wsgi:application \
  --bind :${PORT:-8080} \
  --workers ${WEB_CONCURRENCY} \
  --threads ${WEB_THREADS} \
  --timeout ${GUNICORN_TIMEOUT} \
  --max-requests ${GUNICORN_MAX_REQUESTS} \
  --max-requests-jitter ${GUNICORN_MAX_REQUESTS_JITTER} \
  --access-logfile - \
  --error-logfile -"]
