// lib/tesoreria/pantallaTesoreria.js
//
// CÓMO SE LEE LA LECTURA DE TESORERÍA EN LA PANTALLA. Puro: sin React, sin fetch.
//
// La pantalla NO recalcula plata. Base conocida, efectivo declarado, digital,
// egresos, lo verificado y lo pendiente vienen armados del servidor
// (`armarLecturaTesoreria`) y acá solo se ELIGE qué mostrar y cómo nombrarlo:
//
//   · el ESTADO de un turno o de una caja —Pendiente, Correcto, Con diferencia,
//     Parcial, Requiere revisión, Sin importe declarado— sale de los estados de
//     sus entregas y de sus actos, que ya decidió el servidor;
//   · los NOMBRES salen de los datos: la etiqueta de la caja que manda el
//     servidor, el turno operativo del catálogo, el proveedor o el gasto real;
//   · lo único que se resta en el cliente es la DIFERENCIA PREVIA de la hoja de
//     verificación —contado menos declarado, "antes de confirmar"—, que se
//     muestra y NO se envía: el servidor calcula la que queda.
//
// Las sumas que aparecen acá (el total de las entregas de una caja en la hoja,
// la diferencia de Tesorería de unos actos) son sumas de importes que ya
// vinieron del servidor, para mostrarlos juntos; ninguna entra a la base ni a
// una verificación.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { ALERTA, ESTADO_ENTREGA, etiquetaDeCaja } from "@/lib/tesoreria/lecturaTesoreria";
import { CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja";
import { conMayuscula, rangoEnLargo } from "@/lib/transferencias/descripcionDelPeriodo";
import { leerImporte, ROTULO_MEDIO_PAGO } from "@/lib/finanzas/pagosProveedores";
import { formatearMoneda } from "@/lib/moneda";
import { horaAR } from "@/lib/fechas/formatearFechaHora";

// ── LOS ESTADOS Y SU INSIGNIA ────────────────────────────────────────────

/** Los estados que dibuja la insignia del Figma (Tesorería/Insignia de estado). */
export const ESTADO_TESORERIA = Object.freeze({
  PENDIENTE: "PENDIENTE",
  CORRECTO: "CORRECTO",
  CON_DIFERENCIA: "CON_DIFERENCIA",
  PARCIAL: "PARCIAL",
  REQUIERE_REVISION: "REQUIERE_REVISION",
  SIN_IMPORTE_DECLARADO: "SIN_IMPORTE_DECLARADO",
  VERIFICADA: "VERIFICADA",
  ANULADA: "ANULADA",
});

/**
 * Texto y tono de cada insignia. El tono es un nombre semántico del tema
 * —`warning`, `success`, `danger`, `muted`—, nunca un color: el texto dice el
 * estado y el color acompaña.
 */
//
// Los textos son los del rediseño aprobado (Figma EVJ2KvVCrY0oVSowfboymQ,
// 351:707): PENDIENTE se lee "Sin verificar" y CORRECTO "Verificado". Es solo
// lo que se ve: los estados del código no cambiaron de nombre.
export const INSIGNIA_TESORERIA = Object.freeze({
  PENDIENTE: { texto: "Sin verificar", tono: "warning" },
  CORRECTO: { texto: "Verificado", tono: "success" },
  CON_DIFERENCIA: { texto: "Con diferencia", tono: "danger" },
  PARCIAL: { texto: "Parcial", tono: "warning" },
  REQUIERE_REVISION: { texto: "Requiere revisión", tono: "danger" },
  SIN_IMPORTE_DECLARADO: { texto: "Sin importe declarado", tono: "muted" },
  VERIFICADA: { texto: "Verificada", tono: "success" },
  ANULADA: { texto: "Anulada", tono: "muted" },
});

// ── NOMBRES ──────────────────────────────────────────────────────────────

/**
 * CÓMO SE LLAMA UN TURNO: el nombre del catálogo del local que mandó el
 * servidor —el que configuró el local— o "Sin turno asignado" para las cajas
 * anteriores. La tarjeta no sabe cómo se arman los grupos ni inventa nombres.
 */
export function nombreDelGrupo(grupo) {
  if (!grupo) return "";
  return String(grupo.etiqueta ?? "");
}

/** El día de un grupo en largo: "Domingo 4 de octubre". */
export function diaDelGrupo(grupo) {
  return grupo?.dia ? conMayuscula(rangoEnLargo({ desde: grupo.dia, hasta: grupo.dia })) : "";
}

/**
 * La línea de contexto de un turno: cuántas cajas, y el día cuando el período
 * tiene más de uno. NO lleva un rango horario: el turno no se define por la
 * hora, y "00:03 a 19:15" diría lo contrario.
 */
export function contextoDelGrupo(grupo, unidad, cantidadDeCajas) {
  const cajas = cantidadDeCajas === 1 ? "1 caja" : `${cantidadDeCajas} cajas`;
  return [unidad === "DIA" ? null : diaDelGrupo(grupo), cajas].filter(Boolean).join(" · ");
}

/**
 * De qué turno es una verificación. El turno quedó congelado en el acto; una
 * verificación sin turno es anterior al turno operativo y se dice así, sin
 * asignarle uno.
 */
export function turnoDeVerificacion(acto) {
  if (!acto) return "";
  if (!acto.turnoOperativo) return "Verificación anterior al turno operativo";
  const dia = acto.fechaOperativa ? conMayuscula(rangoEnLargo({ desde: acto.fechaOperativa, hasta: acto.fechaOperativa })) : "";
  return [acto.turnoOperativo.nombre || `Turno #${acto.turnoOperativo.id}`, dia].filter(Boolean).join(" · ");
}

/** La etiqueta de una caja: la que mandó el servidor, o la misma regla si no vino. */
export function etiquetaDe(caja) {
  if (!caja) return "";
  return caja.etiqueta || etiquetaDeCaja({ turnoId: caja.turnoId, operadorNombre: caja.operadorNombre ?? null });
}

/** Cómo se llama una entrega: por su clase estructural, no por un texto libre. */
export function rotuloDeEntrega(clase) {
  if (clase === CLASE_MOVIMIENTO.RECAUDACION) return "Retiro de recaudación";
  if (clase === CLASE_MOVIMIENTO.CIERRE) return "Cierre";
  return String(clase ?? "");
}

const cortoDeEntrega = (clase) => (clase === CLASE_MOVIMIENTO.RECAUDACION ? "retiro" : clase === CLASE_MOVIMIENTO.CIERRE ? "cierre" : "");

/** "Retiro $50.000 + cierre $50.000": las entregas de una caja, cada una UNA vez. */
export function notaDeEntregas(entregas = []) {
  const ordenadas = [...entregas].sort((a, b) => (String(a.instante) < String(b.instante) ? -1 : 1));
  const partes = ordenadas.map((e) => `${cortoDeEntrega(e.clase)} ${formatearMoneda(e.montoDeclarado)}`.trim());
  return conMayuscula(partes.join(" + "));
}

/** "08:02 a 14:10", o solo lo que haya. */
export function franjaHoraria(desde, hasta) {
  const a = desde ? horaAR(desde, { vacio: "" }) : "";
  const b = hasta ? horaAR(hasta, { vacio: "" }) : "";
  if (a && b) return `${a} a ${b}`;
  return a || b || "";
}

/**
 * Cómo se muestra un egreso exterior o un pago desde caja. Solo con lo que
 * trajo el servidor: lo que vino en null no se reemplaza por otro dato, se
 * omite.
 */
export function presentacionDePago(p) {
  const medio = ROTULO_MEDIO_PAGO[p.medio] || p.medio || null;
  if (p.origen === "PAGO_PROVEEDOR") {
    return {
      rotulo: p.beneficiario || "Pago a proveedor",
      nota: ["Pago a proveedor", medio].filter(Boolean).join(" · "),
    };
  }
  return {
    rotulo: p.concepto || p.beneficiario || "Gasto",
    nota: ["Gasto", p.categoria, p.concepto ? p.beneficiario : null, medio].filter(Boolean).join(" · "),
  };
}

// ── EL ESTADO DE UN TURNO COMERCIAL ──────────────────────────────────────

const tieneAlerta = (lista, codigo) => (lista || []).some((a) => a.codigo === codigo);

/**
 * LA DIFERENCIA DE TESORERÍA de unos actos de verificación: la de cada acto
 * entera —lo contado menos lo entregado—, juntas. null si no hay actos: no se
 * contó nada, que no es lo mismo que $0. No tiene nada que ver con las
 * diferencias de caja de los operadores, que no se suman en ningún lado.
 */
export function diferenciaDeActos(actos = []) {
  if (!actos.length) return null;
  return desdeCentavos(actos.reduce((s, a) => s + aCentavos(a.diferencia), 0));
}

/** La del período: sus actos completos, los mismos que suma `resumen.verificacion`. */
export function diferenciaDelPeriodo(lectura) {
  return diferenciaDeActos((lectura?.verificaciones || []).filter((a) => a.completaEnElPeriodo));
}

/**
 * "−$2.000,00 · Falta" / "+$500,00 · Sobra": el signo y la palabra van en el
 * texto, no solo en el color. null sin diferencia o con $0: no se dibuja un
 * renglón vacío.
 */
export function textoFaltaSobra(diferencia) {
  const n = Number(diferencia);
  if (diferencia == null || !Number.isFinite(n) || n === 0) return null;
  return n < 0 ? `−${formatearMoneda(-n)} · Falta` : `+${formatearMoneda(n)} · Sobra`;
}

/**
 * Los grupos en el orden de la pantalla: los turnos operativos en el orden del
 * servidor y, AL FINAL, las cajas sin turno asignado —las anteriores al turno
 * operativo—, que no compiten con los turnos de hoy.
 */
export function gruposEnOrden(grupos = []) {
  return [...grupos.filter((g) => !g.grupo.sinTurno), ...grupos.filter((g) => g.grupo.sinTurno)];
}

/**
 * La insignia de una caja DENTRO de su turno: solo cuando dice algo que la del
 * turno no dice. Si el turno está "Sin verificar" y la caja también, repetirlo
 * en cada caja no informa nada.
 */
export function insigniaDeCajaEnElTurno(estadoCaja, estadoTurno) {
  if (!estadoCaja || estadoCaja === estadoTurno) return null;
  const verificadoTurno = [ESTADO_TESORERIA.CORRECTO, ESTADO_TESORERIA.CON_DIFERENCIA, ESTADO_TESORERIA.VERIFICADA].includes(estadoTurno);
  if (estadoCaja === ESTADO_TESORERIA.VERIFICADA && verificadoTurno) return null;
  return estadoCaja;
}

/**
 * Todo lo que la pantalla necesita de UN grupo, a partir de la lectura entera.
 *
 * Los actos se separan como los separa el servidor en `grupo.verificacion`: un
 * acto es del grupo si TODAS sus entregas están acá y está completo en el
 * período; si no, cruza y se informa aparte, entero.
 */
export function lecturaDelGrupo(lectura, clave) {
  const grupo = (lectura?.grupos || []).find((g) => g.clave === clave);
  if (!grupo) return null;
  const entregas = (lectura.entregas || []).filter((e) => e.grupo === clave);
  const pendientes = entregas.filter((e) => e.estadoVerificacion !== ESTADO_ENTREGA.VERIFICADA);
  const verificadas = entregas.filter((e) => e.estadoVerificacion === ESTADO_ENTREGA.VERIFICADA);
  const actos = (lectura.verificaciones || []).filter((a) => (a.grupos || []).includes(clave));
  const completos = actos.filter((a) => a.completaEnElPeriodo && a.grupos.length === 1);
  const queCruzan = actos.filter((a) => !(a.completaEnElPeriodo && a.grupos.length === 1));
  const enRevision = actos.filter((a) => a.desactualizada);
  const sinImporte = (grupo.alertas || []).filter((a) => a.codigo === ALERTA.SIN_IMPORTE_DECLARADO).map((a) => a.turnoId);
  const cajasPorId = new Map((lectura.cajas || []).map((c) => [c.turnoId, c]));

  // La diferencia de Tesorería de un turno es la de SUS actos, cada una entera:
  // con un acto, la de ese acto; con varios, se muestran juntas. Nunca se reparte.
  const diferencia = diferenciaDeActos(completos);
  const diferenciaCentavos = diferencia == null ? null : aCentavos(diferencia);

  let estado = null;
  if (enRevision.length || entregas.some((e) => e.desactualizada)) estado = ESTADO_TESORERIA.REQUIERE_REVISION;
  else if (sinImporte.length) estado = ESTADO_TESORERIA.SIN_IMPORTE_DECLARADO;
  else if (pendientes.length && verificadas.length) estado = ESTADO_TESORERIA.PARCIAL;
  else if (pendientes.length) estado = ESTADO_TESORERIA.PENDIENTE;
  else if (verificadas.length) {
    if (diferenciaCentavos == null) estado = ESTADO_TESORERIA.VERIFICADA;
    else estado = diferenciaCentavos === 0 ? ESTADO_TESORERIA.CORRECTO : ESTADO_TESORERIA.CON_DIFERENCIA;
  }

  const cajas = (grupo.cajas || []).map((cg) => {
    const caja = cajasPorId.get(cg.turnoId) || { turnoId: cg.turnoId };
    return {
      ...cg,
      etiqueta: cg.etiqueta || etiquetaDe(caja),
      caja,
      entregas: entregas.filter((e) => e.turnoId === cg.turnoId),
      sinImporte: sinImporte.includes(cg.turnoId),
    };
  });

  return {
    grupo,
    nombre: nombreDelGrupo(grupo),
    entregas,
    pendientes,
    verificadas,
    actos,
    completos,
    queCruzan,
    enRevision,
    sinImporte,
    cajas,
    estado,
    diferencia,
  };
}

/**
 * El estado de Tesorería de UNA caja dentro de un turno: el pie de la tarjeta
 * "Caja del turno". Solo mira sus entregas.
 */
export function estadoDeCaja({ entregas = [], sinImporte = false } = {}, verificaciones = []) {
  const actos = new Map((verificaciones || []).map((a) => [a.id, a]));
  if (entregas.some((e) => e.desactualizada || actos.get(e.verificacionId)?.desactualizada)) {
    return ESTADO_TESORERIA.REQUIERE_REVISION;
  }
  if (!entregas.length) return sinImporte ? ESTADO_TESORERIA.SIN_IMPORTE_DECLARADO : null;
  const verificadas = entregas.filter((e) => e.estadoVerificacion === ESTADO_ENTREGA.VERIFICADA);
  if (verificadas.length === entregas.length) return ESTADO_TESORERIA.VERIFICADA;
  if (verificadas.length) return ESTADO_TESORERIA.PARCIAL;
  return ESTADO_TESORERIA.PENDIENTE;
}

/**
 * Las entregas a verificar, AGRUPADAS POR CAJA (`turnoId`), con el total de cada
 * una. Es lo que muestra la hoja; lo que se envía son los ids.
 */
export function entregasPorCaja(entregas = [], cajas = []) {
  const porId = new Map((cajas || []).map((c) => [c.turnoId, c]));
  const grupos = new Map();
  for (const e of entregas) {
    if (!grupos.has(e.turnoId)) grupos.set(e.turnoId, []);
    grupos.get(e.turnoId).push(e);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([turnoId, lista]) => {
      const caja = porId.get(turnoId) || { turnoId, etiqueta: lista[0]?.etiquetaCaja, operadorNombre: lista[0]?.operadorNombre };
      return {
        turnoId,
        etiqueta: lista[0]?.etiquetaCaja || etiquetaDe(caja),
        nota: notaDeEntregas(lista),
        total: desdeCentavos(lista.reduce((s, e) => s + aCentavos(e.montoDeclarado), 0)),
        entregas: lista,
      };
    });
}

/** El total declarado de unas entregas: la suma de lo que el servidor dice de cada una. */
export function totalDeclarado(entregas = []) {
  return desdeCentavos(entregas.reduce((s, e) => s + aCentavos(e.montoDeclarado), 0));
}

// ── LA HOJA DE VERIFICACIÓN ──────────────────────────────────────────────

/**
 * El importe contado, escrito como se escribe en Argentina ("108.000",
 * "185.300,50", "$ 1.000"). Usa `leerImporte` de Finanzas; lo único que agrega
 * es el CERO, que allá es un error —un pago de cero no existe— y acá es un
 * conteo válido: un sobre vacío también se cuenta.
 *
 * @returns {{centavos:number}|{error:string}}
 */
export function leerImporteContado(texto) {
  const t = String(texto ?? "").replace(/\$/g, "").replace(/\s/g, "");
  if (t === "") return { error: "Escribí cuánto contaste." };
  if (/^0+([.,]0+)?$/.test(t)) return { centavos: 0 };
  const r = leerImporte(t);
  return r.error ? { error: "El importe contado no es válido." } : { centavos: r.centavos };
}

/**
 * La diferencia que se MUESTRA antes de confirmar: contado − declarado. No se
 * envía; la que queda la calcula el servidor con el declarado de la base.
 */
export function diferenciaPrevia(declarado, contadoCentavos) {
  return desdeCentavos(contadoCentavos - aCentavos(declarado));
}

/**
 * El cuerpo EXACTO de `POST /api/finanzas/tesoreria/verificaciones`. Lo que el
 * servidor decide —declarado, diferencia, local, clase, fotos— no se manda:
 * el servidor rechaza el pedido si viene.
 */
export function cuerpoDeVerificacion({ cajaMovimientoIds, contadoCentavos, idempotencyKey, observacion }) {
  const cuerpo = {
    cajaMovimientoIds: [...cajaMovimientoIds],
    importeVerificado: desdeCentavos(contadoCentavos),
    idempotencyKey,
  };
  const obs = String(observacion ?? "").trim();
  if (obs) cuerpo.observacion = obs;
  return cuerpo;
}

/**
 * La clave de un intento de verificación. Misma forma que las de Gastos y
 * Pagos (`nuevaClaveDeGasto`): prefijo, ubicación, tiempo y azar.
 */
export function nuevaClaveDeVerificacion(localId, ahora = Date.now(), azar = Math.random().toString(36).slice(2, 10)) {
  return `verif-${localId ?? "x"}-${Number(ahora).toString(36)}-${azar}`;
}

/**
 * QUÉ CLAVE LLEVA UN ENVÍO.
 *
 * El mismo intento lógico —las mismas entregas, el mismo importe, la misma
 * observación— conserva su clave aunque se reintente por un error o un corte:
 * el servidor lo reconoce y devuelve la misma verificación. Si el contenido
 * cambió ("Cambiar importe" después de un error), es OTRO intento y lleva una
 * clave nueva; reusar la vieja sería un 409 de idempotencia.
 *
 * @param {{clave:string|null, firma:string|null}} anterior  lo del último envío
 * @returns {{clave:string, firma:string}}
 */
export function claveParaEnvio(anterior, cuerpoSinClave, generar) {
  const firma = JSON.stringify({
    ids: [...(cuerpoSinClave.cajaMovimientoIds || [])].sort((a, b) => a - b),
    importe: cuerpoSinClave.importeVerificado,
    obs: cuerpoSinClave.observacion ?? null,
  });
  if (anterior?.clave && anterior.firma === firma) return { clave: anterior.clave, firma };
  return { clave: generar(), firma };
}

// ── EL RESUMEN DEL PERÍODO ───────────────────────────────────────────────

/** Los avisos de verificaciones que requieren revisión, uno por acto. */
export function avisosDeRevision(lectura) {
  const actos = new Map((lectura?.verificaciones || []).map((a) => [a.id, a]));
  const porActo = new Map();
  for (const a of lectura?.alertas || []) {
    if (a.codigo !== ALERTA.VERIFICACION_DESACTUALIZADA) continue;
    if (!porActo.has(a.verificacionId)) porActo.set(a.verificacionId, []);
    porActo.get(a.verificacionId).push(a);
  }
  const etiquetas = new Map((lectura?.entregas || []).map((e) => [e.cajaMovimientoId, e]));
  return [...porActo.entries()].map(([id, lista]) => {
    const cajas = [...new Set(lista.map((x) => etiquetas.get(x.cajaMovimientoId)?.etiquetaCaja).filter(Boolean))];
    return { verificacionId: id, acto: actos.get(id) || null, cajas };
  });
}

/**
 * La proporción contada del efectivo declarado, 0..100, o null sin efectivo.
 * Se TRUNCA: con $9.000 pendientes sobre $8.236.500, redondear diría "100 %
 * contado" cuando falta contar. Solo dice 100 si no falta nada.
 */
export function proporcionVerificada(verificacion) {
  const declarado = aCentavos(verificacion?.entregadoDeclarado);
  if (!declarado) return null;
  return Math.floor((aCentavos(verificacion.entregadoCubiertoPorVerificaciones) * 100) / declarado);
}

/** La lectura no trajo nada que mostrar en el período. */
export function periodoSinMovimientos(lectura) {
  if (!lectura) return true;
  return (
    !(lectura.grupos || []).length &&
    !(lectura.egresosExteriores || []).length &&
    !(lectura.pagosDesdeCaja || []).length &&
    !(lectura.verificaciones || []).length &&
    !Number(lectura.resumen?.cobrosCuentaCorrienteSinUbicar?.cantidad || 0)
  );
}

/** Los actos que cruzan el período, enteros, en el orden del servidor. */
export function actosQueCruzan(lectura) {
  const ids = new Set(lectura?.resumen?.verificacion?.actosQueCruzanIds || []);
  return (lectura?.verificaciones || []).filter((a) => ids.has(a.id));
}

/** El acto por id, con el grupo al que pertenece (si es de uno solo). */
export function actoPorId(lectura, id) {
  return (lectura?.verificaciones || []).find((a) => a.id === id) || null;
}
