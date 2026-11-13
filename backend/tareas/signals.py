"""
Señales: eventos del sistema que generan un aviso por correo.
  - Un insumo baja de su stock mínimo (al confirmar pedidos o registrar mermas).
  - Un pedido queda Listo (para retirar o despachar).
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from inventario.models import Insumo
from pedidos.models import Pedido

from .avisos import enviar_aviso


@receiver(pre_save, sender=Insumo)
def recordar_stock_anterior(sender, instance, **kwargs):
    # Se guarda el stock antes del cambio para avisar solo cuando CRUZA el mínimo
    if instance.pk:
        anterior = Insumo.objects.filter(pk=instance.pk).values_list('stock_actual', flat=True).first()
        instance._stock_anterior = anterior


@receiver(post_save, sender=Insumo)
def avisar_stock_bajo(sender, instance, created, **kwargs):
    anterior = getattr(instance, '_stock_anterior', None)
    if created or anterior is None:
        return
    if anterior > instance.stock_minimo >= instance.stock_actual:
        enviar_aviso(
            f'Stock bajo: {instance.nombre}',
            f'El insumo "{instance.nombre}" quedó en {instance.stock_actual:g} {instance.unidad}, '
            f'bajo su mínimo de {instance.stock_minimo:g} {instance.unidad}.\n'
            'Regístralo como entrada en Bodega cuando lo repongas.',
        )


@receiver(post_save, sender=Pedido)
def avisar_pedido_listo(sender, instance, created, update_fields=None, **kwargs):
    if created or instance.estado != Pedido.Estado.LISTO:
        return
    if update_fields is not None and 'estado' not in update_fields:
        return
    entrega = 'despacho a domicilio' if instance.tipo_entrega == Pedido.TipoEntrega.DESPACHO else 'retiro en tienda'
    enviar_aviso(
        f'Pedido #{instance.pk} listo',
        f'El pedido #{instance.pk} de {instance.cliente.nombre} aprobó el control de calidad '
        f'y está listo para {entrega}.\n'
        f'Entrega programada: {instance.fecha_entrega:%d-%m-%Y %H:%M}.',
    )
