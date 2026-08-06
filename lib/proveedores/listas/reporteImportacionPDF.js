// lib/proveedores/listas/reporteImportacionPDF.js
//
// EL PDF DEL REPORTE.
//
// Solo dibuja. Qué va, en qué orden y cómo se reparte en páginas ya lo resolvió
// `reporteImportacion.js`, que se puede probar sin abrir un visor.
//
// ── POR QUÉ NO USA LOS COLORES DE LA WEB ────────────────────────────────────
//
// El PDF se imprime, se manda por WhatsApp y se guarda como respaldo. Depender
// del theme lo haría ilegible en blanco y negro y distinto según quién lo
// genere. Grises neutros y una sola tinta.

import { jsPDF } from "jspdf";

import {
  TITULO_REPORTE,
  encabezadoDeReporte,
  totalesDeReporte,
  lineasDeActualizados,
  lineasDePendientes,
  lineasDeAusentes,
  seccionesDeReporte,
  nombreArchivo,
} from "./reporteImportacion.js";

// A4 en milímetros. Márgenes generosos para que entre en cualquier impresora.
const A4 = { ancho: 210, alto: 297 };
const M = { izq: 12, der: 12, arriba: 14, abajo: 16 };
const ANCHO = A4.ancho - M.izq - M.der;
const ALTO_FILA = 4.6;
const Y_PIE = A4.alto - 8;

const GRIS_FUERTE = 30;
const GRIS_MEDIO = 100;
const GRIS_SUAVE = 225;

const money = (v) =>
  v === null || v === undefined
    ? "—"
    : `$ ${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)} %`);
const fecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const fechaHora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : `${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
};

/** Recorta un texto al ancho de su columna, con puntos suspensivos. */
function recortar(doc, texto, ancho) {
  const t = String(texto ?? "");
  if (doc.getTextWidth(t) <= ancho) return t;
  let corto = t;
  while (corto.length > 1 && doc.getTextWidth(`${corto}…`) > ancho) corto = corto.slice(0, -1);
  return `${corto}…`;
}

/** El estado del dibujo: en qué página vamos y a qué altura. */
function crearLienzo(doc, { titulo, subtitulo }) {
  const estado = { y: M.arriba, pagina: 1 };

  const pie = () => {
    doc.setFontSize(7);
    doc.setTextColor(GRIS_MEDIO);
    doc.text(subtitulo, M.izq, Y_PIE);
    doc.text(`Página ${estado.pagina}`, A4.ancho - M.der, Y_PIE, { align: "right" });
    doc.setTextColor(GRIS_FUERTE);
  };

  const encabezadoDePagina = () => {
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.setTextColor(GRIS_FUERTE);
    doc.text(titulo, M.izq, estado.y);
    doc.setFont(undefined, "normal");
    estado.y += 5;
    doc.setDrawColor(GRIS_SUAVE);
    doc.line(M.izq, estado.y, A4.ancho - M.der, estado.y);
    estado.y += 4;
  };

  encabezadoDePagina();
  pie();

  /** ¿Entra algo de esta altura? Si no, se pasa de página. */
  const asegurar = (alto) => {
    if (estado.y + alto <= A4.alto - M.abajo) return;
    doc.addPage();
    estado.pagina += 1;
    estado.y = M.arriba;
    encabezadoDePagina();
    pie();
  };

  return { estado, asegurar };
}

/** El bloque de identificación de la importación, en dos columnas. */
function dibujarEncabezado(doc, lienzo, datos) {
  const mitad = Math.ceil(datos.length / 2);
  const columnas = [datos.slice(0, mitad), datos.slice(mitad)];
  const alto = mitad * 4.2 + 3;
  lienzo.asegurar(alto);
  const yBase = lienzo.estado.y;

  doc.setFontSize(7.5);
  columnas.forEach((col, i) => {
    const x = M.izq + i * (ANCHO / 2);
    col.forEach((d, j) => {
      const y = yBase + j * 4.2;
      doc.setTextColor(GRIS_MEDIO);
      doc.text(`${d.etiqueta}:`, x, y);
      doc.setTextColor(GRIS_FUERTE);
      const valor = d.tipo === "fecha" ? fechaHora(d.valor) : String(d.valor ?? "—");
      doc.text(recortar(doc, valor, ANCHO / 2 - 32), x + 30, y);
    });
  });
  lienzo.estado.y = yBase + mitad * 4.2 + 3;
}

/** El resumen del sistema, con la verificación de que cierra. */
function dibujarResumen(doc, lienzo, t) {
  lienzo.asegurar(20);
  doc.setFontSize(8.5);
  doc.setFont(undefined, "bold");
  doc.setTextColor(GRIS_FUERTE);
  doc.text("Resumen del sistema", M.izq, lienzo.estado.y);
  doc.setFont(undefined, "normal");
  lienzo.estado.y += 5;

  const celdas = [
    ["Productos Arcor en el ERP", t.universo],
    ["Productos actualizados", t.actualizados],
    ["Pendientes de actualizar", t.pendientes],
    ["No aparecieron en esta lista", t.ausentes],
  ];
  const ancho = ANCHO / celdas.length;
  doc.setFontSize(7.5);
  celdas.forEach(([etiqueta, valor], i) => {
    const x = M.izq + i * ancho;
    doc.setTextColor(GRIS_FUERTE);
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(String(valor), x, lienzo.estado.y + 4);
    doc.setFont(undefined, "normal");
    doc.setFontSize(7);
    doc.setTextColor(GRIS_MEDIO);
    doc.text(recortar(doc, etiqueta, ancho - 3), x, lienzo.estado.y + 8);
  });
  lienzo.estado.y += 12;

  doc.setFontSize(7);
  doc.setTextColor(GRIS_MEDIO);
  const cierre = t.cierra
    ? `${t.actualizados} + ${t.pendientes} + ${t.ausentes} = ${t.universo}. Los totales cierran.`
    : `ATENCIÓN: ${t.actualizados} + ${t.pendientes} + ${t.ausentes} = ${t.suma}, distinto de ${t.universo}.`;
  doc.text(cierre, M.izq, lienzo.estado.y);
  lienzo.estado.y += 4;
  if (t.filasAplicadas !== null) {
    doc.text(
      `Se aplicaron ${t.filasAplicadas} filas del archivo sobre ${t.actualizados} productos distintos.`,
      M.izq,
      lienzo.estado.y
    );
    lienzo.estado.y += 4;
  }
  doc.setTextColor(GRIS_FUERTE);
  lienzo.estado.y += 2;
}

/**
 * Una tabla. Las filas nunca se parten: si no entra entera, va a la página
 * siguiente con su encabezado.
 */
function dibujarTabla(doc, lienzo, { titulo, nota, columnas, filas }) {
  lienzo.asegurar(14);
  doc.setFontSize(8.5);
  doc.setFont(undefined, "bold");
  doc.setTextColor(GRIS_FUERTE);
  doc.text(`${titulo} (${filas.length})`, M.izq, lienzo.estado.y);
  doc.setFont(undefined, "normal");
  lienzo.estado.y += 4;

  if (nota) {
    doc.setFontSize(7);
    doc.setTextColor(GRIS_MEDIO);
    doc.text(nota, M.izq, lienzo.estado.y);
    doc.setTextColor(GRIS_FUERTE);
    lienzo.estado.y += 4;
  }

  const cabeceraTabla = () => {
    doc.setFontSize(6.8);
    doc.setTextColor(GRIS_MEDIO);
    let x = M.izq;
    for (const c of columnas) {
      doc.text(c.titulo, c.alineado === "der" ? x + c.ancho : x, lienzo.estado.y, {
        align: c.alineado === "der" ? "right" : "left",
      });
      x += c.ancho;
    }
    lienzo.estado.y += 1.5;
    doc.setDrawColor(GRIS_SUAVE);
    doc.line(M.izq, lienzo.estado.y, A4.ancho - M.der, lienzo.estado.y);
    lienzo.estado.y += 3;
    doc.setTextColor(GRIS_FUERTE);
  };

  cabeceraTabla();

  if (filas.length === 0) {
    doc.setFontSize(7);
    doc.setTextColor(GRIS_MEDIO);
    doc.text("Sin productos en esta situación.", M.izq, lienzo.estado.y);
    doc.setTextColor(GRIS_FUERTE);
    lienzo.estado.y += 6;
    return;
  }

  doc.setFontSize(7);
  for (const fila of filas) {
    const antes = lienzo.estado.pagina;
    lienzo.asegurar(ALTO_FILA);
    if (lienzo.estado.pagina !== antes) cabeceraTabla();

    let x = M.izq;
    for (const c of columnas) {
      const valor = c.valor(fila);
      doc.text(recortar(doc, valor, c.ancho - 1.5), c.alineado === "der" ? x + c.ancho - 1.5 : x, lienzo.estado.y, {
        align: c.alineado === "der" ? "right" : "left",
      });
      x += c.ancho;
    }
    lienzo.estado.y += ALTO_FILA;
  }
  lienzo.estado.y += 3;
}

const COLUMNAS_ACTUALIZADOS = [
  { titulo: "Producto ERP", ancho: 62, valor: (l) => l.nombre },
  { titulo: "Cód. Arcor", ancho: 22, valor: (l) => l.codigoArcor ?? "sin código" },
  { titulo: "Costo anterior", ancho: 26, alineado: "der", valor: (l) => money(l.costoAnterior) },
  { titulo: "Costo aplicado", ancho: 26, alineado: "der", valor: (l) => money(l.costoAplicado) },
  { titulo: "Var.", ancho: 16, alineado: "der", valor: (l) => pct(l.variacionPct) },
  { titulo: "Aplicado", ancho: 20, valor: (l) => fecha(l.aplicadaEn) },
  { titulo: "Filas", ancho: 14, valor: (l) => l.filas.join(", ") },
];

const COLUMNAS_PENDIENTES = [
  { titulo: "Producto ERP", ancho: 54, valor: (l) => l.nombre },
  { titulo: "Cód. Arcor", ancho: 20, valor: (l) => l.codigoArcor ?? "sin código" },
  { titulo: "Costo actual", ancho: 24, alineado: "der", valor: (l) => money(l.costoActual) },
  { titulo: "Costo propuesto", ancho: 26, alineado: "der", valor: (l) => money(l.costoPropuesto) },
  { titulo: "Motivo", ancho: 48, valor: (l) => l.motivo },
  { titulo: "Filas", ancho: 14, valor: (l) => l.filas.join(", ") },
];

const COLUMNAS_AUSENTES = [
  { titulo: "Producto ERP", ancho: 68, valor: (l) => l.nombre },
  { titulo: "Cód. Arcor", ancho: 22, valor: (l) => l.codigoArcor ?? "sin código" },
  { titulo: "Costo actual", ancho: 26, alineado: "der", valor: (l) => money(l.costoActual) },
  { titulo: "Últ. actualización", ancho: 26, valor: (l) => fecha(l.actualizadoEn) },
  { titulo: "Motivo", ancho: 44, valor: (l) => l.motivo },
];

/**
 * Genera el PDF y devuelve el blob y su nombre.
 *
 * @param tipo        COMPLETO | ACTUALIZADOS | NO_ACTUALIZADOS
 * @param datos       { cabecera, proveedor, usuario, sistema, actualizados, pendientes, ausentes }
 * @param analizarPara función que da el análisis de una fila pendiente
 * @param generadoEn  fecha de generación, inyectada
 */
export function generarReportePDF({ tipo, datos, analizarPara, generadoEn } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const t = totalesDeReporte(datos.sistema ?? {});
  const titulo = `${TITULO_REPORTE[tipo] ?? "Reporte"} · Importación #${datos.cabecera?.id ?? "—"}`;
  const subtitulo = `ERP Azul · ${datos.proveedor?.nombre ?? "Proveedor"} · ${datos.cabecera?.archivoNombre ?? ""}`;

  const lienzo = crearLienzo(doc, { titulo, subtitulo });
  dibujarEncabezado(doc, lienzo, encabezadoDeReporte({ ...datos, generadoEn }));

  const secciones = seccionesDeReporte(tipo);

  if (secciones.includes("RESUMEN")) dibujarResumen(doc, lienzo, t);

  if (secciones.includes("ACTUALIZADOS")) {
    const lineas = lineasDeActualizados(datos.actualizados ?? []);
    dibujarTabla(doc, lienzo, {
      titulo: "Productos actualizados",
      nota:
        t.filasAplicadas !== null
          ? `${t.filasAplicadas} filas del archivo sobre ${lineas.length} productos distintos. Un producto tocado por varias filas aparece una sola vez.`
          : null,
      columnas: COLUMNAS_ACTUALIZADOS,
      filas: lineas,
    });
  }

  if (secciones.includes("PENDIENTES")) {
    dibujarTabla(doc, lienzo, {
      titulo: "Pendientes de actualizar",
      nota: "Están en el archivo y falta decidirlos.",
      columnas: COLUMNAS_PENDIENTES,
      filas: lineasDePendientes(datos.pendientes ?? [], analizarPara),
    });
  }

  if (secciones.includes("AUSENTES")) {
    dibujarTabla(doc, lienzo, {
      titulo: "No aparecieron en esta lista",
      nota: "Existen en el sistema y el proveedor no los informó. No hay precio nuevo que aplicar.",
      columnas: COLUMNAS_AUSENTES,
      filas: lineasDeAusentes(datos.ausentes ?? []),
    });
  }

  return {
    blob: doc.output("blob"),
    nombre: nombreArchivo({ tipo, importacionId: datos.cabecera?.id, generadoEn }),
    paginas: lienzo.estado.pagina,
  };
}
