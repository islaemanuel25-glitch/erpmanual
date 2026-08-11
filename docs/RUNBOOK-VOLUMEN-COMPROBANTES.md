# Runbook — crear el volumen de fotos de comprobantes

**Estado:** EN EJECUCIÓN el 2026-08-11, con autorización explícita de Emanuel.
El paso 1 quedó hecho antes; los pasos 2 a 5 van en esta tanda, después del
despliegue del código (que es lo que pone el chequeo del arranque adentro de la
imagen, sin lo cual el paso 4 no verificaría nada real).

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

**Se llama `comprobantes` y no `facturas`, a propósito.** El módulo maneja A, B y
recepciones sin factura; llamarle facturas al volumen confundiría al que lo lea
en seis meses. Los tres nombres van juntos: volumen `erpazul_comprobantes`, ruta
`/vol/comprobantes`, variable `COMPROBANTES_VOLUMEN_PATH`.

## Sin tope de tamaño, pero medido

No hay límite de tamaño y **hoy sería un número inventado**: con siete días de
vida y fotos de celular esto no debería pasar de unos cientos de megas, pero eso
es una estimación y no una medición. Lo que sí hay es que el ocupado **aparezca
solo**: el aviso de la campana lo lleva adentro (`medirOcupacion()` en
`almacenDisco.js`). Cuando haya varias semanas de uso, ese número es la medición
y recién ahí tiene sentido discutir un tope.

**Si algún día se llena, se rechaza la subida.** Nunca se borra lo más viejo para
hacer lugar: la ventana promete siete días, y adelantarse la rompe en silencio —
el que subió una foto ayer creería tener seis días y no los tendría, sin que nada
se lo diga. Rechazar también molesta, pero molesta de frente y a tiempo. El
mensaje está en `MOTIVO_ALMACEN.SIN_ESPACIO` y dice explícitamente que no se
borró nada, para que nadie "resuelva" el problema borrando.

## El centinela, que es la pieza clave

Dentro del volumen va un archivo `.volumen-comprobantes`. **Sin él, la aplicación se
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
arrancar, para que el problema se vea al levantar y no cuando alguien sube un
comprobante un sábado; y **antes de cada escritura**, porque un montaje se puede caer
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
ssh vps-erp 'docker volume create erpazul_comprobantes'
ssh vps-erp 'docker run --rm -v erpazul_comprobantes:/vol alpine sh -c "touch /vol/.volumen-comprobantes && ls -la /vol"'
```

El `ls` tiene que mostrar el centinela. Si no aparece, **parar acá**: sin
centinela la aplicación no va a escribir, y es mejor descubrirlo ahora.

### 2. Declararlo en el compose

En `docker-compose.prod.yml`, montarlo en el servicio `app` y declararlo abajo.
La ruta de adentro sale de `COMPROBANTES_VOLUMEN_PATH`, que gobierna el montaje
Y la variable del contenedor a la vez —misma variable, mismo default, no pueden
desfasarse—. Si se le quiere dar un valor distinto al default, va en `.env` junto a
`APP_IMAGE` —el `.env` de Compose, permisos 600— y **nunca en `.env.prod`**, por
la misma razón de siempre: ese es el `env_file` del contenedor y sus variables no
interpolan el compose.

⚠️ **`external: true` no es opcional**, y es la trampa de este paso. Sin eso,
Compose crea un volumen propio y le antepone el nombre del proyecto: quedaría
`erpazul_erpazul_comprobantes`, vacío, y el que se aprovisionó en el paso 1 —con
su centinela adentro— no se montaría nunca. La aplicación se negaría a escribir
por falta de centinela, que es el final bueno, pero por un motivo que costaría
entender. El nombre del proyecto se confirma con
`docker inspect erpazul_app --format '{{index .Config.Labels "com.docker.compose.project"}}'`.

⚠️ **No recrear `db` ni usar `docker compose down`.** Es la regla 4 del skill
`/deploy` y sigue valiendo acá: el servicio `db` fue creado fuera de Compose y
recrearlo lo levantaría sin contraseña.

⚠️ **El compose está versionado.** Editarlo a mano en el VPS deja el árbol sucio
y el próximo `git merge --ff-only` del despliegue se niega a correr. El cambio va
por el repo, y el VPS lo recibe con el merge — con su imagen, para que los cinco
valores del skill `/deploy` sigan coincidiendo.

### 3. Recrear solo la app

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml up -d --no-deps app'
```

### 4. Verificar que quedó montado DE VERDAD

```bash
ssh vps-erp 'docker exec erpazul_app ls -la /vol/comprobantes'
ssh vps-erp 'docker inspect erpazul_app --format "{{range .Mounts}}{{.Name}} -> {{.Destination}} ({{.Type}}){{println}}{{end}}"'
```

Tiene que verse el centinela **y** el montaje de tipo `volume`. Ver el directorio
vacío es exactamente el fallo que esto previene: significa que no está montado.

Y el log de la aplicación tiene que decirlo con todas las letras:

```bash
ssh vps-erp 'docker logs erpazul_app --since 5m 2>&1 | grep comprobantes'
```

Con el volumen bien: `[comprobantes] almacén de imágenes verificado en /vol/comprobantes`.
Cualquier otra cosa que empiece con `[comprobantes]` es el chequeo diciendo cuál de
los cuatro casos es. **Que no aparezca ninguna línea también es un problema**:
significa que `instrumentation.js` no corrió, y entonces esta verificación no
verificó nada.

### 5. La prueba que de verdad cierra

Escribir un archivo desde adentro del contenedor, **recrear la app**, y
comprobar que el archivo sigue estando:

```bash
ssh vps-erp 'docker exec erpazul_app sh -c "echo prueba > /vol/comprobantes/_prueba.txt"'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps app'
ssh vps-erp 'docker exec erpazul_app cat /vol/comprobantes/_prueba.txt && docker exec erpazul_app rm /vol/comprobantes/_prueba.txt'
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
