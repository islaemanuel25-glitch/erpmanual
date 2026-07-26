// lib/combos/disponibilidad.js
//
// Disponibilidad de un combo = componente LIMITANTE:
//   disponibilidad = min( floor(stockDisponible / cantidadNecesaria) )
//
// Reglas (E2):
//   · El stock se resuelve directo del StockLocal del componenteProductoLocalId
//     (unidades; piezas si es fiambre fijo en depósito). Sin conversión extra.
//   · Componente inactivo (ProductoLocal.activo=false o ProductoBase.activo=false)
//     → disponibilidad del combo = 0.
//   · Componente sin fila StockLocal → 0.
//   · cantidadNecesaria <= 0 o inválida → INCONSISTENCIA: no se puede vender (0).
//   · Sin componentes → 0 e inconsistente.
//   · NO se aplica el descuento de stock (eso es etapa POS).
//   · allowNegativeStock: se DEVUELVE la disponibilidad física real + el flag.
//     Nunca se reporta disponibilidad infinita; el POS decidirá si permite vender
//     por debajo de 0 con esa información.
//
// Precisión: stock y cantidad son Decimal(12,3). Se operan como Number (magnitudes
// chicas, sin pérdida relevante) y se toma Math.floor para unidades enteras de combo.

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// `componentes`: [{
//   componenteProductoLocalId, cantidad,
//   activo,            // pl.activo && base.activo
//   tieneStockLocal,   // boolean
//   stock,             // number|null (unidades/piezas)
// }]
export function disponibilidadCombo({ componentes, allowNegativeStock = false } = {}) {
  const detalle = [];
  const motivos = [];
  let inconsistente = false;
  let disponibilidad = Infinity;

  for (const c of componentes || []) {
    const cantidadNecesaria = num(c.cantidad);
    const activo = c.activo !== false;
    const tieneStock = c.tieneStockLocal !== false && num(c.stock) !== null;
    const stock = num(c.stock) ?? 0;

    let dispComp;
    let estado = "OK";

    if (cantidadNecesaria === null || cantidadNecesaria <= 0) {
      inconsistente = true;
      dispComp = 0;
      estado = "CANTIDAD_INVALIDA";
    } else if (!activo) {
      dispComp = 0;
      estado = "INACTIVO";
    } else if (!tieneStock) {
      dispComp = 0;
      estado = "SIN_STOCKLOCAL";
    } else {
      dispComp = Math.floor(stock / cantidadNecesaria);
      if (dispComp < 0) dispComp = 0; // stock negativo → 0 físico (no vende salvo negativo)
    }

    if (estado !== "OK") {
      motivos.push({ componenteProductoLocalId: c.componenteProductoLocalId, motivo: estado });
    }
    detalle.push({
      componenteProductoLocalId: c.componenteProductoLocalId,
      cantidad: cantidadNecesaria,
      stock,
      disponibilidadComponente: dispComp,
      estado,
    });
    disponibilidad = Math.min(disponibilidad, dispComp);
  }

  if (!(componentes && componentes.length)) {
    disponibilidad = 0;
    inconsistente = true;
  }
  if (!Number.isFinite(disponibilidad)) disponibilidad = 0;
  disponibilidad = Math.max(0, disponibilidad);

  // Bloqueo ESTRUCTURAL: un combo con un componente inactivo, sin fila StockLocal,
  // con cantidad inválida, o con composición vacía NO se puede vender NUNCA —ni
  // siquiera con allowNegativeStock—, porque no hay forma de consumir ese stock.
  // (La mera insuficiencia de stock, en cambio, SÍ respeta allowNegativeStock.)
  const ESTADOS_BLOQUEANTES = new Set(["INACTIVO", "SIN_STOCKLOCAL", "CANTIDAD_INVALIDA"]);
  const bloqueadoEstructural =
    !(componentes && componentes.length) || motivos.some((m) => ESTADOS_BLOQUEANTES.has(m.motivo));

  return {
    disponibilidad,
    inconsistente,
    bloqueadoEstructural,
    allowNegativeStock: !!allowNegativeStock,
    motivos,
    componentes: detalle,
  };
}
