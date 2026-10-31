// LA LISTA DE PRECIOS DEL CATÁLOGO: qué dice cada renglón y en qué orden va.
//
// Es la parte pura del PDF que se baja desde Productos. No consulta nada y no
// dibuja nada: recibe las filas que ya armó `mergeBaseLocalToUi` y devuelve los
// grupos con sus textos. La consulta está en `listaDePreciosServer.js` y el
// dibujo en `lib/pdf/listaDePreciosPdf.js`.
//
// ── LOS NÚMEROS SON LOS DE LA TARJETA, CON LAS MISMAS FUNCIONES ────────────
//
// Emanuel lo pidió así: los precios salen de la ficha de la ubicación y no se
// recalculan a mano. Cada renglón pasa por la MISMA cadena que la tarjeta del
// catálogo —`escalaDeVentaDe`, `precioQueCobraElPos` y `carasDeTarjeta`— y toma
// su FRENTE: el importe de venta y el costo en la escala en que se vende. Si la
// lista calculara por su lado, el día que la tarjeta cambie la lista diría otro
// número sobre el mismo producto.

import { escalaDeVentaDe } from "../precios/escalaDeVenta.js";
import { precioQueCobraElPos } from "../precios/ubicacionVendeAlCosto.js";
import { carasDeTarjeta, presentacionEnPalabras } from "./carasDeTarjeta.js";

/** El rótulo de un filtro que no se eligió, en el encabezado del PDF. */
export const TODOS = "Todos";
export const TODAS = "Todas";

/** El grupo de los productos sin categoría. Va último: no es una categoría más. */
export const SIN_CATEGORIA = "Sin categoría";

/**
 * Un renglón de la lista.
 *
 * @param {object} p  la fila de `mergeBaseLocalToUi`, con `categoriaNombre`
 * @param {object} ubicacion `{ esDeposito, vendeConListaAlCosto, listaAlCostoRedondea100 }`
 */
export function filaDeLaLista(p, { esDeposito, vendeConListaAlCosto, listaAlCostoRedondea100 }) {
  const escala = escalaDeVentaDe(p, esDeposito);
  const { precio, redondeo100 } = precioQueCobraElPos(p, { vendeConListaAlCosto, listaAlCostoRedondea100 });
  const { frente } = carasDeTarjeta({
    escala,
    precio,
    costo: p.precioCosto,
    redondeo100,
    factor: p.factorPack,
    unidad: p.unidadMedida,
    pesoReferenciaKg: p.pesoReferenciaKg,
    esCombo: p.esCombo,
  });
  return {
    // El mismo código que muestra la tarjeta: el de barras, y si no hay, el SKU.
    codigo: p.codigoBarra ?? p.sku ?? null,
    nombre: p.nombre ?? "",
    presentacion: presentacionEnPalabras({
      escala,
      factor: p.factorPack,
      unidad: p.unidadMedida,
      pesoReferenciaKg: p.pesoReferenciaKg,
    }),
    costo: frente.costo,
    venta: frente.importe,
    categoria: p.categoriaNombre || null,
  };
}

const porNombre = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });

/**
 * Los renglones agrupados por categoría: los grupos por nombre, y adentro de
 * cada uno los productos por nombre. "Sin categoría" va al final.
 *
 * @returns {Array<{ categoria: string, filas: object[] }>}
 */
export function gruposPorCategoria(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const clave = f.categoria || SIN_CATEGORIA;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(f);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === SIN_CATEGORIA) - (b === SIN_CATEGORIA) || porNombre(a, b))
    .map(([categoria, delGrupo]) => ({
      categoria,
      filas: [...delGrupo].sort((x, y) => porNombre(x.nombre, y.nombre)),
    }));
}

/** La línea de filtros del encabezado: "Proveedor: X  ·  Categoría: Y". */
export function lineaDeFiltros({ proveedor, categoria }) {
  return `Proveedor: ${proveedor || TODOS}  ·  Categoría: ${categoria || TODAS}`;
}
