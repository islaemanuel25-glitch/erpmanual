# INC-0007 — `proveedores/listar` le entrega la lista completa a un rol que no tiene el permiso

**Fecha:** 2026-08-15
**Estado:** **arreglado en local el 2026-08-15, sin desplegar todavía.** Trece de
las diecinueve del censo cierran; seis esperan una decisión y están listadas
abajo. **Las diecinueve están igual en el commit que corre hoy en producción.**
**Alcance:** empezó en `app/api/proveedores/listar` y el censo lo llevó a 19
rutas.

## La causa, en una línea

**La ruta comprueba que haya sesión y no comprueba ningún permiso.** Pide
`getUsuarioSession`, resuelve el alcance por ubicación con `resolveLocalAndGrupo`
y con eso alcanza: no llama a `checkPerm` ni a ningún equivalente en ninguna
línea del archivo.

Consecuencia: **cualquier usuario con sesión válida ve los proveedores de su
local**, tenga o no el permiso que la pantalla exige.

## Cómo se midió

Se creó **en la base local `erpazul_dev`, por la API de la propia aplicación y no
escribiendo la base**, un rol igual al `CAJERO` real de producción —cuatro
permisos exactos: `clientes.puntos.ver`, `clientes.puntos.canjear`,
`clientes.cc.ver`, `clientes.cc.pagar`, y ninguno más— y un usuario con ese rol.
Los permisos se confirmaron leyendo lo que devolvió el login, no lo que se pidió
al crearlo.

Con esa cookie se pidieron **cuatro rutas de lectura**:

- `productos/listar` → **403** `"Sin permiso: productos.ver"`
- `proveedores/listar` → **200 con datos** ← el hallazgo
- `usuarios/listar` → **403** `"Requiere administrador"`
- `categorias/listar` → **403** `"Sin permiso: productos.ver"`

Las tres que cierran nombran el permiso que falta. **El mecanismo existe y
funciona**; lo que falla es que esta ruta no lo usa.

Lo que devolvió: `id`, `nombre`, `cuit`, `telefono`, `email`, `direccion`,
`dias_pedido` y `activo` de cada proveedor. Nombres, teléfonos y días de pedido.

## ⚑ LA TRAMPA DE LA LISTA VACÍA — es lo más importante de este incidente

**La primera corrida contestó `200 {"items":[],"total":0}` y casi la doy por
cerrada.** Un 200 vacío se lee como "no ve nada", que es lo mismo que se espera de
un 403.

**No era el permiso: era el dato.** El usuario de prueba estaba en el local 2,
donde no hay ningún proveedor cargado. Lo que lo protegía era que del otro lado no
hubiera nada, no que la autorización lo frenara.

Se comprobó moviendo **el mismo usuario** al local 1 —por
`PUT /api/usuarios/editar/13`, volviendo a entrar y confirmando que los permisos
seguían siendo los cuatro— y pidiendo **la misma ruta**: salió la lista entera.

**La regla que deja esto:** un 200 vacío no prueba nada por sí solo. Puede ser la
autorización cerrando o puede ser que no haya filas. **Antes de anotar una ruta
como cerrada por devolver vacío, hay que saber por qué está vacía** — el camino
barato es pedir lo mismo con un rol que sí tenga el permiso y ver si a ése le
contesta con datos.

Y por eso el censo que sigue se corre con el usuario de prueba en **un local que
tenga datos de todo**: un vacío por falta de datos convierte un agujero en un
verde.

## Un segundo defecto en la misma ruta — EJERCIDO, y NO se puede alcanzar

`listar/route.js:25` hace `const visFilter = scope.error ? [] : [...]`. Si
`resolveLocalAndGrupo` devuelve error —por ejemplo un usuario no-admin **sin
local asignado**, que da `403 "Sin alcance autorizado."`— la ruta **no corta**:
deja el filtro de visibilidad **vacío** y sigue. Leído, eso devolvería **todos los
proveedores de todos los locales** con un 200, que rompe además el aislamiento por
ubicación.

**Se intentó ejercer y la aplicación no deja llegar.** Los dos caminos que podrían
dejar a un no-admin sin local contestan lo mismo:

- crear el usuario sin local → `{"ok":false,"error":"El rol CAJERO requiere un
  local asignado."}`
- editar el usuario de prueba para quitarle el local → el mismo error, y el
  usuario quedó intacto en el local 1.

Así que la rama existe en el código y **hoy no tiene forma de correr**. Queda
anotada porque una defensa que depende de otra ruta se cae el día que esa otra
ruta cambia, no el día que se escribe — pero **no es un agujero abierto**, y
decirlo importa tanto como haberlo sospechado.

## EL CENSO — el tamaño del problema, medido el 2026-08-15

Cuatro rutas no eran una tasa. Se pidieron **las 147 rutas de lectura** con la
cookie del CAJERO, corriendo, una por una.

**Los tres números:**

- **147 pedidas**, de las 270 `route.js` del repo.
- **103 cierran bien**, todas con **403** y nombrando el permiso que falta:
  `productos.ver`, `reportes.ver`, `compras.ver`, `auditoria.ver`,
  `listas_precios.ver`, `clientes.ver`, `Requiere administrador`…
- **19 contestan con datos que ese rol no debería ver.**

Las 19, con lo que entregaron:

`proveedores/listar`, `proveedores/opciones` y `catalogos/proveedores` —nombres,
CUIT, teléfonos, días de pedido y umbrales de precio—; `transferencias/pdf` y
`transferencias/pdf-recepcion` —dos remitos en PDF con productos, cantidades y
**COSTOS**, que es lo más sensible de la lista—; `dashboard/ventas-recientes` y
`dashboard/actividad` —ventas con total, forma de pago, cliente y vendedor, más
los ajustes de stock y quién los hizo—; `dashboard/resumen`; `locales/listar`,
`locales/opciones` y `locales/[id]` —dirección, teléfono, CUIL y política de
límite de crédito—; `grupos/opciones`; `operador/listar` —los nombres de los
operarios—; `areas-fisicas/listar` y `catalogos/areas-fisicas`;
`config/arqueo-caja`, `config/pos-ventas-cliente` y `config/stock-negativo`; y
`notificaciones/contar`, que devuelve **16**.

**Ninguna de las 19 chequea permiso en su handler de GET.** Quince no lo chequean
en ningún handler; **las otras cuatro lo tienen escrito, pero en el POST o el
PUT** —`locales/[id]`, y las tres de `config/`—: importan `checkPerm`, lo llaman
al escribir, y el camino de lectura no pasa por ahí.

**Eso tiró un tercer conteo estático el mismo día.** Mirando el ARCHIVO, cuatro de
las diecinueve "chequean permiso"; mirando el HANDLER, cero. La unidad estaba mal
elegida, igual que en los otros dos.

### Lo que el censo NO cierra, y hay que leerlo pegado a los números

- **10 rutas contestaron 200 sin datos** y **no se pueden dar por cerradas**: es
  exactamente la trampa de más arriba. `clientes/tags`, `config/ticket`,
  `puntos-config` y `config/apariencia-local` devolvieron vacío porque esas tablas
  tienen **cero filas** en `erpazul_dev`; `notificaciones/listar` devolvió vacío
  mientras `contar` decía 16. Ninguna dijo 403. Con datos cargados podrían pasar a
  la lista de arriba.
- **10 rutas no se pudieron pedir** por falta de datos: las siete de
  `proveedores/listas/[id]` —no hay ninguna importación de lista—, las dos de
  `combos/[productoLocalId]` —no hay ningún combo— y
  `pos-ventas/correcciones/[id]` —no hay ninguna corrección—. Se dice, no se
  cuentan como cerradas.
- **Las lecturas que se piden por POST quedaron afuera.** El censo enumeró por
  handler `GET`, y hay al menos cinco que leen con POST: `productos/export`,
  `productos/precios/preview`, `listas-precios/preview-precio`,
  `productos/import/preview` y `clientes/import/preview`. `productos/export` es
  el que más pinta tiene de importar.
- **Nada de escritura se ejerció**, por consigna. Contadas por handler: **148**
  —116 POST, 17 PUT, 1 PATCH, 14 DELETE— repartidas en 142 archivos, 122 de los
  cuales no tienen GET.
- **Nada contra producción.** Todo contra `erpazul_dev`.

## EL ARREGLO — y la prueba es el censo, no el diff

Se volvieron a pedir **las 147** con la misma cookie de CAJERO. **Las que cierran
pasaron de 103 a 117**, y las trece arregladas pasaron de 200 a **403 nombrando el
permiso que falta**. Dos controles al lado: **ninguna que antes cerraba contesta
ahora**, y **el admin sigue recibiendo 200 en las catorce** —o sea que se cerró la
puerta, no se rompió la ruta—.

**Cada permiso salió del módulo y del consumidor real**, buscado con `git grep`.
Eso corrigió tres elecciones que habrían roto pantallas:

- **`locales/[id]` iba a ir con `requireAdmin`**, como su PUT y su DELETE. La
  llaman el POS —con su propio local— y `pos-transferencias/nueva` con el origen y
  el destino, así que va con el permiso de esas pantallas.
- **`operador/listar` iba a ir con `config_local.operadores`**, que es lo que usan
  sus cinco hermanas. Habría roto el selector de operario del POS: **quien opera la
  caja no administra operarios.** Va el par con `pos.usar`.
- **`config/pos-ventas-cliente`** la lee el POS para saber si exige cliente y
  operario antes de cobrar. Mismo par.

**Las cuatro que tenían el chequeo en otro handler llevan el suyo EN EL GET**, sin
reaprovechar el del POST.

**Y apareció algo que el censo no había medido:** con la sesión del CAJERO del
local 1, **`/api/locales/2` contestaba 200 con la ficha entera de "mini el 7"**.
El `authorize` de esa ruta compara **grupo**, no local. No le faltaba tenancy: le
faltaba permiso. Era el sondeo de "otro local" que había quedado sin hacer.

**`plantilla` se cerró aunque no estaba entre las 19**: devuelve la planilla de
importación vacía, sin ningún dato, pero sus columnas son el contrato de la
importación y el candado nuevo la marcaba con razón.

### LAS SEIS QUE ESPERAN DECISIÓN, sin tocar

No se arreglaron porque **es discutible que un cajero no pueda verlas**, y eso lo
decide Emanuel:

- **`dashboard/resumen`, `dashboard/ventas-recientes` y `dashboard/actividad`.**
  El dashboard es la portada y **hoy no pide ningún permiso** en el registro del
  menú, así que cerrarlas le deja la pantalla de entrada en blanco al cajero.
- **`notificaciones/contar`** — la campanita del encabezado, que ve todo el mundo.
- **`locales/opciones` y `grupos/opciones`** — las dos **ya recortan al local y al
  grupo propios** cuando la sesión no es admin, así que lo que devuelven es el
  contexto de quien pregunta y no datos ajenos. Probablemente no haya nada que
  arreglar acá.

### EL CANDADO

`scripts/permisoEnCadaGet.test.mjs`: **ninguna ruta puede exportar un GET sin
comprobar permiso**, anclado al **handler** y no al archivo — que es exactamente lo
que falló. `requireAuth` no cuenta.

**Dio rojo tres veces donde el servidor cerraba bien, y las tres las corrigió el
censo**, no leer el candado: las de `pedidos/` comprueban el permiso a mano, las de
`auditoria-pos-ventas` delegan en un ayudante importado, y `cierres/[token]` delega
dos saltos. Ahora sigue las llamadas hasta profundidad dos, por `@/` y por ruta
relativa.

**Contraprueba con seis mutaciones, las seis se comportan:** cuatro que tienen que
ponerlo en rojo —sacar el permiso, moverlo al POST, dejarlo solo en un comentario,
y que deje de encontrar rutas— y dos controles de ruta nueva, con permiso y sin él.

**Y la contraprueba se rompió sola la primera vez**, que es lo que más conviene
recordar: restauraba con `git checkout`, y como los arreglos todavía no estaban
commiteados, "volver al original" fue volver a la versión con el agujero — borró
tres. Es el reverso de la regla ya escrita: **restaurar con git da por hecho que el
árbol está commiteado.**

### Por qué estos números sí se sostienen

Los tres conteos que se cayeron hoy eran de grep. Éstos salen de pedirle a un
servidor 147 rutas con una cookie real, y hay dos controles que lo respaldan:

- **Las 103 que cierran son 403 y ninguna 401.** Un 401 habría querido decir
  sesión vencida, y entonces "cierra" sería un artefacto. No hay ninguno.
- **La sesión se comprobó viva DESPUÉS de terminar el censo**, no solo antes.

Y cada ruta se pidió con **tres identidades** —sin cookie, con la del cajero y con
una de admin con contexto en el local 1— para poder contestar por qué un vacío
está vacío, que es lo que este incidente enseñó.

## Qué NO se midió en la primera pasada

- **Nada de escritura.** Ninguna.
- **Ningún pedido apuntando a otro local.**
- **Cuántas rutas más están igual.** Cuatro de 270 no es una tasa: es una muestra
  chica con un positivo temprano. Eso lo contesta el censo, más abajo.
- **Nada contra producción.** Todo se midió contra `erpazul_dev`. Lo que sí se
  sabe es que el archivo es el mismo en el commit desplegado, y que la falta de
  permiso es de código y no de datos — pero esperable no es medido.

## Lo que queda en la base local

Rol **17 `CAJERO`** y usuario **13 `cajero.prueba@erpazul.local`** en
`erpazul_dev`, el usuario en el local 1. Quedan a propósito, para la tanda del
censo.

## Método

Se paró en el primer hallazgo y no se arregló nada, por consigna. El número que
vale es el de rutas **pedidas corriendo con una cookie real**, no el de un grep:
el mismo día se cayeron dos conteos estáticos al ejercerlos —el de "46 rutas sin
comprobación de sesión", que resultó ser 0, y el de "30 handlers que validan antes
de autenticar", que resultó ser 1—.
