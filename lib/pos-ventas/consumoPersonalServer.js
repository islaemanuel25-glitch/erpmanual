// lib/pos-ventas/consumoPersonalServer.js
//
// REGISTRA UN CONSUMO DEL PERSONAL. Lo que hace, en una sola transacción:
//
//   1. El candado del local y el turno compartido, en el orden de la venta
//      —`tomarCandadoDelLocal` → `compartirTurno`—, y el turno se vuelve a
//      leer con `rechazoDelTurno`: un consumo no entra en una caja cortada.
//   2. Las líneas con `construirLineasComerciales` y el descuento con
//      `aplicarConsumoStock`: LAS MISMAS funciones que la venta, con los mapas
//      de `cargarMapasDeProductos`, así que la escala, el bulto y el kilo salen
//      del stock exactamente igual. No hay un descuento propio.
//   3. Cada egreso de stock queda anotado en el Libro con
//      `ORIGEN_STOCK.CONSUMO_PERSONAL` y el id del consumo.
//   4. Un Gasto de la categoría "Consumo del personal" por el COSTO —la suma
//      de `costoLinea`, nunca el precio de venta—, sin pago (`crearGasto` con
//      `delConsumoDelPersonal`).
//
// Lo que NO hace, y es la mitad de la regla: no crea `Venta` —no suma tickets,
// ni vendido, ni ganancia de ventas, ni Reportes → Ventas— y no crea
// `CajaMovimiento` —no mueve la caja ni el efectivo esperado—.

import prisma from "@/lib/prisma";
import { compartirTurno } from "@/lib/caja/cierreRelevoServer";
import { SELECT_TURNO, rechazoDelTurno } from "@/lib/caja/turnoParaMover";
import { tomarCandadoDelLocal, LIMITES_TRANSACCION_DEL_LOCAL } from "@/lib/pos-ventas/candadoDelLocal";
import { cargarMapasDeProductos } from "@/lib/pos-ventas/mapasDeProductos";
import { esModalidadServicio } from "@/lib/pos-ventas/servicios";
import { construirLineasComerciales, aplicarConsumoStock } from "@/lib/combos/ventaConsumo";
import { getConfigLocalEfectiva } from "@/lib/config/local";
import { declararOrigenDeStock, ORIGEN_STOCK } from "@/lib/stock/libro/libroStock";
import { crearGasto } from "@/lib/finanzas/gastosServer";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { empleadoActivoDelLocal } from "@/lib/empleados/empleadosServer";
import {
  CATEGORIA_CONSUMO_PERSONAL,
  ERROR_SERVICIO,
  ERROR_SIN_CATEGORIA,
  ERROR_SIN_EMPLEADO,
  conceptoDelConsumo,
  costoDelConsumo,
} from "./consumoPersonal";

export class ErrorConsumoPersonal extends Error {
  constructor(mensaje, status = 400, extra = null) {
    super(mensaje);
    this.name = "ErrorConsumoPersonal";
    this.status = status;
    this.extra = extra;
  }
}

/** La clave del gasto sale del consumo: un reintento cae en el mismo. */
export const claveDelGastoDeConsumo = (consumoId) => `consumo-personal-${consumoId}`;

const SELECT_CONSUMO = {
  id: true,
  gastoId: true,
  totalCosto: true,
  totalPrecio: true,
  empleado: { select: { id: true, nombre: true } },
  lineas: { select: { id: true }, orderBy: { id: "asc" } },
};

function serializar(c, { repetido, allowNegativeStockUsed = false } = {}) {
  return {
    consumoId: c.id,
    gastoId: c.gastoId,
    empleado: c.empleado,
    productos: c.lineas.length,
    totalCosto: Number(c.totalCosto),
    totalPrecio: Number(c.totalPrecio),
    repetido,
    allowNegativeStockUsed,
  };
}

/**
 * @param {object} args
 * @param {number} args.localId
 * @param {number} args.grupoId
 * @param {object} args.session  quien registra; necesita `pos.usar`
 * @param {object} args.identidad  la de `identidadParaOperar`
 * @param {object} args.pedido  el de `leerPedidoDeConsumo`
 * @param {object} [args.db]  el cliente; por defecto el de la app
 */
export async function registrarConsumoPersonal({ localId, grupoId, session, identidad, pedido, db = prisma }) {
  const { turnoId, empleadoId, items, clave } = pedido;

  // Lo que la venta también lee AFUERA de su transacción: si el local es
  // depósito, los mapas de producto y si se permite stock negativo.
  const local = await db.local.findUnique({ where: { id: localId }, select: { es_deposito: true } });
  const esDeposito = local?.es_deposito === true;
  const mapas = await cargarMapasDeProductos(db, items.map((i) => i.productoBaseId));
  const { allowNegativeStock } = await getConfigLocalEfectiva(localId, grupoId);

  return db.$transaction(async (tx) => {
    await tomarCandadoDelLocal(tx, localId);
    await compartirTurno(tx, turnoId);
    const turno = await tx.turno.findUnique({ where: { id: turnoId }, select: SELECT_TURNO });
    const rechazo = rechazoDelTurno(turno, localId, identidad);
    if (rechazo) throw new ErrorConsumoPersonal(rechazo.cuerpo.error, rechazo.status, rechazo.cuerpo);

    // EL MISMO INTENTO, OTRA VEZ. Con el candado del local tomado: un segundo
    // envío espera al primero y lo encuentra acá, antes de descontar de nuevo.
    const previo = await tx.consumoPersonal.findUnique({
      where: { localId_idempotencyKey: { localId, idempotencyKey: clave } },
      select: SELECT_CONSUMO,
    });
    if (previo) return serializar(previo, { repetido: true });

    // Un EMPLEADO activo del local: la misma consulta que arma la lista.
    const empleado = await empleadoActivoDelLocal(tx, { empleadoId, localId });
    if (!empleado) throw new ErrorConsumoPersonal(ERROR_SIN_EMPLEADO);

    // Un servicio no sale del stock: no hay nada que consumir.
    const bases = await tx.productoBase.findMany({
      where: { id: { in: items.map((i) => i.productoBaseId) } },
      select: { id: true, nombre: true, modalidad: true },
    });
    const servicio = bases.find((b) => esModalidadServicio(b.modalidad));
    if (servicio) throw new ErrorConsumoPersonal(ERROR_SERVICIO(servicio.nombre));

    const categoria = await tx.categoriaGasto.findUnique({
      where: { nombre: CATEGORIA_CONSUMO_PERSONAL },
      select: { id: true },
    });
    if (!categoria) throw new ErrorConsumoPersonal(ERROR_SIN_CATEGORIA, 500);

    const { lineasComerciales, consumoFisicoConsolidado } = await construirLineasComerciales(tx, {
      items,
      productosBaseMap: mapas.productosBaseMap,
      costosMap: mapas.costosMap,
      baseStockMap: mapas.baseStockMap,
      localId,
      esDeposito,
    });
    const totalCosto = costoDelConsumo(lineasComerciales);
    const totalPrecio = Math.round(lineasComerciales.reduce((s, l) => s + (Number(l.subtotal) || 0), 0) * 100) / 100;

    const consumo = await tx.consumoPersonal.create({
      data: {
        localId,
        turnoId,
        empleadoId: empleado.id,
        // Su operador, si lo tiene: el código anterior lee esta columna, y un
        // vuelta atrás de la versión no tiene que encontrarla vacía sin motivo.
        operadorId: empleado.operadorId ?? null,
        usuarioId: session.id,
        totalCosto,
        totalPrecio,
        idempotencyKey: clave,
        lineas: {
          create: lineasComerciales.map((l) => ({
            tipo: l.tipo,
            productoBaseId: l.productoBaseId,
            productoLocalId: l.productoLocalId ?? l.comboProductoLocalId ?? null,
            nombre: String(l.nombre || "").slice(0, 200),
            cantidad: l.cantidad,
            cantidadStock: l.consumoFisico?.cantidadStock ?? null,
            costoLinea: l.costoLinea,
            precioLinea: Number(l.subtotal) || 0,
          })),
        },
      },
      select: { id: true },
    });

    await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.CONSUMO_PERSONAL, referencia: String(consumo.id) });
    const { allowNegativeStockUsed } = await aplicarConsumoStock(tx, {
      localId,
      consumoFisicoConsolidado,
      allowNegativeStock,
    });

    // Un consumo de costo cero —productos sin costo cargado— no deja gasto:
    // un Gasto de $0 no lo admite la base y no diría nada.
    let gastoId = null;
    if (totalCosto > 0) {
      const { gasto } = await crearGasto(tx, {
        grupoId,
        localId,
        localOperativoId: localId,
        categoriaId: categoria.id,
        concepto: conceptoDelConsumo({ empleado: empleado.nombre, lineas: lineasComerciales }),
        total: totalCosto,
        fecha: hoyArgentinaISO(),
        beneficiario: empleado.nombre,
        empleadoId: empleado.id,
        idempotencyKey: claveDelGastoDeConsumo(consumo.id),
        session,
        delConsumoDelPersonal: true,
      });
      gastoId = gasto.id;
      await tx.consumoPersonal.update({ where: { id: consumo.id }, data: { gastoId } });
    }

    const creado = await tx.consumoPersonal.findUnique({ where: { id: consumo.id }, select: SELECT_CONSUMO });
    return serializar(creado, { repetido: false, allowNegativeStockUsed });
  }, LIMITES_TRANSACCION_DEL_LOCAL);
}
