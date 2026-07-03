// lib/compras-proveedor/calculoPedido.js
// Fuente ÚNICA de verdad de la fórmula económica de Compras a Proveedor.
// Funciones puras, sin persistencia. El enum `unidad` solo soporta BULTO/UNIDAD;
// KG y PIEZA/fiambre se DERIVAN del producto (no se persisten como unidad).
//
// Reglas económicas (dinero):
//   BULTO  : subtotal = cantidad(bultos)   × costo(del bulto)
//   UNIDAD : subtotal = cantidad(unidades) × costo(unitario)
//   KG     : subtotal = cantidad(kilos)    × costo(por kg)
//   FIAMBRE (pieza costeada por kg): subtotal = kg × costo(por kg)
//     kg = kgRecibidos (recepción) o piezas × pesoReferenciaKg/pesoPromedioKg (armado)
//     si no hay peso por pieza → sin subtotal (advertencia), no se inventa.
// El factor_pack NO entra en el dinero; solo en la entrada de stock (recepción).

export function naturalezaLinea(base) {
  if (!base) return "UNIDAD";
  if (base.modoCompraProveedor === "UNIDAD") return "FIAMBRE";
  if (base.unidad_medida === "kg") return "KG";
  if (Number(base.factor_pack) > 1) return "PACK";
  return "UNIDAD";
}

// Solo los productos PACK (factor_pack > 1, no fiambre, no kg) pueden alternar
// BULTO/UNIDAD de forma significativa (afecta cómo entra el stock al recibir).
export function permiteToggleUnidad(base) {
  return naturalezaLinea(base) === "PACK";
}

export function pesoPorPieza(base) {
  const ref = Number(base?.pesoReferenciaKg);
  if (Number.isFinite(ref) && ref > 0) return ref;
  const prom = Number(base?.pesoPromedioKg);
  if (Number.isFinite(prom) && prom > 0) return prom;
  return null;
}

// Texto visual de la unidad de la línea (no editable salvo PACK).
export function unidadDisplay(base, unidad) {
  switch (naturalezaLinea(base)) {
    case "FIAMBRE":
      return "PIEZA / por kg";
    case "KG":
      return "KG";
    case "PACK":
      return unidad === "UNIDAD" ? "UNIDAD" : "BULTO";
    default:
      return "UNIDAD";
  }
}

// Subtotal económico de una línea.
// Args: { base, cantidad, costo, kg }  (kg opcional: kg reales de recepción)
// Devuelve: { subtotal: number|null, advertencia: string|null, kg: number|null }
export function subtotalLinea({ base, cantidad, costo, kg } = {}) {
  const cant = Number(cantidad) || 0;
  const c = Number(costo) || 0;

  if (naturalezaLinea(base) === "FIAMBRE") {
    let kgTotal =
      kg !== undefined && kg !== null && kg !== "" ? Number(kg) : null;
    if (kgTotal == null || !Number.isFinite(kgTotal)) {
      const peso = pesoPorPieza(base);
      if (peso == null) {
        return { subtotal: null, advertencia: "Sin kg por pieza definido", kg: null };
      }
      kgTotal = cant * peso;
    }
    return { subtotal: kgTotal * c, advertencia: null, kg: kgTotal };
  }

  // BULTO / UNIDAD / KG → cantidad × costo (sin factor_pack)
  return { subtotal: cant * c, advertencia: null, kg: null };
}

// Conversión de la UNIDAD DE PEDIDO (Pack ↔ Unidad) conservando el subtotal
// económico EXACTO. Regla clave: NO se redondea el costo — la fuente de verdad es
// el costo del "unit actual" a full precisión, y el valor visible se redondea aparte.
// Así Pack → Unidad → Pack no acumula drift de centavos.
//
// Args: { unidad:"BULTO"|"UNIDAD", cantidad, costo, factor, redondear? }
// Devuelve:
//   Pack → Unidad          → { unidad:"UNIDAD", cantidad: cant*factor, costo: costo/factor }
//   Unidad → Pack (exacto) → { unidad:"BULTO",  cantidad: cant/factor, costo: costo*factor }
//   Unidad → Pack (no exacto, sin `redondear`) → { needsConfirm:true, packs, units, factor }
//   Unidad → Pack (no exacto, `redondear`)     → { unidad:"BULTO", cantidad: ceil(cant/factor), costo: costo*factor }
export function convertirUnidadPedido({ unidad, cantidad, costo, factor, redondear = false } = {}) {
  const f = Math.max(1, Math.floor(Number(factor) || 1));
  const cant = Math.max(0, Math.floor(Number(cantidad) || 0));
  const c = Number(costo) || 0;

  if (unidad === "BULTO") {
    // Pack → Unidad: multiplica la cantidad, divide el costo (exacto, sin redondear).
    return { unidad: "UNIDAD", cantidad: cant * f, costo: f > 1 ? c / f : c };
  }

  // Unidad → Pack
  if (f <= 1) return { unidad: "BULTO", cantidad: cant, costo: c };
  if (cant % f === 0) return { unidad: "BULTO", cantidad: cant / f, costo: c * f };
  if (redondear) {
    const packs = Math.ceil(cant / f);
    return { unidad: "BULTO", cantidad: packs, costo: c * f };
  }
  return { needsConfirm: true, packs: Math.ceil(cant / f), units: cant, factor: f };
}

// Total del pedido = suma de subtotales válidos (ignora líneas con advertencia).
// lineas: Array<{ base, cantidad, costo, kg }>
export function totalPedido(lineas = []) {
  let total = 0;
  for (const l of lineas) {
    const r = subtotalLinea(l);
    if (r.subtotal != null) total += r.subtotal;
  }
  return total;
}
