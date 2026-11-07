'use strict';
const { route } = require('../lib/http');
const { getDb } = require('../lib/db');
const A = require('../lib/auth');

// Devuelve todo lo que esta persona puede ver: los documentos del hogar,
// su presupuesto privado (prefijo "~") y la lista de integrantes.
module.exports = route(['GET'], async (req) => {
  const db = await getDb();
  const { u, hh } = await A.requireHome(req, db);
  const rows = await db
    .collection('docs')
    .find({ scope: { $in: ['h:' + String(hh._id), 'u:' + String(u._id)] } }, { projection: { _id: 0, col: 1, id: 1, data: 1 } })
    .toArray();
  const people = await db
    .collection('users')
    .find({ _id: { $in: hh.members } }, { projection: { name: 1, hidAt: 1 } })
    .toArray();
  const docs = rows.map((r) => ({ col: r.col, id: r.id, data: r.data }));
  for (const p of people) {
    docs.push({ col: 'members', id: String(p._id), data: { name: p.name, joinedAt: p.hidAt ? new Date(p.hidAt).toISOString() : '' } });
  }
  docs.sort((a, b) => (a.col === b.col ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.col < b.col ? -1 : 1));
  return { docs };
});
