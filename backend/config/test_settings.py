"""Configuración para pruebas locales: SQLite y caché en memoria (no necesita RDS)."""
from .settings import *  # noqa: F401,F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'test.sqlite3'}}
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

# En las pruebas no se aplican límites, salvo en las pruebas que los activan a propósito
REST_FRAMEWORK = {**REST_FRAMEWORK, 'DEFAULT_THROTTLE_RATES': {
    'anon': None, 'user': None, 'login': None, 'admin_acceso': None,
}}
