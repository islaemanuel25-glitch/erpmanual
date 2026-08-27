// Conversión segura de la cantidad escrita por el proveedor a la unidad que
// entiende PedidoProveedorDetalle. Esta función no adivina: cuando el papel no
// alcanza para decidir, propone un valor visible pero exige confirmación humana.

import { naturalezaLinea } from "../calculoPedido.js";
import { baseDeProducto } from "./merge.js";

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

/**
 * @param cantidadEn  En qué escala está expresada la cantidad del papel, cuando
 *   el papel mismo no lo dice. Sale de la receta del proveedor.
 *
 * ── POR QUÉ ESTE PARÁMETRO EXISTE ──────────────────────────────────────────
 *
 * Sin él, un renglón sin columna de unidad terminaba con la cantidad TAL COMO SE
 * LEYÓ y la unidad declarada como BULTO, que es el default del producto. El
 * precio, en cambio, sí se llevaba a escala bulto. Los dos lados quedaban en
 * escalas distintas y el subtotal se multiplicaba por el factor:
 *
 *   50 leídas + unidad asumida BULTO + precio $33.600 por bulto = $1.680.000
 *   cuando el papel dice $168.000.
 *
 * Medido con el renglón real "PHILIPS MORRIS 10, 50, $3.360, total $168.000"
 * contra un producto de bulto x10.
 *
 * El default que se elige NO es arbitrario: es la escala en la que está
 * declarado el PRECIO. Es la única escala que el documento sí declara, y
 * asumirla es lo único que conserva el subtotal. La línea sigue pidiendo
 * revisión: asumir bien no es lo mismo que saber.
 */
export function proponerCantidadPedido({ cantidad, unidadFuente, producto, cantidadEn = null } = {}) {
  const numero = Number(cantidad);
  const unidad = normalizarUnidadFuente(unidadFuente);
  const factor = Math.max(1, Math.floor(Number(producto?.factor_pack) || 1));
  // La clasificación sale de `naturalezaLinea`, que es la que decide en toda la
  // pantalla de Compras. Acá había dos condiciones escritas al lado —`modoCompra
  // === "UNIDAD"` y `unidad_medida === "kg"`— que decían lo mismo por su cuenta:
  // el día que la regla cambie, esto se habría quedado con la versión vieja.
  const naturaleza = naturalezaLinea(baseDeProducto(producto));
  const esFiambre = naturaleza === "FIAMBRE";
  const esKg = naturaleza === "KG";
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
    // La escala declarada para el precio manda sobre el default del producto:
    // es la única que el documento afirma, y es la que conserva el subtotal.
    // El fiambre no entra acá —no tiene bultos— y por eso conserva su default.
    const asumida = !esFiambre && (cantidadEn === "UNIDAD" || cantidadEn === "BULTO")
      ? cantidadEn
      : unidadDefault;
    return revision({
      cantidad: numero,
      unidad: asumida,
      motivo:
        asumida === "UNIDAD"
          ? "El archivo no indica la unidad. Se asume que la cantidad está en unidades, como el precio. Confirmalo."
          : "El archivo no indica si la cantidad está en unidades o bultos.",
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
    // ── EL FIAMBRE SE PIDE POR PIEZA, Y LOS KILOS NO DICEN CUÁNTAS SON ──────
    //
    // Va ANTES del caso de kg puro porque un fiambre tiene `unidad_medida: "kg"`
    // y caía ahí: 10 KG volvían como "10 BULTO, requiereRevision: false", o sea
    // diez bultos de un producto que no se compra por bulto, confirmado solo.
    //
    // El peso por pieza existe —`pesoReferenciaKg`— pero dividir por él sería
    // inventar la equivalencia: 10 kg de un fiambre de 2,5 kg pueden ser cuatro
    // piezas de 2,5 o tres de 3 y una de 1, y el papel no lo dice. Se conserva el
    // número leído, se deja en UNIDAD y lo decide una persona.
    if (esFiambre) {
      return revision({
        cantidad: numero,
        unidad: "UNIDAD",
        motivo:
          "El archivo expresa kilos y este producto se pide por pieza. Poné cuántas piezas son.",
      });
    }
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
