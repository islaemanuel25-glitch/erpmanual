// lib/finanzas/gastos.js
//
// LOS GASTOS DE UNA UBICACIÓN Y LO QUE YA SE PAGÓ DE ELLOS. Puro.
//
// ── QUÉ ES UN GASTO, Y QUÉ NO ────────────────────────────────────────────
//
// Un gasto es lo que una ubicación CONSUMIÓ y no es mercadería: la luz, el
// alquiler, un sueldo, una reparación. Tres cosas con las que no se confunde:
//
//   · no es un RETIRO de caja. Un retiro es plata saliendo de un cajón; puede
//     ser el pago de un gasto, o la recaudación, o el cambio. Por eso un gasto
//     puede no haber sacado un peso todavía, y un retiro manual no se vuelve
//     gasto por decir "luz" en el motivo;
//   · no es una compra de mercadería. Aquélla mueve stock y su deuda es
//     `CuentaPorPagarProveedor`;
//   · no es costo de mercadería. El Libro de Costos no lo registra.
//
// ── EL SALDO NO SE GUARDA ────────────────────────────────────────────────
//
// Total, pagado, saldo y estado salen de `estadoDeCuenta`, la MISMA cuenta que
// usan las deudas con proveedores: un gasto pendiente de pago es, en
// aritmética, una deuda. Se reusa y no se reescribe.
//
// ── CADA UBICACIÓN PAGA SUS GASTOS ──────────────────────────────────────
//
// El gasto dice de quién es (`localId`); cada pago dice de dónde salió la
// plata (`localOrigenId`). La regla es que coincidan, y que quien registra
// esté OPERANDO esa ubicación. Ver no alcanza. La impone `gastosServer.js`.

import { normalizarPaginacion } from "@/lib/turnos/filtrosListado";

import {
  ERROR_MONTO_MAYOR_AL_SALDO,
  ERROR_CUENTA_SALDADA,
  filtroDeCuentas,
  leerFechaOpcional,
  validarMontoDePago,
} from "./pagosProveedores";

/**
 * EL PERMISO DE ESCRIBIR: crear un gasto y registrar sus pagos. Mirarlos
 * sigue siendo `finanzas.ver`. Mismo patrón que `PERMISO_REGISTRAR_PAGOS`.
 */
export const PERMISO_REGISTRAR_GASTOS = "finanzas.gastos.registrar";

/** Con qué se paga un gasto. Los valores del enum `MedioPagoGasto`. */
export const MEDIO_PAGO_GASTO = Object.freeze({
  EFECTIVO: "EFECTIVO",
  TRANSFERENCIA: "TRANSFERENCIA",
  MERCADO_PAGO: "MERCADO_PAGO",
  OTRO: "OTRO",
});

export const MEDIOS_PAGO_GASTO = Object.freeze([
  MEDIO_PAGO_GASTO.EFECTIVO,
  MEDIO_PAGO_GASTO.TRANSFERENCIA,
  MEDIO_PAGO_GASTO.MERCADO_PAGO,
  MEDIO_PAGO_GASTO.OTRO,
]);

export const ROTULO_MEDIO_GASTO = Object.freeze({
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  OTRO: "Otro",
});

export function esMedioPagoGasto(medio) {
  return MEDIOS_PAGO_GASTO.includes(medio);
}

/**
 * Las categorías con las que nace el catálogo, en el orden en que se ofrecen.
 * Las escribe la migración `20260929230000_gastos`; un candado exige que sean
 * éstas. Después el catálogo se edita en la base, no acá.
 */
export const CATEGORIAS_INICIALES = Object.freeze([
  "Servicios",
  "Alquiler",
  "Sueldos",
  "Mantenimiento",
  "Insumos y limpieza",
  "Impuestos",
  "Otros",
]);

// ── VALIDACIONES ────────────────────────────────────────────────────────

export const ERROR_CONCEPTO_VACIO = "Escribí qué fue el gasto.";
export const ERROR_CONCEPTO_LARGO = "El concepto es demasiado largo.";
export const ERROR_TOTAL_GASTO_INVALIDO = "El total del gasto tiene que ser mayor a cero.";
export const ERROR_FALTA_FECHA_GASTO = "Falta el día al que corresponde el gasto.";
export const ERROR_TEXTO_LARGO = "Uno de los datos es demasiado largo.";
export const ERROR_GASTO_PAGADO = "Este gasto ya está pagado.";
export const ERROR_MONTO_MAYOR_AL_SALDO_GASTO = "El importe supera lo que falta pagar del gasto.";

/** Largos máximos. No son de la base: son para que un pegado accidental no entre. */
export const MAXIMO_CONCEPTO = 200;
export const MAXIMO_TEXTO = 120;

/** El concepto, recortado. Vacío es error: un gasto dice qué fue. */
export function leerConcepto(v) {
  const texto = String(v ?? "").trim();
  if (!texto) return { error: ERROR_CONCEPTO_VACIO };
  if (texto.length > MAXIMO_CONCEPTO) return { error: ERROR_CONCEPTO_LARGO };
  return { valor: texto };
}

/** Un texto opcional, recortado. Vacío es `null`, no "". */
export function leerTextoOpcional(v, maximo = MAXIMO_TEXTO) {
  const texto = String(v ?? "").trim();
  if (!texto) return { valor: null };
  if (texto.length > maximo) return { error: ERROR_TEXTO_LARGO };
  return { valor: texto };
}

/**
 * ¿Se puede pagar este importe sobre lo que falta del gasto?
 *
 * Es `validarMontoDePago` —pagar de más se rechaza, un importe no positivo
 * también— con las palabras de un gasto en vez de las de una cuenta.
 */
export function validarPagoDeGasto({ monto, saldo } = {}) {
  const r = validarMontoDePago({ monto, saldo });
  if (r.error === ERROR_CUENTA_SALDADA) return { error: ERROR_GASTO_PAGADO };
  if (r.error === ERROR_MONTO_MAYOR_AL_SALDO) return { error: ERROR_MONTO_MAYOR_AL_SALDO_GASTO };
  return r;
}

// ── ALCANCE ─────────────────────────────────────────────────────────────
//
// `alcance` tiene la forma de `alcanceDePagos` (pagosProveedoresServer.js):
// `{ grupoId, visibles, vista: { localId }, puedeEscribir }`, con `puedeEscribir`
// calculado con `PERMISO_REGISTRAR_GASTOS`.

/** ¿Quien pregunta puede VER este gasto? Por la ubicación del gasto. */
export function gastoEnAlcance(gasto, alcance) {
  return (
    Boolean(gasto) &&
    gasto.grupoId === alcance?.grupoId &&
    Array.isArray(alcance?.visibles) &&
    alcance.visibles.includes(gasto.localId)
  );
}

/**
 * ¿Quien pregunta puede PAGAR este gasto? Ver no alcanza.
 *
 * Hace falta el permiso de escribir Y estar operando la ubicación del gasto. El
 * depósito que mira los gastos de un local, o un admin en vista global —sin
 * ubicación operativa—, no pagan. Es la misma condición que `registrarPagoGasto`
 * vuelve a exigir al escribir.
 */
export function puedePagarElGasto(gasto, alcance) {
  return (
    Boolean(alcance?.puedeEscribir) &&
    Boolean(gasto) &&
    Number(alcance?.vista?.localId) === gasto.localId
  );
}

// ── EL LISTADO: FILTROS ─────────────────────────────────────────────────
//
// El listado se filtra y se pagina EN LA BASE: con los gastos de años, traerlos
// todos para filtrar después no escala, y una página filtrada en memoria dice
// "no hay más" cuando sí hay. Las pestañas de estado son las de Pagos a
// proveedores —`FILTRO_CUENTAS`: Pendientes (con saldo, incluye las parciales),
// Pagadas y Todas—, con el mismo default, Pendientes.
//
// Acá se LEEN y validan. La consulta —con el estado resuelto en SQL— la arma
// `condicionesDeGastos`, en `gastosServer.js`.

export const ERROR_CATEGORIA_FILTRO = "La categoría del filtro no es válida.";
export const ERROR_RANGO_INVERTIDO = "La fecha desde no puede ser posterior a la fecha hasta.";

/** Un id positivo, o `null` si no vino. Otra cosa es error: no se ignora. */
function leerIdOpcional(v) {
  if (v === null || v === undefined || v === "") return { valor: null };
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? { valor: n } : { error: true };
}

/**
 * Los filtros del listado, VALIDADOS. Lo que está mal escrito se rechaza con 400
 * en vez de ignorarse: un filtro ignorado en silencio muestra otra lista que la
 * que se pidió, y nadie se entera.
 *
 * `destino` —el local pedido— no se valida acá: pasa entero a
 * `resolverLocalPedido`, que es la puerta del alcance.
 *
 * @param {(k:string)=>string|null} get  `searchParams.get`, o equivalente
 * @returns {{ error: string } | { filtros: object }}
 */
export function leerFiltrosDeGastos(get) {
  const categoria = leerIdOpcional(get("categoriaId"));
  if (categoria.error) return { error: ERROR_CATEGORIA_FILTRO };
  const desde = leerFechaOpcional(get("fechaDesde"));
  if (desde.error) return { error: desde.error };
  const hasta = leerFechaOpcional(get("fechaHasta"));
  if (hasta.error) return { error: hasta.error };
  if (desde.valor && hasta.valor && desde.valor > hasta.valor) return { error: ERROR_RANGO_INVERTIDO };
  const q = leerTextoOpcional(get("q"));
  if (q.error) return { error: q.error };
  const { page, pageSize, skip, take } = normalizarPaginacion({ page: get("page"), pageSize: get("pageSize") });
  return {
    filtros: {
      estado: filtroDeCuentas(get("estado")),
      categoriaId: categoria.valor,
      fechaDesde: desde.valor,
      fechaHasta: hasta.valor,
      q: q.valor,
      destino: get("destino"),
      page,
      pageSize,
      skip,
      take,
    },
  };
}

// ── CLAVES Y TEXTOS ─────────────────────────────────────────────────────

/** La clave de un intento de alta, la que genera la pantalla al abrir el formulario. */
export function nuevaClaveDeGasto(localId, ahora = Date.now(), azar = Math.random().toString(36).slice(2, 10)) {
  return `gasto-${localId}-${Number(ahora).toString(36)}-${azar}`;
}

/** La del pago inicial de un gasto: derivada del gasto, una por gasto. */
export function claveDelPagoInicialDeGasto(gastoId) {
  return `gasto-${gastoId}-pago-inicial`;
}

/**
 * El texto del `CajaMovimiento` de un pago en efectivo.
 *
 * ES SOLO PARA QUE UNA PERSONA LEA EL HISTORIAL DEL TURNO. De qué gasto es el
 * movimiento lo dice `PagoGasto.cajaMovimientoId`, con UNIQUE, y nunca se
 * busca ni se clasifica por este texto.
 */
export function motivoDelRetiroDeGasto({ concepto, gastoId } = {}) {
  const que = String(concepto || "").trim() || "gasto";
  return gastoId ? `Pago de gasto: ${que} (gasto #${gastoId})` : `Pago de gasto: ${que}`;
}
