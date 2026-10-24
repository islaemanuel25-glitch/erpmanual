// DESHACER LO QUE UNA LISTA APLICÓ, CONTRA LA BASE.
//
// El criterio —qué se revierte y a qué valor— es de `reversion.js`, que es puro.
// Esto es lo que lo rodea: leer los productos frescos, armar la previa, comparar
// contra lo que la persona vio y escribir. Vivía adentro de `revertir/route.js`
// y salió de ahí tal cual el 2026-10-24, cuando CANCELAR una lista aplicada
// pasó a deshacer lo aplicado (Emanuel): las dos rutas escriben lo mismo con la
// misma función, o el día que una cambie dicen cosas distintas sobre los mismos
// costos.
//
// ── LA BITÁCORA ES LA MISMA ────────────────────────────────────────────────
//
// `escribirReversion` declara `LISTA_PROVEEDOR_REVERTIR` con la importación de
// referencia, en la transacción de quien llama, antes de escribir. Así una
// cancelación queda en el Libro de Costos igual que una reversión: producto por
// producto, con el costo de antes y el de después, quién y cuándo (el contexto
// de request lo abre `requirePerm`, que cada ruta llama primero). Las filas
// quedan con `revertidaEn` y `revertidaPorUsuarioId`.
//
// ── LO QUE NO SE TOCA ──────────────────────────────────────────────────────
//
// Vínculos, lecturas recordadas y los «No»: dicen quién es cada producto, no
// cuánto sale. Acá solo se escriben el costo y la venta del producto y de sus
// ubicaciones, y las marcas de aplicación de la fila.

import { productoDelProveedorWhere } from "./cargaErp.js";
import { planDeReversion, TEXTO_OMISION } from "./reversion.js";
import { declararOrigenDeCosto, ORIGEN_COSTO } from "../../precios/origenDeCosto.js";

/** Los campos de la fila que el plan necesita, y ninguno más. */
const CAMPOS_FILA = {
  id: true,
  filaExcel: true,
  aplicada: true,
  aplicadaEn: true,
  revertidaEn: true,
  costoPrevioAplicacion: true,
  costoAplicado: true,
  ventaAnterior: true,
  ventaNueva: true,
};

const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Los productos de la importación con sus filas aplicadas y sus overrides.
 *
 * Solo lectura. Es el mismo insumo para la previa y para la ejecución: pedirlo
 * dos veces con dos formas distintas es cómo una previa y su ejecución empiezan
 * a decir cosas diferentes.
 */
export async function cargarProductosParaRevertir(db, { importacionId, grupoId, proveedorId }) {
  const filas = await db.importacionListaFila.findMany({
    where: { importacionId, aplicada: true, productoBaseId: { not: null } },
    select: { ...CAMPOS_FILA, productoBaseId: true },
    orderBy: { filaExcel: "asc" },
  });
  const ids = [...new Set(filas.map((f) => f.productoBaseId))];
  if (ids.length === 0) return [];

  const productos = await db.productoBase.findMany({
    where: { id: { in: ids }, grupoId, ...productoDelProveedorWhere(proveedorId) },
    select: { id: true, nombre: true, precio_costo: true, precio_venta: true },
  });
  const overrides = await db.productoLocal.findMany({
    where: { baseId: { in: ids } },
    select: { id: true, baseId: true, localId: true, precio_costo: true, precio_venta: true },
  });

  const filasPorProducto = new Map();
  for (const f of filas) {
    if (!filasPorProducto.has(f.productoBaseId)) filasPorProducto.set(f.productoBaseId, []);
    filasPorProducto.get(f.productoBaseId).push({
      id: f.id,
      filaExcel: f.filaExcel,
      aplicada: f.aplicada,
      aplicadaEn: f.aplicadaEn,
      revertidaEn: f.revertidaEn,
      costoPrevioAplicacion: num(f.costoPrevioAplicacion),
      costoAplicado: num(f.costoAplicado),
      ventaAnterior: num(f.ventaAnterior),
      ventaNueva: num(f.ventaNueva),
    });
  }
  const overridesPorProducto = new Map();
  for (const o of overrides) {
    if (!overridesPorProducto.has(o.baseId)) overridesPorProducto.set(o.baseId, []);
    overridesPorProducto.get(o.baseId).push({
      id: o.id,
      localId: o.localId,
      precioCosto: num(o.precio_costo),
      precioVenta: num(o.precio_venta),
    });
  }

  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precioCostoActual: num(p.precio_costo),
    precioVentaActual: num(p.precio_venta),
    filas: filasPorProducto.get(p.id) ?? [],
    overrides: overridesPorProducto.get(p.id) ?? [],
  }));
}

/** El plan de una importación, leído con `db` (la raíz para la previa, el tx para escribir). */
export async function planDeLaImportacion(db, args) {
  return planDeReversion({ productos: await cargarProductosParaRevertir(db, args) });
}

/** Los que quedan afuera, con su texto. */
export function omitidosDelPlan(plan) {
  return plan.items
    .filter((x) => !x.revierte)
    .map((x) => ({
      productoBaseId: x.productoBaseId,
      nombre: x.nombre ?? null,
      motivo: x.motivo,
      texto: TEXTO_OMISION[x.motivo] ?? "No se puede revertir.",
    }));
}

/** La previa lista para mostrar: los números y los omitidos con su texto. */
export function respuestaDePrevia(plan) {
  return {
    resumen: plan.resumen,
    omitidos: omitidosDelPlan(plan),
    // El detalle completo viaja para poder mostrar el primer puñado sin pedirlo
    // de nuevo. La pantalla decide cuánto muestra.
    items: plan.items
      .filter((x) => x.revierte)
      .map((x) => ({
        productoBaseId: x.productoBaseId,
        nombre: x.nombre,
        costoActual: x.costoActual,
        costoDestino: x.costoDestino,
        ventaActual: x.ventaActual,
        ventaDestino: x.ventaDestino,
        ubicaciones: x.overrides.length,
        filasExcel: x.filasExcel,
      })),
  };
}

/**
 * EL CANDADO CONTRA LA PREVIA VIEJA. Los tres números que la persona vio. Si
 * alguno cambió, alguien tocó un producto mientras la previa estaba abierta y
 * lo que se está por escribir no es lo que se aprobó.
 */
export function difiereDeLaPrevia(esperado, resumen) {
  return (
    Number(esperado?.revierten) !== resumen.revierten ||
    Number(esperado?.ventasQueSeTocan) !== resumen.ventasQueSeTocan ||
    Number(esperado?.omitidos) !== resumen.omitidos
  );
}

/**
 * Escribe el plan con `tx`. Declara el origen en el Libro de Costos antes de
 * escribir. Devuelve lo escrito.
 */
export async function escribirReversion(tx, { plan, importacionId, usuarioId, ahora = new Date() }) {
  // Metadata para el Libro de Costos: no cambia qué costo se escribe.
  await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.LISTA_PROVEEDOR_REVERTIR, referencia: importacionId });

  let productosRevertidos = 0;
  let filasRevertidas = 0;
  let ventasRevertidas = 0;
  let overridesRevertidos = 0;

  for (const item of plan.items) {
    if (!item.revierte) continue;

    // El maestro. La venta vuelve solo si el plan lo dice: cuando alguien la
    // movió a mano, `ventaDestino` viene en null y no se toca.
    const dataBase = { precio_costo: item.costoDestino };
    if (item.ventaDestino !== null) dataBase.precio_venta = item.ventaDestino;
    await tx.productoBase.update({ where: { id: item.productoBaseId }, data: dataBase });
    if (item.ventaDestino !== null) ventasRevertidas++;

    for (const ov of item.overrides) {
      const dataLocal = { precio_costo: ov.costoDestino };
      if (ov.ventaDestino !== null) dataLocal.precio_venta = ov.ventaDestino;
      await tx.productoLocal.update({ where: { id: ov.productoLocalId }, data: dataLocal });
      overridesRevertidos++;
    }

    // La fila vuelve a contar como pendiente y CONSERVA su lectura
    // confirmada: el trabajo de decidir cómo se lee el precio no se pierde
    // por deshacer la escritura. El historial de la aplicación tampoco se
    // borra: es la prueba de qué se había escrito.
    //
    // ── Y VUELVE TILDADA, QUE ES LA MITAD QUE FALTABA ──────────────────
    //
    // `aplicar` apaga `seleccionada` al escribir —una fila cerrada marcada
    // para aplicar es una contradicción— y acá se la devolvía a pendiente
    // SIN volver a tildarla. El resultado: la fila volvía a contarse entre
    // las que se actualizan y `aplicar`, que consulta por `seleccionada`,
    // no la tocaba nunca más. Deshacer dejaba filas imposibles de aplicar.
    //
    // Es el caso que Emanuel encontró: una lista con tres deshechos y ocho
    // "listas" donde aplicar escribía cero, una y otra vez.
    //
    // Se tilda solo lo SELECCIONABLE y no excluido, que es el mismo
    // criterio con el que nace una fila al conciliar —`seleccionadaPorDefecto
    // = seleccionable`—. Una fila que alguien dejó como está sigue dejada:
    // deshacer devuelve un costo, no borra decisiones. (Cancelar destilda todo
    // después, en su misma transacción: una cancelada no tiene nada para
    // aplicar.)
    await tx.importacionListaFila.updateMany({
      where: { id: { in: item.filas }, importacionId },
      data: { aplicada: false, revertidaEn: ahora, revertidaPorUsuarioId: usuarioId },
    });
    await tx.importacionListaFila.updateMany({
      where: {
        id: { in: item.filas },
        importacionId,
        seleccionable: true,
        excluidaManual: false,
      },
      data: { seleccionada: true },
    });
    productosRevertidos++;
    filasRevertidas += item.filas.length;
  }

  return {
    productos: productosRevertidos,
    filas: filasRevertidas,
    ventas: ventasRevertidas,
    overrides: overridesRevertidos,
  };
}
