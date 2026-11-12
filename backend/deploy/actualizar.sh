#!/usr/bin/env bash
# ---------------------------------------------------------------
# Actualiza el BACKEND con los últimos cambios de GitHub.
# Uso (en la EC2 del backend):  bash ~/dulce-arte-aws/backend/deploy/actualizar.sh
# ---------------------------------------------------------------
set -e
cd /home/ubuntu/dulce-arte-aws

echo "1/5 Descargando cambios de GitHub..."
git pull

cd backend
echo "2/5 Instalando librerías nuevas (si las hay)..."
source venv/bin/activate
pip install --quiet -r requirements.txt

echo "3/5 Aplicando migraciones en RDS..."
python manage.py migrate

echo "4/5 Subiendo archivos estáticos a S3..."
python manage.py collectstatic --noinput

echo "5/5 Reiniciando Gunicorn..."
sudo systemctl restart gunicorn

echo "Listo: el backend está actualizado."
