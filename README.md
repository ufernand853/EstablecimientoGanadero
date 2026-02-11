# Establecimiento Ganadero

Multi-tenant web app for extensive livestock ranch management with event-sourced operations, Spanish text command ingestion, and slaughterhouse consignments.

## Stack
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS + TanStack Query
- Backend: Fastify + TypeScript
- DB: JSON fixtures (testing)
- Validation: Zod (shared)
- Auth: JWT access + refresh, password hashing

## Local development

### 1) Install deps
```bash
npm install
```

### 2) Configure MongoDB env
La API ahora carga variables automáticamente desde `.env` y, si no existe, desde `.env.example`.

```bash
cp .env.example .env
```

Si prefieres configurar manualmente, define `MONGODB_URI` (o usa variables separadas: `MONGODB_HOST`, `MONGODB_PORT`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_AUTH_SOURCE`, `MONGODB_DB`).

### 3) Start API
```bash
npm run dev:api
```

MongoDB crea la base automáticamente cuando se inserta el primer documento, así que si no existe se crea por defecto al operar la API.

### 4) Start Web
```bash
npm run dev:web
```


## Ejecutar como servicio (Linux/systemd)
Para dejar la app levantada sin depender de una sesión SSH, usa `systemd`.

Guía rápida (1 comando de instalación):
```bash
cd /home/adminuser/EstablecimientoGanadero
npm install
npm --workspace apps/web run build
./deploy/systemd/install-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero
```

Ver más detalle en `deploy/systemd/README.md`.

## Datos de prueba (JSON)
La API usa archivos JSON locales para el contexto, confirmaciones y stock:
- `apps/api/src/data/context.json`: paddocks, consignors y slaughterhouses.
- `apps/api/src/data/confirmations.json`: historial de confirmaciones.
- `apps/api/src/data/herds.json`: stock por potrero/categoría.

Edita esos archivos para ajustar los datos de testing sin depender de una base de datos.

## Sample command strings
- "Mover 120 terneros del Potrero 3 al Potrero 7 hoy 16:00"
- "Vacunar lote vaquillonas aftosa 2ml el 2026-02-01"
- "Iniciar entore de vacas con 3 toros desde 15/11 hasta 15/01"
- "Destetar 85 terneros del lote VAC-2025-01, peso 170kg"
- "Yerra 60 terneros, castrar 30, hoy"
- "Enviar a frigorífico Las Moras por consignatario Pérez: 35 novillos a 620, 12 vacas a 480 hoy"

## Repo structure
```
/
  apps/
    web/
    api/
      src/
        data/
          context.json
          confirmations.json
          herds.json
  packages/
    shared/
  README.md
```
