# Depósito y local: quién ve qué y quién manda

La regla raíz del sistema. Casi toda decisión no obvia sale de acá.

---

## RN-01 — El catálogo baja, no sube ("Regla A") · **[CÓDIGO]**

Un producto creado en el **depósito** se replica a todas las ubicaciones del
grupo. Un producto creado en un **local** existe **solo en ese local**: no sube
al depósito ni lo ven los otros locales.

**Dónde:** `lib/visibilidad.js`, `productoVisibleWhere(localIdActivo)` (línea 27).
Devuelve un fragmento de `where` que dice: visible salvo que lo haya creado
**otro** local que no sea depósito.

**Quién la aplica:** `app/api/productos/listar/route.js:115`,
`app/api/stock_locales/listar/route.js:246` y `:314`.

**La replicación:** `app/api/productos/crear/route.js`, rama
`if (creador?.es_deposito)` (línea 222). La rama del local (línea 271) crea solo
la fila local.

### Corolario — un local SÍ puede crear productos

Solo que no se replican. **[CONTRADICCIÓN]** con `docs/01-ARQUITECTURA.md`, que
en su tabla "Depósito vs Local" pone "Crea productos: Local → No". Manda el
código.

### Corolario — el producto sin creador se trata como del depósito

`creadoEnLocalId = null` → visible para todos. Está comentado como decisión D2 en
`lib/visibilidad.js:18-19`. **[DECISIÓN]**

### Límite conocido — dos depósitos en un grupo

Con dos depósitos en el mismo grupo, cada uno vería solo lo suyo. Lo anota el
propio código como decisión D3 (`lib/visibilidad.js:47-50`). Hoy hay un solo
depósito, así que no se manifiesta. **[CÓDIGO]**

---

## RN-02 — El proveedor se ve donde se creó el producto que lo usa · **[CÓDIGO]**

`lib/visibilidad.js`, `proveedorVisibleWhere(localIdActivo, grupoId)` (línea 54).
Mira las tres relaciones de proveedor del producto (`proveedor_id`,
`proveedor2_id`, `proveedor3_id`), más un fallback para el proveedor recién
creado que todavía no tiene productos.

---

## RN-03 — El depósito cuenta en bultos, el local en unidades · **[CÓDIGO+DOC]**

El puente es `ProductoBase.factor_pack`.

Las dos vistas están separadas en el mapeo, no en la pantalla:
`lib/stock/mapItem.js`, `mapStockItemLocal` (línea 19) y `mapStockItemDeposito`
(línea 71). Elige una u otra `app/api/stock_locales/listar/route.js:108` y `:217`.

---

## RN-04 — Las tres capas de un producto · **[CÓDIGO]**

```
ProductoBase    ficha maestra por grupo. Único por (grupoId, codigo_barra).
ProductoLocal   override por ubicación. Único por (localId, baseId).
StockLocal      cuelga de ProductoLocal, NO de la base. Único por (localId, productoId).
```

**Todos los campos de precio de `ProductoLocal` son opcionales** y funcionan como
override: si no es null gana el override, si es null gana la base. La lectura
está en `lib/mappers/producto.js:15-18` (`pick`) y `:58-60`.

`StockLocal.productoId` apunta a **`ProductoLocal.id`**, no a la base. Es el error
de lectura más fácil de cometer en este esquema.

Escalas: `cantidad` y `enTransito` en `Decimal(12,3)`; `stockMin`/`stockMax` en
`(12,2)`, porque son umbrales y no cantidades movidas
(`prisma/schema.prisma:441-449`).

### Cómo nacen las filas · **[CÓDIGO]**

- Alta en depósito → `ProductoLocal` + `StockLocal` en el depósito y en todos los
  locales (`crear/route.js:222-264`).
- Alta en local → solo ahí (`crear/route.js:271-303`).
- Depósito con filas faltantes → **las materializa sola la primera lectura de
  stock** (`stock_locales/listar/route.js:241-275`), respetando la Regla A y
  saltando combos.
- Destino de una transferencia → `ProductoLocal` por upsert al enviar; el
  `StockLocal` recién al confirmar la recepción.

### Asimetrías reales

- Un **combo** tiene `ProductoBase` y `ProductoLocal` pero **nunca `StockLocal`**.
  Su disponibilidad se calcula desde los componentes.
- `ProductoLocal.nombre` y `.descripcion` existen como override, pero
  `editarOverride` los fuerza a `null`
  (`app/api/productos/editar/[id]/route.js:601-602`): el renombre por local está
  anulado de hecho. **[ACCIDENTE POSIBLE]** — no se encontró comentario que lo
  justifique.

---

## RN-05 — Un producto exclusivo de otro local responde 404, no 403 · **[CÓDIGO]**

`app/api/productos/obtener/route.js:88-93`. No revela que el producto existe. Es
una decisión de diseño y no un descuido: el 403 filtraría la existencia.

---

## RN-06 — El combo es más estricto que el producto · **[CÓDIGO]**

Un combo solo lo ve el local que lo creó, **aunque haya nacido en el depósito**
(`app/api/productos/listar/route.js:119`). El estado de un combo vive en
`ProductoLocal.activo` y **nunca** se toca `ProductoBase.activo`
(`lib/combos/service.js:412-415`, `:458-465`).

Un combo no puede contener otro combo (`lib/combos/service.js:126`).
