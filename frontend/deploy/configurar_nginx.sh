#!/usr/bin/env bash
# ---------------------------------------------------------------
# Instala la configuración de Nginx del frontend.
#   bash deploy/configurar_nginx.sh                 -> responde a cualquiera
#   bash deploy/configurar_nginx.sh CLAVE_SECRETA   -> solo responde a la API Gateway
# Con la clave, Nginx exige la cabecera X-Origen-Gateway (la agrega la API Gateway);
# si alguien entra directo a la IP de esta EC2, recibe 403.
# La clave solo queda en el servidor (/etc/nginx), nunca en GitHub.
# ---------------------------------------------------------------
set -e
cd /home/ubuntu/dulce-arte-aws/frontend
SECRETO="$1"

if [ -n "$SECRETO" ]; then
  REGLA="if (\$http_x_origen_gateway != \"${SECRETO}\") { return 403; }"
  echo "Nginx solo aceptará peticiones que vengan de la API Gateway."
else
  REGLA="# Sin cabecera secreta: acepta peticiones directas"
fi

sed "s|# REVISION_GATEWAY.*|${REGLA}|" deploy/nginx_frontend.conf | sudo tee /etc/nginx/sites-available/dulce_frontend > /dev/null
sudo chmod 640 /etc/nginx/sites-available/dulce_frontend
sudo ln -sf /etc/nginx/sites-available/dulce_frontend /etc/nginx/sites-enabled/dulce_frontend
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
echo "Nginx del frontend configurado."
