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
//     servidor, el día del grupo provisorio, el proveedor o el gasto real;
//   · lo único que se resta en el cliente es la DIFERENCIA PREVIA de la hoja de
//     verificación —contado menos declarado, "antes de confirmar"—, que se
//     muestra y NO se envía: el servidor calcula la que queda.
//
// Las sumas que aparecen acá (el cobrado declarado de un turno, el cobrado por
// POS de una caja) son sumas de importes que ya vinieron del servidor, para
// mostrarlos juntos; ninguna entra a la base ni a una verificación.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { ALERTA, ESTADO_ENTREGA, etiquetaDeCaja } from "@/lib/tesoreria/lecturaTesoreria";
import { CRITERIO_TURNO_COMERCIAL } from "@/lib/tesoreria/turnoComercial";
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
export const INSIGNIA_TESORERIA = Object.freeze({
  PENDIENTE: { texto: "Pendiente", tono: "warning" },
  CORRECTO: { texto: "Correcto", tono: "success" },
  CON_DIFERENCIA: { texto: "Con diferencia", tono: "danger" },
  PARCIAL: { texto: "Parcial", tono: "warning" },
  REQUIERE_REVISION: { texto: "Requiere revisión", tono: "danger" },
  SIN_IMPORTE_DECLARADO: { texto: "Sin importe declarado", tono: "muted" },
  VERIFICADA: { texto: "Verificada", tono: "success" },
  ANULADA: { texto: "Anulada", tono: "muted" },
});

// ── NOMBRES ──────────────────────────────────────────────────────────────

/**
 * CÓMO SE LLAMA UN TURNO COMERCIAL.
 *
 * Hoy el servidor agrupa provisoriamente por día (`PROVISORIO_DIA_OPERATIVO`) y
 * su etiqueta es la fecha ISO: se nombra el día en largo, con el mismo texto que
 * el encabezado de período. Con cualquier otro criterio —el día que existan las
 * franjas, "Turno Mañana"— la etiqueta del servidor va tal cual: la tarjeta no
 * sabe cómo se arman los grupos.
 */
export function nombreDelGrupo(grupo) {
  if (!grupo) return "";
  if (grupo.criterio === CRITERIO_TURNO_COMERCIAL && grupo.dia && grupo.etiqueta === grupo.dia) {
    return conMayuscula(rangoEnLargo({ desde: grupo.dia, hasta: grupo.dia }));
  }
  return String(grupo.etiqueta ?? "");
}

/** "Turnos del día" con Día; "Turnos del período" con el resto. */
export function rotuloDeTurnos(unidad) {
  return unidad === "DIA" ? "TURNOS DEL DÍA" : "TURNOS DEL PERÍODO";
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

/** "Mercado Pago $5.000 · Crédito $5.000", sin el efectivo: es lo que cobró el POS. */
export function notaDeDigitales(cobradoPorMedio = []) {
  return cobradoPorMedio
    .filter((m) => !m.esEfectivo)
    .map((m) => `${m.rotulo} ${formatearMoneda(m.montoDeclarado)}`)
    .join(" · ");
}

/** El total digital de una lista de medios, para mostrarlo junto. */
export function totalDigital(cobradoPorMedio = []) {
  return desdeCentavos(cobradoPorMedio.filter((m) => !m.esEfectivo).reduce((s, m) => s + aCentavos(m.montoDeclarado), 0));
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
  const diferenciaCentavos = completos.length ? completos.reduce((s, a) => s + aCentavos(a.diferencia), 0) : null;

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
    diferencia: diferenciaCentavos == null ? null : desdeCentavos(diferenciaCentavos),
    cobradoDeclarado: desdeCentavos(aCentavos(grupo.efectivoDeclaradoEntregado) + aCentavos(grupo.digitalCobradoDeclarado)),
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

/** El pie de la caja: en qué estado de Tesorería está su efectivo. */
export function pieDeCaja(estado, entregas = []) {
  const ids = [...new Set(entregas.map((e) => e.verificacionId).filter(Boolean))];
  const nombres = ids.map((id) => `#${id}`).join(", ");
  switch (estado) {
    case ESTADO_TESORERIA.VERIFICADA:
      return `Tesorería: en la verificación ${nombres}`;
    case ESTADO_TESORERIA.REQUIERE_REVISION:
      return `Tesorería: verificación ${nombres} requiere revisión`;
    case ESTADO_TESORERIA.PARCIAL:
      return "Tesorería: parte del efectivo verificado";
    case ESTADO_TESORERIA.SIN_IMPORTE_DECLARADO:
      return "Cerró sin conteo: no hay importe declarado";
    case ESTADO_TESORERIA.PENDIENTE:
      return "Tesorería: pendiente de verificar";
    default:
      return "Sin entregas de efectivo en el período";
  }
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
