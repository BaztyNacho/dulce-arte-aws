/*
 * Configuración de Vite (la herramienta que compila React).
 *
 * En DESARROLLO (npm run dev) React corre en http://localhost:5173 y el "proxy"
 * reenvía /api, /admin, /media y /static al backend Django (por defecto http://localhost:8000).
 * Así el navegador ve una sola dirección, igual que en AWS con la API Gateway.
 *
 * En PRODUCCIÓN (npm run build) se genera la carpeta dist/ con archivos estáticos
 * (HTML, JS y CSS) que sirve Nginx en la EC2 del frontend.
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.BACKEND_URL || 'http://localhost:8000';
  const proxy = Object.fromEntries(
    ['/api', '/admin', '/media', '/static'].map((ruta) => [ruta, { target: backend, changeOrigin: false }]),
  );
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: { outDir: 'dist', assetsDir: 'assets' },
  };
});
