# Systemd services (API + Web)

Estas unidades permiten ejecutar la app en Linux como servicios persistentes, independientes de la sesión SSH.

## 1) Preparar app

```bash
cd /workspace/EstablecimientoGanadero
npm install
npm --workspace apps/web run build
```

## 2) Ajustar plantillas

Antes de instalar, revisa en ambos archivos:

- `User=ubuntu` (cámbialo por el usuario real del servidor)
- `WorkingDirectory=/workspace/EstablecimientoGanadero` (ajústalo a tu path real)
- `EnvironmentFile=/workspace/EstablecimientoGanadero/.env` (si usas otra ubicación)

Archivos:

- `deploy/systemd/eg-api.service`
- `deploy/systemd/eg-web.service`

## 3) Instalar servicios en systemd

```bash
sudo cp deploy/systemd/eg-api.service /etc/systemd/system/
sudo cp deploy/systemd/eg-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eg-api.service
sudo systemctl enable --now eg-web.service
```

## 4) Verificar estado y logs

```bash
sudo systemctl status eg-api.service --no-pager
sudo systemctl status eg-web.service --no-pager
journalctl -u eg-api.service -f
journalctl -u eg-web.service -f
```

## 5) Operación diaria

```bash
sudo systemctl restart eg-api.service
sudo systemctl restart eg-web.service
sudo systemctl stop eg-api.service
sudo systemctl stop eg-web.service
sudo systemctl start eg-api.service
sudo systemctl start eg-web.service
```

## 6) Actualizaciones de código

```bash
cd /workspace/EstablecimientoGanadero
git pull
npm install
npm --workspace apps/web run build
sudo systemctl restart eg-api.service eg-web.service
```

## Notas

- API usa `npm --workspace apps/api run start`.
- Web usa `npm --workspace apps/web run start` y requiere build previo.
- Si no quieres acoplar Web->API, elimina `Requires=eg-api.service` y `After=... eg-api.service` de `eg-web.service`.
