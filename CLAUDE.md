# Casa en Orden (v9) — traspaso a Claude Code

Responde en español, directo y conciso. Cada cambio al HTML sube el número de versión (hoy `v9`, span `.ver` en `index.html`).

## Objetivo
App pequeña del hogar (2 cuentas por hogar): despensa/inventario, recibos compartidos (alquiler, servicios), gastos compartidos (súper y otros) con balance, presupuesto personal **privado** por persona, notas compartidas, foto/PDF del recibo en cada gasto y lectura automática del recibo (OCR) que rellena monto, comercio y fecha: por defecto en el propio navegador con Tesseract (tesseract.js) y pdf.js, sin clave ni costo; si existe `ANTHROPIC_API_KEY`, se usa la API de Claude por ser más precisa. Va en Vercel con MongoDB, login propio con correo y contraseña.

## Estado (2026-11-06: desplegado y verificado)
- Repo: `github.com/Gaboarias/gastos-de-casa` (rama `main`). Cada push a `main` despliega solo.
- Vercel: proyecto `gastos-de-casa` en el equipo `garias1989-2231s-projects`. Producción: **https://gastos-de-casa-black.vercel.app** (`/api/health` → `{"ok":true,"secret":true}`).
- MongoDB: instalado desde el Marketplace de Vercel (`npx vercel integration add mongodbatlas`), recurso `atlas-champagne-fence`; la integración pone `MONGODB_URI` sola. No hay cuenta de Atlas aparte.
- Variables en Vercel (Production y Preview): `MONGODB_URI` (integración), `AUTH_SECRET` (sensible), `MAX_USERS=2`, `ANTHROPIC_API_KEY` (opcional, sensible; la pone el usuario desde console.anthropic.com; hoy no está y la lectura de recibos corre en el navegador) y opcional `OCR_MODEL` (por defecto `claude-opus-5-5`; `claude-haiku-5-5` es más barato).
- Verificado en producción con 2 cuentas de prueba (18 comprobaciones: hogar + código, despensa y gasto sincronizados, presupuesto privado invisible para el otro, tercera cuenta rechazada). Las cuentas de prueba ya se borraron; la base está vacía.
- Las URLs de despliegue `*-garias1989-2231s-projects.vercel.app` piden login de Vercel; el dominio de producción no.

## Cómo operar
- El conector MCP de Vercel de esta cuenta devuelve 403 al crear proyectos/integraciones: usar el CLI, `npx vercel <cmd> --scope garias1989-2231s-projects` (login por dispositivo con `npx vercel login`).
- Para subir una cuenta más: `npx vercel env rm MAX_USERS production` y volver a añadirla con el nuevo valor, luego redeploy. Para liberar un cupo borra el usuario en la colección `users` (y su hogar/docs si aplica).
- Si `/api/health` falla: 503 "Falta conectar la base de datos" = falta `MONGODB_URI`; 503 "No se pudo conectar a MongoDB" = revisar la integración en el panel de Vercel (Storage).
- Logs: `npx vercel logs <url>` o `get_runtime_errors`.

## Arquitectura
- `index.html`: SPA estática sin build (JS/CSS inline, ~64 KB). Pestañas Despensa / Recibos / Gastos / Presupuesto / Notas. Generada desde un artifact de claude.ai; el código del cliente que habla con la API está en `client-block.js`.
- `api/*.js`: funciones serverless Node (CommonJS), `mongodb@6.10.0`, `bcryptjs@2.4.3`, `jose@5.9.6`, `@anthropic-ai/sdk@1.7.0`, node ≥20.
  - `auth.js`: GET sesión (200 con `{user:null,household:null}` si no hay), POST `signup | login | logout`.
  - `household.js`: POST `create | join` (código de 6 chars `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, máx. 2 integrantes, unión atómica, límite de 10 intentos fallidos).
  - `sync.js`: GET devuelve todos los docs del hogar (`h:<hid>`) y privados (`u:<uid>`) más `members` sintetizado.
  - `doc.js`: POST `{op:'set'|'update'|'delete', col, id, data}` con validación.
  - `file.js`: recibos. POST `{op:'put',mime,b64}` (jpeg/png/webp/pdf, máx. 1,5 MB, se comprueba la cabecera del archivo) → `{id}`; POST `{op:'delete',id}`; GET `?id=` devuelve el archivo (solo integrantes del hogar). Colección `files {_id(hex24),scope,mime,size,data,createdBy,createdAt}`; máx. 1000 por hogar. El cliente ofrece botones "Tomar foto" (`capture=environment`), "Galería" y "PDF" sobre un único `<input type=file>` oculto, y reduce las fotos a 1600 px JPEG antes de subir; el gasto guarda `receipt` (id) y `receiptType` (`image|pdf`).
  - `ocr.js`: lectura del recibo en el servidor (solo con `ANTHROPIC_API_KEY`). GET → `{enabled}`; POST `{mime,b64}` (jpeg/png/webp/pdf, máx. 1,5 MB) → `{amount,desc,date}` (null si no se distingue). Usa `@anthropic-ai/sdk` (`messages.create` con `output_config.format` json_schema y `effort:'low'`), `maxDuration` 60 s en `vercel.json`.
  - Lectura local (cliente, bloque `ocr-parse` en `index.html`): `readReceipt` consulta GET `/api/ocr` una vez por sesión; si no hay clave, `readLocal` carga desde jsDelivr `tesseract.js@7.0.0` (idioma `spa`, datos desde tessdata.projectnaptha.com, ~1 MB la primera vez) y, para PDF, `pdfjs-dist@6.5.438` (texto del PDF; si no tiene, renderiza la página 1 y la pasa por Tesseract). `parseReceipt(texto, hoy)` saca el total (línea con "total" sin subtotal/ahorro/IVA/cambio; el monto puede estar en la línea siguiente; si no hay "total", el mayor con decimales), el comercio (lista `STORES` de cadenas de Costa Rica, si no la primera línea con letras) y la fecha (dd/mm/aaaa o aaaa-mm-dd, no futura). Rellena solo los campos vacíos (la fecha solo si sigue en hoy en un gasto nuevo). El worker de Tesseract se libera tras 90 s sin uso.
  - `health.js`: ping a la base.
- `lib/`: `http.js` (`route`, `fail`, `bodyOf`; 405/415, no-store, errores uniformes), `db.js` (conexión cacheada en `global.__casaDb`, índices únicos), `auth.js` (JWT HS256 en cookie `ceo_session` HttpOnly/Secure/SameSite=Lax, 30 días).
- Modelo en Mongo: `users {email,name,hash,hid,hidAt,joinFails}`, `households {code,members[]}`, `docs {scope,col,id,data,updatedAt}`.
  - scope `h:<hogar>` = compartido; colecciones permitidas: `inventory, bills, payments, expenses, settlements, notes`.
  - scope `u:<usuario>` = privado; el cliente usa prefijo `~`: `~` (solo id `budget`) y `~budget/entries`.
  - Doc máx. 20 000 caracteres; campos de `update` con regex `^[A-Za-z0-9_]{1,40}$`.
- Cliente: `makeBackend(me)` imita `db.doc/collection/onSnapshot` sobre `/api/sync`; sondeo cada 6 s si la pestaña está visible, más al volver a la pestaña y tras cada escritura. Contador `seq` para descartar lecturas viejas.
- Reparto de gastos: `shareOf(doc,id)` (split = % del primer integrante, por defecto 50). `balances()` suma pagos de recibos + gastos + liquidaciones.

## Pruebas (carpeta `test/`)
Correr en **procesos de servidor separados** (el test de API consume `MAX_USERS=4`):
```
PORT=3999 node test/server.js &        # servidor local con Mongo falso
node test/api-test.js                  # 64 comprobaciones
kill %1
PORT=3999 node test/server.js &
python3 test/ui-test.py                # Playwright, 2 usuarios (lectura de recibos vía servidor simulado)
kill %1
node test/ocr-parse-test.js            # extractor de total/comercio/fecha, 13 casos, sin servidor
OCR_LOCAL=1 PORT=3998 node test/server.js &
python3 test/ui-ocr-local.py           # lectura en el navegador con Tesseract real (necesita internet)
kill %1
```
`test/server.js` falsea `mongodb` en memoria, quita `; Secure` de la cookie solo para http local y simula la API de Claude en `/v1/messages` (`ANTHROPIC_BASE_URL` apunta al propio servidor; una imagen devuelve un recibo leído y un PDF una respuesta ilegible). Con `OCR_LOCAL=1` no pone clave y el navegador lee con Tesseract.

## Límites conocidos (decisiones tomadas)
- Sin recuperación de contraseña, sin correo de confirmación, sin límite de intentos de login (solo el de unirse al hogar).
- Registro se cierra al llegar a `MAX_USERS`.
- Sincronización por sondeo (6 s), no tiempo real.
- Los datos del artifact v2 de claude.ai no se migraron; la app empieza vacía.
- Supabase se descartó (el usuario declinó); no tocar sus proyectos de Supabase.

## Reglas
- No imprimir ni guardar en archivos `MONGODB_URI`, `AUTH_SECRET` ni `ANTHROPIC_API_KEY`.
- No crear repos ni proyectos de pago sin confirmar con el usuario.
- Si cambias `index.html`, súbele la versión (v9, v10…).
