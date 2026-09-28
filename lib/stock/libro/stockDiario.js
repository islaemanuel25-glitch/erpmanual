// lib/stock/libro/stockDiario.js
//
// EL STOCK DIARIO: con cuánto empezó, qué movimientos tuvo y con cuánto terminó
// cada producto en cada ubicación, un día o un período. Puro: no conoce Prisma.
// Las consultas viven en `stockDiarioServer.js`.
//
// ── NO HAY UNA SEGUNDA FUENTE DE VERDAD ──────────────────────────────────
//
// Todo lo de acá se deriva de `MovimientoStock` al consultar. No hay foto
// diaria, ni cron de medianoche, ni tabla de saldos: el libro guarda el saldo
// POSTERIOR de cada movimiento, así que el estado de una cadena en cualquier
// momento es el del último movimiento anterior a ese momento. Si algún día
// hiciera falta una caché, tiene que poder reconstruirse desde el libro y no
// decidir nada.
//
// ── EL DÍA ───────────────────────────────────────────────────────────────
//
// Es el día argentino, de las 00:00 de `America/Argentina/Cordoba` a las 00:00
// del día siguiente, y es la columna `dia` que la base calculó y guardó en el
// momento del cambio. No se recalcula desde `instante`, no pasa por `Date` de
// JavaScript —`new Date("2026-09-28")` es la medianoche UTC, que en Argentina
// es el día ANTERIOR— y "hoy" lo decide PostgreSQL, no Node. Acá los días son
// texto `YYYY-MM-DD` y se comparan como texto, que para ese formato es lo mismo
// que compararlos como fechas.
//
// ── CERO NO ES "NO EXISTE" ───────────────────────────────────────────────
//
// Cada apertura y cada cierre llevan su EXISTENCIA aparte del número:
// `EXISTE` con cero significa "había cero"; `NO_EXISTE` significa que la fila de
// stock no existía (todavía no nacía, o ya se había borrado); `DESCONOCIDA`
// significa que el libro no lo sabe (antes del punto cero). Los dos últimos no
// llevan número: `cantidad` y `enTransito` van en null. Solo la identidad
// algebraica de `cuadraLaCadena` cuenta la inexistencia como cero, y ahí se
// queda.
//
// ── CANTIDAD Y EN TRÁNSITO ───────────────────────────────────────────────
//
// Van siempre por separado: cada uno con su apertura, sus movimientos y su
// cierre. Nunca se suman entre sí. Un "disponible" sería otra métrica, con
// nombre y definición propios, y no está en este archivo.
//
// ── LOS NÚMEROS ──────────────────────────────────────────────────────────
//
// Las cantidades son `Decimal(12, 3)`. La base las manda como TEXTO y acá se
// suman en milésimas enteras, así una suma de miles de movimientos no arrastra
// el error de coma flotante. Recién al devolver se dividen por mil.

import { TIPO_MOVIMIENTO, SIN_ORIGEN } from "./libroStock.js";
import { semanaQueContiene } from "@/lib/semanaOperativa/semanaOperativa";
import { rangoDelPeriodo, sumarDias, UNIDADES } from "@/lib/transferencias/periodoDePago";

const { ESTADO_INICIAL, ALTA, CAMBIO, BAJA } = TIPO_MOVIMIENTO;

/**
 * EL PUNTO CERO DEL LIBRO EN PRODUCCIÓN. Es un dato del despliegue del
 * 2026-09-28 (`docs/deploy/MIGRACIONES-SIN-APLICAR.md`), no una regla: la
 * consulta lee el punto cero DEL LIBRO que está mirando (`puntoCeroDelLibro`),
 * porque una base de desarrollo o un backup restaurado tienen el suyo. Esto
 * sirve para comparar: si en producción el libro dijera otra cosa, algo cambió.
 */
export const PUNTO_CERO_PRODUCCION = Object.freeze({
  instanteUTC: "2026-09-28T00:19:13.587Z",
  instanteArgentina: "2026-09-27 21:19:13.587",
  dia: "2026-09-27",
  primerDiaCompleto: "2026-09-28",
});

/** Qué se sabe de un día o de un período. */
export const ESTADO_DEL_DIA = Object.freeze({
  /** Antes del punto cero: no hay historia y no se devuelven números. */
  FUERA_DE_HISTORIA: "FUERA_DE_HISTORIA",
  /** El día del punto cero, o un período que lo incluye: se sabe desde el punto cero. */
  PARCIAL_PUNTO_CERO: "PARCIAL_PUNTO_CERO",
  /** Un día entero ya terminado, con apertura y cierre exactos. */
  COMPLETO: "COMPLETO",
  /** Hoy: la apertura es exacta y el cierre es provisional. */
  EN_CURSO: "EN_CURSO",
});

/** Si la fila de stock existía en ese momento. Nunca se representa con un número. */
export const EXISTENCIA = Object.freeze({
  EXISTE: "EXISTE",
  NO_EXISTE: "NO_EXISTE",
  DESCONOCIDA: "DESCONOCIDA",
});

/** Por qué una existencia es DESCONOCIDA. */
export const MOTIVO_DESCONOCIDA = Object.freeze({
  /** El día del punto cero empezó antes de que existiera el libro. */
  SIN_APERTURA_HISTORICA: "SIN_APERTURA_HISTORICA",
  /** El día consultado es anterior al punto cero. */
  FUERA_DE_HISTORIA: "FUERA_DE_HISTORIA",
});

/** Qué le hace un movimiento a la cadena. */
export const EFECTO = Object.freeze({
  /** ESTADO_INICIAL: el estado que el libro encontró al activarse. No es un movimiento. */
  PUNTO_DE_PARTIDA: "PUNTO_DE_PARTIDA",
  /** ALTA: la fila nace con un saldo. No hay delta: antes no existía. */
  APARECE: "APARECE",
  /** CAMBIO: el único con delta. */
  CAMBIO: "CAMBIO",
  /** BAJA: la fila se borra con un saldo. No hay delta: después no existe. */
  DESAPARECE: "DESAPARECE",
});

const EFECTO_DEL_TIPO = Object.freeze({
  [ESTADO_INICIAL]: EFECTO.PUNTO_DE_PARTIDA,
  [ALTA]: EFECTO.APARECE,
  [CAMBIO]: EFECTO.CAMBIO,
  [BAJA]: EFECTO.DESAPARECE,
});

/** Cómo se lee SIN_ORIGEN: la causa sin clasificar, no una cantidad dudosa. */
export const TEXTO_SIN_ORIGEN = "sin clasificar";

/** De dónde sale el nombre que se muestra. El libro no guarda los cambios de nombre. */
export const FUENTE_IDENTIDAD = Object.freeze({
  /** El producto sigue existiendo: nombre, código y categoría de HOY. */
  ACTUAL: "ACTUAL",
  /** El producto ya no existe: lo que la BAJA congeló. Sin categoría. */
  CONGELADA_EN_BAJA: "CONGELADA_EN_BAJA",
  /** Ni el producto ni una BAJA con identidad: solo los números de la cadena. */
  DESCONOCIDA: "DESCONOCIDA",
});

/** La clave del grupo de los productos que ya no existen, al agrupar por categoría. */
export const GRUPO_PRODUCTO_ELIMINADO = "PRODUCTO_ELIMINADO";
/** Y la de los que existen sin categoría. */
export const GRUPO_SIN_CATEGORIA = "SIN_CATEGORIA";

export const UNIDAD_DE_PERIODO = Object.freeze({ DIA: "DIA", SEMANA: "SEMANA", MES: "MES", ANIO: "ANIO" });

/** Un error de la pregunta, no de la base: día mal escrito, día futuro, rango al revés. */
export class ErrorStockDiario extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorStockDiario";
    this.codigo = codigo;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Días
// ════════════════════════════════════════════════════════════════════════════

const FORMA_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

const DIAS_DEL_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const esBisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/**
 * ¿Es un día ISO `YYYY-MM-DD` que existe en el calendario? Aritmética de
 * calendario sobre el texto: sin `Date`, que es un instante y trae una zona.
 */
export function esDiaValido(dia) {
  const m = FORMA_DIA.exec(typeof dia === "string" ? dia : "");
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || d < 1) return false;
  return d <= (mes === 2 && esBisiesto(a) ? 29 : DIAS_DEL_MES[mes - 1]);
}

/**
 * Exige un día ISO. Todo lo que no sea ese texto se rechaza, y en particular
 * un objeto de fecha de JavaScript: es un instante, no un día argentino.
 */
export function exigirDia(dia, nombre = "dia") {
  if (!esDiaValido(dia)) {
    const recibido = typeof dia === "string" ? dia : `un ${dia === null ? "null" : typeof dia}`;
    throw new ErrorStockDiario("DIA_INVALIDO", `${nombre} tiene que ser un día "YYYY-MM-DD": recibí ${JSON.stringify(recibido)}`);
  }
  return dia;
}

/** Exige un id entero positivo: una ubicación o una cadena. */
export function exigirId(valor, nombre) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorStockDiario("ID_INVALIDO", `${nombre} tiene que ser un entero positivo: recibí ${JSON.stringify(valor)}`);
  return n;
}

const menor = (a, b) => (a < b ? a : b);
const mayor = (a, b) => (a > b ? a : b);

// ════════════════════════════════════════════════════════════════════════════
// El estado de un período
// ════════════════════════════════════════════════════════════════════════════

/**
 * QUÉ SE SABE DE UN PERÍODO `[desde, hasta]`, inclusivo. Un día es un período de
 * un día.
 *
 * @param {object} args
 * @param {string} args.desde
 * @param {string} args.hasta
 * @param {{dia:string}|null} args.puntoCero  el del libro; null si está vacío.
 * @param {string} args.hoy   el día argentino de hoy, leído de PostgreSQL.
 * @returns {{ estado, desde, hasta, desdeEfectivo, hastaEfectivo, parcial,
 *            enCurso, recortadoAHoy, aperturaConocida }}
 *   `desdeEfectivo` es desde dónde hay historia: el punto cero si el período
 *   empieza antes. `hastaEfectivo` es hoy si el período pasa de hoy: el futuro
 *   no tiene movimientos y no se le inventa un cierre.
 */
export function estadoDelPeriodo({ desde, hasta, puntoCero, hoy }) {
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  exigirDia(hoy, "hoy");
  if (hasta < desde) throw new ErrorStockDiario("RANGO_INVALIDO", `El período termina (${hasta}) antes de empezar (${desde}).`);
  if (desde > hoy) throw new ErrorStockDiario("DIA_FUTURO", `El ${desde} todavía no llegó: hoy es ${hoy}.`);

  const hastaEfectivo = menor(hasta, hoy);
  const base = { desde, hasta, hastaEfectivo, recortadoAHoy: hasta > hoy };

  if (!puntoCero || hastaEfectivo < puntoCero.dia) {
    return {
      ...base,
      estado: ESTADO_DEL_DIA.FUERA_DE_HISTORIA,
      desdeEfectivo: null,
      parcial: false,
      enCurso: false,
      aperturaConocida: false,
    };
  }

  const parcial = desde <= puntoCero.dia;
  const enCurso = hastaEfectivo === hoy;
  let estado = ESTADO_DEL_DIA.COMPLETO;
  if (enCurso) estado = ESTADO_DEL_DIA.EN_CURSO;
  // Lo parcial manda sobre lo en curso: si el libro se activó hoy, lo que falta
  // es la apertura, y eso es lo primero que hay que decir.
  if (parcial) estado = ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO;

  return {
    ...base,
    estado,
    desdeEfectivo: mayor(desde, puntoCero.dia),
    parcial,
    enCurso,
    aperturaConocida: !parcial,
  };
}

/** Un día: el período `[dia, dia]`. */
export function estadoDelDia({ dia, puntoCero, hoy }) {
  return estadoDelPeriodo({ desde: dia, hasta: dia, puntoCero, hoy });
}

// ════════════════════════════════════════════════════════════════════════════
// Números
// ════════════════════════════════════════════════════════════════════════════

const FORMA_NUMERO = /^(-?)(\d+)(?:\.(\d{1,3}))?$/;

/**
 * El texto de un `numeric` con hasta tres decimales, en milésimas enteras.
 * null y undefined quedan en null: la ausencia no es cero.
 */
export function aMilesimas(valor) {
  if (valor === null || valor === undefined) return null;
  const m = FORMA_NUMERO.exec(String(valor).trim());
  if (!m) throw new Error(`cantidad del libro ilegible: ${JSON.stringify(valor)}`);
  const n = Number(m[2]) * 1000 + Number((m[3] || "").padEnd(3, "0"));
  return m[1] === "-" && n !== 0 ? -n : n;
}

/** Milésimas → número para mostrar. null sigue siendo null. */
export const deMilesimas = (m) => (m === null || m === undefined ? null : m / 1000);

// ════════════════════════════════════════════════════════════════════════════
// Un movimiento
// ════════════════════════════════════════════════════════════════════════════

function par(anterior, posterior) {
  const a = aMilesimas(anterior);
  const p = aMilesimas(posterior);
  return {
    anterior: deMilesimas(a),
    posterior: deMilesimas(p),
    // Delta solo cuando las dos puntas existen: un ALTA o una BAJA no tienen
    // "antes" o "después", y un delta inventado ahí diría que la fila existía
    // con cero.
    delta: a !== null && p !== null ? deMilesimas(p - a) : null,
  };
}

/**
 * UN MOVIMIENTO DEL LIBRO, LEÍDO. `fila` es lo que devuelve la consulta de
 * `stockDiarioServer.js`: cantidades y días como texto.
 */
export function interpretarMovimiento(fila) {
  const tipo = String(fila.tipo);
  const efecto = EFECTO_DEL_TIPO[tipo];
  if (!efecto) throw new Error(`tipo de movimiento desconocido: ${tipo}`);
  const cantidad = par(fila.cantidadAnterior, fila.cantidadPosterior);
  const enTransito = par(fila.enTransitoAnterior, fila.enTransitoPosterior);
  const saldoPosterior = { cantidad: cantidad.posterior, enTransito: enTransito.posterior };
  const saldoAnterior = { cantidad: cantidad.anterior, enTransito: enTransito.anterior };
  const sinClasificar = fila.origen === SIN_ORIGEN;

  return {
    id: Number(fila.id),
    instante: fila.instante,
    dia: fila.dia,
    tipo,
    efecto,
    localId: Number(fila.localId),
    productoLocalId: Number(fila.productoLocalId),
    productoBaseId: Number(fila.productoBaseId),
    stockLocalId: Number(fila.stockLocalId),
    cantidad,
    enTransito,
    puntoDePartida: efecto === EFECTO.PUNTO_DE_PARTIDA ? saldoPosterior : null,
    apareceCon: efecto === EFECTO.APARECE ? saldoPosterior : null,
    desapareceCon: efecto === EFECTO.DESAPARECE ? saldoAnterior : null,
    origen: fila.origen,
    origenRef: fila.origenRef ?? null,
    sinClasificar,
    origenLegible: sinClasificar ? TEXTO_SIN_ORIGEN : fila.origen,
    identidadCongelada:
      efecto === EFECTO.DESAPARECE
        ? { nombre: fila.nombreCongelado ?? null, codigoBarra: fila.codigoBarraCongelado ?? null, unidadMedida: fila.unidadMedidaCongelada ?? null }
        : null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Apertura y cierre
// ════════════════════════════════════════════════════════════════════════════

const SIN_NUMEROS = Object.freeze({ cantidad: null, enTransito: null, stockLocalId: null, movimientoId: null });

/**
 * EL ESTADO DE UNA CADENA SEGÚN SU ÚLTIMO MOVIMIENTO ANTERIOR AL MOMENTO.
 *
 * `ultimo` es el último movimiento de la cadena con `dia < D` (apertura) o
 * `dia <= D` (cierre), ordenado por (dia, id), o null si no hay ninguno.
 * Ninguno o una BAJA: NO_EXISTE. Cualquier otro: EXISTE con su saldo
 * posterior, aunque sea cero.
 */
export function estadoSegunUltimo(ultimo) {
  if (!ultimo || String(ultimo.tipo) === BAJA) {
    return { existencia: EXISTENCIA.NO_EXISTE, motivo: null, ...SIN_NUMEROS };
  }
  return {
    existencia: EXISTENCIA.EXISTE,
    motivo: null,
    cantidad: deMilesimas(aMilesimas(ultimo.cantidadPosterior)),
    enTransito: deMilesimas(aMilesimas(ultimo.enTransitoPosterior)),
    stockLocalId: Number(ultimo.stockLocalId),
    movimientoId: Number(ultimo.id),
  };
}

/** Una existencia que el libro no puede contestar. */
export function estadoDesconocido(motivo) {
  return { existencia: EXISTENCIA.DESCONOCIDA, motivo, ...SIN_NUMEROS };
}

/** La apertura de un período, según lo que se sabe de él. */
export function aperturaDelPeriodo(periodo, ultimoAntes) {
  if (periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) return estadoDesconocido(MOTIVO_DESCONOCIDA.FUERA_DE_HISTORIA);
  if (!periodo.aperturaConocida) return estadoDesconocido(MOTIVO_DESCONOCIDA.SIN_APERTURA_HISTORICA);
  return estadoSegunUltimo(ultimoAntes);
}

/** El cierre de un período. Siempre exacto desde el punto cero; provisional si es hoy. */
export function cierreDelPeriodo(periodo, ultimoHasta) {
  if (periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) return estadoDesconocido(MOTIVO_DESCONOCIDA.FUERA_DE_HISTORIA);
  return { ...estadoSegunUltimo(ultimoHasta), provisional: periodo.enCurso };
}

// ════════════════════════════════════════════════════════════════════════════
// Lo que pasó en el período
// ════════════════════════════════════════════════════════════════════════════

const CAMPOS_DEL_MOVIDO = ["entradas", "salidas", "apareceCon", "desapareceCon", "puntoDePartida"];

function movidoVacio() {
  return { entradas: 0, salidas: 0, apareceCon: 0, desapareceCon: 0, puntoDePartida: 0 };
}

/**
 * LO QUE UNA CADENA MOVIÓ EN EL PERÍODO, desde los agregados de la consulta.
 * `agregado` trae, para cantidad (`c`) y tránsito (`t`), las sumas en texto:
 * `cEntradas`, `cSalidas`, `cAparece`, `cDesaparece`, `cPartida`, y lo mismo
 * con `t`. Más `movimientos`, `sinClasificar` y el conteo por tipo.
 */
export function movidoDesdeAgregado(agregado) {
  const leer = (prefijo) => ({
    entradas: aMilesimas(agregado?.[`${prefijo}Entradas`]) ?? 0,
    salidas: aMilesimas(agregado?.[`${prefijo}Salidas`]) ?? 0,
    apareceCon: aMilesimas(agregado?.[`${prefijo}Aparece`]) ?? 0,
    desapareceCon: aMilesimas(agregado?.[`${prefijo}Desaparece`]) ?? 0,
    puntoDePartida: aMilesimas(agregado?.[`${prefijo}Partida`]) ?? 0,
  });
  return {
    cantidad: leer("c"),
    enTransito: leer("t"),
    movimientos: Number(agregado?.movimientos ?? 0),
    sinClasificar: Number(agregado?.sinClasificar ?? 0),
    porTipo: {
      [ESTADO_INICIAL]: Number(agregado?.estadosIniciales ?? 0),
      [ALTA]: Number(agregado?.altas ?? 0),
      [CAMBIO]: Number(agregado?.cambios ?? 0),
      [BAJA]: Number(agregado?.bajas ?? 0),
    },
  };
}

/** Lo mismo, sumando movimientos ya interpretados (para una cadena y su detalle). */
export function movidoDesdeMovimientos(movimientos) {
  const cantidad = movidoVacio();
  const enTransito = movidoVacio();
  const porTipo = { [ESTADO_INICIAL]: 0, [ALTA]: 0, [CAMBIO]: 0, [BAJA]: 0 };
  let sinClasificar = 0;
  const m = (v) => aMilesimas(v === null || v === undefined ? null : v.toFixed(3));
  for (const mov of movimientos) {
    porTipo[mov.tipo] += 1;
    if (mov.sinClasificar) sinClasificar += 1;
    for (const [clave, acc] of [["cantidad", cantidad], ["enTransito", enTransito]]) {
      if (mov.efecto === EFECTO.CAMBIO) {
        const d = m(mov[clave].delta);
        if (d > 0) acc.entradas += d;
        if (d < 0) acc.salidas += -d;
      } else if (mov.efecto === EFECTO.APARECE) acc.apareceCon += m(mov.apareceCon[clave]);
      else if (mov.efecto === EFECTO.DESAPARECE) acc.desapareceCon += m(mov.desapareceCon[clave]);
      else if (mov.efecto === EFECTO.PUNTO_DE_PARTIDA) acc.puntoDePartida += m(mov.puntoDePartida[clave]);
    }
  }
  return { cantidad, enTransito, movimientos: movimientos.length, sinClasificar, porTipo };
}

/** Milésimas → números, con el cambio neto (solo de los CAMBIO) al lado. */
function movidoLegible(acc) {
  const r = {};
  for (const k of CAMPOS_DEL_MOVIDO) r[k] = deMilesimas(acc[k]);
  r.cambioNeto = deMilesimas(acc.entradas - acc.salidas);
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// La identidad algebraica
// ════════════════════════════════════════════════════════════════════════════

const comoMilesimas = (v) => aMilesimas(v === null || v === undefined ? null : Number(v).toFixed(3));

/**
 * ¿CUADRA LA CADENA EN EL PERÍODO?
 *
 *   apertura + entradas − salidas + apareceCon − desapareceCon = cierre
 *
 * por separado para cantidad y para tránsito. La inexistencia cuenta como cero
 * SOLO acá. En un período parcial la apertura es desconocida y la cuenta
 * arranca del punto de partida (el ESTADO_INICIAL): partida + ... = cierre.
 */
export function cuadraLaCadena({ apertura, cierre, movido, parcial }) {
  const r = {};
  for (const clave of ["cantidad", "enTransito"]) {
    const acc = movido[clave];
    const inicio = parcial
      ? acc.puntoDePartida
      : apertura.existencia === EXISTENCIA.EXISTE
        ? comoMilesimas(apertura[clave])
        : 0;
    const fin = cierre.existencia === EXISTENCIA.EXISTE ? comoMilesimas(cierre[clave]) : 0;
    r[clave] = inicio + acc.entradas - acc.salidas + acc.apareceCon - acc.desapareceCon === fin;
  }
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// Una cadena en un período
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL STOCK DE UNA CADENA EN UN PERÍODO, armado con las piezas que trae la base.
 *
 * @param {object} args
 * @param {object} args.periodo       lo de `estadoDelPeriodo`
 * @param {object|null} args.ultimoAntes   último movimiento con dia < desde
 * @param {object|null} args.ultimoHasta   último movimiento con dia <= hastaEfectivo
 * @param {object} args.movido        lo de `movidoDesdeAgregado` o `movidoDesdeMovimientos`
 * @param {object} [args.identidad]
 * @param {Array}  [args.reinterpretaciones]
 */
export function stockDeCadena({ localId, productoLocalId, periodo, ultimoAntes, ultimoHasta, movido, identidad = null, reinterpretaciones = [] }) {
  const apertura = aperturaDelPeriodo(periodo, ultimoAntes);
  const cierre = cierreDelPeriodo(periodo, ultimoHasta);
  const fuera = periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA;
  return {
    localId: Number(localId),
    productoLocalId: Number(productoLocalId),
    estado: periodo.estado,
    apertura,
    cierre,
    cantidad: fuera ? null : movidoLegible(movido.cantidad),
    enTransito: fuera ? null : movidoLegible(movido.enTransito),
    movimientos: fuera ? 0 : movido.movimientos,
    sinClasificar: fuera ? 0 : movido.sinClasificar,
    porTipo: movido.porTipo,
    cuadra: fuera ? null : cuadraLaCadena({ apertura, cierre, movido, parcial: periodo.parcial }),
    identidad,
    reinterpretada: reinterpretaciones.length > 0,
    reinterpretaciones,
  };
}

/**
 * ¿La cadena existió en algún momento del período? Es el criterio de qué se
 * lista para un local: una cadena con apertura existente, o con al menos un
 * movimiento en el período. Un producto que nace después, o que murió antes, no
 * aparece. Uno que no se movió pero existía, sí.
 */
export function existioEnElPeriodo(cadena) {
  return cadena.apertura.existencia === EXISTENCIA.EXISTE || cadena.movimientos > 0;
}

// ════════════════════════════════════════════════════════════════════════════
// Identidad
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL NOMBRE QUE SE MUESTRA, SEPARADO DE LA IDENTIDAD FÍSICA.
 *
 * La identidad física de la cadena es (localId, productoLocalId) y no cambia.
 * El nombre es comercial y el libro NO guarda sus cambios: si el producto
 * existe, se muestra el de HOY —aunque ayer se llamara distinto—; si no, el que
 * la última BAJA congeló. La categoría es siempre la actual: no tiene historia,
 * y de un producto eliminado no se conoce.
 *
 * @param {object} args
 * @param {object|null} args.actual     { nombre, codigoBarra, unidadMedida, categoriaId, categoriaNombre } o null
 * @param {object|null} args.congelada  { nombre, codigoBarra, unidadMedida } de la última BAJA, o null
 * @param {boolean} args.productoLocalExiste
 */
export function identidadMostrada({ productoBaseId, actual, congelada, productoLocalExiste }) {
  if (actual) {
    return {
      productoBaseId: Number(productoBaseId),
      fuente: FUENTE_IDENTIDAD.ACTUAL,
      nombre: actual.nombre ?? null,
      codigoBarra: actual.codigoBarra ?? null,
      unidadMedida: actual.unidadMedida ?? null,
      categoriaActualId: actual.categoriaId ?? null,
      categoriaActualNombre: actual.categoriaNombre ?? null,
      productoEliminado: !productoLocalExiste,
    };
  }
  const base = {
    productoBaseId: Number(productoBaseId),
    categoriaActualId: null,
    categoriaActualNombre: null,
    productoEliminado: true,
  };
  if (congelada?.nombre) {
    return { ...base, fuente: FUENTE_IDENTIDAD.CONGELADA_EN_BAJA, nombre: congelada.nombre, codigoBarra: congelada.codigoBarra ?? null, unidadMedida: congelada.unidadMedida ?? null };
  }
  return { ...base, fuente: FUENTE_IDENTIDAD.DESCONOCIDA, nombre: null, codigoBarra: null, unidadMedida: null };
}

// ════════════════════════════════════════════════════════════════════════════
// Agrupar
// ════════════════════════════════════════════════════════════════════════════

function sumaDe(cadenas, clave, campo) {
  let m = 0;
  for (const c of cadenas) m += comoMilesimas(c[clave]?.[campo] ?? 0);
  return m;
}

function sumaDeSaldo(cadenas, lado, clave) {
  let m = 0;
  let conocidas = 0;
  let noExisten = 0;
  let desconocidas = 0;
  for (const c of cadenas) {
    const e = c[lado];
    if (e.existencia === EXISTENCIA.EXISTE) {
      m += comoMilesimas(e[clave]);
      conocidas += 1;
    } else if (e.existencia === EXISTENCIA.NO_EXISTE) noExisten += 1;
    else desconocidas += 1;
  }
  // Un total con una sola parte desconocida no es un total: se dice cuántas
  // faltan en vez de sumarlas como cero.
  return { total: desconocidas > 0 ? null : deMilesimas(m), sumaDeLasConocidas: deMilesimas(m), existen: conocidas, noExisten, desconocidas };
}

/**
 * LOS TOTALES DE UN GRUPO DE CADENAS. La apertura y el cierre se suman solo con
 * las que existen: las que no existen se cuentan aparte, y si alguna es
 * DESCONOCIDA el total queda en null. Lo que apareció y desapareció se suma en
 * columnas propias, así la cuenta del grupo cierra sin disfrazar la
 * inexistencia de cero.
 */
export function totalesDeCadenas(cadenas) {
  const r = { cadenas: cadenas.length, movimientos: 0, sinClasificar: 0, reinterpretadas: 0 };
  for (const c of cadenas) {
    r.movimientos += c.movimientos;
    r.sinClasificar += c.sinClasificar;
    if (c.reinterpretada) r.reinterpretadas += 1;
  }
  for (const clave of ["cantidad", "enTransito"]) {
    const t = {
      apertura: sumaDeSaldo(cadenas, "apertura", clave),
      cierre: sumaDeSaldo(cadenas, "cierre", clave),
    };
    for (const campo of CAMPOS_DEL_MOVIDO) t[campo] = deMilesimas(sumaDe(cadenas, clave, campo));
    t.cambioNeto = deMilesimas(sumaDe(cadenas, clave, "entradas") - sumaDe(cadenas, clave, "salidas"));
    r[clave] = t;
  }
  return r;
}

/**
 * AGRUPA CADENAS con una función de clave y devuelve los totales de cada grupo.
 * La clave es del llamador: por producto base, por local, por categoría.
 */
export function agruparCadenas(cadenas, claveDe) {
  const grupos = new Map();
  for (const c of cadenas) {
    const k = claveDe(c);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }
  return [...grupos.entries()].map(([clave, lista]) => ({ clave, totales: totalesDeCadenas(lista), cadenas: lista }));
}

/**
 * La clave de la CATEGORÍA ACTUAL. No es la categoría que el producto tenía ese
 * día —el libro no lo sabe—: por eso el nombre dice "actual". Los productos
 * eliminados van a su propio grupo.
 */
export function claveDeCategoriaActual(cadena) {
  const id = cadena.identidad;
  if (!id || id.fuente !== FUENTE_IDENTIDAD.ACTUAL) return GRUPO_PRODUCTO_ELIMINADO;
  return id.categoriaActualId ?? GRUPO_SIN_CATEGORIA;
}

// ════════════════════════════════════════════════════════════════════════════
// Períodos
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL RANGO `{desde, hasta}` DE UNA UNIDAD QUE CONTIENE UN DÍA.
 *
 * DIA y MES salen de `rangoDelPeriodo`, igual que en el resto del ERP. SEMANA
 * sale de `semanaQueContiene` con las vigencias de la ubicación: usa la
 * vigencia que regía ESE día, así que un cambio de corte posterior no reagrupa
 * los días viejos. El año es del 1/1 al 31/12. Ninguna unidad toca el libro:
 * solo agrupan días.
 *
 * La fecha es obligatoria: sin ella los helpers de período toman el "hoy" de
 * Node, y acá hoy lo decide PostgreSQL.
 */
export function rangoDeStock({ unidad, fecha, vigencias = [] }) {
  exigirDia(fecha, "fecha");
  if (unidad === UNIDAD_DE_PERIODO.DIA) return { ...rangoDelPeriodo({ unidad: UNIDADES.DIA, hoy: fecha }), semana: null };
  if (unidad === UNIDAD_DE_PERIODO.MES) return { ...rangoDelPeriodo({ unidad: UNIDADES.MES, hoy: fecha }), semana: null };
  if (unidad === UNIDAD_DE_PERIODO.ANIO) {
    const a = fecha.slice(0, 4);
    return { desde: `${a}-01-01`, hasta: `${a}-12-31`, semana: null };
  }
  if (unidad === UNIDAD_DE_PERIODO.SEMANA) {
    const s = semanaQueContiene({ vigencias, fecha });
    return { desde: s.desde, hasta: s.hasta, semana: s };
  }
  throw new ErrorStockDiario("UNIDAD_INVALIDA", `Unidad de período desconocida: ${JSON.stringify(unidad)}`);
}

/** Los días de un rango, en orden. Para recorrer y comprobar, no para consultar. */
export function diasDelRango(desde, hasta) {
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  const dias = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}
