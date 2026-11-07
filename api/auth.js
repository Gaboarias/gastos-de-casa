'use strict';
const bcrypt = require('bcryptjs');
const { route, fail, bodyOf } = require('../lib/http');
const { getDb } = require('../lib/db');
const A = require('../lib/auth');

const DUMMY_HASH = bcrypt.hashSync('contraseña-de-relleno', 10);

module.exports = route(['GET', 'POST'], async (req, res) => {
  const db = await getDb();
  const users = db.collection('users');

  if (req.method === 'GET') {
    const u = await A.currentUser(req, db);
    if (!u) return { user: null, household: null };
    return A.describe(db, u);
  }

  const b = bodyOf(req);

  if (b.action === 'logout') {
    A.clear(res);
    return { ok: true };
  }

  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (b.action === 'signup') {
    const name = String(b.name || '').trim().slice(0, 40);
    if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Correo no válido');
    if (password.length < 8 || password.length > 200) throw fail(400, 'La contraseña debe tener al menos 8 caracteres');
    if (!name) throw fail(400, 'Escribe tu nombre');
    const max = Number(process.env.MAX_USERS) || 4;
    if ((await users.countDocuments({})) >= max) throw fail(403, 'Registro cerrado: ya se alcanzó el máximo de cuentas');
    const hash = await bcrypt.hash(password, 10);
    let id;
    try {
      const r = await users.insertOne({ email, name, hash, hid: null, hidAt: null, joinFails: 0, createdAt: new Date() });
      id = r.insertedId;
    } catch (e) {
      if (e && e.code === 11000) throw fail(409, 'Ese correo ya tiene cuenta');
      throw e;
    }
    await A.issue(res, id);
    return A.describe(db, await users.findOne({ _id: id }));
  }

  if (b.action === 'login') {
    const u = await users.findOne({ email });
    const ok = await bcrypt.compare(password, u ? u.hash : DUMMY_HASH);
    if (!u || !ok) throw fail(401, 'Correo o contraseña incorrectos');
    await A.issue(res, u._id);
    return A.describe(db, u);
  }

  throw fail(400, 'Acción no válida');
});
