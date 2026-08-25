import * as XLSX from "xlsx";
import { extraerFilasExcel } from "./excelFilas.js";

const LIMITE_BYTES = 15 * 1024 * 1024;
const MAX_LINEAS = 500;
const MIMES_VISUALES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const MIMES_EXCEL = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const BASE_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELO_DEFAULT = "gemini-3.6-flash";

export async function leerArchivoDePedido({ archivo, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!archivo || typeof archivo.arrayBuffer !== "function") {
    return fallo("ARCHIVO_REQUERIDO", "Elegí una foto, un PDF o un Excel.");
  }
  if (Number(archivo.size) > LIMITE_BYTES) {
    return fallo("ARCHIVO_GRANDE", "El archivo supera el máximo de 15 MB.");
  }
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (!bytes.length) return fallo("ARCHIVO_VACIO", "El archivo está vacío.");
  if (bytes.length > LIMITE_BYTES) {
    return fallo("ARCHIVO_GRANDE", "El archivo supera el máximo de 15 MB.");
  }

  const nombre = String(archivo.name || "archivo");
  const mime = String(archivo.type || "").toLowerCase();
  const extension = nombre.toLowerCase().split(".").pop();
  if (MIMES_EXCEL.has(mime) || ["xlsx", "xls"].includes(extension)) {
    return leerExcel(bytes);
  }
  if (MIMES_VISUALES.has(mime) || ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"].includes(extension)) {
    const mimeSeguro = mime || mimePorExtension(extension);
    return leerVisual({ bytes, mime: mimeSeguro, env, fetchImpl });
  }
  return fallo("ARCHIVO_NO_SOPORTADO", "El formato no es compatible. Usá foto, PDF, XLSX o XLS.");
}

export function leerExcel(bytes) {
  let workbook;
  try {
    workbook = XLSX.read(bytes, { type: "buffer", cellDates: false, cellFormula: false });
  } catch {
    return fallo("EXCEL_ILEGIBLE", "No se pudo abrir el Excel. Probá guardarlo nuevamente como XLSX.");
  }

  for (const nombreHoja of workbook.SheetNames || []) {
    const filas = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    const encontrada = extraerFilasExcel(filas);
    if (encontrada.ok) return encontrada;
  }
  return fallo(
    "COLUMNAS_NO_ENCONTRADAS",
    "No encontré columnas de cantidad y producto. El Excel debe tener encabezados como Artículo/Código, Cantidad y Descripción."
  );
}

async function leerVisual({ bytes, mime, env, fetchImpl }) {
  if (!env.GEMINI_API_KEY) {
    return fallo("LECTOR_NO_CONFIGURADO", "La lectura de fotos y PDF no está configurada. Excel sí puede importarse.");
  }
  const modelo = env.GEMINI_MODELO || MODELO_DEFAULT;
  const cuerpo = {
    contents: [{
      role: "user",
      parts: [
        { text: instruccionesVisuales() },
        { inline_data: { mime_type: mime, data: bytes.toString("base64") } },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: esquemaVisual(),
      temperature: 0,
    },
  };

  let respuesta;
  try {
    respuesta = await fetchImpl(`${BASE_GEMINI}/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    return fallo(
      error?.name === "TimeoutError" ? "LECTURA_LENTA" : "LECTOR_CAIDO",
      error?.name === "TimeoutError"
        ? "La lectura tardó demasiado. Probá con una imagen más nítida o un PDF."
        : "No se pudo contactar al lector. Probá nuevamente."
    );
  }
  if (respuesta.status === 429) return fallo("CUOTA_AGOTADA", "El lector alcanzó su límite temporal. Probá más tarde.");
  if (!respuesta.ok) return fallo("LECTOR_CAIDO", "El lector no pudo procesar el archivo.");

  try {
    const json = await respuesta.json();
    const crudo = JSON.parse(json?.candidates?.[0]?.content?.parts?.[0]?.text || "");
    const lineas = (Array.isArray(crudo.lineas) ? crudo.lineas : [])
      .slice(0, MAX_LINEAS)
      .map((l, i) => ({
        filaOrigen: i + 1,
        codigo: texto(l.codigo) || null,
        descripcion: texto(l.descripcion) || "Sin descripción",
        cantidad: numero(l.cantidad),
        unidad: texto(l.unidad).toUpperCase() || null,
        precioUnitario: numero(l.precioUnitario),
      }))
      .filter((l) => l.codigo || l.descripcion !== "Sin descripción");
    if (!lineas.length) return fallo("SIN_LINEAS", "No encontré líneas de productos en el archivo.");
    return {
      ok: true,
      documento: {
        numeroPedido: texto(crudo.numeroPedido) || null,
        fecha: texto(crudo.fecha) || null,
        lineas,
      },
    };
  } catch {
    return fallo("RESPUESTA_ILEGIBLE", "El lector respondió con datos incompletos. Probá con otra imagen.");
  }
}

function instruccionesVisuales() {
  return `Transcribí este documento de pedido a proveedor. Puede estar rotado o fotografiado en perspectiva: orientalo antes de leer. Extraé solamente las líneas de productos. No incluyas subtotal, impuestos, descuentos, IVA, percepciones ni total. Conservá el código de artículo, la descripción, la cantidad y la unidad exactamente como se ven. La unidad puede ser UN, BU, DI, KG u otra: no la traduzcas ni inventes equivalencias. Si un dato no se ve, devolvé null; nunca lo completes por contexto. El precio unitario es solo informativo.`;
}

function esquemaVisual() {
  return {
    type: "OBJECT",
    properties: {
      numeroPedido: { type: "STRING", nullable: true },
      fecha: { type: "STRING", nullable: true },
      lineas: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            codigo: { type: "STRING", nullable: true },
            descripcion: { type: "STRING", nullable: true },
            cantidad: { type: "NUMBER", nullable: true },
            unidad: { type: "STRING", nullable: true },
            precioUnitario: { type: "NUMBER", nullable: true },
          },
          required: ["codigo", "descripcion", "cantidad", "unidad", "precioUnitario"],
        },
      },
    },
    required: ["numeroPedido", "fecha", "lineas"],
  };
}

function texto(valor) {
  if (valor === null || valor === undefined || typeof valor === "boolean") return "";
  return String(valor).trim();
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  return Number.isFinite(n) ? n : null;
}

function mimePorExtension(extension) {
  return extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "heic" ? "image/heic" : extension === "heif" ? "image/heif" : "image/jpeg";
}

function fallo(codigo, error) {
  return { ok: false, codigo, error };
}
