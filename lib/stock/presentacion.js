// lib/stock/presentacion.js
//
// Helpers de PRESENTACIÓN de stock (cómo mostrar unidades/bultos/piezas en la
// tabla de Stock Locales). Extraídos de components/stock_locales/TablaStock.jsx
// SIN cambiar comportamiento. Son funciones puras (no tocan reglas de inventario;
// StockLocal.cantidad sigue en UNIDADES, la presentación solo formatea).

import { esFiambreFijo } from "@/lib/conversiones/stock";

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
    // Era otra copia inline del mismo concepto, con el borde combinado por OR y
    // además con `pesoEsFijo` truthy en vez de `=== true`. Delega en la única.
    if (esFiambreFijoItem(p)) return "Pieza";
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

// Fiambre fijo a partir de un item del listado.
//
// AHORA DELEGA en esFiambreFijo() de lib/conversiones/stock.js, que es la única
// definición. Lo único que hace acá es traducir los nombres: el item del listado
// viene en camelCase (`unidadMedida`) y el predicado espera la forma de
// ProductoBase (`unidad_medida`).
//
// ── QUÉ CAMBIÓ Y A QUIÉN LE CAMBIA ─────────────────────────────────────────
//
// Antes esta función combinaba el borde con OR y la de la lib lo prioriza, así
// que diferían en un caso: modoVentaDeposito="PESO" junto con pesoEsFijo=true.
// Ese producto se MOSTRABA en piezas y se DESCONTABA en kilos — la pantalla
// decía una cosa y el motor hacía otra.
//
// Ahora la pantalla sigue al motor. En erpazul_al eso alcanza a UN producto,
// "Albondigas Caseras x Caja", que pasa a mostrarse en kilos. El dato guardado
// no se toca: lo que se corrige es que la pantalla mentía.
export function esFiambreFijoItem(p) {
  return esFiambreFijo({
    unidad_medida: p.unidadMedida,
    modoCompraProveedor: p.modoCompraProveedor,
    pesoReferenciaKg: p.pesoReferenciaKg,
    modoVentaDeposito: p.modoVentaDeposito,
    pesoEsFijo: p.pesoEsFijo,
  });
}
