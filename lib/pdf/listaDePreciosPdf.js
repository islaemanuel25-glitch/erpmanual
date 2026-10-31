// EL PDF DE LA LISTA DE PRECIOS DEL CATÁLOGO, en A4 vertical.
//
// Se arma igual que los otros PDF del servidor —el remito y el acta de
// transferencias, el pedido a proveedor—: `pdf-lib` con las letras estándar
// Helvetica, la hoja A4 y el margen de 40 puntos que usan todos. Lo que cambia
// son los colores y los tamaños, que acá salen del tema (`temaDelPapel.js`) en
// vez de estar escritos a mano.
//
// El diseño lo aprobó Emanuel y está descripto en el pedido de la tanda: el
// encabezado con el título, la fecha, la ubicación y los filtros; la tabla de
// cinco columnas con la cabecera que se repite en cada página; los productos
// agrupados por categoría; y el pie con la cantidad y el número de página.
//
// ── LA SEMI NEGRITA ES NEGRITA, Y ES UN LÍMITE CONOCIDO ───────────────────
//
// Las letras estándar de un PDF son Helvetica y Helvetica-Bold: no hay un peso
// intermedio. Para tenerlo habría que incrustar un archivo de fuente con
// `@pdf-lib/fontkit`, que el proyecto no tiene. Donde el diseño pide semi
// negrita —la ubicación, la cabecera, el pie— va la negrita.
//
// ── SE PAGINA ANTES DE DIBUJAR ────────────────────────────────────────────
//
// El pie dice "Página X de Y", y la Y no se sabe hasta el final. Por eso el
// reparto en páginas es una función pura (`paginarLista`) que corre primero y
// devuelve qué va en cada hoja; recién después se dibuja. Además así los
// candados pueden afirmar dónde corta una página sin tener que leer un PDF.

import { PDFDocument, StandardFonts, PageSizes, rgb } from "pdf-lib";
import { colorDelPapel, letraDelPapel } from "./temaDelPapel.js";
import { formatearImporteDeLista } from "../moneda.js";
import { fechaAR } from "../fechas/formatearFechaHora.js";
import { lineaDeFiltros } from "../productos/listaDePrecios.js";

/** El margen de los PDF del servidor: el mismo que el remito y el acta de transferencias. */
const MARGEN = 40;

/** Los tamaños de letra de cada parte, por su nombre en la escala del proyecto. */
const LETRA = Object.freeze({
  titulo: "xl2",
  fecha: "sm2",
  ubicacion: "base2",
  filtros: "sm2",
  cabecera: "sm2",
  fila: "sm2",
  categoria: "sm3",
  pie: "sm2",
});

export const TITULO = "Lista de precios";
export const COLUMNAS = Object.freeze(["Código", "Producto", "Presentación", "Costo", "Venta"]);

/** "1 producto", "245 productos". */
export const textoDelPie = (n) => `${n} ${n === 1 ? "producto" : "productos"}`;
export const textoDePagina = (actual, total) => `Página ${actual} de ${total}`;

/** Las alturas, derivadas de los tamaños de letra: ninguna medida suelta. */
function medidas() {
  const t = Object.fromEntries(Object.entries(LETRA).map(([k, token]) => [k, letraDelPapel(token)]));
  return {
    letra: t,
    fila: t.fila * 2.2,
    categoria: t.categoria * 2.4,
    cabecera: t.cabecera * 2.2,
    relleno: t.fila * 0.6,
    // Título, ubicación y filtros, con su aire.
    encabezado: t.titulo * 1.3 + t.ubicacion * 1.7 + t.filtros * 2.6,
    pie: t.pie * 3,
  };
}

/** Los renglones en orden: el nombre de cada categoría y después sus filas. */
function renglones(grupos) {
  const salida = [];
  for (const g of grupos) {
    salida.push({ tipo: "categoria", texto: g.categoria.toLocaleUpperCase("es") });
    for (const fila of g.filas) salida.push({ tipo: "fila", fila });
  }
  return salida;
}

/**
 * QUÉ VA EN CADA PÁGINA.
 *
 * La primera lleva el encabezado; todas llevan la cabecera de columnas y el
 * pie. Una categoría no queda sola al pie de una hoja: si no entra con al menos
 * una fila abajo, pasa a la siguiente. Y si un grupo sigue en otra página, su
 * nombre se repite arriba, así ninguna fila queda sin saber de qué categoría es.
 *
 * @param {Array<{categoria: string, filas: object[]}>} grupos
 * @param {object} [alto] las alturas, inyectables para los candados
 * @returns {Array<{ encabezado: boolean, renglones: object[] }>}
 */
export function paginarLista(grupos, alto = null) {
  const m = alto ?? medidas();
  const altoUtil = PageSizes.A4[1] - MARGEN * 2 - m.pie - m.cabecera;
  const paginas = [];
  let actual = null;
  let libre = 0;
  let categoria = null;

  const nueva = () => {
    actual = { encabezado: paginas.length === 0, renglones: [] };
    paginas.push(actual);
    libre = altoUtil - (actual.encabezado ? m.encabezado : 0);
  };
  nueva();

  for (const r of renglones(grupos)) {
    const necesita = r.tipo === "categoria" ? m.categoria + m.fila : m.fila;
    if (necesita > libre && actual.renglones.length > 0) {
      nueva();
      if (r.tipo === "fila" && categoria) {
        actual.renglones.push({ tipo: "categoria", texto: categoria });
        libre -= m.categoria;
      }
    }
    if (r.tipo === "categoria") categoria = r.texto;
    actual.renglones.push(r);
    libre -= r.tipo === "categoria" ? m.categoria : m.fila;
  }
  return paginas;
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
 * @param {object} datos lo que devuelve `datosDeLaListaDePrecios`
 * @param {object} [opciones]
 * @param {Date} [opciones.fecha] la del encabezado; por defecto, ahora
 * @returns {Promise<Uint8Array>}
 */
export async function armarListaDePreciosPdf({ ubicacion, proveedor, tipo, grupos, total }, { fecha = new Date() } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${TITULO} — ${ubicacion}`);
  pdf.setAuthor("ERP Azul");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const texto = preparadorDeTexto(normal);
  const color = (variable) => {
    const c = colorDelPapel(variable);
    return rgb(c.r, c.g, c.b);
  };
  const ACENTO = color("--pos-accent");
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
  // Código, Presentación, Costo y Venta tienen el ancho de su texto más largo
  // —o del rótulo, si es más ancho— en TODO el documento, así no cambian de una
  // página a otra. Producto se queda con el resto.
  const filas = grupos.flatMap((g) => g.filas);
  const anchoDe = (valores, rotulo) =>
    Math.max(
      negrita.widthOfTextAtSize(rotulo, L.cabecera),
      ...valores.map((v) => normal.widthOfTextAtSize(texto(v), L.fila))
    ) + m.relleno * 2;
  const celdas = {
    codigo: filas.map((f) => f.codigo ?? ""),
    presentacion: filas.map((f) => f.presentacion ?? ""),
    costo: filas.map((f) => formatearImporteDeLista(f.costo)),
    venta: filas.map((f) => formatearImporteDeLista(f.venta)),
  };
  const ancho = {
    codigo: anchoDe(celdas.codigo, COLUMNAS[0]),
    presentacion: anchoDe(celdas.presentacion, COLUMNAS[2]),
    costo: anchoDe(celdas.costo, COLUMNAS[3]),
    venta: anchoDe(celdas.venta, COLUMNAS[4]),
  };
  ancho.producto = anchoUtil - ancho.codigo - ancho.presentacion - ancho.costo - ancho.venta;
  const x = { codigo: MARGEN };
  x.producto = x.codigo + ancho.codigo;
  x.presentacion = x.producto + ancho.producto;
  x.costo = x.presentacion + ancho.presentacion;
  x.venta = x.costo + ancho.costo;

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
      const yTitulo = y - L.titulo;
      escribir(page, TITULO, MARGEN, yTitulo, L.titulo, negrita, TEXTO);
      aLaDerecha(page, fechaAR(fecha), anchoHoja - MARGEN, yTitulo, L.fecha, normal, GRIS);
      const yUbicacion = yTitulo - L.ubicacion * 1.7;
      escribir(page, ubicacion, MARGEN, yUbicacion, L.ubicacion, negrita, ACENTO);
      const yFiltros = yUbicacion - L.filtros * 1.6;
      escribir(page, lineaDeFiltros({ proveedor, tipo }), MARGEN, yFiltros, L.filtros, normal, GRIS);
      y -= m.encabezado;
    }

    // Cabecera de columnas, en cada página.
    page.drawRectangle({ x: MARGEN, y: y - m.cabecera, width: anchoUtil, height: m.cabecera, color: FONDO_SUAVE });
    const yCab = base(y, m.cabecera, L.cabecera);
    escribir(page, COLUMNAS[0], x.codigo + m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    escribir(page, COLUMNAS[1], x.producto + m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    escribir(page, COLUMNAS[2], x.presentacion + m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    aLaDerecha(page, COLUMNAS[3], x.costo + ancho.costo - m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    aLaDerecha(page, COLUMNAS[4], x.venta + ancho.venta - m.relleno, yCab, L.cabecera, negrita, GRIS_FUERTE);
    y -= m.cabecera;

    for (const r of pagina.renglones) {
      if (r.tipo === "categoria") {
        escribir(page, r.texto, MARGEN + m.relleno, base(y, m.categoria, L.categoria), L.categoria, negrita, ACENTO);
        y -= m.categoria;
        continue;
      }
      const f = r.fila;
      const yf = base(y, m.fila, L.fila);
      escribir(page, f.codigo ?? "", x.codigo + m.relleno, yf, L.fila, normal, TEXTO);
      escribir(
        page,
        recortar(texto(f.nombre), normal, L.fila, ancho.producto - m.relleno * 2),
        x.producto + m.relleno, yf, L.fila, normal, TEXTO
      );
      escribir(page, f.presentacion ?? "", x.presentacion + m.relleno, yf, L.fila, normal, TEXTO);
      aLaDerecha(page, formatearImporteDeLista(f.costo), x.costo + ancho.costo - m.relleno, yf, L.fila, normal, TEXTO);
      aLaDerecha(page, formatearImporteDeLista(f.venta), x.venta + ancho.venta - m.relleno, yf, L.fila, normal, TEXTO);
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
