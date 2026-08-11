# Runbook — crear el volumen de fotos de facturas

**Estado:** ESCRITO, NO EJECUTADO. Nadie lo corrió todavía.

Es una tanda **propia**, de infraestructura, y **no se mezcla con un despliegue
de código**. El motivo está medido, no es preferencia: el 2026-08-10 un
despliegue con migración falló porque `APP_IMAGE` apuntaba al SHA viejo, y
detectarlo llevó lo que llevó justamente porque había dos cosas nuevas en la
misma ventana. Con dos fuentes de error simultáneas, la primera que falla tapa a
la otra.

## Qué se crea

Un volumen en el VPS para las fotos de comprobantes. **No entra al backup** —ver
`docs/decisions/DEC-0008`— porque las fotos se borran a los siete días por
diseño.

## El centinela, que es la pieza clave

Dentro del volumen va un archivo `.volumen-facturas`. **Sin él, la aplicación se
niega a escribir.**

El motivo: si el volumen no está montado, Docker **igual crea el directorio del
punto de montaje**, vacío. La escritura funciona, el archivo se guarda, nadie ve
un error — pero está escribiendo en el disco del contenedor y se pierde al
recrearlo. Comprobar que el directorio exista **no alcanza**: siempre existe.

El centinela distingue las dos cosas: si el volumen está montado, está; si no,
el directorio está vacío.

El criterio vive en `lib/compras-proveedor/comprobante/almacenImagenes.js`, que es
puro y tiene sus candados; el que mira el disco es
`lib/compras-proveedor/comprobante/almacenDisco.js`. Comprueba **dos veces**: al
arrancar, para que el problema se vea al levantar y no cuando alguien sube una
factura un sábado; y **antes de cada escritura**, porque un montaje se puede caer
después de arrancar y ahí el chequeo del arranque ya pasó y no protege nada.

**Los dos fallan distinto, y es a propósito.** El del arranque —que corre desde
`instrumentation.js`, que Next llama solo— **avisa en el log y sigue**: si tumbara
el proceso, un volumen de fotos sin montar dejaría sin POS a los cinco locales, y
no vender es mucho peor que no poder subir una foto. El de la escritura —
`exigirAlmacen()`— **sí frena**, y es el que protege de verdad.

Probado con el servidor real, no leído: sin la variable, con el volumen montado y
con el directorio vacío, las tres salidas son las de abajo y en los tres casos el
servidor llegó a `Ready`.

## Los pasos

### 1. Crear el volumen y su centinela

```bash
ssh vps-erp 'docker volume create erpazul_facturas'
ssh vps-erp 'docker run --rm -v erpazul_facturas:/vol alpine sh -c "touch /vol/.volumen-facturas && ls -la /vol"'
```

El `ls` tiene que mostrar el centinela. Si no aparece, **parar acá**: sin
centinela la aplicación no va a escribir, y es mejor descubrirlo ahora.

### 2. Declararlo en el compose

En `docker-compose.prod.yml`, montarlo en el servicio `app` y declararlo abajo.
La ruta de adentro va también en `.env` como `FACTURAS_VOLUMEN_PATH`, junto a
`APP_IMAGE` —el `.env` de Compose, permisos 600— y **nunca en `.env.prod`**, por
la misma razón de siempre: ese es el `env_file` del contenedor y sus variables no
interpolan el compose.

⚠️ **No recrear `db` ni usar `docker compose down`.** Es la regla 4 del skill
`/deploy` y sigue valiendo acá: el servicio `db` fue creado fuera de Compose y
recrearlo lo levantaría sin contraseña.

### 3. Recrear solo la app

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml up -d --no-deps app'
```

### 4. Verificar que quedó montado DE VERDAD

```bash
ssh vps-erp 'docker exec erpazul_app ls -la /vol/facturas'
ssh vps-erp 'docker inspect erpazul_app --format "{{range .Mounts}}{{.Name}} -> {{.Destination}} ({{.Type}}){{println}}{{end}}"'
```

Tiene que verse el centinela **y** el montaje de tipo `volume`. Ver el directorio
vacío es exactamente el fallo que esto previene: significa que no está montado.

Y el log de la aplicación tiene que decirlo con todas las letras:

```bash
ssh vps-erp 'docker logs erpazul_app --since 5m 2>&1 | grep facturas'
```

Con el volumen bien: `[facturas] almacén de imágenes verificado en /vol/facturas`.
Cualquier otra cosa que empiece con `[facturas]` es el chequeo diciendo cuál de
los cuatro casos es. **Que no aparezca ninguna línea también es un problema**:
significa que `instrumentation.js` no corrió, y entonces esta verificación no
verificó nada.

### 5. La prueba que de verdad cierra

Escribir un archivo desde adentro del contenedor, **recrear la app**, y
comprobar que el archivo sigue estando:

```bash
ssh vps-erp 'docker exec erpazul_app sh -c "echo prueba > /vol/facturas/_prueba.txt"'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps app'
ssh vps-erp 'docker exec erpazul_app cat /vol/facturas/_prueba.txt && docker exec erpazul_app rm /vol/facturas/_prueba.txt'
```

Si el archivo sobrevivió a la recreación, el volumen es real. **Este paso no se
saltea**: es el único que distingue un volumen de un directorio del contenedor, y
todo lo anterior puede dar bien con el volumen mal.

## Qué hacer si algo falla

**El centinela no está después de montar** → el volumen no se montó. Revisar el
compose antes de tocar nada más.

**La aplicación arranca y se queja del almacén** → está funcionando como debe.
El mensaje dice cuál de los cuatro casos es: sin ruta, sin directorio, sin
centinela o sin permiso de escritura. Los cuatro se arreglan distinto y por eso
son cuatro mensajes distintos.

**El archivo de prueba no sobrevivió a la recreación** → se estaba escribiendo en
el disco del contenedor. Es el fallo silencioso que motivó todo esto.

## Lo que este runbook NO hace

- No despliega código. Si hay commits pendientes, van en su propia ventana.
- No toca el backup. El volumen queda afuera a propósito.
- No crea el barrido diario: ese es un timer de systemd y va en otra tanda, con
  `Persistent=true` como el del backup.
