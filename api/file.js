'use strict';
const crypto = require('crypto');
const { route, fail, bodyOf } = require('../lib/http');
const { getDb } = require('../lib/db');
const A = require('../lib/auth');

// Archivos del hogar (fotos o PDF de recibos). Se guardan en Mongo, colección `files`,
// y solo los ven los integrantes del hogar (misma cookie que el resto de la API).
const MAX_BYTES = 1500000; // ~1,5 MB por archivo; el cliente comprime las fotos antes
const MAX_FILES = 1000; // por hogar
const ID = /^[a-f0-9]{24}$/;
const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.slice(0, 5).toString('latin1') === '%PDF-',
};

const toBuf = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(x && x.buffer ? x.buffer : x));

module.exports = route(['GET', 'POST'], async (req, res) => {
  const db = await getDb();
  const { u, hh } = await A.requireHome(req, db);
  const scope = 'h:' + String(hh._id);
  const files = db.collection('files');

  if (req.method === 'GET') {
    const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
    if (!ID.test(id)) throw fail(400, 'Solicitud no válida');
    const f = await files.findOne({ _id: id, scope });
    if (!f) throw fail(404, 'Ese archivo ya no existe');
    const buf = toBuf(f.data);
    res.statusCode = 200;
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'self'");
    res.end(buf);
    return;
  }

  const b = bodyOf(req);
  if (b.op === 'delete') {
    if (typeof b.id !== 'string' || !ID.test(b.id)) throw fail(400, 'Solicitud no válida');
    await files.deleteOne({ _id: b.id, scope });
    return { ok: true };
  }
  if (b.op === 'put') {
    if (typeof b.mime !== 'string' || !MAGIC[b.mime] || typeof b.b64 !== 'string') throw fail(400, 'Tipo de archivo no permitido');
    if (b.b64.length > Math.ceil(MAX_BYTES / 3) * 4 + 8) throw fail(413, 'Archivo demasiado grande (máx. 1,5 MB)');
    const data = Buffer.from(b.b64, 'base64');
    if (!data.length || data.length > MAX_BYTES) throw fail(413, 'Archivo demasiado grande (máx. 1,5 MB)');
    if (!MAGIC[b.mime](data)) throw fail(400, 'El archivo no coincide con su tipo');
    if ((await files.countDocuments({ scope })) >= MAX_FILES) throw fail(507, 'Se alcanzó el límite de archivos del hogar');
    const id = crypto.randomBytes(12).toString('hex');
    await files.insertOne({ _id: id, scope, mime: b.mime, size: data.length, data, createdBy: String(u._id), createdAt: new Date() });
    return { ok: true, id, size: data.length };
  }
  throw fail(400, 'Operación no válida');
});
