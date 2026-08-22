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

## Pendiente anotado: el backup

**Este volumen NO está en la cadena de backup todavía, y a diferencia del de
comprobantes sí tendría que estarlo.**

Aquéllas son fotos de papeles que se tiran a la semana —por eso `DEC-0008` las
dejó afuera a propósito—. Éstas son parte del catálogo: si se pierde el volumen,
se pierden todas las fotos de los productos y hay que sacarlas de nuevo una por
una.

Mientras eso no esté hecho, **el riesgo es real y conviene decirlo con el número
que corresponda**: a 1200 px comprimidos son unos cientos de KB por producto, así
que el catálogo entero con foto entra en pocos cientos de MB. No es un problema
de tamaño; es un pendiente de la cadena de backup.
