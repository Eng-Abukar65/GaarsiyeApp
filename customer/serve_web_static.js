const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'build', 'web');
const port = Number(process.env.PORT || 56301);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const decodedPath = decodeURIComponent(url.pathname);
    const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
    const filePath = path.normalize(path.join(root, requestedPath));

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const servePath = fs.existsSync(filePath)
      ? filePath
      : path.join(root, 'index.html');
    const ext = path.extname(servePath).toLowerCase();
    res.writeHead(200, {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(servePath).pipe(res);
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`Gaarsis web app running at http://127.0.0.1:${port}`);
  });
