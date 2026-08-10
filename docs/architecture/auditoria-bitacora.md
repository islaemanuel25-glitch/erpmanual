# Bitácora de auditoría

Registro central de quién cambió qué. Está implementada como **interceptor de
Prisma**, no como llamadas repartidas por las rutas.

Relevado sobre `d20afa98e9edece663fb3dda694d3c99783ab788`.

---

## Cómo funciona

`lib/prisma.js:10` envuelve el cliente con `auditoriaExtension`
(`lib/auditoria/interceptor.js`). **Toda escritura de la aplicación pasa por ahí**,
incluidas las de adentro de una transacción.

El interceptor usa el cliente **base** —sin extender— para sus propias lecturas y
para el insert en `AuditoriaBitacora`, para no reentrar.

El contexto de quién está operando viaja en un `AsyncLocalStorage`
(`lib/auditoria/contexto.js`), se siembra en `getUsuarioSession` y se vuelca al
terminar el pedido.

### El gotcha de Turbopack

Las dos referencias globales están **ancladas en `globalThis`** a propósito
(`lib/auditoria/interceptor.js:36-43` y `lib/auditoria/contexto.js:16-20`). Sin
eso, Turbopack puede cargar el módulo dos veces y el contexto sembrado por un lado
no lo ve el que vuelca por el otro. Está resuelto y explicado, pero es frágil por
diseño.

**Al desarrollar:** editar el interceptor **no tiene efecto hasta reiniciar el
servidor**. El cliente extendido queda cacheado y congela la clausura vieja. Dos
mediciones se perdieron por esto.

---

## Qué cubre — y es menos de lo que parece

La lista blanca está en `lib/auditoria/interceptor.js:49-59`. **Nueve modelos, y
no todas las operaciones de cada uno:**

| Modelo | Operaciones auditadas |
|---|---|
| `PedidoProveedor` | solo `update` |
| `Transferencia` | `update`, `updateMany` |
| `PosTransferencia` | solo `delete`, `deleteMany` |
| `ProductoBase` | solo `update` |
| `ProductoLocal` | `create`, `update`, `updateMany` |
| `Usuario` | `create`, `update`, `updateMany` |
| `Rol` | `create`, `update`, `delete` |
| `OperadorLocal` | `create`, `update`, `delete` |
| `OperadorEnLocal` | `create`, `createMany`, `delete`, `deleteMany` |

**No están `Venta`, `Turno`, `CajaMovimiento`, `StockLocal` ni `Cliente`.**

La conclusión honesta: la tabla sirve para rastrear **productos y usuarios**, no
para reconstruir la operación. Nadie puede preguntarle quién anuló un turno ni
quién movió stock.

---

## El punto de falla que no es obvio

`programarFlush` se llama desde **un solo lugar**: `lib/auth.js:147`, adentro de
`getUsuarioSession`.

Un endpoint que escriba en la base **sin** pasar por `getUsuarioSession`,
`requireAuth`, `requirePerm`, `requireAdmin` ni los resolvedores de
`lib/grupos.js` llena el buffer y **nunca lo vuelca**. La escritura ocurre y no
queda rastro.

Medición: de los **259** archivos `route.js`, **211 mencionan alguno de esos ocho
nombres**. Quedan **48 que no mencionan ninguno**.

**[DUDA]** — no se abrió una por una para saber cuáles de esas 48 escriben en la
base. Es la primera medición pendiente de esta área.

---

## Lo que ya se perdió, medido

`docs/BITACORA-COBERTURA.md` documenta que lo anterior al **2026-08-09** está
incompleto: **451 escrituras sin rastro sobre 811**, de las cuales 186 son
actividad diaria común y no una tanda masiva.

Ese documento existe justamente para que nadie lea la tabla dentro de un año como
si fuera completa. **La ausencia de una fila no prueba nada** sobre ese período.

Quedan dos verificaciones anotadas ahí mismo (`:74-80`): confirmar si las
escrituras dentro de transacciones interactivas se registran, y volver a correr la
medición sobre las escrituras nuevas.

---

## Quién puede verla

Permiso `auditoria.ver`. **No se scopea por local**: quien lo tiene ve todo, de
todas las ubicaciones (`app/api/auditoria/listar/route.js:6`).

Por eso `DUEÑO_LOCAL` **no** lo lleva, y está comentado el motivo en
`lib/rbac/systemRoles.js:82`: "la bitácora no es scopeable por local aún".

---

## No confundir con `auditoria-pos-ventas`

Son dos cosas distintas con nombres parecidos:

- **`auditoria`** — esta. La bitácora central, tabla `AuditoriaBitacora`, permiso
  `auditoria.ver`.
- **`auditoria-pos-ventas`** — vista técnica de solo lectura sobre ventas y turnos
  (KPIs, medios de pago, rentabilidad, tickets conflictivos). Permiso
  `reportes.ver`. No escribe nada y **no filtra las ventas internas, a propósito**
  (`lib/ventas/filtroVentaComercial.js:35-37`).

`docs/modulos/auditoria.md:33` aclara la diferencia.
