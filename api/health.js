'use strict';
const { route } = require('../lib/http');
const { getDb } = require('../lib/db');

// Comprueba que la función corre, que hay secretos y que MongoDB responde.
module.exports = route(['GET'], async () => {
  const db = await getDb();
  await db.command({ ping: 1 });
  return { ok: true, secret: !!(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32) };
});
