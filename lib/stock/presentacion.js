// lib/stock/presentacion.js
//
// Helpers de PRESENTACIÓN de stock (cómo mostrar unidades/bultos/piezas en la
// tabla de Stock Locales). Extraídos de components/stock_locales/TablaStock.jsx
// SIN cambiar comportamiento. Son funciones puras (no tocan reglas de inventario;
// StockLocal.cantidad sigue en UNIDADES, la presentación solo formatea).

// Etiqueta de cantidad formateada. opts: { esFiambreFijo, esDeposito }.
export function formatCantidad(valor, unidadMedida, opts = {}) {
  const n = Number(valor || 0);
  if (opts.esFiambreFijo && opts.esDeposito) return `${Math.round(n)} pzs`;
  if (unidadMedida === "kg") return `${n.toFixed(3)} kg`;
  return `${Math.round(n)} uds`;
}

// ¿En el depósito este producto se muestra en bultos+sueltas (pack/cajón con factor)?
export function esPackDeposito(p, esDeposito) {
  if (!esDeposito) return false;
  const u = p.unidadMedida;
  const f = Number(p.factorPack || 1);
  return f > 1 && (u === "pack" || u === "cajon");
}

// Etiqueta de unidad en vista DEPÓSITO.
export function getUnidadDeposito(p) {
  const u = p.unidadMedida;
  const f = Number(p.factorPack || 1);
  if (!u || u === "unidad") return f > 1 ? `Pack x${f}` : "Unidad";
  if (u === "cajon") return f > 1 ? `Cajón x${f}` : "Cajón";
  if (u === "pack") return f > 1 ? `Pack x${f}` : "Pack";
  if (u === "kg") {
    if (p.modoCompraProveedor === "UNIDAD" && p.pesoReferenciaKg > 0 && (p.modoVentaDeposito === "PIEZA" || p.pesoEsFijo)) return "Pieza";
    return "Kg";
  }
  if (u === "lt") return "Litro";
  return u.charAt(0).toUpperCase() + u.slice(1);
}

// Etiqueta de unidad en vista LOCAL.
export function getUnidadLocal(p) {
  const u = p.unidadMedida;
  if (u === "kg") return "Kg";
  return "Unidad";
}

// Presentación de depósito (para mostrar como subtítulo en vista local).
export function getPresentacionDeposito(p) {
  const u = p.unidadMedida;
  const f = Number(p.factorPack || 1);
  if (f <= 1) return null;
  if (u === "pack") return `Pack x${f}`;
  if (u === "cajon") return `Cajón x${f}`;
  if (u === "unidad") return `Pack x${f}`;
  return null;
}

// Fiambre fijo a partir de un item del listado. Réplica EXACTA del condicional
// inline que tenía TablaStock (unificado acá como fuente única, SIN cambiar
// comportamiento): incluye el borde modoVentaDeposito="PESO" + pesoEsFijo=true,
// que sigue dando true igual que antes. (No usa esFiambreFijo() de la lib porque
// esa función prioriza modoVentaDeposito y descartaría ese borde.)
export function esFiambreFijoItem(p) {
  return (
    p.unidadMedida === "kg" &&
    p.modoCompraProveedor === "UNIDAD" &&
    p.pesoReferenciaKg > 0 &&
    (p.modoVentaDeposito === "PIEZA" || p.pesoEsFijo === true)
  );
}
