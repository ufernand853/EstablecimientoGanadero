# Establecimiento Ganadero

Multi-tenant web app for extensive livestock ranch management with event-sourced operations, Spanish text command ingestion, and slaughterhouse consignments.

## Stack
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS + TanStack Query
- Backend: Fastify + TypeScript
- DB: PostgreSQL + Prisma
- Validation: Zod (shared)
- Auth: JWT access + refresh, password hashing

## Local development

### 1) Start Postgres
```bash
cd docker
docker-compose up -d
```

### 2) Install deps
```bash
npm install
```

### 3) Migrate and seed
```bash
npx prisma migrate dev --name init
node scripts/seed.ts
```

### 4) Start API
```bash
npm run dev:api
```

### 5) Start Web
```bash
npm run dev:web
```

## Sample credentials
```
email: owner@estancias.local
password: changeme
```

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
  packages/
    shared/
  prisma/
    schema.prisma
    migrations/
  docker/
    docker-compose.yml
  scripts/
    seed.ts
  README.md
```
