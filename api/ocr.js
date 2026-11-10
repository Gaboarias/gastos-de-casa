'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const { route, fail, bodyOf } = require('../lib/http');
const { getDb } = require('../lib/db');
const A = require('../lib/auth');

// Lectura automática del recibo (OCR) con la API de Claude: devuelve total, comercio y fecha
// para rellenar el formulario de gasto. Solo integrantes del hogar. El archivo no se guarda aquí.
const MAX_BYTES = 1500000;
const MIMES = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const MODEL = process.env.OCR_MODEL || 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  properties: {
    amount: { type: 'number', description: 'Total pagado en colones, sin separadores. 0 si no se distingue o no está en colones.' },
    desc: { type: 'string', description: 'Nombre corto del comercio (p. ej. "Automercado", "Walmart"). Cadena vacía si no se ve.' },
    date: { type: 'string', description: 'Fecha del recibo en formato YYYY-MM-DD. Cadena vacía si no se ve.' },
  },
  required: ['amount', 'desc', 'date'],
  additionalProperties: false,
};

const SYSTEM =
  'Lees recibos de compras (supermercado, farmacia, ferretería…) de Costa Rica para una app de gastos del hogar. ' +
  'Devuelve el total final pagado en colones (el monto más grande marcado como TOTAL, no el subtotal ni el cambio), ' +
  'el nombre corto del comercio y la fecha del recibo. Si algo no se distingue, deja 0 o cadena vacía; no inventes.';

function parseOut(msg) {
  const t = (msg.content || []).find((b) => b.type === 'text');
  if (!t) throw fail(502, 'No se pudo leer el recibo');
  let j;
  try { j = JSON.parse(t.text); } catch (e) { throw fail(502, 'No se pudo leer el recibo'); }
  const amount = Number.isFinite(j.amount) && j.amount > 0 ? Math.round(j.amount) : null;
  const desc = typeof j.desc === 'string' ? j.desc.trim().slice(0, 60) : '';
  const date = typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) && !Number.isNaN(Date.parse(j.date)) ? j.date : null;
  return { amount, desc: desc || null, date };
}

module.exports = route(['POST'], async (req) => {
  const db = await getDb();
  await A.requireHome(req, db);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw fail(503, 'Falta configurar la lectura de recibos');

  const b = bodyOf(req);
  if (typeof b.mime !== 'string' || !MIMES.test(b.mime) || typeof b.b64 !== 'string') throw fail(400, 'Tipo de archivo no permitido');
  if (b.b64.length > Math.ceil(MAX_BYTES / 3) * 4 + 8) throw fail(413, 'Archivo demasiado grande (máx. 1,5 MB)');
  const size = Buffer.from(b.b64, 'base64').length;
  if (!size || size > MAX_BYTES) throw fail(413, 'Archivo demasiado grande (máx. 1,5 MB)');

  const block = b.mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.b64 } }
    : { type: 'image', source: { type: 'base64', media_type: b.mime, data: b.b64 } };

  const client = new Anthropic({ apiKey: key, timeout: 45000, maxRetries: 1 });
  let msg;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Lee este recibo.' }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw fail(503, 'La clave de lectura de recibos no es válida');
    if (e instanceof Anthropic.RateLimitError) throw fail(429, 'Demasiadas lecturas seguidas, intenta en un momento');
    if (e instanceof Anthropic.BadRequestError) throw fail(400, 'No se pudo leer ese archivo');
    if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.APIError) throw fail(503, 'No se pudo leer el recibo, intenta de nuevo');
    throw e;
  }
  if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') throw fail(502, 'No se pudo leer el recibo');
  return { ok: true, ...parseOut(msg) };
});
