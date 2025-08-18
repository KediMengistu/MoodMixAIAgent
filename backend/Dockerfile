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
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
RUN adduser --disabled-password --gecos "" appuser
COPY --from=build /wheels /wheels
COPY requirements.txt .
RUN python -m pip install --upgrade pip \
 && pip install --no-index --find-links=/wheels -r requirements.txt
COPY . /app
USER appuser
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]  
# swap to gunicorn later