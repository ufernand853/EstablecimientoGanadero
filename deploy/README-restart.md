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
- instala los servicios systemd persistentes y reinicia/valida la API en `3201`
- exporta `API_INTERNAL_URL=http://127.0.0.1:3201` al levantar la web
- espera healthcheck real de la API
- arranca el build web nuevo en el puerto temporal `3299` y lo valida antes de
  interrumpir la web que esta en produccion
- reinicia web en `3200` mediante systemd y espera una respuesta real
- deja API y web supervisadas con reinicio automatico, incluso si un proceso
  termina limpiamente de forma inesperada

El orden es deliberado: si la API nueva no logra iniciar (por ejemplo, por una
variable de entorno o un error de arranque), el script termina pero deja la web
anterior respondiendo. Asi Nginx no queda mostrando `502 Bad Gateway` para todo
el sitio a causa de un fallo previo al reinicio del frontend. Lo mismo ocurre si
el build web nuevo no puede arrancar durante la prevalidacion: los detalles
quedan en `web-preflight.err`/`web-preflight.log` y la instancia anterior sigue
atendiendo en `3200`.

Si el puerto temporal esta ocupado por otro servicio, el script busca
automaticamente otro libre en los 100 puertos siguientes sin detener ese
servicio. El puerto inicial tambien se puede cambiar con
`WEB_PREFLIGHT_PORT=3298 ./deploy/restart-ganaderia.sh`. El reinicio solo libera
los puertos de Ganaderia que tiene configurados; no detiene otras aplicaciones
Next.js del servidor.

### Si el navegador ya muestra `502 Bad Gateway`

Ese mensaje lo genera Nginx cuando no puede conectarse a la web en `3200`. En el
servidor, actualiza el checkout y ejecuta el reinicio completo:

```bash
cd /home/adminuser/EstablecimientoGanadero
git pull --ff-only origin master
./deploy/restart-ganaderia.sh
```

Si el reinicio no termina en `Listo.`, conserva su error y ejecuta:

```bash
sudo ./deploy/verify-ports.sh
tail -n 100 api.err api.log web.err web.log
```

No hace falta reiniciar Nginx cuando el problema es que `127.0.0.1:3200` no
responde; primero hay que recuperar el proceso web con el script anterior.
Los healthchecks tienen tiempos limite para que una conexion bloqueada no deje
el deploy esperando indefinidamente.

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

La version actual imprime `VERIFY_PORTS_VERSION=2` al comienzo y termina con una seccion `Resultado comprobado`, seguida por `Diagnostico OK` o `Diagnostico FALLIDO`. Si la salida termina solamente en `Resumen esperado`, el servidor esta ejecutando una copia anterior del script: comproba `git rev-parse HEAD`, actualiza `master` y volve a ejecutarlo.

El script compara los puertos esperados (`API_PORT=3201`, `WEB_PORT=3200` por defecto), los procesos que realmente estan escuchando, los healthchecks locales directos a Node, los checks pasando por Nginx con `Host: ganaderia.linsse.com`, los checks publicos por HTTPS y los `proxy_pass` efectivos de Nginx. Si despues de un `git pull` vuelve a fallar, revisa especialmente que `/etc/nginx/sites-enabled/ganaderia.linsse.com.conf` siga apuntando a `3201`/`3200` y no a `3001`/`3000`.

Si los checks directos a `127.0.0.1:3201` y `127.0.0.1:3200` funcionan pero los checks con Host o dominio fallan, el problema ya no esta en Node: revisa Nginx, DNS, certificado, firewall o si falta recargar Nginx. Para reinstalar la config del repo y recargar Nginx:

```bash
sudo cp deploy/nginx/ganaderia.linsse.com.conf /etc/nginx/sites-enabled/ganaderia.linsse.com.conf
sudo nginx -t
sudo systemctl reload nginx
```


## Procesos persistentes

`deploy/restart-ganaderia.sh` instala y usa las unidades systemd del repo. De
esta forma no quedan procesos `nohup` sin supervision que puedan terminar y
dejar a Nginx sin upstream (el `502` de la captura). Para reinstalar las
unidades manualmente:

```bash
sudo ./deploy/systemd/install-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero
sudo systemctl restart eg-api.service eg-web.service
```

Logs:

```bash
sudo journalctl -u eg-api.service -u eg-web.service -n 100 --no-pager
```
