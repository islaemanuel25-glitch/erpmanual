// lib/caja/cierreRelevo.js
//
// CIERRE CON RELEVO DE OPERADOR: las reglas, sin base y sin HTTP.
//
// EL PROBLEMA QUE RESUELVE
//
// Cerrar caja bloqueaba el mostrador. El cajero que se va tiene que contar el
// cajón billete por billete —diez minutos largos— y mientras tanto nadie vende,
// porque el turno sigue abierto y el POS está tomado por el cierre.
//
// El cierre se parte en dos actos separados en el tiempo:
//
//   CORTE         instantáneo. Congela el efectivo esperado y la frontera de qué
//                 ventas y movimientos son de este turno. El turno deja de
//                 operar; el relevo abre el suyo y sigue vendiendo.
//   CONFIRMACIÓN  cuando el cajero terminó de contar, en su propia pestaña, con
//                 el esperado CONGELADO en el corte.
//
// QUE EL ESPERADO NO SE RECALCULE ES TODO EL PUNTO
//
// Si al confirmar se recalculara, incluiría las ventas que el relevo hizo
// mientras el saliente contaba, y el saliente aparecería con un faltante enorme
// por plata que nunca tuvo en la mano. El número se congela una sola vez.
//
// Este archivo es PURO salvo `generarToken`, que necesita entropía real. Todo lo
// demás se prueba sin levantar nada.

import { aCentavos, desdeCentavos, calcularDiferencia } from "./efectivoEsperado.js";

// ── Estados ────────────────────────────────────────────────────────────────

export const ESTADO_CIERRE = {
  PREPARANDO: "PREPARANDO",
  CONFIRMADO: "CONFIRMADO",
  CANCELADO: "CANCELADO",
  VENCIDO: "VENCIDO",
};

export const ESTADO_CAMBIO = {
  DISPONIBLE: "DISPONIBLE",
  RESERVADO: "RESERVADO",
  RECIBIDO: "RECIBIDO",
  CANCELADO: "CANCELADO",
  VENCIDO: "VENCIDO",
};

/** Los tres estados del turno, derivados de los datos. */
export const ESTADO_TURNO = {
  ABIERTO: "ABIERTO",
  CIERRE_EN_PREPARACION: "CIERRE_EN_PREPARACION",
  CERRADO: "CERRADO",
  ANULADO: "ANULADO",
};

/**
 * Estado del turno. FUENTE ÚNICA: ningún consumidor compara los campos a mano.
 *
 * El orden de las ramas importa y es el del modelo: un turno anulado se cerró
 * para liberar el local, así que tiene `cierre` seteado y hay que mirarlo antes.
 */
export function estadoDelTurno(turno) {
  if (!turno) return null;
  if (turno.anuladoEn) return ESTADO_TURNO.ANULADO;
  if (turno.cierre) return ESTADO_TURNO.CERRADO;
  if (turno.cierreEnPreparacionEn) return ESTADO_TURNO.CIERRE_EN_PREPARACION;
  return ESTADO_TURNO.ABIERTO;
}

/**
 * ¿Este turno puede operar? Vender, mover plata, retirar: todo pasa por acá.
 *
 * Un turno con corte tomado NO opera aunque `cierre` siga en null. Ese es el
 * cambio de significado que introduce esta etapa: hasta ahora "cierre = null"
 * alcanzaba para decir "está vivo", y ya no.
 */
export function turnoOperativo(turno) {
  return estadoDelTurno(turno) === ESTADO_TURNO.ABIERTO;
}

/**
 * Condición Prisma de "turno operativo". Se usa en el WHERE, no después de leer:
 * filtrar en la consulta hace imposible olvidarse el chequeo en una rama.
 */
export const WHERE_TURNO_OPERATIVO = { cierre: null, cierreEnPreparacionEn: null };

/** Mensaje único para cuando una operación llega a un turno ya cortado. */
export const ERROR_TURNO_EN_PREPARACION =
  "Esta caja ya tomó el corte de cierre: no admite más operaciones. Terminá el conteo desde la pantalla de cierre.";

// ── Plazos ─────────────────────────────────────────────────────────────────

/**
 * Plazo del corte. Mismo criterio que el borrador de retiro: doce horas cubren
 * cualquier jornada real.
 *
 * VENCER NO LIBERA NADA. El corte sigue congelado, el turno sigue sin operar y
 * el cierre todavía puede confirmarse. `VENCIDO` es una marca de ATRASO para que
 * alguien lo resuelva, no una devolución del turno a la operación: liberarlo
 * automáticamente perdería un cierre que ya congeló ventas.
 */
export const HORAS_VENCIMIENTO_CIERRE = 12;

/**
 * Plazo de la reserva de un sobre de cambio. Corto a propósito: es lo que tarda
 * alguien en contar lo que recibe.
 *
 * Esta reserva SÍ se libera de verdad, y la asimetría con el corte no es un
 * descuido. Una reserva abandonada no movió plata —el sobre sigue físicamente en
 * el local— así que devolverlo a DISPONIBLE no pierde nada. Un corte vencido, en
 * cambio, ya congeló un turno.
 */
export const MINUTOS_RESERVA_CAMBIO = 20;

export function vencimientoCierre(desde) {
  return new Date(desde.getTime() + HORAS_VENCIMIENTO_CIERRE * 60 * 60 * 1000);
}

export function vencimientoReserva(desde) {
  return new Date(desde.getTime() + MINUTOS_RESERVA_CAMBIO * 60 * 1000);
}

/** ¿Pasó el plazo del corte? Informativo: no cambia lo que se puede hacer. */
export function cierreAtrasado(cierre, ahora = new Date()) {
  if (!cierre?.venceEn) return false;
  if (cierre.estado !== ESTADO_CIERRE.PREPARANDO && cierre.estado !== ESTADO_CIERRE.VENCIDO) {
    return false;
  }
  return new Date(cierre.venceEn).getTime() < ahora.getTime();
}

/**
 * ¿Se puede confirmar este corte?
 *
 * PREPARANDO y VENCIDO son los dos estados confirmables. Que un corte atrasado
 * siga siendo confirmable es deliberado: el cajero se fue sin contar, la plata
 * está en el cajón y alguien tiene que poder cerrar eso. Bloquearlo dejaría el
 * turno congelado para siempre.
 */
export function cierreConfirmable(cierre) {
  return (
    cierre?.estado === ESTADO_CIERRE.PREPARANDO || cierre?.estado === ESTADO_CIERRE.VENCIDO
  );
}

/** ¿Venció la reserva de este sobre? */
export function reservaVencida(cambio, ahora = new Date()) {
  if (cambio?.estado !== ESTADO_CAMBIO.RESERVADO) return false;
  if (!cambio.reservaVenceEn) return false;
  return new Date(cambio.reservaVenceEn).getTime() < ahora.getTime();
}

// ── Identidad del corte ────────────────────────────────────────────────────

/**
 * Clave de idempotencia del cierre. Es LA MISMA que usa el cierre clásico para
 * su ArqueoCaja FINAL, y eso es deliberado: los dos caminos compiten por la
 * `@@unique([turnoId, idempotencyKey])` de ArqueoCaja, así que un turno no puede
 * terminar con dos cortes finales aunque se cierre por las dos vías.
 */
export function claveIdempotenciaCierre(turnoId) {
  return `cierre-${turnoId}`;
}

/** Motivo del CajaMovimiento del retiro final, legible por un humano. */
export function motivoRetiroCierreRelevo(turnoId) {
  return `Retiro de cierre de caja (turno #${turnoId})`;
}

/**
 * Token de acceso a la pantalla de cierre: 32 bytes de entropía criptográfica.
 *
 * Es el único identificador que la pantalla del cierre necesita. No lee el
 * operador activo —que es una cookie compartida por todo el navegador y cambia
 * cuando el relevo hace login en la otra pestaña— sino que se valida contra la
 * autoría grabada en la fila. Así las dos pestañas conviven sin pisarse.
 *
 * `base64url` porque el token viaja en la URL.
 */
export function generarToken(randomBytes) {
  return randomBytes(32).toString("base64url");
}

/** Un token que no tenga esta forma ni se busca en la base. */
export function tokenValido(raw) {
  const t = String(raw ?? "");
  return /^[A-Za-z0-9_-]{20,80}$/.test(t);
}

// ── Aritmética del cierre ──────────────────────────────────────────────────

/**
 * Todo lo que se deriva del conteo, con el esperado CONGELADO como referencia.
 *
 * El cajero no elige cuánto retirar: elige qué billetes deja como cambio para el
 * turno siguiente. Lo que se retira es una consecuencia.
 *
 *     retiro final = contado − cambio que queda
 *     diferencia   = contado − esperado congelado
 *
 * Los dos totales llegan ya calculados por el servidor (`validarDesgloseServidor`);
 * acá no se acepta ningún número del cliente.
 */
export function calcularCierreDesdeConteo({ totalContado, totalCambio, efectivoEsperadoCorte } = {}) {
  const contado = aCentavos(totalContado);
  const cambio = aCentavos(totalCambio);

  if (!Number.isFinite(contado) || contado < 0) {
    return { valido: false, error: "El efectivo contado no es un importe válido." };
  }
  if (!Number.isFinite(cambio) || cambio < 0) {
    return { valido: false, error: "El cambio que queda no es un importe válido." };
  }
  if (cambio > contado) {
    return { valido: false, error: "No puede quedar más cambio que el efectivo contado." };
  }

  return {
    valido: true,
    error: null,
    totalContado: desdeCentavos(contado),
    totalCambio: desdeCentavos(cambio),
    retiroFinal: desdeCentavos(contado - cambio),
    // Misma función que usan el arqueo y el retiro: una sola definición de
    // "diferencia" en todo el circuito.
    diferencia: calcularDiferencia(desdeCentavos(contado), efectivoEsperadoCorte),
  };
}

// ── Recepción del cambio al abrir ──────────────────────────────────────────

export const RECEPCION = {
  COINCIDE: "COINCIDE",
  FALTANTE: "FALTANTE",
  SOBRANTE: "SOBRANTE",
};

/**
 * Compara lo que el operador entrante contó contra lo que el cierre dejó.
 *
 * El motivo es OBLIGATORIO cuando hay diferencia. Sin él, un faltante de
 * recepción entra al sistema como un número suelto que nadie puede explicar
 * después, y al cerrar reaparece como faltante del turno nuevo culpando a quien
 * no lo causó.
 */
export function evaluarRecepcionCambio({ totalEsperado, totalRecibido, motivo } = {}) {
  const esperado = aCentavos(totalEsperado);
  const recibido = aCentavos(totalRecibido);

  if (!Number.isFinite(recibido) || recibido < 0) {
    return { valido: false, error: "El conteo de lo recibido no es un importe válido." };
  }

  const dif = recibido - esperado;
  const clase =
    dif === 0 ? RECEPCION.COINCIDE : dif < 0 ? RECEPCION.FALTANTE : RECEPCION.SOBRANTE;
  const texto = String(motivo ?? "").trim();

  if (dif !== 0 && !texto) {
    const cuanto = desdeCentavos(Math.abs(dif)).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return {
      valido: false,
      error:
        dif < 0
          ? `Faltan $${cuanto} respecto de lo que dejó el turno anterior. Explicá la diferencia antes de abrir.`
          : `Sobran $${cuanto} respecto de lo que dejó el turno anterior. Explicá la diferencia antes de abrir.`,
      clase,
      diferencia: desdeCentavos(dif),
    };
  }

  return {
    valido: true,
    error: null,
    clase,
    diferencia: desdeCentavos(dif),
    // EL MONTO INICIAL SALE DE ACÁ: lo que se contó de verdad, no lo esperado.
    // Imponer lo esperado escondería la diferencia y la haría reaparecer como
    // faltante al cerrar, con el cajero equivocado como responsable.
    montoInicial: desdeCentavos(recibido),
    motivo: texto || null,
  };
}

/**
 * Apertura SIN tomar un sobre de cambio.
 *
 * El motivo también es obligatorio, y por la misma razón que arriba: si hay
 * sobres pendientes en el local y alguien abre igual con plata propia, eso tiene
 * que quedar explicado. Si no, el sobre queda huérfano y nadie sabe por qué.
 */
export function evaluarAperturaSinCambio({ totalContado, motivo } = {}) {
  const contado = aCentavos(totalContado);
  if (!Number.isFinite(contado) || contado < 0) {
    return { valido: false, error: "El conteo de apertura no es un importe válido." };
  }
  const texto = String(motivo ?? "").trim();
  if (!texto) {
    return {
      valido: false,
      error: "Explicá por qué abrís sin tomar un cambio pendiente.",
    };
  }
  return { valido: true, error: null, montoInicial: desdeCentavos(contado), motivo: texto };
}
