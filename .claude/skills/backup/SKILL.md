---
name: backup
description: Cadena de backup de la base — dump validado en el VPS, bajada verificada por SHA-256 a la notebook, disco externo y repo cifrado con gpg, con las cinco fallas que solo aparecieron ejecutándola.
disable-model-invocation: true
allowed-tools: Bash, PowerShell, Read
---

# Backup de la base de producción

Tres destinos, encadenados. Ninguna falla de un destino impide los otros: el
objetivo es maximizar las copias que sí se pueden hacer, no abortar en la
primera piedra.

**El VPS no empuja: la notebook tira.** El VPS no guarda ninguna credencial
hacia afuera. Si alguien lo compromete se lleva la base pero **no** los backups:
no tiene con qué llegar a ellos. El sentido del tráfico es parte del diseño y no
se invierte por comodidad.

## Los tres destinos que existen

Son **tres**, no cuatro. Los tres se ejecutan y se validan en cada corrida:

1. **VPS** `/srv/produccion/backups/` — 30 diarios, 12 semanales, 12 mensuales.
   Sin cifrar: está bajo control propio.
2. **Notebook** `%USERPROFILE%\Backups\erpazul\` — el diario, siempre. Sin
   cifrar.
3. **Repo privado `erpazul-backups` en GitHub** — solo semanal y mensual, y
   **cifrados con gpg**, porque salen de la máquina. El diario no va: git guarda
   todas las versiones para siempre y un `.gz` no comprime más, así que subir
   365 por año lo haría crecer sin freno.

### El cuarto destino no existe

El disco externo con etiqueta `BACKUP-ERP` está **previsto en el código y
condicional**: el script lo busca **por etiqueta y no por letra** —la letra
cambia según qué haya enchufado antes— y hoy no hay ningún volumen con esa
etiqueta. Cada corrida deja `disco_externo | NO CONECTADO` en el log y sigue de
largo, que es lo correcto.

**No se cuenta como copia** mientras no exista y no se haya validado una copia
real ahí. Al informar la cobertura de backup se dice tres, y el disco se
menciona aparte como previsto. Contarlo como cuarto destino es exactamente el
tipo de cuenta que hace creer que hay una copia de más.

Sumarlo no requiere tocar ningún script: formatear el disco, ponerle la etiqueta,
correr la tarea y comprobar que `ESTADO.txt` registre el destino con fecha.

## Eslabón 1 — El dump en el VPS

Timer de systemd **de usuario** (no root, no cron), todos los días 03:20 UTC,
con `Persistent=true`: si el server estuvo apagado a esa hora, la corrida se
ejecuta al arrancar en vez de perderse.

```bash
systemctl --user list-timers vps-backup-erpazul.timer
systemctl --user status vps-backup-erpazul.service
journalctl --user -u vps-backup-erpazul.service -n 50
systemctl --user start vps-backup-erpazul.service     # correrlo a mano
```

Script versionado en `ops/backup/vps-backup-erpazul.sh`, instalado en
`~/bin/vps-backup-erpazul.sh`.

**Verifica ANTES de rotar.** Si la verificación falla no borra nada y sale con
error, para que un backup roto nunca desplace a uno bueno. Un backup que falla
en silencio es peor que no tenerlo, porque uno cree que está cubierto.

Semanales y mensuales no son copias: son **enlaces duros** al diario de ese día.
No ocupan disco de más, y borrar el diario no se lleva los datos mientras quede
el semanal apuntando a ellos.

## Eslabón 2 — La bajada a la notebook

Tarea programada `ERP Azul - bajar backup`, 10:00, con `StartWhenAvailable`
para recuperar el día si la notebook estaba apagada.

```powershell
Get-ScheduledTaskInfo -TaskName "ERP Azul - bajar backup"
type %USERPROFILE%\Backups\erpazul\backup.log      # una línea por destino
type %USERPROFILE%\Backups\erpazul\ESTADO.txt      # última copia exitosa a cada destino
```

Correrla a mano, forzando también el envío al repo:

```powershell
powershell -ExecutionPolicy Bypass -File ops\backup\notebook-bajar-backup.ps1 -ForzarRepo
```

Hay `-Simular`: informa qué haría sin escribir en el repo ni en el disco.

**`LastTaskResult 0` no alcanza.** El script está hecho para no fallar cuando un
destino no está disponible, así que el 0 no dice que las copias se hicieron. Lo
que hay que mirar es `ESTADO.txt`.

## La validación, que es el punto

Sin esto solo sabemos que hay un archivo, no que sea el mismo ni que sirva.

**En el VPS**, cuatro chequeos antes de rotar:

- `pg_dump` salió con 0 — si no, se borra el parcial y se aborta.
- `gzip -t` sin salida.
- La marca `PostgreSQL database dump complete` **en las últimas 20 líneas**, no
  en la última: pg_dump 16 cierra con la marca y después un token `\unrestrict`.
- `grep -c '^CREATE TABLE'` ≥ 40.

**Al bajarlo**, el SHA-256 se compara contra el calculado **en el servidor**
(`sha256sum` remoto contra `Get-FileHash` local). Si no coincide, la copia se
**borra**: una copia que no verifica es peor que ninguna.

**Al copiar al disco externo**, el SHA-256 se vuelve a comparar entre origen y
destino.

### El quinto chequeo: solo cuando el deploy lleva una migración de DATOS

Los cuatro de arriba prueban que **el archivo está bien formado**: que el dump
terminó, que el gzip no está corrupto, que hay estructura adentro. Ninguno prueba
que contenga **lo que se está por borrar**.

Cuando el despliegue trae una migración que modifica o borra datos, el dump deja
de ser una red genérica y pasa a ser la única copia de esos valores. Así que se
verifica que estén:

```bash
ssh vps-erp 'zcat <DUMP> | grep -c "<UN_VALOR_QUE_LA_MIGRACION_VA_A_BORRAR>"'
```

Tiene que dar 1 o más. Se elige un valor concreto y reconocible de los que la
migración toca —no un nombre de tabla ni una palabra común—: en el vaciado de
códigos de barra del 2026-08-10 se usó `BOCADITO CHOC BLANCO`, uno de los códigos
que iban a pasar a NULL.

**Por qué importa la diferencia.** Un dump tomado sobre la base equivocada, o de
un momento en que esos valores ya no estaban, pasa los cuatro chequeos con las
mejores notas. Este es el único que responde la pregunta que de verdad importa el
día que haya que reponer: *¿esto que tengo acá tiene los valores viejos?*

Corolario: el chequeo también sirve como **prueba de que se sabe qué se está por
borrar**. Si no se puede nombrar un valor concreto para buscar, la migración no
está lo bastante entendida como para aplicarla.

#### Se verifica sobre la fila de la TABLA correcta, no sobre la primera coincidencia

El `grep -c` de arriba cuenta apariciones en todo el dump, y un nombre aparece en
muchas tablas. **Que dé un número alto no prueba nada**: hay que confirmar que el
valor está en la fila de la tabla que la migración toca.

Pasó el 2026-08-11. Se buscó el peso de referencia `620.000` de un producto
mirando la primera línea que nombraba el producto, y no estaba. El producto
aparecía **diez veces** en el dump: tres eran filas de `AuditoriaBitacora` —de
ediciones anteriores—, seis de detalles de pedidos, y **una sola** era la fila de
`ProductoBase`, que es la que la migración iba a modificar. Buscar en la primera
coincidencia daba un falso negativo; buscar sin mirar de qué tabla es cada una
habría dado un falso positivo igual de malo.

Cómo se hace bien: primero se ubican las apariciones con su número de línea, se
identifica cuál es la fila de la tabla que importa —se reconoce por la forma del
`COPY`: los primeros campos son el id y las claves foráneas del modelo—, y recién
ahí se busca el valor **en esa línea**:

```bash
ssh vps-erp 'F=<DUMP>
zcat "$F" | grep -n "<VALOR_O_NOMBRE>" | cut -c1-60          # ¿de qué tablas son?
zcat "$F" | sed -n "<LINEA_DE_LA_FILA_BUENA>p" | grep -o "<VALOR>"'
```

Y si la migración toca varias filas, se comprueban todas, no una de muestra.

Y la reposición fina —volver un valor sin restaurar la base entera— no sale de
acá: sale del SQL con los valores anteriores que tiene que traer la propia tanda.
El dump es el último recurso, porque restaurarlo se lleva puesto todo lo que pasó
desde que se sacó. Está desarrollado en el skill `/deploy`, en "Un rollback de
imagen NO deshace una migración".

## Las cinco fallas que solo aparecieron ejecutando

Ninguna era visible leyendo el código. Están todas resueltas en el script; están
acá para no reintroducirlas.

1. **`gpg` no está en el PATH de PowerShell.** Viene con Git para Windows y su
   carpeta `Git\usr\bin` no se agrega al PATH del sistema. Buscarlo con `gpg` a
   secas funciona en la terminal de Git Bash y falla en la tarea programada, que
   corre con el PATH de Windows. Se resuelve por ruta completa y se verifica **al
   arrancar**, no cuando se lo va a usar. Sin esto la tarea habría fallado todos
   los domingos como una línea de error perdida.
2. **`--passphrase-fd 0` cuelga el proceso.** Canalizar una cadena de PowerShell
   a la entrada estándar de un ejecutable nativo no cierra el descriptor: gpg se
   queda esperando, sin timeout, sin mensaje y sin terminar. Se usa
   `--passphrase-file` con un temporal que se borra en el `finally` aunque gpg
   falle. Tampoco `--passphrase` a secas: los argumentos de un proceso los puede
   leer cualquiera.
3. **`gpg --decrypt` a secas también cuelga.** Sin `--pinentry-mode loopback`
   intenta abrir un programa de contraseña gráfico que en Git Bash para Windows
   no existe: no da error, no pide la frase, no termina. El comando del propio
   documento de restauración tenía este bug.
4. **`git clone` escribe su progreso en stderr**, y Windows PowerShell 5.1 con
   `$ErrorActionPreference='Stop'` convierte cada línea de stderr de un `.exe` en
   un error que aborta el script. Un clon perfecto se veía como falla. Se
   resuelve bajando `$ErrorActionPreference` a `Continue` alrededor de la
   llamada nativa y mirando el código de salida.
5. **Un clon nuevo no puede commitear por falta de identidad de git.** La máquina
   no tiene identidad global. Se configura `user.name`/`user.email` **locales a
   ese clon**, no globales.

Y una sexta, de encoding: **el `.ps1` tiene que estar en UTF-8 CON BOM.** Windows
PowerShell 5.1 lee los `.ps1` sin BOM como ANSI y los acentos del log salen
rotos.

## La frase de cifrado

Vive en tres lugares: **papel** fuera de la notebook, **gestor de contraseñas**,
y una copia **operativa y desechable** en
`%USERPROFILE%\.erpazul-backup\frase-gpg.xml` protegida con DPAPI —solo la lee la
misma cuenta de Windows, en esa misma instalación—. Las dos primeras son las que
valen.

**Nunca imprimir la frase** en un informe, un log ni la salida de un comando.

Si al descifrar dice `decryption failed: Bad session key`, la frase está mal —
mirar que esté entera y sin espacios de más al copiarla.

## Restaurar

Restaurar es otro procedimiento y está escrito para el peor día, para seguirse
sin saber cómo funciona nada: **`docs/RESTAURACION-BACKUP.md`**. Dice dónde
buscar la frase de cifrado (paso 0) —no la frase, que no está escrita en ningún
archivo del repositorio—, de dónde sacar el archivo, cómo verificarlo antes de
tocar
producción, la restauración obligatoria en una base descartable primero, y qué
hacer si se formateó la notebook.

Lo único que no se negocia de ahí: **nunca restaurar directo sobre producción**,
y **sacar un dump del estado actual antes**, aunque esté roto — es lo único que
deja volver si la restauración sale mal.
