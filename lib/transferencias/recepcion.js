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
//   2) Se elimina el fallback silencioso `unidadEnviada || "BULTO"`: asumir
//      BULTO sin evidencia multiplicaba por factor_pack una fila que podía estar
//      en unidades, inventando stock. Sin ese dato la recepción se detiene.
//
//   3) Lo que se enviaba y no llegaba NO volvía a ningún stock. El origen se
//      descontaba por lo enviado, el destino se acreditaba por lo recibido y la
//      diferencia simplemente desaparecía del inventario del grupo. Ahora
//      `validarDetalleRecepcion` calcula el ajuste del origen y la recepción lo
//      aplica. Lo enviado (TransferenciaDetalle.cantidad) NO se reescribe: sigue
//      siendo el dato histórico del remito.
//
// ── LA RECEPCIÓN REPRESENTA LO QUE LLEGÓ, NO REESCRIBE LO QUE SE MANDÓ ─────
//
// Hasta el 2026-09-08 esto rechazaba `recibido > enviado` con
// `CANTIDAD_RECIBIDA_SUPERA_ENVIADA`, y esa validación tapaba dos hechos físicos
// que ocurren de verdad al abrir los bultos: que llegue MÁS de lo que dice el
// remito, y que llegue un producto que el remito ni menciona.
//
// El tope no era una regla de negocio: era la consecuencia de que la aritmética
// posterior solo supiera sumar al origen. Sacarlo sin cambiar la aritmética
// habría acreditado al destino stock que nunca salió de ningún lado.
//
// LA FÓRMULA, que ahora vale para los tres casos y es UNA sola:
//
//     destino            += R
//     origen.enTransito  -= S
//     origen.cantidad    += (S - R)
//
// con S = enviado y R = recibido, los dos en unidades físicas. El tercer término
// es el que cambió: antes era `devolución`, siempre ≥ 0, y ahora es un AJUSTE CON
// SIGNO.
//
//     S=10, R=8   → origen +2   (volvió lo que no llegó)
//     S=10, R=10  → origen  0
//     S=10, R=15  → origen -5   (el origen ya había perdido 10 y pierde 5 más)
//
// Y una línea AGREGADA en recepción es el mismo caso con S = 0:
//
//     S=0, R=6    → destino +6, origen -6, y el tránsito NO se toca
//
// El tránsito no se toca porque esa línea nunca formó parte del envío: no hay
// nada reservado que liberar. Restarle 6 al tránsito del origen inventaría una
// reserva que nadie hizo.

/** Códigos estables. Los consumen las rutas para elegir status y mensaje. */
export const ERRORES_RECEPCION = {
  AJUSTE_INVALIDO: "AJUSTE_ORIGEN_INVALIDO",
  RECIBIDA_INVALIDA: "CANTIDAD_RECIBIDA_INVALIDA",
  UNIDAD_AUSENTE: "UNIDAD_ENVIADA_AUSENTE",
  UNIDAD_DESCONOCIDA: "UNIDAD_ENVIADA_DESCONOCIDA",
  ENVIADA_INVALIDA: "CANTIDAD_ENVIADA_INVALIDA",
  FALTA_MOTIVO: "FALTA_MOTIVO_DIFERENCIA",
  FALTA_DETALLE_MOTIVO: "FALTA_DETALLE_MOTIVO",
  // Una línea marcada como agregada en recepción no puede tener envío: si tiene
  // cantidad enviada es una línea del remito, y confundirlas haría que el
  // tránsito no se limpie por lo que sí salió.
  AGREGADA_CON_ENVIO: "LINEA_AGREGADA_CON_CANTIDAD_ENVIADA",
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
 *   n > 0            → n, sea menor, igual o MAYOR que lo enviado
 *   n < 0            → CANTIDAD_RECIBIDA_INVALIDA
 *   no numérico      → CANTIDAD_RECIBIDA_INVALIDA
 *
 * ── YA NO HAY TOPE SUPERIOR, Y ES EL PUNTO DE ESTE CAMBIO ─────────────────
 *
 * Recibir más de lo enviado es un hecho físico, no un error del operador: los
 * bultos traían más. El sistema tiene que poder representarlo conservando los
 * TRES números —enviado, recibido y la diferencia—, y nunca convertir el enviado
 * en el recibido: eso reescribiría el remito y borraría la evidencia de que hubo
 * un desvío.
 *
 * Lo que sí sigue sin recortarse ni redondearse en silencio es un valor
 * negativo o no numérico: eso no es una cantidad física.
 *
 * `null`/`undefined` sigue significando "nadie cargó recepción → llegó todo", y
 * para una línea AGREGADA en recepción eso da 0, que es lo correcto: una línea
 * agregada y no completada no mueve nada.
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
 * Factor ENTERO que lleva la unidad del detalle a unidades físicas de StockLocal.
 * `factor_pack` es Int? en el schema, así que se normaliza a entero: multiplicar
 * milésimas por un factor fraccionario devolvería milésimas fraccionarias y
 * rompería la exactitud que da trabajar en enteros.
 */
function factorFisico(unidad, factorPack) {
  if (unidad !== "BULTO") return 1;
  const f = Number(factorPack);
  if (!Number.isFinite(f) || f <= 1) return 1;
  return Math.round(f);
}

/**
 * AJUSTE DEL STOCK DEL ORIGEN, CON SIGNO, en unidades físicas de StockLocal.
 *
 *     ajuste = (enviada - recibida) × factor
 *
 *     positivo → vuelve al origen lo que no llegó
 *     cero     → llegó exactamente lo que salió
 *     negativo → llegó de más: el origen pierde esa diferencia además de lo que
 *                ya había perdido al enviar
 *
 * Antes esto se llamaba `calcularDevolucionUnidades` y rechazaba
 * `recibida > enviada` devolviendo `null`. El nombre y el rechazo eran la misma
 * suposición: que del origen solo podía volver mercadería. Se renombró en vez de
 * agregar una segunda función al lado, porque dos fórmulas para el mismo número
 * se separan el día que una cambia.
 *
 * La resta se hace en MILÉSIMAS ENTERAS y recién después se escala por el factor
 * de pack. Restar en punto flotante es lo que hay que evitar: 20.5 - 18.25 da
 * 2.25 por casualidad, pero la misma operación sobre otras cantidades de 3
 * decimales deja residuos binarios que Prisma escribiría en un Decimal(12,3) de
 * stock. Con enteros, 20.500 - 18.250 = 2250 milésimas = 2.250, exacto siempre.
 *
 * El orden importa: (enviada - recibida) × factor, NO (enviada × factor) -
 * (recibida × factor). El primero multiplica un entero exacto una sola vez, y es
 * lo que impide la doble conversión.
 *
 * No distingue política de stock: en DESCONTAR_Y_TRANSITO el origen perdió la
 * cantidad al enviar y en SOLO_TRANSITO la perdió al vender. En los dos casos ya
 * la perdió antes de confirmar, así que el neto correcto es el mismo.
 *
 * @returns {number|null} unidades físicas de ajuste, o null si las cantidades no
 *   son válidas (el llamador ya las validó; null es defensa, no un camino
 *   esperado).
 */
export function calcularAjusteOrigenUnidades({
  enviada,
  recibida,
  unidad,
  factorPack,
} = {}) {
  const envM = aMilesimas(enviada);
  const recM = aMilesimas(recibida);
  if (envM === null || recM === null) return null;
  if (envM < 0 || recM < 0) return null;

  const ajusteM = (envM - recM) * factorFisico(unidad, factorPack);
  if (!Number.isSafeInteger(ajusteM)) return null;
  return desdeMilesimas(ajusteM);
}

/**
 * ¿La diferencia está justificada? Se exige motivo siempre que recibido !== enviado,
 * incluido recibido = 0.
 *
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
/**
 * ¿ESTA LÍNEA TIENE QUE EXPLICAR SU DIFERENCIA CON UN MOTIVO?
 *
 * Son DOS casos y hasta el 2026-09-08 se trataban como uno solo.
 *
 * ── LÍNEA DEL REMITO: SÍ ──────────────────────────────────────────────────
 *
 * Se enviaron 10 y se recibieron 8, o 15. La diferencia existe y nada en la fila
 * dice por qué: el motivo es la única explicación que va a quedar. Esto no
 * cambia.
 *
 * ── LÍNEA AGREGADA EN RECEPCIÓN: NO ───────────────────────────────────────
 *
 * Una línea agregada tiene `cantidad = 0` y `recibido > 0`, así que la
 * aritmética la ve como una diferencia y le pedía un motivo. Pero su procedencia
 * ya está registrada, y de forma MÁS FUERTE que un texto elegido de una lista:
 *
 *   · `agregadoEnRecepcion`      — el hecho;
 *   · `agregadoEnRecepcionPorId` — quién;
 *   · `agregadoEnRecepcionAt`    — cuándo;
 *   · la auditoría la guarda como `AGREGADO_RECEPCION_TRANSFERENCIA`.
 *
 * Pedirle además "Sobrante" es pedir dos veces la misma verdad, y la segunda es
 * más pobre. Peor: la ruta que CREA esas líneas no escribe motivo —no tiene cuál
 * escribir, y ninguno sería un dato real— así que la línea nacía imposible de
 * confirmar. El flujo se cortaba con FALTA_MOTIVO_DIFERENCIA sobre una línea que
 * el propio sistema acababa de crear bien.
 *
 * ── LO QUE NO SE EXIME ────────────────────────────────────────────────────
 *
 * Solo el motivo genérico. Una línea agregada sigue teniendo que tener envío 0,
 * unidad válida, cantidad válida, y sigue pasando por las reglas de stock, la
 * auditoría, los permisos y el candado de concurrencia.
 *
 * Se exporta porque la pantalla decide lo mismo —si dibuja el selector de motivo
 * y si lo exige antes de guardar— y dos copias de esta regla se separan el día
 * que una cambie.
 */
export function exigeMotivo({ hayDiferencia, agregadoEnRecepcion } = {}) {
  if (agregadoEnRecepcion === true) return false;
  return hayDiferencia === true;
}

export function validarMotivoDiferencia({
  hayDiferencia,
  motivoPrincipal,
  motivoDetalle,
  agregadoEnRecepcion,
} = {}) {
  if (!exigeMotivo({ hayDiferencia, agregadoEnRecepcion })) return { ok: true };
  const principal = String(motivoPrincipal || "").trim();
  if (!principal) return { ok: false, error: ERRORES_RECEPCION.FALTA_MOTIVO };
  if (principal === "Otro" && !String(motivoDetalle || "").trim()) {
    return { ok: false, error: ERRORES_RECEPCION.FALTA_DETALLE_MOTIVO };
  }
  return { ok: true };
}

/**
 * LAS TRES ACCIONES DE AUDITORÍA DE UNA RECEPCIÓN.
 *
 * `AuditoriaStock.accion` es un `String`, así que agregar valores no necesita
 * migración. Lo que sí importa es que sean TRES y no una: hasta acá todo
 * movimiento de recepción se guardaba como `DIFERENCIA_RECEPCION_TRANSFERENCIA`,
 * que significaba "faltó mercadería" porque era el único caso posible. Con las
 * diferencias positivas eso dejaría de ser cierto, y un reporte que agrupe por
 * acción sumaría faltantes con sobrantes.
 *
 * El valor histórico NO se renombra: las filas viejas siguen diciendo lo que
 * decían, y siguen significando lo mismo.
 */
export const ACCIONES_RECEPCION = {
  /** Llegó menos: vuelve mercadería al origen. Es el valor que ya existía. */
  FALTANTE: "DIFERENCIA_RECEPCION_TRANSFERENCIA",
  /** Llegó más de lo enviado: el origen pierde la diferencia. */
  EXCEDENTE: "EXCEDENTE_RECEPCION_TRANSFERENCIA",
  /** Llegó algo que el remito no mencionaba. */
  AGREGADO: "AGREGADO_RECEPCION_TRANSFERENCIA",
};

/**
 * Qué acción de auditoría corresponde a un plan ya validado, o `null` si no hay
 * movimiento que auditar.
 *
 * El orden de las preguntas importa: una línea AGREGADA siempre produce
 * excedente —su envío es 0— así que si se preguntara primero por el signo, nunca
 * se registraría como agregada y se perdería la distinción que la hace visible.
 */
export function accionAuditoriaDe(plan = {}) {
  if (plan.agregadoEnRecepcion) {
    return plan.excedenteUnidades > 0 ? ACCIONES_RECEPCION.AGREGADO : null;
  }
  if (plan.devolucionUnidades > 0) return ACCIONES_RECEPCION.FALTANTE;
  if (plan.excedenteUnidades > 0) return ACCIONES_RECEPCION.EXCEDENTE;
  return null;
}

/** Mensaje para el usuario a partir del código. */
export function mensajeRecepcion(codigo, { nombre = null } = {}) {
  const suf = nombre ? ` (${nombre})` : "";
  switch (codigo) {
    case ERRORES_RECEPCION.RECIBIDA_INVALIDA:
      return `Cantidad recibida inválida: debe ser un número de 0 en adelante.${suf}`;
    case ERRORES_RECEPCION.ENVIADA_INVALIDA:
      return `La cantidad enviada del detalle es inválida.${suf}`;
    case ERRORES_RECEPCION.AGREGADA_CON_ENVIO:
      return `Esta línea figura como agregada durante la recepción pero tiene cantidad enviada.${suf} Es una línea del remito y no se puede tratar como agregada.`;
    case ERRORES_RECEPCION.AJUSTE_INVALIDO:
      return `No se pudo calcular el ajuste de stock del origen.${suf} Revisá las cantidades y el factor de pack del producto.`;
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
    codigo === ERRORES_RECEPCION.UNIDAD_DESCONOCIDA ||
    codigo === ERRORES_RECEPCION.AGREGADA_CON_ENVIO ||
    codigo === ERRORES_RECEPCION.AJUSTE_INVALIDO
    ? 409
    : 400;
}

/**
 * Valida un detalle completo y devuelve todo lo que la ruta necesita para mutar.
 * NO muta: la ruta valida TODOS los detalles antes de tocar una sola fila.
 *
 * @param {object} args
 * @param {object} args.detalle  { cantidad, recibido, unidadEnviada, motivoPrincipal,
 *   motivoDetalle, agregadoEnRecepcion }
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

  const agregado = detalle.agregadoEnRecepcion === true;

  const recibido =
    recibidoPropuesto === undefined ? detalle.recibido : recibidoPropuesto;

  const res = resolverRecibido({ recibido, enviada: detalle.cantidad });
  if (!res.ok) return { ok: false, error: res.error };

  // Una línea agregada en recepción NO tuvo envío. Si tiene cantidad enviada, o
  // es una línea del remito mal marcada o alguien intentó hacerla pasar por
  // agregada: en los dos casos el tránsito quedaría sin limpiar por mercadería
  // que sí salió. Se frena antes de calcular nada.
  if (agregado && aMilesimas(res.enviada) !== 0) {
    return { ok: false, error: ERRORES_RECEPCION.AGREGADA_CON_ENVIO };
  }

  // El motivo se exige o no según la PROCEDENCIA, no solo según haya diferencia:
  // una línea agregada ya la tiene registrada con autor y fecha. Ver `exigeMotivo`.
  const motivo = validarMotivoDiferencia({
    hayDiferencia: res.hayDiferencia,
    motivoPrincipal: detalle.motivoPrincipal,
    motivoDetalle: detalle.motivoDetalle,
    agregadoEnRecepcion: agregado,
  });
  if (!motivo.ok) return { ok: false, error: motivo.error };

  // Ajuste del stock del origen, CON SIGNO. Se calcula ACÁ, junto con el resto de
  // la validación, para que la ruta no tenga que hacer aritmética física propia.
  const ajusteOrigenUnidades = calcularAjusteOrigenUnidades({
    enviada: res.enviada,
    recibida: res.recibida,
    unidad: uni.unidad,
    factorPack,
  });
  if (ajusteOrigenUnidades === null) {
    return { ok: false, error: ERRORES_RECEPCION.AJUSTE_INVALIDO };
  }

  return {
    ok: true,
    unidad: uni.unidad,
    recibida: res.recibida,
    enviada: res.enviada,
    hayDiferencia: res.hayDiferencia,
    agregadoEnRecepcion: agregado,
    // Unidades físicas: al destino entra lo RECIBIDO, del tránsito del origen sale
    // lo ENVIADO (la mercadería salió, el tránsito tiene que quedar en cero) y el
    // stock del origen se AJUSTA por la diferencia. Los tres en la misma escala.
    recibidaUnidades: aUnidadesFisicas({ cantidad: res.recibida, unidad: uni.unidad, factorPack }),
    enviadaUnidades: aUnidadesFisicas({ cantidad: res.enviada, unidad: uni.unidad, factorPack }),
    ajusteOrigenUnidades,
    // Los dos lados del ajuste, ya separados, para que la ruta no tenga que
    // decidir el signo cada vez que elige una acción de auditoría o arma un
    // mensaje. Son derivados de `ajusteOrigenUnidades` y no otra cuenta.
    devolucionUnidades: ajusteOrigenUnidades > 0 ? ajusteOrigenUnidades : 0,
    excedenteUnidades: ajusteOrigenUnidades < 0 ? -ajusteOrigenUnidades : 0,
    // Una línea agregada nunca tuvo reserva: no hay tránsito que liberar. Es lo
    // único que la distingue aritméticamente de una línea con envío 0.
    tocaTransito: !agregado,
  };
}
