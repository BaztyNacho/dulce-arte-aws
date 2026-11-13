#!/usr/bin/env bash
# ---------------------------------------------------------------
# Instala el FRONTEND de Dulce Arte (React) en una EC2 nueva (Ubuntu).
# Uso:  bash ~/dulce-arte-aws/frontend/deploy/instalar_frontend.sh IP_ELASTICA_DEL_BACKEND
# ---------------------------------------------------------------
set -e
IP_BACKEND="$1"
if [ -z "$IP_BACKEND" ]; then
  echo "Falta la IP del backend. Uso: bash deploy/instalar_frontend.sh 100.48.119.75"
  exit 1
fi
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
sed "s/IP_BACKEND/${IP_BACKEND}/g" deploy/nginx_frontend.conf | sudo tee /etc/nginx/sites-available/dulce_frontend > /dev/null
sudo ln -sf /etc/nginx/sites-available/dulce_frontend /etc/nginx/sites-enabled/dulce_frontend
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo ""
echo "Listo. Abre en el navegador:  http://<IP elástica del frontend>/"
