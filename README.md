# Dulce Arte en AWS — arquitectura distribuida

Sistema de Trazabilidad y Pedidos para Pastelería Artesanal · INACAP · Bastian Sandoval

El proyecto de la EVA3 (un solo servidor con Django) se separa en servicios de AWS:

```
                         ┌──────────────────────────── API Gateway (HTTPS, única entrada) ─────────────────────────────┐
 Navegador ──────────────►  /            → EC2 FRONTEND  (React + Nginx)                                               │
                         │  /api/*  /admin/*  → EC2 BACKEND (Django API + Gunicorn + Nginx) ──► RDS PostgreSQL (privada)│
                         │  /media/*  /static/* → S3 (imágenes, firmas, CSS del Admin)                                  │
                         └──────────────────────────────────────────────────────────────────────────────────────────────┘
 EventBridge (cada 7 horas) ──► Lambda (serverless) ──► respaldo en S3 /respaldos  +  aviso por correo con SNS
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
| `ANY /api/{proxy+}` y `POST /api/auth/token/` | HTTP → `http://<IP backend>` | `overwrite:path = $request.path`, `append:header.X-Origen-Gateway = <secreto>`, `overwrite:header.X-Ip-Cliente = $context.identity.sourceIp` |
| `ANY /admin` y `ANY /admin/{proxy+}` | HTTP → `http://<IP backend>` | igual que la anterior |
| `GET /media/{proxy+}` y `GET /static/{proxy+}` | HTTP → `https://<bucket>.s3.amazonaws.com` | `overwrite:path = $request.path` |
| `$default` (todo lo demás) | HTTP → `http://<IP frontend>` | `overwrite:path = $request.path`, `append:header.X-Origen-Gateway = <secreto>` |

- La API Gateway entrega HTTPS; las EC2 reciben HTTP en el puerto 80.
- La cabecera secreta `X-Origen-Gateway` hace que el backend (Django) y el frontend (Nginx) rechacen con 403
  a quien intente entrar directo a sus IP. El secreto vive solo en la API Gateway y en los servidores, nunca en GitHub.
- `overwrite:path` envía la ruta original completa (con su barra final) a cada servidor.

## Rate limit (dos capas)

| Capa | Límite | Qué protege |
|---|---|---|
| API Gateway, toda la etapa `$default` | 50 peticiones/s, ráfaga de 100 | Que un exceso de tráfico llegue a las EC2 y a RDS |
| API Gateway, ruta `POST /api/auth/token/` | 5 peticiones/s, ráfaga de 10 | El inicio de sesión |
| Django (DRF), inicio de sesión | 10 intentos/min por IP | Fuerza bruta de contraseñas |
| Django (DRF), contraseña del Admin | 5 intentos/min por usuario | Fuerza bruta del acceso al Admin |
| Django (DRF), resto de la API | 60/min sin sesión (por IP) · 600/min por usuario | Abuso de un mismo cliente |

Quien supera un límite recibe **429 Too Many Requests**. La API Gateway limita el total de tráfico;
Django limita a cada cliente por separado: la API Gateway le entrega la IP real en la cabecera
`X-Ip-Cliente` (mapeo `overwrite:header.X-Ip-Cliente = $context.identity.sourceIp` en las integraciones del backend).

## Cifrado

| Dónde | En reposo (guardado) | En tránsito (viajando) |
|---|---|---|
| **RDS** | AWS KMS, AES-256 (clave `aws/rds`): datos, respaldos automáticos y snapshots | TLS obligatorio: `rds.force_ssl = 1` en RDS y `sslmode=verify-full` en Django con el certificado de AWS |
| **S3** | SSE-S3, AES-256 (clave administrada por S3), en todos los objetos | Solo HTTPS: la política del bucket rechaza conexiones sin TLS (`aws:SecureTransport`) |
| **Navegador ↔ API Gateway** | — | HTTPS (TLS 1.2 o superior) |
| **Lambda** | Variables de entorno cifradas con AWS KMS | HTTPS hacia la API Gateway y SNS |

`backend/deploy/verificar_cifrado.py` muestra si la conexión Django → RDS va cifrada y con qué algoritmo.

## Desarrollo seguro: SAST y DAST

| Tipo | Herramienta | Qué revisa | Cuándo |
|---|---|---|---|
| SAST (código) | **Bandit** | Código Python inseguro | Cada `git push` (`.github/workflows/sast.yml`) |
| SAST (código) | **Semgrep** | Reglas de seguridad de Django y React | Cada `git push` |
| SCA (dependencias) | **pip-audit** / **npm audit** | Librerías con vulnerabilidades conocidas (CVE) | Cada `git push` |
| DAST (app funcionando) | **OWASP ZAP** baseline | Cabeceras, cookies, información expuesta, por la API Gateway | A mano y cada lunes (`.github/workflows/dast.yml`) |

Hallazgos corregidos:
- `npm audit` encontró vulnerabilidades altas en `react-router-dom 7.9.1` (redirecciones abiertas, XSS) y `vite 7.1.5` (lectura de archivos del servidor de desarrollo): se actualizaron a 7.18.6 y 7.3.8.
- Bandit marcó `random` en `cargar_demo` (solo datos de demostración, no criptografía): revisado y marcado `# nosec B311`.
- Cabeceras de seguridad en Nginx (`frontend/deploy/cabeceras_seguridad.conf`): HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy y Permissions-Policy; versión de Nginx oculta.

Otras prácticas: secretos solo en `.env` (fuera de GitHub), JWT y permisos por rol en cada endpoint, ORM de Django (evita inyección SQL), React escapa el HTML (evita XSS), CSRF en el Admin, rate limit, grupos de seguridad mínimos y cabecera secreta de la API Gateway.

## Pruebas

```bash
cd backend
python manage.py test --settings=config.test_settings
```
