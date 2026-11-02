// EL PDF DE UN PEDIDO DEL LOCAL AL DEPÓSITO, en A4 vertical (2026-11-02).
//
// Copiado de `lib/pdf/listaDePreciosPdf.js`, que es la pieza que HOY arma un
// PDF agrupado por categoría: `pdf-lib` con Helvetica, A4, el margen de 40
// puntos de todos los PDF del servidor, colores y letras del tema del papel
// (`temaDelPapel.js`) y el pie con "Página X de Y". La original no se tocó: el
// reparto en páginas se IMPORTA de ella (`paginarLista`, que ya era exportado),
// y las dos funciones privadas —preparar el texto para Helvetica y recortar con
// "…"— se copiaron tal cual porque allá no se exportan.
//
// Lo que cambia es el contenido: el encabezado del pedido, las columnas
// Código / Producto / Pedido (y Preparado, si el depósito ya decidió algo) y el
// pie con la cantidad de renglones. SIN PRECIOS NI COSTOS: los datos llegan de
// `lib/pedidos/pdfDelPedido.js`, que no los trae.
//
// Legible en blanco y negro: el texto va en el color de texto del tema claro y
// los rótulos en su gris fuerte; ninguna información depende del color.

import { PDFDocument, StandardFonts, PageSizes, rgb } from "pdf-lib";
import { colorDelPapel, letraDelPapel } from "./temaDelPapel.js";
import { paginarLista } from "./listaDePreciosPdf.js";
import { fechaHoraAR } from "../fechas/formatearFechaHora.js";

/** El margen de los PDF del servidor: el mismo que la lista de precios y el remito. */
const MARGEN = 40;

/** Los tamaños de letra de cada parte, por su nombre en la escala del proyecto. */
const LETRA = Object.freeze({
  titulo: "xl2",
  dato: "sm3",
  cabecera: "sm2",
  fila: "sm2",
  categoria: "sm3",
  pie: "sm2",
});

export const TITULO = (numero) => `Pedido #${numero}`;
export const COLUMNAS = Object.freeze({ codigo: "Código", producto: "Producto", pedido: "Pedido", preparado: "Preparado" });

/** "1 renglón", "24 renglones". */
export const textoDelPie = (n) => `${n} ${n === 1 ? "renglón" : "renglones"}`;
export const textoDePagina = (actual, total) => `Página ${actual} de ${total}`;

/** Los renglones del encabezado: rótulo y valor. */
export function datosDelEncabezado({ local, deposito, enviadoAt, estado }) {
  return [
    ["Local", local],
    ["Depósito", deposito],
    ["Enviado", fechaHoraAR(enviadoAt)],
    ["Estado", estado],
  ];
}

/** Las alturas, derivadas de los tamaños de letra: ninguna medida suelta. */
function medidas() {
  const t = Object.fromEntries(Object.entries(LETRA).map(([k, token]) => [k, letraDelPapel(token)]));
  return {
    letra: t,
    fila: t.fila * 2.2,
    categoria: t.categoria * 2.4,
    cabecera: t.cabecera * 2.2,
    relleno: t.fila * 0.6,
    dato: t.dato * 1.6,
    // Título y los cuatro datos, con su aire.
    encabezado: t.titulo * 1.3 + t.dato * 1.6 * 4 + t.dato * 1.6,
    pie: t.pie * 3,
  };
}

/** Lo que Helvetica no puede escribir: se le saca el acento, y si ni así, va "?". */
function preparadorDeTexto(font) {
  const soportados = new Set(font.getCharacterSet());
  return (valor) =>
    [...String(valor ?? "")]
      .map((ch) => {
        if (soportados.has(ch.codePointAt(0))) return ch;
        const base = ch.normalize("NFD")[0];
        return base && soportados.has(base.codePointAt(0)) ? base : "?";
      })
      .join("");
}

/** El texto recortado con "…" hasta que entre en el ancho. */
function recortar(texto, font, size, ancho) {
  if (font.widthOfTextAtSize(texto, size) <= ancho) return texto;
  let corte = texto.length;
  while (corte > 0 && font.widthOfTextAtSize(`${texto.slice(0, corte)}…`, size) > ancho) corte--;
  return `${texto.slice(0, corte).trimEnd()}…`;
}

/**
 * EL PDF.
 *
 * @param {object} datos lo que devuelve `datosDelPdfDelPedido`
 * @returns {Promise<Uint8Array>}
 */
export async function armarPedidoAlDepositoPdf(datos) {
  const { numero, grupos, total, conPreparado } = datos;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${TITULO(numero)} — ${datos.local}`);
  pdf.setAuthor("ERP Azul");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const texto = preparadorDeTexto(normal);
  const color = (variable) => {
    const c = colorDelPapel(variable);
    return rgb(c.r, c.g, c.b);
  };
  const TEXTO = color("--app-fg");
  const GRIS = color("--pos-muted");
  const GRIS_FUERTE = color("--pos-muted-strong");
  const BORDE = color("--app-border");
  const FONDO_SUAVE = color("--table-header-bg");

  const m = medidas();
  const L = m.letra;
  const [anchoHoja, altoHoja] = PageSizes.A4;
  const anchoUtil = anchoHoja - MARGEN * 2;

  // ── LAS COLUMNAS FIJAS SE MIDEN CON LO QUE VAN A LLEVAR ─────────────────
  //
  // Código, Pedido y Preparado tienen el ancho de su texto más largo —o del
  // rótulo— en TODO el documento. Producto se queda con el resto.
  const filas = grupos.flatMap((g) => g.filas);
  const anchoDe = (valores, rotulo) =>
    Math.max(
      negrita.widthOfTextAtSize(rotulo, L.cabecera),
      ...valores.map((v) => normal.widthOfTextAtSize(texto(v), L.fila))
    ) + m.relleno * 2;
  const ancho = {
    codigo: anchoDe(filas.map((f) => f.codigo), COLUMNAS.codigo),
    pedido: anchoDe(filas.map((f) => f.pedido), COLUMNAS.pedido),
    preparado: conPreparado ? anchoDe(filas.map((f) => f.preparado), COLUMNAS.preparado) : 0,
  };
  ancho.producto = anchoUtil - ancho.codigo - ancho.pedido - ancho.preparado;
  const x = { codigo: MARGEN };
  x.producto = x.codigo + ancho.codigo;
  x.pedido = x.producto + ancho.producto;
  x.preparado = x.pedido + ancho.pedido;

  const escribir = (page, valor, px, py, size, font, c) =>
    page.drawText(texto(valor), { x: px, y: py, size, font, color: c });
  const aLaDerecha = (page, valor, borde, py, size, font, c) => {
    const t = texto(valor);
    page.drawText(t, { x: borde - font.widthOfTextAtSize(t, size), y: py, size, font, color: c });
  };
  // La línea de base de un texto centrado en una franja de alto `h` que empieza en `arriba`.
  const base = (arriba, h, size) => arriba - h / 2 - size * 0.35;

  const paginas = paginarLista(grupos, m);

  paginas.forEach((pagina, i) => {
    const page = pdf.addPage(PageSizes.A4);
    let y = altoHoja - MARGEN;

    if (pagina.encabezado) {
      let yDato = y - L.titulo;
      escribir(page, TITULO(numero), MARGEN, yDato, L.titulo, negrita, TEXTO);
      yDato -= L.titulo * 0.3;
      const anchoRotulo = Math.max(...datosDelEncabezado(datos).map(([r]) => negrita.widthOfTextAtSize(texto(`${r}:`), L.dato)));
      for (const [rotulo, valor] of datosDelEncabezado(datos)) {
        yDato -= m.dato;
        escribir(page, `${rotulo}:`, MARGEN, yDato, L.dato, negrita, GRIS_FUERTE);
        escribir(page, valor, MARGEN + anchoRotulo + m.relleno, yDato, L.dato, normal, TEXTO);
      }
      y -= m.encabezado;
    }

    // Cabecera de columnas, en cada página.
    page.drawRectangle({ x: MARGEN, y: y - m.cabecera, width: anchoUtil, height: m.cabecera, color: FONDO_SUAVE });
    const yCab = base(y, m.cabecera, L.cabecera);
    escribir(page, COLUMNAS.codigo, x.codigo + m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    escribir(page, COLUMNAS.producto, x.producto + m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    aLaDerecha(page, COLUMNAS.pedido, x.pedido + ancho.pedido - m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    if (conPreparado) {
      aLaDerecha(page, COLUMNAS.preparado, x.preparado + ancho.preparado - m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    }
    y -= m.cabecera;

    for (const r of pagina.renglones) {
      if (r.tipo === "categoria") {
        escribir(page, r.texto, MARGEN + m.relleno, base(y, m.categoria, L.categoria), L.categoria, negrita, TEXTO);
        y -= m.categoria;
        continue;
      }
      const f = r.fila;
      const yf = base(y, m.fila, L.fila);
      escribir(page, f.codigo, x.codigo + m.relleno, yf, L.fila, normal, TEXTO);
      escribir(
        page,
        recortar(texto(f.nombre), normal, L.fila, ancho.producto - m.relleno * 2),
        x.producto + m.relleno, yf, L.fila, normal, TEXTO
      );
      aLaDerecha(page, f.pedido, x.pedido + ancho.pedido - m.relleno, yf, L.fila, negrita, TEXTO);
      if (conPreparado) {
        aLaDerecha(page, f.preparado, x.preparado + ancho.preparado - m.relleno, yf, L.fila, normal, TEXTO);
      }
      y -= m.fila;
      page.drawLine({
        start: { x: MARGEN, y },
        end: { x: MARGEN + anchoUtil, y },
        thickness: 0.5,
        color: BORDE,
      });
    }

    // El pie, abajo de todo.
    const yPie = MARGEN;
    escribir(page, textoDelPie(total), MARGEN, yPie, L.pie, negrita, GRIS_FUERTE);
    aLaDerecha(page, textoDePagina(i + 1, paginas.length), anchoHoja - MARGEN, yPie, L.pie, normal, GRIS);
  });

  return pdf.save();
}
