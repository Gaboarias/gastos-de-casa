'use strict';
const { SignJWT, jwtVerify } = require('jose');
const { ObjectId } = require('mongodb');
const { fail } = require('./http');

const COOKIE = 'ceo_session';
const MAX_AGE = 60 * 60 * 24 * 30;

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw fail(503, 'Falta configurar AUTH_SECRET');
  return new TextEncoder().encode(s);
}

async function issue(res, uid) {
  const token = await new SignJWT({ uid: String(uid) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey());
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
}

function clear(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function cookieOf(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

async function currentUser(req, db) {
  const token = cookieOf(req, COOKIE);
  if (!token) return null;
  let uid;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    uid = new ObjectId(String(payload.uid));
  } catch (e) {
    if (e && e.status) throw e;
    return null;
  }
  return db.collection('users').findOne({ _id: uid });
}

async function describe(db, u) {
  let household = null;
  if (u.hid) {
    const h = await db.collection('households').findOne({ _id: u.hid });
    if (h) household = { id: String(h._id), code: h.code, members: h.members.map(String) };
  }
  return { user: { id: String(u._id), email: u.email, name: u.name }, household };
}

// Exige sesión y hogar; devuelve usuario y hogar.
async function requireHome(req, db) {
  const u = await currentUser(req, db);
  if (!u) throw fail(401, 'Inicia sesión');
  if (!u.hid) throw fail(403, 'Aún no tienes hogar');
  const hh = await db.collection('households').findOne({ _id: u.hid });
  if (!hh || !hh.members.some((m) => String(m) === String(u._id))) throw fail(403, 'Aún no tienes hogar');
  return { u, hh };
}

module.exports = { issue, clear, currentUser, describe, requireHome };
