// lib/pos-ventas/reversionVenta.js
//
// EL MOTOR DE REVERSIÓN DE UNA VENTA. Recibe una transacción abierta y deshace
// los efectos de una venta: stock, cuenta corriente y puntos. Marca la venta como
// anulada y deja el rastro en `VentaCorreccion`.
//
// ── POR QUÉ ES UNA PIEZA Y NO UNA RUTA ──────────────────────────────────────
//
// Nació dentro de `/api/pos-ventas/venta/[id]/anular` el 2026-08-20. Ese mismo
// día se decidió que una venta interna se corrige desde el REMITO —en el módulo
// Transferencias, que es el documento que el local destino recibe y revisa— y no
// desde Ventas. La ruta se retiró; el motor no, porque es correcto y está
// probado.
//
// Vive acá para que el llamador sea quien decida CUÁNDO revertir, y el motor solo
// sepa CÓMO. Hoy lo llama `transferencias/cancelar`. Si mañana hace falta anular
// una venta común —sin remito— el motor ya está y no hay que escribir un segundo.
//
// ── LO QUE NO HACE, Y ES A PROPÓSITO ────────────────────────────────────────
//
// No toca la transferencia. Quien la cancela es el llamador, porque la
// transferencia tiene su propia política de stock —`SOLO_TRANSITO` cuando nació
// de una venta— y mezclarlas acá haría que el depósito recupere la mercadería dos
// veces: una por la reversión de la venta y otra por la del remito.
//
// No abre la transacción: la recibe. Así el llamador puede meter la cancelación
// del remito y la reversión de la venta en la MISMA, que es lo que hace que sea
// todo o nada.
//
// No borra nada. Ni la venta, ni sus líneas, ni sus pagos. Los pagos se conservan
// para que quede el rastro de cómo se había cobrado; la venta entera deja de
// contar porque el filtro comercial la excluye por `anuladaEn`.

import {
  aplicarDeltaStock,
  ajustarCuentaCorriente,
  ajustarPuntosCorreccion,
} from "@/lib/pos-ventas/correccionCompletaServer";

/**
 * Lo que hay que devolverle al stock: todo lo que la venta consumió.
 *
 * Una línea consume por sus COMPONENTES si es un combo, y por sí misma si no.
 * `cantidadStock` es la cantidad en escala física; `null` marca una línea que no
 * mueve stock —un servicio— y ésas no aportan nada.
 */
export function deltaDeDevolucion(detalles = []) {
  const porProducto = new Map();
  const sumar = (productoLocalId, cantidad) => {
    if (!productoLocalId) return;
    const c = Number(cantidad);
    if (!Number.isFinite(c) || c === 0) return;
    porProducto.set(productoLocalId, (porProducto.get(productoLocalId) || 0) + c);
  };

  for (const d of detalles) {
    const comps = d.componentes || [];
    if (comps.length > 0) {
      for (const c of comps) sumar(c.productoLocalId, c.cantidad);
      continue;
    }
    sumar(d.productoLocalId, d.cantidadStock);
  }

  // `delta` es lo que se SUMA al stock: devolver lo consumido es positivo.
  return [...porProducto.entries()].map(([productoLocalId, cantidad]) => ({
    productoLocalId,
    delta: cantidad,
  }));
}

/**
 * El efecto de la anulación sobre el arqueo, para poder DECIRLO antes de hacerlo.
 *
 * Anular una venta que hoy cuenta para el arqueo BAJA el esperado del turno donde
 * cae. Anular una venta interna —que no cuenta, porque tiene remito— no lo mueve.
 * Las dos cosas se ven iguales desde la pantalla y la diferencia es de cientos de
 * miles de pesos.
 */
export function impactoEnArqueo(venta) {
  const pagos = venta?.pagos || [];
  const contaba = venta?.transferencia == null && venta?.anuladaEn == null;
  const medios = pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto) || 0 }));
  const total = medios.reduce((a, m) => a + m.monto, 0);
  return {
    contabaEnArqueo: contaba,
    deltaEsperado: contaba ? -total : 0,
    medios: contaba ? medios : [],
  };
}

/**
 * Revierte una venta dentro de una transacción abierta.
 *
 * @param {object} tx            transacción de Prisma, YA abierta por el llamador
 * @param {object} args
 * @param {object} args.venta    la venta con detalles, pagos y turno
 * @param {number} args.grupoId
 * @param {number|null} args.usuarioId  quién revierte
 * @param {string} args.motivo
 * @param {number|null} args.turnoDestinoId  turno abierto donde cae la diferencia
 * @param {boolean} args.turnoOriginalCerrado
 * @param {string} [args.origen="anulacion"]  de dónde vino la orden, para el rastro
 * @returns {Promise<object>} resumen de lo revertido
 * @throws {Error} VERSION_DESACTUALIZADA si otra corrección movió la venta
 */
export async function revertirVenta(
  tx,
  {
    venta,
    grupoId,
    usuarioId = null,
    motivo,
    turnoDestinoId = null,
    turnoOriginalCerrado = false,
    versionEsperada,
    origen = "anulacion",
  }
) {
  const arqueo = impactoEnArqueo(venta);

  // ── 1 · El stock de la venta ───────────────────────────────────────────────
  const delta = deltaDeDevolucion(venta.detalles);
  await aplicarDeltaStock(tx, venta.localId, delta);

  // ── 2 · Marcar la venta ────────────────────────────────────────────────────
  //
  // Con bloqueo optimista Y con `anuladaEn: null` en el where: sin esa segunda
  // condición, dos anulaciones concurrentes devolverían el stock dos veces.
  const versionBase = Number.isFinite(versionEsperada) ? versionEsperada : venta.version;
  const upd = await tx.venta.updateMany({
    where: { id: venta.id, version: versionBase, anuladaEn: null },
    data: {
      anuladaEn: new Date(),
      anuladaPorId: usuarioId,
      motivoAnulacion: motivo,
      version: { increment: 1 },
    },
  });
  if (upd.count === 0) throw new Error("VERSION_DESACTUALIZADA");

  // ── 3 · El rastro ──────────────────────────────────────────────────────────
  const correccion = await tx.ventaCorreccion.create({
    data: {
      ventaId: venta.id,
      tipo: "ANULACION",
      motivo,
      usuarioId,
      operadorId: venta.operadorId ?? null,
      localId: venta.localId,
      grupoId: grupoId ?? null,
      turnoIdOriginal: venta.turnoId ?? null,
      // La diferencia cae en el turno abierto AHORA, que puede no ser el
      // original. Es lo que permite revertir una venta de un turno cerrado sin
      // tocar un arqueo ya contado.
      turnoIdCorreccion: turnoDestinoId,
      turnoCerrado: turnoOriginalCerrado,
      versionAntes: versionBase,
      versionDespues: versionBase + 1,
      totalAnterior: venta.total,
      totalNuevo: 0,
      diferencia: Number(venta.total) * -1,
      snapshotAntes: {
        origenDeLaOrden: origen,
        total: String(venta.total),
        clienteId: venta.clienteId,
        esFiado: venta.esFiado,
        pagos: (venta.pagos || []).map((p) => ({ medio: p.medio, monto: String(p.monto) })),
        transferenciaId: venta.transferencia?.id ?? null,
      },
      snapshotDespues: { anulada: true, motivo },
      diffProductos: (venta.detalles || []).map((d) => ({
        nombre: d.nombre,
        productoLocalId: d.productoLocalId,
        cantidadAntes: d.cantidadStock,
        cantidadDespues: 0,
      })),
      diffPagos: (venta.pagos || []).map((p) => ({
        medio: p.medio,
        montoAntes: String(p.monto),
        montoDespues: "0",
      })),
      impactoStock: delta,
      impactoCaja: arqueo,
    },
  });

  // ── 4 · Cuenta corriente y puntos ──────────────────────────────────────────
  //
  // Las mismas funciones de la corrección completa, con "el después es nada":
  // solo emiten la reversa. Van DESPUÉS del registro porque las dos necesitan su
  // id para poder distinguir sus movimientos.
  const movimientosCC = await ajustarCuentaCorriente(tx, {
    correccionId: correccion.id,
    grupoId,
    localId: venta.localId,
    ventaId: venta.id,
    numero: venta.numero,
    userId: usuarioId,
    esFiadoAntes: venta.esFiado === true,
    esFiadoDespues: false,
    clienteAntes: venta.clienteId,
    clienteDespues: null,
    totalAnterior: venta.total,
    totalNuevo: 0,
  });

  const puntos = await ajustarPuntosCorreccion(tx, {
    correccionId: correccion.id,
    grupoId,
    localId: venta.localId,
    ventaId: venta.id,
    numero: venta.numero,
    userId: usuarioId,
    clienteAntes: venta.clienteId,
    clienteDespues: null,
    puntosOriginal: null,
    puntosNuevo: 0,
  });

  return {
    correccionId: correccion.id,
    productosDevueltos: delta.length,
    movimientosCuenta: movimientosCC.length,
    movimientosPuntos: (puntos?.movimientos || []).length,
    arqueo,
  };
}
