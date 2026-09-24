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

Producción está en **33 migraciones**. Falta:

- `20260924230000_semana_operativa_ubicacion` — aditiva en estructura: el enum
  `OrigenSemanaOperativa`, la tabla `SemanaOperativaVigencia`, su único por
  (ubicación, fecha), su clave foránea a `Local`, un CHECK del día 0..6 y un
  único parcial de "desde siempre", los dos últimos escritos a mano. SÍ trae
  backfill: INSERTA en la tabla nueva una vigencia "desde siempre" por cada
  local cuyos acuerdos de `AcuerdoDepositoLocal`, en su grupo actual, dicen un
  solo día. No modifica ni borra ninguna fila existente; los locales en
  conflicto, sin acuerdo y el depósito quedan sin configurar, y la migración no
  falla por ellos. Cuáles son lo dice `scripts/diagnostico-semana-operativa.mjs`,
  de solo lectura, que necesita la tabla nueva y por eso sirve recién después
  de aplicarla. Viene de la rama `feat/semana-operativa-canonica`, todavía sin
  mergear.

---

`20260923205422_pagos_a_proveedores` salió de esta lista con el despliegue de
`0a688b5d`, que llevó a producción los merges #65 (Pagos a proveedores) y #66
(cierre de compras con deuda y pago al proveedor) desde `5f85056c`. Es aditiva:
el enum `MedioPagoProveedor`, las tablas `CuentaPorPagarProveedor` y
`PagoProveedor`, sus índices, claves foráneas y tres CHECK sobre esas mismas
tablas nuevas, sin tocar filas ni columnas existentes y sin backfill. El
clasificador, corrido sobre el rango `5f85056c..0a688b5d`, la marcó **aditiva**
y sin coincidencias, y fue la única migración nueva del rango.

**Lo que se comprobó desde fuera del VPS:** `https://operix.cloud/api/version`
contesta 200 con `buildId` `0a688b5db711a3710ed68dc53b7ada68cf4daa1c`, el mismo
SHA que `origin/main`.

**Lo que informó el despliegue**, corrido desde el acceso al VPS y no desde la
sesión que escribe esta nota: producción quedó con **33** migraciones,
`prisma migrate status` cerró con "Database schema is up to date!", y las dos
tablas nuevas existen y **nacieron vacías**. Esto último es lo que cierra la
pregunta de si había pagos históricos con un origen distinto de la ubicación de
la deuda: antes de este despliegue las tablas no existían en producción, así
que no hay ninguno.

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

