// lib/stock/libro/valorDelStock.js
//
// EL VALOR DEL STOCK: cuánto capital había en mercadería al empezar un período,
// cuánto al terminarlo, y de dónde salió la diferencia. Puro: no conoce Prisma.
// Las consultas viven en `valorDelStockServer.js`.
//
// ── DOS LIBROS, NINGUNA CUENTA NUEVA ─────────────────────────────────────
//
//   · La CANTIDAD sale del Libro de Stock: la copia exacta de
//     `StockLocal.cantidad`, siempre en unidades físicas (unidades, kilos o
//     piezas). Nunca en bultos.
//   · El COSTO sale del Libro de Costos: la última `CostoBaseVersion` y la última
//     `CostoUbicacionVersion` antes del momento, combinadas con
//     `precioDeLaUbicacion` y llevadas a la unidad física con
//     `costoPorUnidadFisica`. Esa función hace las dos cosas: acá no se divide
//     por ningún factor ni se multiplica por ningún peso.
//
// ── EL CORTE DIARIO DEL COSTO ────────────────────────────────────────────
//
// Cada día argentino se valoriza con el costo vigente a las 00:00 de ese día, y
// ese costo queda CONGELADO todo el día. Un cambio de costo a las 14:00 no mueve
// el valor de ese día: aparece en el corte siguiente. "A las 00:00" es "las
// versiones con `dia` anterior": el `dia` lo estampó la base con
// `libro_stock_dia`, el mismo reloj que el Libro de Stock, así que los dos
// libros cortan el día en el mismo lugar y acá no se convierte ninguna hora.
//
// ── LA CUENTA DE UN DÍA ──────────────────────────────────────────────────
//
// Con Q la cantidad y C el costo congelado del día d:
//
//   valor al abrir d   = Q(apertura d) × C(d)
//   valor al cerrar d  = Q(cierre d)   × C(d)
//   movimiento físico  = valor al cerrar d − valor al abrir d
//   Q(apertura d) × (C(d) − C(d−1)) se parte en dos (ver "Revalorización por
//   costo y reexpresión por escala", más abajo):
//     revalorización   = lo que cambió el costo comercial
//     reexpresión      = lo que cambió la escala (factor, unidad, peso…)
//
// Como el cierre de un día es la apertura del siguiente, la suma telescopa:
//
//   valor final − valor inicial = Σ físico + Σ revalorización + Σ reexpresión
//
// y se cumple EXACTA, en centavos enteros: cada término se redondea una sola
// vez y los componentes se definen como diferencias de términos ya redondeados.
//
// ── LO QUE NO SE SABE NO ES CERO ─────────────────────────────────────────
//
// Un costo que el libro no tiene —el producto no existía, el costo es cero, es un
// combo— NO vale cero. La cadena que lo necesita (con cantidad distinta de cero)
// queda FUERA de los totales y se nombra en `faltantes`; el total se marca
// incompleto. Así la identidad sigue exacta sobre lo que sí se valorizó y nada
// se disfraza de cero.
//
// ── EL STOCK NEGATIVO SE VALORIZA COMO ES ────────────────────────────────
//
// −36 unidades a $1.000 son −$36.000. No se pasa a cero ni se esconde: se marca.
//
// ── EN TRÁNSITO VA APARTE ────────────────────────────────────────────────
//
// La mercadería en viaje no es stock disponible del local: no entra en el valor
// inicial ni en el final. Se valoriza aparte con el costo que CONGELÓ la línea
// de la transferencia (`TransferenciaDetalle.precioCosto`), con
// `valorizarLineaDelRemito` —la misma cuenta que el remito—, no con el costo de
// hoy.

import { costoPorUnidadFisica, ESTADO_COSTO_FISICO } from "@/lib/conversiones/costoPorUnidadFisica";
import { valorizarLineaDelRemito } from "@/lib/transferencias/costoTransferencia";
import { sumarDias } from "@/lib/transferencias/periodoDePago";
import { ESTADO_DEL_DIA, aMilesimas, diasDelRango } from "./stockDiario.js";
import { acumularPartes, explicacionDelMovimientoFisico, repartirMovimientoFisico } from "./explicacionDelValor.js";

/** Qué se puede decir en pesos de un período. */
export const ESTADO_VALOR = Object.freeze({
  /** Ningún día del período tiene costo histórico: no hay valor, y no es cero. */
  NO_DISPONIBLE: "NO_DISPONIBLE",
  /** El período empieza antes del primer día valorizable: se valoriza desde ahí. */
  PARCIAL: "PARCIAL",
  /** Todos los días del período, ya terminados. */
  COMPLETO: "COMPLETO",
  /** Llega hasta hoy: el valor final es el de AHORA, con el costo de hoy a las 00:00. */
  EN_CURSO: "EN_CURSO",
});

/** Por qué no hay valor. */
export const MOTIVO_SIN_VALOR = Object.freeze({
  LIBRO_DE_COSTOS_INACTIVO: "LIBRO_DE_COSTOS_INACTIVO",
  SIN_LIBRO_DE_STOCK: "SIN_LIBRO_DE_STOCK",
  ANTES_DEL_PRIMER_DIA_VALORIZABLE: "ANTES_DEL_PRIMER_DIA_VALORIZABLE",
});

/** Por qué una cadena no tiene costo un día. */
export const MOTIVO_COSTO_FALTANTE = Object.freeze({
  /** El Libro de Costos no tiene versión de la ubicación o de la base a las 00:00. */
  SIN_VERSION: "SIN_VERSION",
  /** Tiene versión, pero el costo efectivo no es un precio (cero o vacío). */
  SIN_COSTO: ESTADO_COSTO_FISICO.SIN_COSTO,
  /** Un combo: no tiene stock propio. Con cantidad, algo está mal. */
  NO_APLICA: ESTADO_COSTO_FISICO.NO_APLICA,
  /** Una unidad de medida que ninguna regla resuelve. */
  CONVERSION_AMBIGUA: ESTADO_COSTO_FISICO.CONVERSION_AMBIGUA,
});

/** El tipo de versión que dice "esto dejó de existir". */
const BAJA = "BAJA";

// ════════════════════════════════════════════════════════════════════════════
// Desde cuándo hay valor
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL PRIMER DÍA QUE SE PUEDE VALORIZAR ENTERO: hace falta la apertura física
 * (el día siguiente al punto cero del Libro de Stock) y el costo de las 00:00 (el
 * día siguiente a la activación del Libro de Costos). En producción: stock desde
 * el 2026-09-28, costos activados el 2026-09-29 a las 00:17 → 2026-09-30.
 *
 * @param {{dia:string}|null} puntoCeroStock
 * @param {{dia:string}|null} activacionCostos
 * @returns {string|null}
 */
export function primerDiaValorizable({ puntoCeroStock, activacionCostos }) {
  if (!puntoCeroStock?.dia || !activacionCostos?.dia) return null;
  const a = sumarDias(puntoCeroStock.dia, 1);
  const b = sumarDias(activacionCostos.dia, 1);
  return a > b ? a : b;
}

/**
 * QUÉ SE PUEDE VALORIZAR DE UN PERÍODO. `periodo` es el de `estadoDelPeriodo`
 * (con `hastaEfectivo` ya recortado a hoy).
 *
 * @returns {{ estado, motivo, primerDia, desdeValorizado, hastaValorizado, recortado, enCurso }}
 *   `recortado`: el período pedido empieza antes del primer día valorizable, así
 *   que el "valor inicial" es el de `desdeValorizado`, no el de `desde`.
 */
export function alcanceDeLaValorizacion({ periodo, puntoCeroStock, activacionCostos }) {
  const primerDia = primerDiaValorizable({ puntoCeroStock, activacionCostos });
  const vacio = (motivo) => ({ estado: ESTADO_VALOR.NO_DISPONIBLE, motivo, primerDia, desdeValorizado: null, hastaValorizado: null, recortado: false, enCurso: false });
  if (!activacionCostos?.dia) return vacio(MOTIVO_SIN_VALOR.LIBRO_DE_COSTOS_INACTIVO);
  if (!puntoCeroStock?.dia || periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) {
    return vacio(puntoCeroStock?.dia ? MOTIVO_SIN_VALOR.ANTES_DEL_PRIMER_DIA_VALORIZABLE : MOTIVO_SIN_VALOR.SIN_LIBRO_DE_STOCK);
  }
  if (periodo.hastaEfectivo < primerDia) return vacio(MOTIVO_SIN_VALOR.ANTES_DEL_PRIMER_DIA_VALORIZABLE);
  const recortado = periodo.desde < primerDia;
  let estado = ESTADO_VALOR.COMPLETO;
  if (periodo.enCurso) estado = ESTADO_VALOR.EN_CURSO;
  if (recortado) estado = ESTADO_VALOR.PARCIAL;
  return {
    estado,
    motivo: null,
    primerDia,
    desdeValorizado: recortado ? primerDia : periodo.desde,
    hastaValorizado: periodo.hastaEfectivo,
    recortado,
    enCurso: periodo.enCurso === true,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Dinero en centavos
// ════════════════════════════════════════════════════════════════════════════

/** Redondeo simétrico: −2,5 centavos es −3, igual que 2,5 es 3. */
const redondear = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));

/** El valor en centavos de una cantidad en milésimas a un costo por unidad física. */
export const valorEnCentavos = (milesimas, costo) => redondear((milesimas * costo) / 10);

/** Centavos → pesos, para la API. null sigue siendo null. */
export const aPesos = (c) => (c === null || c === undefined ? null : c / 100);

// ════════════════════════════════════════════════════════════════════════════
// El costo congelado de un día
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL COSTO POR UNIDAD FÍSICA DE UNA CADENA, desde las dos versiones vigentes.
 * Las columnas de `CostoBaseVersion` son los nombres que acepta
 * `costoPorUnidadFisica`: la versión se le pasa tal cual.
 *
 * @param {object|null} ubicacion  la `CostoUbicacionVersion` vigente
 * @param {object|null} base       la `CostoBaseVersion` vigente de su base
 * @returns {{ costo: number|null, motivo: string|null, regla: string|null,
 *            unidadFisica: string|null, costoEfectivo: number|null, anomalias: string[] }}
 */
export function costoDeLasVersiones(ubicacion, base) {
  const faltante = (motivo, extra = {}) => ({ costo: null, motivo, regla: null, unidadFisica: null, costoEfectivo: null, anomalias: [], ...extra });
  if (!ubicacion || ubicacion.tipo === BAJA || !base || base.tipo === BAJA) return faltante(MOTIVO_COSTO_FALTANTE.SIN_VERSION);
  const r = costoPorUnidadFisica({
    costoBase: base.precioCosto,
    costoLocal: ubicacion.precioCosto,
    producto: base,
    esDeposito: ubicacion.esDeposito === true,
  });
  if (r.estado !== ESTADO_COSTO_FISICO.CONOCIDO) {
    return faltante(r.estado, { regla: r.regla, unidadFisica: r.unidadFisica, costoEfectivo: r.costoEfectivo, anomalias: r.anomalias });
  }
  return { costo: r.costoPorUnidadFisica, motivo: null, regla: r.regla, unidadFisica: r.unidadFisica, costoEfectivo: r.costoEfectivo, anomalias: r.anomalias };
}

/** El tipo de versión con el que nace una ubicación después del punto cero. */
const ALTA = "ALTA";

/** `version` viene como texto de un `bigint`: se compara como entero, no como texto. */
const versionMenorOIgual = (a, b) => BigInt(a) <= BigInt(b);

/**
 * LA LÍNEA DE TIEMPO DEL COSTO DE UNA CADENA: para cada día, el costo vigente a
 * sus 00:00.
 *
 * ── EL PRODUCTO QUE NACE DURANTE EL DÍA ─────────────────────────────────
 *
 * Si a las 00:00 la ubicación no existía en el Libro de Costos y ese mismo día
 * tiene su ALTA, no hay "costo de las 00:00" que mirar, y no es un costo que
 * falte: el producto no existía. Ese primer día se valoriza con el costo
 * efectivo de su ALTA —la versión de la ubicación y la de su base vigente en ese
 * momento, por la secuencia única del libro—, y queda congelado el resto del
 * día aunque el costo cambie después. Desde el día siguiente vuelve la regla de
 * las 00:00. Antes del alta la fila de stock no existía, así que no hay nada que
 * valorizar ni un costo anterior que inventar. Si nace sin costo válido, falta,
 * como cualquier otro.
 *
 * Esto NO toca la regla intradía de un producto que ya existía: su cambio de
 * costo del día sigue esperando al corte siguiente.
 *
 * @param {object} args
 * @param {Array} args.ubicaciones  versiones de la ubicación ordenadas por (instante,
 *   version): la vigente al abrir el primer día y las de los días del período.
 * @param {Map<number, Array>} args.basesPorId  lo mismo para cada base.
 * @returns {(dia:string) => object}  lo de `costoDeLasVersiones`, más las dos
 *   versiones que lo produjeron (`ubicacion`, `base`) y `nacioEnElDia`.
 *   Se consulta con días CRECIENTES: avanza un cursor, no busca desde el principio.
 */
export function costoCongeladoPorDia({ ubicaciones, basesPorId }) {
  let iu = -1;
  const cursorBase = new Map();
  const cache = new Map();
  const conVersiones = (clave, u, b, nacioEnElDia) => {
    if (!cache.has(clave)) cache.set(clave, { ...costoDeLasVersiones(u, b), ubicacion: u, base: b, nacioEnElDia });
    return cache.get(clave);
  };
  return (dia) => {
    // Vigente a las 00:00 del día: la última versión con `dia` anterior.
    while (iu + 1 < ubicaciones.length && ubicaciones[iu + 1].dia < dia) iu += 1;
    const u = iu >= 0 ? ubicaciones[iu] : null;

    if (!u || u.tipo === BAJA) {
      const alta = ubicaciones.find((x) => x.dia === dia && x.tipo === ALTA);
      if (alta) {
        const lista = basesPorId.get(Number(alta.productoBaseId)) ?? [];
        let b = null;
        for (const v of lista) if (versionMenorOIgual(v.version, alta.version)) b = v;
        return conVersiones(`alta|${alta.version}|${b?.version ?? "-"}`, alta, b, true);
      }
    }

    let b = null;
    if (u && u.productoBaseId !== null && u.productoBaseId !== undefined) {
      const lista = basesPorId.get(Number(u.productoBaseId)) ?? [];
      let ib = cursorBase.get(Number(u.productoBaseId)) ?? -1;
      while (ib + 1 < lista.length && lista[ib + 1].dia < dia) ib += 1;
      cursorBase.set(Number(u.productoBaseId), ib);
      b = ib >= 0 ? lista[ib] : null;
    }
    return conVersiones(`${u?.version ?? "-"}|${b?.version ?? "-"}`, u, b, false);
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Revalorización por costo y reexpresión por escala
// ════════════════════════════════════════════════════════════════════════════
//
// Entre un día y el siguiente el costo por unidad física puede cambiar por dos
// motivos distintos, y el contrato los separa:
//
//   · el COSTO COMERCIAL (`precioCosto` de la base o de la ubicación): la
//     mercadería vale otra plata — REVALORIZACIÓN POR COSTO;
//   · la ESCALA con que ese costo se lleva a la unidad física —factor, unidad de
//     medida, peso de referencia, modos, combo, si la ubicación es depósito—: el
//     mismo costo comercial equivale a otra plata por unidad — REEXPRESIÓN POR
//     ESCALA. Un pack x6 a $600 pasa a x12 a $600: cada unidad vale $50 y no $100
//     sin que nadie compre, venda ni cambie el precio.
//
// La cuenta pasa por un costo INTERMEDIO: el costo comercial nuevo leído con la
// escala vieja, con `costoPorUnidadFisica` y nada más. Con Q la cantidad al
// abrir el día:
//
//   revalorización = Q × C(costo nuevo, escala vieja) − Q × C(costo viejo, escala vieja)
//   reexpresión    = Q × C(costo nuevo, escala nueva) − Q × C(costo nuevo, escala vieja)
//
// Las dos suman exactamente Q × (C nuevo − C viejo) porque cada término se
// redondea una sola vez y el del medio se suma y se resta. Si solo cambió el
// costo, el intermedio es el nuevo y la reexpresión da cero; si solo cambió la
// escala, el intermedio es el viejo y la revalorización da cero.

const CAMPOS_DE_ESCALA_BASE = ["unidadMedida", "factorPack", "pesoReferenciaKg", "pesoEsFijo", "modoCompraProveedor", "modoVentaDeposito", "esCombo"];

/** ¿Las dos versiones leen el costo con la misma escala? */
function mismaEscala(a, b) {
  if (!a?.ubicacion || !a?.base || !b?.ubicacion || !b?.base) return false;
  if ((a.ubicacion.esDeposito === true) !== (b.ubicacion.esDeposito === true)) return false;
  return CAMPOS_DE_ESCALA_BASE.every((k) => String(a.base[k] ?? "") === String(b.base[k] ?? ""));
}

/**
 * EL COSTO INTERMEDIO: el costo comercial de `actual` leído con la escala de
 * `anterior`. Null si alguna de las dos no tiene versiones.
 */
export function costoConEscalaAnterior(anterior, actual) {
  if (!anterior?.ubicacion || !anterior?.base || !actual?.ubicacion || !actual?.base) return null;
  if (mismaEscala(anterior, actual)) return actual.costo;
  return costoDeLasVersiones(
    { ...anterior.ubicacion, precioCosto: actual.ubicacion.precioCosto },
    { ...anterior.base, precioCosto: actual.base.precioCosto }
  ).costo;
}

// ════════════════════════════════════════════════════════════════════════════
// Una cadena
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL VALOR DE UNA CADENA EN LOS DÍAS `dias`, día por día.
 *
 * @param {object} args
 * @param {string[]} args.dias              los días valorizados, en orden.
 * @param {number} args.cantidadAlAbrir     milésimas al abrir el primer día; 0 si
 *   la fila no existía (la inexistencia vale cero SOLO acá, como en la identidad
 *   de cantidades del Stock Diario: no hay mercadería que valorizar).
 * @param {Map<string, number>} args.cierres milésimas al cierre de cada día con
 *   movimientos; el resto de los días arrastra el anterior.
 * @param {(dia:string)=>object} args.costoDelDia  `costoCongeladoPorDia`.
 */
export function valorizarCadena({ dias, cantidadAlAbrir, cierres, costoDelDia, efectosPorDia = null }) {
  // Con `efectosPorDia` —los movimientos del día agrupados por (origen,
  // dirección), de `sqlEfectosPorOrigen`— el movimiento físico de cada día se
  // reparte además por origen (`explicacionDelValor.js`). Sin él, la cuenta es
  // exactamente la de siempre.
  const porOrigen = efectosPorDia ? new Map() : null;
  let desvioMaximo = 0;
  let q = cantidadAlAbrir ?? 0;
  const cantidadInicial = q;
  let negativo = q < 0;
  let faltante = null;
  let inicial = null;
  let final = null;
  let fisico = 0;
  let revalorizacion = 0;
  let reexpresion = 0;
  let cierreAnterior = null;
  let costoAnterior = null;
  let costoInicial = null;
  let costoFinal = null;
  let anomalias = [];
  let unidadFisica = null;
  let nacioEnElPeriodo = false;
  const porDia = new Array(dias.length);

  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const c = costoDelDia(d);
    const qCierre = cierres.has(d) ? cierres.get(d) : q;
    if (qCierre < 0) negativo = true;
    const necesita = q !== 0 || qCierre !== 0;
    if (i === 0) costoInicial = c.costo;
    costoFinal = c.costo;
    if (c.anomalias?.length) anomalias = c.anomalias;
    if (c.unidadFisica) unidadFisica = c.unidadFisica;
    if (c.nacioEnElDia) nacioEnElPeriodo = true;
    if (necesita && c.costo === null) {
      if (!faltante) faltante = { dia: d, motivo: c.motivo };
    }
    if (!faltante) {
      // Sin cantidad no hace falta costo: vale cero aunque el costo no se sepa.
      const vAbre = q === 0 ? 0 : valorEnCentavos(q, c.costo);
      const vCierra = qCierre === 0 ? 0 : valorEnCentavos(qCierre, c.costo);
      if (i === 0) inicial = vAbre;
      else if (q !== 0) {
        // Lo que cambió el valor de la MISMA cantidad entre el cierre de ayer y
        // la apertura de hoy: por costo comercial y por escala, por separado.
        const intermedio = costoAnterior === null ? null : costoConEscalaAnterior(costoAnterior, c);
        const vMedio = intermedio === null ? cierreAnterior : valorEnCentavos(q, intermedio);
        revalorizacion += vMedio - cierreAnterior;
        reexpresion += vAbre - vMedio;
      } else revalorizacion += vAbre - cierreAnterior;
      fisico += vCierra - vAbre;
      if (porOrigen && (vCierra !== vAbre || efectosPorDia.has(d))) {
        const { partes, desvio } = repartirMovimientoFisico(efectosPorDia.get(d) ?? [], c.costo ?? 0, vCierra - vAbre);
        acumularPartes(porOrigen, partes);
        if (Math.abs(desvio) > Math.abs(desvioMaximo)) desvioMaximo = desvio;
      }
      porDia[i] = vCierra;
      cierreAnterior = vCierra;
      final = vCierra;
    }
    costoAnterior = c;
    q = qCierre;
  }

  const completa = faltante === null;
  return {
    completa,
    faltante,
    stockNegativo: negativo,
    cantidadInicial,
    cantidadFinal: q,
    costoInicial,
    costoFinal,
    // En qué unidad está el costo: UNIDAD, KG o PIEZA (`UNIDAD_FISICA_STOCK`).
    unidadFisica,
    anomaliasDeCosto: anomalias,
    // Algún día del período se valorizó con el costo de su ALTA.
    nacioEnElPeriodo,
    inicial: completa ? inicial : null,
    final: completa ? final : null,
    fisico: completa ? fisico : null,
    revalorizacion: completa ? revalorizacion : null,
    reexpresion: completa ? reexpresion : null,
    // El movimiento físico por origen y dirección, y el mayor ajuste de
    // redondeo que hizo falta (centavos). Null sin `efectosPorDia` o sin costo.
    porOrigen: completa ? porOrigen : null,
    desvioMaximo: completa && porOrigen ? desvioMaximo : null,
    variacion: completa ? final - inicial : null,
    porDia: completa ? porDia : null,
  };
}

/** ¿Hay algo que mirar en esta cadena? Cantidad en alguna punta, o un aviso. */
export const tieneValorQueMirar = (v) => v.cantidadInicial !== 0 || v.cantidadFinal !== 0 || v.fisico !== 0 || !v.completa;

// ════════════════════════════════════════════════════════════════════════════
// El local
// ════════════════════════════════════════════════════════════════════════════

/**
 * LOS TOTALES DEL LOCAL, sumando SOLO las cadenas completas. Las que no tienen
 * costo se cuentan y se nombran, nunca se suman como cero.
 *
 * La evolución son FOTOGRAFÍAS —el valor al cierre de cada día—: no se suman
 * entre sí. El período abre con `inicial` y cierra con `final`.
 *
 * @param {Array<{productoLocalId:number, valor: ReturnType<typeof valorizarCadena>}>} cadenas
 * @param {string[]} dias
 */
export function totalesDelValor(cadenas, dias, { conExplicacion = false } = {}) {
  const t = { inicial: 0, final: 0, fisico: 0, revalorizacion: 0, reexpresion: 0 };
  const conOrigen = [];
  let desvioMaximo = 0;
  const evolucion = dias.map(() => 0);
  const faltantes = [];
  let negativas = 0;
  let valorizadas = 0;
  for (const { productoLocalId, valor } of cadenas) {
    if (valor.stockNegativo) negativas += 1;
    if (!valor.completa) {
      faltantes.push({ productoLocalId, dia: valor.faltante.dia, motivo: valor.faltante.motivo });
      continue;
    }
    valorizadas += 1;
    t.inicial += valor.inicial;
    t.final += valor.final;
    t.fisico += valor.fisico;
    t.revalorizacion += valor.revalorizacion;
    t.reexpresion += valor.reexpresion;
    for (let i = 0; i < dias.length; i++) evolucion[i] += valor.porDia[i];
    if (valor.porOrigen) {
      conOrigen.push(valor.porOrigen);
      if (Math.abs(valor.desvioMaximo ?? 0) > Math.abs(desvioMaximo)) desvioMaximo = valor.desvioMaximo;
    }
  }
  const variacion = t.final - t.inicial;
  return {
    completo: faltantes.length === 0,
    inicial: t.inicial,
    final: t.final,
    variacion,
    fisico: t.fisico,
    revalorizacion: t.revalorizacion,
    reexpresion: t.reexpresion,
    // La identidad, verificada acá y no supuesta: si alguna vez no cuadra, el
    // defecto está en la cuenta y la API lo dice.
    cuadra: variacion === t.fisico + t.revalorizacion + t.reexpresion,
    // ¿Por qué cambió? El movimiento físico por categoría de origen, con su
    // propia identidad contra `fisico`. Null si no se pidieron los orígenes.
    explicacion: conExplicacion ? { ...explicacionDelMovimientoFisico(conOrigen, t.fisico), desvioMaximoDeRedondeo: desvioMaximo } : null,
    evolucion: dias.map((dia, i) => ({ dia, valor: evolucion[i] })),
    cadenasValorizadas: valorizadas,
    cadenasConStockNegativo: negativas,
    faltantes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// En tránsito
// ════════════════════════════════════════════════════════════════════════════

/** Por qué una línea en tránsito no tiene valor. */
export const MOTIVO_TRANSITO_SIN_VALOR = Object.freeze({
  SIN_COSTO_CONGELADO: "SIN_COSTO_CONGELADO",
  NO_SE_PUDO_VALORIZAR: "NO_SE_PUDO_VALORIZAR",
});

/**
 * EL VALOR DE LO QUE ESTÁ VIAJANDO, con el costo que congeló cada línea.
 *
 * `valorizarLineaDelRemito` es la cuenta del remito: lleva el costo congelado a
 * la unidad física con el snapshot de presentación de la línea. Un costo
 * congelado nulo o cero NO se reemplaza por el de hoy —eso sería reescribir la
 * historia— ni vale cero: la línea queda sin valor y se nombra.
 *
 * Además se compara, cadena por cadena, lo que dicen los documentos con lo que
 * dice el Libro de Stock (`enTransito` de la fila del origen). Si difieren, el
 * tránsito del libro tiene unidades que ningún documento abierto explica, y eso
 * se dice.
 *
 * @param {object} args
 * @param {Array} args.lineas  las `TransferenciaDetalle` en viaje, con `base`
 *   (la escala del producto) y `productoLocalOrigenId`.
 * @param {boolean} args.origenEsDeposito
 * @param {Map<number, number>} args.transitoDelLibro  milésimas por cadena del origen.
 */
export function valorizarTransito({ lineas, origenEsDeposito, transitoDelLibro }) {
  let valor = 0;
  const sinValor = [];
  const unidadesPorCadena = new Map();
  const transferencias = new Set();
  for (const l of lineas) {
    transferencias.add(Number(l.transferenciaId));
    const precio = l.precioCosto === null || l.precioCosto === undefined ? null : Number(l.precioCosto);
    const conPrecio = Number.isFinite(precio) && precio > 0;
    let r = null;
    try {
      // Sin costo congelado se pide igual la cuenta con un precio unitario de
      // uno: las UNIDADES FÍSICAS de la línea no dependen del precio, y hacen
      // falta para conciliar con el libro. El importe de esa corrida se descarta.
      r = valorizarLineaDelRemito({ ...l, precioCosto: conPrecio ? precio : 1 }, l.base, { origenEsDeposito });
    } catch {
      r = null;
    }
    const pl = l.productoLocalOrigenId === null || l.productoLocalOrigenId === undefined ? null : Number(l.productoLocalOrigenId);
    if (pl !== null && r) unidadesPorCadena.set(pl, (unidadesPorCadena.get(pl) ?? 0) + aMilesimas(Number(r.unidadesFisicas).toFixed(3)));
    if (!conPrecio) {
      sinValor.push({ detalleId: Number(l.id), transferenciaId: Number(l.transferenciaId), productoLocalId: pl, nombre: l.nombre ?? null, motivo: MOTIVO_TRANSITO_SIN_VALOR.SIN_COSTO_CONGELADO });
      continue;
    }
    if (!r) {
      sinValor.push({ detalleId: Number(l.id), transferenciaId: Number(l.transferenciaId), productoLocalId: pl, nombre: l.nombre ?? null, motivo: MOTIVO_TRANSITO_SIN_VALOR.NO_SE_PUDO_VALORIZAR });
      continue;
    }
    valor += redondear(r.subtotal * 100);
  }
  const sinDocumento = [];
  for (const [pl, libro] of transitoDelLibro) {
    const documentos = unidadesPorCadena.get(pl) ?? 0;
    if (libro !== documentos) sinDocumento.push({ productoLocalId: pl, libro, documentos });
  }
  for (const [pl, documentos] of unidadesPorCadena) {
    if (!transitoDelLibro.has(pl) && documentos !== 0) sinDocumento.push({ productoLocalId: pl, libro: 0, documentos });
  }
  return {
    valor,
    completo: sinValor.length === 0,
    lineas: lineas.length,
    transferencias: transferencias.size,
    sinValor,
    // Diferencias en milésimas entre el libro y los documentos.
    noConciliado: sinDocumento,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// El armado
// ════════════════════════════════════════════════════════════════════════════

/**
 * LAS CANTIDADES QUE NECESITA LA VALORIZACIÓN, desde lo que trae la base:
 * `alAbrir` es el último movimiento anterior al primer día (o null), y
 * `cierres` las filas (dia, tipo, cantidadPosterior) del último movimiento de
 * cada día. Una BAJA deja la cadena en cero para valorizar: no hay mercadería.
 */
export function cantidadesDeLaCadena({ alAbrir, cierres }) {
  const leer = (m) => (!m || m.tipo === BAJA ? 0 : aMilesimas(m.cantidadPosterior) ?? 0);
  const mapa = new Map();
  for (const f of cierres ?? []) mapa.set(f.dia, leer(f));
  return { cantidadAlAbrir: leer(alAbrir), cierres: mapa };
}

/** Los días de la valorización. */
export const diasValorizados = (alcance) => (alcance.desdeValorizado ? diasDelRango(alcance.desdeValorizado, alcance.hastaValorizado) : []);
