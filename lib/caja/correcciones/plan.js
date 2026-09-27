// lib/caja/correcciones/plan.js
//
// CORRECCIÓN HISTÓRICA DE CAJA — EL PLAN, SIN BASE.
//
// ── QUÉ RESUELVE ───────────────────────────────────────────────────────────
//
// En producción hay incidentes de caja del error ×1000: un desglose con 23000
// billetes donde había 23. Ese número no quedó solo: el sistema lo copió al
// fondo del turno siguiente, al esperado congelado del corte, a la diferencia,
// al arqueo final, al retiro de cierre. Corregir la fuente sin las copias deja
// pantallas que se contradicen; corregir las copias a mano es inventar números.
//
// Acá se arma el PLAN: dado el estado actual de las filas y las correcciones de
// FUENTE que declara un manifiesto, cuáles campos cambian, de qué valor a qué
// valor. Las copias derivadas se calculan SOLO con las funciones canónicas del
// circuito —las mismas que usaron el corte y la confirmación—. Acá no se
// escribe ninguna fórmula de caja.
//
// ── LO QUE NO HACE ─────────────────────────────────────────────────────────
//
// No decide que 23000 era 23: el valor corregido viene escrito en el manifiesto,
// con el valor anterior esperado al lado. No crea ni borra filas. No toca
// ventas. Si un caso necesita algo de eso, el plan da error y no se aplica.
//
// Es PURO: sin Prisma, sin HTTP. El motor (`motor.js`) carga las filas, pide el
// plan, lo compara con el autorizado y lo escribe.

import { createHash } from "node:crypto";

import { aCentavos, desdeCentavos, calcularDiferencia, calcularEfectivoEsperado } from "../efectivoEsperado.js";
import { totalDesglose } from "../conteoBilletes.js";
import { validarDesgloseServidor } from "../desgloseServidor.js";
import {
  ESTADO_TURNO,
  ESTADO_CIERRE,
  ESTADO_CAMBIO,
  estadoDelTurno,
  calcularRetiroEsperado,
  calcularCierreDesdeRetiro,
  unirDesgloses,
} from "../cierreRelevo.js";
import { calcularRetiroDesdeConteo } from "../retiroRelevo.js";

import { PERMISO_CORREGIR_HISTORICO, ESTADO_MANIFIESTO } from "./permisos.js";

export { PERMISO_CORREGIR_HISTORICO, ESTADO_MANIFIESTO };
export const ACCION_CORRECCION_HISTORICA = "caja.correccion_historica";

/**
 * Las únicas correcciones de fuente que existen. No hay ninguna sobre ventas:
 * un incidente de venta por KG no se repara con esta herramienta.
 */
export const TIPO_CORRECCION = Object.freeze({
  /** Lo que se contó al recibir un sobre. Mueve el fondo del turno que lo recibió. */
  RECEPCION_SOBRE: "RECEPCION_SOBRE",
  /** El cambio separado y/o el retiro contado de un corte confirmado. */
  CORTE: "CORTE",
  /**
   * El cambio separado de un corte VENCIDO que nunca se contó, y el sobre que
   * dejó. Rama propia con sus guardas: ver `armarPlanCorteVencido`.
   */
  CAMBIO_CORTE_VENCIDO: "CAMBIO_CORTE_VENCIDO",
});

export const ESTADO_RETIRO_CONFIRMADO = "CONFIRMADO";

/**
 * Filas que esta herramienta no toca nunca, con su motivo.
 *
 * Turno 277 / corte 85: su caja está contaminada por una venta por KG mal
 * cargada (venta 9152). Esa familia se corrige por otro circuito, que empieza
 * en la venta; arreglar la caja acá dejaría la venta mal y la caja "bien".
 */
export const EXCLUSIONES = Object.freeze([
  { entidad: "Turno", id: 277, motivo: "caja contaminada por la venta por KG 9152: se corrige por otro circuito" },
  { entidad: "CierrePreparacion", id: 85, motivo: "corte del turno 277, contaminado por la venta por KG 9152" },
]);

/**
 * Qué campos puede escribir la herramienta, por entidad. Cualquier otro campo
 * que el plan cambiara es un error del plan, no una corrección.
 */
export const CAMPOS_CORREGIBLES = Object.freeze({
  Turno: [
    "montoInicial",
    "montoEsperadoEfectivo",
    "montoRealEfectivo",
    "diferenciaEfectivo",
    "efectivoRetiradoCierre",
    "fondoDejadoCierre",
  ],
  CierrePreparacion: [
    "efectivoEsperadoCorte",
    "desgloseCambio",
    "totalCambio",
    "efectivoRetiradoEsperado",
    "desgloseRetiroContado",
    "totalRetiroContado",
    "desgloseContado",
    "totalContado",
    "retiroFinal",
    "diferencia",
  ],
  RetiroPreparacion: ["efectivoEsperadoCorte", "efectivoRetiradoEsperado", "diferencia"],
  ArqueoCaja: ["efectivoEsperado", "efectivoContado", "diferencia", "efectivoRetirado", "fondoDejado"],
  CambioPendiente: ["total", "desglose", "totalRecibido", "desgloseRecibido", "diferencia"],
  CajaMovimiento: ["monto"],
});

/** Los campos que son desgloses (JSON). El resto son importes. */
export const CAMPOS_JSON = new Set(["desgloseCambio", "desgloseRetiroContado", "desgloseContado", "desglose", "desgloseRecibido"]);

/** Orden fijo de las entidades: el de los bloqueos y el de los listados. */
export const ORDEN_ENTIDADES = Object.freeze([
  "Turno",
  "CierrePreparacion",
  "RetiroPreparacion",
  "CambioPendiente",
  "ArqueoCaja",
  "CajaMovimiento",
]);

// ── Forma canónica y huella ─────────────────────────────────────────────────

/** Un valor en forma comparable: importes a número, objetos con claves ordenadas. */
export function canonico(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === "object" && typeof valor.toNumber === "function") return Number(valor.toString());
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    const salida = {};
    for (const clave of Object.keys(valor).sort()) salida[clave] = canonico(valor[clave]);
    return salida;
  }
  return valor;
}

const texto = (v) => JSON.stringify(canonico(v));

/** ¿Dos valores son el mismo dato? Importes al centavo, desgloses por contenido. */
export function mismoValor(a, b) {
  const ca = canonico(a);
  const cb = canonico(b);
  if (typeof ca === "number" && typeof cb === "number") return aCentavos(ca) === aCentavos(cb);
  return JSON.stringify(ca) === JSON.stringify(cb);
}

/** Huella del plan: lo que se autoriza es ESTE conjunto exacto de valores. */
export function huellaDelPlan({ codigo, correcciones, alcance, cambios }) {
  const contenido = { version: 1, codigo, correcciones: canonico(correcciones), alcance, cambios: canonico(cambios) };
  return createHash("sha256").update(JSON.stringify(canonico(contenido))).digest("hex");
}

// ── Manifiesto ──────────────────────────────────────────────────────────────

const CODIGO_VALIDO = /^[A-Z0-9][A-Z0-9_.-]{0,39}$/;
const CLAVES_MANIFIESTO = new Set(["codigo", "estado", "motivo", "evidencia", "dependeDe", "autorizacion", "correcciones"]);
const FUENTES_POR_TIPO = {
  [TIPO_CORRECCION.RECEPCION_SOBRE]: { id: "cambioPendienteId", campos: ["desgloseRecibido"] },
  [TIPO_CORRECCION.CORTE]: { id: "cierrePreparacionId", campos: ["desgloseCambio", "desgloseRetiroContado"] },
  [TIPO_CORRECCION.CAMBIO_CORTE_VENCIDO]: { id: "cierrePreparacionId", campos: ["desgloseCambio"] },
};

/**
 * ¿El manifiesto está bien formado? No mira la base: solo que diga lo que tiene
 * que decir, y nada que esta herramienta no sepa hacer.
 */
export function validarManifiesto(m) {
  const errores = [];
  if (!m || typeof m !== "object" || Array.isArray(m)) return { valido: false, errores: ["El manifiesto no es un objeto."] };

  for (const clave of Object.keys(m)) {
    if (!CLAVES_MANIFIESTO.has(clave)) errores.push(`El manifiesto trae una clave que no existe: ${clave}.`);
  }
  if (!CODIGO_VALIDO.test(String(m.codigo ?? ""))) errores.push("El código del incidente no es válido.");
  if (!Object.values(ESTADO_MANIFIESTO).includes(m.estado)) errores.push("El estado tiene que ser PROPUESTO o AUTORIZADO.");
  if (!String(m.motivo ?? "").trim()) errores.push("Falta el motivo.");
  if (!String(m.evidencia ?? "").trim()) errores.push("Falta la evidencia.");

  if (m.dependeDe !== undefined) {
    if (!Array.isArray(m.dependeDe) || m.dependeDe.some((c) => !CODIGO_VALIDO.test(String(c)))) {
      errores.push("`dependeDe` tiene que ser una lista de códigos.");
    } else if (m.dependeDe.includes(m.codigo)) {
      errores.push("Una corrección no puede depender de sí misma.");
    }
  }

  if (m.estado === ESTADO_MANIFIESTO.AUTORIZADO) {
    const a = m.autorizacion;
    if (!a || !/^[0-9a-f]{64}$/.test(String(a.hash ?? ""))) errores.push("Un manifiesto AUTORIZADO necesita la huella exacta autorizada.");
    if (!a || !Number.isInteger(a.autorizadoPorUsuarioId) || a.autorizadoPorUsuarioId <= 0) {
      errores.push("Un manifiesto AUTORIZADO necesita quién lo autorizó.");
    }
  }

  if (!Array.isArray(m.correcciones) || m.correcciones.length === 0) {
    errores.push("El manifiesto no trae ninguna corrección.");
  } else {
    const vistos = new Set();
    for (const [i, c] of m.correcciones.entries()) {
      const regla = FUENTES_POR_TIPO[c?.tipo];
      if (!regla) {
        errores.push(`La corrección ${i + 1} tiene un tipo que esta herramienta no maneja: ${c?.tipo}.`);
        continue;
      }
      for (const clave of Object.keys(c)) {
        if (!["tipo", regla.id, "antes", "despues"].includes(clave)) {
          errores.push(`La corrección ${i + 1} trae una clave que no existe: ${clave}.`);
        }
      }
      const id = c[regla.id];
      if (!Number.isInteger(id) || id <= 0) errores.push(`La corrección ${i + 1} no dice qué fila corrige (${regla.id}).`);
      const clave = `${c.tipo}#${id}`;
      if (vistos.has(clave)) errores.push(`La fila ${clave} aparece dos veces.`);
      vistos.add(clave);

      const despues = c.despues ?? {};
      const antes = c.antes ?? {};
      const campos = Object.keys(despues);
      if (campos.length === 0) errores.push(`La corrección ${i + 1} no dice qué valor corregido autoriza.`);
      for (const campo of campos) {
        if (!regla.campos.includes(campo)) errores.push(`La corrección ${i + 1} no puede corregir ${campo}.`);
        // El valor anterior es obligatorio: sin él, se podría corregir la fila
        // equivocada y el plan lo aceptaría.
        if (!(campo in antes)) errores.push(`La corrección ${i + 1} no declara el valor anterior de ${campo}.`);
      }
      for (const campo of Object.keys(antes)) {
        if (!(campo in despues)) errores.push(`La corrección ${i + 1} declara el valor anterior de ${campo} sin corregirlo.`);
      }
    }
    // El corte vencido tiene su propia rama y sus propias guardas: no se mezcla
    // con otras correcciones, que pasarían por las reglas de los turnos cerrados.
    const vencidos = m.correcciones.filter((c) => c?.tipo === TIPO_CORRECCION.CAMBIO_CORTE_VENCIDO).length;
    if (vencidos > 0 && m.correcciones.length !== 1) {
      errores.push("Un manifiesto de corte vencido sin conteo trae exactamente una corrección, y ninguna otra.");
    }
  }

  return { valido: errores.length === 0, errores };
}

// ── El alcance ──────────────────────────────────────────────────────────────

/**
 * El alcance es un objeto { Turno: { [id]: fila }, CierrePreparacion: {...}, ... }
 * con las filas ya leídas, sus importes en número y sus desgloses en objeto.
 * Lo arma el motor; acá se lo recorre.
 */
const filas = (alcance, entidad) => Object.values(alcance?.[entidad] ?? {});
const clonar = (alcance) => JSON.parse(JSON.stringify(alcance));

/** El alcance como lista ordenada de "Entidad#id": entra en la huella. */
export function listaDelAlcance(alcance) {
  const lista = [];
  for (const entidad of ORDEN_ENTIDADES) {
    for (const id of Object.keys(alcance?.[entidad] ?? {}).map(Number).sort((a, b) => a - b)) {
      lista.push(`${entidad}#${id}`);
    }
  }
  return lista;
}

/**
 * El esperado de un corte o de un arqueo, si el fondo del turno hubiera sido
 * otro. La cuenta la hace `calcularEfectivoEsperado`, la función del circuito:
 * se le pregunta cuánto aporta cada fondo y se reemplaza uno por el otro. No
 * hay una fórmula propia.
 */
export function esperadoConOtroFondo(esperado, fondoAntes, fondoDespues) {
  const aporte = (fondo) => aCentavos(calcularEfectivoEsperado({ montoInicial: fondo }).efectivoEsperado);
  return desdeCentavos(aCentavos(esperado) - aporte(fondoAntes) + aporte(fondoDespues));
}

// ── El plan ─────────────────────────────────────────────────────────────────

/**
 * Deriva el estado corregido y la lista de cambios.
 *
 * @param {object} alcance   filas actuales (ver arriba)
 * @param {object} manifiesto ya validado
 * @returns {{ errores: string[], estado: object, cambios: object[],
 *             tocadas: string[], sinCambio: string[] }}
 */
export function armarPlan(alcance, manifiesto) {
  // El corte vencido sin conteo no pasa por nada de lo que sigue: su turno no
  // está cerrado y su corte no está confirmado, que son justamente las dos
  // guardas de abajo. Tiene su propia rama en vez de aflojarlas.
  if (manifiesto.correcciones.some((c) => c.tipo === TIPO_CORRECCION.CAMBIO_CORTE_VENCIDO)) {
    return armarPlanCorteVencido(alcance, manifiesto);
  }

  const errores = [];
  const estado = clonar(alcance);

  // ── Guardas: sobre qué filas NO se corrige nada ──
  for (const { entidad, id, motivo } of EXCLUSIONES) {
    if (alcance?.[entidad]?.[id]) errores.push(`${entidad} #${id} está excluido de esta herramienta: ${motivo}.`);
  }
  for (const t of filas(alcance, "Turno")) {
    if (t.anuladoEn) errores.push(`El turno #${t.id} está anulado.`);
    else if (estadoDelTurno(t) !== ESTADO_TURNO.CERRADO) {
      errores.push(`El turno #${t.id} no está cerrado: una corrección histórica solo toca turnos cerrados.`);
    }
  }
  for (const c of filas(alcance, "CierrePreparacion")) {
    if (c.estado === ESTADO_CIERRE.VENCIDO || c.estado === ESTADO_CIERRE.PREPARANDO) {
      errores.push(`El corte #${c.id} está ${c.estado}: no se corrige con esta herramienta.`);
    } else if (c.estado === ESTADO_CIERRE.CERRADO_SIN_CONTEO) {
      errores.push(`El corte #${c.id} se cerró sin conteo: no hay conteo que corregir.`);
    }
  }
  for (const r of filas(alcance, "RetiroPreparacion")) {
    if (r.estado === "PREPARANDO") errores.push(`El retiro #${r.id} está en preparación.`);
  }
  if (errores.length) return { errores, estado, cambios: [], tocadas: [], sinCambio: listaDelAlcance(alcance) };

  const turnosConFondoMovido = new Set();
  const cortesARecalcular = new Set();

  // ── 1. Recepciones: lo contado al recibir el sobre, y el fondo del turno ──
  for (const c of manifiesto.correcciones.filter((x) => x.tipo === TIPO_CORRECCION.RECEPCION_SOBRE)) {
    const sobre = estado.CambioPendiente?.[c.cambioPendienteId];
    if (!sobre) {
      errores.push(`El sobre #${c.cambioPendienteId} no está en el alcance.`);
      continue;
    }
    if (sobre.estado !== "RECIBIDO" || !sobre.turnoDestinoId) {
      errores.push(`El sobre #${sobre.id} no fue recibido por ningún turno.`);
      continue;
    }
    if (!mismoValor(sobre.desgloseRecibido, c.antes.desgloseRecibido)) {
      errores.push(`El sobre #${sobre.id} no tiene el desglose recibido que declara el manifiesto.`);
      continue;
    }
    const v = validarDesgloseServidor(c.despues.desgloseRecibido, { etiqueta: "conteo recibido corregido", permitirVacio: false });
    if (!v.valido) {
      errores.push(`Sobre #${sobre.id}: ${v.error}`);
      continue;
    }
    const turno = estado.Turno?.[sobre.turnoDestinoId];
    if (!turno) {
      errores.push(`El turno #${sobre.turnoDestinoId}, que recibió el sobre #${sobre.id}, no está en el alcance.`);
      continue;
    }
    // El fondo del turno TIENE que haber salido de este sobre. Si no coincide,
    // alguien lo tocó después y el plan no sabe de qué valor partir.
    if (!mismoValor(turno.montoInicial, sobre.totalRecibido)) {
      errores.push(`El fondo del turno #${turno.id} no coincide con lo recibido del sobre #${sobre.id}.`);
      continue;
    }

    const fondoAntes = turno.montoInicial;
    sobre.desgloseRecibido = v.desglose;
    sobre.totalRecibido = v.total;
    turno.montoInicial = v.total;

    // El fondo entra en todos los esperados que se congelaron en ese turno.
    for (const a of filas(estado, "ArqueoCaja").filter((x) => x.turnoId === turno.id)) {
      a.efectivoEsperado = esperadoConOtroFondo(a.efectivoEsperado, fondoAntes, v.total);
      if (a.efectivoContado != null) a.diferencia = calcularDiferencia(a.efectivoContado, a.efectivoEsperado);
    }
    for (const r of filas(estado, "RetiroPreparacion").filter((x) => x.turnoId === turno.id && x.estado === ESTADO_RETIRO_CONFIRMADO)) {
      r.efectivoEsperadoCorte = esperadoConOtroFondo(r.efectivoEsperadoCorte, fondoAntes, v.total);
    }
    for (const k of filas(estado, "CierrePreparacion").filter((x) => x.turnoId === turno.id && x.estado === ESTADO_CIERRE.CONFIRMADO)) {
      k.efectivoEsperadoCorte = esperadoConOtroFondo(k.efectivoEsperadoCorte, fondoAntes, v.total);
      cortesARecalcular.add(k.id);
    }
    if (turno.montoEsperadoEfectivo != null) {
      turno.montoEsperadoEfectivo = esperadoConOtroFondo(turno.montoEsperadoEfectivo, fondoAntes, v.total);
    }
    turnosConFondoMovido.add(turno.id);
  }

  // ── 2. Cortes: el cambio separado y/o el retiro contado ──
  for (const c of manifiesto.correcciones.filter((x) => x.tipo === TIPO_CORRECCION.CORTE)) {
    const corte = estado.CierrePreparacion?.[c.cierrePreparacionId];
    if (!corte) {
      errores.push(`El corte #${c.cierrePreparacionId} no está en el alcance.`);
      continue;
    }
    if (corte.estado !== ESTADO_CIERRE.CONFIRMADO) {
      errores.push(`El corte #${corte.id} no está confirmado.`);
      continue;
    }
    if (corte.efectivoRetiradoEsperado == null) {
      // Orden anterior: se contaba todo el cajón y el cambio se elegía al final.
      // Sus cuentas son otras; no hay ningún incidente de esa forma en la tanda.
      errores.push(`El corte #${corte.id} es del orden anterior: esta herramienta todavía no lo corrige.`);
      continue;
    }
    for (const campo of Object.keys(c.despues)) {
      if (!mismoValor(corte[campo], c.antes[campo])) {
        errores.push(`El corte #${corte.id} no tiene el ${campo} que declara el manifiesto.`);
        continue;
      }
      const v = validarDesgloseServidor(c.despues[campo], { etiqueta: `${campo} corregido`, permitirVacio: true });
      if (!v.valido) {
        errores.push(`Corte #${corte.id}: ${v.error}`);
        continue;
      }
      corte[campo] = v.desglose;
      if (campo === "desgloseCambio") corte.totalCambio = v.total;
      if (campo === "desgloseRetiroContado") corte.totalRetiroContado = v.total;
    }
    cortesARecalcular.add(corte.id);
  }

  if (errores.length) return { errores, estado, cambios: [], tocadas: [], sinCambio: listaDelAlcance(alcance) };

  // ── 3. Lo que se deriva, con las funciones del circuito ──

  // Retiros parciales cuyo esperado se movió: la misma cuenta que al confirmarlos.
  for (const r of filas(estado, "RetiroPreparacion").filter((x) => turnosConFondoMovido.has(x.turnoId) && x.estado === ESTADO_RETIRO_CONFIRMADO)) {
    r.efectivoRetiradoEsperado = calcularRetiroEsperado({ efectivoEsperadoCorte: r.efectivoEsperadoCorte, totalCambio: r.totalCambio });
    const cuentas = calcularRetiroDesdeConteo({
      totalRetiroContado: r.totalRetiroContado,
      totalCambio: r.totalCambio,
      efectivoRetiradoEsperado: r.efectivoRetiradoEsperado,
    });
    if (!cuentas.valido) {
      errores.push(`Retiro #${r.id}: ${cuentas.error}`);
      continue;
    }
    r.diferencia = cuentas.diferencia;
    const arqueo = r.arqueoCajaId ? estado.ArqueoCaja?.[r.arqueoCajaId] : null;
    if (arqueo) {
      arqueo.efectivoEsperado = r.efectivoEsperadoCorte;
      arqueo.efectivoContado = cuentas.totalCajonDerivado;
      arqueo.diferencia = cuentas.diferencia;
    }
  }

  // Cortes: la misma cuenta que hace la confirmación.
  for (const id of cortesARecalcular) {
    const corte = estado.CierrePreparacion[id];
    corte.efectivoRetiradoEsperado = calcularRetiroEsperado({
      efectivoEsperadoCorte: corte.efectivoEsperadoCorte,
      totalCambio: corte.totalCambio,
    });
    const cuentas = calcularCierreDesdeRetiro({
      totalRetiroContado: corte.totalRetiroContado,
      totalCambio: corte.totalCambio,
      efectivoRetiradoEsperado: corte.efectivoRetiradoEsperado,
    });
    if (!cuentas.valido) {
      errores.push(`Corte #${corte.id}: ${cuentas.error}`);
      continue;
    }
    corte.desgloseContado = unirDesgloses(corte.desgloseRetiroContado ?? {}, corte.desgloseCambio ?? {});
    corte.totalContado = cuentas.totalCajonDerivado;
    corte.retiroFinal = cuentas.retiroFinal;
    corte.diferencia = cuentas.diferencia;

    const turno = estado.Turno?.[corte.turnoId];
    if (!turno) {
      errores.push(`El turno #${corte.turnoId} del corte #${corte.id} no está en el alcance.`);
      continue;
    }
    // Lo que la confirmación escribió en el turno, con los mismos significados.
    turno.montoEsperadoEfectivo = corte.efectivoEsperadoCorte;
    turno.montoRealEfectivo = cuentas.totalCajonDerivado;
    turno.diferenciaEfectivo = cuentas.diferencia;
    turno.efectivoRetiradoCierre = cuentas.retiroFinal;
    turno.fondoDejadoCierre = cuentas.totalCambio;

    const arqueo = corte.arqueoFinalId ? estado.ArqueoCaja?.[corte.arqueoFinalId] : null;
    if (!arqueo) {
      errores.push(`El corte #${corte.id} no tiene su arqueo final en el alcance.`);
      continue;
    }
    arqueo.efectivoEsperado = corte.efectivoEsperadoCorte;
    arqueo.efectivoContado = cuentas.totalCajonDerivado;
    arqueo.diferencia = cuentas.diferencia;
    arqueo.efectivoRetirado = cuentas.retiroFinal;
    arqueo.fondoDejado = cuentas.totalCambio;

    // El retiro de cierre: se corrige el importe, nunca se crea ni se borra.
    const movimiento = turno.retiroCierreMovimientoId ? estado.CajaMovimiento?.[turno.retiroCierreMovimientoId] : null;
    if (aCentavos(cuentas.retiroFinal) > 0) {
      if (!movimiento) errores.push(`El turno #${turno.id} no tiene retiro de cierre y la corrección necesitaría crearlo.`);
      else movimiento.monto = cuentas.retiroFinal;
    } else if (movimiento) {
      errores.push(`La corrección deja en $0 el retiro de cierre del turno #${turno.id}: habría que borrar el movimiento.`);
    }

    // El sobre que dejó el corte lleva el cambio corregido.
    const sobre = filas(estado, "CambioPendiente").find((s) => s.cierrePreparacionId === corte.id);
    if (sobre) {
      sobre.total = corte.totalCambio;
      sobre.desglose = corte.desgloseCambio ?? {};
    }
  }

  // Turnos sin corte confirmado (cierre clásico) cuyo fondo se movió: el
  // esperado ya se corrió arriba; la diferencia sale de la función del circuito.
  for (const id of turnosConFondoMovido) {
    const turno = estado.Turno[id];
    const conCorte = filas(estado, "CierrePreparacion").some((k) => k.turnoId === id && k.estado === ESTADO_CIERRE.CONFIRMADO);
    if (!conCorte && turno.montoRealEfectivo != null && turno.montoEsperadoEfectivo != null) {
      turno.diferenciaEfectivo = calcularDiferencia(turno.montoRealEfectivo, turno.montoEsperadoEfectivo);
    }
  }

  // La diferencia de recepción de cada sobre recibido: la misma cuenta que al abrir.
  for (const s of filas(estado, "CambioPendiente")) {
    if (s.estado === "RECIBIDO" && s.totalRecibido != null) {
      s.diferencia = calcularDiferencia(s.totalRecibido, s.total);
    }
  }

  if (errores.length) return { errores, estado, cambios: [], tocadas: [], sinCambio: listaDelAlcance(alcance) };

  return { errores: [], estado, ...compararAlcances(alcance, estado, errores) };
}

// ── El corte vencido sin conteo ─────────────────────────────────────────────
//
// Un corte que se tomó con el cambio ×1000 y nunca se contó: el cajero se fue,
// el corte quedó VENCIDO y su turno sigue en CIERRE_EN_PREPARACION. Lo único
// que se sabe del dinero es el cambio, y lo sabe el turno que RECIBIÓ el sobre
// y lo contó. Se corrige ese cambio, el retiro esperado que se deriva de él y
// el sobre que lo llevó. Nada más.
//
// Lo que NO se sabe se queda sin saber: el cajón del turno nunca se contó, así
// que su contado y su diferencia siguen en null. Un cero sería inventar que se
// contó y cuadró. Cerrar ese turno es otra operación —"cerrar sin conteo"—,
// posterior y separada.

/** Lo único que puede cambiar un plan de corte vencido. */
export const CAMPOS_CORTE_VENCIDO = Object.freeze({
  CierrePreparacion: ["desgloseCambio", "totalCambio", "efectivoRetiradoEsperado"],
  CambioPendiente: ["desglose", "total", "diferencia"],
});

/** Estados del sobre con los que no se corrige: alguien lo está contando, o se deshizo. */
const SOBRE_NO_CORREGIBLE = new Set([ESTADO_CAMBIO.RESERVADO, ESTADO_CAMBIO.CANCELADO]);

function armarPlanCorteVencido(alcance, manifiesto) {
  const errores = [];
  const estado = clonar(alcance);
  const rechazar = () => ({ errores, estado, cambios: [], tocadas: [], sinCambio: listaDelAlcance(alcance) });

  for (const { entidad, id, motivo } of EXCLUSIONES) {
    if (alcance?.[entidad]?.[id]) errores.push(`${entidad} #${id} está excluido de esta herramienta: ${motivo}.`);
  }
  const [c, ...otras] = manifiesto.correcciones;
  if (otras.length || c?.tipo !== TIPO_CORRECCION.CAMBIO_CORTE_VENCIDO) {
    errores.push("Un manifiesto de corte vencido sin conteo trae exactamente una corrección, y ninguna otra.");
    return rechazar();
  }

  // ── El corte y su turno ──
  const corte = estado.CierrePreparacion?.[c.cierrePreparacionId];
  if (!corte) {
    errores.push(`El corte #${c.cierrePreparacionId} no está en el alcance.`);
    return rechazar();
  }
  if (corte.estado !== ESTADO_CIERRE.VENCIDO) {
    errores.push(`El corte #${corte.id} está ${corte.estado}: esta corrección es solo para un corte VENCIDO que nunca se contó.`);
  }
  const turno = estado.Turno?.[corte.turnoId];
  if (!turno) {
    errores.push(`El turno #${corte.turnoId} del corte #${corte.id} no está en el alcance.`);
    return rechazar();
  }
  const estadoTurno = estadoDelTurno(turno);
  if (estadoTurno !== ESTADO_TURNO.CIERRE_EN_PREPARACION) {
    errores.push(`El turno #${turno.id} está ${estadoTurno}: esta corrección es solo para un turno en CIERRE_EN_PREPARACION.`);
  }
  if (turno.montoRealEfectivo != null || turno.diferenciaEfectivo != null) {
    errores.push(`El turno #${turno.id} tiene conteo: no es un corte que nunca se contó.`);
  }
  if (turno.retiroCierreMovimientoId != null) errores.push(`El turno #${turno.id} tiene retiro de cierre.`);

  // ── Nunca se contó: ni cajón, ni retiro, ni arqueo ──
  if (corte.desgloseContado != null || corte.totalContado != null) errores.push(`El corte #${corte.id} tiene conteo del cajón.`);
  if (corte.desgloseRetiroContado != null || corte.totalRetiroContado != null || corte.retiroFinal != null) {
    errores.push(`El corte #${corte.id} tiene retiro contado.`);
  }
  if (corte.diferencia != null) errores.push(`El corte #${corte.id} tiene diferencia: se contó.`);
  if (corte.arqueoFinalId != null) errores.push(`El corte #${corte.id} tiene arqueo final.`);
  for (const a of filas(estado, "ArqueoCaja").filter((x) => x.turnoId === turno.id)) {
    errores.push(`El turno #${turno.id} tiene el arqueo #${a.id}.`);
  }
  for (const k of filas(estado, "CierrePreparacion").filter((x) => x.turnoId === turno.id && x.id !== corte.id)) {
    if (k.estado !== ESTADO_CIERRE.CANCELADO) errores.push(`El turno #${turno.id} tiene otro corte, el #${k.id}, ${k.estado}.`);
  }
  for (const r of filas(estado, "RetiroPreparacion").filter((x) => x.turnoId === turno.id && x.estado === "PREPARANDO")) {
    errores.push(`El retiro #${r.id} del turno #${turno.id} está en preparación.`);
  }
  if (corte.efectivoRetiradoEsperado == null) {
    errores.push(`El corte #${corte.id} es del orden anterior: esta herramienta todavía no lo corrige.`);
  }
  if (!mismoValor(corte.desgloseCambio, c.antes.desgloseCambio)) {
    errores.push(`El corte #${corte.id} no tiene el desgloseCambio que declara el manifiesto.`);
  }

  // ── El sobre que dejó el corte, y quien lo recibió ──
  const sobres = filas(estado, "CambioPendiente").filter((s) => s.cierrePreparacionId === corte.id);
  const sobre = sobres.length === 1 ? sobres[0] : null;
  if (!sobre) {
    errores.push(sobres.length ? `El corte #${corte.id} tiene más de un sobre.` : `El corte #${corte.id} no tiene el sobre que dejó en el alcance.`);
  } else {
    if (sobre.turnoOrigenId !== corte.turnoId) errores.push(`El sobre #${sobre.id} no salió del turno del corte #${corte.id}.`);
    if (!mismoValor(sobre.desglose, corte.desgloseCambio) || !mismoValor(sobre.total, corte.totalCambio)) {
      errores.push(`El sobre #${sobre.id} no lleva el cambio del corte #${corte.id}.`);
    }
    if (SOBRE_NO_CORREGIBLE.has(sobre.estado)) errores.push(`El sobre #${sobre.id} está ${sobre.estado}.`);
    if (sobre.estado === ESTADO_CAMBIO.RECIBIDO) {
      // Lo que contó el receptor es la evidencia: no se toca. Y su fondo tiene
      // que seguir siendo eso, o alguien lo movió y el plan no sabe de dónde parte.
      const receptor = sobre.turnoDestinoId ? estado.Turno?.[sobre.turnoDestinoId] : null;
      if (!receptor) errores.push(`El turno que recibió el sobre #${sobre.id} no está en el alcance.`);
      else if (!mismoValor(receptor.montoInicial, sobre.totalRecibido)) {
        errores.push(`El fondo del turno #${receptor.id} no coincide con lo recibido del sobre #${sobre.id}.`);
      }
    }
  }

  const v = validarDesgloseServidor(c.despues.desgloseCambio, { etiqueta: "cambio corregido", permitirVacio: false });
  if (!v.valido) errores.push(`Corte #${corte.id}: ${v.error}`);
  if (errores.length) return rechazar();

  // ── El cambio, lo que se deriva de él, y el sobre ──
  corte.desgloseCambio = v.desglose;
  corte.totalCambio = v.total;
  corte.efectivoRetiradoEsperado = calcularRetiroEsperado({ efectivoEsperadoCorte: corte.efectivoEsperadoCorte, totalCambio: corte.totalCambio });
  sobre.desglose = v.desglose;
  sobre.total = v.total;
  if (sobre.estado === ESTADO_CAMBIO.RECIBIDO) sobre.diferencia = calcularDiferencia(sobre.totalRecibido, sobre.total);

  const comparado = compararAlcances(alcance, estado, errores);
  const propias = new Set([`CierrePreparacion#${corte.id}`, `CambioPendiente#${sobre.id}`]);
  for (const x of comparado.cambios) {
    if (!propias.has(`${x.entidad}#${x.id}`) || !CAMPOS_CORTE_VENCIDO[x.entidad]?.includes(x.campo)) {
      errores.push(`El plan de un corte vencido cambiaría ${x.entidad} #${x.id}.${x.campo}, que no le corresponde.`);
    }
  }
  if (errores.length) return rechazar();
  return { errores: [], estado, ...comparado };
}

/** Qué cambió entre dos alcances, campo por campo, y qué filas quedaron igual. */
export function compararAlcances(antes, despues, errores = []) {
  const cambios = [];
  const tocadas = [];
  const sinCambio = [];
  for (const entidad of ORDEN_ENTIDADES) {
    const ids = Object.keys(antes?.[entidad] ?? {}).map(Number).sort((a, b) => a - b);
    for (const id of ids) {
      const a = antes[entidad][id];
      const d = despues[entidad][id];
      let tocada = false;
      for (const campo of Object.keys(a)) {
        if (mismoValor(a[campo], d[campo])) continue;
        if (!CAMPOS_CORREGIBLES[entidad]?.includes(campo)) {
          errores.push(`El plan cambiaría ${entidad} #${id}.${campo}, que no es corregible.`);
          continue;
        }
        cambios.push({ entidad, id, campo, antes: canonico(a[campo]), despues: canonico(d[campo]) });
        tocada = true;
      }
      (tocada ? tocadas : sinCambio).push(`${entidad}#${id}`);
    }
  }
  return { cambios, tocadas, sinCambio };
}

// ── Invariantes ─────────────────────────────────────────────────────────────

/**
 * Las identidades del circuito, sobre las filas TOCADAS. Se evalúan dos veces:
 * sobre el plan, y sobre lo que quedó escrito en la base. No deciden ningún
 * valor: si una falla, no se aplica.
 */
export function invariantes(estado, tocadas = []) {
  const resultado = [];
  const tocada = new Set(tocadas);
  const agregar = (nombre, ok, detalle = "") => resultado.push({ nombre, ok: Boolean(ok), detalle });
  const iguales = (a, b) => aCentavos(a) === aCentavos(b);

  for (const c of filas(estado, "CierrePreparacion")) {
    if (!tocada.has(`CierrePreparacion#${c.id}`)) continue;
    if (c.estado === ESTADO_CIERRE.VENCIDO) {
      // Un corte que nunca se contó: sus identidades son las del cambio, y lo
      // que no se contó tiene que seguir sin contar. Desconocido no es cero.
      const t = estado.Turno?.[c.turnoId];
      agregar(`corte #${c.id}: el desglose del cambio suma su total`, iguales(totalDesglose(c.desgloseCambio ?? {}), c.totalCambio));
      agregar(
        `corte #${c.id}: retiro esperado = esperado − cambio`,
        iguales(c.efectivoRetiradoEsperado, calcularRetiroEsperado({ efectivoEsperadoCorte: c.efectivoEsperadoCorte, totalCambio: c.totalCambio }))
      );
      agregar(
        `corte #${c.id}: sigue sin conteo, sin retiro contado, sin diferencia y sin arqueo`,
        [c.desgloseContado, c.totalContado, c.desgloseRetiroContado, c.totalRetiroContado, c.retiroFinal, c.diferencia, c.arqueoFinalId].every((x) => x == null)
      );
      if (t) agregar(`turno #${t.id}: su contado y su diferencia siguen desconocidos`, t.montoRealEfectivo == null && t.diferenciaEfectivo == null);
      const s = filas(estado, "CambioPendiente").find((x) => x.cierrePreparacionId === c.id);
      if (s) agregar(`sobre #${s.id}: lleva el cambio del corte`, iguales(s.total, c.totalCambio) && mismoValor(s.desglose ?? {}, c.desgloseCambio ?? {}));
      continue;
    }
    agregar(`corte #${c.id}: el desglose del cambio suma su total`, iguales(totalDesglose(c.desgloseCambio ?? {}), c.totalCambio));
    agregar(`corte #${c.id}: el desglose del retiro suma su total`, iguales(totalDesglose(c.desgloseRetiroContado ?? {}), c.totalRetiroContado));
    agregar(`corte #${c.id}: el desglose del cajón suma su total`, iguales(totalDesglose(c.desgloseContado ?? {}), c.totalContado));
    agregar(`corte #${c.id}: cajón = retiro + cambio`, aCentavos(c.totalContado) === aCentavos(c.totalRetiroContado) + aCentavos(c.totalCambio));
    agregar(
      `corte #${c.id}: retiro esperado = esperado − cambio`,
      iguales(c.efectivoRetiradoEsperado, calcularRetiroEsperado({ efectivoEsperadoCorte: c.efectivoEsperadoCorte, totalCambio: c.totalCambio }))
    );
    agregar(`corte #${c.id}: diferencia = retiro − retiro esperado`, iguales(c.diferencia, calcularDiferencia(c.totalRetiroContado, c.efectivoRetiradoEsperado)));
    const t = estado.Turno?.[c.turnoId];
    if (t) {
      agregar(`turno #${t.id}: esperado = el del corte`, iguales(t.montoEsperadoEfectivo, c.efectivoEsperadoCorte));
      agregar(`turno #${t.id}: contado = cajón del corte`, iguales(t.montoRealEfectivo, c.totalContado));
      agregar(`turno #${t.id}: diferencia = la del corte`, iguales(t.diferenciaEfectivo, c.diferencia));
      agregar(`turno #${t.id}: retirado = retiro final`, iguales(t.efectivoRetiradoCierre, c.retiroFinal));
      agregar(`turno #${t.id}: fondo dejado = cambio`, iguales(t.fondoDejadoCierre, c.totalCambio));
      const m = t.retiroCierreMovimientoId ? estado.CajaMovimiento?.[t.retiroCierreMovimientoId] : null;
      if (m) agregar(`movimiento #${m.id}: retiro de cierre = retiro final`, iguales(m.monto, c.retiroFinal));
    }
    const a = c.arqueoFinalId ? estado.ArqueoCaja?.[c.arqueoFinalId] : null;
    if (a) {
      agregar(
        `arqueo #${a.id}: igual al corte`,
        iguales(a.efectivoEsperado, c.efectivoEsperadoCorte) &&
          iguales(a.efectivoContado, c.totalContado) &&
          iguales(a.diferencia, c.diferencia) &&
          iguales(a.efectivoRetirado, c.retiroFinal) &&
          iguales(a.fondoDejado, c.totalCambio)
      );
    }
    const s = filas(estado, "CambioPendiente").find((x) => x.cierrePreparacionId === c.id);
    if (s) agregar(`sobre #${s.id}: lleva el cambio del corte`, iguales(s.total, c.totalCambio) && mismoValor(s.desglose ?? {}, c.desgloseCambio ?? {}));
  }

  for (const s of filas(estado, "CambioPendiente")) {
    if (!tocada.has(`CambioPendiente#${s.id}`)) continue;
    agregar(`sobre #${s.id}: el desglose suma su total`, iguales(totalDesglose(s.desglose ?? {}), s.total));
    if (s.estado === "RECIBIDO") {
      agregar(`sobre #${s.id}: el desglose recibido suma lo recibido`, iguales(totalDesglose(s.desgloseRecibido ?? {}), s.totalRecibido));
      agregar(`sobre #${s.id}: diferencia = recibido − total`, iguales(s.diferencia, calcularDiferencia(s.totalRecibido, s.total)));
      const t = estado.Turno?.[s.turnoDestinoId];
      if (t) agregar(`turno #${t.id}: fondo = lo recibido del sobre #${s.id}`, iguales(t.montoInicial, s.totalRecibido));
    }
  }

  for (const r of filas(estado, "RetiroPreparacion")) {
    if (!tocada.has(`RetiroPreparacion#${r.id}`)) continue;
    agregar(
      `retiro #${r.id}: retiro esperado = esperado − cambio`,
      iguales(r.efectivoRetiradoEsperado, calcularRetiroEsperado({ efectivoEsperadoCorte: r.efectivoEsperadoCorte, totalCambio: r.totalCambio }))
    );
    agregar(`retiro #${r.id}: diferencia = retiro − retiro esperado`, iguales(r.diferencia, calcularDiferencia(r.totalRetiroContado, r.efectivoRetiradoEsperado)));
  }

  return resultado;
}

/** Texto corto de un valor para la bitácora y la pantalla. */
export function textoDeValor(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return texto(v);
  return String(v);
}
