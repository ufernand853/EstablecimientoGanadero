Uso en el server:

```bash
cd /home/adminuser/EstablecimientoGanadero
git pull --ff-only origin master
chmod +x deploy/restart-ganaderia.sh
./deploy/restart-ganaderia.sh
```

Que hace:

- verifica que el checkout no tenga cambios locales y despliega el commit ya actualizado
- instala dependencias
- recompila `apps/web`
- reinicia API en `3201`
- exporta `API_INTERNAL_URL=http://127.0.0.1:3201` al levantar la web
- espera healthcheck real de la API
- reinicia web en `3200`
- espera respuesta real de la web

El `git pull` se hace antes del restart. El script no modifica ni actualiza el repositorio mientras se esta ejecutando, porque actualizar el propio script a mitad del deploy puede dejar una ejecucion inconsistente.

### Si `git pull` informa cambios locales

Primero revisa exactamente que se modifico:

```bash
git status --short
git diff -- deploy/restart-ganaderia.sh
```

Si ese cambio local no se necesita (caso habitual para una copia de produccion), restaura solo el archivo bloqueante y actualiza:

```bash
git restore deploy/restart-ganaderia.sh
git pull --ff-only origin master
./deploy/restart-ganaderia.sh
```

Si necesitas conservarlo, guardalo temporalmente antes de actualizar:

```bash
git stash push -m "cambios locales antes de deploy" -- deploy/restart-ganaderia.sh
git pull --ff-only origin master
./deploy/restart-ganaderia.sh
```

No uses `git reset --hard` si no verificaste antes que cambios locales se perderian.

Puertos usados:

- API: `3201`
- Web: `3200`


Verificacion de puertos en el server:

```bash
cd /home/adminuser/EstablecimientoGanadero
sudo ./deploy/verify-ports.sh
```

El script compara los puertos esperados (`API_PORT=3201`, `WEB_PORT=3200` por defecto), los procesos que realmente estan escuchando, los healthchecks locales directos a Node, los checks pasando por Nginx con `Host: ganaderia.linsse.com`, los checks publicos por HTTPS y los `proxy_pass` efectivos de Nginx. Si despues de un `git pull` vuelve a fallar, revisa especialmente que `/etc/nginx/sites-enabled/ganaderia.linsse.com.conf` siga apuntando a `3201`/`3200` y no a `3001`/`3000`.

Si los checks directos a `127.0.0.1:3201` y `127.0.0.1:3200` funcionan pero los checks con Host o dominio fallan, el problema ya no esta en Node: revisa Nginx, DNS, certificado, firewall o si falta recargar Nginx. Para reinstalar la config del repo y recargar Nginx:

```bash
sudo cp deploy/nginx/ganaderia.linsse.com.conf /etc/nginx/sites-enabled/ganaderia.linsse.com.conf
sudo nginx -t
sudo systemctl reload nginx
```


## Importante: no mezclar formas de levantar la app

Hay dos formas posibles de operar el deploy:

1. **Script manual `deploy/restart-ganaderia.sh`**: baja procesos `node`/`next` anteriores y levanta API/web con `nohup`.
2. **Servicios systemd `eg-api.service` y `eg-web.service`**: Linux mantiene los procesos vivos y los reinicia si fallan.

Usa una sola forma a la vez. Si `sudo systemctl status eg-api.service` muestra `activating (auto-restart)` o `failed`, pero `curl http://127.0.0.1:3201/health` responde `200`, significa que probablemente la app esta corriendo por el script manual y systemd quedo instalado/fallando aparte. En ese caso elegi una opcion:

- Para seguir con el script manual: desactiva systemd para evitar ruido y reinicios paralelos.

```bash
sudo systemctl disable --now eg-api.service eg-web.service
./deploy/restart-ganaderia.sh
```

- Para usar systemd: reinstala las unidades del repo y maneja los reinicios con `systemctl`.

```bash
sudo ./deploy/systemd/install-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero
sudo systemctl restart eg-api.service eg-web.service
```

Logs:

- `/home/adminuser/EstablecimientoGanadero/api.log`
- `/home/adminuser/EstablecimientoGanadero/api.err`
- `/home/adminuser/EstablecimientoGanadero/web.log`
- `/home/adminuser/EstablecimientoGanadero/web.err`
