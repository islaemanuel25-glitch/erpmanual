// lib/caja/cierreCaja.js
//
// Reglas PURAS del cierre y la apertura de caja: qué se cuenta, qué se retira,
// qué queda para el turno siguiente y cómo se recibe ese fondo.
//
// POR QUÉ EXISTE
// --------------
// La fórmula del efectivo esperado (lib/caja/efectivoEsperado.js) siempre estuvo
// bien. Lo que faltaba era el resto del circuito del dinero físico:
//
//   · El cajero contaba SOLO lo que había vendido y dejaba afuera el fondo con el
//     que abrió. Resultado: un faltante exacto por el valor del fondo, una y otra
//     vez, sin que faltara un peso.
//   · La plata nunca salía del cajón: no había forma de registrar el retiro al
//     cerrar, así que el turno siguiente arrancaba declarando un fondo de $10.000
//     mientras el cajón tenía cientos de miles. Ese arrastre se acumulaba y tapaba
//     los faltantes reales.
//
// Las dos cosas se arreglan acá: detectando el patrón del fondo omitido antes de
// confirmar, y obligando a que el efectivo contado se reparta —de forma explícita
// y sin resto— entre lo que se retira y lo que queda.
//
// ARITMÉTICA: todo en CENTAVOS ENTEROS. Nunca floats como acumulador (ver la nota
// larga en efectivoEsperado.js: el residuo binario se lee como diferencia de caja).

import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";

// ── Reparto del efectivo al cerrar ──────────────────────────────────────────

/**
 * Reparto SUGERIDO al cerrar: se deja el mismo fondo con el que abrió el turno y
 * se retira el resto. Es una sugerencia — el cajero puede cambiar las dos cifras.
 *
 * Si contó MENOS que el fondo de apertura (faltante grande), no se puede dejar el
 * fondo completo: se deja todo lo que hay y no se retira nada. Nunca se sugiere un
 * retiro negativo ni un fondo que no existe físicamente.
 *
 * @param {{contado:any, montoInicial:any}} args
 * @returns {{fondoDejado:number, retirado:number}}
 */
export function sugerirRepartoCierre({ contado, montoInicial } = {}) {
  const contadoCent = Math.max(0, aCentavos(contado));
  const inicialCent = Math.max(0, aCentavos(montoInicial));
  const fondoCent = Math.min(inicialCent, contadoCent);
  return {
    fondoDejado: desdeCentavos(fondoCent),
    retirado: desdeCentavos(contadoCent - fondoCent),
  };
}

/**
 * Valida el reparto del cierre. La regla es una sola y no admite resto:
 *
 *     retirado + fondoDejado = efectivo contado
 *
 * Lo que se retira sale del cajón y queda registrado como movimiento; lo que
 * queda es el fondo del próximo turno. Si la suma no cierra, hay plata sin
 * explicar y el cierre se rechaza.
 *
 * @returns {{valido:boolean, error:string|null, retirado:number, fondoDejado:number}}
 */
export function validarRepartoCierre({ contado, retirado, fondoDejado } = {}) {
  const nums = { contado, retirado, fondoDejado };
  for (const [campo, valor] of Object.entries(nums)) {
    if (valor === null || valor === undefined || valor === "" || typeof valor === "boolean" || typeof valor === "object") {
      return { valido: false, error: `Falta indicar ${etiquetaCampo(campo)}.`, retirado: NaN, fondoDejado: NaN };
    }
    if (!Number.isFinite(Number(valor))) {
      return { valido: false, error: `${etiquetaCampo(campo)} no es un número válido.`, retirado: NaN, fondoDejado: NaN };
    }
  }

  const contadoCent = aCentavos(contado);
  const retiradoCent = aCentavos(retirado);
  const fondoCent = aCentavos(fondoDejado);

  if (contadoCent < 0) {
    return { valido: false, error: "El efectivo contado no puede ser negativo.", retirado: NaN, fondoDejado: NaN };
  }
  if (retiradoCent < 0) {
    return { valido: false, error: "Lo que se retira no puede ser negativo.", retirado: NaN, fondoDejado: NaN };
  }
  if (fondoCent < 0) {
    return { valido: false, error: "El fondo que queda no puede ser negativo.", retirado: NaN, fondoDejado: NaN };
  }
  if (retiradoCent + fondoCent !== contadoCent) {
    const suma = desdeCentavos(retiradoCent + fondoCent);
    return {
      valido: false,
      error: `Lo que se retira más lo que queda tiene que dar exactamente el efectivo contado ($${suma} ≠ $${desdeCentavos(contadoCent)}).`,
      retirado: NaN,
      fondoDejado: NaN,
    };
  }

  return {
    valido: true,
    error: null,
    retirado: desdeCentavos(retiradoCent),
    fondoDejado: desdeCentavos(fondoCent),
  };
}

function etiquetaCampo(campo) {
  if (campo === "contado") return "el efectivo contado";
  if (campo === "retirado") return "lo que se retira";
  return "el fondo que queda";
}

// ── Detección del fondo inicial omitido ─────────────────────────────────────

/**
 * ¿El cajero contó solo lo que vendió y se olvidó del fondo de apertura?
 *
 * Se piden las DOS condiciones a la vez, como corresponde a un aviso que va a
 * frenar un cierre. Ninguna sola alcanza:
 *
 *   1) lo contado es exactamente el movimiento del turno:
 *          contado = ventas en efectivo + ingresos − retiros
 *   2) y lo que falta es exactamente el fondo:
 *          esperado − contado = fondo inicial
 *
 * Es una igualdad EXACTA en centavos, no una tolerancia: si el cajero contó mal
 * por $50 además de olvidarse el fondo, esto NO se dispara — y está bien, porque
 * entonces el mensaje sería falso. Ante la duda, no se avisa.
 *
 * Con fondo inicial en cero nunca aplica: no hay nada que olvidar.
 *
 * @returns {{omitido:boolean, fondoInicial:number, esperadoSiIncluye:number, mensaje:string|null}}
 */
export function detectarFondoOmitido({
  contado,
  montoInicial,
  ventasEfectivo = 0,
  ingresos = 0,
  retiros = 0,
  efectivoEsperado,
} = {}) {
  const inicialCent = aCentavos(montoInicial);
  const contadoCent = aCentavos(contado);
  const movimientoCent = aCentavos(ventasEfectivo) + aCentavos(ingresos) - aCentavos(retiros);
  const esperadoCent =
    efectivoEsperado === undefined || efectivoEsperado === null
      ? inicialCent + movimientoCent
      : aCentavos(efectivoEsperado);

  const sinFondo = { omitido: false, fondoInicial: desdeCentavos(inicialCent), esperadoSiIncluye: desdeCentavos(esperadoCent), mensaje: null };
  if (inicialCent <= 0) return sinFondo;

  const contoSoloElMovimiento = contadoCent === movimientoCent;
  const faltaJustoElFondo = esperadoCent - contadoCent === inicialCent;
  if (!contoSoloElMovimiento || !faltaJustoElFondo) return sinFondo;

  const fondo = desdeCentavos(inicialCent);
  return {
    omitido: true,
    fondoInicial: fondo,
    esperadoSiIncluye: desdeCentavos(esperadoCent),
    mensaje: `Parece que contaste solo lo vendido. Falta incluir el fondo inicial de $${fondo}.`,
  };
}

// ── Apertura: recepción del fondo que dejó el cierre anterior ───────────────

/**
 * Compara el fondo que dejó el cierre anterior contra el que el cajero dice haber
 * recibido físicamente.
 *
 * El monto inicial del turno nuevo es SIEMPRE lo recibido de verdad, nunca lo
 * sugerido: si el sistema impusiera el sugerido, una diferencia de recepción
 * quedaría escondida y reaparecería como faltante al cerrar, culpando al cajero
 * equivocado.
 *
 * Cualquier diferencia —de más o de menos— exige una observación escrita.
 *
 * @returns {{diferencia:number, coincide:boolean, requiereObservacion:boolean, montoInicial:number, mensaje:string|null}}
 */
export function evaluarRecepcionFondo({ sugerido = 0, recibido } = {}) {
  const sugeridoCent = Math.max(0, aCentavos(sugerido));
  const recibidoCent = aCentavos(recibido);
  const difCent = recibidoCent - sugeridoCent;
  const coincide = difCent === 0;
  const dif = desdeCentavos(difCent);

  let mensaje = null;
  if (!coincide) {
    mensaje =
      difCent > 0
        ? `Recibiste $${Math.abs(dif)} más de lo que dejó el cierre anterior. Contá de nuevo o explicá la diferencia.`
        : `Recibiste $${Math.abs(dif)} menos de lo que dejó el cierre anterior. Contá de nuevo o explicá la diferencia.`;
  }

  return {
    diferencia: dif,
    coincide,
    requiereObservacion: !coincide,
    montoInicial: desdeCentavos(recibidoCent),
    mensaje,
  };
}

/**
 * Valida la apertura completa. `observacion` se vuelve obligatoria en cuanto la
 * recepción no coincide con lo que dejó el cierre anterior.
 *
 * @returns {{valido:boolean, error:string|null, montoInicial:number, diferencia:number}}
 */
export function validarApertura({ sugerido = 0, recibido, observacion } = {}) {
  if (recibido === null || recibido === undefined || recibido === "" || typeof recibido === "boolean" || typeof recibido === "object") {
    return { valido: false, error: "Ingresá cuánto efectivo recibiste.", montoInicial: NaN, diferencia: NaN };
  }
  const n = Number(recibido);
  if (!Number.isFinite(n)) {
    return { valido: false, error: "El efectivo recibido no es un número válido.", montoInicial: NaN, diferencia: NaN };
  }
  if (aCentavos(n) < 0) {
    return { valido: false, error: "El efectivo recibido no puede ser negativo.", montoInicial: NaN, diferencia: NaN };
  }

  const ev = evaluarRecepcionFondo({ sugerido, recibido: n });
  if (ev.requiereObservacion && !String(observacion || "").trim()) {
    return {
      valido: false,
      error: "Contá de nuevo o escribí por qué el fondo recibido no coincide con el que dejó el cierre anterior.",
      montoInicial: NaN,
      diferencia: ev.diferencia,
    };
  }

  return { valido: true, error: null, montoInicial: ev.montoInicial, diferencia: ev.diferencia };
}

/**
 * Fondo de apertura DECLARADO A MANO, sin herencia del cierre anterior.
 *
 * Mientras un local pueda tener varios cajeros trabajando a la vez, el sistema no
 * sabe qué cierre corresponde a qué cajón físico: ofrecerle a un cajero el fondo
 * que dejó otro es adivinar. Hasta que exista CajaFisica, el cajero declara lo
 * que recibió y punto.
 *
 * A diferencia de `validarApertura`, acá la observación es OPCIONAL: no hay un
 * monto sugerido contra el cual "diferir", así que no hay nada que explicar.
 *
 * @returns {{valido:boolean, error:string|null, montoInicial:number}}
 */
export function validarFondoManual(recibido) {
  if (recibido === null || recibido === undefined || typeof recibido === "boolean" || typeof recibido === "object") {
    return { valido: false, error: "Ingresá cuánto efectivo recibiste para comenzar.", montoInicial: NaN };
  }
  // Un string vacío o de espacios NO es cero: `Number("  ")` da 0 y aceptarlo
  // registraría un fondo que el cajero nunca declaró.
  if (typeof recibido === "string" && recibido.trim() === "") {
    return { valido: false, error: "Ingresá cuánto efectivo recibiste para comenzar.", montoInicial: NaN };
  }
  const n = Number(recibido);
  if (!Number.isFinite(n)) {
    return { valido: false, error: "El efectivo recibido no es un número válido.", montoInicial: NaN };
  }
  if (aCentavos(n) < 0) {
    return { valido: false, error: "El efectivo recibido no puede ser negativo.", montoInicial: NaN };
  }
  return { valido: true, error: null, montoInicial: desdeCentavos(aCentavos(n)) };
}

// ── Texto del retiro de cierre ──────────────────────────────────────────────

/**
 * Motivo con el que se graba el CajaMovimiento del retiro de cierre. Se arma acá
 * para que el historial lo muestre siempre igual y sea reconocible de un vistazo.
 */
export function motivoRetiroCierre({ turnoId, destino } = {}) {
  const d = String(destino || "").trim();
  return d ? `Retiro de cierre del turno #${turnoId} — ${d}` : `Retiro de cierre del turno #${turnoId}`;
}

/** Clave de idempotencia del retiro de cierre. Un turno cierra una sola vez. */
export function claveRetiroCierre(turnoId) {
  return `retiro-cierre-${turnoId}`;
}
