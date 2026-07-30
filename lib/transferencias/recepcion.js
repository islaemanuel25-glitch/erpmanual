// lib/transferencias/recepcion.js
//
// Reglas PURAS de la recepción de una transferencia. No consultan Prisma ni
// dependen de Next: las rutas cargan las filas y estos helpers deciden. Existen
// para que la aritmética física de la recepción se pueda testear sin base de datos
// ni servidor, igual que politicasStock.js y lib/ventas-internas/*.
//
// Corrigen dos defectos reales del flujo anterior:
//
//   1) `d.recibido && Number(d.recibido) > 0 ? Number(d.recibido) : enviada`
//      usaba TRUTHINESS sobre una cantidad. Con `recibido = 0` la guarda daba
//      falso y se acreditaba el total ENVIADO: si no llegaba nada, el sistema
//      registraba que había llegado todo. Acá `0` es un valor legítimo y solo
//      `null`/`undefined` significan "sin registrar → recepción completa".
//
//   2) No había tope superior: se podía recibir MÁS de lo enviado, acreditando al
//      destino stock que nunca salió del origen (el tránsito se limpia siempre por
//      lo enviado). Ahora el rango 0 ≤ recibido ≤ enviado se valida ANTES de
//      cualquier mutación.
//
// También se elimina el fallback silencioso `unidadEnviada || "BULTO"`: asumir
// BULTO sin evidencia multiplicaba por factor_pack una fila que podía estar en
// unidades, inventando stock. Sin ese dato la recepción se detiene.

/** Códigos estables. Los consumen las rutas para elegir status y mensaje. */
export const ERRORES_RECEPCION = {
  RECIBIDA_INVALIDA: "CANTIDAD_RECIBIDA_INVALIDA",
  RECIBIDA_SUPERA_ENVIADA: "CANTIDAD_RECIBIDA_SUPERA_ENVIADA",
  UNIDAD_AUSENTE: "UNIDAD_ENVIADA_AUSENTE",
  UNIDAD_DESCONOCIDA: "UNIDAD_ENVIADA_DESCONOCIDA",
  ENVIADA_INVALIDA: "CANTIDAD_ENVIADA_INVALIDA",
  FALTA_MOTIVO: "FALTA_MOTIVO_DIFERENCIA",
  FALTA_DETALLE_MOTIVO: "FALTA_DETALLE_MOTIVO",
};

export const UNIDADES_VALIDAS = ["UNIDAD", "BULTO"];

/** Escala de trabajo: Decimal(12,3), la de TransferenciaDetalle.cantidad. */
const ESCALA = 1000;

/**
 * Cantidad → milésimas enteras. Comparar cantidades físicas en punto flotante es
 * frágil (1.925 - 1.925 no siempre da 0 tras pasar por Decimal → Number), así que
 * las igualdades y los topes se resuelven en enteros.
 *
 * Acepta number, string y Decimal de Prisma (vía toString).
 * @returns {number|null} milésimas, o null si no es una cantidad válida.
 */
export function aMilesimas(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean" || Array.isArray(valor)) return null;

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    const escalado = valor * ESCALA;
    const redondeado = Math.round(escalado);
    // Tolerancia solo para ruido binario de un valor ya redondeado a 3 decimales.
    if (Math.abs(escalado - redondeado) > 1e-6) return null;
    return redondeado;
  }

  let texto;
  if (typeof valor === "string") texto = valor.trim();
  else if (typeof valor === "object" && typeof valor.toString === "function") {
    texto = String(valor).trim();
  } else return null;

  if (!/^-?\d+(\.\d{1,3})?$/.test(texto)) return null;
  const negativo = texto.startsWith("-");
  const cuerpo = negativo ? texto.slice(1) : texto;
  const [enteros, decimales = ""] = cuerpo.split(".");
  const milesimas = Number(enteros) * ESCALA + Number(decimales.padEnd(3, "0"));
  if (!Number.isSafeInteger(milesimas)) return null;
  return negativo ? -milesimas : milesimas;
}

/** Milésimas enteras → número decimal. 1925 → 1.925. */
export function desdeMilesimas(m) {
  return m / ESCALA;
}

/**
 * Valida `unidadEnviada`. NO hay default: una fila sin unidad no se puede
 * interpretar, porque el mismo número significa cosas distintas según sea BULTO o
 * UNIDAD. El llamador responde 409 y no toca stock.
 *
 * @returns {{ ok: true, unidad: string } | { ok: false, error: string }}
 */
export function resolverUnidadEnviada(unidadEnviada) {
  if (unidadEnviada === null || unidadEnviada === undefined || unidadEnviada === "") {
    return { ok: false, error: ERRORES_RECEPCION.UNIDAD_AUSENTE };
  }
  const u = String(unidadEnviada).trim().toUpperCase();
  if (!UNIDADES_VALIDAS.includes(u)) {
    return { ok: false, error: ERRORES_RECEPCION.UNIDAD_DESCONOCIDA };
  }
  return { ok: true, unidad: u };
}

/**
 * Resuelve la cantidad recibida de un detalle.
 *
 * Semántica EXPLÍCITA, sin truthiness:
 *   null | undefined → `enviada` (nadie registró recepción → llegó todo)
 *   0                → 0 (no llegó nada; es un valor legítimo)
 *   0 < n <= enviada → n
 *   n < 0            → CANTIDAD_RECIBIDA_INVALIDA
 *   n > enviada      → CANTIDAD_RECIBIDA_SUPERA_ENVIADA
 *   no numérico      → CANTIDAD_RECIBIDA_INVALIDA
 *
 * No recorta al máximo ni redondea en silencio: un valor fuera de rango es un
 * error del llamador, no algo para acomodar.
 *
 * @returns {{ ok: true, recibida: number, enviada: number, hayDiferencia: boolean }
 *          | { ok: false, error: string }}
 */
export function resolverRecibido({ recibido, enviada } = {}) {
  const envM = aMilesimas(enviada);
  if (envM === null || envM < 0) {
    return { ok: false, error: ERRORES_RECEPCION.ENVIADA_INVALIDA };
  }

  if (recibido === null || recibido === undefined) {
    return { ok: true, recibida: desdeMilesimas(envM), enviada: desdeMilesimas(envM), hayDiferencia: false };
  }

  const recM = aMilesimas(recibido);
  if (recM === null) return { ok: false, error: ERRORES_RECEPCION.RECIBIDA_INVALIDA };
  if (recM < 0) return { ok: false, error: ERRORES_RECEPCION.RECIBIDA_INVALIDA };
  if (recM > envM) return { ok: false, error: ERRORES_RECEPCION.RECIBIDA_SUPERA_ENVIADA };

  return {
    ok: true,
    recibida: desdeMilesimas(recM),
    enviada: desdeMilesimas(envM),
    hayDiferencia: recM !== envM,
  };
}

/**
 * Cantidad en la unidad de `unidadEnviada` → unidades físicas de StockLocal.
 * Se multiplica por el factor UNA SOLA VEZ y solo si la unidad es BULTO.
 */
export function aUnidadesFisicas({ cantidad, unidad, factorPack } = {}) {
  const f = Number(factorPack || 1);
  const c = Number(cantidad || 0);
  return unidad === "BULTO" && f > 1 ? c * f : c;
}

/**
 * ¿La diferencia está justificada? Se exige motivo siempre que recibido !== enviado,
 * incluido recibido = 0.
 *
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validarMotivoDiferencia({ hayDiferencia, motivoPrincipal, motivoDetalle } = {}) {
  if (!hayDiferencia) return { ok: true };
  const principal = String(motivoPrincipal || "").trim();
  if (!principal) return { ok: false, error: ERRORES_RECEPCION.FALTA_MOTIVO };
  if (principal === "Otro" && !String(motivoDetalle || "").trim()) {
    return { ok: false, error: ERRORES_RECEPCION.FALTA_DETALLE_MOTIVO };
  }
  return { ok: true };
}

/** Mensaje para el usuario a partir del código. */
export function mensajeRecepcion(codigo, { nombre = null } = {}) {
  const suf = nombre ? ` (${nombre})` : "";
  switch (codigo) {
    case ERRORES_RECEPCION.RECIBIDA_SUPERA_ENVIADA:
      return `La cantidad recibida no puede superar la cantidad enviada.${suf}`;
    case ERRORES_RECEPCION.RECIBIDA_INVALIDA:
      return `Cantidad recibida inválida: debe ser un número entre 0 y la cantidad enviada.${suf}`;
    case ERRORES_RECEPCION.ENVIADA_INVALIDA:
      return `La cantidad enviada del detalle es inválida.${suf}`;
    case ERRORES_RECEPCION.UNIDAD_AUSENTE:
      return `Esta transferencia no tiene registrada la unidad de envío${suf}. No se puede recibir sin ese dato: la misma cantidad significa distinto según sea bulto o unidad. Corregí la transferencia antes de recibirla.`;
    case ERRORES_RECEPCION.UNIDAD_DESCONOCIDA:
      return `Unidad de envío desconocida${suf}. Se esperaba BULTO o UNIDAD.`;
    case ERRORES_RECEPCION.FALTA_MOTIVO:
      return `Falta motivo en productos con diferencia.${suf}`;
    case ERRORES_RECEPCION.FALTA_DETALLE_MOTIVO:
      return `Falta detalle en motivo "Otro".${suf}`;
    default:
      return "No se pudo procesar la recepción.";
  }
}

/** Status HTTP por código: la unidad ausente es un conflicto de datos, no del pedido. */
export function statusRecepcion(codigo) {
  return codigo === ERRORES_RECEPCION.UNIDAD_AUSENTE ||
    codigo === ERRORES_RECEPCION.UNIDAD_DESCONOCIDA
    ? 409
    : 400;
}

/**
 * Valida un detalle completo y devuelve todo lo que la ruta necesita para mutar.
 * NO muta: la ruta valida TODOS los detalles antes de tocar una sola fila.
 *
 * @param {object} args
 * @param {object} args.detalle  { cantidad, recibido, unidadEnviada, motivoPrincipal, motivoDetalle }
 * @param {number} args.factorPack  factor_pack del ProductoBase
 * @param {number|null} [args.recibidoPropuesto]  valor entrante (guardar-recepcion);
 *   si se omite se usa `detalle.recibido` ya persistido (confirmar-recepcion).
 */
export function validarDetalleRecepcion({
  detalle = {},
  factorPack = 1,
  recibidoPropuesto = undefined,
} = {}) {
  const uni = resolverUnidadEnviada(detalle.unidadEnviada);
  if (!uni.ok) return { ok: false, error: uni.error };

  const recibido =
    recibidoPropuesto === undefined ? detalle.recibido : recibidoPropuesto;

  const res = resolverRecibido({ recibido, enviada: detalle.cantidad });
  if (!res.ok) return { ok: false, error: res.error };

  const motivo = validarMotivoDiferencia({
    hayDiferencia: res.hayDiferencia,
    motivoPrincipal: detalle.motivoPrincipal,
    motivoDetalle: detalle.motivoDetalle,
  });
  if (!motivo.ok) return { ok: false, error: motivo.error };

  return {
    ok: true,
    unidad: uni.unidad,
    recibida: res.recibida,
    enviada: res.enviada,
    hayDiferencia: res.hayDiferencia,
    // Unidades físicas: al destino entra lo RECIBIDO; del tránsito del origen sale
    // lo ENVIADO (la mercadería ya salió; el faltante es logístico, no vuelve solo).
    recibidaUnidades: aUnidadesFisicas({ cantidad: res.recibida, unidad: uni.unidad, factorPack }),
    enviadaUnidades: aUnidadesFisicas({ cantidad: res.enviada, unidad: uni.unidad, factorPack }),
  };
}
