// lib/caja/retiroDinero.js
//
// RETIRO DE RECAUDACIÓN: contar el cajón, dejar un fondo y sacar el resto, en
// una sola operación.
//
// Antes esto eran DOS actos sin relación: un arqueo (que solo fotografía) y un
// CajaMovimiento RETIRO manual (que sí descuenta). Si el cajero hacía el primero
// y olvidaba el segundo, el sistema le imputaba un faltante exactamente igual a
// lo que había retirado. Ese es el bug que este módulo cierra.
//
// Es PURO: no consulta la base, no conoce Prisma y no sabe de HTTP. La aritmética
// que decide cuánta plata sale del cajón se puede probar sin levantar nada.
//
// NO duplica la fórmula del efectivo esperado —esa vive una sola vez en
// efectivoEsperado.js— ni la invariante del reparto, que se delega a
// cierreCaja.js. Acá solo está lo propio del retiro: cuánto conviene sacar.

import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";
import { validarRepartoCierre } from "./cierreCaja.js";

/**
 * Fondo objetivo efectivo del local.
 *
 * Orden de resolución, sin atajos:
 *   1. lo configurado en el local (ConfiguracionLocal.fondoObjetivoCaja);
 *   2. si no hay, el montoInicial del turno —que es el fondo con el que se abrió;
 *   3. y si tampoco hay, 0.
 *
 * El paso 3 NO es "asumir cero": es el piso aritmético cuando no existe ningún
 * dato. Con fondo 0 el sugerido es "retirar todo", así que la UI tiene que
 * advertirlo; por eso se devuelve también de dónde salió el valor.
 *
 * @returns {{fondoObjetivo:number, origen:'CONFIGURADO'|'MONTO_INICIAL'|'SIN_DATO'}}
 */
export function resolverFondoObjetivo({ configurado, montoInicial } = {}) {
  const cfg = Number(configurado);
  if (Number.isFinite(cfg) && cfg >= 0 && configurado !== null && configurado !== undefined && configurado !== "") {
    return { fondoObjetivo: desdeCentavos(aCentavos(cfg)), origen: "CONFIGURADO" };
  }
  const ini = Number(montoInicial);
  if (Number.isFinite(ini) && ini >= 0 && montoInicial !== null && montoInicial !== undefined && montoInicial !== "") {
    return { fondoObjetivo: desdeCentavos(aCentavos(ini)), origen: "MONTO_INICIAL" };
  }
  return { fondoObjetivo: 0, origen: "SIN_DATO" };
}

/**
 * Recaudación disponible para retirar.
 *
 *   recaudaciónEsperada = max(0, efectivoEsperadoAntes − fondoObjetivo)
 *
 * Sale del ESPERADO, no del contado. Es la corrección central de este módulo.
 *
 * La primera versión hacía `contado − fondoObjetivo`, y eso mete la diferencia
 * dentro del retiro: un sobrante se llevaba como si fuera venta y un faltante se
 * tapaba dejando menos fondo. Peor todavía, retirar un sobrante desplazaba el
 * efectivo esperado de forma PERMANENTE —llegaba a quedar negativo— y la misma
 * diferencia reaparecía, más grande, en cada conteo posterior.
 *
 * Derivándolo del esperado, el retiro se lleva exactamente lo que el sistema
 * dice que se vendió, y la diferencia queda donde tiene que quedar: en el cajón,
 * visible y sin explicar.
 */
export function calcularRecaudacionEsperada({ efectivoEsperadoAntes, fondoObjetivo } = {}) {
  const espCent = aCentavos(efectivoEsperadoAntes);
  const objCent = Math.max(0, aCentavos(fondoObjetivo));
  return desdeCentavos(Math.max(0, espCent - objCent));
}

/**
 * Cuánto conviene retirar.
 *
 *   sugerido = min(recaudaciónEsperada, efectivoContado)
 *
 * El `min` con el contado no es un detalle: NO se puede sacar del cajón plata
 * que físicamente no está. Con un faltante severo el tope es lo que haya, el
 * fondo físico queda en cero y la diferencia sigue siendo la misma —no se
 * disimula retirando de menos ni se agranda retirando de más.
 */
export function calcularRetiroSugerido({ efectivoEsperadoAntes, fondoObjetivo, efectivoContado } = {}) {
  const contadoCent = Math.max(0, aCentavos(efectivoContado));
  const recaudacionCent = aCentavos(
    calcularRecaudacionEsperada({ efectivoEsperadoAntes, fondoObjetivo })
  );
  return desdeCentavos(Math.min(recaudacionCent, contadoCent));
}

/**
 * Reparto sugerido completo.
 *
 * `fondoDejado` es el fondo FÍSICO que va a quedar —contado − retirado—, no el
 * objetivo. Si hay diferencia, no coincide con el objetivo, y la pantalla debe
 * decirlo: afirmar que quedó el fondo objetivo cuando el conteo demuestra otra
 * cosa es exactamente la mentira que hay que evitar.
 */
export function sugerirRepartoRetiro({ efectivoEsperadoAntes, fondoObjetivo, efectivoContado } = {}) {
  const contadoCent = Math.max(0, aCentavos(efectivoContado));
  const retiradoCent = aCentavos(
    calcularRetiroSugerido({ efectivoEsperadoAntes, fondoObjetivo, efectivoContado })
  );
  return {
    recaudacionEsperada: calcularRecaudacionEsperada({ efectivoEsperadoAntes, fondoObjetivo }),
    efectivoRetirado: desdeCentavos(retiradoCent),
    fondoDejado: desdeCentavos(contadoCent - retiradoCent),
  };
}

/**
 * Señales para que la pantalla explique el resultado sin inventar nada.
 *
 * `diferencia` es SIEMPRE contado − esperado, con retiro o sin él: el retiro no
 * la corrige, la arrastra. `fondoFisicoDistinto` marca cuándo el fondo que
 * realmente queda no es el objetivo, y `retiroLimitadoPorFaltante` cuándo no se
 * pudo sacar toda la recaudación porque la plata no estaba.
 */
export function evaluarRetiro({ efectivoEsperadoAntes, fondoObjetivo, efectivoContado, efectivoRetirado } = {}) {
  const espCent = aCentavos(efectivoEsperadoAntes);
  const contadoCent = aCentavos(efectivoContado);
  const objCent = Math.max(0, aCentavos(fondoObjetivo));
  const retCent = aCentavos(efectivoRetirado);
  const recaudacionCent = Math.max(0, espCent - objCent);
  const fondoFisicoCent = contadoCent - retCent;

  return {
    diferencia: desdeCentavos(contadoCent - espCent),
    recaudacionEsperada: desdeCentavos(recaudacionCent),
    fondoFisicoRestante: desdeCentavos(fondoFisicoCent),
    fondoFisicoDistinto: fondoFisicoCent !== objCent,
    retiroDistintoDeRecaudacion: retCent !== Math.min(recaudacionCent, contadoCent),
    // Faltante severo: no alcanzó para llevarse toda la recaudación.
    retiroLimitadoPorFaltante: contadoCent < recaudacionCent,
    // El esperado DESPUÉS del retiro. Nunca queda negativo por retirar un
    // sobrante, porque el retiro ya no lo incluye.
    efectivoEsperadoDespues: desdeCentavos(espCent - retCent),
  };
}

/**
 * Valida el reparto elegido. Invariante EXACTA, en centavos enteros:
 *
 *   efectivoRetirado + fondoDejado = efectivoContado
 *
 * Delega en `validarRepartoCierre`, que ya implementa esta misma invariante para
 * el cierre. Reimplementarla acá sería una segunda copia de la regla que decide
 * si falta plata, y basta con que una se desincronice para que el retiro y el
 * cierre acepten repartos distintos sobre el mismo conteo. En la etapa 5, cuando
 * el cierre pase a ser "el último retiro", queda una sola función y este
 * envoltorio desaparece.
 */
export function validarRepartoRetiro({ efectivoContado, efectivoRetirado, fondoDejado } = {}) {
  const r = validarRepartoCierre({
    contado: efectivoContado,
    retirado: efectivoRetirado,
    fondoDejado,
  });
  return {
    valido: r.valido,
    error: r.error,
    efectivoRetirado: r.retirado,
    fondoDejado: r.fondoDejado,
  };
}

/**
 * Evaluación del retiro tal como se decide de verdad: se elige el CAMBIO y el
 * retiro es lo que sobra.
 *
 * Convive con `evaluarRetiro` a propósito, y no lo reemplaza: aquella describe
 * el reparto contra un fondo OBJETIVO configurado, que es lo que el cierre y los
 * reportes históricos siguen usando. Ésta describe lo que la persona hace con
 * las manos. El fondo objetivo acá es a lo sumo una referencia informativa: no
 * hay que alcanzarlo exacto, porque los billetes son los que son.
 *
 * `diferencia` sigue siendo contado − esperado. El retiro no la corrige.
 */
export function evaluarRetiroPorCambio({
  efectivoEsperadoAntes,
  efectivoContado,
  cambioQueQueda,
  fondoObjetivo,
} = {}) {
  const espCent = aCentavos(efectivoEsperadoAntes);
  const contadoCent = Math.max(0, aCentavos(efectivoContado));
  const cambioCent = Math.max(0, aCentavos(cambioQueQueda));
  const retiroCent = Math.max(0, contadoCent - cambioCent);
  const objCent = fondoObjetivo == null ? null : Math.max(0, aCentavos(fondoObjetivo));

  return {
    efectivoContado: desdeCentavos(contadoCent),
    cambioQueQueda: desdeCentavos(cambioCent),
    totalRetiro: desdeCentavos(retiroCent),
    diferencia: desdeCentavos(contadoCent - espCent),
    // Nada para sacar: o el cajón está vacío, o se eligió dejar todo. En los dos
    // casos no hay retiro que registrar.
    sinRecaudacion: retiroCent === 0,
    // El cambio no puede exceder lo contado. Si pasa, es un error de carga.
    cambioExcedeContado: cambioCent > contadoCent,
    // Informativo: cuánto se aparta el cambio del fondo que el local declaró
    // querer. No bloquea: con los billetes disponibles casi nunca da exacto.
    fondoObjetivo: objCent == null ? null : desdeCentavos(objCent),
    distanciaAlFondoObjetivo: objCent == null ? null : desdeCentavos(cambioCent - objCent),
    // El esperado DESPUÉS del retiro.
    efectivoEsperadoDespues: desdeCentavos(espCent - retiroCent),
  };
}

/**
 * Huella del turno para detectar que algo se movió mientras se contaba.
 *
 * No alcanza con mirar el efectivo esperado: un retiro concurrente y una venta
 * en efectivo lo mueven igual, y no significan lo mismo para el cajero. Se
 * guardan las tres señales que el resumen ya devuelve, más el estado del turno.
 */
export function huellaDelTurno({
  turnoId,
  efectivoEsperado,
  totalRetirosCaja,
  cantidadVentas,
  estaCerrado,
} = {}) {
  return {
    turnoId: turnoId == null ? null : Number(turnoId),
    efectivoEsperado: Number(efectivoEsperado) || 0,
    totalRetirosCaja: Number(totalRetirosCaja) || 0,
    cantidadVentas: Number(cantidadVentas) || 0,
    estaCerrado: estaCerrado === true,
  };
}

/**
 * Compara la huella tomada al abrir contra la de ahora.
 *
 * DECISIÓN IMPORTANTE: nunca toca el efectivo CONTADO. Si el cajero separó la
 * bandeja y siguió vendiendo aparte, la plata que contó no cambió aunque el
 * esperado sí; corregirle el conteo por detrás sería inventar un número que
 * nadie contó. Se actualiza el esperado, se recalcula la diferencia, y la
 * decisión vuelve a ser de la persona.
 */
export function compararHuellas(inicial, actual) {
  const a = huellaDelTurno(inicial || {});
  const b = huellaDelTurno(actual || {});

  const espA = aCentavos(a.efectivoEsperado);
  const espB = aCentavos(b.efectivoEsperado);
  const retA = aCentavos(a.totalRetirosCaja);
  const retB = aCentavos(b.totalRetirosCaja);

  const turnoDistinto = a.turnoId != null && b.turnoId != null && a.turnoId !== b.turnoId;
  const turnoCerrado = b.estaCerrado === true;
  const otroRetiro = retB > retA;
  const ventasNuevas = b.cantidadVentas > a.cantidadVentas;
  const esperadoCambiado = espA !== espB;

  return {
    hayCambios: esperadoCambiado || otroRetiro || ventasNuevas,
    bloquea: turnoCerrado || turnoDistinto,
    turnoCerrado,
    turnoDistinto,
    otroRetiro,
    ventasNuevas,
    esperadoCambiado,
    esperadoAnterior: a.efectivoEsperado,
    esperadoActual: b.efectivoEsperado,
    diferenciaEsperado: desdeCentavos(espB - espA),
    ventasAgregadas: Math.max(0, b.cantidadVentas - a.cantidadVentas),
  };
}

/**
 * Diferencia recalculada contra el esperado NUEVO, sin tocar lo contado.
 *
 * Es la única cifra que se corrige sola cuando hubo movimientos: el conteo lo
 * hizo una persona y se respeta tal cual.
 */
export function recalcularDiferencia({ efectivoContado, efectivoEsperadoActual } = {}) {
  return desdeCentavos(aCentavos(efectivoContado) - aCentavos(efectivoEsperadoActual));
}

/**
 * Motivo del CajaMovimiento generado por un retiro.
 *
 * Es solo para que un humano lea el historial. El vínculo real entre el retiro y
 * su movimiento es `ArqueoCaja.cajaMovimientoRetiroId`, con UNIQUE en la base:
 * NUNCA se busca ni se desduplica por este texto.
 */
export function motivoRetiroRecaudacion(arqueoId) {
  return `Retiro de recaudación #${arqueoId}`;
}

/** Prefijo reservado: el modal de egresos manuales no puede imitarlo. */
export const PREFIJO_MOTIVO_RESERVADO = "Retiro de recaudación";

/** Minúsculas y SIN diacríticos, para comparar motivos escritos a mano. */
function normalizarMotivo(texto) {
  return String(texto ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * ¿Este motivo pertenece al flujo automático?
 *
 * Se usa para RECHAZAR que un egreso manual se haga pasar por un retiro de
 * recaudación. NO es lo que impide el doble descuento —de eso se encarga el
 * vínculo 1:1 por id, con UNIQUE en la base—: acá lo que se protege es que el
 * historial siga siendo legible y que nadie fabrique a mano una línea idéntica a
 * la que genera el sistema.
 *
 * Se comparan los acentos NORMALIZADOS: "recaudacion" sin tilde, o con la tilde
 * mal codificada, son exactamente el mismo intento y tienen que rechazarse
 * igual. Un guard que solo detecta la grafía perfecta no protege de nada.
 */
export function esMotivoReservado(motivo) {
  return normalizarMotivo(motivo).startsWith(normalizarMotivo(PREFIJO_MOTIVO_RESERVADO));
}

/** Clave de idempotencia del retiro. Obligatoria: ver el comentario del schema. */
export function validarIdempotencyKey(clave) {
  const s = String(clave ?? "").trim();
  if (!s) return { valido: false, error: "Falta la clave de idempotencia del retiro." };
  if (s.length > 120) return { valido: false, error: "La clave de idempotencia es demasiado larga." };
  return { valido: true, clave: s };
}
