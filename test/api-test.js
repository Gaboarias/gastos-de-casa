'use strict';
const B = 'http://localhost:' + (process.env.PORT || 3999);
let fails = 0, total = 0;
const ok = (c, msg) => { total++; if (!c) { fails++; console.log('FALLA:', msg); } };

function client() {
  let cookie = '';
  const call = async (path, body, opts = {}) => {
    const r = await fetch(B + '/api/' + path, {
      method: body !== undefined || opts.method === 'POST' ? 'POST' : 'GET',
      headers: { ...(opts.noJson ? { 'content-type': 'text/plain' } : body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? (opts.noJson ? 'x' : JSON.stringify(body)) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j };
  };
  call.cookieHeader = () => cookie;
  return call;
}

(async () => {
  const anon = client(), A = client(), Bc = client(), C = client(), D = client(), E = client();

  let r = await anon('health'); ok(r.s === 200 && r.j.ok && r.j.secret, 'health');
  r = await anon('sync'); ok(r.s === 401, 'sync sin sesión = 401');
  r = await anon('doc', { op: 'set', col: 'inventory', id: 'a', data: {} }); ok(r.s === 401, 'doc sin sesión = 401');
  r = await anon('auth', { action: 'signup', email: 'x@x.com', password: 'corta', name: 'X' }); ok(r.s === 400, 'contraseña corta rechazada');
  r = await anon('auth', { action: 'signup', email: 'malcorreo', password: 'larga-larga', name: 'X' }); ok(r.s === 400, 'correo inválido rechazado');
  r = await anon('auth', { action: 'signup', email: 'x@x.com', password: 'larga-larga', name: 'X' }, { noJson: true }); ok(r.s === 415, 'POST sin JSON = 415');

  r = await A('auth', { action: 'signup', email: 'Gabo@Casa.com', password: 'clave-segura-1', name: 'Gabo' }); ok(r.s === 200 && r.j.user.name === 'Gabo' && !r.j.household, 'signup A');
  r = await A('auth', { action: 'signup', email: 'gabo@casa.com', password: 'clave-segura-1', name: 'Otro' }); ok(r.s === 409, 'correo duplicado (sin importar mayúsculas)');
  r = await A('sync'); ok(r.s === 403, 'sync sin hogar = 403');
  r = await A('household', { action: 'create' }); ok(r.s === 200 && /^[A-Z2-9]{6}$/.test(r.j.household.code), 'crear hogar');
  const code = r.j.household.code;
  r = await A('auth'); ok(r.s === 200 && r.j.household.code === code, 'GET auth devuelve hogar');

  r = await Bc('auth', { action: 'signup', email: 'ana@casa.com', password: 'clave-segura-2', name: 'Ana' }); ok(r.s === 200, 'signup B');
  r = await Bc('household', { action: 'join', code: 'ZZZZZZ' }); ok(r.s === 404, 'código malo = 404');
  r = await Bc('household', { action: 'join', code: code.toLowerCase() }); ok(r.s === 200 && r.j.household.members.length === 2, 'unirse con código (minúsculas)');

  r = await C('auth', { action: 'signup', email: 'tercera@casa.com', password: 'clave-segura-3', name: 'Tercera' }); ok(r.s === 200, 'signup C');
  r = await C('household', { action: 'join', code }); ok(r.s === 409, 'hogar lleno = 409');

  // Datos compartidos
  r = await A('doc', { op: 'set', col: 'inventory', id: 'i1', data: { name: 'Arroz', qty: 3 } }); ok(r.s === 200 && r.j.data.qty === 3, 'A escribe inventario');
  r = await Bc('sync'); ok(r.j.docs.some((d) => d.col === 'inventory' && d.id === 'i1' && d.data.name === 'Arroz'), 'B ve el inventario de A');
  r = await Bc('doc', { op: 'update', col: 'inventory', id: 'i1', data: { qty: 1, updatedAt: 'x' } }); ok(r.s === 200 && r.j.data.qty === 1 && r.j.data.name === 'Arroz', 'update mezcla campos');
  r = await A('sync'); ok(r.j.docs.find((d) => d.id === 'i1').data.qty === 1, 'A ve el cambio de B');
  r = await A('doc', { op: 'update', col: 'inventory', id: 'noexiste', data: { qty: 1 } }); ok(r.s === 404, 'update de algo inexistente = 404');
  r = await A('doc', { op: 'set', col: 'expenses', id: 'e1', data: { amount: 45000, paidBy: 'x' } }); ok(r.s === 200, 'gasto compartido');
  r = await A('doc', { op: 'set', col: 'notes', id: 'n1', data: { title: 'Pendientes', text: 'Llamar al fontanero' } }); ok(r.s === 200, 'nota compartida');
  r = await Bc('sync'); ok(r.j.docs.some((d) => d.col === 'notes' && d.id === 'n1' && d.data.text === 'Llamar al fontanero'), 'B ve la nota de A');

  // Integrantes
  r = await A('sync'); const mem = r.j.docs.filter((d) => d.col === 'members'); ok(mem.length === 2 && mem.some((m) => m.data.name === 'Ana'), 'lista de integrantes con nombres');
  r = await A('doc', { op: 'set', col: 'members', id: 'zzz', data: { name: 'Falso' } }); ok(r.s === 400, 'no se puede escribir en members');
  r = await A('doc', { op: 'set', col: 'users', id: 'zzz', data: {} }); ok(r.s === 400, 'colección no permitida');
  r = await A('doc', { op: 'set', col: 'inventory', id: 'a/b', data: {} }); ok(r.s === 400, 'id con / rechazado');
  r = await A('doc', { op: 'set', col: 'inventory', id: 'big', data: { x: 'y'.repeat(21000) } }); ok(r.s === 413, 'documento enorme = 413');
  r = await A('doc', { op: 'set', col: 'inventory', id: 'arr', data: [1, 2] }); ok(r.s === 400, 'array como documento rechazado');
  r = await A('doc', { op: 'update', col: 'inventory', id: 'i1', data: { 'a.b': 1 } }); ok(r.s === 400, 'campo con punto rechazado');

  // Privacidad del presupuesto
  r = await A('doc', { op: 'set', col: '~', id: 'budget', data: { income: 900000 } }); ok(r.s === 200, 'A guarda presupuesto');
  r = await A('doc', { op: 'set', col: '~budget/entries', id: 'p1', data: { amount: 5000, desc: 'secreto de A' } }); ok(r.s === 200, 'A guarda movimiento');
  r = await A('doc', { op: 'set', col: '~', id: 'otro', data: {} }); ok(r.s === 400, 'solo budget en "~"');
  r = await Bc('sync'); ok(!r.j.docs.some((d) => d.col.startsWith('~')), 'B NO ve nada privado de A');
  r = await Bc('doc', { op: 'set', col: '~', id: 'budget', data: { income: 111 } }); ok(r.s === 200, 'B guarda su propio presupuesto');
  r = await A('sync'); const bud = r.j.docs.find((d) => d.col === '~' && d.id === 'budget'); ok(bud && bud.data.income === 900000, 'A conserva el suyo (no lo pisó B)');
  r = await Bc('doc', { op: 'delete', col: '~budget/entries', id: 'p1' }); r = await A('sync'); ok(r.j.docs.some((d) => d.col === '~budget/entries' && d.id === 'p1'), 'B no puede borrar el movimiento de A');

  // Archivos (recibos)
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const rawGet = async (cl, path) => { const c = cl.cookieHeader(); return fetch(B + '/api/' + path, { headers: c ? { cookie: c } : {} }); };
  r = await A('file', { op: 'put', mime: 'image/png', b64: PNG }); ok(r.s === 200 && /^[a-f0-9]{24}$/.test(r.j.id || ''), 'A sube un recibo');
  const fid = r.j.id;
  let g = await rawGet(Bc, 'file?id=' + fid); ok(g.status === 200 && g.headers.get('content-type') === 'image/png' && (await g.arrayBuffer()).byteLength === 70, 'B descarga el recibo de A');
  g = await rawGet(anon, 'file?id=' + fid); ok(g.status === 401, 'recibo sin sesión = 401');
  r = await A('file', { op: 'put', mime: 'image/jpeg', b64: PNG }); ok(r.s === 400, 'tipo que no coincide = 400');
  r = await A('file', { op: 'put', mime: 'text/html', b64: PNG }); ok(r.s === 400, 'tipo no permitido = 400');
  r = await A('file', { op: 'put', mime: 'image/png', b64: 'A'.repeat(2100000) }); ok(r.s === 413, 'archivo enorme = 413');
  g = await rawGet(A, 'file?id=zzz'); ok(g.status === 400, 'id de archivo inválido = 400');

  // Lectura del recibo (OCR; la API de Claude está simulada en test/server.js)
  r = await anon('ocr', { mime: 'image/png', b64: PNG }); ok(r.s === 401, 'ocr sin sesión = 401');
  r = await A('ocr', { mime: 'text/html', b64: PNG }); ok(r.s === 400, 'ocr tipo no permitido = 400');
  r = await A('ocr', { mime: 'image/png', b64: 'A'.repeat(2100000) }); ok(r.s === 413, 'ocr archivo enorme = 413');
  r = await A('ocr', { mime: 'image/png', b64: PNG }); ok(r.s === 200 && r.j.amount === 12345 && r.j.desc === 'Automercado' && r.j.date === '2026-11-08', 'ocr devuelve total, comercio y fecha');
  r = await A('ocr', { mime: 'application/pdf', b64: Buffer.from('%PDF-1.4 prueba').toString('base64') }); ok(r.s === 502 && /No se pudo leer/.test(r.j.error), 'ocr con respuesta ilegible = error limpio');

  // Otro hogar
  r = await D('auth', { action: 'signup', email: 'vecino@casa.com', password: 'clave-segura-4', name: 'Vecino' }); ok(r.s === 200, 'signup D');
  r = await D('household', { action: 'create' }); ok(r.s === 200 && r.j.household.code !== code, 'D crea otro hogar');
  r = await D('sync'); ok(!r.j.docs.some((d) => d.col === 'inventory' || d.col === 'expenses'), 'otro hogar no ve datos de A y B');
  g = await rawGet(D, 'file?id=' + fid); ok(g.status === 404, 'otro hogar no ve el recibo');
  r = await E('auth', { action: 'signup', email: 'quinta@casa.com', password: 'clave-segura-5', name: 'Quinta' }); ok(r.s === 403, 'registro cerrado al llegar al máximo');

  // Login / logout
  const L = client();
  r = await L('auth', { action: 'login', email: 'ana@casa.com', password: 'mala-mala-mala' }); ok(r.s === 401 && /incorrectos/.test(r.j.error), 'login con clave mala');
  r = await L('auth', { action: 'login', email: 'nadie@casa.com', password: 'mala-mala-mala' }); ok(r.s === 401 && /incorrectos/.test(r.j.error), 'login con correo inexistente: mismo mensaje');
  r = await L('auth', { action: 'login', email: 'ANA@casa.com', password: 'clave-segura-2' }); ok(r.s === 200 && r.j.household && r.j.user.name === 'Ana', 'login correcto');
  r = await L('sync'); ok(r.s === 200, 'sesión tras login');
  r = await L('auth', { action: 'logout' }); r = await L('sync'); ok(r.s === 401, 'tras logout no hay sesión');

  // Borrado
  r = await A('doc', { op: 'delete', col: 'inventory', id: 'i1' }); r = await Bc('sync'); ok(!r.j.docs.some((d) => d.id === 'i1'), 'borrado visible para B');
  r = await Bc('file', { op: 'delete', id: fid }); g = await rawGet(A, 'file?id=' + fid); ok(r.s === 200 && g.status === 404, 'recibo borrado');

  console.log(fails ? `${fails} FALLAS de ${total}` : `API OK: ${total} comprobaciones`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
