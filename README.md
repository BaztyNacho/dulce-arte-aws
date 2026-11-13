# Dulce Arte en AWS — arquitectura distribuida

Sistema de Trazabilidad y Pedidos para Pastelería Artesanal · INACAP · Bastian Sandoval

El proyecto de la EVA3 (un solo servidor con Django) se separa en servicios de AWS:

```
                         ┌──────────────────────────── API Gateway (HTTPS, única entrada) ─────────────────────────────┐
 Navegador ──────────────►  /            → EC2 FRONTEND  (React + Nginx)                                               │
                         │  /api/*  /admin/*  → EC2 BACKEND (Django API + Gunicorn + Nginx) ──► RDS PostgreSQL (privada)│
                         │  /media/*  /static/* → S3 (imágenes, firmas, CSS del Admin)                                  │
                         └──────────────────────────────────────────────────────────────────────────────────────────────┘
 EventBridge (todos los días) ──► Lambda (serverless) ──► respaldo en S3 /respaldos  +  aviso por correo con SNS
```

| Carpeta | Qué contiene | Dónde corre |
|---|---|---|
| `backend/` | Django + Django REST Framework (solo API JSON y Django Admin) | EC2 `dulce-arte-backend` |
| `frontend/` | React (Vite): todas las pantallas por rol | EC2 `dulce-arte-frontend` |
| `lambda/` | Función `dulce-arte-tareas`: respaldo diario y avisos por correo (SNS) | AWS Lambda (sin servidor) |

## Etapas

1. **RDS** PostgreSQL privada (`dulce-arte-db`), datos migrados con `pg_dump`/`pg_restore`. ✅
2. **S3** bucket con `media/` y `static/` públicos de lectura y `respaldos/` privado. ✅
3. **EC2 backend**: Django como API pura con login JWT. ✅
4. **EC2 frontend**: React con las mismas pantallas y diseño, servido por Nginx. ✅
5. **API Gateway**: une todo bajo una sola dirección HTTPS, con cabecera secreta hacia las EC2. ✅
6. **Lambda + SNS + EventBridge**: respaldos automáticos y avisos por correo.

## Endpoints del backend ↔ pantallas del frontend

Autenticación (JWT):

| Método | Endpoint | Uso |
|---|---|---|
| POST | `/api/auth/token/` | Login: usuario + contraseña → `access`, `refresh` y datos del usuario con su rol |
| POST | `/api/auth/token/refresh/` | Renueva el `access` (dura 30 min; el `refresh`, 8 h) |
| GET | `/api/auth/yo/` | Usuario conectado |
| POST | `/api/auth/admin/` | Vuelve a pedir la contraseña y abre el Django Admin (sesión de 10 min) |
| GET | `/api/salud/` | Backend vivo y conectado a RDS |
| POST | `/api/respaldos/` | Respaldo de la base de datos a S3 (lo pide la Lambda con la cabecera `X-Token-Respaldo`) |

Pantallas (una petición por pantalla de React):

| Ruta en React | Endpoint | Roles |
|---|---|---|
| `/ingresar` | `POST /api/auth/token/` | todos |
| `/` Inicio | `GET /api/pantallas/inicio/` | todos (cada rol recibe su inicio) |
| `/pedidos` | `GET /api/pantallas/pedidos/?estado=&q=&pagina=` | Ventas, Cocina, Admin |
| `/pedidos/:id` | `GET /api/pedidos/:id/` (+ `disponibilidad/`, `confirmar/`, `imagen-referencia/`) | Ventas, Cocina, Admin |
| `/catalogo` | `GET /api/pantallas/catalogo/?categoria=` | Ventas |
| `/pedidos/nuevo` | `GET /api/pantallas/cotizador/` + `POST /api/clientes/` + `POST /api/pedidos/` | Ventas |
| `/cocina` (Kanban) | `GET /api/pedidos/kanban/` + `POST /api/pedidos/:id/avanzar/` y `rechazar-calidad/` | Cocina (Admin mira) |
| `/cocina/manana` | `GET /api/pantallas/produccion-manana/` | Cocina, Admin |
| `/bodega` | `GET /api/pantallas/bodega/?stock=bajo` + `POST /api/movimientos-insumo/` | Bodega (Admin mira) |
| `/bodega/movimientos` | `GET /api/pantallas/movimientos/?tipo=&periodo=&pagina=` | Bodega, Admin |
| `/despachos` (Mi ruta) | `GET /api/pantallas/despachos/?dia=` + `/api/rutas/` y `/api/despachos/` | Repartidor |
| `/despachos/:id/entregar` | `GET /api/pantallas/despachos/:id/` + `POST /api/despachos/:id/confirmar-entrega/` | Repartidor |
| `/despachos/entregados` | `GET /api/pantallas/entregados/?periodo=` | Repartidor, Admin |
| Botón "Administración" | `POST /api/auth/admin/` y luego `/admin/` (Django Admin) | Admin |

La documentación completa (Swagger) está en `/api/docs/`.

## API Gateway (HTTP API `dulce-arte-api`)

| Ruta | Integración | Mapeo de parámetros |
|---|---|---|
| `ANY /api/{proxy+}` | HTTP → `http://<IP backend>` | `overwrite:path = $request.path`, `append:header.X-Origen-Gateway = <secreto>` |
| `ANY /admin` y `ANY /admin/{proxy+}` | HTTP → `http://<IP backend>` | igual que la anterior |
| `GET /media/{proxy+}` y `GET /static/{proxy+}` | HTTP → `https://<bucket>.s3.amazonaws.com` | `overwrite:path = $request.path` |
| `$default` (todo lo demás) | HTTP → `http://<IP frontend>` | `overwrite:path = $request.path`, `append:header.X-Origen-Gateway = <secreto>` |

- La API Gateway entrega HTTPS; las EC2 reciben HTTP en el puerto 80.
- La cabecera secreta `X-Origen-Gateway` hace que el backend (Django) y el frontend (Nginx) rechacen con 403
  a quien intente entrar directo a sus IP. El secreto vive solo en la API Gateway y en los servidores, nunca en GitHub.
- `overwrite:path` envía la ruta original completa (con su barra final) a cada servidor.

## Pruebas

```bash
cd backend
python manage.py test --settings=config.test_settings
```
