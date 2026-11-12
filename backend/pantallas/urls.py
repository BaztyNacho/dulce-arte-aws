"""
Endpoints de pantallas: /api/pantallas/<pantalla>/
Cada uno coincide con una ruta del frontend en React (ver frontend/src/rutas.jsx).
"""

from django.urls import path

from . import views

urlpatterns = [
    path('inicio/', views.inicio, name='p_inicio'),
    path('pedidos/', views.pedidos, name='p_pedidos'),
    path('produccion-manana/', views.produccion_manana, name='p_produccion_manana'),
    path('catalogo/', views.catalogo, name='p_catalogo'),
    path('cotizador/', views.cotizador, name='p_cotizador'),
    path('bodega/', views.bodega, name='p_bodega'),
    path('movimientos/', views.movimientos, name='p_movimientos'),
    path('despachos/', views.despachos, name='p_despachos'),
    path('despachos/<int:pk>/', views.despacho_entrega, name='p_despacho_entrega'),
    path('entregados/', views.entregados, name='p_entregados'),
]
