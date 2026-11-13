#!/usr/bin/env bash
# ---------------------------------------------------------------
# Instala el FRONTEND de Dulce Arte (React) en una EC2 nueva (Ubuntu).
# Uso:  bash ~/dulce-arte-aws/frontend/deploy/instalar_frontend.sh
# ---------------------------------------------------------------
set -e
cd /home/ubuntu/dulce-arte-aws/frontend

echo "1/5 Instalando Node.js, npm y Nginx..."
sudo apt-get update -qq
sudo apt-get install -y -qq nodejs npm nginx
# Vite necesita Node.js 20.19+ o 22.12+. Si la versión de Ubuntu es antigua, se instala Node 22 oficial.
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)"; then
  echo "    Node.js $(node -v) es antiguo: instalando Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "    Node.js $(node -v), npm $(npm -v)"

echo "2/5 Instalando las librerías de React (npm ci)..."
npm ci --no-audit --no-fund

echo "3/5 Compilando React (npm run build -> carpeta dist/)..."
npm run build

echo "4/5 Dando permiso a Nginx para leer la carpeta..."
chmod o+x /home/ubuntu /home/ubuntu/dulce-arte-aws /home/ubuntu/dulce-arte-aws/frontend

echo "5/5 Configurando Nginx..."
bash deploy/configurar_nginx.sh

echo ""
echo "Listo. Abre en el navegador la dirección de la API Gateway (o la IP del frontend si aún no la creas)."
