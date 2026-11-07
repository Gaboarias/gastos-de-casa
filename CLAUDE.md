# Casa en Orden (v3) — traspaso a Claude Code

Responde en español, directo y conciso. Cada cambio al HTML sube el número de versión (hoy `v3`, span `.ver` en `index.html`).

## Objetivo
App pequeña para una pareja (2 personas): despensa/inventario, recibos compartidos (alquiler, servicios), gastos compartidos (súper y otros) con balance, y presupuesto personal **privado** por persona. Va en Vercel con MongoDB, login propio con correo y contraseña, para que la pareja no necesite cuenta de claude.ai.

## Estado
- Código completo y probado en local contra un MongoDB falso (46 comprobaciones de API + prueba E2E con 2 usuarios en Playwright, sin errores JS).
- **Falta**: desplegar en Vercel, conectar MongoDB Atlas real, definir variables de entorno y verificar en producción. El conector de Vercel de la sesión anterior daba 403 al crear proyecto/despliegue; GitHub CLI no tenía token válido. Aquí sí hay terminal del usuario: usar `npx vercel`.
- Nunca se probó contra Atlas real ni en Vercel.

## Tareas para ti (en orden)
1. `npm install` y correr las pruebas locales (ver "Pruebas") para confirmar que todo sigue verde.
2. Desplegar: `npx vercel --prod` (framework **Other**, sin build command, output vacío). Si el usuario prefiere, repo en GitHub + importar en Vercel.
3. Pedirle al usuario que cree un clúster **MongoDB Atlas M0**, un usuario de base de datos y `0.0.0.0/0` en Network Access (o instalar Atlas desde Vercel Marketplace). La cadena `MONGODB_URI` la pone el usuario en Vercel; **no pedirla ni imprimirla en el chat**.
4. Variables de entorno (Production): `MONGODB_URI`, `AUTH_SECRET` (≥32 chars, generar con `openssl rand -hex 32` y guardarlo solo en Vercel), opcional `MAX_USERS` (def. 4), `MONGODB_DB` (def. `casaenorden`). Redeploy.
5. Verificar `GET /api/health` → `{"ok":true,"secret":true}`. Si falla: 503 "Falta conectar la base de datos" = falta `MONGODB_URI`; 503 "No se pudo conectar a MongoDB" = usuario/clave/Network Access.
6. Si el proyecto tiene Deployment Protection activa, desactivarla para que la pareja entre sin login de Vercel.
7. Prueba de humo real: crear 2 cuentas, hogar + código, sincronizar despensa, gasto y balance, comprobar que el presupuesto no es visible para el otro. Borrar esas cuentas de prueba después (colección `users`, `households`, `docs`) o avisar al usuario.
8. Revisar `get_runtime_errors` / logs si algo falla.

## Arquitectura
- `index.html`: SPA estática sin build (JS/CSS inline, ~64 KB). Pestañas Despensa / Recibos / Gastos / Presupuesto. Generada desde un artifact de claude.ai; el código del cliente que habla con la API está en `client-block.js`.
- `api/*.js`: funciones serverless Node (CommonJS), `mongodb@6.10.0`, `bcryptjs@2.4.3`, `jose@5.9.6`, node ≥20.
  - `auth.js`: GET sesión (200 con `{user:null,household:null}` si no hay), POST `signup | login | logout`.
  - `household.js`: POST `create | join` (código de 6 chars `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, máx. 2 integrantes, unión atómica, límite de 10 intentos fallidos).
  - `sync.js`: GET devuelve todos los docs del hogar (`h:<hid>`) y privados (`u:<uid>`) más `members` sintetizado.
  - `doc.js`: POST `{op:'set'|'update'|'delete', col, id, data}` con validación.
  - `health.js`: ping a la base.
- `lib/`: `http.js` (`route`, `fail`, `bodyOf`; 405/415, no-store, errores uniformes), `db.js` (conexión cacheada en `global.__casaDb`, índices únicos), `auth.js` (JWT HS256 en cookie `ceo_session` HttpOnly/Secure/SameSite=Lax, 30 días).
- Modelo en Mongo: `users {email,name,hash,hid,hidAt,joinFails}`, `households {code,members[]}`, `docs {scope,col,id,data,updatedAt}`.
  - scope `h:<hogar>` = compartido; colecciones permitidas: `inventory, bills, payments, expenses, settlements`.
  - scope `u:<usuario>` = privado; el cliente usa prefijo `~`: `~` (solo id `budget`) y `~budget/entries`.
  - Doc máx. 20 000 caracteres; campos de `update` con regex `^[A-Za-z0-9_]{1,40}$`.
- Cliente: `makeBackend(me)` imita `db.doc/collection/onSnapshot` sobre `/api/sync`; sondeo cada 6 s si la pestaña está visible, más al volver a la pestaña y tras cada escritura. Contador `seq` para descartar lecturas viejas.
- Reparto de gastos: `shareOf(doc,id)` (split = % del primer integrante, por defecto 50). `balances()` suma pagos de recibos + gastos + liquidaciones.

## Pruebas (carpeta `test/`)
Correr en **procesos de servidor separados** (el test de API consume `MAX_USERS=4`):
```
PORT=3999 node test/server.js &        # servidor local con Mongo falso
node test/api-test.js                  # 46 comprobaciones
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
- Si cambias `index.html`, súbele la versión (v4, v5…).
