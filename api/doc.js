'use strict';
const { route, fail, bodyOf } = require('../lib/http');
const { getDb } = require('../lib/db');
const A = require('../lib/auth');

const SHARED = /^(inventory|bills|payments|expenses|settlements)$/;
const PRIVATE = /^~(budget\/entries)?$/; // "~" = documento del presupuesto; "~budget/entries" = movimientos
const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const FIELD = /^[A-Za-z0-9_]{1,40}$/;
const MAX_DOC_CHARS = 20000;
const MAX_DOCS_PER_SCOPE = 20000;

function scopeFor(u, hh, col, id) {
  if (typeof col !== 'string' || typeof id !== 'string' || !ID.test(id)) throw fail(400, 'Solicitud no válida');
  if (SHARED.test(col)) return 'h:' + String(hh._id); // lo ven las dos personas del hogar
  if (PRIVATE.test(col)) {
    if (col === '~' && id !== 'budget') throw fail(400, 'Solicitud no válida');
    return 'u:' + String(u._id); // solo esta persona
  }
  throw fail(400, 'Colección no permitida');
}

function clean(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw fail(400, 'Datos no válidos');
  const s = JSON.stringify(d);
  if (s.length > MAX_DOC_CHARS) throw fail(413, 'Documento demasiado grande');
  return JSON.parse(s);
}

module.exports = route(['POST'], async (req) => {
  const db = await getDb();
  const { u, hh } = await A.requireHome(req, db);
  const b = bodyOf(req);
  const scope = scopeFor(u, hh, b.col, b.id);
  const { col, id } = b;
  const docs = db.collection('docs');
  const key = { scope, col, id };

  if (b.op === 'delete') {
    await docs.deleteOne(key);
    return { ok: true };
  }

  const data = clean(b.data);

  if (b.op === 'set') {
    if ((await docs.countDocuments({ scope })) > MAX_DOCS_PER_SCOPE) throw fail(507, 'Se alcanzó el límite de documentos');
    await docs.replaceOne(key, { ...key, data, updatedAt: new Date() }, { upsert: true });
    return { ok: true, data };
  }

  if (b.op === 'update') {
    const $set = { updatedAt: new Date() };
    for (const k of Object.keys(data)) {
      if (!FIELD.test(k)) throw fail(400, 'Campo no válido');
      $set['data.' + k] = data[k];
    }
    const after = await docs.findOneAndUpdate(key, { $set }, { returnDocument: 'after' });
    if (!after) throw fail(404, 'Ese registro ya no existe');
    return { ok: true, data: after.data };
  }

  throw fail(400, 'Operación no válida');
});
