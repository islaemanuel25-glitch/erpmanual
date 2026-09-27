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

Producción está en **37 migraciones**. El árbol trae **39**: dos pendientes.

- `20260926195732_correccion_caja` (PR "infraestructura de corrección histórica
  de caja"): una tabla NUEVA, `CorreccionCaja`, vacía, con su único por
  `codigo` y un índice por `ejecutadoEn`. **Aditiva**: no toca ninguna tabla
  existente, sin UPDATE, sin backfill, sin DROP. No corrige ningún dato: las
  correcciones se aplican después desde la app, una por una, con permiso propio
  y un plan autorizado. La versión anterior no lee la tabla, así que la ventana
  entre migrar y recrear no cambia nada.
- `20260927120000_libro_stock` (PR "libro histórico físico de stock — punto
  cero"): dos tablas NUEVAS, `MovimientoStock` y `ReinterpretacionDeStock`, el
  enum `TipoMovimientoStock`, nueve funciones y cinco triggers: uno sobre
  `StockLocal` que registra cada cambio de cantidad o tránsito, dos sobre
  `ProductoBase` y `Local` que dejan constancia de los cambios de unidad, y dos
  que hacen inmutable el libro. **Sin UPDATE, sin DROP, sin tocar columnas
  existentes.** SÍ inserta: una fila `ESTADO_INICIAL` por cada fila de
  `StockLocal`, que es el punto cero del libro. El clasificador la marca
  **aditiva**, pero avisa que no lee adentro de un bloque `DO`, y la activación
  ES un bloque `DO`. Lo que hay que saber antes de desplegarla:
  - **Toma un candado.** `SHARE ROW EXCLUSIVE` sobre `StockLocal`,
    `ProductoBase` y `Local` mientras copia el punto cero: las ventas y los
    ajustes ESPERAN (no fallan) hasta que confirma. Medido en la sesión de
    desarrollo: 28 ms con 4.000 filas, 64 ms con 10.000, 283 ms con 50.000,
    764 ms con 100.000. Conviene desplegar fuera del horario de venta.
  - **Tope de espera de 3 s.** Si hay una transacción larga escribiendo stock
    —una importación—, la migración FALLA en vez de trabar el POS. No deja nada
    a medias (probado), pero Prisma la registra como fallida, y reintentarla
    pide `prisma migrate resolve --rolled-back 20260927120000_libro_stock`, que
    la guardia de migraciones rechaza siempre. Si pasa, frenar y avisar a
    Emanuel: no hay un camino ya autorizado para reintentarla.
  - **La app vieja sigue andando.** Nada de su código cambia; sus escrituras
    quedan en el libro como `SIN_ORIGEN`, que es lo esperado.
  - **Después de aplicarla**, `node --import ./scripts/alias-loader.mjs
    scripts/verificar-libro-stock.mjs` (solo lectura) tiene que dar la
    integridad física en VERDE, y el punto cero tiene que tener tantas filas
    como `StockLocal`.

---

`20260926122404_cierre_sin_conteo` (PR #82) salió de esta lista con el
despliegue de `ad7c8109` del 2026-09-26, que llevó a producción los merges #81
(candados del ciclo de cierre, `c1000c8c`, sin migraciones) y #82 (cerrar sin
conteo un corte vencido, `ad7c8109`). Es aditiva: el valor `CERRADO_SIN_CONTEO`
en el enum `EstadoCierrePreparacion` y tres columnas NULLABLE sin default en
`CierrePreparacion` —`cerradoSinConteoEn`, `cerradoSinConteoPorUsuarioId`,
`motivoCierreSinConteo`—. Sin UPDATE, sin backfill, sin DROP.

**Lo que informó el despliegue**, corrido desde el acceso al VPS y no desde la
sesión que escribe esta nota: producción quedó en `ad7c81097e3f0e12c87d28e3f122466049ae7c89`
con **37** migraciones aplicadas, ninguna pendiente ni fallida, la
`20260926122404_cierre_sin_conteo` aplicada, y `migrate status` cerró con
"Database schema is up to date!". Cortes en `CERRADO_SIN_CONTEO`: **cero**, que
es lo esperado: la migración no escribe filas y la acción todavía no se usó.

---

`20260925195156_stock_ingresado_congelado` (PR #79) y
`20260926020000_decision_precio_costo_observado` (PR #80) salieron de esta lista
con el despliegue de `9f18267d` del 2026-09-26. Las dos son aditivas y el
clasificador las marcó **aditivas**: la primera, el enum `UnidadFisicaStock` y
dos columnas NULLABLE sin default en `PedidoProveedorDetalle`; la segunda, una
columna NULLABLE sin default en `DecisionDePrecioProveedor`. Ninguna trae UPDATE
ni backfill.

**Lo que informó el despliegue**, corrido desde el acceso al VPS y no desde la
sesión que escribe esta nota: el contenedor descartable informó las **36** del
árbol y aplicó las dos, y `migrate status` cerró con "Database schema is up to
date!". Backup previo `pre-9f18267d_20260926_095724.sql.gz`; sonda PRE en verde
(corrida 36234263719) y sonda POST en verde (corrida 36234366185).

---

`20260924230000_semana_operativa_ubicacion` salió de esta lista porque
producción ya la tiene aplicada: lo informó Emanuel el 2026-09-25, al pedir la
tanda de la pantalla de Semana operativa (PR-2). Llegó a `main` con el merge del
PR #75 (`f0394d83`). **Esta nota la escribe una sesión de desarrollo, que no
mira el VPS**: el dato es el que dio Emanuel, no una verificación propia. Es
aditiva en estructura —el enum `OrigenSemanaOperativa`, la tabla
`SemanaOperativaVigencia`, su único por (ubicación, fecha), su clave foránea a
`Local`, un CHECK del día 0..6 y un único parcial de "desde siempre"— y SÍ traía
backfill: insertó una vigencia "desde siempre" por cada local cuyos acuerdos de
`AcuerdoDepositoLocal`, en su grupo actual, decían un solo día, sin modificar ni
borrar ninguna fila existente. Qué ubicaciones quedaron sin configurar lo dice
`scripts/diagnostico-semana-operativa.mjs`, de solo lectura.

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

