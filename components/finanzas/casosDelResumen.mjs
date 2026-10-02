// components/finanzas/casosDelResumen.mjs
//
// LOS CASOS CON LOS QUE SE DIBUJA EL RESUMEN EN LOS CANDADOS.
//
// No son objetos escritos a mano con la forma que "debería" tener un resumen:
// cada caso pasa ventas con sus tenders —la forma de `SELECT_VENTA` de la ruta—
// y movimientos clasificados por `clasificarMovimientos` por el MISMO
// `resumenDelPeriodo` que usa el tablero, y arma "Ver gastos" y el pago a
// depósito con sus funciones reales. Un candado montado sobre un dato que el
// endpoint nunca manda queda verde para siempre y no cubre nada (CLAUDE.md,
// regla 2): por eso acá no hay ningún importe derivado escrito a mano. El
// resultado, el margen y las comisiones salen de la cuenta, no de un literal.
//
// Los usan el candado de render del celular, el de escritorio y el del
// contenedor; el golden de escritorio se generó dibujando ESTOS casos con la
// versión de `3feaf1c`.

import { resumenDelPeriodo } from "@/lib/finanzas/resumenFinanciero";
import { clasificarMovimientos, soloManuales, soloRecaudacion } from "@/lib/finanzas/movimientosDeCaja";
import { armarPagoADeposito } from "@/lib/finanzas/pagoADeposito";
import { urlDeGastosDelResumen } from "@/lib/finanzas/contextoFinanzas";
import { CRITERIO_CUENTA } from "@/lib/transferencias/criterioDeCuenta";

/** Un tender, con el neto que guarda el POS. */
const tender = (medio, monto, comision = "0.00") => ({
  medio,
  monto,
  comision,
  neto: String((Number(monto) - Number(comision)).toFixed(2)),
});

/** Una venta con la forma de `SELECT_VENTA` (app/api/finanzas/tablero/route.js). */
function venta({ id, total, costoTotal, gananciaBruta, pagos, comisionPendiente = false }) {
  return {
    id,
    total,
    costoTotal,
    gananciaBruta,
    turnoId: 10,
    esFiado: pagos.some((p) => p.medio === "FIADO"),
    formaPago: pagos[0].medio,
    comisionBancaria: String(pagos.reduce((a, p) => a + Number(p.comision || 0), 0).toFixed(2)),
    comisionPendiente,
    netoRecibido: String(pagos.reduce((a, p) => a + Number(p.neto || 0), 0).toFixed(2)),
    pagos,
  };
}

/** La caja del período como la arma la ruta: clasificada, y partida en manuales y recaudación. */
function caja(movimientos, idsDeRecaudacion = []) {
  const clasificados = clasificarMovimientos(movimientos, { idsDeRecaudacion: new Set(idsDeRecaudacion) });
  return { manuales: soloManuales(clasificados), recaudacion: soloRecaudacion(clasificados) };
}

const PAGO_LOCAL = armarPagoADeposito({
  esDeposito: false,
  cuenta: {
    criterio: CRITERIO_CUENTA.RECEPCION,
    total: 0,
    cantidadTransferencias: 0,
    pendientes: { total: 2658311.12, cantidadTransferencias: 4 },
  },
  verDetalle: "/modulos/transferencias/cuenta?desp=0&criterio=RECEPCION",
});

export const DESCRIPCION_DIA = Object.freeze({ titulo: "Jueves 1 de octubre", subtitulo: null });
export const DESCRIPCION_SEMANA = Object.freeze({ titulo: "Semana 40", subtitulo: "29 sep – 5 oct" });

/**
 * LLENO: los importes del frame FINAL (Casiano Casas · Día). Efectivo 868.800 y
 * Mercado Pago 484.500 con 33.915 de comisión; CMV 1.054.558,44; sin gastos;
 * retiros manuales 61.500 y recaudación retirada 800.000. El Resultado
 * 264.826,56 lo calcula `resumenDelPeriodo`. Con `conRetiros: false` es el
 * mismo período sin los dos retiros manuales: sirve para comprobar que un
 * retiro no mueve el Resultado.
 */
export function casoLleno({ conRetiros = true } = {}) {
  const { manuales, recaudacion } = caja(
    [
      { id: 1, tipo: "RETIRO", monto: "800000.00", motivo: "Retiro de recaudación" },
      ...(conRetiros
        ? [
            { id: 2, tipo: "RETIRO", monto: "41500.00", motivo: "PAGO POLLO" },
            { id: 3, tipo: "RETIRO", monto: "20000.00", motivo: "ALMUERZO" },
          ]
        : []),
    ],
    [1],
  );
  return resumenDelPeriodo({
    ventas: [
      venta({ id: 1, total: "868800.00", costoTotal: "677000.00", gananciaBruta: "191800.00", pagos: [tender("EFECTIVO", "868800.00")] }),
      venta({ id: 2, total: "484500.00", costoTotal: "377558.44", gananciaBruta: "106941.56", pagos: [tender("MERCADOPAGO", "484500.00", "33915.00")] }),
    ],
    manuales,
    recaudacion,
    pagoADeposito: PAGO_LOCAL,
    gastos: 0,
    verGastos: urlDeGastosDelResumen({ localId: 7, unidad: "DIA", desp: 0, esDeposito: false }),
  });
}

/** VACÍO: un período sin ventas, sin caja y sin pago a depósito. */
export function casoVacio() {
  return resumenDelPeriodo({ ventas: [] });
}

/**
 * CON AVISOS: resultado NEGATIVO, una comisión pendiente, una venta con costo
 * cero, el margen guardado que difiere del calculado, fiado entre los medios y
 * tres medios distintos. Sin retiros manuales.
 */
export function casoConAvisos() {
  return resumenDelPeriodo({
    ventas: [
      // Costo cero: se cuenta para avisar, no cambia el margen.
      venta({ id: 1, total: "1000.00", costoTotal: "0.00", gananciaBruta: "1000.00", pagos: [tender("EFECTIVO", "1000.00")] }),
      // Comisión pendiente y margen guardado distinto del calculado (recargo).
      venta({ id: 2, total: "2000.00", costoTotal: "1500.00", gananciaBruta: "450.00", comisionPendiente: true, pagos: [tender("CREDITO", "2000.00", "100.00")] }),
      // Fiado: venta a cuenta corriente, no plata que entró.
      venta({ id: 3, total: "300.00", costoTotal: "200.00", gananciaBruta: "100.00", pagos: [tender("FIADO", "300.00")] }),
    ],
    gastos: 5000,
    verGastos: urlDeGastosDelResumen({ localId: 7, unidad: "SEMANA", desp: 0, esDeposito: false }),
  });
}

/** DEPÓSITO: el pago a depósito no aplica —el depósito no se paga a sí mismo—. */
export function casoDeposito() {
  return { ...casoVacio(), pagoADeposito: armarPagoADeposito({ esDeposito: true }) };
}

/** Los casos del golden de escritorio, con la descripción que les pasa el contenedor. */
export const CASOS_DE_ESCRITORIO = Object.freeze({
  lleno: () => ({ resumen: casoLleno(), descripcion: DESCRIPCION_DIA }),
  vacio: () => ({ resumen: casoVacio(), descripcion: null }),
  conAvisos: () => ({ resumen: casoConAvisos(), descripcion: DESCRIPCION_SEMANA }),
  deposito: () => ({ resumen: casoDeposito(), descripcion: DESCRIPCION_DIA }),
});
