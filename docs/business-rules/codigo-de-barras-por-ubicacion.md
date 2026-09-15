# El código de barras es único por UBICACIÓN, no por grupo

**Verificado en código y ejercido contra Postgres** —
`scripts/integracion-codigo-barra-ubicacion.mjs`, 23 afirmaciones contra las
rutas reales— y medido contra producción antes de tocar nada.

Complementa a [codigos-de-barra.md](codigos-de-barra.md), que describe los tres
campos. Esto describe **quién puede usar cuál**.

## EL DEFECTO, CON SUS NOMBRES PROPIOS

Mini el 7 y Casiano venden el mismo helado. El primero que lo cargaba se quedaba
con el código y el otro no lo podía dar de alta.

La causa era una sola línea del esquema: `@@unique([grupoId, codigo_barra])`.
Unicidad a nivel GRUPO, sobre un sistema donde **los locales son
independientes**: un producto creado por un local no-depósito existe SOLO en ese
local (`lib/visibilidad.js`, regla A). Los dos helados nunca se ven en la misma
caja, así que nunca hubo nada que desambiguar.

## LA REGLA

Lo que se puede escanear parado en un local son tres conjuntos:

1. los productos del **depósito**, que bajan a todos los locales;
2. los productos **propios** de ese local;
3. los `codigo_barra_propio` que ese local le puso a cualquiera de los dos.

**Un código no se puede repetir entre esos tres.** Principal y secundario
comparten un mismo espacio de nombres, porque los dos se escanean igual.

De ahí salen las cuatro consecuencias:

- **Dos locales distintos SÍ pueden repetir el código** entre sus productos
  propios. Es lo que se vino a arreglar.
- **Un producto propio de un local NO puede usar un código que ya tiene un
  producto de depósito**, porque el del depósito se vende en ese local.
- **El depósito no puede tomar un código que algún local ya usa.** Un producto de
  depósito se ve en todos, así que alcanza con que uno lo tenga.
- **Subir un producto al depósito es el mismo caso**, y se BLOQUEA. No se fusiona
  nada, no se toca stock ni ventas: quién cede el código es una decisión de las
  personas.

## EL ÁMBITO LO DECIDE EL DUEÑO DEL PRODUCTO, NO QUIEN OPERA

`creadoEnLocalId` decide dónde se va a ver el producto, y por lo tanto contra qué
hay que comparar. Editar desde el depósito un producto de Casiano **no** lo hace
competir con los códigos de Mini el 7.

## QUÉ GARANTIZA LA BASE Y QUÉ GARANTIZA EL CÓDIGO

El índice pasó de `(grupoId, codigo_barra)` a
`(grupoId, creadoEnLocalId, codigo_barra)`. La base garantiza lo único que puede
garantizar mirando una sola tabla: **que dentro de un mismo creador no se repita
el principal**. O sea el depósito entre los suyos, y cada local entre los suyos.

Lo demás no es expresable como índice y vive en
`validarUnicidadCodigos` (`lib/productos/validarCodigosBarra.js`):

- el cruce **principal ↔ secundario**: dos columnas de la misma fila;
- el cruce **local ↔ depósito**: filas de creadores distintos;
- el cruce contra **`codigo_barra_propio`**: otra tabla.

`creadoEnLocalId` es nullable y en Postgres dos NULL no chocan, así que dos
productos huérfanos podrían repetir código a nivel base. Hoy no hay ninguno
—medido: 0 de 2840— y la función igual los cubre, porque trata al huérfano como
de depósito (decisión D2).

## UNA SOLA FUNCIÓN, Y AHORA SÍ LA USAN TODOS

Antes había **cinco definiciones de "este código ya está en uso" con cuatro
mensajes distintos**. Hoy todos los caminos de alta y edición pasan por
`validarUnicidadCodigos`:

- `app/api/productos/crear` — ahora DENTRO de la transacción, detrás del bloqueo.
- `app/api/productos/editar/[id]` — con el ámbito del producto editado.
- `app/api/productos/import/apply` — alta y actualización.
- `app/api/productos/promover-a-deposito` — **antes no validaba nada**.
- `app/api/stock_locales/nuevo` — **tenía la suya, la más pobre de todas**.
- `app/api/stock_locales/importar` — **no validaba nada**, se apoyaba en
  `skipDuplicates`.
- `lib/combos/service.js` — los tres caminos (crear, desactivar, activo).

Y la vista previa del import (`import/preview`) pasó a mirar **lo visible en el
local que importa** en vez de todo el grupo, más los códigos propios de esa
ubicación. Antes un producto propio de otro local se tomaba como "el existente" y
la fila se clasificaba como ACTUALIZAR: le iba a pisar el nombre y el precio a un
producto ajeno.

## LA CONCURRENCIA

`bloquearCodigosDelGrupo` hace cola con
`pg_advisory_xact_lock(CLASE, grupoId)`, como primera sentencia de la
transacción. Es el mismo mecanismo que el número de venta y las ofertas, por el
mismo motivo: el bloqueo hace cola en vez de fallar, así que nadie tiene que
reintentar — y un reintento mal escrito acá inserta dos veces.

**Va por GRUPO y no por local** porque un producto de depósito tiene que estar
libre en todos: una llave por local no serializaría el alta en el depósito contra
el alta simultánea en un local, que es justo el par que puede chocar.

**Usa la forma de dos argumentos**, que en Postgres vive en un espacio de llaves
distinto del de la forma de un `bigint` —la que usan el número de venta y las
ofertas con el `localId` pelado—. Así dar de alta un producto no hace cola detrás
de una venta.

### DÓNDE LA VENTANA SIGUE ABIERTA, Y POR QUÉ

**`app/api/productos/editar/[id]` valida fuera de transacción.** La escritura la
hacen `editarBase` y `editarOverride`, que propagan precios a los locales y no
reciben un `tx`. Meterlas adentro es un cambio en el motor de precios y va en su
propia tanda. Lo que hoy respalda ese camino es el índice de la base, que cubre
el principal contra otro del mismo creador y nada más.

## LOS CUATRO RECHAZOS

Cuatro situaciones que se resuelven distinto necesitan cuatro textos; un mensaje
único obliga a adivinar qué hacer:

- **mismo catálogo** — buscar ese producto y decidir;
- **contra el depósito** — el código ya identifica otra cosa en esta caja;
- **contra otro local, subiendo al depósito** — dice QUÉ LOCAL y QUÉ PRODUCTO, y
  hay que hablar con ese local;
- **contra un código propio** — sacarle el código propio a aquel producto.

## MEDICIONES CONTRA PRODUCCIÓN, ANTES DE MIGRAR

- 2840 productos, un solo grupo. Depósito = local 1 (`depo`), 2326 productos.
  Propios: Casiano 337, Mini unidas 175, Mini el 7 dos, Minimarket ayala ninguno.
- La clave nueva simulada sobre los datos reales: **cero colisiones**.
- `creadoEnLocalId`: **cero nulos**.
- `codigo_barra`: 469 nulos, ningún vacío. `codigo_barra_secundario`: solo 29
  filas lo tienen, y **ninguna repetida**.
- Sin fugas entre locales: cada local tiene `ProductoLocal` de los productos del
  depósito y de los suyos, y de nada más.

### UN CHOQUE QUE YA EXISTE Y NO LO CREÓ ESTA TANDA

En **Mini unidas** el código `85` está dos veces: es el `codigo_barra_propio` de
"LA VIRGINIA CAPPUCCINO" (ProductoLocal 12168) y a la vez el `codigo_barra` del
producto propio "Cafe" (ProductoBase 3024). Escanear 85 en esa caja es ambiguo
hoy, y cuál gana depende del orden en que la búsqueda pregunte.

**No rompe ningún índice nuevo** —ese cruce vive en la función, no en la base— así
que la migración entra igual. A partir de ahora una carga así se rechaza; la fila
vieja queda y hay que decidirla a mano.

## LO QUE QUEDA SIN ACOTAR, ANOTADO

Dos búsquedas por código siguen resolviendo a nivel GRUPO, y las dos son del
universo de un proveedor, no de una caja:

- `app/api/compras-proveedor/buscar-base`
- `app/api/proveedores/listas/[id]/catalogo`

Con la regla nueva, un mismo código puede aparecer **dos veces** en esas listas,
una por local, cada una con su nombre. No resuelven un escaneo —no cobran nada—
pero conviene saberlo. Y hay una inconsistencia previa a esta tanda: la
conciliación automática (`lib/proveedores/listas/cargaErp.js`) SÍ usa
`productoVisibleWhere(localId)`, así que la búsqueda manual puede ofrecer vincular
un producto que la automática nunca sugeriría.
