# DEC-0012 — La caja es del operador, no de la cuenta ERP

**Fecha:** 2026-10-02
**Estado:** VIGENTE y **desplegada** el 2026-10-03: producción corre
`ccc106bec29cd91b0663754bd9c5052f3cbaa824` (merge de la PR #126) y la migración
`20261002120000_caja_por_operador` está aplicada. El resultado del despliegue
está en `docs/deploy/MIGRACIONES-SIN-APLICAR.md`.
**Alcance:** de quién es un turno de caja, quién lo puede operar y cómo se
reportan sus diferencias.

## Contexto

En el mostrador real varios operadores trabajan a la vez en el mismo local con
**una sola cuenta ERP** (la de la computadora), y **cada uno tiene su propio
cajón físico**. Regla de negocio confirmada por Emanuel el 2026-10-02.

El turno se identificaba por `localId + vendedorId`, y `vendedorId` es la
cuenta. El índice `Turno_local_vendedor_abierto_key` impedía que dos operadores
de la misma cuenta abrieran cada uno su turno, y `turnos/actual` devolvía "el
turno de la cuenta". Resultado, medido con el candado de esta decisión sobre
`main` (`db225fb7`): el operador B no podía abrir su caja con la cuenta del
local y terminaba vendiendo en la de A. Sus ventas, retiros, arqueos y conteo
caían en el mismo turno, y un −$5.000 de A con un +$5.000 de B era un cajón
"sin diferencia".

Había además tres lugares que autorizaban solo por local —Caja +/−, el contexto
de arqueo (arqueo, postergación, inicio de retiro) y el inicio de corte—, y dos
reportes que neteaban diferencias: el de operadores de la Auditoría POS (agrupado
por cuenta) y el resumen de la pantalla de Cajas ("Dif. acumulada", oculta si
daba cero).

## Decisión

**La cuenta ERP autentica el acceso. El operador identifica al responsable de
la caja física.**

- Un turno **con** `operadorId` es la caja de ese operador en ese local, con la
  cuenta que sea. Un turno **sin** operador es la caja de la cuenta, como
  siempre: locales sin operario, Admin o Dueño sin PIN, y todos los turnos
  históricos. La regla se lee del dato del turno, no de la configuración del
  local, así que la historia no se reinterpreta.
- Garantía en la base: dos índices únicos parciales,
  `Turno_local_operador_abierto_key` (localId, operadorId) y
  `Turno_local_cuenta_sin_operador_abierto_key` (localId, vendedorId) para los
  turnos sin operador. El de operador además impide que A tenga dos cajas
  entrando con dos cuentas.
- La identidad sale de la sesión y de la cookie del PIN **validada en el
  local** (local de la cookie, asignación al local, operador activo). Nunca de
  un id que mande el cliente.
- Un cajero común opera solo su caja: vender, mover, arquear, retirar, cortar,
  cerrar. **Admin y el Dueño en su local** pueden intervenir la caja de un
  operador —es `puedeOperarSinOperador`, la capacidad que ya tenían para operar
  sin PIN—, con su autoría en las columnas existentes (`realizadoPorId`,
  `cerradoPorId`, `usuarioId`, `iniciadoPor*`). Vender se hace solo en la caja
  propia. Mirar una caja ajena sigue pidiendo `turnos.ver_todos`.
- **Pagos desde Finanzas, Gastos o Compras: sin cambios.** Quien está
  autorizado elige un cajón operativo y el retiro es de ese turno; no se exige
  que su operador registre el pago.
- **Venta offline (corregido en dos revisiones de la PR, 2026-10-03):**
  una venta pertenece a la caja donde se cobró; offline solo significa que
  llega tarde. **Se escribe sola únicamente si puede escribirse como una venta
  de ahora**: PIN activo validado del dueño de la caja, en su turno ORIGINAL,
  operativo y abierto hoy. Si no —sincroniza otra persona, la caja cerró o
  venció—, el servidor la rechaza sin escribir nada y queda en la cola: no se
  muda al turno actual, no se borra y no se le inventa dueño. Resolverla es
  otro trabajo, de una persona.
  - `origenOffline: true` lo manda el cliente: no concede ninguna excepción, ni
    de propiedad ni de vigencia.
  - El **voucher** del operador no autoriza nada: no está atado a una venta, no
    vence y queda guardado en el navegador, así que quien lo lea puede
    reusarlo. Se conserva solo para **negar**: si la venta de la cola la cobró
    otro operador que el del PIN, 409 y queda pendiente.
  - La cola guarda el turno donde se cobró y se sincroniza contra ése.
  - Las ventas encoladas antes de este cambio no traen turno: **ninguna se
    sincroniza sola**, tengan voucher o no. Con el voucher se sabe quién, no en
    qué caja.
  - Un reintento de una venta que ya se escribió (se perdió la respuesta) se
    reconoce por su `clientTxnId` antes de mirar el turno, si apunta al mismo
    local y turno: así no queda pendiente estando escrita aunque su caja cierre.
  - Historia: la primera versión aceptaba "cualquier turno de la cuenta" en el
    replay; la segunda tomaba el voucher como identidad y salteaba la vigencia
    con la bandera. Con cuenta compartida, las dos dejaban escribir en la caja
    de otro.
- **`CajaMovimiento` no lleva `operadorId`**: se deriva de `turnoId →
  Turno.operadorId`, que no se reescribe nunca.
- **Un carrito no cruza de caja ni se pierde**: cada identidad de caja (local
  + cuenta + operador) tiene su borrador. Al cambiar de PIN la pantalla deja el
  de A en su clave y carga el de B; A vuelve y lo encuentra. Nada se escribe
  hasta saber de quién es el carrito en pantalla. El borrador anterior a esta
  regla se restaura solo para quien opera sin operador; bajo un PIN no se carga
  ni se borra. **Un corte de red no es "se fue el operador"**: si
  `/api/operador/me` no contesta (sin red, 5xx), la pantalla conserva el último
  operador validado (`lib/operador-revalidacion.js`); solo una respuesta del
  servidor cambia la identidad. No es autenticación offline: el servidor sigue
  mirando la cookie en cada operación.
- **Las diferencias no se netean**: los reportes de responsabilidad separan
  faltante y sobrante por responsable; un neto del local solo existe rotulado
  como agregado estadístico.

## Motivo

Lo dio Emanuel: cada operador tiene físicamente su propia caja de dinero y las
diferencias entre operadores jamás se compensan. La forma técnica —derivar la
propiedad del dato del turno, dos índices parciales en vez de uno con tres
columnas, la intervención por la capacidad existente— está razonada en el plan
técnico de la tanda y en los comentarios de `lib/caja/cierreRelevo.js` y de la
migración.

## Consecuencias

- **Transición:** en un local con cuenta compartida, la caja que hoy comparten
  dos operadores sigue siendo de quien la abrió. Desde el despliegue, el otro ya
  no la encuentra en el POS y abre la suya. No se reparte nada hacia atrás.
- La migración **aborta** si hay un operador con dos cajas operativas en el
  mismo local, sin elegir ni cerrar ninguna, o si no consigue `Turno` en 3 s
  (`lock_timeout`, patrón de `libro_stock`). Por eso el precheck de solo lectura
  es requisito del despliegue; también advierte las cajas abiertas sin operador
  en locales que exigen operador, que después solo administran Admin o Dueño.
- **Ventas offline pendientes:** quedan en la cola sin sincronizarse las de
  antes de este cambio (todas), y las nuevas cuya caja cerró o venció antes de
  sincronizar, o que intenta sincronizar otro operador. No hay pantalla para
  resolverlas: es un trabajo pendiente, y resolverlas es una decisión de una
  persona.
- Un censo (`lib/caja/censoCajaPropia.test.mjs`) obliga a que toda ruta del
  POS que toca un turno diga cómo decide de quién es la caja.
- La base para la futura auditoría de recaudaciones queda armada:
  operador → `Turno.operadorId` → retiros (`CajaMovimiento` por `turnoId`,
  recaudaciones en `ArqueoCaja`, retiro final en `retiroCierreMovimientoId`) →
  total declarado, sin pasar por la cuenta. No se implementó la auditoría.
- Lo que queda abierto está en la PR: `cambios-pendientes/listar` y `liberar`
  todavía leen la cookie del operador sin validarla contra el local (son
  reservas de sobres, no propiedad de caja), y `auditoria-pos-ventas/turnos/personas`
  sigue agrupando ventas por cuenta (estadística de ventas, no de caja).

## Evidencia

- Regla: `lib/caja/cierreRelevo.js` (`whereCajaPropia`, `esCajaPropia`,
  `whereCajaAccesible`, `puedeActuarSobreCaja`, `responsableDeCaja`), con
  `lib/caja/identidadCaja.test.mjs`.
- Identidad: `lib/caja/identidadCajaServer.js` y
  `getOperadorActivoDelLocal` en `lib/operador.js`.
- Migración: `prisma/migrations/20261002120000_caja_por_operador/`; precheck
  `scripts/deploy/precheck-caja-por-operador.sql`; estructura en
  `scripts/pruebas-db/estructura.mjs`.
- Candado de integración: `scripts/pruebas-db/cajaPorOperador.mjs` — rojo sobre
  `db225fb7` (B recibe 409 al abrir), verde con esta decisión, en CI.
- Carrito: `lib/pos-ventas/carritoPorCaja.js` y su candado.
- Reportes: `app/api/auditoria-pos-ventas/operadores/route.js`,
  `app/modulos/auditoria-pos-ventas/cajas/page.jsx` y
  `lib/auditoria-pos-ventas/diferenciasSinNetear.test.mjs`.
