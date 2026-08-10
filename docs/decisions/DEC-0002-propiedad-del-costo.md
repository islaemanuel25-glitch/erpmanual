# DEC-0002 — Solo el dueño del producto edita su costo

**Estado:** Vigente

## Contexto

Cualquier ubicación podía escribir el precio de costo de cualquier producto. Con
el catálogo del depósito replicado en todos los locales, eso significa que un
local podía cambiar el costo maestro de un producto que no es suyo, y el cambio
se propagaba.

## Decisión

El costo de un producto lo edita **únicamente la ubicación que lo creó**: el
depósito si el producto es del depósito, o el local creador si es exclusivo de
ese local.

Y una segunda mitad que importa tanto como la primera: si una ubicación que no es
dueña manda cambios de ficha maestra, el servidor **rechaza con 403** en vez de
descartarlos en silencio. Nada de guardado engañoso.

## Motivo

El costo es el número del que cuelgan el precio de venta, el margen y la
valorización del stock. Quien lo paga es quien compra, y quien compra es el dueño
del producto.

Lo del 403: un guardado que responde bien y no escribe es peor que uno que falla,
porque nadie se entera. Está escrito así en el pedido que originó el cambio.

## Consecuencias

- Se creó `lib/productos/propiedadCosto.js` como módulo **puro**, sin imports de
  servidor, para que lo puedan usar tanto las rutas como los scripts. 32 candados.
- `puedeEditarBaseProducto` **reusa** `puedeEditarCosto` en vez de repetir la
  regla, para que la propiedad del costo y la de la ficha no puedan divergir.
- Falla cerrado: si no se puede resolver el depósito del grupo, **no** se asume
  que el producto es del depósito.
- Aparece `mismoCosto` con tolerancia 0,005, porque reenviar el formulario sin
  tocar nada mandaba el mismo número y se leía como intento de cambio.
- **Pendiente conocido:** de los ~15 caminos que escriben el costo maestro, solo
  nueve verifican esta regla. Ver `docs/business-rules/costos-y-precios.md`, RN-13.

## Evidencia

- `lib/productos/propiedadCosto.js` y `propiedadCosto.test.mjs`.
- El rechazo con 403: `app/api/productos/editar/[id]/route.js:60-93` y `:331-338`.
- Commit `d6c0707` *fix(productos): aislar el precio de costo según origen y
  propietario*.
- La propagación con el margen de cada ubicación, agregada después:
  `lib/precios/propagarCostoALocales.js` y commit `9574a29` *fix(precios): que una
  suba de costo arrastre el precio de venta de cada local*.
