// lib/transferencias/aplicarCorreccionEconomica.js
//
// ESCRIBE la corrección económica de una recepción. Recibe una transacción YA
// ABIERTA por el llamador y no abre ninguna: todo lo que hace tiene que caer o
// quedar junto con el movimiento de stock que la recepción acaba de hacer.
//
// La decisión de CUÁNTO es de `correccionEconomica.js`, que es puro y tiene sus
// candados. Acá solo está el orden de las escrituras y las guardas que no se
// pueden decidir sin mirar la base.
//
// ── LA REGLA CENTRAL: TODO O NADA ──────────────────────────────────────────
//
// Está prohibido que quede stock corregido con venta original, y está prohibido
// que quede venta corregida con recepción sin confirmar. Por eso esto NO es un
// endpoint aparte que el frontend llame después: es una llamada más adentro de
// la misma transacción de `confirmar-recepcion`. Si algo de acá falla, el stock
// tampoco se movió.
//
// ── POR QUÉ NO PASA POR `bloqueoCorreccion` ────────────────────────────────
//
// Esa guarda sigue en pie y no se toca: una venta con remito vivo NO se puede
// corregir a mano desde el POS ni desde Reportes, y sigue devolviendo 409. Lo
// que se abre acá es otra cosa —la venta corrigiéndose a sí misma al confirmar
// SU PROPIO remito—, y por eso vive del lado del servidor, sin ruta propia y sin
// forma de invocarla para otra venta. El candado que lo vigila está en
// `correccionEconomicaCamino.test.mjs`.

import { round2 } from "@/lib/pos-ventas/pagos";
import {
  TIPO_CORRECCION_RECEPCION,
  planCorreccionEconomica,
} from "./correccionEconomica.js";

/** Códigos estables. El llamador ramifica sobre ellos, no sobre el texto. */
export const CODIGOS_CORRECCION = {
  VENTA_CON_AJUSTES: "VENTA_CON_AJUSTES_NO_SOPORTADOS",
  VERSION_DESACTUALIZADA: "VENTA_VERSION_DESACTUALIZADA",
};

const num = (n) => Number(n ?? 0);

/**
 * Campos que este camino no sabe recalcular, y por eso frena si aparecen.
 *
 * Auditado sobre las 196 ventas internas con remito el 2026-09-11: los siete
 * están en cero en TODAS. Mientras eso siga siendo cierto, `subtotal`, `total` y
 * `netoRecibido` son el mismo número y la corrección es directa. Si alguna vez
 * aparece un descuento o una comisión, la relación deja de ser la identidad y
 * este camino estaría escribiendo un total que no sabe componer — así que frena
 * en vez de adivinar.
 */
const CAMPOS_QUE_FRENAN = [
  "descuento",
  "descuentoAutomatico",
  "descuentoManual",
  "descuentoPorPuntos",
  "descuentoPromocional",
  "recargoPagoImporte",
  "comisionBancaria",
];

/**
 * @param {object} tx   transacción de Prisma YA abierta
 * @param {object} args
 * @param {object} args.transferencia  { id, ventaId, estado }
 * @param {Array}  args.recibido       [{ productoBaseId, recibidasFisicas, factor }]
 * @param {number|null} args.usuarioId
 * @returns {Promise<object>} qué se hizo, para el informe y los candados
 */
export async function aplicarCorreccionEconomica(tx, { transferencia, recibido, usuarioId, grupoId }) {
  const ventaId = transferencia?.ventaId ?? null;

  // Una transferencia manual no tiene venta que corregir. No es un error.
  if (!ventaId) return { aplicada: false, motivo: "SIN_VENTA_VINCULADA" };

  const venta = await tx.venta.findUnique({
    where: { id: ventaId },
    include: {
      detalles: true,
      pagos: true,
      turno: { select: { id: true, cierre: true } },
    },
  });
  if (!venta) return { aplicada: false, motivo: "VENTA_NO_ENCONTRADA" };

  const conAjustes = CAMPOS_QUE_FRENAN.filter((c) => num(venta[c]) !== 0);
  if (conAjustes.length > 0) {
    const e = new Error(
      `${CODIGOS_CORRECCION.VENTA_CON_AJUSTES}: la venta ${ventaId} tiene ` +
        `${conAjustes.join(", ")} distinto de cero y este camino no sabe recomponer el total`
    );
    e.code = CODIGOS_CORRECCION.VENTA_CON_AJUSTES;
    throw e;
  }

  const plan = planCorreccionEconomica({
    venta: {
      id: venta.id,
      numero: venta.numero,
      total: venta.total,
      version: venta.version,
      turnoId: venta.turnoId,
      // Se REGISTRA, no se exige. 147 de las 196 ventas internas tienen el turno
      // original cerrado: exigirlo abierto bloquearía tres de cada cuatro
      // recepciones, y una recepción ocurre días después del despacho.
      turnoCerrado: venta.turno ? venta.turno.cierre != null : true,
      detalles: venta.detalles,
      pagos: venta.pagos,
    },
    transferenciaId: transferencia.id,
    recibido,
    estadoTransferencia: transferencia.estado ?? null,
  });

  if (!plan.aplica) {
    return { aplicada: false, motivo: plan.motivoNoAplica || "SIN_DIFERENCIA", plan };
  }

  // ── LAS LÍNEAS ────────────────────────────────────────────────────────────
  //
  // Reemplazo, que es el mismo patrón de la corrección completa: una recepción
  // con sueltas produce MÁS líneas que las originales —bultos y sueltas por
  // separado—, así que no alcanza con actualizar. Lo que se pierde son los ids de
  // las líneas viejas, y por eso el snapshot los guarda.
  const porOrigen = new Map(venta.detalles.map((d) => [d.id, d]));
  await tx.ventaDetalle.deleteMany({ where: { ventaId } });
  for (const l of plan.lineas) {
    const orig = porOrigen.get(l.origenDetalleId) || {};
    await tx.ventaDetalle.create({
      data: {
        ventaId,
        productoBaseId: l.productoBaseId,
        nombre: l.nombre,
        cantidad: l.cantidad,
        cantidadStock: l.cantidadStock,
        precio: l.precio,
        precioCosto: l.precioCosto,
        subtotal: l.subtotal,
        ganancia: l.ganancia,
        // Lo que identifica comercialmente a la línea viaja igual: la corrección
        // cambia CUÁNTO llegó, no con qué lista ni a qué tipo de precio se vendió.
        listaPrecioId: orig.listaPrecioId ?? null,
        tipoPrecioAplicado: orig.tipoPrecioAplicado ?? undefined,
        productoLocalId: orig.productoLocalId ?? null,
        precioNormal: orig.precioNormal ?? null,
        ofertaId: orig.ofertaId ?? null,
        ofertaNombre: orig.ofertaNombre ?? null,
      },
    });
  }

  // ── LOS PAGOS ─────────────────────────────────────────────────────────────
  //
  // Se ACTUALIZAN por id, no se reemplazan: `VentaPago` tiene únicos parciales
  // por medio y por modalidad, y borrar y recrear perdería el medio congelado,
  // el procesador y los nombres. Lo único que cambia es el monto.
  for (const p of plan.pagos) {
    const comision = num(porPago(venta.pagos, p.id)?.comision);
    await tx.ventaPago.update({
      where: { id: p.id },
      data: { monto: p.monto, neto: p.monto - comision },
    });
  }

  // ── LA CABECERA, CON BLOQUEO OPTIMISTA ────────────────────────────────────
  //
  // `updateMany` filtrando por versión: si otra corrección movió la venta entre
  // la lectura y ahora, no toca ninguna fila y la transacción entera se cae. Con
  // `update` a secas no se podría condicionar, porque `version` no es único.
  //
  // El costo sale de `subtotal - ganancia` y no de `cantidadStock × precioCosto`:
  // `precioCosto` está en la escala de SU línea —por pack en la de bultos, por
  // unidad en la de sueltas—, así que multiplicarlo por las unidades físicas
  // daría 144 × 5.250 en vez de 144 × 218,75. La ganancia ya se calculó contra el
  // costo por unidad física, una sola vez, en el módulo puro.
  const costoTotal = round2(plan.lineas.reduce((a, l) => a + num(l.subtotal) - num(l.ganancia), 0));
  const gananciaBruta = round2(plan.totalNuevo - costoTotal);
  const tocadas = await tx.venta.updateMany({
    where: { id: ventaId, version: plan.versionAntes },
    data: {
      total: plan.totalNuevo,
      subtotal: plan.totalNuevo,
      netoRecibido: plan.totalNuevo,
      costoTotal,
      gananciaBruta,
      gananciaNeta: gananciaBruta,
      corregida: true,
      version: plan.versionDespues,
    },
  });
  if (tocadas.count !== 1) {
    const e = new Error(
      `${CODIGOS_CORRECCION.VERSION_DESACTUALIZADA}: otra corrección movió la venta ${ventaId}`
    );
    e.code = CODIGOS_CORRECCION.VERSION_DESACTUALIZADA;
    throw e;
  }

  // ── EL RASTRO ─────────────────────────────────────────────────────────────
  //
  // `idempotencyKey` sale de la transferencia y choca contra el
  // `@@unique([ventaId, idempotencyKey])` que ya existe: un segundo intento de
  // confirmar la misma recepción no puede duplicar la corrección ni aunque se
  // saltee `reclamarOFallar`.
  const correccion = await tx.ventaCorreccion.create({
    data: {
      ventaId,
      tipo: TIPO_CORRECCION_RECEPCION,
      motivo: plan.motivo,
      idempotencyKey: plan.idempotencyKey,
      usuarioId: usuarioId ?? null,
      localId: venta.localId ?? null,
      // `Venta` no tiene `grupoId`: lo resuelve la ruta con `getGrupoIdDeLocal`,
      // que es la misma fuente que usa el resto del módulo.
      grupoId: grupoId ?? null,
      turnoIdOriginal: plan.turnoIdOriginal,
      turnoIdCorreccion: plan.turnoIdCorreccion,
      turnoCerrado: plan.turnoCerrado,
      versionAntes: plan.versionAntes,
      versionDespues: plan.versionDespues,
      totalAnterior: plan.totalAnterior,
      totalNuevo: plan.totalNuevo,
      diferencia: plan.diferencia,
      snapshotAntes: plan.snapshotAntes,
      snapshotDespues: plan.snapshotDespues,
      diffProductos: plan.diffProductos,
      diffPagos: plan.diffPagos,
      // Vacío a propósito: el inventario lo movió la recepción, en esta misma
      // transacción. Quién lo movió está dicho en `snapshotDespues.stockAplicadoPor`.
      impactoStock: plan.impactoStock,
      impactoCaja: plan.impactoCaja,
    },
    select: { id: true },
  });

  return {
    aplicada: true,
    correccionId: correccion.id,
    totalAnterior: plan.totalAnterior,
    totalNuevo: plan.totalNuevo,
    diferencia: plan.diferencia,
  };
}

const porPago = (pagos, id) => pagos.find((p) => p.id === id) || null;
