# Orden para ERP VPS FULL — extracto del catálogo de Arcor

Este archivo existe para poder copiar **una sola cosa** sin arrastrar el resto del
plan. Lo que está entre las dos líneas de guiones se pega tal cual en la sesión
**ERP VPS FULL**, que es la que corre en el VPS.

## Por qué hace falta

El plan de `docs/planes/listas-proveedor.md` tiene un solo número sin medir:
**cuántas filas quedan para preguntar con la regla nueva y datos verdaderos.**
Para calcularlo hace falta el costo que cada producto de Arcor tiene hoy, y eso
vive únicamente en producción.

## Qué respeta la orden

- **No restaura nada** y **no levanta ningún contenedor.** `pg_restore` se usa en
  modo "sacar a un archivo", que es procesamiento de archivo y no toca PostgreSQL.
- **No escribe una sola fila** en ninguna base.
- **No commitea nada** a ningún repositorio.
- Trabaja fuera del repo y borra lo que crea.
- El extracto son cuatro columnas por producto y ni una más: no lleva nombres de
  clientes, ni usuarios, ni precios de venta, ni nada que no sea necesario para la
  cuenta.

## Cómo vuelve el resultado

El archivo es chico —del orden de 40 KB— y **Emanuel lo adjunta en el chat de esta
sesión**, que es el mismo camino por el que llegó el Excel. No hay ruta de red
entre el VPS y la máquina donde corre este plan: no hay ssh, y subirlo a un
servicio externo sería publicar datos de producción.

---

Necesito un extracto de SOLO LECTURA del catálogo de Arcor para terminar de medir
el módulo de listas de proveedor. Se hace desde el ÚLTIMO BACKUP VALIDADO, no
contra la base viva, y con estas condiciones que no se negocian: no se restaura
ninguna base, no se levanta ningún contenedor, no se escribe una sola fila en
ninguna base, y nada de esto se commitea a ningún repositorio.

Trabajá en un directorio temporal fuera del repo y borralo al final.

1. Ubicá el último backup validado de producción y desciframos a ese directorio
   temporal, con el procedimiento del skill /backup. No lo restaures: solo
   necesitás el archivo de dump descifrado.

2. Del dump, sacá los datos de estas cuatro tablas usando `pg_restore --data-only
   --table=<tabla>` a archivos de texto sueltos. Esto NO carga nada en PostgreSQL:
   `pg_restore` con `-f` es procesamiento de archivo.

   Proveedor, ProductoBase, ProductoCodigoProveedor, ImportacionListaProveedor

3. Con un script de Node que lea esos archivos de texto, armá UN SOLO CSV con
   punto y coma como separador, con estas cinco columnas y esta cabecera exacta:

   codigoInterno;factorPack;unidadMedida;precioCosto;activo

   Una fila por cada `ProductoCodigoProveedor` cuyo `proveedorId` sea el de Arcor
   —el proveedor cuyo `parserListaId` vale `ARCOR_XLSX`— unida a su `ProductoBase`
   por `productoBaseId`. `precioCosto` es `ProductoBase.precio_costo`, con punto
   decimal y sin separador de miles. `activo` es el de `ProductoCodigoProveedor`.

   No incluyas ninguna otra columna. Nada de nombres, descripciones, precios de
   venta, márgenes, usuarios ni fechas.

4. Aparte, decime en el chat estos cuatro datos sueltos, que son para poder
   comparar contra lo que ya medí y no van en el CSV:

   - el `archivoHash` y el `totalFilas` de CADA importación de lista que exista,
     con su id y su estado;
   - cuántos `ProductoBase` de Arcor tienen `factor_pack` en null;
   - cuántos tienen `precio_costo` en cero o en null;
   - el nombre del archivo del backup que usaste y su fecha.

5. Guardá el CSV como `catalogo-arcor.csv`, decime cuánto pesa y cuántas filas
   tiene, y borrá el dump descifrado y todos los intermedios. Confirmame que los
   borraste.

Cuando esté, Emanuel lo adjunta en el chat de la sesión del plan de listas.

Si algo de esto no se puede hacer sin restaurar, sin levantar algo o sin escribir
en la base, FRENÁ y decime qué es. No busques un camino alternativo por tu cuenta.

---
