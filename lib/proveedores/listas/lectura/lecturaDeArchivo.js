// lib/proveedores/listas/lectura/lecturaDeArchivo.js
//
// LA ÚNICA PUERTA DE ENTRADA DE UN ARCHIVO DE LISTA.
//
// Recibe bytes y un nombre, y devuelve la tabla: títulos, filas y descartes con
// su motivo. Adentro elige por dónde leerlo —PDF, planilla o CSV— y afuera nadie
// se entera de cuál fue.
//
// ── POR QUÉ EL FORMATO NO SE DEDUCE SOLO DE LA EXTENSIÓN ────────────────────
//
// Porque la extensión la escribe una persona. Un PDF renombrado a .xlsx abre como
// planilla rota y devolvería una tabla vacía sin decir por qué; un .xls que en
// realidad es un CSV es de lo más común en las exportaciones viejas. Se mira
// primero la FIRMA de los bytes, que es lo que el archivo es, y la extensión
// queda como desempate para lo que no tiene firma —un CSV es texto y no tiene—.
//
// Módulo NO puro: carga `xlsx` y, a través de `textoDePdf`, `pdfjs-dist`. Todo lo
// que decide algo vive en los módulos puros de al lado.

import { paginasDePdf, MOTIVO_PDF, TEXTO_MOTIVO_PDF } from "./textoDePdf.js";
import { tablaDeFragmentos } from "./tablaDeArchivo.js";
import { tablaDeHoja, matrizDeCsv } from "./tablaDeHoja.js";

/** Los formatos que se saben leer. */
export const FORMATO = {
  PDF: "PDF",
  PLANILLA: "PLANILLA",
  CSV: "CSV",
};

/** Por qué un archivo no se pudo leer. */
export const MOTIVO_LECTURA_ARCHIVO = {
  FORMATO_DESCONOCIDO: "FORMATO_DESCONOCIDO",
  ARCHIVO_VACIO: "ARCHIVO_VACIO",
  SIN_TABLA: "SIN_TABLA",
  ...MOTIVO_PDF,
};

export const TEXTO_MOTIVO_LECTURA_ARCHIVO = {
  FORMATO_DESCONOCIDO:
    "No se reconoce el formato de este archivo. El sistema lee PDF con texto, Excel (.xlsx o .xls) y CSV.",
  ARCHIVO_VACIO: "El archivo está vacío.",
  SIN_TABLA:
    "El archivo se abrió pero no se encontró adentro una tabla de productos con precios. Revisá que sea la lista y no otra cosa.",
  ...TEXTO_MOTIVO_PDF,
};

/** Las firmas que identifican un archivo por lo que ES y no por cómo se llama. */
function formatoDeLosBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length < 4) return null;
  // "%PDF"
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return FORMATO.PDF;
  // "PK" — un .xlsx es un zip. También lo son .docx y .odt, y ésos los rechaza
  // `xlsx` con su propio error, que es mejor que adivinar acá.
  if (b[0] === 0x50 && b[1] === 0x4b) return FORMATO.PLANILLA;
  // El .xls viejo: documento compuesto de OLE2.
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return FORMATO.PLANILLA;
  return null;
}

/** La extensión, solo para lo que no tiene firma. */
function formatoDelNombre(nombre) {
  const n = String(nombre ?? "").toLowerCase();
  if (n.endsWith(".pdf")) return FORMATO.PDF;
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm")) return FORMATO.PLANILLA;
  if (n.endsWith(".csv") || n.endsWith(".txt")) return FORMATO.CSV;
  return null;
}

/**
 * ¿Estos bytes son texto plano?
 *
 * Un CSV no tiene firma, así que la única forma de distinguirlo de un binario es
 * mirarlo. Un byte nulo en el primer kilobyte no aparece en un archivo de texto y
 * aparece en cualquier binario.
 */
function pareceTexto(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const hasta = Math.min(b.length, 1024);
  for (let i = 0; i < hasta; i++) if (b[i] === 0) return false;
  return hasta > 0;
}

/**
 * La tabla de un archivo de lista.
 *
 * @param bytes   Uint8Array o Buffer
 * @param nombre  el nombre del archivo, solo como desempate
 * @param cargarXlsx / cargarPdfjs  inyectables, para poder probar sin los paquetes
 *
 * @returns { ok: true, formato, tabla, detalle } | { ok: false, motivo, formato }
 */
export async function leerArchivoDeLista(
  bytes,
  { nombre = "", cargarXlsx = cargarXlsxPorDefecto, cargarPdfjs, hoja: hojaPedida = null } = {}
) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length === 0) {
    return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.ARCHIVO_VACIO, formato: null };
  }

  const formato =
    formatoDeLosBytes(b) ?? formatoDelNombre(nombre) ?? (pareceTexto(b) ? FORMATO.CSV : null);
  if (!formato) {
    return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.FORMATO_DESCONOCIDO, formato: null };
  }

  if (formato === FORMATO.PDF) {
    const r = await paginasDePdf(b, cargarPdfjs ? { cargarPdfjs } : undefined);
    if (!r.ok) return { ok: false, motivo: r.motivo, formato };
    const tabla = tablaDeFragmentos(r.paginas);
    if (tabla.filas.length === 0) {
      return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.SIN_TABLA, formato };
    }
    return { ok: true, formato, tabla, detalle: { paginas: r.paginas.length } };
  }

  if (formato === FORMATO.CSV) {
    const texto = new TextDecoder("utf-8").decode(b);
    const tabla = tablaDeHoja(matrizDeCsv(texto));
    if (tabla.filas.length === 0) {
      return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.SIN_TABLA, formato };
    }
    return { ok: true, formato, tabla, detalle: {} };
  }

  // ── PLANILLA ────────────────────────────────────────────────────────────
  //
  // LA HOJA CON MÁS FILAS, y no la primera. Las exportaciones traen hojas de
  // parámetros, de leyendas y hojas vacías que quedaron del template, y la lista
  // no siempre está primera. Cuál se eligió se informa: si se eligió mal, el
  // usuario tiene que poder verlo y pedir otra.
  let XLSX;
  try {
    XLSX = await cargarXlsx();
  } catch {
    return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.FORMATO_DESCONOCIDO, formato };
  }

  let libro;
  try {
    libro = XLSX.read(b, { type: "array", cellDates: true });
  } catch {
    return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.FORMATO_DESCONOCIDO, formato };
  }

  const nombres = libro?.SheetNames ?? [];
  if (nombres.length === 0) {
    return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.SIN_TABLA, formato };
  }

  const candidatas = hojaPedida && nombres.includes(hojaPedida) ? [hojaPedida] : nombres;
  let elegida = null;
  let mejor = null;
  for (const n of candidatas) {
    const matriz = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: false, defval: "" });
    const tabla = tablaDeHoja(matriz);
    if (!mejor || tabla.filas.length > mejor.filas.length) {
      mejor = tabla;
      elegida = n;
    }
  }
  if (!mejor || mejor.filas.length === 0) {
    return { ok: false, motivo: MOTIVO_LECTURA_ARCHIVO.SIN_TABLA, formato };
  }

  return { ok: true, formato, tabla: mejor, detalle: { hoja: elegida, hojas: nombres } };
}

async function cargarXlsxPorDefecto() {
  // Namespace import y NO default: el build ESM de `xlsx` no exporta default y
  // Turbopack falla al compilar la ruta. Es la forma que ya usa el resto del ERP.
  return import("xlsx");
}
