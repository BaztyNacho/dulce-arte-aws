from django.apps import AppConfig


class CuentasConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cuentas'
    verbose_name = 'Cuentas y acceso'

    def ready(self):
        # Conecta la señal que marca la sesión como "verificada" al iniciar sesión en el Admin
        from . import signals  # noqa: F401
