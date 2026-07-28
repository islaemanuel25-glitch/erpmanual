// lib/pos-ventas/correccionCompletaServer.js
//
// Helpers de SERVIDOR (con Prisma) para la corrección COMPLETA de ventas (Fase B).
// Comparten la MISMA lógica de resolución de líneas que `crear` (combos vía
// cargarComposicionParaVenta, servicios vía calcularServicio, baseStock idéntico)
// para que reversión/reaplicación tengan paridad exacta con la venta original.
//
// Regla de negocio DEFINITIVA: la corrección completa SOLO procede con el turno
// ORIGINAL abierto. Sin turno / turno no verificable / cerrado → fail-closed.

import { cargarComposicionParaVenta } from "@/lib/combos/ventaConsumo.js";
import {
  calcularServicio,
  resolverRecargoServicioPct,
  validarImporteServicio,
} from "@/lib/pos-ventas/servicios.js";

export const COD_TURNO_CERRADO = "turno_cerrado_no_corregible";
export const MSG_TURNO_CERRADO = "La venta no puede corregirse porque el turno original ya está cerrado.";

// --- Carga de la venta original (con consumo congelado) ---------------------
export async function cargarVentaOriginal(db, ventaId) {
  return db.venta.findUnique({
    where: { id: ventaId },
    include: {
      detalles: { include: { componentes: true } },
      pagos: true,
      cliente: { select: { id: true, nombre: true } },
      turno: { select: { id: true, cierre: true } },
      local: { select: { id: true, nombre: true, es_deposito: true } },
    },
  });
}

// --- Estado del turno ORIGINAL (fail-closed) --------------------------------
export function estadoTurnoCorreccion(venta) {
  if (!venta.turnoId) return { turnoAbierto: false, turnoId: null, motivoBloqueo: "sin_turno_original" };
  if (!venta.turno) return { turnoAbierto: false, turnoId: venta.turnoId, motivoBloqueo: "turno_no_verificable" };
  const abierto = venta.turno.cierre == null;
  return { turnoAbierto: abierto, turnoId: venta.turnoId, motivoBloqueo: abierto ? null : COD_TURNO_CERRADO };
}

// --- Detalles originales en la forma que consume el motor puro ---------------
export function detallesParaMotor(venta) {
  return venta.detalles.map((d) => ({
    id: d.id,
    productoBaseId: d.productoBaseId,
    nombre: d.nombre,
    esServicio: d.esServicio === true,
    productoLocalId: d.productoLocalId ?? null,
    cantidadStock: d.cantidadStock != null ? Number(d.cantidadStock) : null,
    cantidad: Number(d.cantidad),
    precio: Number(d.precio),
    precioCosto: Number(d.precioCosto),
    subtotal: Number(d.subtotal),
    componentes: (d.componentes || []).map((c) => ({
      productoBaseId: c.productoBaseId,
      productoLocalId: c.productoLocalId ?? null,
      cantidad: Number(c.cantidad),
    })),
  }));
}

// Flag legacy por línea original (para la UI: qué línea bloquearía la corrección).
export function flagsLegacyPorLinea(detallesMotor, reconstruir) {
  return detallesMotor.map((d) => {
    const r = reconstruir(d);
    return { detalleId: d.id, ambiguo: r.ambigua === true, motivo: r.ambigua ? r.motivo : null };
  });
}

// ENRIQUECE las líneas LEGACY (cantidadStock null) con el contexto necesario para
// que reconstruirConsumoOriginal (motor puro) decida de forma determinística o
// marque ambiguo: esDeposito, factor_pack, modo_envio, costoBulto, pieza fiambre,
// productoLocalId resuelto por (localId, baseId), y la modalidad confirmada por el
// admin (si vino en el request). Muta y devuelve el mismo array detMotor.
// `confirmaciones`: [{ origenDetalleId|detalleId, modalidad }].
export async function enriquecerReconstruccion(db, venta, detMotor, confirmaciones = []) {
  const esDeposito = venta.local?.es_deposito === true;
  const legacy = detMotor.filter((d) => !d.esServicio && (d.componentes || []).length === 0 && d.cantidadStock == null);
  const confPorDetalle = new Map((confirmaciones || []).map((c) => [Number(c.origenDetalleId ?? c.detalleId), c.modalidad]));
  if (!legacy.length) return detMotor;

  const baseIds = [...new Set(legacy.map((d) => d.productoBaseId))];
  const { infoMap } = await cargarMapsProductos(db, baseIds);
  const pls = await db.productoLocal.findMany({
    where: { localId: venta.localId, baseId: { in: baseIds } },
    select: { id: true, baseId: true },
  });
  const plPorBase = new Map(pls.map((p) => [p.baseId, p.id]));

  for (const d of legacy) {
    const info = infoMap[d.productoBaseId] || {};
    d.esDeposito = esDeposito;
    d.reconFactorPack = Math.max(1, Number(info.factor_pack) || 1);
    d.reconModoEnvio = info.modo_envio || null;
    d.reconCostoBulto = info.precio_costo != null ? Number(info.precio_costo) : null;
    d.reconEsPiezaFiambre = info.modoVentaDeposito === "PIEZA" && Number(info.pesoReferenciaKg) > 0;
    d.productoLocalIdResuelto = plPorBase.get(d.productoBaseId) ?? null;
    d.modalidadConfirmada = confPorDetalle.get(Number(d.id)) || null;
  }
  return detMotor;
}

// Mapea el resultado de reconstruirConsumoOriginal al estado que consume la UI de
// una línea original. estado: "congelado" | "reconstruido" | "ambiguo".
export function estadoReconstruccionUI(r) {
  if (r.ambigua) {
    return { estado: "ambiguo", motivo: r.motivo, modalidadesPosibles: r.modalidadesPosibles || null, recomendada: r.recomendada || null };
  }
  if (r.reconstruccion === "CONGELADO" || r.reconstruccion === "COMBO" || r.reconstruccion === "SERVICIO") {
    return { estado: "congelado", reconstruccion: r.reconstruccion };
  }
  const cantidadFisica = Array.isArray(r.consumo) && r.consumo.length ? r.consumo.reduce((a, c) => a + Number(c.cantidad), 0) : null;
  return { estado: "reconstruido", reconstruccion: r.reconstruccion, modalidad: r.modalidad || null, cantidadFisica };
}

// --- Maps de productos (idéntico a crear) -----------------------------------
export async function cargarMapsProductos(db, productoBaseIds) {
  const ids = [...new Set(productoBaseIds.map(Number).filter(Boolean))];
  const productosBase = ids.length
    ? await db.productoBase.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, precio_costo: true, factor_pack: true, modoVentaDeposito: true,
          pesoReferenciaKg: true, modo_envio: true, unidad_medida: true, es_combo: true,
          modalidad: true, recargoServicioDefaultPct: true, nombre: true, categoria_id: true,
        },
      })
    : [];
  const costosMap = {}, baseStockMap = {}, productosBaseMap = {}, infoMap = {};
  for (const p of productosBase) {
    const factorPack = Math.max(1, Number(p.factor_pack) || 1);
    costosMap[p.id] = { costoBulto: Number(p.precio_costo) || 0, factorPack };
    productosBaseMap[p.id] = { es_combo: p.es_combo === true };
    baseStockMap[p.id] = {
      modoVentaDeposito: p.modoVentaDeposito || "PESO",
      pesoReferenciaKg: Number(p.pesoReferenciaKg || 0),
      factorPack,
      modo_envio: p.modo_envio || null,
      unidad_medida: p.unidad_medida || "unidad",
    };
    infoMap[p.id] = p;
  }
  return { costosMap, baseStockMap, productosBaseMap, infoMap };
}

// --- Resolución server-authoritative de las líneas corregidas ---------------
// Devuelve líneas en el shape EXACTO de planConsumoVenta, conservando
// `origenDetalleId` para que el motor pueda clasificar preservada/modificada.
// lineasEditor: [{ origenDetalleId?, productoBaseId, cantidad, precio, precioCosto?,
//                  modoVentaLinea?, importeServicio? }]
export async function resolverLineasCorregidas(db, { localId, esDeposito, lineasEditor }) {
  const baseIds = lineasEditor.map((l) => l.productoBaseId);
  const { costosMap, baseStockMap, infoMap } = await cargarMapsProductos(db, baseIds);

  // ProductoLocal por base (fila de stock del local).
  const pls = await db.productoLocal.findMany({
    where: { localId, baseId: { in: [...new Set(baseIds.map(Number))] } },
    select: { id: true, baseId: true, activo: true, recargoServicioPct: true },
  });
  const plPorBase = new Map(pls.map((p) => [p.baseId, p]));

  const out = [];
  for (const l of lineasEditor) {
    const baseId = Number(l.productoBaseId);
    const info = infoMap[baseId];
    const pl = plPorBase.get(baseId);
    if (!info || !pl) {
      const e = new Error(`Producto ${l.productoBaseId} no encontrado en este local.`);
      e.status = 400; e.code = "producto_no_en_local";
      throw e;
    }

    // SERVICIO de importe variable (server-authoritative).
    if (info.modalidad === "IMPORTE_VARIABLE") {
      const v = validarImporteServicio(l.importeServicio ?? l.precio);
      if (!v.valido) { const e = new Error(v.error || "Importe de servicio inválido."); e.status = 400; e.code = "importe_servicio_invalido"; throw e; }
      const pct = resolverRecargoServicioPct(pl.recargoServicioPct, info.recargoServicioDefaultPct);
      const s = calcularServicio(v.importe, pct);
      out.push({
        tipo: "SERVICIO", origenDetalleId: l.origenDetalleId ?? null,
        productoBaseId: baseId, productoLocalId: pl.id, nombre: info.nombre,
        cantidad: 1, precio: s.precioFinal, costoUnitario: s.precioCosto,
        servicio: { importeBaseServicio: s.importeBase, recargoServicioPct: s.recargoPct, recargoServicioImporte: s.recargoImporte, precioFinal: s.precioFinal, precioCosto: s.precioCosto },
      });
      continue;
    }

    if (info.es_combo === true) {
      if (pl.activo !== true) { const e = new Error(`El combo "${info.nombre}" está desactivado.`); e.status = 400; e.code = "combo_desactivado"; throw e; }
      const { componentes, costoUnitarioCombo } = await cargarComposicionParaVenta(db, {
        localId, comboProductoLocalId: pl.id, comboNombre: info.nombre, esDeposito,
      });
      out.push({
        tipo: "COMBO", origenDetalleId: l.origenDetalleId ?? null,
        productoBaseId: baseId, comboProductoLocalId: pl.id, nombre: info.nombre,
        cantidad: Number(l.cantidad), precio: Number(l.precio), costoUnitario: costoUnitarioCombo, componentes,
      });
      continue;
    }

    // NORMAL. Costo: cliente (si válido) o fallback bulto/factor (igual que crear).
    const { costoBulto, factorPack } = costosMap[baseId] || { costoBulto: 0, factorPack: 1 };
    const costoClient = Number(l.precioCosto);
    const costoUnitario = Number.isFinite(costoClient) && costoClient >= 0 ? costoClient : costoBulto / factorPack;
    out.push({
      tipo: "NORMAL", origenDetalleId: l.origenDetalleId ?? null,
      productoBaseId: baseId, productoLocalId: pl.id, nombre: info.nombre,
      cantidad: Number(l.cantidad), precio: Number(l.precio), costoUnitario,
      baseStock: baseStockMap[baseId], modoVentaLinea: l.modoVentaLinea || "NORMAL",
    });
  }
  return out;
}

// --- Stock actual por productoLocalId ---------------------------------------
export async function leerStockActual(db, localId, productoLocalIds) {
  const ids = [...new Set(productoLocalIds.filter((x) => x != null))];
  if (!ids.length) return {};
  const filas = await db.stockLocal.findMany({
    where: { localId, productoId: { in: ids } },
    select: { productoId: true, cantidad: true },
  });
  const m = {};
  for (const f of filas) m[f.productoId] = Number(f.cantidad);
  return m;
}

// --- Lock de stock (FOR UPDATE) en orden estable → sin deadlock --------------
// Bloquea las filas StockLocal involucradas y devuelve el stock actual bajo lock.
export async function lockStockActual(tx, localId, productoLocalIds) {
  const ids = [...new Set(productoLocalIds.filter((x) => x != null))].sort((a, b) => a - b);
  const stock = {};
  for (const pl of ids) {
    const rows = await tx.$queryRaw`
      SELECT cantidad FROM "StockLocal"
      WHERE "localId" = ${localId} AND "productoId" = ${pl}
      FOR UPDATE`;
    stock[pl] = rows && rows.length ? Number(rows[0].cantidad || 0) : 0;
  }
  return stock;
}

// --- Aplicar delta neto de stock (una escritura por productoLocalId) ---------
export async function aplicarDeltaStock(tx, localId, deltaStockFilas) {
  for (const f of [...deltaStockFilas].sort((a, b) => a.productoLocalId - b.productoLocalId)) {
    if (!f.delta) continue;
    await tx.stockLocal.updateMany({
      where: { localId, productoId: f.productoLocalId },
      data: { cantidad: { increment: f.delta } }, // delta = stock a SUMAR (revert − consumo)
    });
  }
}

// --- Saldo de puntos de un cliente (derivado del ledger) --------------------
async function saldoPuntos(tx, { clienteId, localId, grupoId }) {
  const agg = await tx.clientePuntoMovimiento.groupBy({
    by: ["direccion"], where: { clienteId, localId, grupoId }, _sum: { puntos: true },
  });
  let credito = 0, debito = 0;
  for (const r of agg) {
    if (r.direccion === "CREDITO") credito = Number(r._sum.puntos || 0);
    if (r.direccion === "DEBITO") debito = Number(r._sum.puntos || 0);
  }
  return credito - debito;
}

// --- Ajuste de CUENTA CORRIENTE por corrección (movimientos compensatorios) --
// No borra movimientos anteriores. Usa correccionId para distinguir.
//   · fiada antes → reversa CREDITO (tipo AJUSTE) al cliente anterior por totalAnterior.
//   · fiada después → DEBITO (tipo VENTA) al cliente nuevo por totalNuevo.
export async function ajustarCuentaCorriente(tx, {
  correccionId, grupoId, localId, ventaId, numero, userId,
  esFiadoAntes, esFiadoDespues, clienteAntes, clienteDespues, totalAnterior, totalNuevo,
}) {
  const movimientos = [];
  if (esFiadoAntes && clienteAntes) {
    const m = await tx.movimientoCuenta.create({
      data: {
        grupoId, localId, clienteId: clienteAntes, tipo: "AJUSTE", direccion: "CREDITO",
        monto: totalAnterior, ventaId, correccionId, userId: userId || null,
        nota: `Reversa por corrección de venta #${numero}`,
      },
    });
    movimientos.push({ id: m.id, tipo: "reversa", clienteId: clienteAntes, direccion: "CREDITO", monto: totalAnterior });
  }
  if (esFiadoDespues && clienteDespues) {
    const m = await tx.movimientoCuenta.create({
      data: {
        grupoId, localId, clienteId: clienteDespues, tipo: "VENTA", direccion: "DEBITO",
        monto: totalNuevo, ventaId, correccionId, userId: userId || null,
        nota: `Corrección de venta #${numero}`,
      },
    });
    movimientos.push({ id: m.id, tipo: "debito", clienteId: clienteDespues, direccion: "DEBITO", monto: totalNuevo });
  }
  return movimientos;
}

// --- Ajuste de PUNTOS por corrección (fail-closed en saldo negativo) --------
// Devuelve { movimientos } o lanza error puntos_insuficientes_para_corregir.
export async function ajustarPuntosCorreccion(tx, {
  correccionId, grupoId, localId, ventaId, numero, userId,
  clienteAntes, clienteDespues, puntosOriginal, puntosNuevo,
}) {
  const movimientos = [];
  const mismoCliente = (clienteAntes ?? null) === (clienteDespues ?? null);

  const errNeg = () => { const e = new Error("El cliente no tiene puntos suficientes para aplicar la corrección."); e.status = 409; e.code = "puntos_insuficientes_para_corregir"; return e; };

  if (mismoCliente) {
    if (!clienteDespues) return movimientos; // sin cliente → sin puntos
    const delta = puntosNuevo - puntosOriginal;
    if (delta === 0) return movimientos;
    if (delta < 0) {
      const saldo = await saldoPuntos(tx, { clienteId: clienteDespues, localId, grupoId });
      if (saldo - Math.abs(delta) < 0) throw errNeg();
    }
    const m = await tx.clientePuntoMovimiento.create({
      data: {
        grupoId, localId, clienteId: clienteDespues, direccion: delta > 0 ? "CREDITO" : "DEBITO",
        tipo: "AJUSTE", puntos: Math.abs(delta), ventaId, correccionId, userId: userId || null,
        nota: `Ajuste por corrección de venta #${numero}`,
      },
    });
    movimientos.push({ id: m.id, clienteId: clienteDespues, direccion: delta > 0 ? "CREDITO" : "DEBITO", puntos: Math.abs(delta) });
    return movimientos;
  }

  // Cambio de cliente: DEBITO al anterior (todos los puntos originales) + CREDITO al nuevo.
  if (clienteAntes && puntosOriginal > 0) {
    const saldo = await saldoPuntos(tx, { clienteId: clienteAntes, localId, grupoId });
    if (saldo - puntosOriginal < 0) throw errNeg();
    const m = await tx.clientePuntoMovimiento.create({
      data: {
        grupoId, localId, clienteId: clienteAntes, direccion: "DEBITO", tipo: "AJUSTE",
        puntos: puntosOriginal, ventaId, correccionId, userId: userId || null,
        nota: `Traslado por corrección (cliente anterior) venta #${numero}`,
      },
    });
    movimientos.push({ id: m.id, clienteId: clienteAntes, direccion: "DEBITO", puntos: puntosOriginal });
  }
  if (clienteDespues && puntosNuevo > 0) {
    const m = await tx.clientePuntoMovimiento.create({
      data: {
        grupoId, localId, clienteId: clienteDespues, direccion: "CREDITO", tipo: "ACREDITACION",
        puntos: puntosNuevo, ventaId, correccionId, userId: userId || null,
        nota: `Traslado por corrección (cliente nuevo) venta #${numero}`,
      },
    });
    movimientos.push({ id: m.id, clienteId: clienteDespues, direccion: "CREDITO", puntos: puntosNuevo });
  }
  return movimientos;
}

// Subtotal ELEGIBLE para puntos de un set de líneas comerciales (excluye
// servicios + categorías/productos excluidos), espejo de crear.
export function subtotalElegiblePuntos(lineasComerciales, infoMap, exclusiones = {}) {
  const exclCats = new Set(exclusiones.categoriaIds || []);
  const exclProds = new Set(exclusiones.productoBaseIds || []);
  let s = 0;
  for (const l of lineasComerciales) {
    if (l.tipo === "SERVICIO") continue;
    if (exclProds.has(l.productoBaseId)) continue;
    const catId = infoMap[l.productoBaseId]?.categoria_id;
    if (catId != null && exclCats.has(catId)) continue;
    s += Number(l.precio) * Number(l.cantidad);
  }
  return s;
}
