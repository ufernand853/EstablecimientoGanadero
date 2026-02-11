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

## Notas

- API usa `npm --workspace apps/api run start`.
- Web usa `npm --workspace apps/web run start` y requiere build previo.
- `eg-web.service` usa `Wants=eg-api.service` (dependencia blanda), para evitar que web falle si API no inicia.
- Si quieres acoplamiento estricto, cambia `Wants` por `Requires` y agrega `After=network.target eg-api.service`.
- `EnvironmentFile=-.../.env` usa prefijo `-` para no fallar si falta el `.env`.
