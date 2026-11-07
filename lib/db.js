'use strict';
const { MongoClient } = require('mongodb');
const { fail } = require('./http');

// Una sola conexión por instancia de la función (se reutiliza entre peticiones).
function getDb() {
  if (!process.env.MONGODB_URI) throw fail(503, 'Falta conectar la base de datos (variable MONGODB_URI)');
  if (!global.__casaDb) {
    const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    global.__casaDb = client
      .connect()
      .then(async (c) => {
        const db = c.db(process.env.MONGODB_DB || 'casaenorden');
        await Promise.all([
          db.collection('users').createIndex({ email: 1 }, { unique: true }),
          db.collection('households').createIndex({ code: 1 }, { unique: true }),
          db.collection('docs').createIndex({ scope: 1, col: 1, id: 1 }, { unique: true }),
        ]);
        return db;
      })
      .catch((e) => {
        global.__casaDb = undefined;
        console.error('Mongo connect error:', e && e.message);
        throw fail(503, 'No se pudo conectar a MongoDB');
      });
  }
  return global.__casaDb;
}

module.exports = { getDb };
