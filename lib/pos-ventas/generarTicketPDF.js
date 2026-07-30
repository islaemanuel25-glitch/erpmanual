// Import NOMBRADO (el que documenta jsPDF): el default de "jspdf" bajo Node ESM es
// el module.exports de CJS, que no es constructor. Con el nombrado el módulo corre
// igual en el bundle del browser y en Node puro (tests).
import { jsPDF } from "jspdf";
// Con extensión, así resuelve también bajo Node, igual que servicios.js con ./pagos.js.
import { lineasPagoTicket, esPagoDividido } from "./pagos.js";
import { snapshotServicioTicket } from "./servicios.js";

// Comprobante de venta en A4, PAGINADO. Fuente ÚNICA para "PDF" y "Compartir"
// (ambos entran por acá; Compartir solo pide output:"blob").
//
// El bug que corrige: antes la Y crecía sin control (y += 7 por ítem) sin ningún
// chequeo de fin de página, y el pie ("Gracias por su compra") estaba clavado en
// y=280. Con muchos productos las filas se pisaban entre sí, invadían el pie y lo
// que pasaba de 297mm se dibujaba fuera de la hoja.
//
// opts.copia  = true → se aclara "Copia del comprobante" (discreto) y se usa la
//                      fecha ORIGINAL de la venta, conservando su número.
// opts.output = "blob" → devuelve { blob, nombreArchivo } en vez de descargar.

// ── Geometría de la hoja (mm) ────────────────────────────────────────────────
const PAGINA_ALTO = 297;
const X_IZQ = 20;
const X_DER = 190;
const ANCHO = X_DER - X_IZQ;
const Y_TOPE = 18;            // arranque de contenido en páginas 2+
const Y_LIMITE = 268;         // ninguna fila puede pasar de acá
const Y_PIE = 288;            // línea de pie por página
const INTERLINEA = 5.2;       // alto de una línea de texto de ítem

// Columnas de la tabla
const X_CANT = 132;
const X_PRECIO = 160;
const X_SUBTOTAL = X_DER;
const ANCHO_NOMBRE = 105;     // 20 → 125: deja aire antes de "Cant."

const GRIS = 120;

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Cantidades: enteras sin decimales, fraccionarias con hasta 3 útiles.
function formatCantidad(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  if (Number.isInteger(num)) return num.toLocaleString("es-AR");
  return num.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

// Etiqueta del modo de venta de depósito, si el dato viene en la línea.
// No se infiere nada: si no hay `deposito.modo`, no se muestra.
function etiquetaModo(dep) {
  if (!dep || !dep.modo) return null;
  if (dep.modo === "PACK") {
    const f = Number(dep.factorPack) || 0;
    return f > 1 ? `Pack/Bulto ×${f}` : "Pack/Bulto";
  }
  if (dep.modo === "UNIDAD") return "Unidad suelta";
  if (dep.modo === "PIEZA") return "Piezas";
  return null;
}

export default function generarTicketPDF(venta, opts = {}) {
  const copia = opts?.copia === true;
  const output = opts?.output === "blob" ? "blob" : "save";
  const doc = new jsPDF({ format: "a4", unit: "mm" });

  const lineasPago = lineasPagoTicket(venta);
  const dividido = esPagoDividido(venta);
  const items = Array.isArray(venta.items) ? venta.items : [];
  const numero = venta.numero;

  // ── Helpers de dibujo ──────────────────────────────────────────────────────
  const gris = () => doc.setTextColor(GRIS);
  const negro = () => doc.setTextColor(0);

  function encabezadoTabla(y) {
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    negro();
    doc.text("Producto", X_IZQ, y);
    doc.text("Cant.", X_CANT, y, { align: "center" });
    doc.text("Precio", X_PRECIO, y, { align: "right" });
    doc.text("Subtotal", X_SUBTOTAL, y, { align: "right" });
    doc.setFont(undefined, "normal");
    y += 2;
    doc.setDrawColor(150);
    doc.line(X_IZQ, y, X_DER, y);
    return y + 5;
  }

  // Encabezado del documento. Solo en la primera página.
  function encabezadoDocumento() {
    let y = Y_TOPE;

    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    negro();
    doc.text("COMPROBANTE DE VENTA", 105, y, { align: "center" });
    y += 6;

    if (copia) {
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      gris();
      doc.text("Copia del comprobante", 105, y, { align: "center" });
      y += 5;
    }

    y += 3;
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);

    // Origen: se etiqueta "Depósito"/"Local" solo si la venta lo informa. Si no
    // viene el dato (ticket en vivo del POS), se usa "Origen:" sin afirmar el tipo.
    const nombreOrigen = venta.localNombre || "-";
    let etiquetaOrigen = "Origen";
    if (venta.origenEsDeposito === true) etiquetaOrigen = "Origen (Depósito)";
    else if (venta.origenEsDeposito === false) etiquetaOrigen = "Origen (Local)";
    const destino = venta.cliente?.nombre || "Consumidor final";

    const filaAncha = (label, valor) => {
      gris();
      doc.text(`${label}:`, X_IZQ, y);
      negro();
      const w = doc.getTextWidth(`${label}: `);
      const lineas = doc.splitTextToSize(String(valor), ANCHO - w);
      doc.text(lineas, X_IZQ + w, y);
      y += INTERLINEA * lineas.length;
    };

    filaAncha(etiquetaOrigen, nombreOrigen);
    filaAncha("Destino", destino);
    if (venta.cliente?.documento) filaAncha("Documento", venta.cliente.documento);

    // Bloque en 2 columnas para el resto (compacto y legible).
    const X_COL2 = 108;
    const fechaTicket = venta.fecha ? new Date(venta.fecha) : new Date();
    const formaPago = dividido
      ? "Mixto"
      : (lineasPago[0]?.label || venta.formaPago || "-");

    const pares = [
      [`Ticket #${numero ?? "-"}`, `Fecha: ${fechaTicket.toLocaleString("es-AR")}`],
      [`Vendedor: ${venta.vendedor || "-"}`, `Forma de pago: ${formaPago}`],
    ];
    const estado = venta.estado
      ? `Estado: ${venta.estado === "fiado" ? "Pendiente" : "Cobrado"}`
      : null;
    const corr = venta.correccion?.corregida
      ? `Venta corregida · versión ${venta.correccion.version ?? "-"}`
      : null;
    if (estado || corr) pares.push([estado || "", corr || ""]);

    y += 1;
    doc.setFontSize(10);
    for (const [izq, der] of pares) {
      negro();
      if (izq) doc.text(izq, X_IZQ, y);
      if (der) doc.text(der, X_COL2, y);
      y += INTERLINEA;
    }

    y += 2;
    doc.setDrawColor(150);
    doc.line(X_IZQ, y, X_DER, y);
    y += 7;

    return encabezadoTabla(y);
  }

  let y = encabezadoDocumento();

  // Abre página nueva y repite el encabezado de columnas.
  function nuevaPagina() {
    doc.addPage();
    return encabezadoTabla(Y_TOPE);
  }

  // Reserva `alto` mm: si no entran antes de Y_LIMITE, salta de página. Se llama
  // ANTES de dibujar cada fila, así que ninguna fila se corta entre páginas.
  function asegurarEspacio(alto) {
    if (y + alto > Y_LIMITE) y = nuevaPagina();
  }

  // ── Filas de producto ──────────────────────────────────────────────────────
  doc.setFontSize(9);
  for (const item of items) {
    const nombreLineas = doc.splitTextToSize(String(item.nombre ?? "-"), ANCHO_NOMBRE);
    const modo = etiquetaModo(item.deposito);
    const consumo =
      item.deposito?.cantidadStock != null
        ? `= ${formatCantidad(item.deposito.cantidadStock)} ${
            item.deposito.modo === "PIEZA" ? "pz" : "u"
          }`
        : null;
    const lineaExtra = modo || consumo ? 1 : 0;

    if (item.esServicio) {
      const s = snapshotServicioTicket(item);
      // nombre + "Carga solicitada" + (recargo) + "Total"
      const filas = nombreLineas.length + 2 + (s.mostrarRecargo ? 1 : 0);
      asegurarEspacio(filas * INTERLINEA + 2);

      negro();
      doc.text(nombreLineas, X_IZQ, y);
      y += INTERLINEA * nombreLineas.length;

      gris();
      doc.text("Carga solicitada", X_IZQ + 4, y);
      negro();
      doc.text(`$${formatPrecio(s.importeBase)}`, X_SUBTOTAL, y, { align: "right" });
      y += INTERLINEA;

      if (s.mostrarRecargo) {
        gris();
        doc.text(`Recargo ${s.recargoPct}%`, X_IZQ + 4, y);
        negro();
        doc.text(`$${formatPrecio(s.recargoImporte)}`, X_SUBTOTAL, y, { align: "right" });
        y += INTERLINEA;
      }

      gris();
      doc.text("Total del servicio", X_IZQ + 4, y);
      negro();
      doc.text(`$${formatPrecio(s.total)}`, X_SUBTOTAL, y, { align: "right" });
      y += INTERLINEA + 1.5;
      continue;
    }

    const filas = nombreLineas.length + lineaExtra;
    asegurarEspacio(filas * INTERLINEA + 2);

    const yFila = y; // cantidad/precio/subtotal se alinean con la 1ra línea
    negro();
    doc.text(nombreLineas, X_IZQ, y);
    doc.text(formatCantidad(item.cantidad), X_CANT, yFila, { align: "center" });
    doc.text(`$${formatPrecio(item.precio)}`, X_PRECIO, yFila, { align: "right" });
    doc.text(
      `$${formatPrecio(Number(item.precio) * Number(item.cantidad))}`,
      X_SUBTOTAL,
      yFila,
      { align: "right" }
    );
    y += INTERLINEA * nombreLineas.length;

    if (lineaExtra) {
      gris();
      doc.setFontSize(8);
      doc.text([modo, consumo].filter(Boolean).join("  ·  "), X_IZQ + 2, y);
      doc.setFontSize(9);
      negro();
      y += INTERLINEA;
    }
    y += 1.5;
  }

  // ── Totales: una sola vez, al final ────────────────────────────────────────
  // Se mide el bloque completo y, si no entra, va a una página nueva. Nunca se
  // superpone con productos ni con el pie.
  const hayDescuento = Number(venta.descuento) > 0;
  const comision = Number(venta.comisionBancaria) || 0;
  const filasPago = dividido ? lineasPago.length + 1 + (comision > 0 ? 2 : 0) : 0;
  const filasEfectivo = venta.pagaCon ? 2 : 0;
  const altoTotales =
    4 + // línea separadora + aire
    INTERLINEA + // subtotal
    (hayDescuento ? INTERLINEA : 0) +
    9 + // TOTAL (14pt)
    (filasPago ? 4 + filasPago * INTERLINEA : 0) +
    (filasEfectivo ? 4 + filasEfectivo * INTERLINEA : 0) +
    12; // "Gracias por su compra" + aire

  if (y + altoTotales > Y_LIMITE) {
    doc.addPage();
    y = Y_TOPE; // sin encabezado de tabla: acá no hay más productos
  }

  doc.setDrawColor(150);
  doc.line(X_IZQ, y, X_DER, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  negro();
  doc.text("Subtotal", X_PRECIO, y, { align: "right" });
  doc.text(`$${formatPrecio(venta.subtotal)}`, X_SUBTOTAL, y, { align: "right" });
  y += INTERLINEA;

  if (hayDescuento) {
    doc.text("Descuento", X_PRECIO, y, { align: "right" });
    doc.text(`-$${formatPrecio(venta.descuento)}`, X_SUBTOTAL, y, { align: "right" });
    y += INTERLINEA;
  }

  y += 3;
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("TOTAL", X_PRECIO, y, { align: "right" });
  doc.text(`$${formatPrecio(venta.total)}`, X_SUBTOTAL, y, { align: "right" });
  doc.setFont(undefined, "normal");
  doc.setFontSize(10);
  y += 6;

  if (dividido) {
    y += 4;
    doc.setFont(undefined, "bold");
    doc.text("Pagos", X_IZQ, y);
    doc.setFont(undefined, "normal");
    y += INTERLINEA;
    for (const l of lineasPago) {
      gris();
      doc.text(String(l.label), X_IZQ + 4, y);
      negro();
      doc.text(`$${formatPrecio(l.monto)}`, X_SUBTOTAL, y, { align: "right" });
      y += INTERLINEA;
    }
    if (comision > 0) {
      gris();
      doc.text("Comisión bancaria", X_IZQ + 4, y);
      negro();
      doc.text(`-$${formatPrecio(comision)}`, X_SUBTOTAL, y, { align: "right" });
      y += INTERLINEA;
      doc.setFont(undefined, "bold");
      doc.text("Neto recibido", X_IZQ + 4, y);
      doc.text(`$${formatPrecio(Number(venta.netoRecibido) || 0)}`, X_SUBTOTAL, y, {
        align: "right",
      });
      doc.setFont(undefined, "normal");
      y += INTERLINEA;
    }
  }

  if (venta.pagaCon) {
    y += 4;
    gris();
    doc.text("Paga con", X_IZQ + 4, y);
    negro();
    doc.text(`$${formatPrecio(venta.pagaCon)}`, X_SUBTOTAL, y, { align: "right" });
    y += INTERLINEA;
    gris();
    doc.text("Vuelto", X_IZQ + 4, y);
    negro();
    doc.text(`$${formatPrecio(venta.vuelto)}`, X_SUBTOTAL, y, { align: "right" });
    y += INTERLINEA;
  }

  // "Gracias por su compra": después de los totales, en la última página.
  y += 8;
  doc.setFontSize(10);
  gris();
  doc.text("Gracias por su compra", 105, Math.min(y, Y_LIMITE + 8), { align: "center" });
  negro();

  // ── Pie por página: se escribe en una 2da pasada, cuando ya se conoce el total
  // de páginas (jsPDF no permite saber Y durante la 1ra).
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    gris();
    doc.text(
      `Ticket #${numero ?? "-"} · Página ${p} de ${totalPaginas}`,
      105,
      Y_PIE,
      { align: "center" }
    );
    negro();
  }

  const nombreArchivo = `venta-${numero}${copia ? "-copia" : ""}.pdf`;
  if (output === "blob") return { blob: doc.output("blob"), nombreArchivo, paginas: totalPaginas };
  doc.save(nombreArchivo);
  return { nombreArchivo, paginas: totalPaginas };
}

// Exportado para tests: constantes de geometría usadas por la paginación.
export const _geometria = { PAGINA_ALTO, Y_TOPE, Y_LIMITE, Y_PIE, X_IZQ, X_DER, ANCHO_NOMBRE };
