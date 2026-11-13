# Frontend de Dulce Arte (React + Vite)

Todas las pantallas del sistema, por rol, con el mismo diseño de la versión en Django.
Se comunica con el backend solo a través de la API (JSON) usando tokens JWT.

## Estructura

```
src/
  main.jsx            punto de entrada
  App.jsx             rutas y qué roles pueden ver cada una
  api.js              llamadas a la API con JWT (renueva el token si vence)
  sesion.jsx          usuario conectado (login / logout)
  useDatos.js         carga los datos de una pantalla
  rutas.js            acciones del reparto (crear ruta, asignar, iniciar...)
  util.js             formatos: $25.000, fechas y horas de Chile
  componentes/        barra, banner, ventanas, comanda, sellos, mapa
  pantallas/          una pantalla por archivo (Inicio, Pedidos, Kanban, Bodega...)
  estilos/dulce.css   diseño de Dulce Arte
  img/ sprites/       logo, fondos y dibujos SVG
deploy/               Nginx (configurar_nginx.sh), instalación y actualización en la EC2
```

## Desarrollo en tu computador

```bash
# 1) Backend en otra terminal:  python manage.py runserver   (http://localhost:8000)
# 2) Frontend:
npm install
npm run dev          # http://localhost:5173 (el proxy envía /api al backend)
```

## Producción

`npm run build` genera `dist/`, que sirve Nginx en la EC2 del frontend.
