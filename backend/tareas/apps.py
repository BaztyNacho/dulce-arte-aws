from django.apps import AppConfig


class TareasConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tareas'
    verbose_name = 'Respaldos y avisos (Lambda + SNS)'

    def ready(self):
        # Conecta las señales que envían avisos (stock bajo, pedido listo)
        from . import signals  # noqa: F401
