// Conversión segura de la cantidad escrita por el proveedor a la unidad que
// entiende PedidoProveedorDetalle. Esta función no adivina: cuando el papel no
// alcanza para decidir, propone un valor visible pero exige confirmación humana.

const UNIDADES = Object.freeze({
  UNIDAD: new Set(["UN", "UND", "UNID", "UNIDAD", "UNIDADES", "U"]),
  BULTO: new Set(["BU", "BTO", "BULTO", "BULTOS", "CAJA", "CAJAS", "CJ", "PACK", "PACKS"]),
  KG: new Set(["KG", "KGS", "KILO", "KILOS"]),
});

export function normalizarUnidadFuente(valor) {
  const unidad = String(valor ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.]/g, "");
  if (!unidad) return null;
  for (const [nombre, valores] of Object.entries(UNIDADES)) {
    if (valores.has(unidad)) return nombre;
  }
  return unidad;
}

export function proponerCantidadPedido({ cantidad, unidadFuente, producto } = {}) {
  const numero = Number(cantidad);
  const unidad = normalizarUnidadFuente(unidadFuente);
  const factor = Math.max(1, Math.floor(Number(producto?.factor_pack) || 1));
  const esFiambre = producto?.modoCompra === "UNIDAD";
  const esKg = String(producto?.unidad_medida || "").toLowerCase() === "kg";
  const unidadDefault = esFiambre ? "UNIDAD" : "BULTO";

  if (!Number.isFinite(numero) || numero <= 0) {
    return revision({ cantidad: 1, unidad: unidadDefault, motivo: "La cantidad no se pudo leer." });
  }
  if (!Number.isInteger(numero)) {
    return revision({
      cantidad: Math.max(1, Math.round(numero)),
      unidad: unidadDefault,
      motivo: "El pedido solo admite cantidades enteras. Revisá el valor leído.",
    });
  }

  if (!unidad) {
    return revision({
      cantidad: numero,
      unidad: unidadDefault,
      motivo: "El archivo no indica si la cantidad está en unidades o bultos.",
    });
  }

  if (unidad === "UNIDAD") {
    if (esFiambre || factor <= 1 || esKg) {
      return { cantidad: numero, unidad: "UNIDAD", requiereRevision: false, motivo: null };
    }
    if (numero % factor === 0) {
      return {
        cantidad: numero / factor,
        unidad: "BULTO",
        requiereRevision: false,
        motivo: null,
        equivalencia: `${numero} un = ${numero / factor} bulto${numero / factor === 1 ? "" : "s"} de ${factor}`,
      };
    }
    return revision({
      cantidad: numero,
      unidad: "UNIDAD",
      motivo: `${numero} unidades no equivalen a bultos enteros de ${factor}.`,
    });
  }

  if (unidad === "BULTO") {
    if (esFiambre) {
      return revision({
        cantidad: numero,
        unidad: "UNIDAD",
        motivo: "El archivo dice bultos, pero este producto se compra por unidad/pieza.",
      });
    }
    return { cantidad: numero, unidad: "BULTO", requiereRevision: false, motivo: null };
  }

  if (unidad === "KG") {
    if (esKg) return { cantidad: numero, unidad: "BULTO", requiereRevision: false, motivo: null };
    return revision({
      cantidad: numero,
      unidad: unidadDefault,
      motivo: "El archivo expresa kilos, pero el producto no está configurado para comprarse por kg.",
    });
  }

  return revision({
    cantidad: numero,
    unidad: unidadDefault,
    motivo: `La unidad “${unidad}” no tiene una equivalencia configurada.`,
  });
}

function revision({ cantidad, unidad, motivo }) {
  return { cantidad, unidad, requiereRevision: true, motivo };
}
