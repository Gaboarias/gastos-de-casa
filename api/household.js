'use strict';
const crypto = require('crypto');
const { route, fail, bodyOf } = require('../lib/http');
const { getDb } = require('../lib/db');
const A = require('../lib/auth');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

module.exports = route(['POST'], async (req) => {
  const db = await getDb();
  const u = await A.currentUser(req, db);
  if (!u) throw fail(401, 'Inicia sesión');
  const users = db.collection('users');
  const homes = db.collection('households');
  const b = bodyOf(req);

  if (u.hid) return A.describe(db, u); // ya tiene hogar

  if (b.action === 'create') {
    let home = null;
    for (let i = 0; i < 6 && !home; i++) {
      try {
        const r = await homes.insertOne({ code: newCode(), members: [u._id], createdAt: new Date() });
        home = r.insertedId;
      } catch (e) {
        if (!(e && e.code === 11000)) throw e;
      }
    }
    if (!home) throw fail(500, 'No se pudo crear el hogar');
    await users.updateOne({ _id: u._id }, { $set: { hid: home, hidAt: new Date() } });
    return A.describe(db, await users.findOne({ _id: u._id }));
  }

  if (b.action === 'join') {
    if ((u.joinFails || 0) >= 10) throw fail(429, 'Demasiados intentos con códigos incorrectos');
    const code = String(b.code || '').trim().toUpperCase();
    const home = code.length === 6 ? await homes.findOne({ code }) : null;
    if (!home) {
      await users.updateOne({ _id: u._id }, { $inc: { joinFails: 1 } });
      throw fail(404, 'Ese código no existe');
    }
    const r = await homes.updateOne({ _id: home._id, 'members.1': { $exists: false } }, { $addToSet: { members: u._id } });
    if (!r.matchedCount) throw fail(409, 'Ese hogar ya tiene 2 personas');
    await users.updateOne({ _id: u._id }, { $set: { hid: home._id, hidAt: new Date() } });
    return A.describe(db, await users.findOne({ _id: u._id }));
  }

  throw fail(400, 'Acción no válida');
});
