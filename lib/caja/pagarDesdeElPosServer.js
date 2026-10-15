// lib/caja/pagarDesdeElPosServer.js
//
// "PAGAR" DESDE EL POS: el cajero paga con el efectivo de SU caja abierta, y
// cada pago queda registrado en el módulo que le corresponde. No hay un camino
// de egreso propio: cada tipo entra por la puerta que ya existe, y todas
// terminan en `resolverSalidaDelPago` —el lock del turno, la condición de turno
// operativo y UN `CajaMovimiento` RETIRO, ahora con su tipo—.
//
//   · Proveedor ......... la compra "nacida de factura" + su cuenta con el pago
//                         inicial en efectivo: `crearCuentaPorPagarDesdeCompra`
//                         → `registrarPagoProveedor`. Queda por cargar en Compras.
//   · Sueldo o adelanto . un Gasto de la categoría Sueldos, pagado entero:
//                         `crearGasto` → `registrarPagoGasto`.
//   · Gasto ............. un Gasto de la categoría elegida, pagado entero.
//   · Al depósito ....... `resolverSalidaDelPago` con tipo Al depósito.
//   · Retiro del dueño .. `resolverSalidaDelPago` con tipo Retiro del dueño.
//
// Recibe `tx`: quien llama abrió la transacción y YA tomó y validó el turno
// (`bloquearTurno` + `rechazoDelTurno`), igual que "Caja +/−". Un rechazo de
// acá se lanza antes de escribir y vuelve atrás todo.

import { leerImporte } from "@/lib/finanzas/pagosProveedores";
import { desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { validarIdempotencyKey } from "@/lib/caja/retiroDinero";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { TIPO_EGRESO, CATEGORIA_SUELDOS, esTipoEgreso } from "@/lib/caja/tipoEgreso";
import { MEDIO_EFECTIVO, resolverSalidaDelPago } from "@/lib/finanzas/salidaDelPago";
import { crearCuentaPorPagarDesdeCompra, ErrorPagoProveedor } from "@/lib/finanzas/pagosProveedoresServer";
import { crearGasto, ErrorGasto } from "@/lib/finanzas/gastosServer";
import { datosDePedidoNacidoDeFactura } from "@/lib/compras-proveedor/compraPorCargar";
import { empleadoActivoDelLocal } from "@/lib/empleados/empleadosServer";
import { ERROR_EMPLEADO_DE_OTRO_LOCAL } from "@/lib/empleados/empleados";

export class ErrorPagarDesdeElPos extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = "ErrorPagarDesdeElPos";
    this.status = status;
  }
}

/** Los rechazos de las puertas de Finanzas también son de la persona. */
export const esRechazoDePagar = (e) =>
  e instanceof ErrorPagarDesdeElPos || e instanceof ErrorPagoProveedor || e instanceof ErrorGasto;

export const MODALIDAD_SUELDO = Object.freeze({ SUELDO: "SUELDO", ADELANTO: "ADELANTO" });

export const ERROR_TIPO = "Elegí qué vas a pagar.";
export const ERROR_PROVEEDOR = "Elegí el proveedor.";
export const ERROR_EMPLEADO = "Elegí el empleado.";
export const ERROR_CATEGORIA = "Elegí la categoría.";
export const ERROR_SIN_CATEGORIA_SUELDOS = "No existe la categoría de gasto Sueldos.";
export const ERROR_SIN_DEPOSITO = "No se encontró el depósito del grupo.";

export const MOTIVO_AL_DEPOSITO = "Pago al depósito";
export const MOTIVO_RETIRO_DUENO = "Retiro del dueño";

/** Lo que no depende de la base: tipo, monto y clave. */
export function leerPedidoDePago(body = {}) {
  if (!esTipoEgreso(body.tipo)) return { error: ERROR_TIPO };
  const importe = leerImporte(body.monto);
  if (importe.error) return { error: importe.error };
  const clave = validarIdempotencyKey(body.idempotencyKey, { de: "del pago" });
  if (!clave.valido) return { error: clave.error };
  return { tipo: body.tipo, monto: desdeCentavos(importe.centavos), clave: clave.clave };
}

/**
 * REGISTRA UN PAGO DESDE LA CAJA. El turno ya está tomado y validado.
 *
 * @param {object} tx
 * @param {object} args
 * @param {string} args.tipo  uno de `TIPO_EGRESO`
 * @param {string} args.monto  ya leído (`leerPedidoDePago`)
 * @param {string} args.clave  la clave de idempotencia del intento
 * @param {number} args.turnoId
 * @param {number} args.localId  la ubicación que opera y de la que sale la plata
 * @param {number} args.grupoId
 * @param {object} args.session
 * @param {object} args.body  el resto: proveedorId, empleadoId, modalidad, categoriaId
 * @returns {Promise<{ tipo:string, cajaMovimientoId:number|null, pedidoProveedorId?:number, gastoId?:number, repetido:boolean }>}
 */
export async function pagarDesdeElPos(tx, args) {
  const { tipo, monto, clave, turnoId, localId, grupoId, session, body = {} } = args;
  const pagoEnEfectivo = { monto, medio: MEDIO_EFECTIVO, turnoId, localOrigenId: localId, idempotencyKey: clave };

  if (tipo === TIPO_EGRESO.PROVEEDOR) {
    const proveedorId = Number(body.proveedorId);
    const proveedor = Number.isInteger(proveedorId) && proveedorId > 0
      ? await tx.proveedor.findUnique({ where: { id: proveedorId }, select: { id: true, activo: true } })
      : null;
    if (!proveedor || proveedor.activo === false) throw new ErrorPagarDesdeElPos(ERROR_PROVEEDOR);

    // EL MISMO INTENTO, OTRA VEZ. La clave viaja al pago inicial; el turno ya
    // está tomado, así que un segundo envío espera al primero y lo encuentra
    // acá, antes de crear otra compra.
    const previo = await tx.pagoProveedor.findFirst({
      where: { idempotencyKey: clave, turnoId, cuenta: { localGastoId: localId } },
      select: { cajaMovimientoId: true, cuenta: { select: { pedidoProveedorId: true } } },
    });
    if (previo) {
      return {
        tipo,
        cajaMovimientoId: previo.cajaMovimientoId,
        pedidoProveedorId: previo.cuenta.pedidoProveedorId,
        repetido: true,
      };
    }

    const deposito = await tx.grupoDeposito.findFirst({ where: { grupoId }, select: { localId: true } });
    if (!deposito) throw new ErrorPagarDesdeElPos(ERROR_SIN_DEPOSITO);
    const pedido = await tx.pedidoProveedor.create({
      data: {
        grupoId,
        depositoId: deposito.localId,
        creadoEnLocalId: localId,
        proveedorId,
        creadoPorId: session.id,
        ...datosDePedidoNacidoDeFactura(),
      },
      select: { id: true },
    });
    const { pago } = await crearCuentaPorPagarDesdeCompra(tx, {
      pedidoProveedorId: pedido.id,
      localGastoId: localId,
      // Lo que se pagó. Al recibir la compra, la cuenta toma el total real.
      total: monto,
      usuarioId: session.id,
      localOperativoId: localId,
      pagoInicial: pagoEnEfectivo,
    });
    return { tipo, cajaMovimientoId: pago.cajaMovimientoId, pedidoProveedorId: pedido.id, repetido: false };
  }

  if (tipo === TIPO_EGRESO.SUELDO || tipo === TIPO_EGRESO.GASTO) {
    let categoriaId;
    let concepto;
    let beneficiario = null;
    let empleadoId = null;
    if (tipo === TIPO_EGRESO.SUELDO) {
      // De Empleados y no de Operadores: quien cobra un sueldo puede no
      // manejar la caja. Es la misma consulta que arma la lista que se ofrece.
      // Y del local de la caja: el de otro local no se elige ni se acepta.
      const { empleado, deOtroLocal } = await empleadoActivoDelLocal(tx, { empleadoId: body.empleadoId, localId });
      if (deOtroLocal) throw new ErrorPagarDesdeElPos(ERROR_EMPLEADO_DE_OTRO_LOCAL, 403);
      if (!empleado) throw new ErrorPagarDesdeElPos(ERROR_EMPLEADO);
      const sueldos = await tx.categoriaGasto.findUnique({ where: { nombre: CATEGORIA_SUELDOS }, select: { id: true } });
      if (!sueldos) throw new ErrorPagarDesdeElPos(ERROR_SIN_CATEGORIA_SUELDOS);
      categoriaId = sueldos.id;
      empleadoId = empleado.id;
      beneficiario = empleado.nombre;
      const esAdelanto = body.modalidad === MODALIDAD_SUELDO.ADELANTO;
      concepto = `${esAdelanto ? "Adelanto" : "Sueldo"} · ${beneficiario}`;
    } else {
      const id = Number(body.categoriaId);
      const categoria = Number.isInteger(id) && id > 0
        ? await tx.categoriaGasto.findUnique({ where: { id }, select: { id: true, nombre: true, activo: true } })
        : null;
      if (!categoria || !categoria.activo || categoria.nombre === CATEGORIA_SUELDOS) {
        throw new ErrorPagarDesdeElPos(ERROR_CATEGORIA);
      }
      categoriaId = categoria.id;
      concepto = categoria.nombre;
    }
    const { gasto, pago, repetido } = await crearGasto(tx, {
      grupoId,
      localId,
      localOperativoId: localId,
      categoriaId,
      concepto,
      total: monto,
      fecha: hoyArgentinaISO(),
      beneficiario,
      empleadoId,
      idempotencyKey: clave,
      session,
      desdeElPos: true,
      pagoInicial: { monto, medio: MEDIO_EFECTIVO, turnoId },
    });
    return { tipo, cajaMovimientoId: pago?.cajaMovimientoId ?? null, gastoId: gasto.id, repetido: Boolean(repetido) };
  }

  // Al depósito y retiro del dueño: solo la salida del cajón, con su tipo.
  const { cajaMovimientoId } = await resolverSalidaDelPago(tx, {
    medio: MEDIO_EFECTIVO,
    turnoId,
    localOrigenId: localId,
    usuarioId: session.id,
    monto,
    motivo: tipo === TIPO_EGRESO.AL_DEPOSITO ? MOTIVO_AL_DEPOSITO : MOTIVO_RETIRO_DUENO,
    tipoEgreso: tipo,
    crearError: (mensaje, status) => new ErrorPagarDesdeElPos(mensaje, status),
  });
  return { tipo, cajaMovimientoId, repetido: false };
}
