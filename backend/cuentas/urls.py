from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path('token/', views.IniciarSesionView.as_view(), name='token'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('yo/', views.yo, name='yo'),
    path('admin/', views.acceso_admin, name='acceso_admin'),
]
