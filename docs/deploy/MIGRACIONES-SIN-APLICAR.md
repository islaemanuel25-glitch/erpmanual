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

Producción está en **29 migraciones** y el árbol en **30**. Hay **una**
pendiente.

- `20260922150000_variacion_normal_de_precios`

**Qué hace:** agrega a `RecetaProveedor` la columna `variacionNormalPct`
(decimal 5,2, **NOT NULL con DEFAULT 10**): cuánto se le mueve el precio a ese
proveedor sin que sea raro. Un 9 % es normal en uno que actualiza todos los
meses y es una señal de lectura mal hecha en uno que no movió un precio en medio
año — el mismo número no significa lo mismo en los dos.

**Aditiva: sin DROP, sin backfill y sin cambio de tipo.** Las filas que ya están
toman el 10 % por el DEFAULT, que es exactamente lo que se quiere; no hay ningún
`UPDATE`.

**La ventana entre migrar y recrear no rompe nada:** el código viejo no conoce
la columna.

**El quinto chequeo del backup NO aplica:** no se borra ni se transforma nada.

---

`20260922143000_restaurar_costo_hamburguesa` salió de esta lista con el
despliegue de `b345ba3e`: el contenedor descartable informó las **29** del
árbol, imprimió "Applying migration" y `migrate status` cerró con "Database
schema is up to date!".

**Comprobada contra la base después de aplicarla, que es lo que corresponde a
una migración de DATOS:** la ficha y las cinco ubicaciones quedaron en costo
**61703** y venta **80300**, y las ventas del producto desde el cambio siguen
en **cero**.

**El clasificador la marcó NO ADITIVA y frenó**, que es lo que tiene que hacer
con todo `UPDATE`. Se aplicó con `DEPLOY_MIGRACION_AUTORIZADA=1` porque la tanda
que la pidió trae la autorización explícita de Emanuel con los valores exactos
—"restaurá el costo al que tenía antes del cierre"— y no por criterio de quien
desplegaba.

