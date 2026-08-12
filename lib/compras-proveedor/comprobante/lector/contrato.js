// lib/compras-proveedor/comprobante/lector/contrato.js
//
// QUÉ ES UN LECTOR DE COMPROBANTES, Y POR QUÉ SE PUEDE CAMBIAR SIN TOCAR ESTO.
//
// ── EL MOTIVO, QUE NO ES ARQUITECTÓNICO SINO HISTÓRICO ─────────────────────
//
// En abril de 2026 Google cambió las condiciones del nivel gratuito de AI Studio
// y sacó los modelos Pro. Lo que hoy sale cero puede dejar de estar mañana, o
// cambiar de nombre, o de límite. Un módulo con el proveedor cableado adentro se
// arregla, ese día, tocando el código que decide qué costos entran al ERP — con
// apuro y sin margen para verificar.
//
// Por eso el proveedor se elige POR CONFIGURACIÓN. Cambiar de Gemini a otro es
// cambiar una variable de entorno y tener una implementación registrada; no se
// toca ni la verificación aritmética, ni la puerta, ni la ruta.
//
// ── EL CONTRATO ────────────────────────────────────────────────────────────
//
// Un lector es un objeto con:
//   - `nombre`      — string estable, el que se guarda en `modeloLectura`.
//   - `disponible()` — si está configurado para usarse (clave presente, etc.).
//   - `leer({ archivo, receta, pistas })` → Promise<LecturaCruda>
//
// `LecturaCruda` es SIEMPRE la misma forma, venga de donde venga:
//
//   {
//     identidad: { tipo, puntoVenta, numero, fecha, cuit },
//     lineas: [{ descripcion, codigoProveedor, cantidad, netoUnitario,
//                subtotalImpreso, internoUnitario }],
//     pie: { neto, iva, interno, percepciones: [{nombre, importe}], total },
//     consumo: { tokensEntrada, tokensSalida, costoMicroUsd },
//     modelo: "gemini-2.5-flash"
//   }
//
// NUNCA texto libre. La salida estructurada no es una preferencia de estilo: un
// texto que después hay que interpretar mueve el problema de lugar, y el
// intérprete sería otro lugar donde inventar un número.
//
// ── LO QUE UN LECTOR NO PUEDE HACER ────────────────────────────────────────
//
// Un lector NO decide si lo que leyó está bien. Devuelve lo que leyó y nada
// más. Quien decide es `puerta.js`, con la verificación aritmética, y es
// deliberado: si el lector pudiera declararse correcto, la confianza en el
// número vendría del mismo lugar que el número.

/** Los códigos por los que una lectura puede no producirse. */
export const MOTIVO_LECTURA = Object.freeze({
  SIN_LECTOR: "SIN_LECTOR",
  NO_CONFIGURADO: "NO_CONFIGURADO",
  SERVICIO_CAIDO: "SERVICIO_CAIDO",
  CUOTA_AGOTADA: "CUOTA_AGOTADA",
  RESPUESTA_ILEGIBLE: "RESPUESTA_ILEGIBLE",
  ARCHIVO_NO_SOPORTADO: "ARCHIVO_NO_SOPORTADO",
  TARDO_DEMASIADO: "TARDO_DEMASIADO",
});

export const QUE_HACER_LECTURA = Object.freeze({
  [MOTIVO_LECTURA.SIN_LECTOR]:
    "No hay ningún lector configurado. El comprobante quedó subido y se puede leer " +
    "cuando se configure: no se perdió nada.",
  [MOTIVO_LECTURA.NO_CONFIGURADO]:
    "Falta la clave del servicio de lectura. El comprobante quedó subido; avisá para " +
    "que la carguen.",
  [MOTIVO_LECTURA.SERVICIO_CAIDO]:
    "El servicio de lectura no respondió. El comprobante quedó subido: probá leerlo de " +
    "nuevo en un rato.",
  [MOTIVO_LECTURA.CUOTA_AGOTADA]:
    "Se agotó la cuota gratuita del día. El comprobante quedó subido y se puede leer " +
    "mañana, o cargarlo a mano.",
  [MOTIVO_LECTURA.RESPUESTA_ILEGIBLE]:
    "La lectura volvió en un formato que no se entiende. Probá de nuevo; si sigue, " +
    "cargalo a mano.",
  [MOTIVO_LECTURA.TARDO_DEMASIADO]:
    "La lectura tardó más de 45 segundos y se cortó. El comprobante quedó subido: probá " +
    "leerlo de nuevo, o subí una foto más liviana si es muy grande.",
  [MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO]:
    "Este tipo de archivo no lo puede leer el lector configurado. Cargalo a mano o " +
    "subí una foto del comprobante.",
});

export function queHacerLectura(motivo) {
  return (
    QUE_HACER_LECTURA[motivo] ||
    "No se pudo leer el comprobante. Quedó subido: probá de nuevo o cargalo a mano."
  );
}

// ── EL REGISTRO ────────────────────────────────────────────────────────────
//
// Un Map de nombre → fábrica. Registrar es la única forma de agregar un
// proveedor, y `elegirLector` es la única forma de obtener uno: así no hay
// ningún lugar donde alguien pueda instanciar uno a mano y saltearse la
// configuración.

const REGISTRO = new Map();

/** Registra una implementación. La fábrica se llama una vez, al elegir. */
export function registrarLector(nombre, fabrica) {
  if (!nombre || typeof fabrica !== "function") {
    throw new Error("registrarLector: hace falta un nombre y una fábrica.");
  }
  REGISTRO.set(String(nombre), fabrica);
}

/** Los nombres registrados, para poder decir cuáles hay cuando uno no existe. */
export function lectoresRegistrados() {
  return [...REGISTRO.keys()].sort();
}

/**
 * El lector que corresponde según la CONFIGURACIÓN.
 *
 * El nombre sale de `COMPROBANTE_LECTOR`. No hay default cableado a un
 * proveedor: sin configuración no hay lector, y el comprobante queda subido sin
 * leer. Un default silencioso a Gemini haría que el día que cambien las
 * condiciones —otra vez— el módulo siguiera llamando al proveedor viejo sin que
 * nadie lo hubiera elegido.
 */
export function elegirLector({ nombre = process.env.COMPROBANTE_LECTOR, env = process.env } = {}) {
  const n = String(nombre ?? "").trim();
  if (!n) {
    return {
      ok: false,
      motivo: MOTIVO_LECTURA.SIN_LECTOR,
      queHacer: queHacerLectura(MOTIVO_LECTURA.SIN_LECTOR),
      registrados: lectoresRegistrados(),
    };
  }
  const fabrica = REGISTRO.get(n);
  if (!fabrica) {
    return {
      ok: false,
      motivo: MOTIVO_LECTURA.SIN_LECTOR,
      queHacer: `El lector "${n}" no existe. Registrados: ${lectoresRegistrados().join(", ") || "ninguno"}.`,
      registrados: lectoresRegistrados(),
    };
  }
  const lector = fabrica({ env });
  const disp = lector.disponible();
  if (!disp.ok) {
    return {
      ok: false,
      motivo: disp.motivo || MOTIVO_LECTURA.NO_CONFIGURADO,
      queHacer: queHacerLectura(disp.motivo || MOTIVO_LECTURA.NO_CONFIGURADO),
      lector: lector.nombre,
      registrados: lectoresRegistrados(),
    };
  }
  return { ok: true, lector };
}

// ── LA FORMA DE LA LECTURA ─────────────────────────────────────────────────

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Normaliza lo que devolvió un lector a la forma del contrato.
 *
 * Se aplica SIEMPRE, venga de donde venga: una implementación nueva no puede
 * introducir una forma distinta sin pasar por acá. Lo que no se entiende queda
 * en `null`, nunca en 0 — un 0 en un importe se suma y desplaza el total; un
 * null se ve.
 */
export function normalizarLectura(cruda, { modelo = null } = {}) {
  const c = cruda || {};
  const ident = c.identidad || {};
  const pie = c.pie || {};
  const consumo = c.consumo || {};

  return {
    identidad: {
      tipo: ident.tipo ? String(ident.tipo).trim().toUpperCase() : null,
      puntoVenta: ident.puntoVenta ? String(ident.puntoVenta).trim() : null,
      numero: ident.numero ? String(ident.numero).trim() : null,
      fecha: ident.fecha ? String(ident.fecha).trim() : null,
      cuit: ident.cuit ? String(ident.cuit).replace(/[^0-9]/g, "") || null : null,
    },
    lineas: (Array.isArray(c.lineas) ? c.lineas : []).map((l) => ({
      descripcion: l?.descripcion ? String(l.descripcion).trim() : null,
      codigoProveedor: l?.codigoProveedor ? String(l.codigoProveedor).trim() : null,
      cantidad: num(l?.cantidad),
      netoUnitario: num(l?.netoUnitario),
      subtotalImpreso: num(l?.subtotalImpreso),
      internoUnitario: num(l?.internoUnitario) ?? 0,
    })),
    pie: {
      neto: num(pie.neto),
      iva: num(pie.iva),
      interno: num(pie.interno),
      total: num(pie.total),
      percepciones: (Array.isArray(pie.percepciones) ? pie.percepciones : []).map((p) => ({
        nombre: p?.nombre ? String(p.nombre).trim() : null,
        importe: num(p?.importe),
      })),
    },
    consumo: {
      tokensEntrada: Number.isFinite(Number(consumo.tokensEntrada)) ? Number(consumo.tokensEntrada) : null,
      tokensSalida: Number.isFinite(Number(consumo.tokensSalida)) ? Number(consumo.tokensSalida) : null,
      // SE REGISTRA AUNQUE HOY SEA CERO. El nivel gratuito no cobra, pero el
      // consumo es el único dato que va a permitir decidir, dentro de unos
      // meses, si conviene pasar a uno pago y cuánto costaría. Sin medirlo, esa
      // conversación empieza sin números.
      costoMicroUsd: Number.isFinite(Number(consumo.costoMicroUsd)) ? Number(consumo.costoMicroUsd) : 0,
    },
    // CUÁNTAS LÍNEAS DICE VER EN EL PAPEL, aparte de las que transcribió.
    //
    // Es el control que faltaba: si el modelo se saltea una línea entera, la
    // aritmética de esa línea nunca se evalúa y las dos ecuaciones pueden cerrar
    // igual. Pasó con el comprobante de Mauro y dejó 2.000 pesos sin explicar.
    //
    // Tiene que ser una OBSERVACIÓN INDEPENDIENTE —contar los renglones
    // impresos, incluidos los que no se pudieron leer— y no el largo del arreglo
    // que devolvió. Un número sacado de contar lo que ya transcribió siempre
    // coincide consigo mismo y no controla nada.
    //
    // Se usa `num()` y no `Number()` a secas: `Number("")` es 0, y un cero acá
    // significaría "el lector dice que no hay ningún renglón", que es una
    // afirmación muy distinta de "no lo informó". Es la tercera vez que esta
    // trampa muerde en el módulo —antes fueron los umbrales del proveedor y el
    // tamaño del volumen—, así que la conversión pasa por el mismo lugar que
    // todos los demás números de la lectura.
    lineasEnElPapel: num(c.lineasEnElPapel),
    // NULO SI NO LO DIJO, no false. "No hay total impreso" y "no contestó" son
    // afirmaciones distintas: la primera manda sobre el número del pie, la
    // segunda no puede mandar sobre nada. Un false por omisión marcaría SIN_TOTAL
    // a comprobantes que sí traen total, que es el error simétrico del que
    // estamos arreglando.
    hayTotalImpreso: typeof c.hayTotalImpreso === "boolean" ? c.hayTotalImpreso : null,
    modelo: c.modelo || modelo || null,
  };
}

/**
 * ¿Esta lectura tiene la forma mínima para siquiera intentar verificarla?
 *
 * No dice si los números están bien —eso lo dice la aritmética—, dice si hay
 * con qué preguntarlo.
 */
export function lecturaUtilizable(lectura) {
  const l = lectura || {};
  if (!Array.isArray(l.lineas) || l.lineas.length === 0) {
    return { ok: false, motivo: "SIN_LINEAS", porque: "La lectura no trajo ninguna línea." };
  }
  const sinNumeros = l.lineas.filter((x) => x.cantidad === null || x.netoUnitario === null);
  if (sinNumeros.length === l.lineas.length) {
    return { ok: false, motivo: "SIN_NUMEROS", porque: "Ninguna línea trajo cantidad y precio." };
  }
  // EL MOTIVO VA APARTE DEL TEXTO, y no es adorno: "falta el total" tiene dos
  // causas que se ven idénticas acá —el papel no lo trae, o el modelo no lo
  // encontró— y llevan a estados distintos. Quien decide cuál es
  // `pasarPorLaPuerta`, mirando además si el modelo dice VER un total impreso.
  // Con un solo texto sin código, esa distinción habría que sacarla comparando
  // strings, que es la clase de acople que se rompe al corregir una coma.
  if (l.pie?.total === null || l.pie?.total === undefined) {
    return { ok: false, motivo: "SIN_TOTAL", porque: "La lectura no trajo el total del comprobante." };
  }
  return { ok: true, motivo: null };
}
