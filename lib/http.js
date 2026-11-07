'use strict';

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Envuelve un handler: método permitido, JSON obligatorio en escrituras (frena CSRF
// de formularios), sin caché y errores con formato uniforme.
function route(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        return send(res, 405, { error: 'Método no permitido' });
      }
      if (req.method !== 'GET') {
        const ct = String(req.headers['content-type'] || '').toLowerCase();
        if (!ct.startsWith('application/json')) return send(res, 415, { error: 'Tipo de contenido no válido' });
      }
      const out = await fn(req, res);
      if (!res.writableEnded) send(res, 200, out === undefined ? { ok: true } : out);
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      if (status >= 500) console.error('API error:', e && e.message);
      if (!res.writableEnded) send(res, status, { error: status === 500 ? 'Error del servidor' : e.message });
    }
  };
}

function bodyOf(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Array.isArray(b)) return b;
  throw fail(400, 'Solicitud no válida');
}

module.exports = { fail, send, route, bodyOf };
