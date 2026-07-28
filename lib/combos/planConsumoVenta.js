// lib/combos/planConsumoVenta.js
//
// Helper PURO y testeable. Recibe las líneas comerciales ya normalizadas (con
// combos ya expandidos y validados contra la base) y produce:
//
//   1) lineasComerciales: cada línea con su subtotal, costoLinea y —si es combo—
//      los componentes congelables (cantidad total consumida por esa línea).
//   2) consumoFisicoConsolidado: agrupado por ProductoLocal.id, con la cantidad
//      TOTAL en escala real de StockLocal y las fuentes que lo originaron.
//
// Principio: cada ProductoLocal físico se consolida en UNA sola entrada, sumando
// el consumo directo (productos normales) y el de componentes de uno o más
// combos (incluido el mismo producto vendido suelto y dentro de combos).
//
// Conversión:
//   · NORMAL   → cantidadParaStockNormal(...) (misma lógica que el POS: factor
//     pack / fiambre / unidad remanente / depósito). Paridad exacta.
//   · COMPONENTE de combo → cantidadPorCombo × cantidadDeCombos. `ComboComponente.
//     cantidad` ya está en escala de StockLocal (definición de E2), por lo que NO
//     se le aplica conversión de factor pack.

import { cantidadParaStockNormal } from "../pos-ventas/consumoStock.js";

function round3(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// `lineas`: [
//   { tipo:"NORMAL", productoBaseId, productoLocalId, cantidad, precio, costoUnitario, baseStock, modoVentaLinea, nombre }
//   { tipo:"COMBO",  productoBaseId, comboProductoLocalId, cantidad, precio, costoUnitario,
//     componentes:[{ productoLocalId, productoBaseId, cantidadPorCombo, costoUnitario, nombre }] }
// ]
export function planConsumoVenta({ lineas = [], esDeposito = false } = {}) {
  const consumoMap = new Map(); // productoLocalId → entrada consolidada

  const acumular = (productoLocalId, productoBaseId, cantidad, nombre, fuente) => {
    if (!consumoMap.has(productoLocalId)) {
      consumoMap.set(productoLocalId, {
        productoLocalId,
        productoBaseId,
        nombre: nombre ?? null,
        cantidad: 0,
        fuentes: [],
      });
    }
    const e = consumoMap.get(productoLocalId);
    e.cantidad = round3(e.cantidad + Number(cantidad));
    if (e.nombre == null && nombre != null) e.nombre = nombre;
    e.fuentes.push(fuente);
  };

  const lineasComerciales = lineas.map((l, idx) => {
    const cantidad = Number(l.cantidad);
    const subtotal = round2(Number(l.precio) * cantidad);
    const costoLinea = round2(Number(l.costoUnitario) * cantidad);

    // SERVICIO de importe variable: NO consume stock (no entra a consumoMap).
    // Su subtotal/costo ya vienen server-authoritative desde la línea.
    if (l.tipo === "SERVICIO") {
      return { ...l, subtotal, costoLinea, componentesCongelables: [], consumoFisico: null };
    }

    if (l.tipo === "COMBO") {
      const componentesCongelables = (l.componentes || []).map((c) => {
        const cantidadConsumida = round3(Number(c.cantidadPorCombo) * cantidad);
        acumular(c.productoLocalId, c.productoBaseId, cantidadConsumida, c.nombre, {
          tipo: "COMBO",
          lineaIdx: idx,
          comboProductoLocalId: l.comboProductoLocalId,
          comboBaseId: l.productoBaseId,
          componenteProductoLocalId: c.productoLocalId,
          cantidad: cantidadConsumida,
        });
        return {
          productoLocalId: c.productoLocalId,
          productoBaseId: c.productoBaseId,
          cantidad: cantidadConsumida, // total por esta línea (por combo × combos vendidos)
          costoUnitario: Number(c.costoUnitario),
        };
      });
      // El combo NO consume stock directo: su consumo físico vive por componente
      // (VentaDetalleComponente). consumoFisico=null evita duplicar en VentaDetalle.
      return { ...l, subtotal, costoLinea, componentesCongelables, consumoFisico: null };
    }

    // NORMAL
    const stockQty = cantidadParaStockNormal({
      cantidadVenta: cantidad,
      esDeposito,
      baseStock: l.baseStock,
      modoVentaLinea: l.modoVentaLinea,
    });
    acumular(l.productoLocalId, l.productoBaseId, stockQty, l.nombre, {
      tipo: "NORMAL",
      lineaIdx: idx,
      productoLocalId: l.productoLocalId,
      productoBaseId: l.productoBaseId,
      cantidad: stockQty,
    });
    // Consumo físico congelable de ESTA línea (fuente única para VentaDetalle.
    // productoLocalId/cantidadStock — se persiste tal cual, sin recalcular después).
    return {
      ...l,
      subtotal,
      costoLinea,
      componentesCongelables: [],
      consumoFisico: { productoLocalId: l.productoLocalId, cantidadStock: stockQty },
    };
  });

  const consumoFisicoConsolidado = [...consumoMap.values()];
  return { lineasComerciales, consumoFisicoConsolidado };
}
