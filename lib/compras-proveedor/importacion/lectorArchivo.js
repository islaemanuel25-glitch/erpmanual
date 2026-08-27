import * as XLSX from "xlsx";
import { MOTIVO_IA, pedirJson } from "@/lib/ia/salidaEstructurada";
import { ORIGEN_CRUDO, crudoDesdeFilas } from "./documentoCrudo.js";
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
// La URL base y el nombre del modelo YA NO ESTÁN ACÁ: eran una segunda copia de
// lo que ya decía `comprobante/lector/gemini.js`, donde además está MEDIDO cuáles
// siguen vigentes y cuáles dio de baja Google. Ahora los dos salen del mismo
// lugar, `lib/ia/salidaEstructurada.js`. Un default escrito dos veces no se rompe
// el día que se escribe: se rompe el día que uno de los dos cambia.

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

/**
 * ── LA LLAMADA AL MODELO SE MUDÓ, NO SE COPIÓ ─────────────────────────────
 *
 * Este archivo tenía su propia copia del `fetch` a Gemini: la misma URL base, el
 * mismo encabezado de clave, la misma forma de `generationConfig` y el nombre
 * del modelo escrito una segunda vez. La copia buena vive en
 * `lib/ia/salidaEstructurada.js`, y ahora las dos salen de ahí.
 *
 * Apareció al ir a agregar la lectura conversacional de recetas: escribir un
 * TERCER llamador habría hecho que el día que Google cambie algo —ya pasó dos
 * veces— hubiera que acordarse de tres lugares.
 *
 * Lo que NO cambió es el vocabulario de errores de este archivo. Sus códigos
 * —LECTURA_LENTA, LECTOR_CAIDO— los mira la pantalla y los afirman once
 * candados, así que el motivo genérico se traduce acá en vez de propagarse.
 */
const CODIGO_POR_MOTIVO = Object.freeze({
  [MOTIVO_IA.TARDO_DEMASIADO]: ["LECTURA_LENTA", "La lectura tardó demasiado. Probá con una imagen más nítida o un PDF."],
  [MOTIVO_IA.CUOTA_AGOTADA]: ["CUOTA_AGOTADA", "El lector alcanzó su límite temporal. Probá más tarde."],
  [MOTIVO_IA.RESPUESTA_ILEGIBLE]: ["RESPUESTA_ILEGIBLE", "El lector respondió con datos incompletos. Probá con otra imagen."],
  [MOTIVO_IA.NO_CONFIGURADO]: ["LECTOR_NO_CONFIGURADO", "La lectura de fotos y PDF no está configurada. Excel sí puede importarse."],
  [MOTIVO_IA.SERVICIO_CAIDO]: ["LECTOR_CAIDO", "No se pudo contactar al lector. Probá nuevamente."],
});

async function unaLectura({ bytes, mime, env, fetchImpl, instrucciones, timeoutMs, crearSenal }) {
  // El milisegundaje se calcula UNA vez y se le pasa a la señal. Antes esto era
  // una expresión escrita dentro del `signal:`, y por eso un candado no podía
  // ver cuánto se pedía: solo podía mirar si el `fetch` salía o no. Con los dos
  // intentos clavados en 45 s las once pruebas seguían en verde.
  const msDeEstaLectura = Math.max(1_000, Number(timeoutMs) || TIMEOUT_LECTURA_MS);

  const respuesta = await pedirJson({
    instrucciones,
    esquema: esquemaVisual(),
    adjuntos: [{ mime, bytes }],
    timeoutMs: msDeEstaLectura,
    env,
    fetchImpl,
    crearSenal,
  });
  if (!respuesta.ok) {
    const [codigo, texto] = CODIGO_POR_MOTIVO[respuesta.motivo] ?? CODIGO_POR_MOTIVO[MOTIVO_IA.SERVICIO_CAIDO];
    return fallo(codigo, texto);
  }

  try {
    const crudo = respuesta.datos;
    const lineas = (Array.isArray(crudo.lineas) ? crudo.lineas : [])
      .slice(0, MAX_LINEAS)
      .map((l, i) => ({
        filaOrigen: i + 1,
        codigo: texto(l.codigo) || null,
        descripcion: texto(l.descripcion) || "Sin descripción",
        cantidad: numero(l.cantidad),
        unidad: texto(l.unidad).toUpperCase() || null,
        precioUnitario: numero(l.precioUnitario),
        bonificacionPct: numero(l.bonificacionPct),
        subtotal: numero(l.subtotal),
      }))
      .filter((l) => l.codigo || l.descripcion !== "Sin descripción");
    if (!lineas.length) return fallo("SIN_LINEAS", "No encontré líneas de productos en el archivo.");
    return {
      ok: true,
      documento: {
        numeroPedido: texto(crudo.numeroPedido) || null,
        fecha: texto(crudo.fecha) || null,
        // Las tres respuestas que NO se pueden calcular con los otros datos, y
        // que por eso se preguntan aparte. Ver `esquemaVisual`.
        //
        // `booleano` devuelve null cuando el lector no contestó, y eso NO es lo
        // mismo que "no". Un false por omisión haría que toda columna de
        // subtotal se descartara en silencio y el arreglo entero no correría
        // nunca; un true por omisión traería de vuelta el número inventado. La
        // ausencia se propaga y quien decide es `prepararLineas`.
        hayColumnaSubtotal: booleano(crudo.hayColumnaSubtotal),
        hayColumnaBonificacion: booleano(crudo.hayColumnaBonificacion),
        hayTotalImpreso: booleano(crudo.hayTotalImpreso),
        totalDocumento: numero(crudo.totalDocumento),
        // La tabla transcripta, para que una receta pueda reinterpretarla sin
        // volver a leer el archivo. Si el modelo no la devolvió queda `null`, y
        // entonces la receta solo puede aportar escalas y no remapear columnas
        // — la pantalla lo dice en vez de fingir que puede.
        crudo: crudoVisual(crudo.tabla),
        lineas,
      },
    };
  } catch {
    return fallo("RESPUESTA_ILEGIBLE", "El lector respondió con datos incompletos. Probá con otra imagen.");
  }
}

/**
 * LO QUE SE LE PIDE ADEMÁS: LA TABLA COMO ESTÁ.
 *
 * Va en los DOS intentos, con el mismo texto, porque es el mismo pedido. Está en
 * una constante y no copiado dos veces por el motivo de siempre: dos textos que
 * dicen lo mismo no se rompen el día que se escriben, se rompen el día que
 * alguien corrige uno.
 *
 * Es transcripción y no interpretación, y el texto insiste en eso: TODOS los
 * renglones, incluidos los que tienen celdas vacías. Un renglón sin cantidad
 * puede significar "no se envió", y esa es justamente la clase de cosa que la
 * receta viene a explicar — pero solo puede explicarla si el renglón está.
 */
const TRANSCRIPCION_DE_LA_TABLA = [
  "ADEMÁS, transcribí la tabla tal como está, en el campo `tabla`. Esto es transcripción, no interpretación:",
  "- `encabezados`: el texto de cada encabezado de columna, en su orden de izquierda a derecha, tal como está impreso.",
  "- `filas`: una entrada por CADA renglón del cuerpo, con sus celdas en el mismo orden que los encabezados.",
  "Incluí TODOS los renglones del cuerpo, también los que tienen celdas vacías: una celda vacía es un dato y se transcribe como cadena vacía. No saltees renglones por parecer incompletos, no reordenes columnas y no decidas qué columna es cuál. Los renglones de pie —subtotal, IVA, total— no van en `filas`.",
].join("\n");

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
    "PASO 4. De cada renglón sacá: código de artículo, cantidad, unidad, descripción, precio unitario, porcentaje de bonificación o descuento, e importe del renglón.",
    "PASO 5. Mirá el ENCABEZADO de la tabla y contestá si existen la columna de importe por renglón (subtotal, importe, total del renglón) y la columna de bonificación o descuento. Contestá por lo que ves escrito en el encabezado, no por lo que se pueda calcular.",
    "REGLAS QUE NO CAMBIAN. Los renglones de pie —subtotal general, IVA, impuestos, percepciones y total— no son líneas de producto y no van en la lista; el total general va aparte, en su propio campo. Copiá la unidad tal como aparece (UN, BU, DI, KG u otra) sin traducirla ni convertirla. Si un dato no se ve, devolvé null: no lo completes por contexto ni lo deduzcas de los otros renglones.",
    "NO CALCULES NADA. El importe del renglón se copia del papel; si esa columna no está impresa, devolvé null y no lo multipliques. Lo mismo con el total general y con la bonificación.",
    "Si después de los pasos seguís sin ver ningún renglón de producto, devolvé la lista vacía.",
    TRANSCRIPCION_DE_LA_TABLA,
  ].join("\n");
}

/**
 * La instrucción del PRIMER intento.
 *
 * Antes decía "no incluyas subtotal ni descuentos" y "el precio unitario es solo
 * informativo". Las dos cosas eran falsas desde que el importador calcula el
 * costo efectivo: en una factura con bonificación, la columna de precio es la de
 * LISTA y lo que se paga sale del importe del renglón. Pedirle al lector que
 * descarte justo esos dos campos garantizaba que el ERP se quedara con el precio
 * equivocado.
 *
 * Lo que sí se sigue excluyendo son los RENGLONES DE PIE —subtotal general, IVA,
 * total—, que nunca fueron líneas de producto. Es otra cosa y conviene que el
 * texto lo separe, porque juntarlas es lo que produjo el defecto.
 */
function instruccionesVisuales() {
  return [
    "Transcribí este documento de pedido a proveedor. Puede estar rotado o fotografiado en perspectiva: orientalo antes de leer.",
    "De cada RENGLÓN DE PRODUCTO sacá: código de artículo, descripción, cantidad, unidad, precio unitario de lista, porcentaje de bonificación o descuento del renglón, e importe del renglón (subtotal, importe o total de la línea).",
    "Los renglones de PIE del documento —subtotal general, IVA, impuestos, percepciones, total— no son líneas de producto: no los pongas en la lista. El total general va aparte, en su propio campo.",
    "Mirá el encabezado de la tabla y contestá si existe una columna de importe por renglón y si existe una columna de bonificación o descuento. Contestá por lo que está escrito en el encabezado.",
    "NO CALCULES NADA. Todo número se copia del papel. Si el importe del renglón no está impreso, devolvé null y no lo obtengas multiplicando cantidad por precio. Lo mismo con el total general y con la bonificación.",
    "Conservá el código y la descripción exactamente como se ven. La unidad puede ser UN, BU, DI, KG u otra: no la traduzcas ni inventes equivalencias.",
    "Si un dato no se ve, devolvé null; nunca lo completes por contexto ni lo deduzcas de los otros renglones.",
    TRANSCRIPCION_DE_LA_TABLA,
  ].join("\n");
}

/**
 * El esquema de la salida estructurada.
 *
 * ── QUÉ ES OBLIGATORIO Y QUÉ NO, Y POR QUÉ IMPORTA TANTO ──────────────────
 *
 * Un campo obligatorio en una salida estructurada es una orden de inventar. El
 * módulo de comprobante ya lo pagó caro: `total` era obligatorio, un remito no
 * trae total, y el modelo lo llenaba con la suma de las líneas — la misma suma
 * contra la que después se lo verificaba. La verificación comparaba la suma
 * contra sí misma y cerraba siempre.
 *
 * Acá el campo con esa forma es `subtotal`: sale de `cantidad × precio`. Si se
 * lo pide obligatorio, en una factura CON bonificación y SIN columna de subtotal
 * el modelo devolvería `cantidad × precio` —sin la bonificación— y
 * `subtotal ÷ cantidad` daría exactamente el precio de lista. O sea el defecto
 * que todo esto viene a arreglar, de vuelta y disfrazado de arreglo.
 *
 * Por eso `subtotal` y `bonificacionPct` van NULLABLE Y NO OBLIGATORIOS, y lo
 * que sí es obligatorio es una pregunta que no se puede contestar calculando:
 * si la TABLA tiene esas columnas. Un sí o un no sobre la estructura del papel
 * no se deriva de ningún número del papel.
 *
 * Los cuatro campos de identidad siguen obligatorios porque no se derivan de
 * nada: en el módulo de comprobante volvieron en `null` las cinco veces que se
 * midió, que es exactamente lo que tenían que hacer.
 */
function esquemaVisual() {
  return {
    type: "OBJECT",
    properties: {
      numeroPedido: { type: "STRING", nullable: true },
      fecha: { type: "STRING", nullable: true },
      // Observaciones sobre la ESTRUCTURA del papel. Obligatorias a propósito:
      // no hay forma de calcularlas a partir de los renglones.
      hayColumnaSubtotal: { type: "BOOLEAN" },
      hayColumnaBonificacion: { type: "BOOLEAN" },
      hayTotalImpreso: { type: "BOOLEAN" },
      // El número del total va nullable Y no obligatorio, por lo mismo que el
      // subtotal: es la suma de los renglones. Quien manda es el booleano.
      totalDocumento: { type: "NUMBER", nullable: true },
      // ── LA TABLA COMO ESTÁ, ADEMÁS DE LA INTERPRETADA ──────────────────
      //
      // Es TRANSCRIPCIÓN, no interpretación: los encabezados tal como están
      // impresos y las celdas de cada renglón en su orden, sin decidir qué
      // columna es cuál y sin saltear ninguna fila.
      //
      // Sin esto, "reanalizar con otra receta" no puede funcionar: si la
      // interpretación de arriba tomó una columna por otra, o dejó afuera un
      // renglón sin cantidad, esa información no está en ningún lado y ninguna
      // explicación posterior la puede recuperar.
      //
      // Cuesta tokens de salida y vale la pena: es la diferencia entre una
      // receta que reinterpreta y una que solo se guarda.
      tabla: {
        type: "OBJECT",
        properties: {
          encabezados: { type: "ARRAY", items: { type: "STRING" } },
          filas: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { celdas: { type: "ARRAY", items: { type: "STRING" } } },
            },
          },
        },
      },
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
            bonificacionPct: { type: "NUMBER", nullable: true },
            subtotal: { type: "NUMBER", nullable: true },
          },
          required: ["codigo", "descripcion", "cantidad", "unidad", "precioUnitario"],
        },
      },
    },
    required: ["numeroPedido", "fecha", "hayColumnaSubtotal", "hayColumnaBonificacion", "hayTotalImpreso", "lineas"],
  };
}

/**
 * La tabla transcripta, llevada a la forma del documento crudo.
 *
 * Devuelve `null` cuando el modelo no la trajo o vino vacía. `null` y no una
 * tabla vacía: "no hay transcripción" y "la tabla no tiene filas" llevan a
 * mensajes distintos en la pantalla, y una tabla vacía haría que reinterpretar
 * devolviera cero líneas sin decir por qué.
 */
function crudoVisual(tabla) {
  const filas = Array.isArray(tabla?.filas) ? tabla.filas : [];
  if (!filas.length) return null;
  return crudoDesdeFilas({
    origen: ORIGEN_CRUDO.VISUAL,
    // `crudoDesdeFilas` espera el encabezado como primera fila y el cuerpo
    // detrás, que es la forma en que llega un Excel. Acá vienen separados, así
    // que se los vuelve a juntar en vez de escribir una segunda función que
    // arme lo mismo de otra manera.
    filas: [Array.isArray(tabla?.encabezados) ? tabla.encabezados : [], ...filas.map((f) => (Array.isArray(f?.celdas) ? f.celdas : []))],
    filaEncabezado: 0,
  });
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

/**
 * Un booleano del lector, o `null` si no contestó.
 *
 * No se usa `Boolean(v)`: convertiría "no contestó" en `false`, y esas dos cosas
 * llevan a decisiones opuestas. `false` significa "miré el encabezado y esa
 * columna no está", que ordena descartar los subtotales que hayan venido;
 * `null` significa "no sé", y quien decide qué hacer con un "no sé" es la capa
 * de arriba, con la regla escrita a la vista. Es la misma trampa que en el
 * módulo de comprobante hizo falta separar para `hayTotalImpreso`.
 */
function booleano(valor) {
  return typeof valor === "boolean" ? valor : null;
}

function mimePorExtension(extension) {
  return extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "heic" ? "image/heic" : extension === "heif" ? "image/heif" : "image/jpeg";
}

function fallo(codigo, error) {
  return { ok: false, codigo, error };
}
