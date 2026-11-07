'use strict';
// Servidor de prueba local: sirve index.html y las funciones de /api con un MongoDB falso en memoria.
// Solo para pruebas; en producción corre el driver real de MongoDB.
const path = require('path');
const fs = require('fs');
const http = require('http');
const root = path.join(__dirname, '..');
const real = require(path.join(root, 'node_modules/mongodb'));
const { ObjectId } = real;

const store = {};
const UNIQ = { users: ['email'], households: ['code'], docs: ['scope', 'col', 'id'] };
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const eq = (a, b) => (a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a === b);
function match(doc, f) {
  return Object.entries(f).every(([k, v]) => {
    const val = get(doc, k);
    if (v && typeof v === 'object' && !(v instanceof ObjectId) && !(v instanceof Date)) {
      if ('$in' in v) return v.$in.some((x) => eq(x, val));
      if ('$exists' in v) return (val !== undefined) === v.$exists;
      throw new Error('fake: operador no soportado ' + JSON.stringify(v));
    }
    return eq(val, v);
  });
}
function setPath(o, p, v) {
  const ks = p.split('.');
  let c = o;
  for (let i = 0; i < ks.length - 1; i++) c = c[ks[i]] = c[ks[i]] || {};
  c[ks[ks.length - 1]] = v;
}
function applyUpdate(doc, u) {
  for (const [k, v] of Object.entries(u.$set || {})) setPath(doc, k, v);
  for (const [k, v] of Object.entries(u.$addToSet || {})) {
    doc[k] = doc[k] || [];
    if (!doc[k].some((x) => eq(x, v))) doc[k].push(v);
  }
  for (const [k, v] of Object.entries(u.$inc || {})) doc[k] = (doc[k] || 0) + v;
}
function project(d, p) {
  if (!p) return { ...d };
  const inc = Object.keys(p).filter((k) => p[k] === 1);
  const out = {};
  if (inc.length) inc.forEach((k) => d[k] !== undefined && (out[k] = d[k]));
  else Object.assign(out, d);
  if (p._id !== 0 && inc.length) out._id = d._id;
  if (p._id === 0) delete out._id;
  return out;
}
class Coll {
  constructor(n) { this.n = n; store[n] = store[n] || []; this.a = store[n]; }
  async createIndex() {}
  _dup(doc) {
    const keys = UNIQ[this.n];
    return keys && this.a.some((x) => keys.every((k) => eq(x[k], doc[k])));
  }
  async insertOne(doc) {
    if (this._dup(doc)) { const e = new Error('dup'); e.code = 11000; throw e; }
    const d = { _id: new ObjectId(), ...doc };
    this.a.push(d);
    return { insertedId: d._id };
  }
  async findOne(f) { const d = this.a.find((x) => match(x, f)); return d ? { ...d } : null; }
  find(f, o = {}) { return { toArray: async () => this.a.filter((x) => match(x, f)).map((d) => project(d, o.projection)) }; }
  async countDocuments(f) { return this.a.filter((x) => match(x, f)).length; }
  async updateOne(f, u) { const d = this.a.find((x) => match(x, f)); if (d) applyUpdate(d, u); return { matchedCount: d ? 1 : 0 }; }
  async findOneAndUpdate(f, u) { const d = this.a.find((x) => match(x, f)); if (!d) return null; applyUpdate(d, u); return { ...d }; }
  async replaceOne(f, doc, o = {}) {
    const i = this.a.findIndex((x) => match(x, f));
    if (i >= 0) { this.a[i] = { _id: this.a[i]._id, ...doc }; return { matchedCount: 1 }; }
    if (o.upsert) this.a.push({ _id: new ObjectId(), ...doc });
    return { matchedCount: 0 };
  }
  async deleteOne(f) { const i = this.a.findIndex((x) => match(x, f)); if (i >= 0) this.a.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; }
}
class FakeClient {
  async connect() { return this; }
  db() { return { collection: (n) => new Coll(n), command: async () => ({ ok: 1 }) }; }
}
require.cache[require.resolve(path.join(root, 'node_modules/mongodb'))].exports = { ...real, MongoClient: FakeClient };

process.env.MONGODB_URI = 'fake://';
process.env.AUTH_SECRET = 'prueba-local-prueba-local-prueba-local-123456';
process.env.MAX_USERS = '4';

const handlers = {};
for (const f of fs.readdirSync(path.join(root, 'api'))) handlers[f.replace(/\.js$/, '')] = require(path.join(root, 'api', f));
const html = fs.readFileSync(path.join(root, 'index.html'));

const PORT = Number(process.env.PORT) || 3999;
http
  .createServer((req, res) => {
    const origSet = res.setHeader.bind(res);
    res.setHeader = (k, v) => origSet(k, k.toLowerCase() === 'set-cookie' ? String(v).replace('; Secure', '') : v); // http local
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/' || u.pathname === '/index.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    }
    const m = u.pathname.match(/^\/api\/([a-z]+)$/);
    if (!m || !handlers[m[1]]) { res.statusCode = 404; return res.end('no'); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (raw && String(req.headers['content-type'] || '').includes('application/json')) {
        try { req.body = JSON.parse(raw); } catch (e) { req.body = undefined; }
      }
      handlers[m[1]](req, res);
    });
  })
  .listen(PORT, () => console.log('listo en', PORT));
