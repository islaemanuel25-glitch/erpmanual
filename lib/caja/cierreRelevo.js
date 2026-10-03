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
// La lista de denominaciones es UNA sola en todo el proyecto: si mañana el BCRA
// emite otro billete, se agrega en conteoBilletes.js y la comparación por
// composición lo toma sin tocar nada acá.
import { DENOMINACIONES, CLAVE_MONEDAS } from "./conteoBilletes.js";

// ── Estados ────────────────────────────────────────────────────────────────

export const ESTADO_CIERRE = {
  PREPARANDO: "PREPARANDO",
  CONFIRMADO: "CONFIRMADO",
  CANCELADO: "CANCELADO",
  VENCIDO: "VENCIDO",
  CERRADO_SIN_CONTEO: "CERRADO_SIN_CONTEO",
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

// ── Identidad de la caja ───────────────────────────────────────────────────
//
// LA CUENTA ERP AUTENTICA EL ACCESO. EL OPERADOR ES EL RESPONSABLE DE LA CAJA.
//
// En el mostrador real varios operadores comparten UNA cuenta del local
// (`erpazul_sesion` identifica al dispositivo, no a la persona) y cada uno
// tiene su propio cajón. Mientras la caja se identificó por `localId +
// vendedorId`, dos operadores con la misma cuenta terminaban en el MISMO turno:
// sus ventas, sus retiros y su conteo se mezclaban, y un −5.000 de uno y un
// +5.000 del otro salían como un cajón sin diferencia.
//
// La regla, leída del dato del turno y no de la configuración del local:
//
//   turno CON operador  → la caja es de ese operador en ese local.
//                         La cuenta que lo abrió queda como auditoría.
//   turno SIN operador  → la caja es de la cuenta en ese local, como siempre:
//                         locales que no usan operario, Admin y Dueño que
//                         operan sin PIN, y todos los turnos históricos.
//
// Es el mismo criterio que ya tenía la reserva de sobres (`esReservaPropia`,
// más abajo), pero MÁS ESTRICTO en un punto: una reserva sin operario es de
// cualquier operario de la cuenta; una CAJA sin operador es solo de quien
// opera sin operador. Si no fuera así, el turno de cuenta de un local quedaría
// abierto a cualquier PIN de esa cuenta, que es exactamente la mezcla que esto
// viene a cortar.
//
// Las dos formas —la condición Prisma y el predicado sobre una fila— dicen lo
// mismo y tienen un candado que las compara. Los índices únicos parciales de la
// migración `20261002120000_caja_por_operador` son su garantía en la base.

/** Mensaje único cuando alguien intenta operar la caja de otro. */
export const ERROR_CAJA_AJENA =
  "Esa caja es de otro operador. Cada operador trabaja solo sobre su propia caja.";

function idPositivo(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Condición Prisma de "la caja de esta identidad". Va en el WHERE junto con
 * `localId` —este predicado no dice nada del local—.
 *
 * Una identidad sin cuenta válida es un error de programación, no un "no hay
 * turno": se lanza en vez de devolver una condición que no encuentre nada en
 * silencio.
 */
export function whereCajaPropia({ usuarioId, operadorId } = {}) {
  const op = idPositivo(operadorId);
  if (op != null) return { operadorId: op };
  const cuenta = idPositivo(usuarioId);
  if (cuenta == null) throw new Error("whereCajaPropia: identidad sin cuenta");
  return { vendedorId: cuenta, operadorId: null };
}

/** El mismo predicado que `whereCajaPropia`, sobre una fila ya leída. */
export function esCajaPropia(turno, { usuarioId, operadorId } = {}) {
  if (!turno) return false;
  const op = idPositivo(operadorId);
  const delTurno = idPositivo(turno.operadorId);
  if (delTurno != null) return op === delTurno;
  if (op != null) return false;
  const cuenta = idPositivo(usuarioId);
  return cuenta != null && idPositivo(turno.vendedorId) === cuenta;
}

/**
 * Condición Prisma de "una caja sobre la que esta identidad puede actuar".
 *
 * `puedeIntervenir` es la capacidad que ya existía para operar sin operario
 * —Admin, o DUEÑO_LOCAL en su propio local (`puedeOperarSinOperador`)—: quien
 * la tiene puede arquear, retirar o cerrar la caja de un operador, y la
 * autoría sigue siendo la suya en las columnas de siempre. Un cajero común
 * solo alcanza la suya.
 */
export function whereCajaAccesible({ usuarioId, operadorId, puedeIntervenir = false } = {}) {
  if (puedeIntervenir === true) return {};
  return whereCajaPropia({ usuarioId, operadorId });
}

/** El mismo predicado que `whereCajaAccesible`, sobre una fila ya leída. */
export function puedeActuarSobreCaja(turno, { usuarioId, operadorId, puedeIntervenir = false } = {}) {
  if (!turno) return false;
  if (puedeIntervenir === true) return true;
  return esCajaPropia(turno, { usuarioId, operadorId });
}

/**
 * Quién responde por la caja de un turno: el operador si lo tiene, la cuenta si
 * no. `clave` sirve para agrupar sin que un operador y una cuenta con el mismo
 * número se junten.
 */
export function responsableDeCaja(turno) {
  const op = idPositivo(turno?.operadorId);
  if (op != null) return { tipo: "OPERADOR", id: op, clave: `operador:${op}` };
  const cuenta = idPositivo(turno?.vendedorId);
  if (cuenta != null) return { tipo: "CUENTA", id: cuenta, clave: `cuenta:${cuenta}` };
  return null;
}

// ── Exclusión mutua entre cierre y retiro ──────────────────────────────────
//
// Los dos congelan un esperado y una frontera sobre el MISMO turno. Si
// convivieran, el segundo en confirmar restaría un retiro que el primero no vio,
// y los dos se atribuirían la misma plata. Viven acá, y no en cada módulo, para
// que los dos lados usen el mismo texto y no se desincronicen.

/** Un retiro en preparación impide tomar el corte de cierre. */
export const ERROR_RETIRO_EN_PREPARACION_PARA_CIERRE =
  "Esta caja tiene un retiro de recaudación en preparación. Confirmalo o cancelalo antes de cerrar.";

/** Un cierre en preparación impide iniciar un retiro. */
export const ERROR_CIERRE_EN_PREPARACION_PARA_RETIRO =
  "Esta caja ya tomó el corte de cierre: no se pueden iniciar retiros. Terminá el conteo desde la pantalla de cierre.";

/** Ya hay un retiro en curso: no se inicia otro. */
export const ERROR_RETIRO_YA_EN_PREPARACION =
  "Esta caja ya tiene un retiro en preparación. Terminá ese conteo antes de empezar otro.";

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
 * ¿Se puede CANCELAR este corte? Solo el que sigue vigente: PREPARANDO y sin
 * haber pasado su `venceEn`.
 *
 * El vencimiento se decide POR TIEMPO, no por la etiqueta. `VENCIDO` se escribe
 * recién cuando alguien abre la bandeja de pendientes (`marcarCortesVencidos`),
 * así que un corte vencido puede seguir diciendo PREPARANDO. Si la regla leyera
 * solo `estado`, lo que se puede hacer dependería de quién miró el sistema.
 *
 * El sobre es otra condición, y no vive acá: ver `puedeCancelarCierre` en
 * `procesoPendiente.js`.
 */
export function cierreCancelable(cierre, ahora = new Date()) {
  return cierre?.estado === ESTADO_CIERRE.PREPARANDO && !cierreAtrasado(cierre, ahora);
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

/** Por qué un corte ya no se confirma, según en qué estado terminó. */
export function motivoNoConfirmable(cierre) {
  if (cierre?.estado === ESTADO_CIERRE.CERRADO_SIN_CONTEO) {
    return "Este cierre ya se resolvió sin conteo: no se puede confirmar.";
  }
  return "Este cierre fue cancelado y no se puede confirmar.";
}

// ── Cerrar sin conteo ──────────────────────────────────────────────────────
//
// LA RESOLUCIÓN ADMINISTRATIVA DE UN CORTE VENCIDO. El cajero se fue sin contar
// y, días o semanas después, ese conteo ya no existe. Confirmar exige un número
// que nadie tiene, y mandar cero o el esperado es inventarlo. Esto cierra el
// turno con lo único que se sabe —el esperado congelado en el corte— y deja lo
// contado y la diferencia DESCONOCIDOS.

/**
 * El permiso de la resolución. Excepcional: no va a ningún rol de sistema; Admin
 * lo tiene por el comodín y a los demás se les da a mano.
 */
export const PERMISO_CERRAR_SIN_CONTEO = "pos.cerrar_sin_conteo";

/** La acción con la que la resolución queda en `AuditoriaBitacora`. */
export const ACCION_CERRAR_SIN_CONTEO = "caja.cerrar_sin_conteo";

/** Lo que muestran las pantallas donde no hubo conteo. Nunca "$0". */
export const TEXTO_SIN_CONTAR = "Sin contar";
export const TEXTO_DIFERENCIA_NO_DISPONIBLE = "No disponible";

/**
 * ¿Se puede cerrar sin conteo este corte? Solo el VENCIDO POR TIEMPO: PREPARANDO
 * o VENCIDO, con el `venceEn` ya pasado. Mismo criterio que `cierreCancelable`
 * pero al revés: la etiqueta VENCIDO se escribe recién cuando alguien abre la
 * bandeja, así que no puede ser ella la que decida.
 *
 * Un corte todavía vigente NO se cierra sin conteo: el cajero puede estar
 * contando en este momento, y la salida para él es confirmar.
 */
export function cierreCerrableSinConteo(cierre, ahora = new Date()) {
  return cierreConfirmable(cierre) && cierreAtrasado(cierre, ahora);
}

/**
 * Valida el motivo de la resolución. Obligatorio: es la única explicación de por
 * qué una caja quedó sin contar, y sin él dentro de un mes no se distingue de un
 * error.
 */
export function validarMotivoSinConteo(motivo) {
  const texto = String(motivo ?? "").trim().slice(0, 500);
  if (!texto) return { valido: false, error: "Explicá por qué esta caja se cierra sin conteo." };
  return { valido: true, motivo: texto };
}

/**
 * ¿Este turno cerrado se contó? Un turno CERRADO sin `montoRealEfectivo` no tiene
 * conteo: lo dejó así "cerrar sin conteo". Lo que esas pantallas tienen que
 * mostrar es "Sin contar", no un cero —cero sería "se contó y no había nada"—.
 * El anulado tampoco se contó, pero es otro estado y cada pantalla ya lo trata.
 *
 * Exige `null` y no acepta `undefined` a propósito: un llamador que no trajo la
 * columna no sabe si se contó, y afirmar "sin contar" sería inventarlo al revés.
 */
export function turnoSinConteo(turno) {
  return estadoDelTurno(turno) === ESTADO_TURNO.CERRADO && turno.montoRealEfectivo === null;
}

/**
 * ¿Esta reserva es MÍA?
 *
 * LA IDENTIDAD NO ES EL USUARIO DEL SISTEMA
 *
 * En el escenario real —una computadora en el mostrador— TODOS los operarios
 * comparten la misma sesión: `erpazul_sesion` identifica al dispositivo, no a la
 * persona. La persona es el operario del PIN.
 *
 * Comparando solo `reservadoPorUsuarioId`, María veía la reserva de Juan como
 * propia y podía consumirla: reproducido en una sola PC, María se logueó después
 * de que Juan reservara y abrió turno con el cambio que Juan estaba contando.
 *
 * Por eso la propiedad se decide por usuario Y operario. Cuando el local NO
 * exige operario, `reservadoPorOperadorId` queda en null y la comparación cae al
 * usuario solo, que es la identidad más fina que existe en ese caso.
 */
export function esReservaPropia(fila, { usuarioId, operadorId } = {}) {
  if (!fila) return false;
  if (fila.reservadoPorUsuarioId == null) return false;
  if (fila.reservadoPorUsuarioId !== usuarioId) return false;
  // Local sin operarios: el usuario es toda la identidad disponible.
  if (fila.reservadoPorOperadorId == null) return true;
  return fila.reservadoPorOperadorId === (operadorId ?? null);
}

/** Condición Prisma equivalente, para filtrar en el WHERE en vez de después. */
export function whereReservaPropia({ usuarioId, operadorId }) {
  return {
    reservadoPorUsuarioId: usuarioId,
    OR: [{ reservadoPorOperadorId: null }, { reservadoPorOperadorId: operadorId ?? null }],
  };
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
 * EL RETIRO ESPERADO: lo que debería salir del cajón, congelado en el corte.
 *
 *     retiro esperado = efectivo esperado al corte − cambio separado
 *
 * Se congela junto con el esperado porque es contra ESTE número que se compara
 * el conteo. Recalcularlo al confirmar traería las ventas del relevo, que es
 * exactamente el error que todo este flujo existe para evitar.
 *
 * PUEDE DAR NEGATIVO y no se recorta. Pasa cuando se deja como cambio más plata
 * de la que el sistema esperaba encontrar —un sobrante—, y recortarlo a cero
 * rompería la identidad `diferencia = retiro contado − retiro esperado`, que es
 * la que hace que el faltante o el sobrante se vea. Un número raro que se
 * explica es mejor que un cero que miente; la pantalla lo advierte.
 */
export function calcularRetiroEsperado({ efectivoEsperadoCorte, totalCambio } = {}) {
  return desdeCentavos(aCentavos(efectivoEsperadoCorte) - aCentavos(totalCambio));
}

/**
 * Suma dos desgloses de billetes.
 *
 * Se usa para reconstruir QUÉ HABÍA EN EL CAJÓN al momento del corte, sumando el
 * cambio que se separó antes más el retiro que se contó después. Ese total es el
 * que se sigue guardando en `ArqueoCaja.efectivoContado` y `Turno.montoRealEfectivo`,
 * para que su significado histórico —"todo el efectivo del cajón"— no cambie.
 *
 * Las denominaciones se suman como cantidades; "Monedas / otros" como importe.
 */
export function unirDesgloses(a = {}, b = {}) {
  const salida = {};
  for (const { valor } of DENOMINACIONES) {
    const clave = String(valor);
    const total = Number(a?.[clave] ?? 0) + Number(b?.[clave] ?? 0);
    if (total > 0) salida[clave] = total;
  }
  const monedas = desdeCentavos(
    aCentavos(Number(a?.[CLAVE_MONEDAS] ?? 0)) + aCentavos(Number(b?.[CLAVE_MONEDAS] ?? 0))
  );
  if (monedas > 0) salida[CLAVE_MONEDAS] = monedas;
  return salida;
}

/**
 * Lo que se deriva de contar ÚNICAMENTE el dinero retirado.
 *
 * ORDEN FÍSICO CORRECTO: el cambio se separó y se contó ANTES del corte, así que
 * ya no está en la pila que se cuenta. Lo que queda por contar es sólo el retiro.
 *
 *     diferencia            = retiro contado − retiro esperado congelado
 *     total del cajón       = retiro contado + cambio separado
 *     retiro final          = retiro contado
 *
 * La diferencia da EXACTAMENTE lo mismo que la del orden anterior
 * (`contado − esperado`), porque `contado = retiro + cambio` y
 * `retiro esperado = esperado − cambio`. Cambia el trabajo físico, no el número.
 *
 * Los totales llegan ya calculados por el servidor (`validarDesgloseServidor`);
 * acá no se acepta ningún número del cliente.
 */
export function calcularCierreDesdeRetiro({
  totalRetiroContado,
  totalCambio,
  efectivoRetiradoEsperado,
} = {}) {
  const retiro = aCentavos(totalRetiroContado);
  const cambio = aCentavos(totalCambio);

  if (!Number.isFinite(retiro) || retiro < 0) {
    return { valido: false, error: "El retiro contado no es un importe válido." };
  }
  if (!Number.isFinite(cambio) || cambio < 0) {
    return { valido: false, error: "El cambio separado no es un importe válido." };
  }

  return {
    valido: true,
    error: null,
    totalRetiroContado: desdeCentavos(retiro),
    totalCambio: desdeCentavos(cambio),
    // Retirar es exactamente lo que se contó: ya no hay resta que hacer.
    retiroFinal: desdeCentavos(retiro),
    // El equivalente del cajón completo, para no cambiarle el significado a las
    // columnas históricas.
    totalCajonDerivado: desdeCentavos(retiro + cambio),
    diferencia: calcularDiferencia(desdeCentavos(retiro), efectivoRetiradoEsperado),
  };
}

/**
 * Todo lo que se deriva del conteo, con el esperado CONGELADO como referencia.
 *
 * ORDEN ANTERIOR — SOLO COMPATIBILIDAD. Se conserva para confirmar cortes que se
 * tomaron con el flujo viejo, que no tienen `efectivoRetiradoEsperado` grabado
 * porque el cambio se elegía recién al final. Los cortes nuevos usan
 * `calcularCierreDesdeRetiro`.
 *
 *     retiro final = contado − cambio que queda
 *     diferencia   = contado − esperado congelado
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
  /** Mismo importe y mismos billetes. El caso feliz. */
  COINCIDE: "COINCIDE",
  /**
   * Mismo importe, distinta composición.
   *
   * NO es lo mismo que COINCIDE, y esa es la razón de que exista este estado.
   * Diez billetes de $1.000 y cinco de $2.000 suman los mismos $10.000, pero la
   * caja no arranca igual: con cinco de $2.000 no se puede dar vuelto de $1.000.
   * Comparar solo totales daría "todo bien" sobre un cajón que no sirve para
   * trabajar, y además taparía el caso real de que alguien cambió billetes por
   * otros entre un turno y el siguiente.
   *
   * No impide abrir —el dinero está— pero exige que quien abre lo vea y lo
   * confirme, y queda registrado en los dos desgloses guardados.
   */
  COINCIDE_TOTAL: "COINCIDE_TOTAL",
  FALTANTE: "FALTANTE",
  SOBRANTE: "SOBRANTE",
};

/**
 * Compara DENOMINACIÓN POR DENOMINACIÓN lo que dejó el cierre contra lo contado.
 *
 * Devuelve las filas que difieren, con cuánto se esperaba y cuánto hay. La fila
 * de monedas se compara como importe, no como cantidad.
 */
export function compararComposicion({ desgloseEsperado = {}, desgloseRecibido = {} } = {}) {
  const filas = [];

  for (const { valor, etiqueta } of DENOMINACIONES) {
    const esperadas = Number(desgloseEsperado?.[String(valor)] ?? 0);
    const recibidas = Number(desgloseRecibido?.[String(valor)] ?? 0);
    if (esperadas !== recibidas) {
      filas.push({ clave: String(valor), etiqueta, esperadas, recibidas, delta: recibidas - esperadas });
    }
  }

  const monedasEsperadas = Number(desgloseEsperado?.[CLAVE_MONEDAS] ?? 0);
  const monedasRecibidas = Number(desgloseRecibido?.[CLAVE_MONEDAS] ?? 0);
  if (aCentavos(monedasEsperadas) !== aCentavos(monedasRecibidas)) {
    filas.push({
      clave: CLAVE_MONEDAS,
      etiqueta: "Monedas / otros",
      esperadas: monedasEsperadas,
      recibidas: monedasRecibidas,
      delta: desdeCentavos(aCentavos(monedasRecibidas) - aCentavos(monedasEsperadas)),
    });
  }

  return { coincide: filas.length === 0, filas };
}

export const MENSAJE_COMPOSICION_DISTINTA =
  "El total coincide, pero las denominaciones recibidas son diferentes.";

/**
 * Compara lo que el operador entrante contó contra lo que el cierre dejó.
 *
 * El motivo es OBLIGATORIO cuando hay diferencia. Sin él, un faltante de
 * recepción entra al sistema como un número suelto que nadie puede explicar
 * después, y al cerrar reaparece como faltante del turno nuevo culpando a quien
 * no lo causó.
 */
export function evaluarRecepcionCambio({
  totalEsperado,
  totalRecibido,
  motivo,
  // Los dos desgloses, para la comparación por denominación. Si no vienen, se
  // compara solo por total y `composicion` queda en null: es lo que hacía la
  // subetapa B, y sigue siendo válido para un llamador que no los tenga.
  desgloseEsperado = null,
  desgloseRecibido = null,
  /**
   * El operador vio que el importe coincide pero los billetes son otros, y lo
   * aceptó. Sin esto, un cajón con la composición cambiada entraría en silencio.
   */
  confirmaComposicion = false,
} = {}) {
  const esperado = aCentavos(totalEsperado);
  const recibido = aCentavos(totalRecibido);

  if (!Number.isFinite(recibido) || recibido < 0) {
    return { valido: false, error: "El conteo de lo recibido no es un importe válido." };
  }

  const dif = recibido - esperado;
  const texto = String(motivo ?? "").trim();

  // La composición solo se evalúa cuando hay con qué compararla.
  const composicion =
    desgloseEsperado && desgloseRecibido
      ? compararComposicion({ desgloseEsperado, desgloseRecibido })
      : null;

  let clase;
  if (dif < 0) clase = RECEPCION.FALTANTE;
  else if (dif > 0) clase = RECEPCION.SOBRANTE;
  else if (composicion && !composicion.coincide) clase = RECEPCION.COINCIDE_TOTAL;
  else clase = RECEPCION.COINCIDE;

  // Mismo importe, otros billetes: no se bloquea —la plata está— pero tiene que
  // ser una decisión y no un descuido.
  if (clase === RECEPCION.COINCIDE_TOTAL && !confirmaComposicion) {
    return {
      valido: false,
      error: MENSAJE_COMPOSICION_DISTINTA,
      necesitaConfirmarComposicion: true,
      clase,
      diferencia: 0,
      composicion,
    };
  }

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
      composicion,
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
    composicion,
  };
}

/**
 * Mensaje de encabezado según cómo salió la recepción. Vive acá y no en la
 * pantalla para que el texto sea uno solo y se pueda probar.
 */
export function mensajeRecepcion(clase, diferencia = 0) {
  const plata = (n) =>
    "$" + Math.abs(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  switch (clase) {
    case RECEPCION.COINCIDE:
      return "El cambio recibido coincide con el cierre anterior.";
    case RECEPCION.COINCIDE_TOTAL:
      return "El importe coincide, pero cambió la composición de billetes.";
    case RECEPCION.FALTANTE:
      return `Falta ${plata(diferencia)} respecto de lo que dejó el cierre anterior.`;
    case RECEPCION.SOBRANTE:
      return `Sobra ${plata(diferencia)} respecto de lo que dejó el cierre anterior.`;
    default:
      return "";
  }
}

/**
 * Aviso que ve el operador al entrar al POS con el turno recién abierto.
 *
 * Nombra a QUIÉN dejó el cambio. Es lo que convierte un número suelto en una
 * cadena que se puede seguir: si mañana aparece un faltante, el turno nuevo sabe
 * de dónde vino su fondo.
 */
export function avisoApertura({ clase, montoInicial, diferencia, quien } = {}) {
  const plata = (n) =>
    "$" + Math.abs(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (clase === RECEPCION.FALTANTE) {
    return `Turno abierto con un faltante inicial de ${plata(diferencia)}. La diferencia quedó registrada.`;
  }
  if (clase === RECEPCION.SOBRANTE) {
    return `Turno abierto con un sobrante inicial de ${plata(diferencia)}. La diferencia quedó registrada.`;
  }
  if (clase === RECEPCION.COINCIDE_TOTAL) {
    return `Turno abierto con ${plata(montoInicial)} recibidos del cierre de ${quien}. La composición de billetes cambió y quedó registrada.`;
  }
  return `Turno abierto con ${plata(montoInicial)} recibidos del cierre de ${quien}.`;
}

/** Texto del botón que confirma la apertura, según el caso. */
export function accionRecepcion(clase) {
  switch (clase) {
    case RECEPCION.FALTANTE:
      return "Confirmar faltante e iniciar turno";
    case RECEPCION.SOBRANTE:
      return "Confirmar sobrante e iniciar turno";
    default:
      return "Confirmar cambio e iniciar turno";
  }
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
