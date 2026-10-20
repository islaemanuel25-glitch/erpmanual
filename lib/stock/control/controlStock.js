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
//   · cuánto mueve un conteo. El campo de cada tarjeta es el TOTAL contado de
//     ese producto en el control, y escribirlo lo FIJA: el primero pone el stock
//     en ese total; cambiarlo después mueve el stock por la diferencia; borrarlo
//     deshace lo que el control le había ajustado. Se aplica en el momento, así
//     que lo que se vende después sigue moviendo el stock normal;
//   · en qué casilleros se cuenta un producto —uno en su unidad, o bultos y
//     sueltas en el depósito— y cómo se vuelve a unidades;
//   · cómo se parten los que nadie contó al terminar: los que se vendieron
//     durante el control no se tocan, el resto queda en cero.
//
// Las escrituras viven en `controlStockServer.js`. Módulo puro con imports
// relativos: lo usan el servidor, la pantalla y los candados bajo `node --test`.

import { TIPO_AJUSTE, calcularNuevoStock, validarPedidoDeAjuste } from "../ajusteManual.js";
import { UNIDAD_FISICA_STOCK } from "../escalaFisica.js";
import { ORIGEN_STOCK } from "../libro/libroStock.js";
import { esPackDeposito, unidadFisicaDeItem } from "../presentacion.js";
import { fromUnidades, toUnidades } from "../../conversiones/stock.js";
import { diaMesAR, diaSemanaAR, horaAR } from "../../fechas/formatearFechaHora.js";

export { PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL, RUTA_CONTROL_STOCK } from "./rutasControlStock.js";

/** Las vistas de la pantalla: la lista (o el inicio sin control), terminar y el informe. */
export const VISTA_CONTROL = Object.freeze({
  INICIO: "inicio",
  TERMINAR: "terminar",
  DIFERENCIAS: "diferencias",
});

/** Los chips de la lista. Todos es el de entrada y no filtra. */
export const FILTRO_CONTROL = Object.freeze({
  TODOS: "todos",
  SIN_CONTAR: "sin_contar",
  CONTADOS: "contados",
  CON_DIFERENCIA: "con_diferencia",
});
export const esFiltroControl = (f) => Object.values(FILTRO_CONTROL).includes(f);

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

/**
 * Las acciones que son AJUSTE DE UN CONTEO: las que se deshacen al borrar el
 * campo. El puesto en cero es del terminar y no cuenta: después de terminar no
 * hay campo que borrar.
 */
export const ACCIONES_DEL_CONTEO = Object.freeze([
  ACCION_AUDITORIA_CONTROL.CONTEO,
  ACCION_AUDITORIA_CONTROL.CORRECCION,
  ACCION_AUDITORIA_CONTROL.BORRADO,
]);

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

// ── LOS CASILLEROS DE UNA TARJETA ──────────────────────────────────────────

export const MODO_CASILLEROS = Object.freeze({
  // Un casillero en la unidad del stock: un, kg o pzs.
  SIMPLE: "simple",
  // Bultos + sueltas: el pack o el cajón en el depósito, cuando Stock lo lee
  // desglosado. Es la MISMA pregunta que `presentacionCantidadStock`.
  DESGLOSE: "desglose",
});

/**
 * En qué casilleros se cuenta este ítem (el del listado de Stock) en esta
 * ubicación. El desglose lo decide `esPackDeposito`, la que usa Stock para
 * escribir "4 bultos + 3 uds", así que la tarjeta se cuenta como se lee.
 */
export function casillerosDe(item, esDeposito) {
  if (esPackDeposito(item, esDeposito)) {
    return { modo: MODO_CASILLEROS.DESGLOSE, factorPack: Number(item.factorPack), unidadFisica: UNIDAD_FISICA_STOCK.UNIDAD };
  }
  const unidadFisica = unidadFisicaDeItem(item, esDeposito);
  return { modo: MODO_CASILLEROS.SIMPLE, unidadFisica, unidad: textoDeUnidad(unidadFisica), decimales: admiteDecimales(unidadFisica) };
}

/**
 * Un número escrito a mano: la coma es la decimal. Vacío es `null` —"no hay
 * nada escrito"—, y un texto que no es número es `NaN`, que no se guarda.
 */
export function leerNumero(texto, { decimales = false } = {}) {
  const t = String(texto ?? "").trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return Number.NaN;
  if (!decimales && !Number.isInteger(n)) return Number.NaN;
  return n;
}

/** El número para un casillero: "1,25", sin separador de miles. */
export const paraCasillero = (n) => (n == null ? "" : String(n).replace(".", ","));

/** Lo que muestran los casilleros para un total guardado (o vacío si no hay). */
export function casillerosDesdeTotal(total, casilleros) {
  if (total == null) return casilleros.modo === MODO_CASILLEROS.DESGLOSE ? { bultos: "", sueltas: "" } : { valor: "" };
  if (casilleros.modo === MODO_CASILLEROS.DESGLOSE) {
    const { bultos, sueltas } = fromUnidades({ unidades: total, factorPack: casilleros.factorPack });
    return { bultos: String(bultos), sueltas: String(sueltas) };
  }
  return { valor: paraCasillero(total) };
}

/**
 * EL TOTAL QUE DICEN LOS CASILLEROS, en la unidad del stock.
 *
 *   · `{ vacio: true }`  no hay nada escrito: el producto vuelve a "Sin contar";
 *   · `{ total }`        el total a guardar;
 *   · `{ invalido: true }` algo escrito que no es un número válido.
 *
 * En el desglose, bultos × factor + sueltas, con `toUnidades`, la misma
 * conversión que usa Stock. Un casillero vacío del desglose vale cero si el
 * otro tiene algo: "3 bultos" sin sueltas son 3 bultos.
 */
export function totalDeCasilleros(valores, casilleros) {
  if (casilleros.modo === MODO_CASILLEROS.DESGLOSE) {
    const b = leerNumero(valores?.bultos);
    const s = leerNumero(valores?.sueltas);
    if (b === null && s === null) return { vacio: true };
    if (Number.isNaN(b) || Number.isNaN(s) || (b ?? 0) < 0 || (s ?? 0) < 0) return { invalido: true };
    const total = toUnidades({ cantidad: b ?? 0, unidad: "BULTO", factorPack: casilleros.factorPack }) + (s ?? 0);
    return { total };
  }
  const n = leerNumero(valores?.valor, { decimales: casilleros.decimales });
  if (n === null) return { vacio: true };
  if (Number.isNaN(n) || n < 0) return { invalido: true };
  return { total: n };
}

// ── CUÁNTO MUEVE ───────────────────────────────────────────────────────────

/**
 * El total contado, validado contra la unidad de la fila. Es la validación de
 * "fijar" del ajuste manual —no negativo, y entero si son piezas—: contar cero
 * es válido, es "acá no hay".
 */
export function validarCantidadContada(cantidad, unidadFisica) {
  const r = validarPedidoDeAjuste({ tipo: TIPO_AJUSTE.FIJAR, cantidad, unidadFisica });
  if (!r.ok) return r;
  return { ok: true, cantidad: r.cantidad };
}

const redondear3 = (x) => Math.round(Number(x) * 1000) / 1000;

/**
 * EL STOCK QUE DEJA FIJAR UN TOTAL.
 *
 *   · sin total anterior en el control → el stock pasa a ser el total;
 *   · con total anterior → el stock se mueve por la diferencia, sobre lo que
 *     hay ahora: lo vendido entre dos cambios no se pisa.
 *
 * `actual` es la cantidad REAL, leída bloqueada. El piso en cero sin stock
 * negativo es el del ajuste manual.
 */
export function stockTrasFijarTotal({ actual, totalAnterior = null, total, allowNegativeStock }) {
  if (totalAnterior == null) {
    const nuevo = calcularNuevoStock({ actual, tipo: TIPO_AJUSTE.FIJAR, cantidad: total, allowNegativeStock });
    return { nuevo, ajuste: redondear3(nuevo - actual) };
  }
  const diferencia = redondear3(Number(total) - Number(totalAnterior));
  return moverPor({ actual, diferencia, allowNegativeStock });
}

/**
 * EL STOCK QUE DEJA BORRAR EL CAMPO: se deshace lo que el control le ajustó a
 * este producto —la suma de sus ajustes de conteo—, sobre lo que hay ahora.
 * Lo vendido mientras tanto sigue descontado.
 */
export function stockTrasDeshacer({ actual, ajusteNeto, allowNegativeStock }) {
  return moverPor({ actual, diferencia: redondear3(-Number(ajusteNeto)), allowNegativeStock });
}

function moverPor({ actual, diferencia, allowNegativeStock }) {
  if (diferencia === 0) return { nuevo: actual, ajuste: 0 };
  const nuevo = calcularNuevoStock({
    actual,
    tipo: diferencia > 0 ? TIPO_AJUSTE.SUMAR : TIPO_AJUSTE.RESTAR,
    cantidad: Math.abs(diferencia),
    allowNegativeStock,
  });
  return { nuevo, ajuste: redondear3(nuevo - actual) };
}

/** Lo que el control le ajustó a un producto: la suma de sus filas de auditoría de conteo. */
export function ajusteNetoDelConteo(auditorias) {
  return redondear3(
    (auditorias || [])
      .filter((a) => ACCIONES_DEL_CONTEO.includes(a.accion))
      .reduce((s, a) => s + (Number(a.cantidadNueva) - Number(a.cantidadAnterior)), 0)
  );
}

// ── LA DIFERENCIA ──────────────────────────────────────────────────────────

/**
 * Contado menos sistema, con "sistema" lo que decía antes del primer conteo de
 * este control. Negativa es faltante; positiva, sobrante.
 */
export const diferenciaDe = ({ sistema, contado }) => redondear3(Number(contado) - Number(sistema));

export const TONO_DIFERENCIA = Object.freeze({ FALTA: "danger", SOBRA: "warning", IGUAL: "success" });

/** "Faltan 2 un" en peligro, "Sobran 2 un" en advertencia o "Sin diferencia" en positivo. */
export function textoDeLaDiferencia(diferencia, unidadFisica) {
  const d = Number(diferencia);
  if (d < 0) return { texto: `Faltan ${textoCantidad(-d, unidadFisica)}`, tono: TONO_DIFERENCIA.FALTA };
  if (d > 0) return { texto: `Sobran ${textoCantidad(d, unidadFisica)}`, tono: TONO_DIFERENCIA.SOBRA };
  return { texto: "Sin diferencia", tono: TONO_DIFERENCIA.IGUAL };
}

/**
 * EL ORDEN DEL INFORME: primero los faltantes, de la plata que falta más grande
 * a la más chica; después los sobrantes, de mayor a menor. Los que no tienen
 * costo van al final de su grupo: no se pueden ordenar por plata.
 */
export function ordenarDiferencias(filas) {
  const porImporte = (a, b) => {
    if (a.importe == null && b.importe == null) return String(a.nombre).localeCompare(String(b.nombre), "es");
    if (a.importe == null) return 1;
    if (b.importe == null) return -1;
    return Math.abs(b.importe) - Math.abs(a.importe);
  };
  const faltan = filas.filter((f) => f.diferencia < 0).sort(porImporte);
  const sobran = filas.filter((f) => f.diferencia > 0).sort(porImporte);
  return [...faltan, ...sobran];
}

/**
 * LOS TOTALES DEL INFORME, EN PESOS: lo faltante y lo sobrante por separado, y
 * cuántos productos tienen diferencia. Nunca se suman cantidades de productos
 * distintos: lo único que se suma son pesos. Los que no tienen costo se cuentan
 * aparte —no valen cero—.
 */
export function totalesDeDiferencias(filas) {
  let faltante = 0;
  let sobrante = 0;
  let sinCosto = 0;
  let productos = 0;
  for (const f of filas || []) {
    if (!f.diferencia) continue;
    productos += 1;
    if (f.importe == null) {
      sinCosto += 1;
      continue;
    }
    if (f.importe < 0) faltante += -f.importe;
    else sobrante += f.importe;
  }
  const centavos = (x) => Math.round(x * 100) / 100;
  return { faltante: centavos(faltante), sobrante: centavos(sobrante), productos, sinCosto };
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

/** "lunes 20/10", en hora argentina. */
export const diaDelControl = (valor) => `${diaSemanaAR(valor)} ${diaMesAR(valor)}`;

/** "14:05", en hora argentina. */
export const horaDelConteo = (valor) => horaAR(valor);
