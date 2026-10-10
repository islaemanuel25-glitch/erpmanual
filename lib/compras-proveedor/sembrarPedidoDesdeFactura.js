// ESCRIBIR EN LA BASE LO QUE EL PAPEL DICTÓ.
//
// La decisión —qué línea de pedido hace falta, con qué cantidad y en qué
// escala— vive en `pedidoDesdeFactura`, que es puro y tiene sus candados. Acá
// están los datos que esa decisión necesita y la escritura, que es lo que no se
// puede probar sin Postgres.
//
// ── POR QUÉ ES IDEMPOTENTE, Y NO UN "CREAR SI NO HAY" ─────────────────────
//
// Volver a leer un comprobante BORRA sus líneas y las escribe de nuevo, así que
// se pierden `productoLocalId` y `pedidoDetalleId`. Si esto solo corriera la
// primera vez, un relectura dejaría el pedido con sus líneas y las del papel
// sin atar a ninguna: la pantalla mostraría todo sin vincular y el cierre no
// tendría dónde escribir. Corre después de cada lectura y vuelve a atar.
//
// Y NO BORRA NADA. Un pedido nacido de una factura puede recibir una segunda
// hoja del mismo papel; borrar lo que la hoja anterior sembró sería perder la
// mitad de la mercadería. Solo agrega y ata.
//
// ── EL PRECIO QUE SE GUARDA ES EL INTERNO DEL ERP ─────────────────────────
//
// `precio_costo` del producto, no el de la factura. De eso depende que la
// comparación de precio tenga dos lados distintos y que la ganancia del
// depósito sea un número y no cero. Está explicado largo en `pedidoDesdeFactura`.

import {
  analizarLineas,
  aplanarDetalles,
  cargarContexto,
  vinculadasDeTodos,
} from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { loQueHayQueSembrar, resumenDeLaSiembra } from "@/lib/compras-proveedor/pedidoDesdeFactura";
import { costoParaUnidad } from "@/lib/compras-proveedor/importacion/merge";

/** El mismo `select` de líneas que usa la conciliación: una sola forma. */
const SELECT_LINEAS = {
  id: true, orden: true, textoCrudo: true, codigoProveedor: true, cantidad: true,
  netoUnitario: true, subtotalImpreso: true, internoUnitario: true,
  pesoKg: true, bonificacionPct: true, ivaPct: true,
  // Lo que interpretó el modelo: con él se analiza el precio y se sabe si un
  // renglón es envase. Sin esto la siembra costearía distinto que la pantalla.
  costoFinalRenglon: true, enQueViene: true, tipoRenglon: true,
  productoLocalId: true, pedidoDetalleId: true, precioPedidoPrevio: true,
  revisadoEnRecepcion: true, revisadoEnRecepcionAt: true,
};

/**
 * Arma las líneas del pedido con lo que el papel trajo.
 *
 * @returns `{ ok, motivo?, ...resumen }`. Nunca tira: el que la llama está
 *          terminando de guardar una lectura que ya costó una llamada de IA, y
 *          perderla por esto sería cambiar un problema por uno peor.
 */
export async function sembrarPedidoDesdeFactura(prisma, { pedidoId, grupoId, localId } = {}) {
  const pedido = await prisma.pedidoProveedor.findFirst({
    where: { id: Number(pedidoId), grupoId },
    select: { id: true, estado: true, proveedorId: true, nacidoDeFactura: true },
  });
  if (!pedido) return { ok: false, motivo: "NO_EXISTE" };
  // Un pedido normal NO se toca: sus líneas las eligió una persona y el papel
  // no puede agregarle productos por su cuenta.
  if (!pedido.nacidoDeFactura) return { ok: false, motivo: "NO_NACIO_DE_FACTURA" };
  // Cerrado ya movió stock. Sembrar acá agregaría mercadería después del hecho.
  if (pedido.estado !== "ENVIADO") return { ok: false, motivo: `ESTADO_${pedido.estado}` };

  const comprobantes = await prisma.comprobanteProveedor.findMany({
    where: { grupoId, pedidoId: pedido.id, estado: { not: "ANULADO" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, estado: true, tipo: true, puntoVenta: true, numero: true, fecha: true,
      confirmadoEn: true, imagenBorradaEn: true, leidoEn: true, recetaUsada: true,
      proveedor: {
        select: { id: true, nombre: true, umbralRevisarPct: true, umbralSospechaBajaPct: true },
      },
      lineas: { orderBy: { orden: "asc" }, select: SELECT_LINEAS },
    },
  });
  if (!comprobantes.length) return { ok: true, productos: 0, vincularonSolas: 0, sinVincular: 0, renglones: 0 };

  const detalles = await prisma.pedidoProveedorDetalle.findMany({
    where: { pedidoId: pedido.id },
    select: {
      id: true, cantidad: true, precioCosto: true, cantidadRecibida: true, unidad: true,
      producto: { select: { baseId: true, base: { select: { id: true, nombre: true, factor_pack: true, modoCompraProveedor: true } } } },
    },
  });
  const detallesPlanos = aplanarDetalles(detalles);

  // LA MISMA CASCADA QUE LA PANTALLA. No se busca nada acá: se analiza con la
  // función que ya decide a qué producto corresponde cada renglón.
  const contexto = await cargarContexto(prisma, {
    grupoId,
    localId,
    proveedorId: pedido.proveedorId,
  });
  const porProductoLocal = await vinculadasDeTodos(prisma, comprobantes);
  const analizadas = comprobantes.flatMap((c) =>
    analizarLineas({ comprobante: c, contexto, detallesPlanos, porProductoLocal })
  );

  const plan = loQueHayQueSembrar({ filas: analizadas, detalles: detallesPlanos });
  const resumen = resumenDeLaSiembra(plan);
  if (!plan.aCrear.length && !plan.aEnlazar.length) return { ok: true, ...resumen };

  // El producto de esta ubicación, y su costo interno. Un combo no se compra:
  // es el mismo criterio que usa la ruta de crear un pedido.
  const bases = [
    ...new Set([...plan.aCrear.map((c) => c.productoBaseId), ...plan.aEnlazar.map((e) => e.productoBaseId)]),
  ];
  const locales = await prisma.productoLocal.findMany({
    where: { baseId: { in: bases }, localId: Number(localId), activo: true },
    select: { id: true, baseId: true, base: { select: { id: true, precio_costo: true, es_combo: true } } },
  });
  const localPorBase = new Map(
    locales.filter((pl) => pl.base?.es_combo !== true).map((pl) => [pl.baseId, pl])
  );

  const creados = await prisma.$transaction(async (tx) => {
    const detallePorBase = new Map(plan.aEnlazar.map((e) => [e.productoBaseId, e.detalleId]));

    for (const c of plan.aCrear) {
      const pl = localPorBase.get(c.productoBaseId);
      if (!pl) continue; // No está en esta ubicación: la línea queda sin atar.
      const creado = await tx.pedidoProveedorDetalle.create({
        data: {
          pedidoId: pedido.id,
          productoLocalId: pl.id,
          cantidad: c.cantidad,
          unidad: c.unidad,
          // El precio interno del ERP. Si el producto no tiene costo cargado
          // queda en null, que es lo que ya significa "no hay con qué comparar"
          // en toda la pantalla — no se pone el de la factura.
          //
          // ── Y EN LA UNIDAD EN QUE QUEDA LA LÍNEA ─────────────────────────
          //
          // `precio_costo` de un producto PACK está POR BULTO, y acá la unidad
          // la decide el papel: `pedidoDesdeFactura` pone UNIDAD cuando no pudo
          // resolverla. Sin convertir, la línea queda con la cantidad en
          // sueltas y el precio en packs — que es el defecto que dejó al
          // renglón de las hamburguesas del #242 en 90 × $61.703.
          //
          // `costoParaUnidad` es la misma función que usa la importación desde
          // archivo, y sabe además que un fiambre o un producto por kilo NO se
          // divide por el pack.
          precioCosto: costoParaUnidad({
            costoMaestro: pl.base?.precio_costo ?? null,
            unidad: c.unidad,
            producto: pl.base,
          }),
        },
        select: { id: true },
      });
      detallePorBase.set(c.productoBaseId, creado.id);
    }

    // Y las líneas del papel quedan atadas: `productoLocalId` es lo que hace
    // que la pantalla la muestre vinculada, y `pedidoDetalleId` lo que permite
    // aceptar un precio y recibirla.
    let atadas = 0;
    for (const f of analizadas) {
      const base = f?.productoBaseId ?? null;
      if (base == null) continue;
      const detalleId = detallePorBase.get(base) ?? null;
      const pl = localPorBase.get(base);
      if (detalleId == null || !pl) continue;
      if (f.productoLocalId === pl.id && f.pedidoDetalleId === detalleId) continue;
      await tx.comprobanteLinea.update({
        where: { id: f.id },
        data: { productoLocalId: pl.id, pedidoDetalleId: detalleId },
      });
      atadas += 1;
    }
    return atadas;
  });

  return { ok: true, ...resumen, atadas: creados };
}
