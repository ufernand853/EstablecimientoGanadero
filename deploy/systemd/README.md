# Systemd services (API + Web)

Estas unidades permiten ejecutar la app en Linux como servicios persistentes, independientes de la sesión SSH.

## Opción recomendada (1 comando): generar + instalar servicios

Desde la raíz del repo:

```bash
cd /home/adminuser/EstablecimientoGanadero
./deploy/systemd/install-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero
```

Este script:

- genera `eg-api.service` y `eg-web.service` temporalmente,
- configura la API en `PORT=3201`,
- configura la web en `PORT=3200` y `API_INTERNAL_URL=http://127.0.0.1:3201`,
- los copia a `/etc/systemd/system/`,
- hace `daemon-reload`,
- y ejecuta `enable --now` para ambos servicios.

> También puedes omitir argumentos y tomará por defecto `--user $(id -un)` y `--project-dir $(pwd)`.


Para pruebas sin tocar systemd, usa:

```bash
./deploy/systemd/install-services.sh --systemd-dir /tmp/systemd-test --skip-systemctl
```

## Alternativa manual (si prefieres separar pasos)

```bash
cd /home/adminuser/EstablecimientoGanadero
./deploy/systemd/render-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero
sudo cp deploy/systemd/generated/eg-api.service /etc/systemd/system/
sudo cp deploy/systemd/generated/eg-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eg-api.service
sudo systemctl enable --now eg-web.service
```

## Preparar app

```bash
cd /home/adminuser/EstablecimientoGanadero
npm install
npm --workspace apps/web run build
```

## Verificar estado y logs

```bash
sudo systemctl status eg-api.service --no-pager
sudo systemctl status eg-web.service --no-pager
journalctl -u eg-api.service -f
journalctl -u eg-web.service -f
```

Para diagnosticar un fallo de arranque sin que systemd recorte la causa real, usa:

```bash
sudo systemctl status eg-api.service eg-web.service --no-pager --full
sudo journalctl -u eg-api.service -n 80 --no-pager --output=short-precise --all
sudo journalctl -u eg-web.service -n 80 --no-pager --output=short-precise --all
```

Si `systemctl` responde `Unit ... not loaded`, la unidad no esta instalada o systemd ya no conoce su archivo. No hay ningun estado que resetear: reinstala ambas unidades desde el repo y verifica `LoadState=loaded`:

```bash
cd /home/adminuser/EstablecimientoGanadero
sudo bash deploy/systemd/install-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero
sudo systemctl show eg-api.service eg-web.service -p LoadState -p ActiveState
```

Las unidades limitan la detencion a 15 segundos y usan `KillMode=control-group` para cerrar tambien los procesos hijos de `npm`/Next.js, evitando esperas de 90 segundos durante un restart.
Ademas, systemd limita los reintentos a cinco por minuto. Las unidades usan
`Restart=always`: tambien recuperan una terminacion inesperada con codigo cero,
que de otro modo dejaria a Nginx respondiendo `502`. Un error permanente como
`EADDRINUSE` queda en estado `failed` en lugar de generar decenas de miles de
procesos fallidos. El instalador reinicia explicitamente las unidades despues
de reemplazarlas; `enable --now` por si solo no reinicia una unidad que ya
estaba activa.
El instalador espera que `http://127.0.0.1:3201/health` responda antes de reiniciar la web. Si la API falla, conserva la web existente y muestra automaticamente el estado y las ultimas 80 lineas completas del journal de la API.
Antes de copiar o reiniciar unidades tambien ejecuta `deploy/check-api-syntax.sh`. Un error de TypeScript/TSX detiene el deploy antes de tocar los procesos que estaban funcionando.

## Operación diaria

```bash
sudo systemctl restart eg-api.service
sudo systemctl restart eg-web.service
sudo systemctl stop eg-api.service
sudo systemctl stop eg-web.service
sudo systemctl start eg-api.service
sudo systemctl start eg-web.service
```

## Actualizaciones de código

```bash
cd /home/adminuser/EstablecimientoGanadero
git pull
npm install
npm --workspace apps/web run build
sudo systemctl restart eg-api.service eg-web.service
```

Si `systemctl status eg-api.service` muestra una unidad vieja con `PORT=3001`/`PORT=3000`, reinstala las unidades generadas por el repo y reinicia:

```bash
cd /home/adminuser/EstablecimientoGanadero
sudo ./deploy/systemd/install-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero
sudo systemctl daemon-reload
sudo systemctl restart eg-api.service eg-web.service
```

## Notas

- API usa `npm --workspace apps/api run start` en `PORT=3201`.
- Web usa `npm --workspace apps/web run start` en `PORT=3200`, requiere build previo y consume la API mediante `API_INTERNAL_URL=http://127.0.0.1:3201`.
- `eg-web.service` arranca despues de `eg-api.service` y comprueba que exista `apps/web/.next/BUILD_ID`; si falta, ejecuta `npm --workspace apps/web run build` antes de reiniciar.
- `eg-web.service` usa `Wants=eg-api.service` (dependencia blanda), para evitar que web quede acoplada al estado posterior de la API.
- Si quieres acoplamiento estricto, cambia `Wants` por `Requires` y agrega `After=network.target eg-api.service`.
- `EnvironmentFile=-.../.env` usa prefijo `-` para no fallar si falta el `.env`.
