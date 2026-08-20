# Cuentas Claras

Gastos compartidos y facturas recurrentes, para Android.

Arquitectura completa: ver `docs/arquitectura.html`.

## Requisitos
- Node 22 (`nvm use`)
- pnpm 10

## Puesta en marcha
```bash
nvm use
pnpm install
cp apps/api/.env.example apps/api/.env   # y completar
pnpm db:push
pnpm api
```

## Estructura
- `packages/shared` — dinero, repartos y balances. Sin dependencias de runtime.
- `packages/db` — esquema Prisma y cliente.
- `apps/api` — Next.js (solo rutas de API), desplegado en Vercel.
- `apps/mobile` — Expo / React Native, Android.
