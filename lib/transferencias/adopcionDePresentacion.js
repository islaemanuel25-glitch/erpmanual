// lib/transferencias/adopcionDePresentacion.js
//
// RECIBIR UNA TRANSFERENCIA VIEJA EN LA PRESENTACIÓN QUE EL DEPÓSITO USA HOY.
//
// ── EL PROBLEMA, QUE ES REAL Y ESTÁ ABIERTO ──────────────────────────────
//
// La transferencia #176 se creó antes de que el sistema aprendiera a congelar
// cómo salía la mercadería. Lo único que quedó escrito es la cantidad FÍSICA:
//
//     COCA COLA 2L — Enviado 40 UNIDAD
//
// aunque hoy ese producto se trabaja en CAJÓN x8. Y eso no es un error del
// registro: es la verdad de lo que se sabe. **Nadie anotó cómo salió**, y
// dividir 40 por el factor de hoy sería afirmar un hecho que nadie observó.
//
// Por eso no hay backfill y no lo va a haber. Las 6388 líneas históricas se
// quedan como están.
//
// ── PERO UNA HISTÓRICA ABIERTA HAY QUE PODER RECIBIRLA ───────────────────
//
// El operador tiene cinco cajones en la mano y la pantalla le pide contar 40
// unidades. Puede hacerlo, pero está traduciendo de cabeza en el peor momento.
//
// La salida no es adivinar la historia: es que **él decida, explícitamente, en
// qué presentación va a CONTAR**. Eso es un hecho nuevo, de la recepción, con su
// autor y su fecha — no un descubrimiento sobre el despacho.
//
// ── LA DISTINCIÓN QUE NO SE PUEDE PERDER ─────────────────────────────────
//
// Los cinco campos del snapshot nacieron como "así SALIÓ del origen". Si una
// adopción los llenara sin más, esa línea pasaría a afirmar que su presentación
// fue registrada al despachar, que es falso y no habría forma de saberlo después.
//
// Por eso la adopción deja su propia marca —`presentacionAdoptadaAt` y su
// autor— y `origenDePresentacion` contesta de dónde salió cada snapshot. Un
// campo con dos significados y sin forma de distinguirlos es exactamente lo que
// esto evita.
//
// ── LO QUE ACÁ NO SE HACE ────────────────────────────────────────────────
//
// Redondear. Si la cantidad física no se puede representar EXACTAMENTE en la
// presentación de hoy, no se adopta y se sigue viendo el hecho histórico. Un
// cajón y medio no existe en el depósito, y 2,22 piezas tampoco.

import { PRESENTACION, agrupa } from "@/lib/productos/presentacionDeProducto";
// El mismo formateador que usa la auditoría al escribir el rastro. Que la
// pantalla y el rastro digan el bulto incompleto igual no es cosmética: son la
// misma cuenta contada dos veces, y dos formateadores se separan.
import { descriptorDeEnvio, rotuloConSueltas } from "./presentacionEnvio.js";

/** Escala física de `StockLocal`: milésimas enteras. La misma de siempre. */
const ESCALA = 1000;

/** Por qué una adopción no se puede hacer. Códigos estables para la ruta. */
export const MOTIVOS_ADOPCION = Object.freeze({
  /** La línea ya tiene snapshot: se despachó con presentación registrada. */
  YA_TIENE_SNAPSHOT: "ADOPCION_YA_TIENE_SNAPSHOT",
  /** Una línea agregada en recepción no tiene historia que adoptar. */
  ES_AGREGADA: "ADOPCION_ES_LINEA_AGREGADA",
  /** El catálogo de hoy dice lo mismo que ya se está mostrando. */
  SIN_CAMBIO: "ADOPCION_SIN_CAMBIO",
  /** Agrupa pero no se sabe con cuánto: no se inventa un factor. */
  FACTOR_INVALIDO: "ADOPCION_FACTOR_INVALIDO",
  /** Una PIEZA sin peso no puede acreditar kilos al destino. */
  PESO_INVALIDO: "ADOPCION_PESO_INVALIDO",
  /** La cantidad física no cae exacta en la presentación de hoy. */
  NO_REPRESENTABLE: "ADOPCION_NO_REPRESENTABLE",
});

/**
 * DE DÓNDE SALIÓ EL SNAPSHOT DE ESTA LÍNEA.
 *
 * Tres respuestas y un `null`, y la diferencia importa:
 *
 *   · DESPACHO      — se registró al enviar. Es la verdad de aquel día.
 *   · ADOPTADA      — la eligió alguien DURANTE la recepción, sobre una línea
 *                     que no traía presentación. No dice nada sobre el despacho.
 *   · NO_DECLARADO  — la línea no estaba en el remito; la escala salió del
 *                     catálogo del origen al informarla.
 *   · null          — no hay snapshot: se reconstruye del catálogo de hoy.
 *
 * ── POR QUÉ SE DERIVA Y NO SE GUARDA UN ENUM ────────────────────────────
 *
 * Porque las tres se distinguen con datos que la fila YA tiene, y agregar una
 * columna que repita lo que otras dos dicen abre la puerta a que se contradigan.
 * `presentacionAdoptadaAt` es el único hecho nuevo que hacía falta; lo demás ya
 * estaba.
 *
 * Y el default es el correcto para lo que existía antes de esta columna: una
 * línea con snapshot y sin marca de adopción se despachó así. No hace falta
 * backfill para que las de la tanda anterior sigan leyéndose bien.
 */
export const ORIGEN_PRESENTACION = Object.freeze({
  DESPACHO: "DESPACHO",
  ADOPTADA: "ADOPTADA",
  NO_DECLARADO: "NO_DECLARADO",
});

export function origenDePresentacion(linea = {}) {
  if (!linea.presentacionEnvio) return null;
  if (linea.presentacionAdoptadaAt) return ORIGEN_PRESENTACION.ADOPTADA;
  if (linea.agregadoEnRecepcion === true) return ORIGEN_PRESENTACION.NO_DECLARADO;
  return ORIGEN_PRESENTACION.DESPACHO;
}

/**
 * ¿ESTA LÍNEA ADMITE QUE SE LE ADOPTE LA PRESENTACIÓN ACTUAL?
 *
 * Solo una histórica de verdad: sin snapshot de despacho y del remito. Una línea
 * que YA registró cómo salió no se toca —adoptar ahí sería pisar el hecho
 * observado con una preferencia de hoy— y una agregada en recepción no tiene
 * historia que adoptar, su escala ya salió del catálogo al informarla.
 *
 * @returns {{ok:true} | {ok:false, motivo:string}}
 */
export function admiteAdopcion(linea = {}) {
  if (linea.agregadoEnRecepcion === true) {
    return { ok: false, motivo: MOTIVOS_ADOPCION.ES_AGREGADA };
  }
  if (linea.presentacionEnvio) {
    return { ok: false, motivo: MOTIVOS_ADOPCION.YA_TIENE_SNAPSHOT };
  }
  return { ok: true };
}

/**
 * LA CONVERSIÓN, EN MILÉSIMAS ENTERAS Y SIN REDONDEAR NUNCA.
 *
 * @param {object} p
 * @param {number} p.fisicasM        Cantidad física en milésimas enteras. Es la
 *   autoridad y no se toca: sale de `TransferenciaDetalle.cantidad`.
 * @param {string} p.presentacion    La del catálogo de HOY.
 * @param {number|null} p.factor     Factor de agrupación de hoy.
 * @param {number|null} p.pesoPiezaKg Peso de referencia de hoy, solo PIEZA.
 *
 * @returns {{ok:true, cantidadPresentada:number, sueltasEnviadas:number,
 *   factorPresentacion:number|null, pesoPiezaKg:number|null}
 *   | {ok:false, motivo:string}}
 */
export function conversionParaAdoptar({
  fisicasM,
  presentacion,
  factor = null,
  pesoPiezaKg = null,
} = {}) {
  if (!Number.isSafeInteger(fisicasM) || fisicasM < 0) {
    return { ok: false, motivo: MOTIVOS_ADOPCION.NO_REPRESENTABLE };
  }

  // ── LOS AGRUPADOS: COMPLETOS Y RESTO, NUNCA UNA FRACCIÓN DE BULTO ──────
  //
  // 42 físicas en CAJÓN x8 son 5 cajones y 2 sueltas. NO son 5,25 cajones: ese
  // número no existe en el depósito y además reintroduce el error de exactitud
  // que todo este modelo evita —5,25 × 8 da 42 de casualidad, pero 5,833 × 6 da
  // 34,998—.
  if (agrupa(presentacion)) {
    const f = Number(factor);
    if (!Number.isInteger(f) || f <= 1) {
      return { ok: false, motivo: MOTIVOS_ADOPCION.FACTOR_INVALIDO };
    }
    // Un bulto incompleto se cuenta en unidades enteras. Media unidad suelta no
    // se puede representar y no se inventa.
    if (fisicasM % ESCALA !== 0) {
      return { ok: false, motivo: MOTIVOS_ADOPCION.NO_REPRESENTABLE };
    }
    const unidades = fisicasM / ESCALA;
    return {
      ok: true,
      cantidadPresentada: Math.floor(unidades / f),
      sueltasEnviadas: unidades % f,
      factorPresentacion: f,
      pesoPiezaKg: null,
    };
  }

  // ── PIEZA: SOLO SI DA UN NÚMERO ENTERO DE PIEZAS ──────────────────────
  //
  // El depósito cuenta piezas enteras, así que la física ya está en esa escala.
  // Si trae decimales —una línea que en su momento se contó en kilos— no hay
  // conversión válida: 10 / 4,5 no es una cantidad de piezas, y redondearla
  // cambiaría cuántos kilos se le acreditan al destino.
  //
  // Y sin peso no se adopta: de ese número sale la conversión a kilos al
  // confirmar, y un cero ahí acreditaría nada.
  if (presentacion === PRESENTACION.PIEZA) {
    const peso = Number(pesoPiezaKg);
    if (!Number.isFinite(peso) || peso <= 0) {
      return { ok: false, motivo: MOTIVOS_ADOPCION.PESO_INVALIDO };
    }
    if (fisicasM % ESCALA !== 0) {
      return { ok: false, motivo: MOTIVOS_ADOPCION.NO_REPRESENTABLE };
    }
    return {
      ok: true,
      cantidadPresentada: fisicasM / ESCALA,
      sueltasEnviadas: 0,
      factorPresentacion: null,
      pesoPiezaKg: peso,
    };
  }

  // ── KG: LA ESCALA FÍSICA YA ES LA DEL DOMINIO ─────────────────────────
  //
  // Los kilos admiten decimales, así que 3,250 se adopta tal cual. No hay
  // conversión: se está nombrando lo mismo con la unidad correcta.
  if (presentacion === PRESENTACION.KG) {
    return {
      ok: true,
      cantidadPresentada: fisicasM / ESCALA,
      sueltasEnviadas: 0,
      factorPresentacion: null,
      pesoPiezaKg: null,
    };
  }

  // ── UNIDAD: IDENTIDAD ──────────────────────────────────────────────────
  return {
    ok: true,
    cantidadPresentada: fisicasM / ESCALA,
    sueltasEnviadas: 0,
    factorPresentacion: null,
    pesoPiezaKg: null,
  };
}

// ── ACÁ VIVÍAN `equivalenciaParaAdoptar` Y `modoAdopcionHistorica` ───────
//
// Las dos existían para una sola cosa: DIBUJAR el ofrecimiento de adoptar. Una
// armaba el rótulo —"5 CAJÓN x8 + 2 unidades sueltas"— para mostrarlo antes de
// decidir; la otra contestaba si esa línea estaba en modo decisión.
//
// El V25 sacó la pregunta de las dos pantallas —la recepción se cuenta con
// `unidadEnviada` de la línea y no se consulta a nadie, ver
// `docs/business-rules/unidad-medida-es-como-se-compra.md`— y con eso las dos
// quedaron sin un solo consumidor fuera de sus propios candados.
//
// No se dejaron "por si acaso". Una función exportada que solo su test llama es
// exactamente el defecto que este repo persigue: el candado queda verde para
// siempre y la función se lee como capacidad disponible. Están en el historial
// si alguna vez vuelve el flujo.
//
// Lo que SÍ se quedó, porque el servidor lo sigue usando: `admiteAdopcion`,
// `conversionParaAdoptar` y `hayPresentacionDistinta`. Hay seis líneas adoptadas
// en producción y la ruta que las escribió sigue validando con esas tres.

/**
 * ¿LA PRESENTACIÓN DE HOY DICE ALGO DISTINTO DE LO QUE SE ESTÁ MOSTRANDO?
 *
 * Si el catálogo coincide con la lectura histórica no hay nada que adoptar, y
 * ofrecerlo sería un botón que no cambia nada. Se compara la presentación Y el
 * factor: "PACK x6" y "PACK x12" son dos cosas distintas.
 */
export function hayPresentacionDistinta(actual = {}, historica = {}) {
  if (actual.presentacion !== historica.presentacion) return true;
  return Number(actual.factor || 1) !== Number(historica.factor || 1);
}
