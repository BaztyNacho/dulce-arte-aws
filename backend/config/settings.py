"""
Configuración del BACKEND de Dulce Arte (Django + Django REST Framework).
Sistema de Trazabilidad y Pedidos para Pastelería Artesanal.

Arquitectura en AWS:
  - Esta EC2 (backend) entrega solo la API y el panel de Administración.
  - La base de datos está en Amazon RDS (PostgreSQL).
  - Las imágenes y archivos estáticos se guardan en Amazon S3.
  - Todo se accede a través de la API Gateway.
Los datos sensibles (contraseñas, nombres de servidores) se leen del archivo .env.
"""

from datetime import timedelta
from pathlib import Path

import environ

# Ruta base del proyecto (la carpeta backend)
BASE_DIR = Path(__file__).resolve().parent.parent

# Lectura de variables de entorno desde el archivo .env
env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / '.env')


# ---------------------------------------------------------------
# Seguridad
# ---------------------------------------------------------------
SECRET_KEY = env('SECRET_KEY')

DEBUG = env('DEBUG')

# Nombres con los que se puede llamar a esta EC2 (la IP elástica del backend y localhost)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])

# Direcciones desde las que se aceptan formularios del Admin (en AWS: la URL de la API Gateway)
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])

# Cabecera secreta que agrega la API Gateway. Si está definida, el backend rechaza
# las peticiones que no vengan desde la API Gateway (ver cuentas/middleware.py).
GATEWAY_SECRETO = env('GATEWAY_SECRETO', default='')

# Dirección del frontend en React (para el enlace "Ver el sitio" del Admin)
FRONTEND_URL = env('FRONTEND_URL', default='/')

SESSION_COOKIE_HTTPONLY = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
# La sesión del Admin expira tras 8 horas (una jornada de trabajo).
SESSION_COOKIE_AGE = 60 * 60 * 8

# HTTPS: la API Gateway atiende HTTPS. Con esto las cookies del Admin solo viajan cifradas.
USAR_HTTPS = env.bool('USAR_HTTPS', default=False)
if USAR_HTTPS:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


# ---------------------------------------------------------------
# Aplicaciones instaladas
# ---------------------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Librerías externas
    'corsheaders',                   # permite que React en desarrollo (localhost:5173) llame a la API
    'rest_framework',
    'rest_framework_simplejwt',      # inicio de sesión con tokens JWT
    'drf_spectacular',               # documentación Swagger
    'storages',                      # guardar archivos en Amazon S3
    # Apps del proyecto Dulce Arte
    'inventario',
    'pedidos',
    'despachos',
    'cuentas',                       # login JWT, acceso al Admin, salud
    'pantallas',                     # datos listos para cada pantalla de React
    'tareas',                        # respaldos y avisos (con la Lambda y SNS)
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Solo acepta peticiones que vienen desde la API Gateway (si GATEWAY_SECRETO está definido)
    'cuentas.middleware.SoloDesdeGateway',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # Pide la contraseña otra vez antes de usar el panel de Administración
    'cuentas.middleware.VerificarAccesoAdmin',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],     # solo la apariencia del Admin
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# ---------------------------------------------------------------
# Base de datos: PostgreSQL en Amazon RDS (datos leídos desde .env)
# ---------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': env('DB_NAME'),
        'USER': env('DB_USER'),
        'PASSWORD': env('DB_PASSWORD'),
        'HOST': env('DB_HOST'),               # el "Endpoint" de la instancia RDS
        'PORT': env('DB_PORT', default='5432'),
        # Reutiliza la conexión por 60 s (menos tiempo conectando a RDS en cada petición)
        'CONN_MAX_AGE': 60,
        'OPTIONS': {
            'connect_timeout': 5,
            'sslmode': env('DB_SSLMODE', default='prefer'),   # RDS acepta conexión cifrada
        },
    }
}

# Caché en la base de datos: comparte entre los procesos de Gunicorn el conteo
# de intentos fallidos al entrar al Admin. Se crea con: python manage.py createcachetable
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'cache_dulce_arte',
    }
}


# ---------------------------------------------------------------
# Validación de contraseñas
# ---------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ---------------------------------------------------------------
# Idioma y zona horaria (Chile)
# ---------------------------------------------------------------
LANGUAGE_CODE = 'es-cl'
TIME_ZONE = 'America/Santiago'
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------
# Archivos: imágenes subidas (media) y estáticos del Admin/Swagger (static)
# ---------------------------------------------------------------
# En AWS (USAR_S3=True) ambos se guardan en el bucket S3:
#   s3://<bucket>/media/   fotos de productos, insumos, firmas y comprobantes
#   s3://<bucket>/static/  CSS y JavaScript del Admin y de Swagger
# En el computador (USAR_S3=False) se guardan en carpetas locales.
USAR_S3 = env.bool('USAR_S3', default=False)

if USAR_S3:
    AWS_STORAGE_BUCKET_NAME = env('AWS_STORAGE_BUCKET_NAME')
    AWS_S3_REGION_NAME = env('AWS_S3_REGION_NAME', default='us-east-1')
    # Sin claves: la EC2 usa el rol LabInstanceProfile (LabRole) para escribir en S3.
    # Las URLs son públicas y sin firma (el bucket permite leer media/ y static/).
    AWS_QUERYSTRING_AUTH = False
    AWS_DEFAULT_ACL = None             # el bucket tiene las ACL desactivadas; manda la política
    # Dominio con el que se arman las URLs de las imágenes. Con la API Gateway queda:
    #   https://<id>.execute-api.us-east-1.amazonaws.com/media/productos/torta.jpg
    # Si se deja vacío, se usa la dirección directa del bucket.
    AWS_S3_CUSTOM_DOMAIN = env('AWS_S3_CUSTOM_DOMAIN', default='') or None
    AWS_S3_FILE_OVERWRITE = False      # si dos fotos se llaman igual, no se pisan

    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3.S3Storage',
            'OPTIONS': {'location': 'media'},
        },
        'staticfiles': {
            'BACKEND': 'storages.backends.s3.S3Storage',
            'OPTIONS': {'location': 'static', 'file_overwrite': True},
        },
    }
    _dominio = AWS_S3_CUSTOM_DOMAIN or f'{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com'
    STATIC_URL = f'https://{_dominio}/static/'
    MEDIA_URL = f'https://{_dominio}/media/'
else:
    STATIC_URL = 'static/'
    MEDIA_URL = 'media/'

STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_ROOT = BASE_DIR / 'media'


# ---------------------------------------------------------------
# CORS: solo para desarrollo (React en http://localhost:5173 llamando a la API local).
# En AWS no hace falta: React y la API comparten la misma dirección de la API Gateway.
# ---------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[])


# ---------------------------------------------------------------
# Django REST Framework (API)
# ---------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        # React envía "Authorization: Bearer <token>" en cada petición
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        # La API navegable y Swagger usan la sesión del Admin
        'rest_framework.authentication.SessionAuthentication',
    ],
    # Por defecto, toda la API exige haber iniciado sesión.
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(hours=8),     # una jornada de trabajo
    'AUTH_HEADER_TYPES': ('Bearer',),
    'UPDATE_LAST_LOGIN': True,
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'API Dulce Arte',
    'DESCRIPTION': (
        'Sistema de Trazabilidad y Pedidos para Pastelería Artesanal. '
        'Obtén un token en /api/auth/token/ y úsalo con el botón "Authorize" (Bearer).'
    ),
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SERVE_PERMISSIONS': ['rest_framework.permissions.IsAuthenticated'],
    'ENUM_NAME_OVERRIDES': {
        'EstadoPedidoEnum': 'pedidos.models.Pedido.Estado',
        'EstadoDespachoEnum': 'despachos.models.Despacho.Estado',
        'EstadoRutaEnum': 'despachos.models.Ruta.Estado',
    },
}


# ---------------------------------------------------------------
# Tamaño máximo de archivos subidos (fotos de comprobantes desde el celular).
# La API Gateway acepta hasta 10 MB por petición.
# ---------------------------------------------------------------
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024


# ---------------------------------------------------------------
# Respaldos y avisos (Etapa 6: Lambda + SNS)
# ---------------------------------------------------------------
# Token que la Lambda envía en la cabecera X-Token-Respaldo para pedir un respaldo
RESPALDO_TOKEN = env('RESPALDO_TOKEN', default='')
# Cuántos respaldos automáticos se guardan en S3 (los más antiguos se borran)
RESPALDOS_A_CONSERVAR = env.int('RESPALDOS_A_CONSERVAR', default=14)
# Nombre de la función Lambda que publica los avisos en SNS. Vacío = sin avisos.
LAMBDA_AVISOS = env('LAMBDA_AVISOS', default='')
AWS_REGION_AVISOS = env('AWS_REGION_AVISOS', default='us-east-1')


DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
