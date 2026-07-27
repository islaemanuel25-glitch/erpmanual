// lib/combos/ventaConsumo.js
//
// Núcleo de la integración de combos en la VENTA del POS. Todo corre DENTRO de la
// `$transaction` de crear (se le pasa `tx`). Se separa del route para poder testearlo.
//
//   · cargarComposicionParaVenta: lee la composición del combo desde la base y la
//     valida ESTRUCTURALMENTE al momento de la venta. Cualquier invalidez
//     estructural (componente inactivo/inexistente/de otro local/combo, cantidad
//     <=0, composición vacía, sin StockLocal) BLOQUEA la venta SIEMPRE, incluso con
//     allowNegativeStock.
//   · construirLineasComerciales: normaliza cada línea (normal o combo, resolviendo
//     el combo contra la base) y arma el plan consolidado de consumo. NO confía en
//     componentes ni costos enviados por el cliente.
//   · aplicarConsumoStock: bloquea (FOR UPDATE), valida y descuenta el consumo
//     consolidado en orden determinístico por productoLocalId (evita deadlock; una
//     sola escritura por ProductoLocal). La insuficiencia respeta allowNegativeStock;
//     el error de stock lleva el producto/componente limitante.

import { esComboBase } from "./guards.js";
import { costoUnitarioComponente, round2 } from "./costo.js";
import { planConsumoVenta } from "./planConsumoVenta.js";

export function errVentaCombo(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  e.esErrorVentaCombo = true;
  return e;
}

export async function cargarComposicionParaVenta(tx, { localId, comboProductoLocalId, comboNombre, esDeposito }) {
  const lid = Number(localId);
  const filas = await tx.comboComponente.findMany({
    where: { comboProductoLocalId },
    orderBy: { id: "asc" },
  });
  if (!filas.length) {
    throw errVentaCombo(`El combo "${comboNombre || comboProductoLocalId}" no tiene componentes: no se puede vender.`, 400);
  }

  const ids = filas.map((f) => f.componenteProductoLocalId);
  const pls = await tx.productoLocal.findMany({
    where: { id: { in: ids } },
    include: { base: true, stock: { where: { localId: lid }, select: { cantidad: true } } },
  });
  const porId = new Map(pls.map((pl) => [pl.id, pl]));

  const componentes = [];
  for (const f of filas) {
    const pl = porId.get(f.componenteProductoLocalId);
    const nombreC = pl?.base?.nombre || f.componenteProductoLocalId;
    if (!pl) throw errVentaCombo(`El combo "${comboNombre}" tiene un componente inexistente.`, 400);
    if (pl.localId !== lid) throw errVentaCombo(`El combo "${comboNombre}" tiene un componente de otro local.`, 400);
    if (esComboBase(pl.base)) throw errVentaCombo(`El combo "${comboNombre}" contiene otro combo ("${nombreC}").`, 400);
    if (pl.activo !== true || pl.base?.activo !== true) {
      throw errVentaCombo(`El componente "${nombreC}" está inactivo: el combo no se puede vender.`, 400);
    }
    const cantidadPorCombo = Number(f.cantidad);
    if (!(cantidadPorCombo > 0)) {
      throw errVentaCombo(`El combo "${comboNombre}" tiene una cantidad inválida en "${nombreC}".`, 400);
    }
    const tieneStockLocal = Array.isArray(pl.stock) && pl.stock.length > 0;
    if (!tieneStockLocal) {
      throw errVentaCombo(`El componente "${nombreC}" no tiene stock configurado: el combo no se puede vender.`, 400);
    }
    const costoUnitario = costoUnitarioComponente({ base: pl.base, productoLocal: pl, esDeposito });
    componentes.push({ productoLocalId: pl.id, productoBaseId: pl.baseId, cantidadPorCombo, costoUnitario, nombre: nombreC });
  }

  const costoUnitarioCombo = round2(componentes.reduce((s, c) => s + c.costoUnitario * c.cantidadPorCombo, 0));
  return { componentes, costoUnitarioCombo };
}

export async function construirLineasComerciales(tx, { items, productosBaseMap, costosMap, baseStockMap, localId, esDeposito }) {
  const lineas = [];
  for (const item of items) {
    const pb = productosBaseMap[item.productoBaseId] || {};
    const pl = await tx.productoLocal.findFirst({
      where: { localId, baseId: item.productoBaseId },
      select: { id: true, activo: true, base: { select: { nombre: true, modalidad: true } } },
    });
    if (!pl) throw new Error(`Producto ${item.nombre || item.productoBaseId} no encontrado en este local`);

    // SERVICIO de importe variable: línea SIN stock, con montos server-authoritative
    // (congelados en el route vía item.__servicio). Barrera dura: el producto DEBE ser
    // servicio server-side, aunque el flag haya llegado por otra vía.
    if (item.__servicio) {
      if (pl.base?.modalidad !== "IMPORTE_VARIABLE") {
        throw new Error(`El producto "${pl.base?.nombre || item.productoBaseId}" no es un servicio de importe variable.`);
      }
      const s = item.__servicio;
      lineas.push({
        tipo: "SERVICIO",
        productoBaseId: item.productoBaseId,
        productoLocalId: pl.id,
        nombre: pl.base?.nombre || item.nombre,
        precio: Number(s.precioFinal),
        cantidad: 1,
        costoUnitario: Number(s.precioCosto),
        servicio: s,
      });
      continue;
    }

    // Producto normal enviado como servicio (o servicio sin resolver): barrera dura.
    if (pl.base?.modalidad === "IMPORTE_VARIABLE") {
      throw new Error(`El producto "${pl.base?.nombre || item.productoBaseId}" es un servicio: debe venderse ingresando su importe.`);
    }

    if (pb.es_combo) {
      // Un combo DESACTIVADO (ProductoLocal.activo=false) no se puede vender, aunque el
      // cliente lo mande manualmente (el buscador ya lo excluye; esto es la barrera dura).
      if (pl.activo !== true) {
        throw errVentaCombo(`El combo "${pl.base?.nombre || item.nombre || item.productoBaseId}" está desactivado.`, 400);
      }
      // Combo: se resuelve y valida contra la base; costo desde componentes (no del cliente).
      const { componentes, costoUnitarioCombo } = await cargarComposicionParaVenta(tx, {
        localId,
        comboProductoLocalId: pl.id,
        comboNombre: item.nombre,
        esDeposito,
      });
      lineas.push({
        tipo: "COMBO",
        productoBaseId: item.productoBaseId,
        comboProductoLocalId: pl.id,
        nombre: item.nombre,
        precio: Number(item.precio),
        cantidad: Number(item.cantidad),
        costoUnitario: costoUnitarioCombo,
        componentes,
      });
    } else {
      // Normal: costo con la MISMA lógica actual (client precioCosto ?? fallback bulto/factor).
      const { costoBulto, factorPack } = costosMap[item.productoBaseId] || { costoBulto: 0, factorPack: 1 };
      const costoFromClient = Number(item.precioCosto);
      const costoUnitario =
        Number.isFinite(costoFromClient) && costoFromClient >= 0 ? costoFromClient : costoBulto / factorPack;
      lineas.push({
        tipo: "NORMAL",
        productoBaseId: item.productoBaseId,
        productoLocalId: pl.id,
        nombre: item.nombre,
        precio: Number(item.precio),
        cantidad: Number(item.cantidad),
        costoUnitario,
        baseStock: baseStockMap[item.productoBaseId],
        modoVentaLinea: item.modoVentaLinea,
      });
    }
  }

  return planConsumoVenta({ lineas, esDeposito });
}

export async function aplicarConsumoStock(tx, { localId, consumoFisicoConsolidado, allowNegativeStock }) {
  // Orden determinístico por productoLocalId ascendente → sin deadlock entre cajas.
  const ordenado = [...consumoFisicoConsolidado].sort((a, b) => a.productoLocalId - b.productoLocalId);
  let allowNegativeStockUsed = false;
  const descuentos = [];

  for (const c of ordenado) {
    const locked = await tx.$queryRaw`
      SELECT cantidad
      FROM "StockLocal"
      WHERE "localId" = ${localId}
        AND "productoId" = ${c.productoLocalId}
      FOR UPDATE
    `;
    const stockActual =
      locked && Array.isArray(locked) && locked.length > 0 ? Number(locked[0].cantidad || 0) : 0;

    if (stockActual < c.cantidad) {
      if (!allowNegativeStock) {
        const e = new Error(
          `Stock insuficiente para ${c.nombre || "producto"}. Disponible: ${stockActual}, requerido: ${c.cantidad}`
        );
        e.status = 409;
        e.limitante = {
          productoLocalId: c.productoLocalId,
          productoBaseId: c.productoBaseId,
          nombre: c.nombre,
          disponible: stockActual,
          requerido: c.cantidad,
          fuentes: c.fuentes,
        };
        throw e;
      }
      allowNegativeStockUsed = true;
      console.log(
        "[POS venta con stock negativo consolidado] productoLocalId=%s localId=%s requerido=%s stockActual=%s",
        c.productoLocalId,
        localId,
        c.cantidad,
        stockActual
      );
    }

    // Una sola escritura por ProductoLocal (consumo ya consolidado).
    await tx.stockLocal.updateMany({
      where: { localId, productoId: c.productoLocalId },
      data: { cantidad: { decrement: c.cantidad } },
    });
    descuentos.push({ productoLocalId: c.productoLocalId, cantidad: c.cantidad });
  }

  return { allowNegativeStockUsed, descuentos };
}
