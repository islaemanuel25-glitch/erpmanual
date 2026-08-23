# Runbook — el volumen de fotos de producto

**Esto hay que correrlo en el VPS ANTES de desplegar la tanda que trae "Cargar
foto".** Sin el volumen creado y con su centinela adentro, la aplicación se
niega a guardar fotos y lo dice: el resto del ERP sigue andando normal.

Es el hermano de `RUNBOOK-VOLUMEN-COMPROBANTES.md` y comparte casi todo. Lo que
cambia está marcado.

---

## Por qué es un volumen aparte y no una carpeta del de comprobantes

**Porque los comprobantes se borran a los siete días y estas fotos no se borran
nunca.**

`DIAS_DE_VIDA = 7` es una decisión escrita en `retencionImagen.js`, con su
comentario explicando que borrar antes de tiempo rompe una promesa en silencio.
Guardar acá una foto de producto la pondría en ese reloj: andaría una semana y
después la tarjeta mostraría un cuadrado roto, sin ningún error y sin que nadie
relacione una cosa con la otra.

Las protecciones sí se reusan —el centinela, la traducción de errores de
escritura, la detección de disco lleno—. Lo único que no se comparte es el lugar.

---

## Por qué hace falta un centinela

Si el volumen no está montado, **Docker crea igual el directorio del punto de
montaje**, vacío. La escritura funciona, el archivo se guarda, nadie ve un error
— y todo eso está pasando en el disco del contenedor, que se borra al recrearlo.
Es la peor forma de fallar: silenciosa, y el daño aparece un despliegue después.

El centinela es un archivo que se deja al aprovisionar el volumen y que vive
adentro de él. Si el volumen está montado, el centinela está. Comprobar solo que
el directorio exista NO alcanza: el directorio siempre existe.

---

## Los pasos

**1. Crear el volumen.** El nombre es exacto: el compose lo declara
`external: true`, así que si no coincide no se monta y Compose no avisa.

```
docker volume create erpazul_fotos_productos
```

**2. Dejar el centinela adentro.** El nombre también es exacto — lo lee
`lib/productos/almacenFotos.js`:

```
docker run --rm -v erpazul_fotos_productos:/vol alpine \
  sh -c 'touch /vol/.volumen-fotos-productos && ls -la /vol'
```

Tiene que listar `.volumen-fotos-productos`.

**3. Permisos.** El contenedor escribe con su usuario; si no puede, la
aplicación lo dice con el motivo "el volumen está montado pero no se puede
escribir". Se corrige con el mismo criterio que el de comprobantes.

**4. Comprobar que la aplicación lo ve**, después de recrear:

```
docker logs erpazul_app --since 5m 2>&1 | grep -i "fotos"
```

---

## Cómo se comprueba que quedó bien, de verdad

No alcanza con que el comando no falle. La prueba es **subir una foto desde la
pantalla de un producto y después recrear el contenedor y volver a mirarla**: si
sigue ahí, el volumen está montado. Si desaparece, se escribió en el disco del
contenedor y el centinela no estaba donde tenía que estar.

Es el mismo criterio que el resto del repo: verificar ejecutando, no leyendo.

---

## El backup

**Este volumen ESTÁ en la cadena de backup**, desde el 2026-08-22. No es una
contradicción con `DEC-0008` —que dejó afuera las fotos de comprobante— y el
contraste está escrito en `DEC-0009`: aquéllas se borran a los siete días por
diseño y respaldarlas sería guardar lo que ya decidimos tirar; éstas no se borran
nunca y son parte del catálogo.

### Qué se guarda y dónde

El mismo timer que saca el dump de la base saca también un paquete del volumen:
`fotos-diario-AAAAMMDD_HHMMSS.tar.gz`, en `/srv/produccion/backups/`, con series
semanal y mensual por enlace duro igual que la base.

**Retiene menos copias que la base** —14 diarias, 8 semanales, 12 mensuales— y el
motivo es el tamaño: el dump pesa unos 2,7 MB y el paquete de fotos crece con el
catálogo. Lo que hace que eso igual alcance es que las fotos **no cambian**: el
nombre lleva un azar adentro, así que una foto nueva es un archivo nuevo y
ninguna se pisa. Cuando el volumen no cambió de un día para el otro, el paquete
del día es un **enlace duro** al anterior y no ocupa nada.

**No va al repo git cifrado, y eso es a propósito.** Ahí van el semanal y el
mensual de la base porque pesan megabytes; git guarda todas las versiones para
siempre, así que meter un paquete que puede llegar a cientos de MB haría crecer
el repo sin techo y sin poder deshacerlo. El paquete de fotos va a la notebook y
al disco externo, que es una copia menos que la base. Está aceptado en
`DEC-0009`.

### Qué se verifica, y por qué no alcanza con `gzip -t`

Un tar **vacío** está perfectamente bien comprimido. Si el volumen no estuviera
montado, Docker crearía igual el punto de montaje y el paquete saldría bien: unos
bytes, sin nada adentro, y el log diría que todo salió. Por eso son cuatro
preguntas y no una:

1. El volumen existe y **tiene su centinela** — antes de empaquetar.
2. El `.gz` está entero (`gzip -t`).
3. El tar se puede listar y **el centinela está adentro del paquete**. Es la
   marca de cierre del dump traducida a este formato: prueba que se empaquetó el
   volumen y no un directorio que se le parecía.
4. Se cuentan las fotos por su forma de nombre. **Cero fotos NO es un error** —es
   lo que hay antes de que alguien cargue la primera— pero queda registrado.

Si algo de eso falla, el paquete se borra y **no se rota nada**: un respaldo roto
no desplaza a uno bueno.

**El respaldo de fotos corre DESPUÉS de que el dump ya está verificado y
rotado.** Si el volumen no está, el servicio queda en rojo con código 3, pero el
backup de la base del día ya quedó bueno. Al revés se cambiaría un riesgo chico
por el más grande que hay.

---

## La restauración

### Restaurar el volumen entero

Con el paquete en el VPS —bajado de la notebook o del disco externo—:

```
# 1. El volumen tiene que existir. Si se perdió, se crea de nuevo.
docker volume create erpazul_fotos_productos

# 2. Se vuelca el paquete adentro. `-C /vol` porque las rutas del tar son
#    relativas: no dependen de dónde estaba montado cuando se sacó.
docker run --rm -i -v erpazul_fotos_productos:/vol alpine \
  tar -xzf - -C /vol < /srv/produccion/backups/fotos-diario-AAAAMMDD_HHMMSS.tar.gz

# 3. Comprobar que el centinela quedó adentro: sin él la aplicación se niega a
#    escribir, y con razón.
docker run --rm -v erpazul_fotos_productos:/vol:ro alpine \
  sh -c 'test -f /vol/.volumen-fotos-productos && ls -1 /vol | wc -l'
```

El último comando imprime cuántos archivos quedaron. **Ese número se compara
contra el que el backup registró en su log** —"paquete con N foto(s)"— y tienen
que coincidir. Sin esa comparación, "el comando no falló" es lo único que se
sabe, y un tar que se cortó a la mitad tampoco falla al extraer.

### Restaurar UNA foto sola

Pasa más seguido que perder el volumen: alguien borró un archivo o una fila
quedó apuntando a algo que no está.

```
tar -xzf fotos-diario-AAAAMMDD_HHMMSS.tar.gz -O ./p2023-0a1b2c3d.webp > /tmp/foto.webp
docker cp /tmp/foto.webp erpazul_app:/vol/fotos-productos/p2023-0a1b2c3d.webp
```

El nombre sale de `ProductoBase.imagen_url`: es lo último de la url.

### Cómo se comprueba que la restauración FUNCIONA, no que el comando salió con 0

**Este es el paso que no se saltea**, y es el mismo criterio que el resto del
repo: verificar ejecutando.

1. Restaurar el paquete en un volumen **descartable**, no en el de producción:
   `docker volume create prueba_fotos` y extraer ahí.
2. Contar los archivos y comparar contra el número del log del backup.
3. Comprobar que el centinela está.
4. Abrir una de las fotos y ver que es una imagen de verdad —`file` dice el
   formato— y no un archivo truncado con el nombre correcto.
5. Borrar el volumen de prueba.

```
docker volume create prueba_fotos
docker run --rm -i -v prueba_fotos:/vol alpine tar -xzf - -C /vol < <paquete>
docker run --rm -v prueba_fotos:/vol:ro alpine sh -c \
  'ls -1 /vol | wc -l; test -f /vol/.volumen-fotos-productos && echo "centinela OK"'
docker run --rm -v prueba_fotos:/vol:ro alpine sh -c \
  'for f in /vol/p*; do file "$f"; break; done'
docker volume rm prueba_fotos
```

### RESTAURACIÓN EJERCIDA — 2026-08-22

**Se corrió de punta a punta y dio verde.** No es una lectura del procedimiento:
hay un script que lo ejecuta, y lo que ejecuta son **las mismas funciones que
corren en producción**.

    bash ops/backup/probar-restauracion-fotos.sh

Carga `ops/backup/respaldar-fotos.sh` —el mismo archivo que carga el backup del
VPS— y llama a `respaldar_fotos`, `restaurar_fotos` y `verificar_restauracion`.
No transcribe los pasos: los corre. Una prueba que copia los comandos prueba la
copia, y el día que el respaldo cambie sigue verde mientras la restauración real
deja de andar.

Qué afirmó, sobre un volumen de mentira con **cinco PNG reales** y un archivo que
no es foto:

1. El respaldo registró **5 fotos** y dejó afuera el archivo que no lo es.
2. El paquete existe y no está vacío.
3. Se extrajo en un destino descartable.
4. **La cantidad restaurada coincide con la registrada** (5 contra 5).
5. El centinela está en lo restaurado.
6. Los cinco archivos son **byte a byte idénticos** al original **y siguen siendo
   imágenes**, comprobado por la firma del PNG y no por la extensión — un `.png`
   lleno de texto tiene extensión de imagen y no se puede dibujar.
7. El archivo que no era foto viajó igual: el respaldo guarda el volumen entero,
   el patrón filtra el CONTEO y no lo que se guarda.
8. **Contraprueba:** con una foto de menos, la verificación falla.
9. **Contraprueba:** sin centinela, la verificación falla.

El entorno descartable se borra al salir, con un `trap`, incluso si algo falla en
el medio. No toca producción: todo pasa en un directorio temporal.

#### Lo que ESTA prueba encontró

El patrón que cuenta las fotos estaba escrito como `${PATRON_FOTO:=…{8}…}`, y
**bash corta ese default en la primera llave de cierre** — la de `{8}`. El patrón
quedaba truncado y no matcheaba ningún nombre.

Eso no rompía nada visible: el respaldo se hacía igual, el paquete quedaba bien,
y el log decía "paquete con 0 foto(s)" **para siempre**. La verificación de la
restauración habría comparado 0 contra 0 y dado verde sobre un volumen lleno.
Leyendo el script no se ve; corriéndolo, sí.

#### Lo que esta prueba NO ejerce, y hay que decirlo

**El envoltorio de Docker.** En producción el volumen se lee con
`docker run --rm -v vol:/vol:ro alpine tar …`; en la prueba se lee un directorio
directo, por `FOTOS_DIR_DIRECTO`. Son las dos ramas de tres funciones cortas
—`volumen_disponible`, `centinela_presente`, `empaquetar_volumen`— y lo único que
cambia es cómo se llega a los bytes: el `-C <raíz> .` y todo lo que viene después
es el mismo código.

O sea que **el montaje del volumen se prueba la primera vez en el VPS**, cuando
se cree. El paso está en la sección de arriba: subir una foto, recrear el
contenedor y ver que sigue ahí.
