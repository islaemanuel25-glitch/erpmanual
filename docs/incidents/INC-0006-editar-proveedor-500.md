# INC-0006 — Editar un proveedor devuelve 500 desde el 2026-07-26, y nadie lo ve

**Fecha:** 2026-08-14
**Estado:** ABIERTO. Medido y diagnosticado; no arreglado.
**Alcance:** `/modulos/proveedores`, el lápiz de cada fila y cualquier entrada
por `?editar=<id>`. **Está en producción.**

## Qué pasa

**El modal de editar proveedor no abre nunca.** Medido con sesión real contra
`erpazul_dev`: **0 de 7 corridas**, determinista, entrando por
`/modulos/proveedores?editar=5`. Y por el camino normal es lo mismo: tocar el
lápiz de una fila navega a `/modulos/proveedores?editar=5` y ahí se queda.

**No se ve ningún error.** La pantalla no dibuja nada, no salta ningún cartel y
la URL conserva el parámetro. Desde afuera parece que el botón no hace nada.

Apareció **de rebote**, relevando si la carrera del `?editar=` de productos
estaba también en las otras siete pantallas que usan la convención. No lo es:
la URL sobrevive las siete veces. Es otra cosa, y peor.

## La causa, medida

Pidiendo la API desde la propia página, con su cookie:

    /api/proveedores/obtener?id=5  →  500  {"ok":false,"error":"Error interno"}

Y en el log del servidor, `PrismaClientValidationError` sobre
`prisma.proveedor.findFirst()`: **`grupoId` no es un argumento válido de
`ProveedorWhereInput`**.

`app/api/proveedores/obtener/route.js:42` filtra así:

    where: { id, grupoId: scope.grupoId }

**`Proveedor` no tiene `grupoId`, y el schema lo dice con todas las letras** en
el comentario de `prisma/schema.prisma:248`: *"`Proveedor` no tiene `grupoId` —es
compartido entre grupos, y las tablas que cuelgan de él llevan el suyo—"*.

## Desde cuándo, y si está desplegado

Lo introdujo `ba94fc2` el **2026-07-26**, `fix(security): completar aislamiento y
permisos por local`. **Está en `42e7e27`, que es el commit que corre hoy en
producción**, así que el botón viene roto desde esa fecha: diecinueve días al
escribir esto.

## Por qué no lo atrapó nada

Es la misma familia que la caída de comprobantes del 2026-08-12 —la del
`productoLocal` que no existía— y por los mismos dos motivos, los dos ya escritos
en `CLAUDE.md`:

1. **Una consulta de Prisma no la mira ni el build ni los candados.** El proyecto
   es JavaScript, así que Next compila sin revisar los argumentos, y los candados
   son funciones puras que no tocan la base. Falla recién contra Postgres — y
   habría fallado igual contra una base vacía, porque lo que se valida son los
   ARGUMENTOS y no el resultado.
2. **"Error interno" no dice nada.** El `catch` de la ruta tapa un mensaje que
   nombraba el campo exacto. Es la deuda anotada de los **188 archivos bajo
   `app/api` que contestan lo mismo**: el candado de mensajes que explican cubre
   solo las rutas del módulo de comprobante, y esta no es una de ellas.

## Qué habría que hacer, y por qué no se hizo acá

**El arreglo no es borrar el filtro**: sacarlo dejaría la ruta sin ningún alcance,
que es justo lo que `ba94fc2` vino a cerrar.

La forma correcta ya existe al lado y es la que manda la regla 1 —reusar, no
escribir una parecida—: `app/api/proveedores/listar/route.js:25` usa
`proveedorVisibleWhere(scope.localId, scope.grupoId)`, el predicado compartido de
`lib/visibilidad.js`, que es el que sabe de verdad qué proveedor ve quién.

**No se aplicó en esta tanda porque cambia QUIÉN VE QUÉ**, y eso es una decisión
de negocio, no una corrección de tipeo. Corresponde su propia tanda, con la
consulta ejercida contra Postgres antes de commitear y comprobando que esa corrida
atrapa la versión mala.

## Lo que queda sin verificar

**No se comprobó contra producción.** Todo lo de acá se midió contra
`erpazul_dev`. Lo que sí está comprobado es que **el código desplegado tiene la
misma línea**, así que el 500 es esperable — pero esperable no es medido.
