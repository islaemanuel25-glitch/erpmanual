# Tesorería: la lectura canónica

Qué plata entró, salió y quedó, leída de los hechos que el sistema ya registra.
Desde 2026-10-04 (PR 1 de Tesorería: solo lectura, sin tablas nuevas).

Tesorería no es Finanzas. Finanzas explica el resultado económico y su fórmula
no se toca; Tesorería muestra movimientos de dinero [DECISIÓN de Emanuel,
2026-10-04]. No hay caja fuerte en el modelo: el recorrido físico de los billetes
después del retiro no le interesa a este módulo [DECISIÓN de Emanuel,
2026-10-04].

## Las fuentes

- **Efectivo declarado = las entregas.** Cada `CajaMovimiento` que
  `clasificarMovimientos` (`lib/finanzas/movimientosDeCaja.js`) marca
  RECAUDACION o CIERRE, por vínculo y nunca por el texto del motivo. Se cuenta
  una vez por `CajaMovimiento.id`. Su monto es lo que el cajero contó y se llevó,
  así que ya trae la diferencia de caja, el fondo que dejó, lo que pagó desde la
  caja y el Caja +/− [CÓDIGO, `lib/tesoreria/lecturaTesoreria.js`].
  - No se suman las copias del mismo retiro: `Turno.efectivoRetiradoCierre`,
    `ArqueoCaja.efectivoRetirado`, `RetiroPreparacion.totalRetiroContado`,
    `CierrePreparacion.retiroFinal` [CÓDIGO; el candado 3 lo exige leyendo el
    fuente].
  - No se reconstruye sumando ventas en efectivo: esa suma se informa aparte
    como `efectivoCobradoDeclarado`, y no es lo entregado.
- **Cobrado por medio** = los tenders de las ventas comerciales
  (`whereVentaComercial`) por `tendersParaAgregar`, ahora con procesador, medio y
  modalidad. FIADO no es cobro. Lo digital es **cobrado declarado por el POS**:
  no hay integración que pruebe una acreditación, así que nada se llama
  acreditado, conciliado ni disponible. Comisión y neto son **estimados**
  [CÓDIGO].
- **Egresos exteriores** = `PagoProveedor` y `PagoGasto` sin vínculo a una caja
  (la base obliga a que todo pago en efectivo tenga turno y movimiento, y los
  demás no: CHECK `*_efectivo_con_caja`). Restan [CÓDIGO].
- **Pagos desde caja** = los pagos en efectivo con su `cajaMovimientoId`. Ya
  salieron del cajón antes de la entrega, así que **no se restan otra vez**: son
  información [CÓDIGO; contraprueba TE-1].

**Base de Tesorería conocida** = efectivo declarado entregado + digital cobrado
declarado − egresos exteriores. No es un saldo bancario [CÓDIGO].

## Lo que no suma ni resta

- RECAUDACION y CIERRE: son la fuente del efectivo, no gastos.
- Fondo inicial y sobres de cambio: fondos operativos, no ingresos.
- Caja +/− manual: sin origen ni destino registrado; se muestra como manual.
- Cobros de cuenta corriente (`MovimientoCuenta` PAGO): sin medio ni caja; se
  informan como dinero sin ubicar.
- Pago a depósito por recepción: no prueba una entrega de dinero.
- Las diferencias de caja de cada operador: se leen por caja y nunca se suman
  entre operadores ni con una futura diferencia de Tesorería.

## Lo que se señala en vez de inventarse

- Cierre sin conteo: la caja queda con efectivo declarado `null`, no $0, y la
  alerta `SIN_IMPORTE_DECLARADO`.
- Caja abierta o en corte: `CAJA_SIN_CERRAR`, porque su entrega todavía no está
  completa.
- Venta digital con comisión pendiente: `COMISION_PENDIENTE`.

## Se agrupa por turno operativo (desde `20261005120000_turno_operativo`)

Tesorería verifica POR TURNO OPERATIVO, no por día: turno → sus cajas → sus
entregas → se cuenta → se verifica ESE turno. Las diferencias de cada caja no se
compensan entre sí [CÓDIGO].

- **Catálogo por local** (`TurnoOperativo`: nombre, orden, activo; sin horas). Se
  administra en Configuración → POS → Turnos operativos con `config_local.pos`.
  No se borra: se desactiva [CÓDIGO, `app/api/config/turnos-operativos/`].
- **Se elige al abrir la caja**, en las tres rutas (`abrir`, `abrir-sin-cambio`,
  `abrir-con-cambio`), entre los activos del local. El servidor valida que
  exista, esté activo y sea del local; sin turnos activos la apertura es 409
  `LOCAL_SIN_TURNOS_OPERATIVOS`. **Nunca se infiere por la hora**
  [CÓDIGO, `lib/caja/turnoOperativoServer.js`; TO-1].
- **`fechaOperativa`** la fija el servidor al abrir (día argentino de ese
  momento) y no se recalcula. Si la pantalla manda otra, 409
  `FECHA_OPERATIVA_DE_OTRO_DIA`. La base impide cambiar turno o fecha de una
  caja ya escrita, incluso de NULL a un valor [CÓDIGO; TO-4].
- **Agrupación**: `grupoDeTesoreria` (`lib/tesoreria/turnoComercial.js`) agrupa
  por local + fecha operativa + turno DE LA CAJA. Cada hecho hereda el grupo de
  su caja, así que la medianoche no parte una caja, y una caja con turno entra
  ENTERA al período de su fecha operativa. Lo que no es de ninguna caja va solo
  al resumen [CÓDIGO; candados TO-1, TO-2, TO-3, TO-8].
- **Cajas viejas** (sin turno) no se reinterpretan: van a «Sin turno asignado»,
  agrupadas por día del hecho como antes, y entran al período por su instante.
- La matemática de la base conocida no cambió.

## La API

`GET /api/finanzas/tesoreria` (PR 2, desde 2026-10-04) es una capa fina sobre
`leerTesoreria`: no reescribe ninguna de las reglas de arriba y no escribe nada
[CÓDIGO, `app/api/finanzas/tesoreria/route.js`].

- **Permiso:** `tesoreria.ver`, en el grupo finanzas, sin ningún rol de sistema;
  Admin por el comodín `*`. `finanzas.ver` NO alcanza [CÓDIGO; contraprueba TA-1].
- **Alcance:** el de Finanzas, con los mismos resolutores (`resolveVistaOperativa`,
  `esVistaDeDeposito`, `resolverLocalPedido`). Un local solo se lee a sí mismo,
  pedir otro por `destino` o `localId` es 403; el depósito lee cualquier local de
  su grupo y, sin elegir, recibe la lista sin importes [CÓDIGO; contraprueba TA-2].
- **Entrada:** `unidad` (DIA, SEMANA, MES, OTRO), `desplazamiento` (0 = en
  curso), `desde`/`hasta` solo con OTRO, `destino` y `entrada=1` para el
  depósito. El rango es `rangoFinanciero` con la semana operativa de la
  ubicación, o el elegido con OTRO (sección siguiente).
- **Salida:** `local`, `periodo` (rango, instantes exactos del filtro y
  descripción), `puedeAvanzar`, `puedeRetroceder`, `primerMovimiento`, las
  capacidades `puedeVerificarEfectivo` y `puedeAnularVerificacion`, y
  `tesoreria`, que es la lectura tal cual la arma el dominio: `resumen`,
  `grupos` (con sus instantes, cajas y alertas), `cajas`, `entregas`,
  `egresosExteriores`, `pagosDesdeCaja`, `alertas` y `verificaciones`.
- **Consultas:** la lectura hace un número fijo, 12 desde la PR 4 (11 antes de
  sumar las verificaciones vigentes), con 5 cajas o con 1 [medido en
  `scripts/pruebas-db/tesoreriaApi.mjs`]. La ruta agrega las suyas
  —el local de la sesión, los locales del grupo, las vigencias de la semana y la
  primera venta—, que no dependen de cuántas cajas haya [CÓDIGO; no contadas].
- Un turno anulado conserva sus entregas y lo avisa con `TURNO_ANULADO`, en la
  caja y en su grupo: el estado posterior del turno no hace desaparecer plata.

## El contrato de la pantalla móvil

PR 5 de Tesorería (2026-10-04, #138): lo que le faltaba a la API para el diseño
móvil de Figma, sin pantalla, sin migración y sin tocar ninguna regla de plata.
Las cuentas de arriba —base conocida, pagos desde caja informativos, egresos
exteriores que restan una vez, digital declarado— no cambiaron [CÓDIGO;
`tesoreriaApi.mjs` sección D sin cambios y sección H].

**El período «Otro»** [CÓDIGO, `leerRangoElegido` en
`lib/finanzas/periodoFinanciero.js`; contraprueba TC-1]. El selector es el
canónico de Finanzas —Día, Semana, Mes, Otro— y Tesorería es el primer endpoint
de Finanzas que acepta OTRO; las otras pantallas lo siguen teniendo apagado.

- Los nombres son los de Transferencias: `desde` y `hasta`, días `AAAA-MM-DD`
  inclusivos. La validación de cada día es la de Finanzas (`leerFechaOpcional`:
  el 2026-02-30 se rechaza, no se corre al 2 de marzo) y el rango invertido usa
  el texto de Gastos.
- A diferencia de Transferencias, que con un rango malo cae en silencio a la
  unidad, acá es **400** con `{ ok: false, error }`: una fecha inválida, desde
  posterior a hasta, falta una de las dos, fechas sin OTRO, u OTRO con
  `desplazamiento`. Un período ignorado mostraría los números de otro período
  con el rótulo del pedido.
- No hay tope de días —ningún módulo lo tiene— ni se corta el futuro: un día
  sin hechos da cero, como en Transferencias.
- Los instantes los pone `getRangoArgentina`, el mismo que para las otras
  unidades: 00:00 del primer día a 23:59:59.999 del último, hora argentina, y se
  devuelven en `periodo.instantes`.
- La descripción sale de `descripcionDelPeriodo` con `rangoFijo`: «Período
  elegido» y el rango en largo. `desplazamiento` va en null y `puedeAvanzar` y
  `puedeRetroceder` en false: un rango elegido no navega, se elige otro.
- El alcance se resuelve igual que con las otras unidades y ANTES de leer: OTRO
  no abre ningún local ajeno.
- Con el mismo rango que un Día, la lectura es idéntica, byte por byte
  [`tesoreriaApi.mjs` sección G].

**Las capacidades** [CÓDIGO, la ruta; contraprueba TC-3]. `puedeVerificarEfectivo`
y `puedeAnularVerificacion` son `checkPerm` con los mismos permisos que exigen las
acciones, así que el comodín `*` las da. Se calculan después del alcance, sobre
el local que se está leyendo. Son para no ofrecer un botón que el servidor va a
rechazar: las acciones vuelven a chequear todo.

**Cómo se nombra un pago** [CÓDIGO, `presentacionDelPago` en
`lib/tesoreria/lecturaTesoreria.js`; contraprueba TC-2]. Cada fila de
`egresosExteriores` y de `pagosDesdeCaja` trae `beneficiario`, `concepto`,
`categoria`, `referencia` y `nota`, leídos de las relaciones reales en la MISMA
consulta del pago:

- a proveedor: `beneficiario` es el nombre del proveedor de la cuenta y
  `referencia` es `{ tipo: "PEDIDO_PROVEEDOR", id }`; no hay concepto ni
  categoría y van en null;
- de un gasto: `concepto` y `categoria` del gasto, `beneficiario` solo si se
  cargó, y `referencia` es `{ tipo: "GASTO", id }`.

Lo que el modelo no tiene va en null —no se completa con otro dato— y el motivo
libre del movimiento de caja no se lee nunca. Los pagos desde caja siguen siendo
informativos: nombrarlos no los resta.

**Quién verificó** [CÓDIGO, `formatoDeVerificacion` en
`lib/tesoreria/verificacionEfectivoLectura.js`; contraprueba TC-4]. Cada
verificación trae `verificadaPor` y `anuladaPor` como `{ id, nombre }` del
Usuario —nada más de la cuenta—, y conserva los ids sueltos. El operador del PIN
es otra cosa: `verificadaPorOperador` es null cuando no hubo, y nunca se completa
con la cuenta. Cuando haya, irá `{ id, nombre: null }`: la columna no tiene
relación y su nombre no se lee de ningún lado (hoy ningún flujo la llena).

**Las cajas y sus entregas** [CÓDIGO, `etiquetaDeCaja`]. En la base no existe
«Caja 1»: hay un Turno y, si el local pide PIN, su operador. La identidad estable
de una caja es `turnoId`; la etiqueta para mostrar es «Caja de {operador}», o
«Caja del turno #{id}» si no hay operador —se nombra el turno, no una persona—.
Va en `cajas`, en las cajas de cada grupo y en cada entrega (`etiquetaCaja`),
junto con `cajaMovimientoId`, `turnoId`, `operadorId`, `operadorNombre`, `clase`,
`montoDeclarado`, `instante` y el estado de verificación. Agrupar por caja es
agrupar por `turnoId`.

**Una verificación de varias cajas** sigue teniendo UNA diferencia, la del acto;
`cantidadDeCajas` dice cuántas juntó («2 cajas incluidas») y ninguna caja ni
entrega lleva un pedazo.

**Lo parcial se deriva, no se guarda.** `resumen.verificacion` (y el de cada
grupo) trae `entregadoDeclarado` = `entregadoCubiertoPorVerificaciones` +
`entregadoPendienteDeVerificar`, y `entregasPendientesIds`: con eso la pantalla
ofrece «Verificar lo pendiente · $X» sin decidir de nuevo qué está cubierto. No
existe un estado PARCIAL en ninguna tabla.

**Un acto que cruza el período** [contraprueba TC-5] no se suma, no se reparte y
no se esconde: va ENTERO en `verificaciones`, con `completaEnElPeriodo` en false
y `entregasEnElPeriodo` con las de acá, y `actosQueCruzanIds` lo nombra. Si el
rango se amplía hasta cubrir todas sus entregas —por ejemplo con OTRO—, pasa a
completo y recién ahí cuenta en lo verificado.

**Consultas:** las mismas 12. Los nombres van como selects anidados en las
consultas que ya estaban, no como consultas por fila [medido en
`tesoreriaApi.mjs` sección E].

## La verificación del efectivo: persistencia

PR 3 de Tesorería (2026-10-04, #136): las tablas y sus garantías. Las acciones
que escriben son de la PR 4 (sección siguiente).
**PENDIENTE DE DEPLOY:** la migración `20261004120000_verificacion_efectivo` está
en el árbol y no en producción [DOCUMENTADO en
`docs/deploy/MIGRACIONES-SIN-APLICAR.md`].

Una verificación es un HECHO: el responsable contó el efectivo de un conjunto de
entregas de un local y dejó lo que contó. No se edita: si estuvo mal, se anula y
se verifica de nuevo, y la anulada queda como historia.

- **`VerificacionEfectivo`:** local, `importeDeclarado` (la suma de las fotos),
  `importeVerificado` (lo contado), `diferencia` (verificado − declarado), estado
  `VIGENTE`/`ANULADA` con su copia booleana `vigente`, quién verificó (usuario y,
  si hubo PIN, operador), cuándo, observación, `idempotencyKey`, y la anulación
  completa —cuándo, quién, motivo— o nada de ella [CÓDIGO, `prisma/schema.prisma`].
- **`VerificacionEfectivoEntrega`:** una fila por entrega (`cajaMovimientoId`) con
  la FOTO al verificar: monto declarado, local, turno, operador (puede ser null),
  clase `RECAUDACION`/`CIERRE` e instante de la entrega, más `vigente`, que es la
  del padre [CÓDIGO].
- **Turno operativo y fecha operativa**, congelados al verificar, tomados de la
  caja de las entregas (NULL en las verificaciones anteriores al turno
  operativo, que quedan como legado y no se reinterpretan). No se guarda turno
  comercial, franja, día ni hora inferidos. Tampoco saldos, cuentas, caja fuerte
  ni libro [CÓDIGO; prueba K].

Lo que la BASE sostiene sola, sin depender de que el código lo haga bien
[CÓDIGO, en la migración; ejercido en `scripts/pruebas-db/verificacionEfectivo.mjs`]:

1. **La diferencia no diverge:** CHECK `diferencia = importeVerificado − importeDeclarado`.
2. **El declarado es la suma de las fotos, con al menos una entrega:** trigger de
   restricción diferido al COMMIT, porque padre y entregas se escriben en la misma
   transacción [contraprueba TV-4].
3. **La foto es la del movimiento real:** un trigger antes de insertar toma el
   `CajaMovimiento` FOR SHARE y exige que sea un RETIRO con vínculo de entrega
   —CIERRE si un turno lo declara su retiro de cierre, RECAUDACION si lo referencia
   un arqueo—, que la clase sea la de ese vínculo, y que monto, turno, local,
   operador e instante sean los reales. Nunca por el texto del motivo [TV-3].
4. **Una entrega en a lo sumo UNA verificación vigente:** índice único parcial
   sobre `cajaMovimientoId` WHERE `vigente` en la tabla de entregas. `vigente` es
   una COPIA del padre, y no puede divergir: llega por una FK compuesta
   `(verificacionEfectivoId, vigente) → (id, vigente)` con ON UPDATE CASCADE, y en
   el padre un CHECK ata `vigente` al estado. Anular el padre la baja en cascada;
   un hijo no puede declarar otra. Dos verificaciones simultáneas de la misma
   entrega: la segunda espera en el índice a que la primera confirme y se rechaza;
   si la primera se cae, la segunda entra [TV-1; carrera forzada en la prueba E].
5. **Un solo local:** FK compuesta `(verificacionEfectivoId, localIdSnapshot) →
   (id, localId)` y la comparación del trigger con el local real del turno. Hacen
   falta las dos: cada una frena un camino distinto [TV-5].
6. **Idempotencia por local:** único `(localId, idempotencyKey)`, como `Gasto`.
   Dos locales pueden usar la misma clave [TV-6].
7. **Nada se edita salvo la anulación, ANULADA es final, y nada se borra:**
   triggers de UPDATE (el padre solo pasa de VIGENTE a ANULADA sin tocar lo
   verificado; la entrega solo pasa `vigente` de true a false) y de DELETE en las
   dos tablas [TV-2].
8. **Sin cascada destructiva:** las seis FK son RESTRICT al borrar.

**`cajaMovimientoId` es FK, no escalar** [DECISIÓN de esta PR]. Con FK la base
garantiza que la entrega existe y que nadie borra un movimiento verificado; el
trigger de la foto necesita además leerlo, y lo hace con la misma fila. Lo que la
FK NO hace es seguir los cambios: la foto son escalares copiados, y si una
corrección histórica reescribe `CajaMovimiento.monto`, la verificación sigue
diciendo lo que se verificó. El cambio se DETECTA comparando la foto contra el
movimiento (`entregaDesactualizada`, o la consulta de la prueba H), y la salida es
anular y verificar de nuevo, que el trigger solo deja hacer con el importe nuevo.
Esa comparación es la que hace el aviso `VERIFICACION_DESACTUALIZADA` (abajo).

**Sin backfill:** ninguna entrega anterior queda verificada; todas quedan
pendientes de verificación.

## Verificar y anular: las acciones

PR 4 de Tesorería (2026-10-04): el circuito de backend, sin pantalla. Usa el
modelo de la PR 3 tal cual: **no agrega migración** [CÓDIGO].

**Permisos** [CÓDIGO, `lib/rbac/registry.js`, `lib/tesoreria/permisos.js`]:
`tesoreria.verificar_efectivo` y `tesoreria.anular_verificacion`, en el grupo
finanzas, sin ningún rol de sistema; Admin por el comodín. `tesoreria.ver` no
autoriza ninguno de los dos, y cada uno no autoriza el otro [contraprueba VA-7].

**`POST /api/finanzas/tesoreria/verificaciones`** — verificar.

- Entrada: `cajaMovimientoIds` (las entregas), `importeVerificado`,
  `idempotencyKey` y `observacion` opcional. Si el cuerpo trae el declarado, la
  diferencia, el local, la clase o cualquier dato de la foto, se rechaza con 400:
  todo eso lo decide el servidor [VA-5].
- El local es el de las entregas, no uno que mande el cliente. El alcance es el
  de Finanzas (`alcanceDePagos` → `ubicacionesVisibles`): un local verifica solo
  lo suyo; el depósito, o un admin en vista global, cualquier local de su grupo.
  Una entrega fuera de alcance es 403 sin decir cuál, antes de cualquier otro
  rechazo, para no contar qué movimientos existen afuera [VA-4]. Entregas de dos
  locales son 400 `LOCALES_MEZCLADOS`.
- Granularidad libre dentro de UN turno operativo y UNA fecha operativa: una
  entrega, varias de una caja o de varias cajas del mismo turno. Mezclar turnos
  es 400 `TURNOS_OPERATIVOS_MEZCLADOS` y mezclar fechas 400
  `FECHAS_OPERATIVAS_MEZCLADAS`; la base lo sostiene con un trigger al insertar
  la entrega [TO-3, TO-5].
- En una transacción: toma los turnos de las entregas, mira la clave, toma los
  movimientos FOR SHARE, los clasifica por vínculo (solo `RECAUDACION`/`CIERRE`;
  otra cosa es 400 `NO_ES_ENTREGA`), rechaza una entrega ya cubierta por una
  vigente (409 `ENTREGA_YA_VERIFICADA`, nombrando cuál), y arma con
  `armarVerificacionEfectivo` el declarado —suma de los movimientos tomados— y la
  diferencia. La base vuelve a comprobarlo todo.
- **"Correcto" no es otra acción:** es contar lo declarado. La respuesta trae
  declarado, verificado, diferencia, estado y `correcta` (diferencia cero).
- **La diferencia es del acto entero.** Caja 1 entrega $100.000 y caja 2
  $10.000, se cuentan juntas $108.000: una verificación con declarado $110.000,
  verificado $108.000 y diferencia −$2.000. No se reparte entre cajas ni entregas
  [CÓDIGO; prueba 5 de `verificacionEfectivoAcciones.mjs`].
- Autoría: la cuenta ERP que ejecuta. `verificadaPorOperadorId` queda null:
  ningún flujo de Finanzas valida hoy un PIN, y el operador es evidencia, no
  permiso (DEC-0012) [CÓDIGO].
- Respuesta: 201 con la verificación; 200 con `repetida: true` para un reintento.

**Idempotencia** [CÓDIGO; VA-3]. La clave es del local (el único de la base). El
CONTENIDO de un intento son las entregas ordenadas, el importe en centavos y la
observación; la misma clave con el mismo contenido devuelve la misma
verificación —aunque esté anulada—, y con otro contenido es 409
`IDEMPOTENCIA_CONFLICTO`, con la verificación y las dos huellas (SHA-256 del
contenido canónico, con `jsonCanonico` del POS). No hace falta columna: lo
guardado ES el contenido, y se compara contra eso. El orden de los ids no cambia
el intento. Si dos envíos con la misma clave llegan a la vez, el segundo espera
el turno y ve el primero; si la carrera llega igual al UNIQUE, la ruta relee y
contesta igual.

**`POST /api/finanzas/tesoreria/verificaciones/:id/anular`** — anular.

- Entrada: `motivo`, obligatorio y no en blanco. La clave natural es la
  verificación: no lleva `idempotencyKey`.
- Única transición: VIGENTE → ANULADA, con cuándo, quién y por qué; lo
  verificado no se toca y nada se borra. Las entregas quedan libres.
- Repetirla es seguro: si ya estaba anulada contesta 200 con
  `yaEstabaAnulada: true` y lo que quedó, sin pisar el motivo ni el autor de la
  primera [VA-8].
- Alcance: la verificación tiene que ser de un local visible; si no, 403.

**El orden de los bloqueos** [CÓDIGO, `lib/tesoreria/verificacionEfectivoServer.js`]:
primero los `Turno` de las entregas, FOR UPDATE, por id ascendente
(`bloquearTurno`, el candado del POS); después la fila propia —los
`CajaMovimiento` FOR SHARE al verificar, la `VerificacionEfectivo` FOR UPDATE al
anular—. La corrección histórica toma también los turnos primero, en el mismo
orden, y sus movimientos después. Nadie toma un turno teniendo ya otra cosa, así
que no hay ciclo, y verificar, anular, corregir y el POS sobre esa caja se ponen
en fila en el turno [VA-1].

**La corrección histórica respeta la verificación** [CÓDIGO,
`lib/caja/correcciones/motor.js`; VA-2]. Si el plan cambia
`CajaMovimiento.monto` de un movimiento cubierto por una verificación VIGENTE,
el ensayo y la aplicación se rechazan con `codigoRechazo:
ENTREGA_VERIFICADA_EN_TESORERIA`, nombrando la verificación: hay que anularla,
corregir y volver a verificar. Solo frena ese caso —otra corrección del mismo
turno pasa— y vale igual para Admin. Se pregunta con los turnos ya tomados: si
la verificación llegó primero, la corrección la ve; si la corrección llegó
primero, la verificación espera y fotografía el importe corregido.

**La lectura** (`GET /api/finanzas/tesoreria`) suma, sin cambiar ninguna regla de
plata:

- cada entrega con `estadoVerificacion` (`PENDIENTE`/`VERIFICADA`),
  `verificacionId`, `montoDeclaradoVerificado` (la foto), `desactualizada` y sus
  motivos; ninguna lleva lo contado ni una diferencia;
- `verificaciones`: los actos vigentes que cubren algo del período, enteros, con
  qué entregas caen adentro y si está completo;
- `resumen.verificacion` y `grupo.verificacion`, SEPARADOS de lo declarado: lo
  entregado pendiente de verificar, lo cubierto por verificaciones (importes
  declarados), y lo verificado de los actos completos (declarado y contado del
  acto). Un acto con entregas en otro grupo o fuera del período no se atribuye
  —repartirlo sería inventar— y se cuenta en `actosQueCruzan`.
- `baseConocida` sigue siendo la DECLARADA, esté verificada o no. Verificar no la
  cambia, ni cambia la regla de los pagos desde caja (informativos) ni la de los
  egresos exteriores (restan una vez) [pruebas 9 de `verificacionEfectivoAcciones.mjs`].

**`VERIFICACION_DESACTUALIZADA`** [CÓDIGO, `lib/tesoreria/desactualizacion.js`;
VA-6]: para cada entrega del período cubierta por una verificación vigente, la
foto se compara con el movimiento de hoy —monto, clase por vínculo, turno,
local, operador e instante—. Si algo difiere, alerta con la verificación, el
movimiento y los motivos. No se recalcula el declarado, no se tocan las fotos ni
la diferencia, no se anula sola.

**Lo que esa PR no hacía:** no había pantalla; un cierre sin conteo sigue siendo
`SIN_IMPORTE_DECLARADO` y no se puede verificar, porque no tiene movimiento de
entrega y no se fabrica uno; un turno anulado conserva su entrega y su alerta.

## La pantalla móvil

[CÓDIGO, 2026-10-04] La pantalla vive en `/modulos/finanzas/tesoreria`, como
sexta herramienta del grupo Finanzas, detrás de `tesoreria.ver`. Sigue el diseño
de Figma `uptcbzbnV5M4q32kgmupF9`, página `14:2` (pantallas A a I2). Es una
LECTORA del contrato: no recalcula nada que el servidor ya decidió.

- **Período**: los mismos chips Día / Semana / Mes / Otro y el mismo navegador
  que Finanzas. «Otro» manda `unidad=OTRO&desde&hasta` y no consulta hasta tener
  las dos fechas. «Mes» en curso dice «van N días» contados hasta hoy.
- **Alcance**: la vista de entrada (`entrada=1`) la decide el servidor —un local
  entra directo a su resumen, el depósito ve la lista de locales—. El local
  elegido viaja en la ruta `/modulos/finanzas/tesoreria/local/<id>`.
- **Base conocida**: el número es `baseConocida` tal cual llega, con su
  composición y su línea de certeza. No dice «saldo».
- **Turnos**: una tarjeta por turno operativo, con la `etiqueta` del grupo que
  manda el servidor (el nombre del catálogo del local, o «Sin turno asignado») y
  la cantidad de cajas; sin rango horario. Ningún «Mañana/Tarde/Noche» escrito en
  la pantalla. El estado de la tarjeta sale de la lectura: Requiere revisión manda
  sobre Sin importe declarado, y ése sobre Parcial, Pendiente, Correcto y Con
  diferencia.
- **Verificar**: aparece solo con `puedeVerificarEfectivo` y entregas pendientes.
  El pedido lleva únicamente `cajaMovimientoIds`, `importeVerificado`,
  `idempotencyKey` y `observacion`; la clave se conserva al reintentar el mismo
  intento y cambia si cambian las entregas o el importe. El doble toque no manda
  dos pedidos, no hay actualización optimista y al terminar se relee.
- **Anular**: solo en el detalle de la verificación, con
  `puedeAnularVerificacion` y motivo obligatorio. No existe «editar».
- **Lo que no se inventa**: un cierre sin conteo dice «Sin importe declarado»,
  nunca `$0`; un egreso sin beneficiario dice su clase, no un nombre; quien contó
  es `verificadaPor.nombre`, y el operador solo aparece si el servidor lo manda.
  Lo digital es «cobrado por POS», no acreditado. Los pagos desde caja se
  muestran y no restan. Las verificaciones que cruzan el período van aparte.

**Diferencias con el Figma, a propósito**: el título y el «Volver» van en el
shell, como en el resto del ERP; el selector de local ocupa su propio renglón;
«Otro» abre el selector de fechas del kit; el encabezado de las hojas es el del
`SunmiModalLayout`, con su botón de cerrar; la tarjeta principal usa
`sunmi-bg-card` porque el kit no tiene un token de tarjeta destacada.

## Evidencia

- Armado puro y candados: `lib/tesoreria/lecturaTesoreria.js` y su `.test.mjs`.
- Verificación: armado y anulación en `lib/tesoreria/verificacionEfectivo.js` y su
  `.test.mjs`; contra PostgreSQL, `scripts/pruebas-db/verificacionEfectivo.mjs` y
  las contrapruebas `TV-`, que rompen el TEXTO de la migración y lo aplican en una
  base aislada copia de la de la prueba.
- Acciones: `lib/tesoreria/verificacionEfectivoServer.js`, las rutas de
  `app/api/finanzas/tesoreria/verificaciones`, y el candado en
  `lib/caja/correcciones/motor.js`. Contra PostgreSQL, por las rutas y con las
  cuatro carreras forzadas sobre el turno: `scripts/pruebas-db/verificacionEfectivoAcciones.mjs`
  y las contrapruebas `VA-`.
- Contrato móvil: `scripts/pruebas-db/tesoreriaApi.mjs` secciones G y H,
  `scripts/pruebas-db/verificacionEfectivoAcciones.mjs` secciones 18 a 22, y las
  contrapruebas `TC-`.
- Lector: `lib/tesoreria/lecturaTesoreriaServer.js`. Los vínculos de clase los
  lee `lib/finanzas/movimientosDeCajaServer.js`, el mismo lector que usa el
  tablero de Finanzas.
- Contra PostgreSQL, con rutas reales: `scripts/pruebas-db/tesoreriaLectura.mjs`
  y las contrapruebas `TE-` en `scripts/pruebas-db/contrapruebasRevision.mjs`,
  en el job `finanzas_postgres`.
- Pantalla móvil: `components/tesoreria/`, `lib/tesoreria/pantallaTesoreria.js` y
  `lib/tesoreria/contextoTesoreria.js`; candados [1] a [47] en
  `components/tesoreria/tesoreriaMovil.test.mjs` sobre una lectura real
  recortada (`lecturaReal.fixture.json`), y las contrapruebas `TES-` de
  `scripts/contrapruebas-revision.mjs`.
