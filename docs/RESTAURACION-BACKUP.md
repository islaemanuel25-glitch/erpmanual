# Restaurar la base de producción desde un backup

Este documento es para el peor día. Está escrito para seguirse tal cual, sin
saber de antemano cómo funciona el sistema de backups.

---

## PASO 0 — La frase de cifrado

**Leé esto antes que nada.** Si el backup que vas a restaurar termina en `.gpg`,
sin la frase no sirve para nada y ningún otro paso importa.

La frase está en dos lugares:

1. **Anotada en papel**, fuera de la notebook. Es la copia que sobrevive a todo.
2. **En el gestor de contraseñas**, buscando "ERP Azul" o "backup".

Son ocho palabras y cuatro dígitos separados por guiones, así:
`palabra-palabra-palabra-palabra-palabra-palabra-palabra-palabra-1234`. Los
guiones son parte de la frase.

Existe además una tercera copia, **operativa y desechable**, en
`%USERPROFILE%\.erpazul-backup\frase-gpg.xml`. La usa la tarea automática para
cifrar sin intervención. Está protegida con DPAPI: **solo la puede leer el usuario
`emanuel` en esa misma instalación de Windows**. Si formateaste la notebook, ese
archivo ya no sirve — y no importa, porque las copias 1 y 2 son las que valen.

Para verla desde la notebook actual, si la tenés a mano:

    powershell -NoProfile -Command "$s = Import-Clixml '%USERPROFILE%\.erpazul-backup\frase-gpg.xml'; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"

Los backups **diarios NO están cifrados**: viven en el VPS y en la notebook, que
son lugares bajo tu control. Solo los semanales y mensuales que van al repo de
GitHub están cifrados, porque salen de tu máquina.

---

## PASO 1 — Elegir de dónde sacar el backup

Hay tres destinos. Mirá primero cuál está más al día:

    type %USERPROFILE%\Backups\erpazul\ESTADO.txt

Ese archivo dice la fecha de la última copia exitosa a cada destino. Si alguna
está vieja o dice `NUNCA`, ese destino no sirve para esta restauración.

| Dónde | Qué tiene | Cifrado |
|---|---|---|
| VPS `/srv/produccion/backups/` | 30 diarios, 12 semanales, 12 mensuales | no |
| Notebook `%USERPROFILE%\Backups\erpazul\` | los diarios bajados | no |
| Repo `erpazul-backups` en GitHub | semanales y mensuales | **sí, gpg** |
| Disco externo, etiqueta `BACKUP-ERP` | los diarios, si estaba conectado | no |

**Si el VPS está vivo**, es la fuente más rápida y más al día. **Si perdiste el
VPS**, usá la notebook; y si tampoco la tenés, el repo de GitHub.

---

## PASO 2 — Obtener el archivo

### Opción A: desde el VPS

    ssh vps-erp
    ls -lht /srv/produccion/backups/ | head -20
    cat /srv/produccion/backups/ULTIMO_DIARIO.txt

### Opción B: desde la notebook

    dir %USERPROFILE%\Backups\erpazul\

### Opción C: desde el repo de GitHub (backups cifrados)

    git clone https://github.com/islaemanuel25-glitch/erpazul-backups.git
    cd erpazul-backups
    dir

Descifrar, con la frase del PASO 0. Se hace en dos comandos: primero la frase va
a un archivo temporal, después se descifra leyéndola de ahí.

    # 1. Escribí la frase en un archivo. Reemplazá por la tuya, entre comillas simples.
    printf '%s' 'ocho-palabras-y-cuatro-digitos-aca' > /tmp/frase.txt

    # 2. Descifrar
    gpg --batch --pinentry-mode loopback --passphrase-file /tmp/frase.txt \
        --output semanal-20260808_010805.sql.gz \
        --decrypt semanal-20260808_010805.sql.gz.gpg

    # 3. Borrá la frase en cuanto termines
    rm -f /tmp/frase.txt

**Por qué no se escribe `gpg --decrypt` a secas.** Sin `--pinentry-mode loopback`,
gpg intenta abrir un programa de contraseña gráfico que en Git Bash para Windows
no existe, y **se queda colgado sin decir nada** — no da error, no pide la frase,
no termina. Está probado. Si te pasó, cortá con Ctrl+C y usá los comandos de
arriba.

Si al descifrar dice `decryption failed: Bad session key`, la frase está mal.
Fijate en los guiones y en que no haya espacios de más al copiarla.

---

## PASO 3 — Verificar el archivo ANTES de restaurar

No te saltees esto. Restaurar sobre producción con un dump truncado deja la base
peor que antes.

    gzip -t semanal-20260808_010805.sql.gz          # sin salida = está sano

    zcat semanal-20260808_010805.sql.gz | tail -20 | grep "database dump complete"
    # tiene que imprimir: -- PostgreSQL database dump complete

    zcat semanal-20260808_010805.sql.gz | grep -c "^CREATE TABLE"
    # tienen que ser 56 o más

En Windows, `gzip` y `zcat` vienen con Git Bash.

---

## PASO 4 — Restaurar

### 4.a — Primero en una base DESCARTABLE (hacé siempre esto)

Nunca restaures directo sobre producción. Probá en una base aparte y comprobá los
datos. Toma menos de un minuto.

    ssh vps-erp
    docker exec erpazul_db psql -U erpazul -d postgres -c "DROP DATABASE IF EXISTS erpazul_prueba_restore"
    docker exec erpazul_db psql -U erpazul -d postgres -c "CREATE DATABASE erpazul_prueba_restore"
    zcat /srv/produccion/backups/ARCHIVO.sql.gz | docker exec -i erpazul_db psql -U erpazul -d erpazul_prueba_restore

Comprobá que los datos estén:

    docker exec erpazul_db psql -U erpazul -d erpazul_prueba_restore -c \
      "SELECT 'Venta' t, count(*) FROM \"Venta\"
       UNION ALL SELECT 'ProductoBase', count(*) FROM \"ProductoBase\"
       UNION ALL SELECT 'ProductoLocal', count(*) FROM \"ProductoLocal\"
       UNION ALL SELECT 'Usuario', count(*) FROM \"Usuario\"
       UNION ALL SELECT 'Turno', count(*) FROM \"Turno\""

Si los números tienen sentido, seguí. Si no, probá con otro backup más viejo.

Cuando termines, borrá la base de prueba:

    docker exec erpazul_db psql -U erpazul -d postgres -c "DROP DATABASE erpazul_prueba_restore"

### 4.b — Sobre producción

**Antes de tocar nada, sacá un dump del estado actual**, aunque esté roto: si la
restauración sale mal, es lo único que te deja volver.

    docker exec erpazul_db pg_dump -U erpazul -d erpazul --no-owner --no-acl \
      | gzip -9 > /srv/produccion/backups/ANTES-DE-RESTAURAR-$(date +%Y%m%d_%H%M%S).sql.gz

Bajá la app para que nadie escriba mientras restaurás:

    cd /srv/produccion/erpazul
    docker compose stop app

Reemplazá la base:

    docker exec erpazul_db psql -U erpazul -d postgres -c "DROP DATABASE erpazul"
    docker exec erpazul_db psql -U erpazul -d postgres -c "CREATE DATABASE erpazul"
    zcat /srv/produccion/backups/ARCHIVO.sql.gz | docker exec -i erpazul_db psql -U erpazul -d erpazul

Levantá la app. **`--no-deps` no es opcional**: sin eso Compose intenta recrear
PostgreSQL, que fue creado fuera de Compose.

    docker compose up -d --no-deps app
    docker compose ps
    curl -s -o /dev/null -w "%{http_code}\n" https://operix.cloud/login    # tiene que dar 200

---

## PASO 5 — Después de restaurar

Comprobá que las migraciones estén al día. Si el backup era más viejo que la
última migración, hay que aplicarlas:

    docker run --rm --network host --env-file /srv/produccion/erpazul/.env.prod \
      ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO_ACTUAL> \
      prisma migrate deploy

El SHA que está corriendo se ve con:

    curl -s https://operix.cloud/api/version

---

## Cómo funciona el sistema de backups

Por si necesitás tocarlo o entender por qué algo no corrió.

### En el VPS

Un timer de systemd **de usuario** (no root, no cron) corre todos los días a las
03:20 UTC. `Persistent=true`: si el server estuvo apagado a esa hora, la corrida
se ejecuta al arrancar en vez de perderse.

    systemctl --user list-timers vps-backup-erpazul.timer
    systemctl --user status vps-backup-erpazul.service
    journalctl --user -u vps-backup-erpazul.service -n 50

El script está en `~/bin/vps-backup-erpazul.sh` y versionado en
`ops/backup/vps-backup-erpazul.sh`. Verifica el dump —gzip íntegro, marca de
cierre, 40 tablas o más— **antes** de rotar los viejos: si la verificación falla,
no borra nada y sale con error, para que un backup roto nunca desplace a uno bueno.

Correrlo a mano:

    systemctl --user start vps-backup-erpazul.service

Semanales y mensuales no son copias: son **enlaces duros** al diario de ese día,
así que no ocupan disco de más.

### En la notebook

Tarea programada `ERP Azul - bajar backup`, todos los días a las 10:00, con
`StartWhenAvailable` para recuperar el día si la notebook estaba apagada.

    Get-ScheduledTaskInfo -TaskName "ERP Azul - bajar backup"

Baja el diario, **verifica el SHA-256 contra el del servidor** y descarta la copia
si no coincide. Después la distribuye: disco externo si está conectado, y repo
cifrado los domingos y el día 1.

Log y estado:

    type %USERPROFILE%\Backups\erpazul\backup.log      # historial, una línea por destino
    type %USERPROFILE%\Backups\erpazul\ESTADO.txt      # última copia exitosa a cada destino

Correrla a mano, forzando también el envío al repo:

    powershell -ExecutionPolicy Bypass -File ops\backup\notebook-bajar-backup.ps1 -ForzarRepo

### Sumar el disco externo

Está previsto y no hay que tocar ningún script. Formateá el disco y ponele
**etiqueta `BACKUP-ERP`**. El script lo busca por etiqueta y no por letra, porque
la letra cambia según qué haya enchufado antes. Mientras no esté, cada corrida
deja en el log `disco_externo | NO CONECTADO` y continúa con los demás destinos.

### Si formateaste la notebook

1. Instalá Git para Windows (trae `ssh`, `scp`, `gpg` y `gzip`).
2. Restaurá la clave SSH del VPS y el alias `vps-erp` en `~/.ssh/config`.
3. Recreá la copia operativa de la frase, sacándola del papel o del gestor:

       $f = Read-Host "frase" -AsSecureString
       New-Item -ItemType Directory -Path %USERPROFILE%\.erpazul-backup -Force
       $f | Export-Clixml %USERPROFILE%\.erpazul-backup\frase-gpg.xml

4. Volvé a registrar la tarea programada con el bloque que está en
   `ops/backup/README-tarea-windows.txt`.
