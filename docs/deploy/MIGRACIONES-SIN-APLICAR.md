# Migraciones que están en `main` y NO en producción

**Este archivo se lee en el paso 0 de `/deploy`, antes del backup.** Existe para
que el próximo despliegue sepa que trae migraciones **antes de arrancar**, y no
lo descubra a mitad de camino cuando el clasificador le informe un rango que ya
no es de cero.

Es una lista viva, no un histórico: **cuando una migración se aplica en
producción, se borra de acá** en el mismo commit que confirma el despliegue. Un
archivo que acumula filas viejas deja de decir qué falta y pasa a ser otra cosa
que hay que interpretar.

Si la lista está vacía, el despliegue es solo de código.

---

## Pendientes

**Ninguna.** Producción está al día: 98 migraciones en el árbol y 98 aplicadas,
comprobado con `prisma migrate status` el 2026-08-19.

La única que estaba anotada acá —`20260818120000_tarjeta_producto_por_local`— se
aplicó en el despliegue de `9979d00d0a90db0b125b483d71adcff506a87497`. Se borra
de la lista, que es lo que pide el encabezado; el detalle de qué hacía queda en
el mensaje de su commit y en el propio `migration.sql`, que es donde va a
buscarlo el que la necesite.
