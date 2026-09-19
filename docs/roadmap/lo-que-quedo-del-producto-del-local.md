# Lo que quedó afuera al hacer que el local mande en su producto

Anotado el 2026-09-19, al cerrar el
[INC-0012](../incidents/INC-0012-el-local-no-manda-en-su-propio-producto.md) y la
tanda que le siguió —el catálogo del pedido evaluado con la ubicación que opera—.

Ninguno de estos es el defecto que se estaba arreglando. Se dejan escritos con su
motivo para que la próxima vez no haya que volver a descubrirlos.

---

## 1. El alta de un producto NO SE AUDITA · **[MEDIDO]**

`lib/auditoria/interceptor.js` registra `ProductoBase: ["update", "updateMany"]`.
**`create` no está**, y el dominio `Producto` devuelve siempre
`accion: "producto.editar"`; no existe `producto.crear`.

Comprobado ejerciéndolo, no leyéndolo: **dos productos creados por la aplicación
desde el Local 1 dejaron cero filas en la bitácora**.

**Por qué importa**: es lo que hizo imposible reatribuir los productos que
hubieran quedado mal asignados. Sin rastro de quién creó qué, cualquier lista de
ids sería adivinada, así que esa migración quedó frenada. Si vuelve a hacer falta
—y va a hacer falta el día que algo se atribuya mal— hay que tener el rastro
desde antes.

Es barato: agregar `create` a la lista del interceptor y darle su propia acción.
Lo que no es gratis es decidir qué se guarda en `cambios` para un alta.

---

## 2. Tres altas dejan que el CUERPO DEL PEDIDO decida el dueño · **[CÓDIGO]**

`creadoEnLocalId` es lo que después leen la visibilidad, la propiedad del costo y
el catálogo de compras. Estas tres lo toman de donde no deberían:

- `app/api/productos/import/apply/route.js` — `body.localId` **con prioridad
  sobre la sesión**, con una cascada propia escrita a mano en vez de un
  resolutor.
- `app/api/stock_locales/nuevo/route.js` — `body.creadoEnLocalId ?? body.creado_en_local_id ?? sessionLocalId ?? null`.
- `app/api/stock_locales/importar/route.js` — por fila del cuerpo, con default `null`.

Las dos de `stock_locales` se declaran **sin consumidor** en su propio
encabezado. La de `import/apply` sí se usa, y puede estar tomando el local a
propósito (un admin importando el catálogo de un local), así que **no es
evidente que sea un defecto**: es una decisión que hay que tomar antes de tocar.

El default `null` no es neutro: por la decisión D2 un `null` se lee como producto
de depósito, o sea visible en todos los locales y editable solo por el depósito.

---

## 3. `resolveGrupo` todavía puede no resolver el alcance · **[CÓDIGO]**

`lib/grupos.js` tiene cuatro resolutores. Tres siempre devuelven un `localId` o
un error; `resolveGrupo` con `requireLocalId` en false puede devolver
`localId: undefined`, y además lee el local del **body**, cosa que los otros tres
no hacen.

Es el resolutor del [INC-0006](../incidents/INC-0006-editar-proveedor-500.md) y
sigue disponible para que una ruta nueva lo elija por el nombre. Antes de tocarlo
hay que hacer el censo de sus llamadores: puede haber alguno que dependa de que
devuelva indefinido.

---

## 4. Tres pantallas de compras filtran por ubicación sin la caída a depósito

`compras-proveedor/listar`, `resumen` y `ganancia` filtran
`creadoEnLocalId: localId` **a secas**, sin replicar la caída a `depositoId` que
sí hace `ownerLocalIdDePedido`. Un pedido con `creadoEnLocalId` nulo es invisible
en esas tres pantallas y accesible por id en las demás — dos respuestas para la
misma pregunta de alcance, que es el patrón del INC-0006.

El schema dice que hubo backfill, así que hoy probablemente no haya ninguno. Lo
que reabre el agujero es cualquier fila nueva con el campo vacío.

---

## 5. Dos rutas de compras resuelven el pedido solo por grupo

`compras-proveedor/conciliacion/[pedidoId]` busca el pedido por `grupoId` y
después evalúa el catálogo con la **ubicación activa**;
`compras-proveedor/comprobantes/vincular` hace la misma mezcla. Alguien del
Local A puede abrir la conciliación de un pedido del Local B y verla evaluada con
el catálogo de A.

Mientras el catálogo era del depósito esto era raro pero acotado. Ahora que el
catálogo depende de la ubicación, **la misma pantalla puede dar respuestas
distintas según quién la abra**. No se tocó porque no es el defecto reportado y
cambia qué ve cada uno.

---

## 6. Dos lugares de documentación contradicen al código

- `prisma/schema.prisma` dice que `depositoId` es "dónde entra el stock".
  `recibir/[id]/route.js` suma el stock a `ownerLocalIdDePedido(pedido)`, que es
  `creadoEnLocalId`. El comentario del schema quedó viejo.
- `DISENO_MODULO_COMPRAS_PEDIDOS_PROVEEDOR.md` describe el catálogo como "Solo
  depósito" y con un parámetro `depositoId` que ninguna pantalla manda.

---

## 7. Nueve textos de pantalla siguen diciendo "depósito" en el flujo de compras

En `compras-proveedor/nueva` ("no está habilitado en el depósito", dos veces), en
`[id]` (la etiqueta "Depósito", "cuando llegue al depósito", "Ganancia depósito",
el title del botón de recibir), en `ganancia` y en `ListadoPedidosProveedor` (la
columna "Depósito").

Ahora que un local puede armar su propio pedido, varios de esos textos le dicen
"depósito" a alguien que no está en el depósito. **No es plomería: es lo que la
persona lee.** Se deja para una tanda de textos, con la lista de diferencias
escrita por lo que se va a VER.
