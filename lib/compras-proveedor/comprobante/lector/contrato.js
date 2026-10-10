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
//     identidad: { tipo, puntoVenta, numero, fecha, cuit, cae },
//     lineas: [{ descripcion, codigoProveedor, cantidad, netoUnitario,
//                subtotalImpreso, costoFinal, enQueViene, tipo }],
//     pie: { total, ... },
//     hayTotalImpreso, lineasEnElPapel, explicacion,
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
import { ESPERA_MAX_MS, esperaEnPalabras } from "./esperas.js";
import { TIPO_RENGLON } from "./lecturaInterpretada.js";

export const MOTIVO_LECTURA = Object.freeze({
  SIN_LECTOR: "SIN_LECTOR",
  NO_CONFIGURADO: "NO_CONFIGURADO",
  SERVICIO_CAIDO: "SERVICIO_CAIDO",
  CUOTA_AGOTADA: "CUOTA_AGOTADA",
  RESPUESTA_ILEGIBLE: "RESPUESTA_ILEGIBLE",
  ARCHIVO_NO_SOPORTADO: "ARCHIVO_NO_SOPORTADO",
  TARDO_DEMASIADO: "TARDO_DEMASIADO",
  // ── LOS TRES QUE ESTABAN ADENTRO DE "SERVICIO_CAIDO" ──────────────────
  //
  // El 2026-09-21 el lector no leyó en todo el día y la bitácora decía
  // SERVICIO_CAIDO diecinueve veces. Era verdad a medias: el lector mapeaba
  // CUALQUIER respuesta que no fuera 200 ni 429 a "servicio caído" y tiraba el
  // cuerpo, así que un modelo dado de baja, una clave sin permiso y una foto
  // rechazada se veían exactamente igual que Google caído — y las tres se
  // arreglan distinto.
  /** 404: el modelo configurado no existe o lo dieron de baja. */
  MODELO_NO_EXISTE: "MODELO_NO_EXISTE",
  /** 401/403: la clave no sirve o no tiene permiso para este modelo. */
  NO_AUTORIZADO: "NO_AUTORIZADO",
  /** 400: el pedido se armó mal, o el archivo no le sirve al modelo. */
  PEDIDO_RECHAZADO: "PEDIDO_RECHAZADO",
  /**
   * SE TERMINÓ EL SALDO DE LA CUENTA.
   *
   * Con plan pago no hay tope de consultas: hay saldo. Cuando se acaba, esperar
   * a mañana no arregla nada —es el único caso de esta lista que se arregla
   * poniendo plata— y por eso no puede seguir cayendo en "se agotó la cuota".
   */
  SIN_SALDO: "SIN_SALDO",
  /**
   * LA RESPUESTA NO LLEGÓ ENTERA.
   *
   * El servicio terminó por otra razón que haber terminado —se quedó sin
   * tokens de salida, se cortó por seguridad o por recitado— o lo que mandó no
   * es el JSON completo que se le pidió. No se repara para quedarse con la
   * parte que entró: medio papel no es un papel, y guardado como lectura borra
   * los renglones de la anterior y muestra una cuenta que no es la del papel.
   */
  LECTURA_CORTADA: "LECTURA_CORTADA",
});

/**
 * ¿LO QUE MANDÓ EL LECTOR ES EL JSON COMPLETO QUE SE LE PIDIÓ?
 *
 * Mira los campos que el esquema de salida pide como obligatorios y que las
 * líneas sean una lista. Una respuesta que validó como JSON pero a la que le
 * faltan esas claves se trata igual que una cortada: no se sabe qué hay del
 * papel que no llegó.
 *
 * @param cruda    lo que devolvió el lector, ya parseado
 * @param esquema  el de `esquemaInterpretado`, para leer sus obligatorios de ahí
 */
export function respuestaCompleta(cruda, esquema) {
  if (!cruda || typeof cruda !== "object" || Array.isArray(cruda)) return false;
  for (const clave of esquema?.required ?? []) {
    if (!(clave in cruda) || cruda[clave] === undefined) return false;
  }
  return Array.isArray(cruda.lineas);
}

/**
 * CON QUÉ ESTADO HTTP SE CONTESTA UNA LECTURA QUE NO SALIÓ.
 *
 * Vive acá, al lado de los motivos, porque es la misma decisión mirada desde el
 * otro lado: qué significa cada falla. En la ruta quedaría lejos del enum y el
 * día que se agregue un motivo nadie se acordaría de darle su estado.
 *
 * No es cosmético. Antes toda falla de lectura contestaba 502, y 502 significa
 * "la aplicación no responde": con la cuota agotada eso es falso dos veces —la
 * aplicación contestó perfecto, y reintentar es justo lo que no hay que hacer—.
 * Además el 502 es el estado que el proxy reemplaza por su propia página de
 * error, y ahí se pierde el cuerpo con el motivo.
 */
export function estadoDeLaFalla(motivo) {
  if (motivo === MOTIVO_LECTURA.CUOTA_AGOTADA) return 429;
  // Sin saldo NO es 429: no es que sobre demanda, es que falta plata en la
  // cuenta. 402 es el estado que existe para eso y no lo usa nadie más acá.
  if (motivo === MOTIVO_LECTURA.SIN_SALDO) return 402;
  if (motivo === MOTIVO_LECTURA.PEDIDO_RECHAZADO) return 422;
  // De configuración, no del servicio: 500 dice "esto lo arreglamos nosotros".
  if (motivo === MOTIVO_LECTURA.MODELO_NO_EXISTE || motivo === MOTIVO_LECTURA.NO_AUTORIZADO) {
    return 500;
  }
  if (motivo === MOTIVO_LECTURA.TARDO_DEMASIADO) return 504;
  // La aplicación contestó bien: lo que no sirvió fue la respuesta del lector.
  // 422 y no 502, que el proxy reemplaza por su página y se lleva el mensaje.
  if (motivo === MOTIVO_LECTURA.LECTURA_CORTADA) return 422;
  return 502;
}

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
  // NO DICE "GRATUITA": desde el 2026-09-21 el proyecto es pago y esa palabra
  // era falsa. Lo que sí se sabe es lo que contestó el servicio, y eso viaja
  // aparte, en `detalle`, con sus palabras.
  [MOTIVO_LECTURA.CUOTA_AGOTADA]:
    "El servicio de lectura contestó que se agotó la cuota del día. El comprobante quedó " +
    "subido: se puede leer más tarde, o cargarlo a mano.",
  [MOTIVO_LECTURA.RESPUESTA_ILEGIBLE]:
    "La lectura volvió en un formato que no se entiende. Probá de nuevo; si sigue, " +
    "cargalo a mano.",
  // La espera sale de la constante, no se escribe: el 2026-10-10 la espera ya
  // era de 90 s y este texto seguía diciendo 45.
  [MOTIVO_LECTURA.TARDO_DEMASIADO]:
    `La lectura tardó más de ${esperaEnPalabras(ESPERA_MAX_MS)} y se cortó. El comprobante quedó ` +
    "subido: probá leerlo de nuevo, o subí una foto más liviana si es muy grande.",
  [MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO]:
    "Este tipo de archivo no lo puede leer el lector configurado. Cargalo a mano o " +
    "subí una foto del comprobante.",
  [MOTIVO_LECTURA.MODELO_NO_EXISTE]:
    "El modelo de lectura configurado ya no existe: Google lo dio de baja o le cambió el " +
    "nombre. El comprobante quedó subido. Esto no se arregla esperando: hay que cambiar " +
    "el modelo, avisá.",
  [MOTIVO_LECTURA.NO_AUTORIZADO]:
    "La clave del servicio de lectura no sirve o no tiene permiso para este modelo. El " +
    "comprobante quedó subido. Esto no se arregla esperando ni reintentando: avisá.",
  [MOTIVO_LECTURA.SIN_SALDO]:
    "Se terminó el saldo de Gemini. Hay que cargar más en Google. El comprobante quedó " +
    "subido: mientras tanto se puede cargar a mano.",
  [MOTIVO_LECTURA.PEDIDO_RECHAZADO]:
    "El servicio rechazó el pedido de lectura: suele ser la foto —demasiado grande o en " +
    "un formato que no acepta—. El comprobante quedó subido: probá con una foto más " +
    "liviana.",
  [MOTIVO_LECTURA.LECTURA_CORTADA]:
    "No se pudo leer el papel entero: la respuesta del lector llegó cortada. El comprobante " +
    "quedó subido, no se guardó nada de esta lectura y lo que había quedó como estaba. " +
    "Volver a leer suele andar.",
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

/**
 * EL UNITARIO LO DESPEJA EL SISTEMA, NO EL MODELO.
 *
 * ── EL DEFECTO QUE ESTO CIERRA, CON SU NÚMERO ────────────────────────────
 *
 * El papel de TDC imprime el neto DEL RENGLÓN, no el de una unidad — lo dice la
 * explicación de Emanuel con todas las letras: "Precio neto: neto de TODO EL
 * RENGLÓN (no por unidad). El costo por unidad es Precio neto ÷ Uni".
 *
 * Así que el modelo devuelve `subtotalImpreso` y deja `netoUnitario` vacío, que
 * es lo CORRECTO: ese número no está impreso, y pedírselo sería pedirle que
 * divida — el agujero del campo derivable. Pero río abajo,
 * `leer/[id]/route.js` descartaba todo renglón sin `netoUnitario` **en
 * silencio**, justo debajo del comentario que promete que las líneas se guardan
 * siempre. Medido en el comprobante 20: `lineasTranscriptas` 12,
 * `ComprobanteLinea` 0. La pantalla mostraba "los productos suman $0,00" con el
 * total del papel al lado y sin un solo número para elegir.
 *
 * ── LA REGLA, QUE YA ESTABA ESCRITA EN OTRO LADO ─────────────────────────
 *
 * La IA transcribe lo impreso; el sistema hace las cuentas. Si el papel trae el
 * importe del renglón y la cantidad, el unitario se despeja acá — una división,
 * nuestra, auditable — en vez de perder el renglón. Y al revés: con el unitario
 * y la cantidad se arma el subtotal, que es el fallback que ya existía río
 * abajo y que ahora vive en el mismo lugar que su simétrico.
 *
 * ── LO QUE NO SE INVENTA ─────────────────────────────────────────────────
 *
 * Si faltan los dos —o la cantidad es cero— no se despeja nada: el renglón sale
 * con lo que se leyó y con `incompleto: true`, para que quien lo muestre lo
 * pueda marcar en vez de hacerlo desaparecer. Un renglón que no se pudo leer es
 * información; uno que se borró solo, no.
 *
 * Va acá y no en cada consumidor por lo mismo que el interno: es el único punto
 * por el que pasa TODA lectura, así que la prueba de la receta y la recepción
 * ven exactamente los mismos renglones.
 */
export function completarElRenglon(linea) {
  const cant = Number(linea?.cantidad);
  const hayCantidad = Number.isFinite(cant) && cant > 0;
  const neto = linea?.netoUnitario;
  const sub = linea?.subtotalImpreso;
  const hayNeto = neto !== null && neto !== undefined;
  const haySub = sub !== null && sub !== undefined;

  if (hayNeto && haySub) return { ...linea, incompleto: false };

  if (!hayNeto && haySub && hayCantidad) {
    // El caso de TDC. Se redondea a seis decimales, que es la precisión de la
    // columna `netoUnitario` del modelo —`Decimal(18,6)`—: guardar más sería
    // prometer una exactitud que la base no conserva.
    return {
      ...linea,
      netoUnitario: Math.round((Number(sub) / cant) * 1e6) / 1e6,
      incompleto: false,
      /** De dónde salió el unitario, para que nadie lo confunda con lo impreso. */
      netoUnitarioDespejado: true,
    };
  }

  if (hayNeto && !haySub && hayCantidad) {
    return {
      ...linea,
      subtotalImpreso: Math.round(Number(neto) * cant * 100) / 100,
      incompleto: false,
      subtotalDespejado: true,
    };
  }

  return { ...linea, incompleto: true };
}

// ── LA FORMA DE LA LECTURA ─────────────────────────────────────────────────

// Exportado el 2026-08-12: `camposComunes` en puerta.js hacía su propia
// conversión con `Number.isFinite(Number(v))`, y `Number(null)` es 0, así que
// "el lector no informó el conteo" se guardaba como CERO renglones en el papel
// —justo el dato que existe para auditar ese control—. Es la cuarta vez que el
// cero falsy muerde en este módulo. La conversión se hace en UN solo lugar.
export const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const soloDigitos = (v) => String(v ?? "").replace(/[^0-9]/g, "");

/**
 * LA IDENTIDAD DEL COMPROBANTE: SOLO LO QUE TIENE FORMA DE NÚMERO DE COMPROBANTE.
 *
 * CCU #257, 2026-10-10: la pantalla decía "B 921-921-620018-7", que es el Nro
 * IIBB de CCU (921-620018-7) partido en punto de venta y número. El número de
 * comprobante no estaba a la vista y el modelo tomó otro número del
 * encabezado. El prompt le pide no hacerlo; esto es la segunda defensa, en
 * código: un punto de venta es de hasta 5 dígitos y un número de hasta 8, sin
 * guiones ni dígito verificador adentro; y ninguno de los dos puede ser parte
 * del CUIT ni del CAE. Lo que no cumple queda vacío —campo opcional (#157)—,
 * nunca deducido. La letra sola tampoco se inventa: A, B, C, M o E.
 */
export function identidadDelComprobante(ident = {}) {
  const tipoCrudo = ident?.tipo ? String(ident.tipo).trim().toUpperCase() : "";
  const tipo = /^[ABCME]$/.test(tipoCrudo) ? tipoCrudo : null;
  const cuit = soloDigitos(ident?.cuit) || null;
  const caeCrudo = soloDigitos(ident?.cae);
  // El CAE son 14 dígitos: lo que no tiene esa forma no es un CAE.
  const cae = caeCrudo.length === 14 ? caeCrudo : null;

  const pvTexto = ident?.puntoVenta ? String(ident.puntoVenta).trim() : "";
  const nroTexto = ident?.numero ? String(ident.numero).trim() : "";
  const formaDePv = /^\d{1,5}$/.test(pvTexto);
  const formaDeNro = /^\d{1,8}$/.test(nroTexto);
  const dentroDe = (largo, corto) => Boolean(largo) && Boolean(corto) && largo.includes(corto);
  const tomadoDeOtroNumero =
    dentroDe(cuit, nroTexto) || dentroDe(cae, nroTexto) || dentroDe(cuit, pvTexto + nroTexto);
  const valeElNumero = formaDePv && formaDeNro && !tomadoDeOtroNumero;

  return {
    tipo,
    puntoVenta: valeElNumero ? pvTexto : null,
    numero: valeElNumero ? nroTexto : null,
    fecha: ident?.fecha ? String(ident.fecha).trim() : null,
    cuit,
    cae,
  };
}

/**
 * Normaliza lo que devolvió un lector a la forma del contrato.
 *
 * Se aplica SIEMPRE, venga de donde venga: una implementación nueva no puede
 * introducir una forma distinta sin pasar por acá. Lo que no se entiende queda
 * en `null`, nunca en 0 — un 0 en un importe se suma y desplaza el total; un
 * null se ve.
 */
export function normalizarLectura(cruda, { modelo = null, interpretada = false } = {}) {
  const c = cruda || {};
  const ident = c.identidad || {};
  const pie = c.pie || {};
  const consumo = c.consumo || {};

  const normalizada = {
    identidad: identidadDelComprobante(ident),
    lineas: (Array.isArray(c.lineas) ? c.lineas : []).map((l) => ({
      descripcion: l?.descripcion ? String(l.descripcion).trim() : null,
      codigoProveedor: l?.codigoProveedor ? String(l.codigoProveedor).trim() : null,
      cantidad: num(l?.cantidad),
      // En la lectura interpretada el precio y el importe son lo IMPRESO, sin
      // significado de impuestos: el costo sale de `costoFinal`. Van a las
      // mismas columnas para que la pantalla los muestre donde siempre.
      netoUnitario: num(l?.netoUnitario ?? l?.precioImpreso),
      subtotalImpreso: num(l?.subtotalImpreso ?? l?.importeImpreso),
      // ── LO QUE INTERPRETÓ EL MODELO (lecturaInterpretada.js) ─────────
      //
      // El costo del renglón entero con todo adentro, en qué viene la
      // cantidad, y si es mercadería o envase. Null en las lecturas de antes.
      costoFinal: num(l?.costoFinal),
      enQueViene: l?.enQueViene ? String(l.enQueViene).trim() : null,
      tipo: Object.values(TIPO_RENGLON).includes(String(l?.tipo ?? "").toUpperCase())
        ? String(l.tipo).toUpperCase()
        : null,
      // El interno impreso en el renglón, si el papel lo trae. Se guarda como
      // dato leído; desde la lectura interpretada no decide ningún costo: el
      // costo final ya lo lleva adentro.
      internoUnitario: num(l?.internoUnitario) ?? 0,
      // ── LOS KILOS Y EL DESCUENTO, TAL COMO VINIERON ───────────────────
      //
      // `null` y no cero, y la diferencia es todo: un renglón sin peso es uno
      // que se cobra por unidad, y un peso en cero sería un renglón sin
      // mercadería. Lo mismo con la bonificación: sin descuento no es lo mismo
      // que un descuento del 0 % leído del papel, aunque la cuenta dé igual.
      peso: num(l?.peso ?? l?.kilos),
      bonificacion: num(l?.bonificacion),
      // ── LA ALÍCUOTA DE IVA DEL RENGLÓN, SI EL PAPEL LA IMPRIME ────────
      //
      // DYSSA la imprime en cada renglón y no es la misma para todos: la
      // harina va al 10,5. Se guarda como dato leído: el costo final del
      // renglón ya la lleva adentro. `null` cuando no vino.
      alicuotaIva: num(l?.alicuotaIva),
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
      // ── TODO LO QUE EL PAPEL IMPRIME ENTRE EL SUBTOTAL Y EL TOTAL ─────
      //
      // Lista libre y SIEMPRE pedida: percepción de IVA, percepción de IIBB,
      // retenciones, descuentos, redondeos. Hasta el 2026-09-22 solo se pedían
      // las percepciones que alguien hubiera cargado a mano en la receta del
      // proveedor, así que la factura de Arcor volvía sin su "PERC. IVA 5329"
      // —que está impresa— y no cerraba por $12.386,53.
      //
      // `resta` distingue un descuento de un impuesto. Un importe negativo dice
      // lo mismo y también se acepta.
      conceptos: (Array.isArray(pie.conceptos) ? pie.conceptos : [])
        .map((c) => ({
          nombre: c?.nombre ? String(c.nombre).trim() : null,
          importe: num(c?.importe),
          resta: c?.resta === true,
        }))
        .filter((c) => c.nombre && c.importe !== null),
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
    // ── LA LECTURA INTERPRETADA ─────────────────────────────────────────
    //
    // La marca la pone quien la pidió con el esquema nuevo —el lector o la
    // lectura guardada que la rearma—, no se deduce de los datos: una lectura
    // interpretada a la que el modelo le dejó afuera todos los costos sigue
    // siendo interpretada, y tiene que fallar como tal. La explicación es cómo
    // leyó ESE papel, y es la receta que se propone.
    interpretada: c.interpretada === true || interpretada === true,
    explicacion: c.explicacion ? String(c.explicacion).trim() || null : null,
  };

  normalizada.lineas = normalizada.lineas.map(completarElRenglon).map((l) =>
    // ── EL RENGLÓN INTERPRETADO SIN IMPORTE IMPRESO ───────────────────────
    //
    // Un papel que no imprime el importe del renglón —ni el precio— deja la
    // cantidad sola, y la base exige las dos columnas. En una lectura
    // interpretada el renglón igual tiene su costo final: el importe se toma
    // de ahí, dicho como despejado, para que no se lea como impreso.
    normalizada.interpretada && l.incompleto && l.costoFinal !== null && Number(l.cantidad) > 0
      ? {
          ...l,
          subtotalImpreso: l.costoFinal,
          netoUnitario: Math.round((l.costoFinal / Number(l.cantidad)) * 1e6) / 1e6,
          incompleto: false,
          subtotalDespejado: true,
          netoUnitarioDespejado: true,
        }
      : l
  );
  return normalizada;
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
