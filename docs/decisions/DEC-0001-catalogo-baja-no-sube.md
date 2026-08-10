# DEC-0001 — El catálogo baja del depósito, no sube del local

**Estado:** Vigente

## Contexto

Con un depósito y varios locales bajo el mismo grupo, todo `ProductoBase` era
visible desde todas las ubicaciones. Un producto que un local daba de alta para su
propia góndola aparecía en el catálogo del depósito y en el de los otros locales,
mezclado con el catálogo real.

## Decisión

Asimetría deliberada: **lo que crea el depósito baja a todos los locales; lo que
crea un local existe solo en ese local.** El producto guarda quién lo creó
(`ProductoBase.creadoEnLocalId`) y la visibilidad se resuelve con un predicado
puro, no con condiciones repartidas por cada consulta.

Dos decisiones satélite, tomadas en el mismo momento y comentadas al lado:

- **D2** — un producto con `creadoEnLocalId = null` se trata como del depósito, o
  sea visible para todos. Al decidirlo no había ninguno en producción.
- **D3** — con dos depósitos en un mismo grupo, cada uno vería solo lo suyo. Se
  asumió como límite conocido porque hoy hay un solo depósito.

## Motivo

Un catálogo compartido entre ubicaciones que compran distinto se ensucia solo, y
el que lo sufre es el depósito, que es quien realmente sostiene el catálogo. La
razón del predicado único en vez de condiciones repartidas está en la regla 1 de
`CLAUDE.md`: dos funciones que hacen lo mismo no se rompen el día que se
escriben, se rompen el día que una cambia.

## Consecuencias

- El proveedor pasa a verse **donde se creó el producto que lo usa**, no
  globalmente: hizo falta un segundo predicado (`proveedorVisibleWhere`).
- Un local **sí puede crear productos**. Es lo que hace que
  `docs/01-ARQUITECTURA.md` esté equivocado hoy (ver contradicción C-02).
- Toda consulta de catálogo o de stock tiene que aplicar el predicado. Hoy lo
  hacen `productos/listar` y `stock_locales/listar`; `reportes-stock/valorizado`
  **no** lo aplica, y confía en partir del `ProductoLocal` de la ubicación.

## Evidencia

- `lib/visibilidad.js` — `productoVisibleWhere` (línea 27), `proveedorVisibleWhere`
  (54). Las decisiones D2 y D3 están comentadas en `:18-19` y `:47-50`.
- Migración `prisma/migrations/20260727120000_aislamiento_ubicacion/`.
- Commits `fd6a7db` *feat(db): agregar aislamiento por ubicación y lecturas por
  usuario* y `7c66a4f` *feat(productos,proveedores): visibilidad depósito ↔
  locales*.
