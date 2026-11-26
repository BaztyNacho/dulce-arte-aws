#!/usr/bin/env bash
# ---------------------------------------------------------------
# Actualiza el FRONTEND con los últimos cambios de GitHub y vuelve a compilar React.
# Uso (en la EC2 del frontend):  bash ~/dulce-arte-aws/frontend/deploy/actualizar.sh
# ---------------------------------------------------------------
set -e
cd /home/ubuntu/dulce-arte-aws
echo "1/3 Descargando cambios de GitHub..."
git pull
cd frontend
echo "2/3 Instalando librerías nuevas (si las hay)..."
# --ignore-scripts: no ejecuta scripts de instalación de las librerías (ataques a la cadena de suministro)
npm ci --ignore-scripts --no-audit --no-fund
echo "3/3 Compilando React y subiendo sus archivos a S3..."
bash deploy/publicar.sh
echo "Listo: Nginx ya sirve la versión nueva (no hace falta reiniciarlo)."
