# INC-0012 — Un local no podía ponerle proveedor a un producto que ese local creó

**Estado:** **arreglado el 2026-09-19, sin desplegar todavía.** No hay ningún dato
mal: la columna siempre estuvo bien escrita.
**Cuándo:** desde que existe la rama de admin de `resolverRutaEdicion`.
**Alcance:** todo usuario **admin** operando **en un local**, sobre cualquier
producto que ese local haya creado. Un usuario no admin nunca lo tuvo.

## LO PRIMERO: EL DATO ESTABA BIEN

Va primero porque el reporte dice "figuran como creados en el depósito" y eso
invita a buscar una columna corrompida y a escribir una migración.

Se creó un producto **por la aplicación**, con una sesión del Local 1, y se leyó
la fila:

```
creadoEnLocalId = 2 (Local 1)
```

La ruta de alta —`app/api/productos/crear`— escribe `creadoEnLocalId: localId`
tomándolo del scope resuelto por `resolveScope`, y un no-admin no puede desviarlo.
**No es un defecto de escritura.** Es de lectura: de quién puede tocar el
producto, y de lo que el rechazo dice.

## Lo que se veía

Censo ejercido con curl y cookie real, sobre un producto que el Local 1 acababa
de crear, operando desde el Local 1:

| operación | admin | NO admin |
|---|---|---|
| asignar su proveedor propio | **403** | 200, `proveedor_id` escrito |
| editar la ficha | **403** | 200 |
| cargar costo y precio | **403** | 200 |

El 403 decía, literal:

> No podés modificar la ficha maestra de un producto administrado por el
> depósito. Solo podés editar el precio de venta, el margen y el estado en tu
> local.

De ahí sale el "figuran como creados en el depósito" del reporte: **no es la
ficha, es el mensaje del rechazo**, y afirma algo que `creadoEnLocalId`
desmiente. El dueño tenía menos poder que un usuario común sobre lo suyo.

## La causa

`lib/productos/propiedadCosto.js`, `resolverRutaEdicion`. Tenía **dos respuestas
para la misma pregunta**:

- la rama del admin se ruteaba SOLO por la ubicación desde la que se opera
  —depósito o local— y **nunca miraba `creadoEnLocalId`**;
- la de todos los demás pasaba por `alcanceEdicionProducto`, que sí mira la
  propiedad y contesta `'base'` para el local dueño.

Es el [INC-0006](INC-0006-editar-proveedor-500.md) otra vez: dos resolutores para
una misma pregunta de alcance, y el que corre para los admins no sabe de quién es
la cosa.

## El arreglo

Una línea, antes del ruteo por ubicación y sin reemplazarlo: si la ubicación que
opera **es la dueña**, la ruta es `'base'`. El admin pasa por la MISMA regla de
propiedad que ya rige para todos.

Es estrictamente ampliatorio: solo convierte un `'override'` en `'base'` cuando
la ubicación es dueña. **Ningún admin pierde nada** — sobre un producto ajeno
resuelve igual que antes—, y hay un candado que lo afirma casilla por casilla.

## Por qué los candados no lo atajaron

`propiedadCosto.test.mjs` ya tenía **seis** candados sobre `resolverRutaEdicion`,
y los **32** del archivo siguen verdes con el defecto puesto. Ninguno ejercía la
casilla "admin operando en el local que ES dueño": estaban el admin en el
depósito, el admin en un local sobre un producto **del depósito**, y el no-admin
dueño.

Los nuevos recorren la matriz entera —dueño × ubicación × admin— en vez de elegir
las casillas que parecen interesantes. Contraprueba: con el defecto puesto, **4
de los 7 nuevos dan rojo y los 32 viejos siguen verdes.**

## LA MIGRACIÓN NO SE HIZO, Y ÉSTA ES LA RAZÓN

Se pidió reatribuir los productos ya mal atribuidos cruzando la creación contra
`AuditoriaBitacora`. **No se puede, y no es por falta de datos en el banco: el
alta de un producto NO SE AUDITA.**

- `lib/auditoria/interceptor.js` registra `ProductoBase: ["update", "updateMany"]`
  — **`create` no está**—, y el dominio `Producto` devuelve siempre
  `accion: "producto.editar"`; no existe `producto.crear`.
- Comprobado ejerciéndolo, no leyéndolo: dos productos creados por la aplicación
  desde el Local 1 dejaron **cero** filas en la bitácora.
- En `erpazul_al` las 67 filas de entidad `Producto` son las 67 `producto.editar`.

Sin rastro de quién creó qué, cualquier lista de ids sería adivinada, así que la
migración queda frenada, como estaba previsto para este caso. **El arreglo hacia
adelante va igual**, y no depende de ella.

Se suma que la ruta que Emanuel usa atribuye bien, así que es probable que no
haya nada que reatribuir: su síntoma era el mensaje, no el dato.

## Lo que queda anotado, medido y SIN tocar

**El local sigue sin poder comprar su producto.** El catálogo del pedido a
proveedor —`app/api/compras-proveedor/productos`— evalúa la visibilidad con el
**depósito** y no con la ubicación que opera, y consulta `productoLocal` del
depósito. Ejercido después del arreglo, con un proveedor propio del Local 1 ya
asignado: **0 productos, tanto desde el Local 1 como desde el depósito.** Tiene un
comentario que lo declara deliberado ("el depósito no arma pedidos con productos
creados por un local"), así que cambiarlo es una decisión de negocio, no un
defecto — y toca qué ve el depósito, que es justo lo que esta tanda no arrastra.

**Tres altas dejan que el cuerpo del pedido decida el dueño**:
`productos/import/apply` (`body.localId` con prioridad sobre la sesión),
`stock_locales/nuevo` y `stock_locales/importar` (las dos declaradas sin
consumidor en su propio encabezado). No son el camino del defecto reportado y
`import/apply` puede estar tomando el local a propósito, así que quedan
anotadas.

**`resolveGrupo` sigue pudiendo devolver `localId` indefinido**
(`lib/grupos.js:161-163`). Es el resolutor del INC-0006 y sigue disponible para
que una ruta nueva lo elija por el nombre.

---

## SEGUIMIENTO — 2026-09-19: el local ya lo puede comprar

Lo que quedaba anotado arriba —"el local sigue sin poder comprar su producto"—
se resolvió en la tanda siguiente, con la decisión de negocio ya tomada: **el
catálogo del pedido a proveedor se evalúa con la ubicación que opera**, no con el
depósito.

**La regla asimétrica no cambió**, y es `productoVisibleWhere` quien la sostiene:
el local ve lo suyo MÁS lo del depósito, y el depósito sigue sin ver nada creado
por un local. Medido con curl y cookie real, admin y no admin: desde el Local 1,
946 productos con 2 propios y 2 del depósito; desde el depósito, 944 con **0**
del local — el mismo 0 de antes, que es el resultado correcto.

Hubo que tocar algo más que el catálogo, y no por ensanchar el alcance sino
porque sin eso la pantalla mentía: **las tres puertas por las que entra una línea
a un pedido** —crear, agregar ítem, aplicar importación— exigían que la fila de
ProductoLocal fuera del DEPÓSITO. Medido antes de tocarlas: HTTP 400 "no
pertenece al depósito" sobre el mismo producto que el catálogo acababa de
ofrecer. Las tres le preguntan ahora a `ownerLocalIdDePedido`, que ya existía y
es la misma que usa `recibir` para decidir a qué ubicación entra el stock.

**La parte que no se podía llegar a ejercer hasta ahora, ejercida**: recepción
completa desde el Local 1 —crear, confirmar, enviar, recibir—. El stock entró en
el Local 1 y el costo maestro se escribió, $100 a $180 y a $90, porque el local
ES el dueño del producto. Esa rama de `puedeEditarCosto` nunca había corrido en
este flujo.

Lo demás que apareció mirando el flujo quedó anotado, sin tocar, en
[el roadmap](../roadmap/lo-que-quedo-del-producto-del-local.md).
