// lib/semanaOperativa/semanaOperativa.js
//
// LA SEMANA OPERATIVA DE UNA UBICACIÓN. Puro: no conoce Prisma ni HTTP.
//
// ── DE QUIÉN ES LA SEMANA ─────────────────────────────────────────────────
//
// De la ubicación: cada local, y también el depósito. No de Transferencias, ni de
// Finanzas, ni de un acuerdo entre dos ubicaciones. Todo el ERP la pregunta acá, y
// la fuente es `SemanaOperativaVigencia` (ver el comentario del modelo en
// `prisma/schema.prisma`). `AcuerdoDepositoLocal.diaDeCorte` ya no se lee.
//
// ── LA ARITMÉTICA NO SE ESCRIBE DE NUEVO ──────────────────────────────────
//
// La semana regular de un corte es `rangoDelPeriodo` (`lib/transferencias/
// periodoDePago.js`), que ya resuelve el día argentino, el corte y los bordes. Acá
// se agrega SOLO lo que una sola columna no podía decir: que el corte cambia con
// el tiempo, y cómo se empalman dos cortes.
//
// ── LAS TRES REGLAS DE UN CAMBIO DE CORTE ─────────────────────────────────
//
//   1. Un cambio rige desde una fecha D que es el PRIMER día de una semana según
//      el corte anterior. Así nunca parte una semana: la anterior termina el día
//      D − 1, igual que terminaba antes del cambio.
//   2. D es FUTURA en Argentina. La semana abierta y las anteriores no se tocan.
//   3. SEMANA LARGA (decisión de Emanuel, revisión 4 de docs/dominios/FINANZAS.md):
//      el primer día con el corte nuevo casi nunca es D, así que los días del
//      empalme —de D al día anterior al primer día de corte nuevo, entre uno y
//      seis— NO forman una mini-semana: se suman a la primera semana nueva, que
//      mide entre 8 y 13 días y queda marcada como `transicion`.
//
// ── SIN CONFIGURAR ────────────────────────────────────────────────────────
//
// Una ubicación sin vigencias se resuelve con el domingo de siempre y
// `sinConfigurar: true`, que es exactamente lo que ya hacían Transferencias y sus
// pantallas. Ese domingo NO es su configuración: lo que congele historia —la foto
// semanal, la consolidación, pagar al depósito por período— tiene que exigir
// `configurada` y no conformarse con esto.

import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import {
  DIA_DE_CORTE_POR_DEFECTO,
  UNIDADES,
  diaDeLaSemana,
  esDiaDeCorteValido,
  rangoDelPeriodo,
  sumarDias,
} from "@/lib/transferencias/periodoDePago";

/**
 * EL PERMISO DE CAMBIAR LA SEMANA OPERATIVA.
 *
 * Vive acá, al lado de la regla, y lo importan la ruta y la pantalla: un permiso
 * tipeado dos veces es un permiso que un día se escribe distinto en una de las dos.
 * No se asigna a ningún rol de sistema; Admin lo tiene por el comodín.
 */
export const PERMISO_SEMANA_OPERATIVA = "config_local.semana_operativa";

export const ORIGEN_SEMANA = Object.freeze({ MIGRACION: "MIGRACION", MANUAL: "MANUAL" });

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una fecha de vigencia como día ISO. Prisma devuelve las columnas `DATE` como un
 * `Date` a medianoche UTC, así que el día es la parte de la fecha en UTC: pasarlo
 * por la zona argentina lo correría al día anterior.
 */
export function diaDeVigencia(valor) {
  if (valor == null || valor === "") return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  const s = String(valor);
  return ISO.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
}

/**
 * Las vigencias de UNA ubicación, ordenadas: primero la de "desde siempre" y
 * después por fecha. Acepta filas de Prisma (`vigenteDesde`) o ya normalizadas
 * (`desde`). Un día fuera de 0..6 no se interpreta: la base lo impide con un CHECK,
 * y si llegara igual, suponerle un corte sería inventar la semana.
 *
 * @returns {Array<{diaDeCorte:number, desde:string|null}>}
 */
export function normalizarVigencias(filas = []) {
  return (filas || [])
    .map((f) => ({
      diaDeCorte: Number(f?.diaDeCorte),
      desde: diaDeVigencia(f?.desde !== undefined ? f.desde : f?.vigenteDesde),
    }))
    .filter((v) => esDiaDeCorteValido(v.diaDeCorte))
    .sort((a, b) => {
      if (a.desde === b.desde) return 0;
      if (a.desde === null) return -1;
      if (b.desde === null) return 1;
      return a.desde < b.desde ? -1 : 1;
    });
}

/** El índice de la vigencia que rige una fecha, o -1 si ninguna. */
function indiceVigente(vigencias, fecha) {
  let indice = -1;
  for (let i = 0; i < vigencias.length; i++) {
    const d = vigencias[i].desde;
    if (d === null || d <= fecha) indice = i;
  }
  return indice;
}

/**
 * LA SEMANA QUE CONTIENE UNA FECHA, PARA UNA UBICACIÓN.
 *
 * Es LA pregunta canónica. Todo lo demás de este módulo sale de acá.
 *
 * @param {object} args
 * @param {Array}  args.vigencias  las de la ubicación (filas o normalizadas).
 * @param {string} [args.fecha]    día ISO argentino. Por defecto, hoy.
 * @returns {{desde:string, hasta:string, diaDeCorte:number, configurada:boolean,
 *            sinConfigurar:boolean, transicion:boolean}}
 *          `desde` y `hasta` INCLUSIVOS, igual que `rangoDelPeriodo`.
 */
export function semanaQueContiene({ vigencias = [], fecha } = {}) {
  const f = fecha || hoyArgentinaISO();
  const lista = normalizarVigencias(vigencias);
  const i = indiceVigente(lista, f);

  if (i < 0) {
    const r = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: DIA_DE_CORTE_POR_DEFECTO, hoy: f });
    return {
      desde: r.desde,
      hasta: r.hasta,
      diaDeCorte: DIA_DE_CORTE_POR_DEFECTO,
      configurada: false,
      sinConfigurar: true,
      transicion: false,
    };
  }

  const vigente = lista[i];
  const corte = vigente.diaDeCorte;
  let desde;
  let hasta;
  let transicion = false;

  // ── EL EMPALME: LA SEMANA LARGA ─────────────────────────────────────────
  //
  // `inicioNuevo` es el primer día >= D que cae en el corte nuevo. Si es D mismo,
  // no hay empalme. Si no, de D a `inicioNuevo + 6` es UNA semana, larga.
  if (vigente.desde !== null) {
    const D = vigente.desde;
    const inicioNuevo = sumarDias(D, (corte - diaDeLaSemana(D) + 7) % 7);
    const finDeLaLarga = sumarDias(inicioNuevo, 6);
    if (inicioNuevo !== D && f <= finDeLaLarga) {
      desde = D;
      hasta = finDeLaLarga;
      transicion = true;
    }
  }

  if (!transicion) {
    const r = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: corte, hoy: f });
    // Una semana regular no puede empezar antes de que su corte rija. Con cambios
    // bien programados no pasa nunca; si una fila se escribiera por otro camino,
    // se recorta en vez de pisar la semana anterior.
    desde = vigente.desde !== null && r.desde < vigente.desde ? vigente.desde : r.desde;
    hasta = r.hasta;
  }

  // Y tampoco puede pasar por encima del día en que rige la vigencia siguiente:
  // ningún día pertenece a dos semanas.
  const siguiente = lista[i + 1];
  if (siguiente?.desde && hasta >= siguiente.desde) hasta = sumarDias(siguiente.desde, -1);

  return { desde, hasta, diaDeCorte: corte, configurada: true, sinConfigurar: false, transicion };
}

/**
 * La forma que ya usaban Transferencias y sus pantallas: el corte y la marca.
 * `diaDeCorte` es el de la semana que contiene la fecha.
 */
export function corteDeUbicacion(vigencias, fecha) {
  const s = semanaQueContiene({ vigencias, fecha });
  return { diaDeCorte: s.diaDeCorte, sinConfigurar: s.sinConfigurar };
}

/**
 * La pregunta "¿qué semana contiene esta fecha?" como función, para pasársela a
 * `rangoDesplazado` y a `descripcionDelPeriodo`, que caminan de a una semana.
 */
export function rangoSemanalDeUbicacion(vigencias) {
  const lista = normalizarVigencias(vigencias);
  return (fecha) => {
    const s = semanaQueContiene({ vigencias: lista, fecha });
    return { desde: s.desde, hasta: s.hasta };
  };
}

/**
 * El rango de un período para una ubicación. SEMANA sale de sus vigencias; DIA y
 * MES no dependen de ninguna configuración y siguen siendo `rangoDelPeriodo`: el
 * mes calendario es del 1 al último día, siempre.
 */
export function rangoDeUbicacion({ vigencias = [], unidad = UNIDADES.SEMANA, fecha } = {}) {
  if (unidad !== UNIDADES.SEMANA) return rangoDelPeriodo({ unidad, hoy: fecha });
  const s = semanaQueContiene({ vigencias, fecha });
  return { desde: s.desde, hasta: s.hasta };
}

/** El cambio programado que todavía no empezó, si hay uno. */
export function vigenciaPendiente(vigencias, hoy = hoyArgentinaISO()) {
  return normalizarVigencias(vigencias).find((v) => v.desde !== null && v.desde > hoy) || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAMAR UN CAMBIO
// ═══════════════════════════════════════════════════════════════════════════

export const ERROR_SEMANA = Object.freeze({
  DIA_INVALIDO: {
    codigo: "DIA_INVALIDO",
    status: 400,
    mensaje: "El día de arranque tiene que ser uno de los siete de la semana.",
  },
  FECHA_INVALIDA: {
    codigo: "FECHA_INVALIDA",
    status: 400,
    mensaje: "La fecha desde la que rige el cambio no es un día válido (AAAA-MM-DD).",
  },
  PRIMERA_CON_FECHA: {
    codigo: "PRIMERA_CON_FECHA",
    status: 400,
    mensaje:
      "Es la primera semana de esta ubicación: rige desde siempre y no se programa para una fecha.",
  },
  NO_FUTURA: {
    codigo: "NO_FUTURA",
    status: 400,
    mensaje:
      "Un cambio de semana se programa para una semana que todavía no empezó. La semana en curso y las anteriores no se tocan.",
  },
  PARTE_SEMANA: {
    codigo: "PARTE_SEMANA",
    status: 400,
    mensaje: "El cambio tiene que empezar el primer día de una semana, sin partir ninguna.",
  },
  MISMO_CORTE: {
    codigo: "MISMO_CORTE",
    status: 409,
    mensaje: "Ese ya es el día en que arranca la semana. No hay nada que cambiar.",
  },
  PENDIENTE: {
    codigo: "PENDIENTE",
    status: 409,
    mensaje:
      "Ya hay un cambio de semana programado. Para cambiarlo hay que reemplazarlo explícitamente.",
  },
});

const falla = (error, extra = {}) => ({ ok: false, ...error, ...extra });

/**
 * DECIDE UN CAMBIO DE SEMANA SIN ESCRIBIR NADA.
 *
 * @param {object} args
 * @param {Array}   args.vigencias            las actuales de la ubicación
 * @param {number}  args.diaDeCorte           el corte nuevo, 0..6
 * @param {string}  [args.desde]              día ISO; por defecto, el inicio de la
 *                                            próxima semana
 * @param {string}  args.hoy                  día ISO argentino de HOY
 * @param {boolean} [args.reemplazarPendiente] reemplazar el cambio programado que
 *                                            todavía no empezó
 * @returns {{ok:true, accion:"PRIMERA"|"PROGRAMAR", desde:string|null,
 *            reemplaza:object|null, transicion:{desde:string,hasta:string}|null}
 *          | {ok:false, codigo:string, status:number, mensaje:string}}
 */
export function planificarCambio({ vigencias = [], diaDeCorte, desde = null, hoy, reemplazarPendiente = false } = {}) {
  const dia = Number(diaDeCorte);
  if (!esDiaDeCorteValido(dia)) return falla(ERROR_SEMANA.DIA_INVALIDO);
  const h = hoy || hoyArgentinaISO();

  const todas = normalizarVigencias(vigencias);
  const pendientes = todas.filter((v) => v.desde !== null && v.desde > h);
  // Lo que ya rige o rigió. Una vigencia que empezó NO se borra ni se modifica:
  // es historia.
  const vigentes = todas.filter((v) => !(v.desde !== null && v.desde > h));

  if (pendientes.length > 0 && !reemplazarPendiente) return falla(ERROR_SEMANA.PENDIENTE);
  const reemplaza = pendientes[0] || null;

  // ── LA PRIMERA CONFIGURACIÓN RIGE DESDE SIEMPRE ─────────────────────────
  //
  // Una ubicación sin semana no tiene nada que reinterpretar: se veía con el
  // domingo por defecto MARCADO como sin configurar, y nada que congele historia
  // acepta una semana sin configurar. Es lo mismo que ya hacía la pantalla de
  // corte con un local sin acuerdo.
  if (vigentes.length === 0) {
    if (desde) return falla(ERROR_SEMANA.PRIMERA_CON_FECHA);
    return { ok: true, accion: "PRIMERA", desde: null, reemplaza, transicion: null };
  }

  const semanaDeHoy = semanaQueContiene({ vigencias: vigentes, fecha: h });
  const proxima = sumarDias(semanaDeHoy.hasta, 1);
  const d = desde || proxima;
  if (!ISO.test(String(d))) return falla(ERROR_SEMANA.FECHA_INVALIDA);
  if (d <= h) return falla(ERROR_SEMANA.NO_FUTURA, { proximaFrontera: proxima });

  // D tiene que ser el primer día de una semana según lo que ya rige: la semana
  // que contiene D − 1 tiene que terminar justo en D − 1.
  const previa = semanaQueContiene({ vigencias: vigentes, fecha: sumarDias(d, -1) });
  if (previa.hasta !== sumarDias(d, -1)) return falla(ERROR_SEMANA.PARTE_SEMANA, { proximaFrontera: proxima });
  if (previa.diaDeCorte === dia) return falla(ERROR_SEMANA.MISMO_CORTE);

  const primera = semanaQueContiene({ vigencias: [...vigentes, { diaDeCorte: dia, desde: d }], fecha: d });
  return {
    ok: true,
    accion: "PROGRAMAR",
    desde: d,
    reemplaza,
    transicion: primera.transicion ? { desde: primera.desde, hasta: primera.hasta } : null,
  };
}
