# Casa en Orden (v5) — traspaso a Claude Code

Responde en español, directo y conciso. Cada cambio al HTML sube el número de versión (hoy `v5`, span `.ver` en `index.html`).

## Objetivo
App pequeña del hogar (2 cuentas por hogar): despensa/inventario, recibos compartidos (alquiler, servicios), gastos compartidos (súper y otros) con balance, presupuesto personal **privado** por persona y notas compartidas. Va en Vercel con MongoDB, login propio con correo y contraseña.

## Estado (2026-11-06: desplegado y verificado)
- Repo: `github.com/Gaboarias/gastos-de-casa` (rama `main`). Cada push a `main` despliega solo.
- Vercel: proyecto `gastos-de-casa` en el equipo `garias1989-2231s-projects`. Producción: **https://gastos-de-casa-black.vercel.app** (`/api/health` → `{"ok":true,"secret":true}`).
- MongoDB: instalado desde el Marketplace de Vercel (`npx vercel integration add mongodbatlas`), recurso `atlas-champagne-fence`; la integración pone `MONGODB_URI` sola. No hay cuenta de Atlas aparte.
- Variables en Vercel (Production y Preview): `MONGODB_URI` (integración), `AUTH_SECRET` (sensible), `MAX_USERS=2`.
- Verificado en producción con 2 cuentas de prueba (18 comprobaciones: hogar + código, despensa y gasto sincronizados, presupuesto privado invisible para el otro, tercera cuenta rechazada). Las cuentas de prueba ya se borraron; la base está vacía.
- Las URLs de despliegue `*-garias1989-2231s-projects.vercel.app` piden login de Vercel; el dominio de producción no.

## Cómo operar
- El conector MCP de Vercel de esta cuenta devuelve 403 al crear proyectos/integraciones: usar el CLI, `npx vercel <cmd> --scope garias1989-2231s-projects` (login por dispositivo con `npx vercel login`).
- Para subir una cuenta más: `npx vercel env rm MAX_USERS production` y volver a añadirla con el nuevo valor, luego redeploy. Para liberar un cupo borra el usuario en la colección `users` (y su hogar/docs si aplica).
- Si `/api/health` falla: 503 "Falta conectar la base de datos" = falta `MONGODB_URI`; 503 "No se pudo conectar a MongoDB" = revisar la integración en el panel de Vercel (Storage).
- Logs: `npx vercel logs <url>` o `get_runtime_errors`.

## Arquitectura
- `index.html`: SPA estática sin build (JS/CSS inline, ~64 KB). Pestañas Despensa / Recibos / Gastos / Presupuesto / Notas. Generada desde un artifact de claude.ai; el código del cliente que habla con la API está en `client-block.js`.
- `api/*.js`: funciones serverless Node (CommonJS), `mongodb@6.10.0`, `bcryptjs@2.4.3`, `jose@5.9.6`, node ≥20.
  - `auth.js`: GET sesión (200 con `{user:null,household:null}` si no hay), POST `signup | login | logout`.
  - `household.js`: POST `create | join` (código de 6 chars `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, máx. 2 integrantes, unión atómica, límite de 10 intentos fallidos).
  - `sync.js`: GET devuelve todos los docs del hogar (`h:<hid>`) y privados (`u:<uid>`) más `members` sintetizado.
  - `doc.js`: POST `{op:'set'|'update'|'delete', col, id, data}` con validación.
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
node test/api-test.js                  # 48 comprobaciones
kill %1
PORT=3999 node test/server.js &
python3 test/ui-test.py                # Playwright, 2 usuarios
kill %1
```
`test/server.js` falsea `mongodb` en memoria y quita `; Secure` de la cookie solo para http local.

## Límites conocidos (decisiones tomadas)
- Sin recuperación de contraseña, sin correo de confirmación, sin límite de intentos de login (solo el de unirse al hogar).
- Registro se cierra al llegar a `MAX_USERS`.
- Sincronización por sondeo (6 s), no tiempo real.
- Los datos del artifact v2 de claude.ai no se migraron; la app empieza vacía.
- Supabase se descartó (el usuario declinó); no tocar sus proyectos de Supabase.

## Reglas
- No imprimir ni guardar en archivos `MONGODB_URI` ni `AUTH_SECRET`.
- No crear repos ni proyectos de pago sin confirmar con el usuario.
- Si cambias `index.html`, súbele la versión (v6, v7…).
