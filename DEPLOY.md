# Puesta en produccion

Cuatro servicios, todos en tier gratis. El orden importa: cada paso necesita
algo del anterior. Calcula una hora la primera vez, casi toda esperando.

---

## 1. Neon — la base de datos

La base se crea **desde Vercel**, no desde la consola de Neon: en una cuenta
enlazada por la integracion, el boton de crear proyecto en Neon esta
deshabilitado a proposito.

En el proyecto de Vercel → **Storage → Create Database → Neon**:

- Region: la mas cercana (Washington, D.C. sirve para Colombia).
- **Auth: desactivado.** Neon ofrece su propio sistema de sesiones; nosotros ya
  tenemos Google Sign-In con JWT propio y no lo necesitamos.
- Plan Free, sin tarjeta.
- Al conectarla al proyecto, marcar **Create Database Branch For Deployment →
  Preview**. Sin eso, un despliegue de prueba desde otra rama correria
  `prisma migrate deploy` contra la base de produccion.

La integracion inyecta sola `DATABASE_URL` y `DATABASE_URL_UNPOOLED`, que son
exactamente los dos nombres que lee `schema.prisma`. **Nadie tiene que copiar la
cadena de conexion a ningun lado.**

> Si `DATABASE_URL` ya existe en el proyecto (Vercel la crea vacia al importar
> el repo, leyendola del `.env.example`), la integracion falla en silencio: se
> conecta pero no inyecta nada. Hay que borrar esa variable vacia primero.

No hay que crear tablas a mano: el despliegue corre `prisma migrate deploy` y
aplica `packages/db/prisma/migrations/0_init`, ya probado sobre una base vacia.

---

## 2. Google Cloud — el inicio de sesion

En https://console.cloud.google.com, proyecto nuevo.

**a. Pantalla de consentimiento** — *APIs y servicios → Pantalla de
consentimiento de OAuth*. Tipo **Externo**. Nombre de la app, correo de
soporte. En **Usuarios de prueba** agregar los dos correos que van a usar la
app. Sin esto, Google bloquea el acceso.

**b. Cliente web** — *Credenciales → Crear credenciales → ID de cliente de
OAuth → Aplicacion web*. El **Client ID** resultante es el que va en
`GOOGLE_WEB_CLIENT_ID` (API) y `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (app).

Los dos lados usan el mismo: la app pide el token con ese id, y la API verifica
que el token declare ese id como audiencia.

**c. Cliente Android** — se hace en el paso 4, cuando exista la huella de la
llave de firma.

---

## 3. Vercel — la API

1. Importar el repo en https://vercel.com.
2. **Root Directory: `apps/api`** (no la raiz del repo).
3. Activar **Include source files outside of the Root Directory**, porque el
   build necesita `packages/db` y `packages/shared`.
4. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la inyecta Neon |
   | `DATABASE_URL_UNPOOLED` | la inyecta Neon |
   | `JWT_SECRET` | `openssl rand -base64 48` |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `GOOGLE_WEB_CLIENT_ID` | el client id web del paso 2b |

   Solo hay que escribir las tres ultimas. Las dos de la base llegan solas.

5. Desplegar y comprobar: `https://TU-APP.vercel.app/api/health` debe responder
   `{"ok":true,"today":"..."}` con la fecha de Bogota.

El `vercel.json` ya programa el trabajo diario a las 13:00 UTC, que son las 8:00
en Bogota. Vercel manda solo la cabecera `Authorization: Bearer $CRON_SECRET`,
que es justo lo que el endpoint exige.

> El plan Hobby permite **una** corrida al dia, por eso ese unico trabajo hace
> todo: tasas, instancias de facturas, recordatorios y el resumen de los lunes.

---

## 4. EAS — el APK

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init          # crea el proyecto y escribe el projectId en app.json
```

**Generar la llave de firma antes de compilar**, para no gastar un build:

```bash
npx eas-cli credentials
```

Elegir Android → el perfil `preview` → **Set up a new keystore**. Al terminar
muestra la **huella SHA-1**; copiarla.

**Registrar el cliente Android en Google Cloud** — *Credenciales → Crear
credenciales → ID de cliente de OAuth → Android*:

- Nombre del paquete: `com.estebanramir.cuentasclaras`
- Huella SHA-1: la del paso anterior

> Este es el tropiezo clasico. Si falta, Google Sign-In falla con
> `DEVELOPER_ERROR` y nada mas: ni un mensaje util ni un log. No hay que
> recompilar despues de registrarla, el emparejamiento ocurre del lado de Google.

**Apuntar la app a la API.** En `apps/mobile/eas.json`, reemplazar los tres
`PENDIENTE` de los perfiles `preview` y `production` por la URL de Vercel y el
client id web.

**Compilar:**

```bash
npx eas-cli build --platform android --profile preview
```

Al terminar entrega un enlace de descarga. En el celular hay que permitir
instalar desde origenes desconocidos la primera vez.

---

## 5. Comprobar que quedo funcionando

1. Abrir la app y entrar con Google. Si falla aqui, es el SHA-1.
2. Crear el grupo. Deben aparecer las ocho categorias iniciales.
3. Ajustes → **Registrar este celular** y aceptar las notificaciones.
4. Registrar un gasto. El balance de Inicio tiene que moverse.
5. Invitar a la otra persona por correo desde Ajustes. Cuando entre con ese
   mismo correo de Google, su ficha se enlaza sola y conserva el historial.
6. Crear una factura que venza en dos dias.
7. Probar el aviso sin esperar al cron:

```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" https://TU-APP.vercel.app/api/cron/daily
```

Responde cuantos avisos mando. Correrlo dos veces el mismo dia debe devolver
`remindersSent: 0` la segunda: es la deduplicacion funcionando.

---

## Despues, para cada cambio

- **Codigo JS de la app** (pantallas, textos, logica): `npx eas-cli update
  --branch preview`. Llega solo, sin reinstalar.
- **Dependencias nativas o permisos nuevos**: hay que compilar un APK nuevo.
- **API**: `git push` y Vercel despliega solo.
- **Cambios de esquema**: `pnpm --filter @cuentas/db exec prisma migrate dev
  --name loquesea` en local, commit de la migracion, y el despliegue la aplica.
