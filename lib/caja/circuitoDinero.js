// lib/caja/circuitoDinero.js
//
// EL CIRCUITO DEL DINERO FÍSICO DE UN TURNO, DE PUNTA A PUNTA.
//
// Responde una sola pregunta y la responde bien: de toda la plata que pasó por
// este cajón, ¿cuánta SALIÓ del local y cuánta simplemente pasó al turno
// siguiente?
//
// LA DISTINCIÓN QUE HACE FALTA
//
// Hay tres cosas que parecen lo mismo y no lo son:
//
//   RETIRO DE RECAUDACIÓN — plata que salió del cajón durante el turno. Es un
//     CajaMovimiento y descuenta del efectivo esperado.
//   RETIRO FINAL — plata que salió al cerrar. También es un CajaMovimiento.
//   CAMBIO DEJADO — plata que NO salió: se quedó en el cajón para que el turno
//     siguiente pueda dar vuelto. NO es un movimiento y no descuenta nada.
//
// Sumar el cambio dejado a "dinero retirado" inflaría la recaudación del local
// por una plata que nunca se fue. Y contarlo de nuevo como ingreso del turno
// siguiente la duplicaría: el mismo billete aparecería dos veces en el mismo día.
//
// EL CAMBIO ES UNA TRANSFERENCIA DE SALDO, NO UN HECHO ECONÓMICO
//
// Sale del turno A como parte del reparto `retiro + cambio = contado`, y entra al
// turno B como `montoInicial`. En el total del local no suma ni resta: cambia de
// dueño, no de lugar.
//
// FUENTES, UNA POR CONCEPTO
//
//   ventas en efectivo ......... la fórmula de efectivoEsperado.js
//   ingresos/retiros manuales .. CajaMovimiento sin vínculo a un arqueo
//   retiros de recaudación ..... CajaMovimiento vinculado a ArqueoCaja
//   retiro final ............... CajaMovimiento de Turno.retiroCierreMovimientoId
//   cambio dejado/recibido ..... CambioPendiente
//   apertura real .............. Turno.montoInicial
//   corte congelado ............ CierrePreparacion
//
// NUNCA se deduce un traspaso por coincidencia de importes ni de horarios: el
// vínculo es por id y está en la base.

import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";

/** Suma en centavos enteros y devuelve pesos. Evita el error de coma flotante. */
function sumar(...valores) {
  let c = 0;
  for (const v of valores) c += aCentavos(Number(v) || 0);
  return desdeCentavos(c);
}

/**
 * Arma el circuito de un turno.
 *
 * Todos los parámetros son opcionales: un turno histórico —anterior a que esto
 * existiera— devuelve el circuito con lo que haya y marca `historico: true` en
 * vez de inventar ceros. Un `null` significa "nadie registró esto"; un `0`
 * significa "se registró que fue cero", y no se muestran igual.
 *
 * @param {object} args
 * @param {object} args.turno            fila de Turno (serializada)
 * @param {object} [args.resumen]        agregados de ventas y movimientos
 * @param {object} [args.cambioRecibido] CambioPendiente que ESTE turno tomó al abrir
 * @param {object} [args.cambioDejado]   CambioPendiente que ESTE turno dejó al cerrar
 * @param {object} [args.corte]          CierrePreparacion del cierre con relevo
 */
export function armarCircuito({ turno, resumen = null, cambioRecibido = null, cambioDejado = null, corte = null } = {}) {
  if (!turno) return null;

  const num = (v) => (v === null || v === undefined ? null : Number(v));

  // ── 1. Con cuánto abrió ────────────────────────────────────────────────
  const montoInicial = num(turno.montoInicial);
  const recibio = Boolean(cambioRecibido);

  const apertura = {
    montoInicial,
    // De dónde salió: de un cierre anterior, o de otro lado con explicación.
    vieneDeCambio: recibio,
    turnoOrigenId: cambioRecibido?.turnoOrigenId ?? null,
    operadorEntrego: cambioRecibido?.operadorOrigen ?? null,
    operadorRecibio: cambioRecibido?.operadorRecibio ?? null,
    totalDeclarado: recibio ? num(cambioRecibido.total) : null,
    totalRecibido: recibio ? num(cambioRecibido.totalRecibido) : null,
    diferencia: recibio ? num(cambioRecibido.diferencia) : null,
    desgloseDeclarado: cambioRecibido?.desglose ?? null,
    desgloseRecibido: cambioRecibido?.desgloseRecibido ?? null,
    motivoDiferencia: cambioRecibido?.motivoDiferencia ?? null,
    // Cuando no vino de un cierre, la explicación es la del operador.
    observacion: turno.observacionFondoApertura ?? null,
  };

  // ── 2-5. Lo que pasó durante el turno ──────────────────────────────────
  const ventasEfectivo = resumen ? num(resumen.totalEfectivo) : null;
  const ingresosManuales = resumen?.movimientosManuales ? num(resumen.movimientosManuales.ingresos) : null;
  const retirosManuales = resumen?.movimientosManuales ? num(resumen.movimientosManuales.retiros) : null;

  // ── Los retiros de recaudación, por diferencia ─────────────────────────
  //
  // `totalRetirosCaja` viene de turnos/resumen, que EXCLUYE de la consulta el
  // CajaMovimiento del retiro final (`retiroCierreMovimientoId`). Esa exclusión
  // existe porque el retiro final se crea DESPUÉS del arqueo y descontarlo del
  // esperado lo restaría dos veces.
  //
  // Por eso acá NO se vuelve a descontar. Restarlo otra vez daba $70.000 de
  // salidas donde había $100.000: medido con el turno del ejemplo.
  const retirosTotales = resumen ? num(resumen.totalRetirosCaja) : null;
  const retiroFinal = num(turno.efectivoRetiradoCierre);

  const retirosRecaudacion =
    retirosTotales == null || retirosManuales == null
      ? null
      : sumar(retirosTotales, -retirosManuales);

  // ── 6-7. El cierre ─────────────────────────────────────────────────────
  const dejo = Boolean(cambioDejado);
  const cierre = {
    corteEn: corte?.corteEn ?? null,
    efectivoEsperado: num(turno.montoEsperadoEfectivo),
    // SIGUE SIENDO EL CAJÓN COMPLETO. Desde que el cambio se separa antes del
    // corte, este número se DERIVA como retiro contado + cambio separado en vez
    // de contarse de una sola vez. El significado no cambió, y por eso el
    // reparto de `verificarCircuito` sigue cerrando exacto.
    efectivoContado: num(turno.montoRealEfectivo),
    diferencia: num(turno.diferenciaEfectivo),
    retiroFinal,
    cambioDejado: dejo ? num(cambioDejado.total) : num(turno.fondoDejadoCierre),
    desgloseCambio: cambioDejado?.desglose ?? null,
    estadoCambio: cambioDejado?.estado ?? null,
    turnoDestinoId: cambioDejado?.turnoDestinoId ?? null,
    destino: turno.destinoRetiroCierre ?? null,
    recibidoPor: turno.recibidoPorCierre ?? null,
    observacion: turno.observaciones ?? null,

    // ── Las cifras del ORDEN NUEVO ───────────────────────────────────────
    //
    // `null` en dos casos distintos, y la diferencia importa: en un turno
    // histórico porque no hubo corte, y en uno cerrado con el orden anterior
    // porque el cambio se eligió al final y nunca existió un "retiro esperado".
    // En los dos casos la pantalla muestra el circuito de siempre; estas
    // filas simplemente no aparecen.
    cambioSeparadoEnCorte: corte?.efectivoRetiradoEsperado != null,
    retiroEsperado: num(corte?.efectivoRetiradoEsperado ?? null),
    retiroContado: num(corte?.totalRetiroContado ?? null),
  };

  // ── 8-9. Los totales, y la regla que los gobierna ──────────────────────
  //
  // SALIÓ DEL LOCAL = retiros manuales + retiros de recaudación + retiro final.
  // El cambio dejado NO entra: se quedó en el cajón.
  const salioDelLocal =
    retirosManuales == null && retirosRecaudacion == null && retiroFinal == null
      ? null
      : sumar(retirosManuales ?? 0, retirosRecaudacion ?? 0, retiroFinal ?? 0);

  const totales = {
    salioDelLocal,
    // TRANSFERIDO ≠ SALIDO. Es la plata que cambió de turno sin moverse del cajón.
    transferidoAlSiguiente: cierre.cambioDejado,
    recibidoDelAnterior: recibio ? num(cambioRecibido.totalRecibido) : null,
  };

  const historico =
    !recibio && !dejo && corte == null &&
    turno.efectivoRetiradoCierre == null && turno.fondoDejadoCierre == null;

  return { apertura, ventasEfectivo, ingresosManuales, retirosManuales, retirosRecaudacion, cierre, totales, historico };
}

/**
 * Comprueba que el circuito CIERRE aritméticamente.
 *
 * No es decoración: es la prueba de que no se contó nada dos veces. Devuelve las
 * igualdades que deben cumplirse y si cada una se cumple, para poder mostrarlas
 * y para poder probarlas.
 *
 *   esperado = inicial + ventas efectivo + ingresos − retiros
 *   contado  = retiro final + cambio dejado
 */
export function verificarCircuito(c) {
  if (!c) return { verificable: false, checks: [] };

  const checks = [];
  const eq = (a, b) => a != null && b != null && aCentavos(a) === aCentavos(b);

  if (
    c.apertura.montoInicial != null && c.ventasEfectivo != null &&
    c.ingresosManuales != null && c.retirosManuales != null && c.retirosRecaudacion != null &&
    c.cierre.efectivoEsperado != null
  ) {
    // El retiro FINAL no entra: se crea DESPUÉS del arqueo, justamente para que
    // el cierre no se reste a sí mismo, y `retirosRecaudacion` ya lo excluye.
    const calculado = sumar(
      c.apertura.montoInicial, c.ventasEfectivo, c.ingresosManuales,
      -c.retirosManuales, -c.retirosRecaudacion
    );
    checks.push({
      nombre: "El efectivo esperado sale de la apertura, las ventas y los movimientos",
      izquierda: calculado,
      derecha: c.cierre.efectivoEsperado,
      cumple: eq(calculado, c.cierre.efectivoEsperado),
    });
  }

  if (c.cierre.efectivoContado != null && c.cierre.retiroFinal != null && c.cierre.cambioDejado != null) {
    const reparto = sumar(c.cierre.retiroFinal, c.cierre.cambioDejado);
    checks.push({
      nombre: "Lo contado se reparte sin resto entre lo retirado y el cambio",
      izquierda: c.cierre.efectivoContado,
      derecha: reparto,
      cumple: eq(c.cierre.efectivoContado, reparto),
    });
  }

  // ── La igualdad propia del orden nuevo ────────────────────────────────
  //
  //     retiro esperado = efectivo esperado − cambio separado
  //
  // Es la que demuestra que el cambio se descontó UNA sola vez: si además se
  // hubiera registrado como movimiento de caja, este check no cerraría. Solo
  // aplica a los cierres tomados con el cambio separado por adelantado.
  if (
    c.cierre.cambioSeparadoEnCorte &&
    c.cierre.efectivoEsperado != null &&
    c.cierre.cambioDejado != null &&
    c.cierre.retiroEsperado != null
  ) {
    const esperadoDeRetiro = sumar(c.cierre.efectivoEsperado, -c.cierre.cambioDejado);
    checks.push({
      nombre: "El retiro esperado es el efectivo esperado menos el cambio separado",
      izquierda: esperadoDeRetiro,
      derecha: c.cierre.retiroEsperado,
      cumple: eq(esperadoDeRetiro, c.cierre.retiroEsperado),
    });
  }

  return { verificable: checks.length > 0, checks, cierra: checks.every((x) => x.cumple) };
}

/** Etiqueta legible del estado de un sobre de cambio. */
export function etiquetaEstadoCambio(estado) {
  switch (estado) {
    case "DISPONIBLE": return "Disponible para el próximo turno";
    case "RESERVADO": return "Reservado: alguien lo está contando";
    case "RECIBIDO": return "Recibido por el turno siguiente";
    case "CANCELADO": return "Cancelado";
    case "VENCIDO": return "Sin tomar hace demasiado tiempo";
    default: return "—";
  }
}
