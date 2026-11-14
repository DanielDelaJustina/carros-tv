// Servidor local só para testar. Rodar: node ferramentas/servidor.js
// Escuta em todas as interfaces, então a TV e o celular abrem por http://<IP do notebook>:5700
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const PORTA = Number(process.env.PORT) || 5700;

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const arquivo = path.join(RAIZ, url === '/' ? 'index.html' : url);
  if (!arquivo.startsWith(RAIZ)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(arquivo, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('não encontrado');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORTA, '0.0.0.0', () => {
  console.log('Carros TV em http://localhost:' + PORTA);
  const redes = os.networkInterfaces();
  Object.keys(redes).forEach((n) => redes[n].forEach((r) => {
    if (r.family === 'IPv4' && !r.internal) console.log('  na rede: http://' + r.address + ':' + PORTA + '/tv-teste.html  (' + n + ')');
  }));
});
