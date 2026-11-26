#!/usr/bin/env bash
# ---------------------------------------------------------------
# Compila React y lo publica:
#   1. Compila en dist-nuevo/
#   2. Sube JS, CSS e imágenes a S3 (static/app/), si S3_BUCKET está en frontend/.env
#   3. Recién entonces reemplaza dist/ (así index.html nunca apunta a archivos que aún no están en S3)
# Lo usan instalar_frontend.sh y actualizar.sh.
# ---------------------------------------------------------------
set -e
cd /home/ubuntu/dulce-arte-aws/frontend
set -a; [[ -f .env ]] && . ./.env; set +a

# npm run usa el Vite ya instalado en node_modules (npx podría descargar paquetes)
npm run build -- --outDir dist-nuevo --emptyOutDir

if [[ -n "$S3_BUCKET" ]]; then
  echo "Subiendo los archivos de React a s3://${S3_BUCKET}/static/app/ ..."
  node deploy/subir_a_s3.mjs dist-nuevo
else
  echo "Sin S3_BUCKET en frontend/.env: los archivos quedan solo en esta EC2."
fi

rm -rf dist-anterior
[[ -d dist ]] && mv dist dist-anterior
mv dist-nuevo dist
echo "React publicado."
