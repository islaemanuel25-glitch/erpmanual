// lib/stock/control/controlStock.js
//
// LAS REGLAS DEL CONTROL DE STOCK, SIN BASE NI HTTP.
//
// El control es el conteo físico de un local. Se cuenta por sector pasando el
// lector, durante días y con varios celulares; lo que no está nunca se escanea,
// y por eso el stock falso de eso lo corrige TERMINAR, no un conteo.
//
// Lo que se decide acá, para que la pantalla y el servidor pregunten lo mismo a
// la misma función:
//
//   · cuánto mueve un conteo: el PRIMERO de un producto fija el stock en lo
//     contado, los siguientes SUMAN, y corregir o borrar ajusta por la
//     diferencia. Se aplica en el momento, así que lo que se vende después
//     sigue moviendo el stock normal y no se pisa al final;
//   · quién es "la misma persona" para corregir lo propio;
//   · el aviso de "ya contado por otro";
//   · cómo se parten los que nadie contó al terminar: los que se vendieron
//     durante el control no se tocan, el resto queda en cero.
//
// Las escrituras viven en `controlStockServer.js`. Módulo puro con imports
// relativos: lo usan el servidor, la pantalla y los candados bajo `node --test`.

import { TIPO_AJUSTE, calcularNuevoStock, validarPedidoDeAjuste } from "../ajusteManual.js";
import { UNIDAD_FISICA_STOCK } from "../escalaFisica.js";
import { ORIGEN_STOCK } from "../libro/libroStock.js";
import { diaMesAR, diaSemanaAR, horaAR } from "../../fechas/formatearFechaHora.js";

export { PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL, RUTA_CONTROL_STOCK } from "./rutasControlStock.js";

/** Las tres vistas de la pantalla: inicio (C0/C1), contar (C2), terminar (C3). */
export const VISTA_CONTROL = Object.freeze({
  INICIO: "inicio",
  CONTAR: "contar",
  TERMINAR: "terminar",
});

export const ESTADO_CONTROL = Object.freeze({
  ABIERTO: "ABIERTO",
  TERMINADO: "TERMINADO",
});

/** Lo que queda escrito en `AuditoriaStock.accion` por cada cambio del control. */
export const ACCION_AUDITORIA_CONTROL = Object.freeze({
  CONTEO: "CONTROL_CONTEO",
  CORRECCION: "CONTROL_CORRECCION",
  BORRADO: "CONTROL_BORRADO",
  PUESTO_EN_CERO: "CONTROL_PUESTO_EN_CERO",
});

/** El texto de `AuditoriaStock.motivo`: lo que se lee en la bitácora de stock. */
export const MOTIVO_AJUSTE_POR_CONTROL = "Ajuste por control";
export const motivoDelControl = (controlId) => `${MOTIVO_AJUSTE_POR_CONTROL} #${controlId}`;

/**
 * Los orígenes del libro que son VENTA: lo vendido durante el control sale de
 * acá, neto de correcciones y anulaciones, y ya en la unidad del stock. "Tuvo
 * ventas" es haber tenido al menos un movimiento de VENTA.
 */
export const ORIGENES_DE_VENTA = Object.freeze([
  ORIGEN_STOCK.VENTA,
  ORIGEN_STOCK.CORRECCION_VENTA,
  ORIGEN_STOCK.ANULACION_VENTA,
]);

// ── LA UNIDAD ──────────────────────────────────────────────────────────────

/**
 * Cómo se nombra la unidad en que el local guarda el producto. No se convierte
 * nada: la cantidad se cuenta en la misma unidad que `StockLocal`
 * (`unidadFisicaDeStock`). En un local eso es unidades o kilos; las piezas son
 * solo del fiambre de peso fijo en el depósito.
 */
export function textoDeUnidad(unidadFisica) {
  if (unidadFisica === UNIDAD_FISICA_STOCK.KG) return "kg";
  if (unidadFisica === UNIDAD_FISICA_STOCK.PIEZA) return "pzs";
  return "un";
}

/** Solo los kilos aceptan decimales al contar. */
export const admiteDecimales = (unidadFisica) => unidadFisica === UNIDAD_FISICA_STOCK.KG;

/** "−15", "1,25": el número solo, con el menos tipográfico. */
export function textoNumero(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 3 });
  return `${n < 0 ? "−" : ""}${abs}`;
}

/** "−15 un", "1,25 kg": el signo va en el texto, no solo en el color. */
export function textoCantidad(valor, unidadFisica) {
  const numero = textoNumero(valor);
  return numero === "—" ? numero : `${numero} ${textoDeUnidad(unidadFisica)}`;
}

// ── QUIÉN ──────────────────────────────────────────────────────────────────

/**
 * La persona que cuenta: el operador activo por PIN, o la cuenta si no hay
 * (dueño o admin, que pueden trabajar sin PIN). Dos conteos son de la misma
 * persona si los hizo el mismo operador, o —sin operador— la misma cuenta.
 */
export function mismaPersona(a, b) {
  if (!a || !b) return false;
  const opA = a.operadorId ?? null;
  const opB = b.operadorId ?? null;
  if (opA !== null || opB !== null) return opA === opB;
  return Number(a.usuarioId) === Number(b.usuarioId);
}

/** La clave de una persona, para agrupar. */
export const clavePersona = (c) => (c.operadorId != null ? `op:${c.operadorId}` : `us:${c.usuarioId}`);

// ── CUÁNTO MUEVE ───────────────────────────────────────────────────────────

/**
 * La cantidad contada, validada contra la unidad de la fila. Es la validación
 * de "fijar" del ajuste manual —no negativa, y entera si son piezas—: contar
 * cero es válido, es "acá no hay".
 */
export function validarCantidadContada(cantidad, unidadFisica) {
  const r = validarPedidoDeAjuste({ tipo: TIPO_AJUSTE.FIJAR, cantidad, unidadFisica });
  if (!r.ok) return r;
  return { ok: true, cantidad: r.cantidad };
}

/**
 * EL STOCK QUE DEJA UN CONTEO NUEVO.
 *
 *   · primero del producto en el control → el stock pasa a ser lo contado;
 *   · siguientes (otro lugar, otro celular) → se suma lo contado.
 *
 * `actual` es la cantidad REAL, leída bloqueada.
 */
export function stockTrasConteo({ actual, cantidad, esPrimero, allowNegativeStock }) {
  const nuevo = esPrimero
    ? calcularNuevoStock({ actual, tipo: TIPO_AJUSTE.FIJAR, cantidad, allowNegativeStock })
    : calcularNuevoStock({ actual, tipo: TIPO_AJUSTE.SUMAR, cantidad, allowNegativeStock });
  return { nuevo, ajuste: redondear3(nuevo - actual) };
}

/**
 * EL STOCK QUE DEJA CORREGIR (o borrar, que es corregir a cero) un conteo: se
 * mueve por la diferencia entre lo que dice ahora y lo que decía. El piso en
 * cero sin stock negativo es el mismo del ajuste manual.
 */
export function stockTrasCorreccion({ actual, anterior, nueva, allowNegativeStock }) {
  const diferencia = redondear3(Number(nueva) - Number(anterior));
  if (diferencia === 0) return { nuevo: actual, ajuste: 0 };
  const nuevo = calcularNuevoStock({
    actual,
    tipo: diferencia > 0 ? TIPO_AJUSTE.SUMAR : TIPO_AJUSTE.RESTAR,
    cantidad: Math.abs(diferencia),
    allowNegativeStock,
  });
  return { nuevo, ajuste: redondear3(nuevo - actual) };
}

const redondear3 = (x) => Math.round(Number(x) * 1000) / 1000;

// ── EL AVISO DE "YA CONTADO" ───────────────────────────────────────────────

/**
 * "Ya contado por Ana: 3 un · Lo tuyo se suma", o null.
 *
 * Solo mira los conteos de OTRAS personas: lo que uno mismo contó ya lo ve en
 * "Lo que contaste". Con más de una persona, cada una con lo suyo: es el mismo
 * producto, así que la cantidad de cada uno se puede leer al lado de la otra.
 *
 * @param {Array<{usuarioId, operadorId, contadoPor, cantidad}>} conteos los del
 *   producto en el control, sin borrados
 */
export function avisoYaContado(conteos, quien, unidadFisica) {
  const porPersona = new Map();
  for (const c of conteos || []) {
    if (mismaPersona(c, quien)) continue;
    const k = clavePersona(c);
    const previo = porPersona.get(k) || { nombre: c.contadoPor, cantidad: 0 };
    previo.cantidad = redondear3(previo.cantidad + Number(c.cantidad));
    porPersona.set(k, previo);
  }
  if (porPersona.size === 0) return null;
  const partes = [...porPersona.values()].map((p) => `${p.nombre}: ${textoCantidad(p.cantidad, unidadFisica)}`);
  return `Ya contado por ${partes.join(" y ")} · Lo tuyo se suma`;
}

// ── TERMINAR ───────────────────────────────────────────────────────────────

/**
 * LOS QUE NADIE CONTÓ, PARTIDOS EN DOS.
 *
 *   a) se vendieron durante el control: no se tocan. Lo que dice el sistema
 *      puede ser verdad —se vendió de lo que había— y ponerlo en cero borraría
 *      un stock real. Se muestran para ir a contarlos.
 *   b) el resto: al confirmar quedan en cero.
 *
 * @param {Array<{productoLocalId:number, stock:number}>} noContados los del
 *   universo (stock distinto de cero) sin conteo en este control
 * @param {Map<number,{vendio:boolean, vendidas:number}>} ventas por producto
 */
export function partirNoContados(noContados, ventas) {
  const vendidos = [];
  const aCero = [];
  for (const p of noContados || []) {
    const v = ventas?.get(Number(p.productoLocalId));
    if (v?.vendio) vendidos.push({ ...p, vendidas: v.vendidas });
    else aCero.push(p);
  }
  return { vendidos, aCero };
}

/**
 * El avance: contados sobre contados + sin contar. "Sin contar" es exactamente
 * la lista de Terminar —los de stock distinto de cero que nadie contó—, así que
 * los dos números salen del mismo universo. Truncado: no dice 100 si falta uno.
 */
export function porcentajeDeAvance(contados, sinContar) {
  const total = Number(contados) + Number(sinContar);
  if (!(total > 0)) return null;
  return Math.floor((Number(contados) * 100) / total);
}

// ── TEXTOS DE TIEMPO ───────────────────────────────────────────────────────

/** "lunes 20/10 14:05", en hora argentina. */
export function momentoDelControl(valor) {
  return `${diaSemanaAR(valor)} ${diaMesAR(valor)} ${horaAR(valor)}`;
}

/** "hace 5 min", "hace 2 h", "hace 3 d". Un reloj corrido no da negativos. */
export function haceCuanto(valor, ahora = Date.now()) {
  const t = new Date(valor).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.floor((Number(ahora) - t) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
