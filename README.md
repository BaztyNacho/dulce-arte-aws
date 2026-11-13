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
| `lambda/` | Función de respaldos y notificaciones (Etapa 6) | AWS Lambda (sin servidor) |

## Etapas

1. **RDS** PostgreSQL privada (`dulce-arte-db`), datos migrados con `pg_dump`/`pg_restore`. ✅
2. **S3** bucket con `media/` y `static/` públicos de lectura y `respaldos/` privado. ✅
3. **EC2 backend**: Django como API pura con login JWT. ✅
4. **EC2 frontend**: React con las mismas pantallas y diseño, servido por Nginx.
5. **API Gateway**: une todo bajo una sola dirección HTTPS.
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

## Pruebas

```bash
cd backend
python manage.py test --settings=config.test_settings
```
