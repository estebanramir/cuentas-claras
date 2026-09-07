# Cuentas Claras

Gastos compartidos y facturas recurrentes, para Android.

Dos mitades conectadas: los gastos del grupo con sus balances netos, y las
facturas que vencen con sus recordatorios. Al registrar el pago de una factura
se crea el gasto del grupo, hereda el reparto y los balances se mueven solos.

La arquitectura completa esta en `docs/arquitectura.html`.
Para publicarla, `DEPLOY.md`.

## Requisitos

- Node 22 — `nvm use` (el `.nvmrc` lo fija)
- pnpm 10
- Docker, solo para el Postgres de desarrollo

## Poner a andar el desarrollo

```bash
nvm use
CI=true pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env    # completar los secretos
pnpm db:push
pnpm api                                  # http://localhost:4000
```

Comprobar que todo funciona:

```bash
pnpm test                                 # 57 tests del nucleo de calculo
pnpm --filter @cuentas/api e2e            # 60 comprobaciones contra la API viva
```

Correr la app (necesita un build de desarrollo, no sirve Expo Go porque
Google Sign-In es un modulo nativo):

```bash
pnpm --filter @cuentas/mobile prebuild
pnpm --filter @cuentas/mobile android
```

En el emulador de Android, `localhost` del computador es `10.0.2.2`; ya viene
configurado asi en `app.json`. En un celular fisico hay que apuntar
`EXPO_PUBLIC_API_URL` a la IP del computador en la red local.

## Lo que hace falta configurar

| Que | Donde se pone | Para que |
|---|---|---|
| Base de datos | La integracion de Neon en Vercel las inyecta sola | Postgres en produccion |
| Client id web de Google | `GOOGLE_WEB_CLIENT_ID` y `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Iniciar sesion |
| Huella SHA-1 de la keystore | Consola de Google Cloud | Que Google Sign-In funcione en el APK |
| `JWT_SECRET` | `apps/api/.env` y Vercel | Firmar la sesion |
| `CRON_SECRET` | `apps/api/.env` y Vercel | Proteger el trabajo diario |

Los dos secretos se generan asi:

```bash
openssl rand -base64 48    # JWT_SECRET
openssl rand -hex 32       # CRON_SECRET
```

## Estructura

- `packages/shared` — dinero, repartos, balances y recurrencias. Sin
  dependencias de runtime, con 57 tests incluidas pruebas de propiedad.
- `packages/db` — esquema Prisma y cliente.
- `apps/api` — Next.js con 18 rutas, desplegado en Vercel.
- `apps/mobile` — Expo / React Native para Android.

## Decisiones que conviene no romper

- **Los montos son enteros en unidades minimas.** Ningun monto pasa por `Number`
  en ningun punto del calculo. Salen como string por el borde de la API porque
  `BigInt` no es serializable a JSON.
- **Cada gasto congela su tasa de cambio.** Si manana sube el dolar, el balance
  del mes pasado no se mueve.
- **Los gastos se borran de forma logica.** Un gasto que desaparece de verdad
  deja los balances historicos sin explicacion.
- **Las fechas de vencimiento son `DATE` puro**, ancladas a `America/Bogota`.
  Con timestamp, un servidor en UTC muestra el 14 cuando el vencimiento es el 15.
- **La suma de los balances de un grupo es siempre cero.** Es la invariante que
  cubren las pruebas de propiedad; si falla, el redondeo se rompio.
- **pnpm usa enlazado plano** (`.npmrc`). React Native y el autolinking de Expo
  no funcionan con el enlazado estricto.
