#!/usr/bin/env bash
# ---------------------------------------------------------------
# Instala el BACKEND de Dulce Arte en una EC2 nueva (Ubuntu 24.04).
# Antes de ejecutarlo:  el archivo backend/.env debe estar completo.
# Uso:  bash ~/dulce-arte-aws/backend/deploy/instalar_backend.sh
# ---------------------------------------------------------------
set -e
cd /home/ubuntu/dulce-arte-aws/backend

if [ ! -f .env ]; then
  echo "Falta el archivo .env. Créalo con:  cp .env.ejemplo .env && nano .env"
  exit 1
fi

echo "1/8 Instalando programas del sistema (Python, Nginx, cliente PostgreSQL)..."
sudo apt-get update -qq
sudo apt-get install -y -qq python3-venv python3-pip nginx postgresql-client

echo "2/8 Creando el entorno virtual e instalando librerías..."
python3 -m venv venv
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "3/8 Revisando la configuración de Django..."
python manage.py check --deploy --fail-level ERROR

echo "4/8 Probando la conexión con RDS y aplicando migraciones..."
python manage.py migrate

echo "5/8 Creando la tabla de caché (intentos de acceso al Admin)..."
python manage.py createcachetable

echo "6/8 Subiendo los archivos estáticos del Admin a S3 (static/)..."
python manage.py collectstatic --noinput

echo "7/8 Configurando Gunicorn..."
sudo cp deploy/gunicorn.service /etc/systemd/system/gunicorn.service
sudo systemctl daemon-reload
sudo systemctl enable --now gunicorn
sudo systemctl restart gunicorn

echo "8/8 Configurando Nginx..."
sudo cp deploy/nginx_backend.conf /etc/nginx/sites-available/dulce_backend
sudo ln -sf /etc/nginx/sites-available/dulce_backend /etc/nginx/sites-enabled/dulce_backend
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo ""
echo "Listo. Prueba en el navegador:  http://<IP elástica>/api/salud/"
