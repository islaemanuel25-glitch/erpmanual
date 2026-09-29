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

Producción está en **39 migraciones**. El árbol trae **42**. Faltan tres, y Prisma
las aplica en este orden, que es el de sus nombres. Las dos primeras son independientes entre sí
—el índice no toca funciones ni triggers, y la corrección no toca índices—: se
comprobó aplicándolas juntas con Prisma sobre una base como la de producción.
`20260928180000_libro_stock_baja_atomica` ya está en `main` (PR #96), pero
mergeada no es desplegada: producción sigue en 39 hasta el próximo despliegue.

- `20260928150000_stock_diario_indice` — **aditiva**: un solo `CREATE INDEX`
  sobre `MovimientoStock` con las columnas `("localId", "productoLocalId", "dia", "id")`.
  No toca filas, columnas, funciones ni triggers del libro, y la migración del
  libro no se modifica. Es la que permite el Stock Diario de un local entero sin
  recorrer la historia de cada cadena (PR de Stock Diario, `lib/stock/libro/stockDiarioServer.js`).
  El clasificador la marca **aditiva, sin coincidencias**. Va sin `CONCURRENTLY`
  porque Prisma aplica cada migración dentro de una transacción: mientras se
  construye, bloquea las escrituras de `MovimientoStock` —y con ellas las de
  `StockLocal`, porque el trigger escribe en la misma transacción—. Con el libro
  del tamaño de hoy (del orden de doce mil filas y lo que se movió desde el punto
  cero) eso es una fracción de segundo; si el despliegue se demorara semanas,
  conviene medir las filas antes. Lo que hay que comprobar después de aplicarla:
  que `pg_indexes` muestre `MovimientoStock_localId_productoLocalId_dia_id_idx`
  con esas cuatro columnas, y que el verificador del libro siga en verde.
- `20260928180000_libro_stock_baja_atomica` — corrección preventiva del libro de
  stock. Reemplaza con `CREATE OR REPLACE` la función `libro_stock_registrar`
  (el trigger `StockLocal_libro` sigue apuntando a ella) y agrega dos funciones y
  dos triggers `BEFORE DELETE` sobre `ProductoLocal` y `ProductoBase` que
  recuerdan la identidad, local a la transacción. No toca ninguna tabla, columna
  ni fila del libro, no crea `ESTADO_INICIAL` y no mueve el punto cero; la
  migración `20260927120000_libro_stock` no se modifica. El clasificador la marca
  **aditiva, sin coincidencias** —no lee lo que cambia una función: esto SÍ
  cambia comportamiento, a propósito—: una sola sentencia que borra un
  StockLocal y su ProductoLocal ahora deja su BAJA, y un movimiento que no puede
  escribirse aborta la sentencia en vez de perderse. Sin tope de espera: el
  `CREATE TRIGGER` frena solo las escrituras sobre `ProductoLocal` y
  `ProductoBase` mientras confirma, no las lecturas ni `StockLocal`. Qué
  comprobar después de aplicarla: los triggers `ProductoLocal_libro_identidad` y
  `ProductoBase_libro_identidad` presentes, `libro_stock_identidad_de_baja`
  presente, el mismo conteo de `MovimientoStock` que antes, y el verificador del
  libro en verde.
- `20260929120000_libro_costos` — el Libro de Costos, **INERTE**: tres tablas
  nuevas (`CostoBaseVersion`, `CostoUbicacionVersion`, `LibroCostoActivacion`),
  el enum `TipoVersionCosto`, la secuencia `libro_costo_seq`, funciones
  `libro_costo_*` y seis triggers sobre esas mismas tablas nuevas (inmutabilidad
  y "solo escribe el libro"). **No crea ningún trigger sobre `ProductoBase`,
  `ProductoLocal` ni `Local`, no escribe punto cero y no toca ninguna fila,
  columna ni función existente**: aplicarla no cambia ninguna escritura. Sin
  tope de espera y sin candado sobre tablas existentes. Lo que hay que
  comprobar después: `SELECT * FROM libro_costo_estado()` dice **NO_ACTIVADO**, y
  las tres tablas están vacías. **La activación NO va en este despliegue**: será
  una migración propia `<fecha>_libro_costo_activacion`, con autorización
  expresa y el procedimiento de `docs/architecture/libro-de-costos.md`.

---

## `20260927120000_libro_stock`: aplicada el 2026-09-28. Punto cero del libro de stock

**Historia física de stock confiable desde 2026-09-28 00:19:13.587 UTC
(2026-09-27 21:19:13.587 Argentina).**

Salió de esta lista con el despliegue de `8d393aa0615a0955ed20d972e16f6acd1f730792`
(merge de la PR #93, que lleva también la #92), desde
`7717064821426cbfb988ae72061c0af955fdddf0`. **Lo que sigue es lo que informó el
despliegue**, corrido desde el acceso al VPS y no desde la sesión que escribe
esta nota: son datos de producción que esta sesión no puede ni debe mirar.

**Una corrección a lo que decía esta lista.** Decía que producción estaba en 37 y
que `20260926195732_correccion_caja` estaba pendiente. Era falso:
`correccion_caja` ya estaba aplicada desde el **2026-09-26 20:53:12 UTC** y NO se
aplicó en esta tanda. La lista quedó desfasada porque la nota de aquel despliegue
no llegó a escribirse. En este despliegue entró UNA sola migración, la del libro.

**Migraciones.** 39 en el árbol, **39/39 aplicadas contadas por nombre**, ninguna
pendiente y ninguna fallida sin resolver. `libro_stock` se aplicó **al primer
intento**: la recuperación tipada de la PR #93 **no hizo falta**.

**El punto cero.**

- `StockLocal` al activar: **12.278** filas.
- `ESTADO_INICIAL`: **12.278** filas, exactamente una por fila de `StockLocal`,
  sin huérfanos y sin duplicados, todas con origen `ACTIVACION_DEL_LIBRO`.
- Un único instante: **2026-09-28 00:19:13.587 UTC** = 2026-09-27 21:19:13.587
  Argentina. Día argentino persistido: **2026-09-27**.
- Los **5 triggers** activos y las **9 funciones** `libro_stock_*` presentes.
- El verificador, inmediatamente después: integridad física **VERDE**.
- Al correr el verificador aparece el aviso de Node `MODULE_TYPELESS_PACKAGE_JSON`.
  Es cosmético —Node reparsea el módulo como ES— y no afectó el resultado. No se
  corrige en esta nota.

**El primer movimiento real**, registrado como evidencia y no como dato de prueba:
una venta que ocurrió naturalmente, no generada para probar el libro.

- Venta **29040**, local **4**, productoLocal **7440**.
- `MovimientoStock` **12279**, tipo `CAMBIO`, cantidad **15 → 14**.
- Instante del movimiento **2026-09-28 00:19:55.571 UTC**; la venta se creó a las
  00:19:55.573 UTC.
- Origen `SIN_ORIGEN`. **No es una falla de integridad**: los escritores
  productivos todavía no declaran origen. La cantidad es verdadera; lo que falta
  clasificar es la causa.
- La procesó **la aplicación anterior**, que seguía atendiendo entre migrar y
  recrear, y la capturó el trigger de PostgreSQL. Queda demostrado en producción
  que la captura física no depende de que la app nueva esté levantada.

**El despliegue.**

- Backup PRE: `/srv/produccion/backups/pre-8d393aa0_20260928_001748.sql.gz`,
  SHA-256 `26b31570805b91883b7375b6adca6f4b94e992ac93cbacdda1b92b14bf5f0cb6`.
- Sonda PRE en verde (corrida 36361707501) y sonda POST en verde (corrida
  36361832011).
- Corte real de la aplicación: **3 segundos**.
- PostgreSQL siguió healthy y no se reinició.

**Lo que queda del procedimiento de esta migración**, para leer si algún día
hubiera que restaurar un backup anterior a este punto y volver a aplicarla: el
runbook completo —precheck, candado de la activación, recuperación tipada, máximo
dos intentos y verificación POST— sigue en el skill `/deploy`, "La única
excepción ya autorizada".

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

