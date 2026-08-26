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

// ── EL PRESUPUESTO DE TIEMPO, Y POR QUÉ NO ES UN REINTENTO CIEGO ───────────
//
// Delante de la aplicación hay un nginx SIN `proxy_read_timeout` declarado, así
// que rige el default: 60 segundos. Si la ruta tarda más, nginx corta y devuelve
// una página HTML — que el navegador no puede parsear como JSON y termina en el
// mensaje genérico de conexión. O sea: pasarse del minuto convierte un error
// legible en uno mudo.
//
// Cuánto tarda una lectura, medido: el único intento exitoso del 2026-08-25
// duró COMO MUCHO 26 segundos. Es una cota superior y no un promedio —el log de
// nginx usa el formato `combined`, que no registra `request_time`, así que lo
// único disponible es el hueco entre finales consecutivos—. Dos lecturas de ese
// orden son ~52 s contra un corte de 60: el margen no alcanza para prometer dos
// intentos siempre.
//
// Por eso el segundo intento se PIDE PERMISO al reloj: solo sale si lo que queda
// del presupuesto alcanza para que tenga sentido. Si el primero se comió el
// tiempo, se devuelve su error específico en vez de arriesgar el corte.
const PRESUPUESTO_TOTAL_MS = 50_000;
const TIMEOUT_LECTURA_MS = 45_000;
const MINIMO_PARA_REINTENTO_MS = 12_000;

// Los ÚNICOS dos códigos que se reintentan: los que significan "el lector
// contestó, pero no sirvió". Todo lo demás —clave ausente, cuota, archivo
// inválido, formato, permisos, corte— tiene una causa que un segundo intento no
// cambia, y reintentarlos solo gasta el presupuesto y la cuota.
const REINTENTABLES = new Set(["SIN_LINEAS", "RESPUESTA_ILEGIBLE"]);

export async function leerArchivoDePedido({
  archivo,
  env = process.env,
  fetchImpl = globalThis.fetch,
  // El reloj se inyecta para que los candados puedan ejercer el presupuesto sin
  // esperar cincuenta segundos de verdad.
  ahora = Date.now,
  // La señal se inyecta por el mismo motivo que el reloj: para que un candado
  // pueda registrar CUÁNTOS milisegundos se pidieron. El default es el de
  // producción y no cambia nada en el servidor.
  crearSenal = (ms) => AbortSignal.timeout(ms),
} = {}) {
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
    return leerVisual({ bytes, mime: mimeSeguro, env, fetchImpl, ahora, crearSenal });
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

/**
 * Lectura visual con COMO MUCHO dos intentos.
 *
 * El segundo solo existe para los códigos de `REINTENTABLES` y solo si el reloj
 * lo permite. La instrucción del segundo NO es la misma con otras palabras: es
 * una lista de pasos que ataca los tres motivos por los que una foto de un
 * remito vuelve vacía —la hoja está al revés, la tabla no tiene bordes, o el
 * modelo se quedó con el encabezado y no bajó a los renglones—.
 *
 * @param {() => number} [ahora] reloj inyectable, para que los candados puedan
 *   ejercer el presupuesto sin esperar segundos de verdad.
 */
async function leerVisual({ bytes, mime, env, fetchImpl, ahora = Date.now, crearSenal }) {
  if (!env.GEMINI_API_KEY) {
    return fallo("LECTOR_NO_CONFIGURADO", "La lectura de fotos y PDF no está configurada. Excel sí puede importarse.");
  }
  const arranque = ahora();
  const restante = () => PRESUPUESTO_TOTAL_MS - (ahora() - arranque);

  const primero = await unaLectura({
    bytes, mime, env, fetchImpl, crearSenal,
    instrucciones: instruccionesVisuales(),
    timeoutMs: Math.min(TIMEOUT_LECTURA_MS, restante()),
  });
  if (primero.ok) return primero;
  if (!REINTENTABLES.has(primero.codigo)) return primero;
  if (restante() < MINIMO_PARA_REINTENTO_MS) return primero;

  const segundo = await unaLectura({
    bytes, mime, env, fetchImpl, crearSenal,
    instrucciones: instruccionesInsistentes(),
    timeoutMs: Math.min(TIMEOUT_LECTURA_MS, restante()),
  });
  // Si el segundo tampoco encontró nada, el que se informa es el segundo: es el
  // último estado real. Y si el segundo falló por OTRA cosa —se cayó la red en el
  // medio— también gana, porque describe lo que pasó recién.
  return segundo;
}

async function unaLectura({ bytes, mime, env, fetchImpl, instrucciones, timeoutMs, crearSenal }) {
  const modelo = env.GEMINI_MODELO || MODELO_DEFAULT;
  // El milisegundaje se calcula UNA vez y se le pasa a la señal. Antes esto era
  // una expresión escrita dentro del `signal:`, y por eso un candado no podía
  // ver cuánto se pedía: solo podía mirar si el `fetch` salía o no. Con los dos
  // intentos clavados en 45 s las once pruebas seguían en verde.
  const msDeEstaLectura = Math.max(1_000, Number(timeoutMs) || TIMEOUT_LECTURA_MS);
  const cuerpo = {
    contents: [{
      role: "user",
      parts: [
        { text: instrucciones },
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
      signal: crearSenal(msDeEstaLectura),
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

/**
 * La instrucción del SEGUNDO intento.
 *
 * No es la primera con otras palabras: es una secuencia de pasos que ataca los
 * tres motivos por los que una foto de un remito vuelve sin renglones —la hoja
 * está girada o invertida, la tabla no tiene bordes y el modelo no la reconoce
 * como tabla, o se queda en el encabezado y no baja al cuerpo—.
 *
 * Lo que NO cambia es la regla de negocio: sigue prohibido inventar un dato que
 * no se ve, y sigue excluyendo los totales. Un segundo intento más insistente no
 * puede ser un permiso para completar por contexto.
 */
function instruccionesInsistentes() {
  return [
    "Este documento es un pedido a proveedor fotografiado. El intento anterior no encontró ninguna línea de producto, así que hacelo por pasos y no te rindas.",
    "PASO 1. Mirá la orientación. La hoja puede estar boca abajo, girada 90 o 180 grados, o fotografiada en perspectiva desde un costado. Determiná hacia dónde va el texto y orientá la imagen mentalmente ANTES de leer nada.",
    "PASO 2. Encontrá la tabla. Puede no tener bordes ni líneas, tener poco contraste, estar impresa en matriz de puntos o escrita a mano. Una tabla es cualquier zona donde los mismos tipos de dato se repiten alineados renglón tras renglón. Si no ves bordes, guiate por la alineación de las columnas.",
    "PASO 3. Recorré TODOS los renglones del cuerpo, de arriba abajo, incluido el primero y el último. No te quedes en el encabezado.",
    "PASO 4. De cada renglón sacá: código de artículo, cantidad, unidad, descripción y precio unitario si está.",
    "REGLAS QUE NO CAMBIAN. Excluí subtotal, IVA, impuestos, percepciones, descuentos y total: no son líneas de producto. Copiá la unidad tal como aparece (UN, BU, DI, KG u otra) sin traducirla ni convertirla. Si un dato no se ve, devolvé null: no lo completes por contexto ni lo deduzcas de los otros renglones.",
    "Si después de los cuatro pasos seguís sin ver ningún renglón de producto, devolvé la lista vacía.",
  ].join("\n");
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
