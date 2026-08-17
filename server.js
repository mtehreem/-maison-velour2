// Maison Velour — local dev server
// Serves the static site AND the API, backed by Supabase.
// The API logic lives in api-handler.js, shared with the Vercel serverless
// function (api/[[...slug]].js), so behavior is identical in both places.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./api-handler');

const PORT = process.env.PORT || 4321;
const STATIC_ROOT = __dirname;
const MIME = {
  '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.ico':'image/x-icon'
};

function send(res, code, data){
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

function serveStatic(res, pathname){
  let rel = pathname === '/' ? 'maison-velour.html' : pathname.replace(/^\/+/, '');
  const file = path.join(STATIC_ROOT, rel);
  if(!file.startsWith(STATIC_ROOT)) return send(res, 403, { ok:false, error:'Forbidden' });
  fs.readFile(file, (err, buf) => {
    if(err) return send(res, 404, { ok:false, error:'Not found' });
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const method = req.method;

  // Static files (serve the site from the same server in dev)
  if(method === 'GET' && !p.startsWith('/api')){
    return serveStatic(res, p);
  }
  // Everything under /api goes to the shared handler
  await handleApi(req, res);
});

server.listen(PORT, () => console.log(`Maison Velour dev server running at http://localhost:${PORT}`));
