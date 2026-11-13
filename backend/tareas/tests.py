"""
Pruebas de la Etapa 6: endpoint de respaldo y avisos (sin conectarse a AWS).

    python manage.py test tareas --settings=config.test_settings
"""

import gzip
import json
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from inventario.models import Insumo
from inventario.services import registrar_movimiento
from pedidos.models import Cliente, Pedido


@override_settings(RESPALDO_TOKEN='token-de-prueba', USAR_S3=False)
class RespaldoTests(TestCase):
    def test_sin_token_o_token_malo(self):
        self.assertEqual(APIClient().post('/api/respaldos/').status_code, 403)
        respuesta = APIClient().post('/api/respaldos/', HTTP_X_TOKEN_RESPALDO='otro')
        self.assertEqual(respuesta.status_code, 403)

    def test_respaldo_con_token(self):
        Cliente.objects.create(nombre='Ana', telefono='+56 9 1111 1111')
        respuesta = APIClient().post('/api/respaldos/', HTTP_X_TOKEN_RESPALDO='token-de-prueba')
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.json()['registros']['clientes'], 1)
        self.assertTrue(respuesta.json()['archivo'].endswith('.json.gz'))

    @override_settings(RESPALDO_TOKEN='')
    def test_desactivado_si_no_hay_token_configurado(self):
        self.assertEqual(APIClient().post('/api/respaldos/', HTTP_X_TOKEN_RESPALDO='').status_code, 403)

    @override_settings(USAR_S3=True, AWS_STORAGE_BUCKET_NAME='bucket-prueba', RESPALDOS_A_CONSERVAR=2)
    def test_sube_a_s3_y_borra_antiguos(self):
        s3 = mock.MagicMock()
        s3.list_objects_v2.return_value = {'Contents': [
            {'Key': f'respaldos/automaticos/respaldo_2026-11-0{d}_0300.json.gz'} for d in (1, 2, 3)
        ]}
        with mock.patch('boto3.client', return_value=s3):
            respuesta = APIClient().post('/api/respaldos/', HTTP_X_TOKEN_RESPALDO='token-de-prueba')
        self.assertEqual(respuesta.status_code, 201)
        subido = s3.put_object.call_args.kwargs
        self.assertEqual(subido['Bucket'], 'bucket-prueba')
        self.assertTrue(subido['Key'].startswith('respaldos/automaticos/'))
        json.loads(gzip.decompress(subido['Body']))           # es un JSON válido comprimido
        self.assertEqual(s3.delete_object.call_count, 1)       # deja solo los 2 más nuevos
        self.assertEqual(respuesta.json()['borrados'], 1)


@override_settings(LAMBDA_AVISOS='dulce-arte-tareas')
class AvisosTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('crear_roles', verbosity=0)
        cls.usuario = User.objects.create_superuser('jefa', 'j@d.cl', 'x')

    def avisos_enviados(self, accion):
        cliente = mock.MagicMock()
        with mock.patch('boto3.client', return_value=cliente), self.captureOnCommitCallbacks(execute=True):
            accion()
        return [json.loads(c.kwargs['Payload']) for c in cliente.invoke.call_args_list]

    def test_aviso_al_cruzar_el_minimo(self):
        harina = Insumo.objects.create(nombre='Harina', unidad='kg', stock_actual=Decimal('5'), stock_minimo=Decimal('3'))
        avisos = self.avisos_enviados(lambda: registrar_movimiento(harina, 'ajuste', Decimal('2.5'), self.usuario, 'merma'))
        self.assertEqual(len(avisos), 1)
        self.assertEqual(avisos[0]['tipo'], 'aviso')
        self.assertIn('Harina', avisos[0]['asunto'])
        # Si ya estaba bajo el mínimo, no se repite el aviso
        harina.refresh_from_db()
        avisos = self.avisos_enviados(lambda: registrar_movimiento(harina, 'ajuste', Decimal('0.5'), self.usuario, 'merma'))
        self.assertEqual(avisos, [])

    def test_aviso_pedido_listo(self):
        cliente = Cliente.objects.create(nombre='Ana', telefono='+56 9 1111 1111')
        pedido = Pedido.objects.create(cliente=cliente, fecha_entrega=timezone.now() + timezone.timedelta(days=2),
                                       estado=Pedido.Estado.CONTROL_CALIDAD)
        from pedidos.services import avanzar_estado
        avisos = self.avisos_enviados(lambda: avanzar_estado(pedido, self.usuario))
        self.assertEqual(len(avisos), 1)
        self.assertIn(f'#{pedido.pk} listo', avisos[0]['asunto'])

    @override_settings(LAMBDA_AVISOS='')
    def test_sin_lambda_configurada_no_envia(self):
        harina = Insumo.objects.create(nombre='Harina', unidad='kg', stock_actual=Decimal('5'), stock_minimo=Decimal('3'))
        self.assertEqual(self.avisos_enviados(lambda: registrar_movimiento(harina, 'ajuste', Decimal('4'), self.usuario)), [])

    def test_aviso_fallido_no_rompe_la_operacion(self):
        harina = Insumo.objects.create(nombre='Harina', unidad='kg', stock_actual=Decimal('5'), stock_minimo=Decimal('3'))
        roto = mock.MagicMock()
        roto.invoke.side_effect = RuntimeError('sin conexión')
        with mock.patch('boto3.client', return_value=roto), self.captureOnCommitCallbacks(execute=True):
            registrar_movimiento(harina, 'ajuste', Decimal('4'), self.usuario)
        harina.refresh_from_db()
        self.assertEqual(harina.stock_actual, Decimal('1'))
