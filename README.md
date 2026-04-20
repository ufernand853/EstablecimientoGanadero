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

### Configurar API key de OpenAI desde frontend
- Ingresá al módulo `Admin API key` en `/admin/ai-settings`.
- Completá usuario/contraseña admin y la `OPENAI_API_KEY`.
- La API guarda la clave en MongoDB (colección `settings`) y la usa en `Modo IA`.
- El módulo de comandos ahora puede confirmar eventos de sanidad (`vacunar`, `desparasitar`, `tratar`) y gestionar stock en comandos operativos clave: `mover`, `destete` y `consignación` (además registra `entore` y `yerra` como eventos operativos).


### Publicar la web bajo una subruta (ej: `/EstablecimientoGanadero`)
Si el dominio publica la app en una subruta y no en `/`, configurá el prefijo en el frontend:

```bash
NEXT_PUBLIC_BASE_PATH=/EstablecimientoGanadero
```

Con Nginx, en general conviene **preservar** la subruta y enviarla tal cual al servicio web (sin reescribirla), por ejemplo:

```nginx
location /EstablecimientoGanadero/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Luego reiniciá el servicio web para que tome la variable de entorno.

### Publicar Ganadería como `https://<dominio>:3000`
Si querés entrar a Ganadería desde otro proyecto con una URL como:

```text
https://rubenrossiseguros.linsse.com:3000/login
```

la opción recomendada es terminar TLS en Nginx en el puerto `3000` y dejar Next.js en un puerto interno (`3100`).

1. Configurá el botón del proyecto llamador para apuntar a:
   - `https://rubenrossiseguros.linsse.com:3000/login`
2. Dejá este proyecto con `PORT=3100` (ver `deploy/systemd/eg-web.service`).
3. Configurá Nginx para escuchar `3000 ssl` y hacer proxy a `http://127.0.0.1:3100`.
4. Mantené la API en `3001` y el proxy interno del frontend (`/api/proxy`).

> Nota: si tu archivo `.env` tiene `PORT=3000`, el servicio puede intentar usar ese puerto y fallar con `EADDRINUSE` al convivir con Nginx en `:3000`. La unidad `eg-web.service` fuerza `PORT=3100` **después** de cargar `.env` para evitar ese conflicto.

Ejemplo de bloque Nginx:

```nginx
server {
  listen 3000 ssl http2;
  server_name rubenrossiseguros.linsse.com;

  ssl_certificate     /etc/letsencrypt/live/rubenrossiseguros.linsse.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/rubenrossiseguros.linsse.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
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

## Suscripciones, webhook de pagos y demo 5 días

Se agregó un flujo completo para alta por suscripción y activación por webhook externo:

1. `POST /auth/register-subscription`: crea un checkout pendiente con `referenceId`.
2. El checkout se paga en la pasarela externa (fuera de la app).
3. La pasarela debe invocar `POST /billing/webhook` con `eventType=payment.succeeded`.
4. El webhook activa tenant, usuario owner, membresía y suscripción.
5. El usuario inicia sesión en `/login` vía `POST /auth/login`.

### Endpoints nuevos

- `POST /auth/register-subscription`
- `POST /auth/demo-request`
- `POST /billing/webhook`
- `POST /auth/login`
- `GET /auth/session`
- `POST /auth/logout`

### Firma del webhook

La API valida la cabecera:

```text
x-webhook-signature: <hmac_sha256_hex>
```

La firma se calcula como `HMAC_SHA256(raw_json_body, BILLING_WEBHOOK_SECRET)`.

Variables sugeridas:

```bash
SESSION_SECRET=un-secreto-largo-y-unico
BILLING_WEBHOOK_SECRET=un-secreto-webhook-largo-y-unico
```

### Demo

`POST /auth/demo-request` crea un checkout demo (5 días) y devuelve un `referenceId`.
La activación se completa exactamente igual que un pago real: enviando el webhook exitoso para ese `referenceId`.
Cuando la suscripción está próxima a vencer, `/auth/session` devuelve notificación de expiración para mostrar en frontend.

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

## Propuesta: ficha individual con fotos
- Ver `docs/propuesta-ficha-animal-y-fotos.md` para una propuesta concreta de implementación (caravana, nombre, fecha de nacimiento, y fotos por animal).

## Consultas SQL de referencia
- `docs/sql/lista-lotes-aprobaciones.sql`: consulta para listar lotes/destinos pendientes de aprobación en producto terminado.
