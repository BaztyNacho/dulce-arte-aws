# Lambda `dulce-arte-tareas`

Función serverless (Python 3.13) que corre fuera de los servidores, solo cuando se la llama.

| Quién la llama | Qué hace |
|---|---|
| **EventBridge Scheduler** (todos los días) o el botón **Probar** | Pide al backend `POST /api/respaldos/` (a través de la API Gateway), que guarda la base de datos en S3 `respaldos/automaticos/`, y publica el resultado en SNS |
| **Backend** (insumo bajo el mínimo, pedido listo) | Publica el aviso en SNS |

SNS (`dulce-arte-avisos`) envía cada mensaje por correo a los suscriptores.

## Configuración

- Tiempo de ejecución: Python 3.13 · Rol: `LabRole` · Tiempo de espera: 1 min
- Variables de entorno: `API_URL`, `RESPALDO_TOKEN`, `SNS_TOPIC_ARN`
- Código: pegar `lambda_function.py` en el editor de la consola y presionar **Deploy**.

## Restaurar un respaldo

```bash
aws s3 cp s3://<bucket>/respaldos/automaticos/respaldo_AAAA-MM-DD_HHMM.json.gz .
gunzip respaldo_*.json.gz
python manage.py loaddata respaldo_*.json
```
