/*
 * Sube los archivos compilados de React (JS, CSS, imágenes) a Amazon S3: static/app/
 * La API Gateway los entrega desde S3 en  /static/app/...  y la EC2 del frontend
 * solo entrega index.html (la "puerta" de la aplicación).
 *
 * Uso:  node deploy/subir_a_s3.mjs <carpeta-compilada>      (lo llama deploy/publicar.sh)
 * Necesita:  S3_BUCKET en frontend/.env  y el rol LabInstanceProfile en la EC2.
 * Agrega  --prueba  para ver qué subiría sin subir nada.
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const [carpeta, opcion] = process.argv.slice(2);
const bucket = process.env.S3_BUCKET;
const prueba = opcion === '--prueba';
if (!carpeta || (!bucket && !prueba)) {
  console.error('Uso: S3_BUCKET=<bucket> node deploy/subir_a_s3.mjs <carpeta> [--prueba]');
  process.exit(1);
}

const TIPOS = {
  '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.map': 'application/json',
};

async function archivos(dir) {
  const lista = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) lista.push(...await archivos(ruta));
    else lista.push(ruta);
  }
  return lista;
}

const todos = (await archivos(carpeta)).filter((ruta) => !ruta.endsWith(`${sep}index.html`) && !ruta.endsWith('index.html'));
let cliente = null;
let PutObjectCommand = null;
if (!prueba) {
  ({ S3Client: cliente, PutObjectCommand } = await import('@aws-sdk/client-s3'));
  cliente = new cliente({ region: process.env.AWS_REGION || 'us-east-1' });   // credenciales: rol de la EC2
}

for (const ruta of todos) {
  const nombre = relative(carpeta, ruta).split(sep).join('/');
  const clave = `static/app/${nombre}`;
  const tipo = TIPOS[extname(ruta).toLowerCase()] || 'application/octet-stream';
  // Los archivos de assets/ llevan una huella en el nombre: se pueden guardar en caché un año
  const cache = nombre.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
  if (prueba) {
    console.log(`(prueba) ${clave}  ${tipo}  ${cache}`);
    continue;
  }
  await cliente.send(new PutObjectCommand({
    Bucket: bucket, Key: clave, Body: await readFile(ruta), ContentType: tipo, CacheControl: cache,
  }));
  console.log(`subido  s3://${bucket}/${clave}`);
}
console.log(`${todos.length} archivos ${prueba ? 'se subirían' : 'subidos'} a static/app/`);
