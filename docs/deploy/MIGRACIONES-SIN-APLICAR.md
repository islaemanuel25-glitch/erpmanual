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

Producción está en **44 migraciones**. Cuando se mergee la rama
`claude/libro-costos-activation-migration-nmej1m` (la trazabilidad del Libro de
Stock) el árbol pasa a **45**, con **una** pendiente:

- `20260930120000_auditoria_stock_motivo_principal` — **aditiva**. Una columna
  nullable `motivoPrincipal` en `AuditoriaStock` y un CHECK que solo admite
  "Faltante", "Producto dañado", "Sobrante" y "Otro". **No toca ninguna fila**:
  todas las existentes quedan en NULL, y el CHECK las acepta así. Sin DROP, sin
  backfill, sin bloqueo largo —agregar una columna nullable sin default es
  instantáneo en PostgreSQL, y el CHECK valida una tabla cuya columna nueva está
  toda en NULL—.

Lo que llega con ella **no es solo esquema**: desde ese despliegue cada
escritor de `StockLocal` declara su origen en el Libro de Stock. Los
movimientos anteriores quedan `SIN_ORIGEN` para siempre —el libro es
inmutable— y no se les deduce ninguno.

Con la rama `claude/caja-por-operador` el árbol pasa a **46**, con una segunda
pendiente, **que tiene precheck obligatorio**:

- `20261002120000_caja_por_operador` — **solo índices, ningún dato**, y con
  PRECHECK obligatorio antes de migrar (abajo).

Reemplaza el índice único parcial
`Turno_local_vendedor_abierto_key` (una caja operativa por **cuenta** y local)
por dos —`Turno_local_operador_abierto_key` (una por **operador** y local) y
`Turno_local_cuenta_sin_operador_abierto_key` (una por cuenta y local cuando el
turno no tiene operador)—. Sin backfill, sin DROP de columnas, sin tocar una
fila. Todo en un único bloque `DO` —una sentencia, todo o nada—, con el patrón
de `libro_stock`: tope de espera de **3 s** (`lock_timeout`) y `Turno` tomada en
ACCESS EXCLUSIVE al principio. Mientras se construyen los dos índices, `Turno`
no se lee ni se escribe: sobre una tabla chica son milisegundos.

**Puede abortar, por dos motivos, y eso es lo que hay que saber antes.**

- Si en producción hay un operador con dos cajas operativas en el mismo local
  —el índice viejo lo permitía con dos cuentas distintas—, la guardia aborta
  nombrando los turnos, **sin elegir ni cerrar ninguno**.
- Si una transacción retiene `Turno` más de 3 s, la migración falla por el tope
  en vez de quedarse esperando y encolar detrás de ella todo el POS.

En los dos casos la base queda exactamente como estaba, pero la migración queda
FALLIDA, y esta migración **no tiene autorizado `migrate resolve`** en
`/deploy`: el despliegue se frenaría con la imagen nueva esperando. Sin
recuperación automática: FRENAR e informar.

Por eso, **antes del backup y de cualquier migración**, se corre el precheck de
solo lectura, con el mismo comando que `precheck-libro-stock.sql`:

    ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -f - < scripts/deploy/precheck-caja-por-operador.sql'

- **VERDE** (sale 0, "PRECHECK: VERDE"): se sigue con el despliegue.
- **ROJO** (sale distinto de 0): **FRENAR, no desplegar.** Dice por qué:
  - `operador-con-dos-cajas` / `cuenta-con-dos-cajas`: imprime los ids de los
    turnos. Resolverlo es cerrar la caja que sobra **desde la aplicación**
    —decide una persona cuál—, nunca con SQL.
  - `transaccion-larga` / `candado-sobre-turno`: algo retiene la base o `Turno`.
    Esperar a que termine y volver a correr; no cancelar sesiones del POS.
  - `migracion-fallida-sin-resolver`: hay otra migración trabada; eso es otro
    procedimiento.

  Después se vuelve a correr el precheck desde cero.
- **⚠ REVISAR ANTES DE DESPLEGAR** (no frena): cajas abiertas **sin operador**
  en un local que **exige operador**. Desde el cambio, un turno sin operador es
  la caja de la cuenta: un cajero que entra con su PIN ya no la alcanza —no
  vende, no mueve, no arquea ni la cierra—, y **solo Admin o el Dueño del local
  pueden administrarla** (arquear, cerrar). Si la cuenta es la del Dueño, él la
  sigue usando sin PIN. Conviene cerrarlas antes de desplegar o avisarle al
  Dueño; el despliegue puede seguir.

Es transacción READ ONLY que termina en ROLLBACK; imprime ids, ningún importe ni
nombre. Probado por `scripts/pruebas-db/migracionCajaPorOperador.mjs` (en CI):
VERDE sobre una base limpia, con la advertencia de la caja sin operador; ROJO
con el mismo operador en dos turnos abiertos con dos cuentas; ROJO con una
sesión reteniendo `Turno`. Y la migración por `migrate deploy`: aplica limpia
sin tocar una fila, aborta con conflicto, y con el candado retenido falla en
~4 s por el tope —sin él esperaba los 30 s—; en los dos fallos queda el índice
viejo y ninguno nuevo.

Lo que llega con ella **no es solo esquema**: desde ese despliegue la caja es del
operador. Dos operadores con la misma cuenta del local abren cada uno su turno;
`turnos/actual` devuelve la caja del operador del PIN; y un cajero común ya no
puede operar la caja de otro.

Producción corre `9700a59530534e920ae3ab59b5c5780bd3b79071` (despliegue del
2026-09-29, nota abajo). Un commit posterior a ese que solo cambie
documentación —como el que escribe esta nota— **no se despliega por eso**.

---

## `9700a595`: desplegado el 2026-09-29. Stock Diario móvil, sin migraciones

Despliegue **solo de código**: el merge de la PR #113, con la cabeza
`30093474120be704f162580a4678eb0edc1b97cd`, desde
`0a8fde8b219402ee060913e1de9035a9ff27a660`, a las 20:37 hora argentina (23:37
UTC). **Lo que sigue es lo que informó el despliegue**, corrido desde el acceso
al VPS y no desde la sesión que escribe esta nota.

**Identidad.** `9700a59530534e920ae3ab59b5c5780bd3b79071` en `origin/main`, el
HEAD del VPS, la imagen `ghcr.io/islaemanuel25-glitch/erpmanual:9700a595…`
(digest del registro
`sha256:e1765020bf9a11f1164c0a25d5d5421f8bad9a352fa598b5bfcc495c0a9e1843`),
`APP_BUILD_ID` y `/api/version`.

**Migraciones.** 44 en el árbol y 44 aplicadas antes, y 44 en el objetivo; el
clasificador no encontró ningún archivo, y `migrate deploy` contestó "No pending
migrations to apply". Después, **44/44**, ninguna fallida, y "Database schema is
up to date!". **0 aplicadas** por este despliegue.

**Lo que llegó.** La pantalla `/modulos/stock_locales/diario`, en el menú
**Stock → Stock Diario**, con `stock.ver`. Las cuatro rutas —
`/api/stock_locales/diario/resumen`, `/productos`, `/producto` y
`/movimientos`— están y sin sesión contestan 401 "Sesión no encontrada o
vencida". **Ese 401 prueba que están protegidas, no que funcionan**: no hubo
prueba funcional autenticada en producción, porque no hay una sonda autenticada
documentada y no se inventó una sesión. La conducta con sesión la cubre el CI
de la PR #113 (`scripts/pruebas-db/stockDiarioApi.mjs`). No se crearon datos de
prueba.

**El Libro de Stock, sin pérdida ni reinicio.**

- Antes: 17.054 movimientos, ids 1 a 17.054, de los cuales 12.278
  ESTADO_INICIAL; el punto cero en 2026-09-28 00:19:13.587 UTC, huella
  `2ebcf8cc4ca5bc27b6b833fea0e24ef6`; el verificador en verde.
- Después: 17.066 movimientos. Los 17.054 ids anteriores siguen; los 12 nuevos
  son actividad real de los locales. El punto cero con la misma huella y el
  verificador en verde.

**El Libro de Costos**, ACTIVADO. Los triggers no internos, 23 antes y 23
después.

**El despliegue.**

- Backup PRE: `/srv/produccion/backups/pre-9700a595_20260929_233631.sql.gz`,
  7.539.813 bytes, SHA-256
  `2875859262ee9a826553d5cccbdb7f1e607500a6ac37b02381f7914a971e4327`.
  `pg_dump` salió 0 con `pipefail`, `gzip -t` en verde, con la marca de dump
  completo, 85 tablas y 17.061 movimientos de stock adentro.
- Sonda PRE en verde (corrida 36646050287).
- **Sonda POST: la primera corrida dio ROJO** (36646249759). Falló el Chrome
  del runner de GitHub, en el puerto de depuración 9226, **antes de medir
  nada**. El paso ANTES ya había confirmado que producción servía `9700a595`,
  y no hubo ninguna evidencia de una falla de producción. No hubo rollback ni
  se tocó producción para corregir nada. La segunda corrida, el relanzamiento
  que permite el procedimiento, dio **VERDE** (36646351202) sobre
  `9700a59530534e920ae3ab59b5c5780bd3b79071`.
- Salud después: la app sana y sin reinicios, PostgreSQL healthy y `/login` con
  200. Sin errores, excepciones ni errores de Prisma en los logs desde el
  despliegue; sin transacciones largas, sin `idle in transaction` y sin esperas
  de locks.

---

## `0a8fde8b`: desplegado el 2026-09-29. Gastos móvil, sin migraciones

Despliegue **solo de código**: el merge de la PR #112, con la cabeza
`eecf2ccf464a83cad12d160174a3eac46069a996` validada por el CI (corrida
36627906705, #474, en verde), desde `4b9ac04d4c5a691041749b8281ccacc9254df794`.
La PR no trae ninguna migración, y el despliegue **no aplicó ninguna**. **Lo que
sigue es lo que informó el despliegue**, corrido desde el acceso al VPS y no
desde la sesión que escribe esta nota.

**Identidad.** `0a8fde8b219402ee060913e1de9035a9ff27a660` en `origin/main`, el
HEAD del VPS, la imagen, `APP_BUILD_ID`, `APP_IMAGE` y `/api/version`. La imagen
la construyó la corrida 36629563965 (#559, en verde), con digest
`sha256:ed394b38440beec850a5721628da1ef05f0629e49fa106e60baaa47be1fadff4`.

**Migraciones.** 44 en el árbol y 44 aplicadas antes; **0 aplicadas** por este
despliegue; 44 en el árbol y **44 aplicadas** después, ninguna pendiente, y
`migrate status` cerró con "Database schema is up to date". Ninguna pendiente
atribuible a la PR #112. Sin rollback y sin SQL de escritura a mano.

**Lo que llegó.** La pantalla `/modulos/finanzas/gastos`, incluida en el build,
y el menú de Finanzas con sus tres herramientas: Resumen financiero, Pagos a
proveedores y Gastos. Las rutas de Gastos sin sesión contestan 401. No se hizo
una prueba autenticada en producción porque no hay una sonda autenticada
documentada; la conducta con sesión la cubre el CI de la PR #112 (#474).

**Los datos, sin cambios.** No se crearon datos de prueba. `CategoriaGasto` con
sus **7** categorías; `Gasto` y `PagoGasto` con **0** filas.

**Lo demás, intacto.** Pagos a proveedores intacto, Libro de Costos intacto y
Libro de Stock íntegro.

**El despliegue.**

- Backup PRE: `/srv/produccion/backups/pre-0a8fde8b_20260929_205843.sql.gz`,
  7.509.589 bytes, SHA-256
  `1f73f798ca71a3021350706abe3be8fda5b77d1297e78d8bb7b3941f44b95849`.
- Sonda PRE en verde (corrida 36630143861, sobre `4b9ac04d`) y sonda POST en
  verde (corrida 36630444291, sobre `0a8fde8b`).
- Salud después: la app sana, PostgreSQL healthy y `/login` con 200.

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

