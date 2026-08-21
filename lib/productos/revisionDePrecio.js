// lib/productos/revisionDePrecio.js
//
// CUÁNDO UNA ESCRITURA DEJA UN PRECIO "REVISADO".
//
// ── LA REGLA, EN UNA LÍNEA ──────────────────────────────────────────────────
//
// Una edición marca la revisión **solo en las ubicaciones donde el precio de
// venta EFECTIVO cambió**. Si el importe queda igual, la revisión se registra
// únicamente con la acción explícita `Precio revisado`.
//
// ── POR QUÉ, QUE ES DONDE ESTABA EL ERROR ───────────────────────────────────
//
// La primera versión marcaba revisado en cualquier guardado de la ficha. El
// razonamiento era "alguien abrió el producto, miró el precio y guardó, o sea que
// lo revisó". Es falso: se abre la ficha para corregir un nombre mal escrito o
// para cargar el proveedor que faltaba, se guarda, y ese guardado declaraba
// revisado un precio que nadie miró. Con eso el control de los 30 días se vacía
// solo a fuerza de ediciones que no tienen nada que ver con precios — que es
// exactamente la forma de un control que se apaga solo.
//
// Y en el sentido contrario faltaba lo simétrico: `editarOverride` sí escribe el
// precio de venta de un local y NO marcaba nada, así que cambiar un precio desde
// un local dejaba el control avisando sobre un precio recién decidido.
//
// ── QUÉ ES EL PRECIO EFECTIVO, Y POR QUÉ NO ALCANZA MIRAR UN CAMPO ─────────
//
// El precio de una ubicación es su `ProductoLocal.precio_venta` y, SOLO si está
// en null, el de la ficha maestra. Es la misma regla del listado, del editor y
// del POS.
//
// De ahí sale el caso que ninguna comparación de un solo campo contesta bien:
// cambiar el precio de la FICHA de 200 a 250 cambia el precio efectivo de los
// locales que no tienen override, y NO cambia el de los que sí lo tienen. La
// misma escritura revisa unos y no otros, y hay que decidirlo fila por fila.
//
// ── SE COMPARA EN CENTAVOS ENTEROS, Y NO CON UNA TOLERANCIA ────────────────
//
// Los precios son `Decimal(12,2)` y llegan como `Decimal` de Prisma, como string
// o como number según el camino. Comparar con `===` da falso negativo entre `200`
// y `"200.00"`, así que hay que normalizar.
//
// La primera versión de esto usaba `Math.abs(a - b) >= 0.01` y **su propio
// candado la puso en rojo**: `200.01 - 200` da `0.009999999999990905` en punto
// flotante, o sea menos que 0,01, así que un cambio de un centavo se informaba
// como "no cambió". El error es del mismo tamaño que la unidad que se quiere
// distinguir, que es la peor combinación posible.
//
// Redondear a centavos enteros y comparar enteros no tiene ese problema: es
// exacto para todo lo que `Decimal(12,2)` puede guardar, que es lo único que hay
// que distinguir. Un valor por debajo de medio centavo cae en el mismo centavo,
// que es lo correcto — la base no lo puede representar de otra forma.

/** El paso real de la escala: `Decimal(12,2)` no guarda nada más fino. */
export const TOLERANCIA_PRECIO = 0.01;

/** Un precio a centavos enteros. `null` se propaga. */
const enCentavos = (n) => (n === null ? null : Math.round(n * 100));

/**
 * Un precio a número, o `null` si no hay dato.
 *
 * `null`, `undefined` y `""` son "no hay override"; cualquier otra cosa que no
 * sea un número finito también, porque un `NaN` comparándose contra todo daría
 * "cambió" siempre y marcaría revisiones que no ocurrieron.
 */
export function aNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * El precio de venta EFECTIVO: el override de la ubicación y, si no hay, el de
 * la ficha.
 */
export function precioEfectivo(override, base) {
  const o = aNumero(override);
  return o !== null ? o : aNumero(base);
}

/**
 * ¿Esta escritura cambia el precio efectivo de esta ubicación?
 *
 * @param {*} overrideAnterior  `ProductoLocal.precio_venta` de antes (o null)
 * @param {*} baseAnterior      `ProductoBase.precio_venta` de antes
 * @param {*} nuevo             el precio que esta escritura deja como efectivo
 *
 * `nuevo` en null o sin dato es "esta escritura no toca el precio" → NO cambia.
 * Es el caso de un guardado de ficha que no manda `precio_venta`, y contestar que
 * sí marcaría revisado justo el guardado que no miró ningún precio.
 *
 * Si ANTES no había precio —producto recién habilitado en la ubicación— y ahora
 * hay uno, eso SÍ es un cambio: alguien decidió ese número.
 */
export function cambioElPrecioEfectivo({ overrideAnterior, baseAnterior, nuevo }) {
  const n = aNumero(nuevo);
  if (n === null) return false;
  const anterior = precioEfectivo(overrideAnterior, baseAnterior);
  if (anterior === null) return true;
  return enCentavos(anterior) !== enCentavos(n);
}

/**
 * De un conjunto de filas de `ProductoLocal`, cuáles quedan revisadas.
 *
 * Devuelve los `id` de las filas cuyo precio efectivo cambia. La usan la ruta de
 * editar y la de actualización masiva: las dos escriben el MISMO precio en varias
 * ubicaciones a la vez y tienen que marcar solo donde ese precio es nuevo.
 *
 * @param {Array} filas          `[{ id, precio_venta }]` — como estaban ANTES
 * @param {*} baseAnterior       `ProductoBase.precio_venta` de antes
 * @param {*} nuevo              el precio que se está escribiendo
 */
export function localesQueQuedanRevisados(filas = [], { baseAnterior, nuevo } = {}) {
  return filas
    .filter((f) =>
      cambioElPrecioEfectivo({
        overrideAnterior: f?.precio_venta,
        baseAnterior,
        nuevo,
      })
    )
    .map((f) => f.id);
}
