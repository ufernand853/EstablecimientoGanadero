Uso en el server:

```bash
cd /home/adminuser/EstablecimientoGanadero
chmod +x deploy/restart-ganaderia.sh
./deploy/restart-ganaderia.sh
```

Que hace:

- actualiza `master`
- instala dependencias
- recompila `apps/web`
- reinicia API en `3201`
- exporta `API_INTERNAL_URL=http://127.0.0.1:3201` al levantar la web
- espera healthcheck real de la API
- reinicia web en `3200`
- espera respuesta real de la web

Puertos usados:

- API: `3201`
- Web: `3200`

Logs:

- `/home/adminuser/EstablecimientoGanadero/api.log`
- `/home/adminuser/EstablecimientoGanadero/api.err`
- `/home/adminuser/EstablecimientoGanadero/web.log`
- `/home/adminuser/EstablecimientoGanadero/web.err`
