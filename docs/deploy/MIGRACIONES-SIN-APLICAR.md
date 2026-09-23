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

Producción está en **31 migraciones** y el árbol en **32**. Falta aplicar:

- `20260923120000_costo_con_el_pie_del_245` — **migración de DATOS**. Corrige el
  costo de los CUATRO productos del pedido 245 que se cerraron con "Aceptar el
  precio nuevo" antes de `9af324bf`, o sea con el precio sin los conceptos del
  pie: bases 1715, 1716, 1111 (de $6.131,82 a $6.283,85) y 2029 (de $6.968,54 a
  $7.141,31), más el precio de venta de cada ubicación recalculado con SU margen,
  que es lo que hace el camino normal del costo. Los quince renglones cerrados
  con "Dejar el que tenía" NO se tocan. Cada UPDATE lleva en el WHERE el costo y
  la venta que corrige, así que es idempotente y no puede pisar una corrección
  posterior.

  **El quinto chequeo del backup SÍ aplica**: hay valores que se sobrescriben.
  Comprobar que el dump traiga los costos viejos —$6.131,82 y $6.968,54— antes
  de aplicarla.

---

`20260922170000_conceptos_del_pie` salió de esta lista con el despliegue de
`8972abae`: el contenedor descartable informó las **31** del árbol, imprimió
"Applying migration" y `migrate status` cerró con "Database schema is up to
date!". Comprobada contra la base releyendo el comprobante 17 del pedido 245: la
columna guardó los tres conceptos que el papel de Arcor imprime, con la
percepción de IVA de **$12.386,34**, y el comprobante pasó a CARGADO.

`20260922150000_variacion_normal_de_precios` salió de esta lista con el
despliegue de `75b41311`: el contenedor descartable informó las **30** del
árbol, imprimió "Applying migration" y `migrate status` cerró con "Database
schema is up to date!". Comprobado contra la base después de aplicarla: las
**cuatro** recetas que existen quedaron con la variación en **10**, que es el
DEFAULT y lo que se quería.

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

