/* Project Board — tiny local server (no dependencies).
 *
 *   node server.js            -> http://localhost:5173/feature-release-manager.html
 *   node server.js 8080       -> same, on port 8080
 *
 * It serves the files in this folder and, unlike Live Server, accepts the board's
 * saves: POST /api/save-sheet writes data/project-board.xlsx, so imports and edits
 * update the sheet automatically with no file dialog.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const PAGE = 'projects_board.html';
const SHEET = path.join(ROOT, 'data', 'project-board.xlsx');
const MAX_BODY = 25 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function saveSheet(req, res) {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BODY) { send(res, 413, 'Sheet too large'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    const data = Buffer.concat(chunks);
    if (!data.length) return send(res, 400, 'Empty body');
    try {
      fs.mkdirSync(path.dirname(SHEET), { recursive: true });
      if (fs.existsSync(SHEET)) fs.copyFileSync(SHEET, SHEET + '.bak');   // keep one previous copy
      fs.writeFileSync(SHEET, data);
      console.log(new Date().toLocaleTimeString(), `saved data/project-board.xlsx (${data.length} bytes)`);
      send(res, 200, JSON.stringify({ ok: true, bytes: data.length }), 'application/json');
    } catch (err) {
      console.error('save failed:', err.message);
      send(res, 500, err.message);
    }
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/save-sheet') {
    if (req.method !== 'POST') return send(res, 405, 'Use POST');
    return saveSheet(req, res);
  }
  if (url.pathname === '/api/ping') return send(res, 200, JSON.stringify({ ok: true }), 'application/json');

  // static files, restricted to this folder
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || PAGE;
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Last-Modified': st.mtime.toUTCString(),   // the board shows this as the sheet's update date
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, () => {
  console.log(`Project Board running:  http://localhost:${PORT}/${PAGE}`);
  console.log('Imports and edits save straight into data/project-board.xlsx. Press Ctrl+C to stop.');
});
