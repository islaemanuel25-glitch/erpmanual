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
//     ese producto en el control, y aceptarlo lo FIJA contra el stock VIVO de
//     ese instante: el stock pasa a ser lo contado, y la diferencia de ese
//     conteo es contado − stock vivo. Volver a contarlo es lo mismo otra vez,
//     contra el stock vivo de ese momento; borrarlo deshace lo que el control le
//     había ajustado. Se aplica en el momento, así que lo que se vende después
//     sigue moviendo el stock normal desde lo contado, y terminar no lo pisa;
//   · la diferencia de un producto en el control: la SUMA de sus ajustes;
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
//
// Los conteos de hoy son CONTEO (el primero, o el primero después de borrar) y
// RECUENTO (volver a contarlo): los dos fijan el stock en lo contado. El
// "Corregir" de la revisión —y la reconstrucción, que es lo mismo— es
// CORRECCION_REVISION: NO es un conteo, y tiene que poder distinguirse de uno
// sin mirar la hora. CORRECCION a secas quedó de antes del 2026-10-22, y nombra
// dos cosas: el cambio de total de la versión anterior —que movía por la
// diferencia de totales— y el "Corregir" de entonces.
export const ACCION_AUDITORIA_CONTROL = Object.freeze({
  CONTEO: "CONTROL_CONTEO",
  RECUENTO: "CONTROL_RECUENTO",
  CORRECCION: "CONTROL_CORRECCION",
  CORRECCION_REVISION: "CONTROL_CORRECCION_REVISION",
  BORRADO: "CONTROL_BORRADO",
  PUESTO_EN_CERO: "CONTROL_PUESTO_EN_CERO",
});

/**
 * Las acciones que son AJUSTE DE UN CONTEO: las que se deshacen al borrar el
 * campo, y cuya suma es la diferencia del producto en el control. El puesto en
 * cero es del terminar y no cuenta: después de terminar no hay campo que
 * borrar, y su diferencia se lee aparte.
 */
export const ACCIONES_DEL_CONTEO = Object.freeze([
  ACCION_AUDITORIA_CONTROL.CONTEO,
  ACCION_AUDITORIA_CONTROL.RECUENTO,
  ACCION_AUDITORIA_CONTROL.CORRECCION,
  ACCION_AUDITORIA_CONTROL.CORRECCION_REVISION,
  ACCION_AUDITORIA_CONTROL.BORRADO,
]);

/**
 * Las acciones que escribe una persona contando, y que dejaron el stock en lo
 * contado en ese instante. CORRECCION entra por los controles de la versión
 * anterior, donde cambiar el total se escribía así; un "Corregir" de entonces
 * se distingue por la hora: es posterior a la fila vigente del conteo.
 */
export const ACCIONES_QUE_CUENTAN = Object.freeze([
  ACCION_AUDITORIA_CONTROL.CONTEO,
  ACCION_AUDITORIA_CONTROL.RECUENTO,
  ACCION_AUDITORIA_CONTROL.CORRECCION,
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
 * EL STOCK QUE DEJA ACEPTAR UN CONTEO: el stock pasa a ser lo contado, sea el
 * primero o uno que lo vuelve a contar. El ajuste —la diferencia de este
 * conteo— es contado − stock vivo, con `actual` la cantidad REAL leída
 * bloqueada en ese instante.
 *
 * No hay "total anterior" que restar: lo vendido entre dos conteos ya bajó el
 * stock vivo, y el segundo conteo se mide contra eso. Medirlo contra el total
 * anterior daba por faltante todo lo vendido en el medio.
 */
export function stockTrasFijarTotal({ actual, total, allowNegativeStock }) {
  const nuevo = calcularNuevoStock({ actual, tipo: TIPO_AJUSTE.FIJAR, cantidad: total, allowNegativeStock });
  return { nuevo, ajuste: redondear3(nuevo - actual) };
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
 * Contado menos sistema. Negativa es faltante; positiva, sobrante.
 */
export const diferenciaDe = ({ sistema, contado }) => redondear3(Number(contado) - Number(sistema));

/**
 * LA DIFERENCIA DE UN PRODUCTO CONTADO Y SU "SISTEMA".
 *
 * La diferencia es la suma de lo que el control le ajustó (`ajusteNetoDelConteo`):
 * cada conteo, contra el stock vivo de su instante. El sistema que se muestra es
 * contado − diferencia: con un solo conteo es exactamente el stock del sistema
 * al contar; con varios, es el que habría sin los ajustes del control, así el
 * renglón "Sistema · Contado · Diferencia" siempre cierra.
 */
export function diferenciaDelConteo({ contado, auditorias }) {
  const diferencia = ajusteNetoDelConteo(auditorias);
  return { diferencia, sistema: redondear3(Number(contado) - diferencia) };
}

export const TONO_DIFERENCIA = Object.freeze({ FALTA: "danger", SOBRA: "success", IGUAL: "success" });

/** "Faltan 2 un" en rojo, "Sobran 2 un" en verde o "Coincide". */
export function textoDeLaDiferencia(diferencia, unidadFisica) {
  const d = Number(diferencia);
  if (d < 0) return { texto: `Faltan ${textoCantidad(-d, unidadFisica)}`, tono: TONO_DIFERENCIA.FALTA };
  if (d > 0) return { texto: `Sobran ${textoCantidad(d, unidadFisica)}`, tono: TONO_DIFERENCIA.SOBRA };
  return { texto: "Coincide", tono: TONO_DIFERENCIA.IGUAL };
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

// ── QUÉ HACER CON LO QUE NADIE CONTÓ ───────────────────────────────────────

/**
 * La elección de quien termina, cada vez: poner en 0 lo que nadie contó y tenía
 * stock —como se hacía siempre; lo vendido durante el control no se toca— o
 * dejarlo como estaba. Viaja explícita a la ruta: sin ella, terminar no hace
 * nada.
 */
export const DECISION_NO_CONTADOS = Object.freeze({
  EN_CERO: "EN_CERO",
  COMO_ESTABAN: "COMO_ESTABAN",
});

export const esDecisionNoContados = (v) => Object.values(DECISION_NO_CONTADOS).includes(v);

export const TEXTO_FALTA_DECISION = "Falta elegir qué hacer con lo que no se contó.";

/** "3 productos no se contaron y quedaron como estaban". */
export const textoQuedaronComoEstaban = (n) =>
  `${n} ${n === 1 ? "producto no se contó y quedó como estaba" : "productos no se contaron y quedaron como estaban"}`;

// ── EL CHIP DESPUÉS DE GUARDAR ─────────────────────────────────────────────

/**
 * Lo que espera un producto que dejó de ser del chip antes de salir de la
 * lista: que se llegue a ver que quedó "✓ Contado" (o que se borró).
 */
export const ESPERA_PARA_SALIR_DEL_CHIP_MS = 1500;

/**
 * ¿El producto, como quedó, sigue siendo del chip? Contado sale de "Sin
 * contar"; borrado sale de "Contados"; sin diferencia, o borrado, sale de "Con
 * diferencia". "Todos" no saca a nadie.
 */
export function sigueEnElChip(item, chip) {
  const conteo = item?.conteo ?? null;
  if (chip === FILTRO_CONTROL.SIN_CONTAR) return conteo == null;
  if (chip === FILTRO_CONTROL.CONTADOS) return conteo != null;
  if (chip === FILTRO_CONTROL.CON_DIFERENCIA) return conteo != null && Number(conteo.diferencia) !== 0;
  return true;
}

/** El aviso de una lectura que no es de ningún producto del local. */
export const textoCodigoSinProducto = (codigo) => `No hay ningún producto con el código ${codigo}`;

// ── LA REVISIÓN: ¿EL STOCK ES LO CONTADO MÁS LO QUE PASÓ DESPUÉS? ──────────

/**
 * Cuánto se separan, en el tiempo, la fila de la bitácora de un conteo y su
 * movimiento del Libro. Se escriben en la misma transacción —la bitácora antes,
 * con la hora de la aplicación; el Libro después, con la de la base—: alcanza
 * con unos segundos de margen para encontrarlo.
 */
const MARGEN_BITACORA_LIBRO_MS = 5000;

const num = (x) => (x == null ? 0 : Number(x));

/** Por qué un producto contado no se puede reconstruir desde el Libro. */
export const MOTIVO_NO_RECONSTRUIBLE = Object.freeze({
  SIN_CONTEO_EN_LA_BITACORA: "La bitácora del control no tiene el conteo vigente.",
  SIN_MOVIMIENTO_DEL_CONTEO: "El Libro no tiene el movimiento que dejó el conteo.",
  LIBRO_NO_CIERRA: "El Libro de este producto no encadena desde que se abrió el control hasta el stock de hoy.",
  BITACORA_Y_LIBRO_DIFIEREN: "Lo que el control ajustó según la bitácora no es lo que dice el Libro.",
  VARIOS_CONTEOS_SUMADOS: "Tiene varios conteos vigentes que se sumaban: no hay un único instante del conteo.",
  // Seguido del error: lo que falló al revisarlo, que también va al log.
  NO_SE_PUDO_REVISAR: "No se pudo revisar:",
});

/**
 * LO QUE DEBERÍA HABER DE UN PRODUCTO CONTADO, leyendo el Libro.
 *
 * El conteo que manda es el que dejó la fila vigente: el último que alguien
 * aceptó —CONTEO, RECUENTO, o el cambio de total de la versión anterior, que
 * quedó como CORRECCION—. `desde` es la hora de esa fila; lo que el control
 * escribió después (el "Corregir" de la revisión) no es un conteo. Ahí el stock
 * tenía que pasar a ser lo contado, y lo que NO es del control —ventas,
 * transferencias, ajustes— se suma encima. Entonces:
 *
 *     debería = total contado + Σ movimientos posteriores que no son del control
 *
 * El ancla es el movimiento del Libro de ese conteo: el del control, de esa
 * hora, con la misma cantidad anterior y posterior que su bitácora. Si el
 * conteo no movió stock —el total era lo que había—, el ancla es la hora.
 *
 * ── LA RECONSTRUCCIÓN ───────────────────────────────────────────────────────
 *
 * Con lo mismo sale el STOCK DEL SISTEMA AL CONTAR de los conteos escritos antes
 * de que se guardara: el stock al abrir el control —la cantidad anterior del
 * primer movimiento desde entonces— más lo que no es del control hasta el
 * conteo. Contado menos eso es la diferencia que el producto TIENE que tener, y
 * corregir el stock a `deberia` la deja exactamente así. Solo vale si el Libro
 * cierra: encadenado de punta a punta hasta el stock de hoy, y con lo que el
 * control movió igual a lo que dice su bitácora. Si no, no se inventa nada.
 *
 * @param {object}   p
 * @param {number}   p.controlId
 * @param {number|null} p.contado     el total vigente, o null si no está contado
 * @param {Date|string|null} p.desde  la hora de la fila vigente del conteo
 * @param {object[]} p.auditorias     del control y el producto, por id
 * @param {object[]} p.movimientos    del Libro, del local y el producto, desde
 *                                    que se abrió el control, por id
 * @param {number}   p.actual         `StockLocal.cantidad` de hoy
 */
export function revisionDelProducto({ controlId, contado, desde = null, auditorias, movimientos, actual }) {
  if (contado == null) return null;
  const tope = desde == null ? Number.POSITIVE_INFINITY : new Date(desde).getTime() + MARGEN_BITACORA_LIBRO_MS;
  const conteo = [...(auditorias || [])]
    .reverse()
    .find((a) => ACCIONES_QUE_CUENTAN.includes(a.accion) && new Date(a.creadoEn).getTime() <= tope);
  if (!conteo) return null;
  const movs = movimientos || [];
  const delControl = (m) => m.origen === ORIGEN_STOCK.AJUSTE_POR_CONTROL && m.origenRef === String(controlId);
  const cambioDe = (m) => redondear3(num(m.cantidadPosterior) - num(m.cantidadAnterior));
  const momento = new Date(conteo.creadoEn).getTime();
  const ancla =
    movs.find(
      (m) =>
        delControl(m) &&
        new Date(m.instante).getTime() >= momento - MARGEN_BITACORA_LIBRO_MS &&
        num(m.cantidadAnterior) === num(conteo.cantidadAnterior) &&
        num(m.cantidadPosterior) === num(conteo.cantidadNueva)
    ) ?? null;
  const esPosterior = (m) => (ancla ? m.id > ancla.id : new Date(m.instante).getTime() > momento);
  const ajenos = movs.filter((m) => !delControl(m) && cambioDe(m) !== 0);
  const posteriores = ajenos.filter(esPosterior).map((m) => ({
    id: m.id,
    origen: m.origen,
    origenRef: m.origenRef ?? null,
    instante: m.instante,
    cambio: cambioDe(m),
  }));
  const sumaPosteriores = redondear3(posteriores.reduce((s, m) => s + m.cambio, 0));
  const deberia = redondear3(Number(contado) + sumaPosteriores);
  const ajuste = redondear3(deberia - Number(actual));

  // La reconstrucción: el stock al abrir más lo ajeno hasta el conteo.
  const alAbrir = movs.length ? num(movs[0].cantidadAnterior) : Number(actual);
  const sistemaAlContar = redondear3(alAbrir + ajenos.filter((m) => !esPosterior(m)).reduce((s, m) => s + cambioDe(m), 0));
  const encadena =
    movs.every((m, i) => i === 0 || num(m.cantidadAnterior) === num(movs[i - 1].cantidadPosterior)) &&
    (!movs.length || num(movs[movs.length - 1].cantidadPosterior) === Number(actual));
  const delControlEnElLibro = redondear3(movs.filter(delControl).reduce((s, m) => s + cambioDe(m), 0));
  const motivoNoReconstruible =
    num(conteo.cantidadAnterior) !== num(conteo.cantidadNueva) && !ancla
      ? MOTIVO_NO_RECONSTRUIBLE.SIN_MOVIMIENTO_DEL_CONTEO
      : !encadena
        ? MOTIVO_NO_RECONSTRUIBLE.LIBRO_NO_CIERRA
        : delControlEnElLibro !== ajusteNetoDelConteo(auditorias)
          ? MOTIVO_NO_RECONSTRUIBLE.BITACORA_Y_LIBRO_DIFIEREN
          : null;

  return {
    contado: Number(contado),
    anclaMovimientoId: ancla?.id ?? null,
    movimientosPosteriores: posteriores,
    posteriores: sumaPosteriores,
    deberia,
    actual: Number(actual),
    ajuste,
    corregir: ajuste !== 0,
    sistemaAlContar,
    diferencia: diferenciaDe({ sistema: sistemaAlContar, contado }),
    reconstruible: motivoNoReconstruible === null,
    motivoNoReconstruible,
  };
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
