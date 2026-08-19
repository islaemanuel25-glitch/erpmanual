// Import NOMBRADO (el que documenta jsPDF): el default de "jspdf" bajo Node ESM es
// el module.exports de CJS, que no es constructor. Con el nombrado el módulo corre
// igual en el bundle del browser y en Node puro (tests).
import { jsPDF } from "jspdf";
// Con extensión, así resuelve también bajo Node, igual que servicios.js con ./pagos.js.
import { lineasPagoTicket, esPagoDividido } from "./pagos.js";
import { snapshotServicioTicket } from "./servicios.js";
import { presentacionLinea, formatCantidadPresentacion } from "./presentacionLinea.js";
import { fechaHoraSegundosAR } from "../fechas/formatearFechaHora.js";

// Comprobante de venta en A4, PAGINADO. Fuente ÚNICA para "PDF" y "Compartir"
// (ambos entran por acá; Compartir solo pide output:"blob").
//
// Estructura: se MIDEN todas las filas, se PLANIFICAN las páginas y recién después
// se dibuja. Eso permite dos cosas que no se pueden hacer dibujando al vuelo:
//   · que ninguna fila se corte entre páginas;
//   · evitar la última página huérfana con solo el total — si el resumen no entra
//     tras el último producto, se bajan filas finales a la página siguiente para
//     que tenga contenido real (ver planificarPaginas).
//
// opts.copia  = true → se aclara "Copia del comprobante" (discreto) y se usa la
//                      fecha ORIGINAL de la venta, conservando su número.
// opts.output = "blob" → devuelve { blob, nombreArchivo, paginas } en vez de descargar.

// ── Geometría de la hoja (mm) ────────────────────────────────────────────────
const Y_TOPE = 18;          // inicio de contenido en páginas 2+
const Y_LIMITE = 268;       // ninguna fila puede pasar de acá
const Y_PIE = 288;          // línea de pie por página
const X_IZQ = 20;
const X_DER = 190;

// Columnas: Producto | Presentación | Cantidad | Precio | Subtotal
const X_PRESENTACION = 86;
const X_CANTIDAD = 136;     // alineado a la derecha
const X_PRECIO = 162;       // alineado a la derecha
const X_SUBTOTAL = X_DER;   // alineado a la derecha
const ANCHO_NOMBRE = 64;    // 20 → 84
const ANCHO_PRESENTACION = 28;
const MAX_LINEAS_NOMBRE = 2;

const INTERLINEA = 4.6;
const PAD_FILA = 2.2;       // aire entre filas

// Altura mínima de productos que se busca dejar en la última página cuando hay que
// bajar filas para que el resumen no quede solo.
const MIN_CONTENIDO_ULTIMA = 40;

const GRIS = 120;
const GRIS_SUAVE = 235;

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MEDIO_LABEL = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Débito",
  DEBITO: "Débito",
  TARJETA_CREDITO: "Crédito",
  CREDITO: "Crédito",
  MERCADOPAGO: "Mercado Pago",
  DIGITAL: "Digital",
  TRANSFERENCIA: "Transferencia",
  FIADO: "Cuenta corriente",
};

export default function generarTicketPDF(venta, opts = {}) {
  const copia = opts?.copia === true;
  const output = opts?.output === "blob" ? "blob" : "save";
  const doc = new jsPDF({ format: "a4", unit: "mm" });

  const lineasPago = lineasPagoTicket(venta);
  const dividido = esPagoDividido(venta);
  const items = Array.isArray(venta.items) ? venta.items : [];
  const numero = venta.numero;

  const gris = () => doc.setTextColor(GRIS);
  const negro = () => doc.setTextColor(0);

  // ── 1. MODELO DE FILAS ─────────────────────────────────────────────────────
  // Cada fila se resuelve una sola vez (texto ya partido) y se mide.
  doc.setFontSize(9);
  const filas = items.map((item) => {
    const { etiqueta, unidad } = presentacionLinea(item);

    if (item.esServicio) {
      const s = snapshotServicioTicket(item);
      const nombre = doc
        .splitTextToSize(String(item.nombre ?? "-"), ANCHO_NOMBRE)
        .slice(0, MAX_LINEAS_NOMBRE);
      const detalle = [
        ["Carga solicitada", s.importeBase],
        ...(s.mostrarRecargo ? [[`Recargo ${s.recargoPct}%`, s.recargoImporte]] : []),
        ["Total del servicio", s.total],
      ];
      return {
        tipo: "servicio",
        nombre,
        etiqueta,
        detalle,
        alto: (nombre.length + detalle.length) * INTERLINEA + PAD_FILA,
      };
    }

    const nombreCompleto = doc.splitTextToSize(String(item.nombre ?? "-"), ANCHO_NOMBRE);
    const nombre = nombreCompleto.slice(0, MAX_LINEAS_NOMBRE);
    // Si el nombre no entra en 2 líneas se corta con puntos suspensivos.
    if (nombreCompleto.length > MAX_LINEAS_NOMBRE) {
      nombre[MAX_LINEAS_NOMBRE - 1] = `${nombre[MAX_LINEAS_NOMBRE - 1].replace(/\s+\S*$/, "")}…`;
    }
    const presentacion = doc
      .splitTextToSize(etiqueta, ANCHO_PRESENTACION)
      .slice(0, MAX_LINEAS_NOMBRE);
    return {
      tipo: "producto",
      nombre,
      presentacion,
      cantidad: formatCantidadPresentacion(item.cantidad, unidad),
      precio: `$${formatPrecio(item.precio)}`,
      // El subtotal GUARDADO manda sobre precio × cantidad. En una línea de peso
      // cargada por importe ($2.000 sobre $8.500/kg) el peso quedó cuantizado a
      // 0,235 kg, y multiplicar de nuevo imprimiría $1.997,50 en un ticket cuyo
      // total dice $2.000. Se recalcula solo si la venta no trae subtotal (legacy).
      subtotal: `$${formatPrecio(
        item.subtotal != null ? Number(item.subtotal) : Number(item.precio) * Number(item.cantidad)
      )}`,
      alto: Math.max(nombre.length, presentacion.length) * INTERLINEA + PAD_FILA,
    };
  });

  // ── 2. BLOQUE DE RESUMEN: filas y altura ───────────────────────────────────
  const hayDescuento = Number(venta.descuento) > 0;
  const comision = Number(venta.comisionBancaria) || 0;
  const resumen = [];
  resumen.push({ clase: "linea", label: "Subtotal", valor: `$${formatPrecio(venta.subtotal)}` });
  if (hayDescuento) {
    resumen.push({ clase: "linea", label: "Descuento", valor: `-$${formatPrecio(venta.descuento)}` });
  }
  // Pagos: se detallan siempre que haya más de un medio, o uno solo distinto de
  // efectivo. Un único pago en efectivo por el total no aporta información.
  const detallarPagos =
    lineasPago.length > 1 ||
    (lineasPago.length === 1 && String(lineasPago[0].medio || "").toUpperCase() !== "EFECTIVO");
  if (detallarPagos) {
    resumen.push({ clase: "subtitulo", label: "Pagos" });
    for (const l of lineasPago) {
      resumen.push({
        clase: "detalle",
        label: MEDIO_LABEL[String(l.medio || "").toUpperCase()] || l.label || String(l.medio),
        valor: `$${formatPrecio(l.monto)}`,
      });
    }
  }
  resumen.push({ clase: "total", label: "TOTAL", valor: `$${formatPrecio(venta.total)}` });
  if (comision > 0) {
    resumen.push({ clase: "linea", label: "Comisión bancaria", valor: `-$${formatPrecio(comision)}` });
    resumen.push({
      clase: "fuerte",
      label: "Neto recibido",
      valor: `$${formatPrecio(Number(venta.netoRecibido) || 0)}`,
    });
  }
  if (venta.pagaCon) {
    resumen.push({ clase: "detalle", label: "Paga con", valor: `$${formatPrecio(venta.pagaCon)}` });
    resumen.push({ clase: "detalle", label: "Vuelto", valor: `$${formatPrecio(venta.vuelto)}` });
  }

  const ALTO_RESUMEN_LINEA = { linea: INTERLINEA, detalle: INTERLINEA, subtitulo: INTERLINEA + 1, fuerte: INTERLINEA, total: 9 };
  const ALTO_GRACIAS = 12;
  const altoResumen =
    6 + // separador + aire
    resumen.reduce((a, r) => a + ALTO_RESUMEN_LINEA[r.clase], 0) +
    ALTO_GRACIAS;

  // ── 3. PLANIFICACIÓN DE PÁGINAS ────────────────────────────────────────────
  const altoEncabezadoDoc = medirEncabezadoDocumento();
  const inicioPagina1 = altoEncabezadoDoc; // ya incluye el encabezado de tabla
  const inicioPaginaN = Y_TOPE + ALTO_ENCABEZADO_TABLA;
  const plan = planificarPaginas({
    filas,
    altoResumen,
    inicioPagina1,
    inicioPaginaN,
    limite: Y_LIMITE,
    minContenidoUltima: MIN_CONTENIDO_ULTIMA,
  });

  // ── 4. DIBUJO ──────────────────────────────────────────────────────────────
  let y = 0;
  for (let p = 0; p < plan.paginas.length; p++) {
    const pagina = plan.paginas[p];
    if (p > 0) doc.addPage();
    y = p === 0 ? dibujarEncabezadoDocumento() : dibujarEncabezadoTabla(Y_TOPE);
    if (p > 0 && pagina.filas.length === 0) {
      // Página de resumen dedicada: no lleva tabla, lleva su propio título.
      y = dibujarTituloResumen(Y_TOPE);
    }
    for (const idx of pagina.filas) {
      y = dibujarFila(filas[idx], y);
    }
    if (pagina.resumen) y = dibujarResumen(y);
  }

  // ── 5. PIE POR PÁGINA (2da pasada: ya se conoce el total) ──────────────────
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    gris();
    doc.text(`Ticket #${numero ?? "-"} · Página ${p} de ${totalPaginas}`, 105, Y_PIE, {
      align: "center",
    });
    negro();
  }

  const nombreArchivo = `venta-${numero}${copia ? "-copia" : ""}.pdf`;
  const meta = { nombreArchivo, paginas: totalPaginas, paginaResumenDedicada: plan.resumenDedicado };
  if (output === "blob") return { blob: doc.output("blob"), ...meta };
  doc.save(nombreArchivo);
  return meta;

  // ── Helpers de dibujo (closures sobre doc/venta) ───────────────────────────

  function medirEncabezadoDocumento() {
    // Mismo cálculo que dibujarEncabezadoDocumento, sin pintar.
    let h = Y_TOPE + 6;
    if (copia) h += 5;
    h += 3;
    h += INTERLINEA; // Origen
    h += INTERLINEA; // Destino
    if (venta.cliente?.documento) h += INTERLINEA;
    h += 1;
    h += INTERLINEA * (venta.estado || venta.correccion?.corregida ? 3 : 2);
    h += 2 + 7;
    return h + ALTO_ENCABEZADO_TABLA;
  }

  function dibujarEncabezadoDocumento() {
    let yy = Y_TOPE;

    doc.setFontSize(17);
    doc.setFont(undefined, "bold");
    negro();
    doc.text("COMPROBANTE DE VENTA", 105, yy, { align: "center" });
    yy += 6;

    if (copia) {
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      gris();
      doc.text("Copia del comprobante", 105, yy, { align: "center" });
      yy += 5;
    }

    yy += 3;
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);

    const nombreOrigen = venta.localNombre || "-";
    let etiquetaOrigen = "Origen";
    if (venta.origenEsDeposito === true) etiquetaOrigen = "Origen (Depósito)";
    else if (venta.origenEsDeposito === false) etiquetaOrigen = "Origen (Local)";

    const filaAncha = (label, valor) => {
      gris();
      doc.text(`${label}:`, X_IZQ, yy);
      negro();
      const w = doc.getTextWidth(`${label}: `);
      doc.text(String(valor), X_IZQ + w, yy);
      yy += INTERLINEA;
    };

    filaAncha(etiquetaOrigen, nombreOrigen);
    filaAncha("Destino", venta.cliente?.nombre || "Consumidor final");
    if (venta.cliente?.documento) filaAncha("Documento", venta.cliente.documento);

    const X_COL2 = 108;
    const fechaTicket = venta.fecha ? new Date(venta.fecha) : new Date();
    const formaPago = dividido ? "Mixto" : lineasPago[0]?.label || venta.formaPago || "-";
    const pares = [
      // LA HORA DEL TICKET, EN ARGENTINA Y EN 24 HORAS. Antes era un
      // `toLocaleString("es-AR")` pelado, con dos defectos que se sumaban: usaba
      // la zona DEL DISPOSITIVO —en una Sunmi en UTC, tres horas de más— y
      // devolvía "02:16:40" para las 14:16, sin a. m. ni p. m. Una hora ambigua
      // impresa en el único papel que sale de la empresa.
      [`Ticket #${numero ?? "-"}`, `Fecha: ${fechaHoraSegundosAR(fechaTicket)}`],
      [`Vendedor: ${venta.vendedor || "-"}`, `Forma de pago: ${formaPago}`],
    ];
    const estado = venta.estado
      ? `Estado: ${venta.estado === "fiado" ? "Pendiente" : "Cobrado"}`
      : null;
    const corr = venta.correccion?.corregida
      ? `Venta corregida · versión ${venta.correccion.version ?? "-"}`
      : null;
    if (estado || corr) pares.push([estado || "", corr || ""]);

    yy += 1;
    for (const [izq, der] of pares) {
      negro();
      if (izq) doc.text(izq, X_IZQ, yy);
      if (der) doc.text(der, X_COL2, yy);
      yy += INTERLINEA;
    }

    yy += 2;
    doc.setDrawColor(150);
    doc.line(X_IZQ, yy, X_DER, yy);
    yy += 7;

    return dibujarEncabezadoTabla(yy);
  }

  function dibujarEncabezadoTabla(yy) {
    // Divisor suave de fondo para separar la tabla del resto.
    doc.setFillColor(GRIS_SUAVE);
    doc.rect(X_IZQ, yy - 3.6, X_DER - X_IZQ, 5.6, "F");
    doc.setFontSize(8.5);
    doc.setFont(undefined, "bold");
    negro();
    doc.text("Producto", X_IZQ + 1, yy);
    doc.text("Presentación", X_PRESENTACION, yy);
    doc.text("Cantidad", X_CANTIDAD, yy, { align: "right" });
    doc.text("Precio", X_PRECIO, yy, { align: "right" });
    doc.text("Subtotal", X_SUBTOTAL - 1, yy, { align: "right" });
    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    return yy + 6;
  }

  function dibujarTituloResumen(yy) {
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    negro();
    doc.text("Resumen de la venta", X_IZQ, yy + 3);
    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    return yy + 10;
  }

  function dibujarFila(fila, yy) {
    doc.setFontSize(9);
    if (fila.tipo === "servicio") {
      negro();
      doc.text(fila.nombre, X_IZQ + 1, yy);
      gris();
      doc.text(fila.etiqueta, X_PRESENTACION, yy);
      let yd = yy + INTERLINEA * fila.nombre.length;
      for (const [label, monto] of fila.detalle) {
        gris();
        doc.text(label, X_IZQ + 4, yd);
        negro();
        doc.text(`$${formatPrecio(monto)}`, X_SUBTOTAL - 1, yd, { align: "right" });
        yd += INTERLINEA;
      }
      return yy + fila.alto;
    }

    negro();
    doc.text(fila.nombre, X_IZQ + 1, yy);
    gris();
    doc.text(fila.presentacion, X_PRESENTACION, yy);
    negro();
    doc.text(fila.cantidad, X_CANTIDAD, yy, { align: "right" });
    doc.text(fila.precio, X_PRECIO, yy, { align: "right" });
    doc.setFont(undefined, "bold");
    doc.text(fila.subtotal, X_SUBTOTAL - 1, yy, { align: "right" });
    doc.setFont(undefined, "normal");
    return yy + fila.alto;
  }

  function dibujarResumen(yy) {
    let y2 = yy + 3;
    doc.setDrawColor(150);
    doc.line(X_IZQ, y2, X_DER, y2);
    y2 += 6;

    for (const r of resumen) {
      if (r.clase === "subtitulo") {
        doc.setFontSize(9);
        doc.setFont(undefined, "bold");
        negro();
        doc.text(r.label, X_IZQ, y2);
        doc.setFont(undefined, "normal");
        y2 += ALTO_RESUMEN_LINEA.subtitulo;
        continue;
      }
      if (r.clase === "total") {
        doc.setFontSize(13);
        doc.setFont(undefined, "bold");
        negro();
        doc.text(r.label, X_PRECIO, y2 + 2, { align: "right" });
        doc.text(r.valor, X_SUBTOTAL - 1, y2 + 2, { align: "right" });
        doc.setFont(undefined, "normal");
        doc.setFontSize(9);
        y2 += ALTO_RESUMEN_LINEA.total;
        continue;
      }
      doc.setFontSize(9.5);
      if (r.clase === "fuerte") doc.setFont(undefined, "bold");
      const sangria = r.clase === "detalle" ? 4 : 0;
      gris();
      doc.text(r.label, X_IZQ + sangria, y2);
      negro();
      doc.text(r.valor, X_SUBTOTAL - 1, y2, { align: "right" });
      if (r.clase === "fuerte") doc.setFont(undefined, "normal");
      y2 += ALTO_RESUMEN_LINEA[r.clase];
    }

    y2 += 6;
    doc.setFontSize(10);
    gris();
    doc.text("Gracias por su compra", 105, y2, { align: "center" });
    negro();
    return y2;
  }
}

// Alto del encabezado de columnas (fondo + texto + aire).
const ALTO_ENCABEZADO_TABLA = 6;

/**
 * Reparte las filas en páginas y decide dónde va el resumen.
 *
 * Regla contra la última página pobre: la página que lleva el resumen debe tener
 * al menos `minContenidoUltima` mm de productos. Cubre los dos síntomas del mismo
 * defecto — la página con SOLO el total, y la que trae 1 o 2 productos y el total
 * suelto arriba. Se bajan filas del final de la página anterior hasta alcanzar ese
 * mínimo, siempre respetando que:
 *   · las filas movidas + el resumen entren en la página;
 *   · la página anterior conserve al menos una fila (no se vacía).
 * Solo si ni una fila entra junto al resumen se usa una página de resumen dedicada.
 *
 * No corta filas, no duplica ni reordena productos: solo reparte índices.
 *
 * Exportado para poder testear el reparto sin generar el PDF.
 * @returns {{ paginas: Array<{filas: number[], resumen: boolean}>, resumenDedicado: boolean }}
 */
export function planificarPaginas({
  filas,
  altoResumen,
  inicioPagina1,
  inicioPaginaN,
  limite = Y_LIMITE,
  minContenidoUltima = MIN_CONTENIDO_ULTIMA,
}) {
  const paginas = [];
  let actual = { filas: [], resumen: false };
  let y = inicioPagina1;

  // 1. Reparto greedy de las filas.
  for (let i = 0; i < filas.length; i++) {
    const alto = filas[i].alto;
    if (actual.filas.length > 0 && y + alto > limite) {
      paginas.push(actual);
      actual = { filas: [], resumen: false };
      y = inicioPaginaN;
    }
    actual.filas.push(i);
    y += alto;
  }
  paginas.push(actual);

  // 2. ¿Entra el resumen tras el último producto? Si no, abre página.
  let resumenEnPaginaNueva = false;
  if (y + altoResumen <= limite) {
    paginas[paginas.length - 1].resumen = true;
  } else {
    paginas.push({ filas: [], resumen: true });
    resumenEnPaginaNueva = true;
  }

  // 3. Rebalanceo: la página del resumen tiene que tener contenido real.
  const ultima = paginas[paginas.length - 1];
  const inicio = paginas.length === 1 ? inicioPagina1 : inicioPaginaN;
  const alto = (idx) => filas[idx].alto;
  let contenido = ultima.filas.reduce((a, i) => a + alto(i), 0);

  while (paginas.length > 1 && contenido < minContenidoUltima) {
    const previa = paginas[paginas.length - 2];
    if (previa.filas.length <= 1) break; // no vaciar la página anterior
    const idx = previa.filas[previa.filas.length - 1];
    if (inicio + contenido + alto(idx) + altoResumen > limite) break;
    previa.filas.pop();
    ultima.filas.unshift(idx);
    contenido += alto(idx);
  }

  // Ni una fila pudo acompañar al resumen → página de resumen dedicada.
  const resumenDedicado = resumenEnPaginaNueva && ultima.filas.length === 0;
  return { paginas, resumenDedicado };
}

// Exportado para tests: constantes de geometría usadas por la paginación.
export const _geometria = {
  Y_TOPE,
  Y_LIMITE,
  Y_PIE,
  X_IZQ,
  X_DER,
  X_PRESENTACION,
  X_CANTIDAD,
  X_PRECIO,
  X_SUBTOTAL,
  ANCHO_NOMBRE,
  MIN_CONTENIDO_ULTIMA,
  ALTO_ENCABEZADO_TABLA,
};
