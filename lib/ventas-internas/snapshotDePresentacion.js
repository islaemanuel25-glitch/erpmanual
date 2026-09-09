// lib/ventas-internas/snapshotDePresentacion.js
//
// CÓMO SE CONTÓ LO QUE SALIÓ, CONGELADO ANTES DE QUE SE PIERDA.
//
// ── DÓNDE SE PERDÍA ──────────────────────────────────────────────────────
//
// `mapearVentaATransferencia` recibe DOS cosas: `consumoFisicoConsolidado` —ya
// convertido a unidades de stock— y `lineasComerciales`, que hasta acá solo se
// usaba para contar qué había quedado afuera.
//
// Y en las líneas comerciales está justamente lo que faltaba: `modoVentaLinea`
// distingue el pack de la unidad suelta —MODO_PACK cuenta packs, UNIDAD_REMANENTE
// cuenta unidades— y `baseStock` trae `unidad_medida`, `factorPack`,
// `modoVentaDeposito` y `pesoReferenciaKg`.
//
// O sea que la información no se perdía antes del mapper: se perdía DENTRO, al
// quedarse solo con el total físico. Este módulo la recupera del mismo insumo
// que el mapper ya recibe, sin consultar nada nuevo y sin tocar la cantidad
// física, que es la que mantiene paridad con el descuento de stock.
//
// ── EL CASO QUE OBLIGA A DOS NÚMEROS ─────────────────────────────────────
//
// El POS permite vender el MISMO producto en dos modos en la misma venta: cuatro
// packs y cinco unidades sueltas. Consolidado da 29 unidades físicas, y de ahí no
// se puede volver: 29/6 no es entero. Por eso el snapshot guarda los bultos
// completos y las sueltas por separado, que es exactamente el mismo remedio que
// `recibidoUnidadesSueltas` aplica del lado de la recepción.
//
// ── CUÁNDO NO SE REGISTRA NADA ───────────────────────────────────────────
//
// Si un ProductoLocal aparece con presentaciones INCOMPATIBLES entre sí —dos
// líneas del mismo producto que el catálogo describe de formas distintas, que
// hoy no debería poder pasar— no se elige una al azar ni se promedia: se deja el
// snapshot vacío. Una línea sin snapshot dice "no se registró", que es la verdad.
// Inventar una presentación sería peor que no tenerla.

import {
  PRESENTACION,
  agrupa,
  presentacionDeProducto,
} from "@/lib/productos/presentacionDeProducto";

/** El POS nombra así al modo de la línea. Ver `lib/pos-ventas/lineaModoDeposito.js`. */
const MODO_UNIDAD = "UNIDAD_REMANENTE";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * El snapshot de UN ProductoLocal, a partir de sus líneas comerciales.
 *
 * @param {object[]} lineas Las líneas comerciales de ESE producto. Cada una con
 *   `cantidad` (en su presentación), `modoVentaLinea` y `baseStock`.
 * @param {boolean} esDeposito El origen es un depósito. Fuera de un depósito no
 *   hay modos de venta por bulto ni piezas: la presentación es la del producto.
 * @returns {null|{presentacionEnvio, cantidadPresentada, sueltasEnviadas,
 *   factorPresentacion, pesoPiezaKg}}
 */
export function snapshotDeLineas(lineas = [], { esDeposito = true } = {}) {
  const utiles = (lineas || []).filter((l) => l && l.baseStock);
  if (utiles.length === 0) return null;

  // Qué ES el producto, según el catálogo del momento. Se resuelve una vez con
  // la primera línea: todas son del mismo ProductoLocal.
  const base = utiles[0].baseStock;
  const delProducto = presentacionDeProducto({
    unidadMedida: base.unidad_medida,
    factorPack: base.factorPack,
    modoVentaDeposito: esDeposito ? base.modoVentaDeposito : null,
    pesoReferenciaKg: base.pesoReferenciaKg,
  });

  // Todas las líneas tienen que describir el mismo producto. Si no, no se
  // inventa: ver el encabezado.
  for (const l of utiles.slice(1)) {
    const otra = presentacionDeProducto({
      unidadMedida: l.baseStock.unidad_medida,
      factorPack: l.baseStock.factorPack,
      modoVentaDeposito: esDeposito ? l.baseStock.modoVentaDeposito : null,
      pesoReferenciaKg: l.baseStock.pesoReferenciaKg,
    });
    if (
      otra.presentacion !== delProducto.presentacion ||
      otra.factor !== delProducto.factor
    ) {
      return null;
    }
  }

  // ── NO AGRUPADOS: la cantidad comercial ES la presentada ────────────────
  //
  // KG, PIEZA y UNIDAD no tienen bultos que completar, así que se suman las
  // líneas y listo. Para PIEZA se congela además el peso, que es lo que
  // `confirmar-recepcion` usa para acreditar kilos en el destino.
  if (!agrupa(delProducto.presentacion)) {
    const total = utiles.reduce((acc, l) => acc + num(l.cantidad), 0);
    if (total <= 0) return null;
    return {
      presentacionEnvio: delProducto.presentacion,
      cantidadPresentada: total,
      sueltasEnviadas: 0,
      factorPresentacion: null,
      pesoPiezaKg:
        delProducto.presentacion === PRESENTACION.PIEZA ? delProducto.pesoPiezaKg : null,
    };
  }

  // ── AGRUPADOS: bultos completos por un lado, sueltas por el otro ────────
  let bultos = 0;
  let sueltas = 0;
  for (const l of utiles) {
    if (l.modoVentaLinea === MODO_UNIDAD) sueltas += num(l.cantidad);
    else bultos += num(l.cantidad);
  }
  if (bultos <= 0 && sueltas <= 0) return null;

  return {
    presentacionEnvio: delProducto.presentacion,
    cantidadPresentada: bultos,
    sueltasEnviadas: sueltas,
    factorPresentacion: delProducto.factor,
    pesoPiezaKg: null,
  };
}

/**
 * Agrupa las líneas comerciales por ProductoLocal y devuelve un snapshot por
 * cada uno. Las líneas sin consumo físico —servicios, combos— no aportan.
 *
 * @returns {Map<number, object>} productoLocalId → snapshot
 */
export function snapshotsPorProductoLocal(lineasComerciales = [], opciones = {}) {
  const porProducto = new Map();

  for (const l of lineasComerciales || []) {
    if (!l || typeof l !== "object") continue;
    // Un combo no viaja: viajan sus componentes, que entran por otro camino y no
    // tienen línea comercial propia. Y un servicio no es mercadería.
    if (l.tipo === "SERVICIO" || l.esServicio === true || l.tipo === "COMBO") continue;
    if (!l.consumoFisico || l.consumoFisico.cantidadStock == null) continue;

    const id = Number(l.productoLocalId ?? l.consumoFisico.productoLocalId);
    if (!Number.isInteger(id) || id <= 0) continue;

    if (!porProducto.has(id)) porProducto.set(id, []);
    porProducto.get(id).push(l);
  }

  const salida = new Map();
  for (const [id, lineas] of porProducto) {
    const snap = snapshotDeLineas(lineas, opciones);
    if (snap) salida.set(id, snap);
  }
  return salida;
}
