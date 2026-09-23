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

Producción está en **32 migraciones**. Falta:

- `20260923205422_pagos_a_proveedores` — aditiva: el enum `MedioPagoProveedor`,
  las tablas `CuentaPorPagarProveedor` y `PagoProveedor`, sus índices, claves
  foráneas y tres CHECK sobre esas mismas tablas nuevas. No toca filas ni
  columnas existentes y no hace backfill: las dos tablas nacen vacías. Viene de
  la rama `feat/finanzas-pagos-proveedores`, todavía sin mergear.

---

`20260923120000_costo_con_el_pie_del_245` salió de esta lista con el despliegue
de `d75a9a11`. El clasificador la marcó —`UPDATE "ProductoBase"`, línea 47— y
**Emanuel la autorizó expresamente** después de que se le informara qué escribe;
se aplicó con `DEPLOY_MIGRACION_AUTORIZADA=1`. El contenedor descartable informó
las **32** del árbol e imprimió "Applying migration".

Comprobada contra la base después de aplicarla: las cuatro fichas quedaron en
$6.283,85 (bases 1111, 1715, 1716) y $7.141,31 (base 2029), sus **veinte**
ubicaciones con el costo nuevo y el precio de venta recalculado con el margen de
cada una —8.900, 8.800, 8.200 y 10.000—, **cero** ubicaciones con el costo
viejo, y las cuatro líneas del comprobante 17 con su `costoFinalUnitario`
corregido.

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

