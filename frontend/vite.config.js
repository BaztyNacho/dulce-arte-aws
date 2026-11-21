/*
 * Configuración de Vite (la herramienta que compila React).
 *
 * En DESARROLLO (npm run dev) React corre en http://localhost:5173 y el "proxy"
 * reenvía /api, /admin, /media y /static al backend Django (por defecto http://localhost:8000).
 * Así el navegador ve una sola dirección, igual que en AWS con la API Gateway.
 *
 * En PRODUCCIÓN (npm run build) se genera la carpeta dist/. Los archivos JS, CSS e imágenes
 * se suben a S3 (static/app/) y la API Gateway los entrega desde ahí; la EC2 del frontend
 * solo entrega index.html. Por eso, al compilar, las rutas de los archivos empiezan con /static/app/.
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.BACKEND_URL || 'http://localhost:8000';
  const proxy = Object.fromEntries(
    ['/api', '/admin', '/media', '/static'].map((ruta) => [ruta, { target: backend, changeOrigin: false }]),
  );
  return {
    base: command === 'build' ? '/static/app/' : '/',
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: { outDir: 'dist', assetsDir: 'assets' },
  };
});
