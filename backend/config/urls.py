"""
Rutas (URLs) principales del BACKEND de Dulce Arte.

Este servidor ya no genera páginas web: solo entrega la API (JSON) y el panel de
Administración. Las pantallas las dibuja el FRONTEND en React (otra EC2).
La API Gateway reparte el tráfico:  /api/* y /admin/* -> esta EC2,  /media/* y /static/* -> S3,
y todo lo demás -> la EC2 del frontend.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

# Textos del panel de administración
admin.site.site_header = 'Dulce Arte · Administración'
admin.site.site_title = 'Dulce Arte'
admin.site.index_title = 'Panel de gestión de la pastelería'
# El enlace "Ver el sitio" del Admin lleva al frontend en React
admin.site.site_url = settings.FRONTEND_URL

urlpatterns = [
    path('admin/', admin.site.urls),
    # Documentación de la API (Swagger). Va antes de "api/" para que no la tape el router.
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    # API REST
    path('api/', include('config.api')),
    path('api-auth/', include('rest_framework.urls')),  # login para la API navegable
]

# En desarrollo, Django sirve las imágenes subidas. En AWS las sirve S3.
if settings.DEBUG and not settings.USAR_S3:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
