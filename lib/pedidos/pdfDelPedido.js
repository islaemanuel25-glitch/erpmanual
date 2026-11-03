// lib/pedidos/pdfDelPedido.js
//
// LO QUE LLEVA EL PDF DE UN PEDIDO DEL LOCAL AL DEPÓSITO (2026-11-02).
//
// Puro: lo arma la ruta (`app/api/pedidos/pdf/[id]/route.js`) y lo leen los
// candados sin abrir un PDF. El dibujo está en `lib/pdf/pedidoAlDepositoPdf.js`.
//
// ── NINGÚN TEXTO DE CANTIDAD SE ESCRIBE ACÁ ───────────────────────────────
//
// Lo pedido se dice con `rotuloDeLoPedido`, el mismo texto que la pantalla de
// preparar del depósito y la recepción de transferencias ("2 PACK x10",
// "1,500 KG", "2 u"). Lo preparado, con la misma función sobre lo preparado, y
// "No hay" es `TEXTO_NO_HAY`. Qué está decidido y cuánto viaja es
// `revisionDeLinea.js`.
//
// ── SIN PRECIOS NI COSTOS ─────────────────────────────────────────────────
//
// La línea del PDF se arma con una lista CERRADA de campos (`lineaDelPdf`): un
// costo que la consulta trajera no tiene por dónde llegar al papel.

import { estaRevisada, cantidadQueViaja } from "./revisionDeLinea.js";
import { rotuloDeLoPedido, rotuloDeLoQueVa, esAgregada, categoriaDe, tieneReemplazo, TEXTO_NO_HAY } from "./preparacionDelPedido.js";
import { textoPidioProducto } from "./cambiarPorOtro.js";
import { esProductoFiambre, elDepositoCuentaPorKilo } from "@/lib/conversiones/stock";
import { reemplazoDeLinea } from "./reemplazoDeLinea.js";

/** Lo que va en una celda vacía: lo pedido de un agregado, lo preparado de una pendiente. */
export const SIN_DATO = "—";

/**
 * Una línea de `PosTransferenciaDetalle` (con `producto.base.categoria`) en la
 * forma que lee `rotuloDeLoPedido`: los mismos nombres que manda
 * `/api/pos-transferencias/detalle`, de donde se sacaron, y solo los que el PDF
 * usa.
 */
export function lineaDelPdf(d) {
  const pl = d?.producto;
  const base = pl?.base;
  return {
    detalleId: d?.id,
    productoNombre: pl?.nombre || base?.nombre || "",
    codigoBarra: base?.codigo_barra || "",
    categoriaNombre: base?.categoria?.nombre?.trim() || null,
    sugerido: Number(d?.sugerido || 0),
    preparado: Number(d?.preparado || 0),
    unidadSugerida: d?.unidadSugerida || "BULTO",
    unidadPreparada: d?.unidadPreparada || d?.unidadSugerida || "BULTO",
    revisadoEn: d?.revisadoEn ?? null,
    unidadMedida: base?.unidad_medida || "unidad",
    factorPack: Number(base?.factor_pack || 1),
    esFiambre: esProductoFiambre(base),
    modoVentaDeposito: base?.modoVentaDeposito || "PESO",
    pesoReferenciaKg: esProductoFiambre(base) ? Number(base?.pesoReferenciaKg || 0) : null,
    seCargaEnKilos: elDepositoCuentaPorKilo(base),
    // El producto que va en lugar del pedido (2026-11-03), si la línea se leyó
    // con `INCLUDE_REEMPLAZO`; si no, null. Los dos módulos se llaman entre sí
    // solo al ejecutarse, nunca al cargarse.
    reemplazo: d?.reemplazo ? reemplazoDeLinea(d) : null,
  };
}

/**
 * Lo preparado de una línea, como se dice lo pedido: "2 PACK x10", "1,853 KG"
 * (lo que se pesa son kilos), "No hay" (decidida en 0), o `SIN_DATO` si el
 * depósito todavía no la decidió.
 */
export function textoDeLoPreparado(l) {
  if (!estaRevisada(l)) return SIN_DATO;
  if (cantidadQueViaja(l) === 0) return TEXTO_NO_HAY;
  return rotuloDeLoQueVa(l);
}

/** Los renglones agrupados por categoría, y alfabéticos adentro de cada una. */
export function gruposDelPdf(lineas) {
  const porCategoria = new Map();
  for (const l of lineas || []) {
    const c = categoriaDe(l);
    if (!porCategoria.has(c)) porCategoria.set(c, []);
    // Cambiado por otro producto (2026-11-03): el renglón es el que VA —su
    // código y su nombre— con "Pidió: <original>" debajo. Lo pedido y lo
    // preparado se dicen como siempre (`textoDeLoPreparado` ya dice lo del que va).
    const va = tieneReemplazo(l) && estaRevisada(l) ? l.reemplazo : null;
    porCategoria.get(c).push({
      codigo: (va ?? l).codigoBarra || SIN_DATO,
      nombre: (va ?? l).productoNombre,
      ...(va ? { pidio: textoPidioProducto(l.productoNombre) } : {}),
      pedido: esAgregada(l) ? SIN_DATO : rotuloDeLoPedido(l),
      preparado: textoDeLoPreparado(l),
    });
  }
  const orden = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });
  return [...porCategoria.entries()]
    .sort(([a], [b]) => orden(a, b))
    .map(([categoria, filas]) => ({ categoria, filas: filas.sort((a, b) => orden(a.nombre, b.nombre)) }));
}

/**
 * Todo lo que lleva el PDF.
 *
 * @param {object} p
 * @param {number} p.numero    el id del pedido
 * @param {string} p.local     quien pide
 * @param {string} p.deposito  a quien se le pide
 * @param {Date|string|null} p.enviadoAt
 * @param {string} p.estado    en palabras del local (`estadoParaElLocal`)
 * @param {object[]} p.lineas  las de `lineaDelPdf`
 */
export function datosDelPdfDelPedido({ numero, local, deposito, enviadoAt, estado, lineas }) {
  const ls = lineas || [];
  return {
    numero,
    local: local || "",
    deposito: deposito || "",
    enviadoAt: enviadoAt ?? null,
    estado: estado || "",
    // La columna de lo preparado va si el depósito decidió al menos una línea.
    conPreparado: ls.some(estaRevisada),
    grupos: gruposDelPdf(ls),
    total: ls.length,
  };
}

/** "pedido-123-local-centro.pdf": sin tildes ni espacios, que viaja bien en un encabezado. */
export function nombreDelArchivo(numero, local) {
  const limpio = String(local || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `pedido-${numero}${limpio ? `-${limpio}` : ""}.pdf`;
}
