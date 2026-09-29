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

Producción está en **44 migraciones** y el árbol también. **Ninguna** pendiente:
el despliegue siguiente es solo de código.

Producción corre `4b9ac04d4c5a691041749b8281ccacc9254df794` (despliegue del
2026-09-29, nota abajo). Un commit posterior a ese que solo cambie
documentación —como el que escribe esta nota— **no se despliega por eso**.

---

## `4b9ac04d`: desplegado el 2026-09-29. La API de Gastos, sin migraciones

Despliegue **solo de código**: el merge de la PR #111, desde
`0e50ce5b14f886d4b6624352117cf564d75efd42`. No aplicó ninguna migración:
`20260929230000_gastos` ya estaba aplicada desde el despliegue anterior (nota de
abajo). **Lo que sigue es lo que informó el despliegue**, corrido desde el acceso
al VPS y no desde la sesión que escribe esta nota.

**Identidad.** `4b9ac04d4c5a691041749b8281ccacc9254df794` en `origin/main`, el
HEAD del VPS, la imagen, `APP_BUILD_ID`, `APP_IMAGE` y `/api/version`.

**Migraciones.** 44 en el árbol, **44 aplicadas**, ninguna pendiente ni
fallida, y `migrate status` cerró con "Database schema is up to date!". Sin
`migrate resolve`, sin recuperación, sin rollback y sin SQL de escritura a mano.

**Lo que llegó.** Las rutas `GET` y `POST /api/finanzas/gastos`,
`GET /api/finanzas/gastos/categorias`, `GET /api/finanzas/gastos/[gastoId]` y
`POST /api/finanzas/gastos/[gastoId]/pagos`, y `turnos-operativos` abriendo
también con el permiso de gastos. Sin sesión contestan 401. No se hizo una
sonda autenticada en producción porque no hay una documentada; la conducta con
sesión la cubren las pruebas contra PostgreSQL del CI de la PR #111
(`scripts/pruebas-db/gastosApi.mjs`).

**Los datos, sin cambios.** `CategoriaGasto` con sus **7** categorías; `Gasto` y
`PagoGasto` con **0** filas; `CajaMovimientoDePago` con **2**, las de la copia:
el movimiento 772 del `PagoProveedor` 1 y el 1030 del `PagoProveedor` 2.

**Los libros, intactos.**

- Libro de Costos: **ACTIVADO**, con la activación id 1 y su Punto Cero —3.131
  bases, 12.533 ubicaciones, **15.664** versiones PUNTO_CERO—, las huellas y los
  **6** triggers sin cambios.
- Libro de Stock: integridad física en verde, con el Punto Cero de **12.278**
  filas del 2026-09-28 00:19:13.587 UTC. Al control tenía 16.117 movimientos, de
  los cuales 3.839 SIN_ORIGEN: es el libro registrando la operación normal.

**El despliegue.**

- Backup PRE: `/srv/produccion/backups/pre-4b9ac04d_20260929_151334.sql.gz`,
  7.458.559 bytes, SHA-256
  `5a4f47ab157e4ded901007aa5c33e0a35090aa677c42498dcfa087229480955f`.
- Sonda PRE en verde (corrida 36588465366) y sonda POST en verde (corrida
  36588727965).
- Salud después: la app arriba y sin reinicios, PostgreSQL healthy y `/login`
  con 200. Sin errores nuevos, sin esperas de locks y sin transacciones largas.

---

## `20260929230000_gastos`: aplicada el 2026-09-29. El núcleo de Gastos

Salió de esta lista con el despliegue de `0e50ce5b14f886d4b6624352117cf564d75efd42`
(merge de la PR #110), desde `406cfb05ef35fb9496f831d5b10a975e05e90d06`. **Lo
que sigue es lo que informó el despliegue**, corrido desde el acceso al VPS y no
desde la sesión que escribe esta nota.

**Identidad.** El mismo SHA en `origin/main`, el HEAD del VPS, la imagen,
`APP_BUILD_ID`, `APP_IMAGE` y `/api/version`. Image ID final `sha256:4b5c3949…`
y digest del registro `sha256:8a3c0dd3…`: de los dos la evidencia trae solo el
prefijo, y no se completan.

**Migraciones.** 44 en el árbol, **44 aplicadas**, ninguna pendiente ni
fallida, y `migrate status` cerró con "Database schema is up to date!". El
clasificador la marcó **aditiva, "Sin coincidencias"**, y salió con 0: sin
autorización manual. Se aplicó **una sola vez**, con un paso, alrededor del
**2026-09-29 12:03:46 UTC**. La migración duró aproximadamente 347 ms y el
`migrate deploy` completo unos 6 s. En las 8 muestras tomadas mientras corría
no hubo ninguna espera de locks. Sin `migrate resolve`, sin recuperación, sin
rollback y sin SQL de escritura a mano.

**Lo que instaló.**

- Las tablas `CategoriaGasto`, `Gasto`, `PagoGasto` y `CajaMovimientoDePago`, y
  el enum `MedioPagoGasto` —`EFECTIVO`, `TRANSFERENCIA`, `MERCADO_PAGO`, `OTRO`—.
- 15 índices, 20 constraints, 2 funciones y **4 triggers** nuevos, los cuatro
  habilitados. Después del despliegue la base tiene 23 triggers no internos en
  total.
- La exclusividad del movimiento de caja: un `CajaMovimiento` no puede ser a la
  vez de un `PagoProveedor` y de un `PagoGasto`. La regla y su porqué están en
  [`docs/business-rules/gastos.md`](../business-rules/gastos.md).

**La copia de los pagos a proveedores.** Antes de migrar había **2**
`PagoProveedor` con `cajaMovimientoId`. Después, `CajaMovimientoDePago` tiene
exactamente **2** filas: el movimiento 772 del `PagoProveedor` 1 y el 1030 del
`PagoProveedor` 2. Ningún pago con movimiento quedó sin su fila, y no hay filas
huérfanas, ni movimientos inexistentes, ni duplicados.

**Los datos.** `CategoriaGasto` quedó con las **7** categorías iniciales,
activas: Servicios (10), Alquiler (20), Sueldos (30), Mantenimiento (40),
Insumos y limpieza (50), Impuestos (60) y Otros (100). `Gasto` y `PagoGasto`
quedaron con **0** filas: **el despliegue no creó ningún dato de negocio**.

**Los libros, sin cambios.**

- Libro de Costos: **ACTIVADO**, con su Punto Cero intacto —**15.664**
  versiones PUNTO_CERO—, la fila de activación intacta, los **6** triggers de la
  activación y las huellas sin cambios.
- Libro de Stock: integridad física en verde y Punto Cero intacto, con
  **12.278** filas de Punto Cero y **15.386** movimientos al momento de la
  verificación.

**El despliegue.**

- Backup PRE: `/srv/produccion/backups/pre-0e50ce5b_20260929_120206.sql.gz`,
  7.418.913 bytes, SHA-256
  `beeacd89ac8a208b5f7230b56572a49e7e17bbdbc909994198ff366944b22211`. `pg_dump`
  salió con 0 bajo `pipefail`, `gzip -t` limpio, la marca de dump completo
  presente y 81 tablas.
- Referencia de rollback: la imagen `sha256:7097efc8…`, de `406cfb05`.
- Sonda PRE en verde (corrida 36565494839) y sonda POST en verde (corrida
  36565746222), que confirmó `0e50ce5b14f886d4b6624352117cf564d75efd42`.
- Salud después: la app arriba y sin reinicios, PostgreSQL healthy y `/login`
  con 200. Sin errores de Prisma ni excepciones, sin transacciones largas, sin
  sesiones `idle in transaction` y sin esperas de locks.

---

## `20260929200000_libro_costo_activacion`: aplicada el 2026-09-29. Punto Cero del Libro de Costos

**Historia de costos confiable desde 2026-09-29 03:17:54.566 UTC
(2026-09-29 00:17:54 Argentina).**

Salió de esta lista con el despliegue de `406cfb05ef35fb9496f831d5b10a975e05e90d06`
(merge de la PR #109, que lleva también la #108), desde `e7161e1b`. **Lo que
sigue es lo que informó el despliegue**, corrido desde el acceso al VPS y no
desde la sesión que escribe esta nota.

**Identidad.** El mismo SHA en el HEAD del VPS, la imagen, `APP_BUILD_ID`,
`APP_IMAGE` y `/api/version`.

**Migraciones.** 43 en el árbol, **43 aplicadas**, ninguna fallida, y `migrate
status` cerró con "Database schema is up to date!". El clasificador marcó la
activación **aditiva** y salió con 0. Se aplicó el **2026-09-29 03:17:55 UTC,
al primer intento**, con un paso: sin recuperación tipada, sin `migrate
resolve` y sin ejecutar `libro_costo_activar()` a mano.

**El Punto Cero.**

- `libro_costo_estado()`: **ACTIVADO**.
- Un único instante, **2026-09-29 03:17:54.566 UTC**, y una única transacción,
  txid **120115**.
- `ProductoBase`: **3.131** filas → `CostoBaseVersion`: **3.131** versiones.
- `ProductoLocal`: **12.533** filas → `CostoUbicacionVersion`: **12.533**
  versiones.
- **15.664** versiones PUNTO_CERO en total, todas con origen
  `ACTIVACION_DEL_LIBRO_DE_COSTOS`, sin duplicados y sin huérfanos, y ninguna
  versión posterior al cutover al terminar la verificación.
- Huella base `1b3f562cf086ee0df5a96f220e8bb861`; huella ubicación
  `857c9bac43138f38364b1f4b3aedafd9`.
- `LibroCostoActivacion`: exactamente **1** fila —id 1, txid 120115,
  `versionDesde` 1, `versionHasta` 15666, 3.131 bases y 12.533 ubicaciones—.
- Los **6** triggers de la activación presentes una vez cada uno y habilitados:
  los de captura `ProductoBase_costo_version`, `ProductoLocal_costo_version` y
  `Local_costo_version`, y los tres `*_sin_truncate` de las tablas del libro.

**El despliegue.**

- Backup PRE: `/srv/produccion/backups/pre-406cfb05_20260929_031608.sql.gz`,
  7.218.125 bytes, SHA-256
  `64e8304bd958017ea7af197187f868bbca1c8c22680c0404c7b53a0115f8a646`.
- Sonda PRE en verde (corrida 36516395228) y sonda POST en verde (corrida
  36516568096).

**Lo que queda del procedimiento**, para leer si algún día hubiera que
restaurar un backup anterior a este punto y volver a aplicarla: el runbook —PRE,
diagnóstico, recuperación tipada, máximo dos intentos y POST— sigue en el skill
`/deploy`, "La excepción de la activación del Libro de Costos".

---

## `20260929120000_libro_costos`: aplicada el 2026-09-29. El Libro de Costos, instalado e inerte

Salió de esta lista con el despliegue de `e7161e1b` (merge de la PR #107). Lo
que sigue es lo que informó el despliegue desde el acceso al VPS. **Esta nota
llega tarde**: se escribe junto con la de la activación, porque la de aquel
despliegue no llegó a esta lista.

- Aplicada el **2026-09-29 01:17:04 UTC**.
- **El clasificador la marcó NO ADITIVA** por `BEFORE TRUNCATE ON` en la línea
  456. Era un falso positivo: esa línea está dentro del cuerpo de
  `libro_costo_activar()`, que la instalación define y no ejecuta. Se aplicó con
  `DEPLOY_MIGRACION_AUTORIZADA=1`, y la autorización quedó en la bitácora de la
  guardia alrededor de las 01:16 UTC.
- Después de aplicarla, `libro_costo_estado()` dijo **NO_ACTIVADO** y las tablas
  del libro quedaron vacías.
- Backup PRE: `pre-e7161e1b_20260929_011528.sql.gz`. De su SHA-256 esta nota
  solo tiene el prefijo, `ab9f6325…`: el resto no llegó a la evidencia y no se
  completa.
- Sonda PRE en verde (corrida 36507045916) y sonda POST en verde (corrida
  36507215578).

---

## `20260928150000_stock_diario_indice` y `20260928180000_libro_stock_baja_atomica`: aplicadas el 2026-09-28

Salieron de esta lista con el despliegue de `65162c8e` (merge de la PR #95). Lo
que sigue es lo que informó el despliegue desde el acceso al VPS. **Esta nota
también llega tarde**, por el mismo motivo.

- Las dos aplicadas el **2026-09-28 03:31:47 UTC**, en ese orden. Duraron
  aproximadamente 90 ms y 29 ms, respectivamente.
- El índice `MovimientoStock_localId_productoLocalId_dia_id_idx` quedó válido.
- El libro de stock quedó con **12** funciones `libro_stock_*` y **7**
  triggers —las 9 y los 5 de la instalación, más las 3 y los 2 de la
  corrección—, y su Punto Cero intacto.
- Backup PRE: `pre-65162c8e_20260928_033005.sql.gz`. De su SHA-256 esta nota
  solo tiene el prefijo, `f1ef145d…`: el resto no llegó a la evidencia y no se
  completa.
- Sonda PRE en verde (corrida 36373968696) y sonda POST en verde (corrida
  36374133508).

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
dos intentos y verificación POST— sigue en el skill `/deploy`, "La excepción de
`libro_stock` por lock timeout".

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

