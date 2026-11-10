# Casa en Orden (v3, Vercel + MongoDB)

Despensa, recibos, gastos compartidos (con foto del recibo y lectura automática del total), notas y presupuesto privado. Un hogar admite 2 cuentas.
Login propio con correo y contraseña. Cada persona crea su cuenta; la primera crea el hogar y
la segunda entra con un código de 6 caracteres. El presupuesto de cada quien solo lo ve esa persona.

## 1. Base de datos (MongoDB Atlas, plan gratis)
1. En cloud.mongodb.com crea un clúster **M0 (Free)**, región cercana (por ejemplo AWS us-east-1).
2. *Database Access*: crea un usuario con contraseña.
3. *Network Access*: agrega `0.0.0.0/0` (Vercel usa IPs variables).
4. *Connect > Drivers*: copia la cadena `mongodb+srv://...` y pon tu contraseña en ella.

(Alternativa: en Vercel, dentro del proyecto, Storage / Marketplace > MongoDB Atlas con plan gratis;
crea el clúster y define `MONGODB_URI` solo.)

## 2. Subir a Vercel (elige una)
- **Con la terminal**: dentro de esta carpeta, `npx vercel --prod`. La primera vez pide iniciar sesión
  y crear el proyecto (framework: *Other*, sin comando de build).
- **Con GitHub**: sube estos archivos a un repositorio privado y en Vercel usa *Add New > Project*.
  Cada cambio que subas se despliega solo.

## 3. Variables de entorno (Vercel > Settings > Environment Variables, entorno Production)
| Nombre | Valor |
|---|---|
| `MONGODB_URI` | la cadena de Atlas |
| `AUTH_SECRET` | texto aleatorio de 32 caracteres o más (por ejemplo `openssl rand -hex 32`) |
| `MAX_USERS` | opcional; máximo de cuentas que se pueden crear (por defecto 4) |
| `MONGODB_DB` | opcional; nombre de la base (por defecto `casaenorden`) |

Después de guardar las variables, haz un nuevo despliegue (Redeploy) para que se apliquen.

## 4. Comprobar (producción actual: https://gastos-de-casa-black.vercel.app)
Abre `https://TU-PROYECTO.vercel.app/api/health`. Debe responder `{"ok":true,"secret":true}`.
Si dice "Falta conectar la base de datos", revisa `MONGODB_URI`; si dice "No se pudo conectar a MongoDB",
revisa el usuario, la contraseña y *Network Access*.

## 5. Uso
1. La primera persona abre la app, elige *Crear cuenta* y luego *Crear hogar nuevo*.
2. La app muestra un código de 6 caracteres. La segunda persona crea su cuenta y usa *Unirme con código*.
3. Los cambios del otro aparecen en unos 6 segundos o al volver a la pestaña.

## Notas
- Las contraseñas se guardan con bcrypt y la sesión dura 30 días en una cookie HttpOnly.
- No hay recuperación de contraseña ni correo de confirmación.
- Cuando se llega a `MAX_USERS` cuentas, el registro se cierra.
