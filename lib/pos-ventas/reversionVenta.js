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
// sepa CÓMO. Lo llaman dos rutas: `transferencias/cancelar`, para la venta interna
// que nació con un remito, y desde el 2026-10-10 `/api/pos-ventas/venta/[id]/anular`
// de nuevo, para la venta COMÚN del mostrador —sin remito—. Volvió por un caso real:
// el POS de Mini unidas se tildó y registró dos tickets duplicados que no había
// forma de anular. La venta interna sigue sin poder anularse desde Ventas: ver
// `veredictoAnulacionVentaComun`.
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
  estadoTurnoCorreccion,
  mensajeBloqueoTurno,
} from "@/lib/pos-ventas/correccionCompletaServer";
import { reconstruirConsumoOriginal } from "@/lib/pos-ventas/motorCorreccion";
import { declararOrigenDeStock, ORIGEN_STOCK } from "@/lib/stock/libro/libroStock";

/** Códigos estables de la anulación de una venta común. Se ramifica sobre ellos. */
export const CODIGOS_ANULAR = {
  OK: "ANULAR_OK",
  VENTA_AUSENTE: "VENTA_AUSENTE",
  YA_ANULADA: "VENTA_YA_ANULADA",
  CON_REMITO: "VENTA_CON_REMITO",
  CONSUMO_NO_CONGELADO: "CONSUMO_NO_CONGELADO",
  MOTIVO_AUSENTE: "MOTIVO_AUSENTE",
};

/**
 * ¿Se puede anular esta venta desde su detalle? Lo leen IGUAL el detalle —para
 * decidir si dibuja el botón— y la ruta de anular —para decidir si lo hace—. Si
 * cada uno lo dedujera por su lado, el botón ofrecería algo que la ruta rechaza.
 *
 * Tres condiciones, y cada una tiene su porqué:
 *
 * · SIN REMITO. Una venta interna se anula cancelando su remito desde
 *   Transferencias (decisión del 2026-08-20, que sigue en pie). Desde acá se
 *   devolvería el stock sin liberar el tránsito.
 *
 * · CON SU TURNO ABIERTO. Es la regla de la corrección completa, y por la misma
 *   razón: el arqueo lee las ventas del turno, así que anular una venta de un
 *   turno cerrado le cambiaría el esperado a un arqueo ya contado y firmado. Se
 *   usa `estadoTurnoCorreccion`, la misma función del botón "Corregir venta".
 *
 * · CON EL CONSUMO CONGELADO. El motor devuelve lo que dicen `cantidadStock` y los
 *   componentes. Una línea vieja sin ese dato tendría que reconstruirse, y el motor
 *   la saltearía en silencio: la mercadería no volvería. Se pregunta con
 *   `reconstruirConsumoOriginal`, que es lo que usa la corrección completa para
 *   revertir, así que lo que se acepta acá es exactamente lo que ella revierte
 *   sin inferir nada.
 *
 * El motivo no entra acá: el botón se ofrece antes de que alguien lo escriba. Lo
 * valida `validarMotivoAnulacion`.
 *
 * @param {object|null} venta { id, anuladaEn, turnoId, turno, transferencia, detalles }
 * @returns {{ puede: true, codigo, turnoId } | { puede: false, codigo, error }}
 */
export function veredictoAnulacionVentaComun(venta) {
  const no = (codigo, error) => ({ puede: false, codigo, error });

  if (!venta || !Number.isInteger(Number(venta.id)) || Number(venta.id) <= 0) {
    return no(CODIGOS_ANULAR.VENTA_AUSENTE, "No se encontró la venta.");
  }
  if (venta.anuladaEn != null) {
    return no(
      CODIGOS_ANULAR.YA_ANULADA,
      "Esta venta ya está anulada. Anularla de nuevo devolvería el stock dos veces."
    );
  }
  if (venta.transferencia) {
    return no(
      CODIGOS_ANULAR.CON_REMITO,
      `Esta venta generó el remito #${venta.transferencia.id}. Se anula cancelando el remito desde Transferencias.`
    );
  }

  const turno = estadoTurnoCorreccion(venta);
  if (!turno.turnoAbierto) {
    // El código es el mismo de la corrección completa, a propósito: es el mismo
    // bloqueo, y el texto también.
    return no(
      turno.motivoBloqueo,
      mensajeBloqueoTurno(turno.motivoBloqueo) ?? "El turno de esta venta no se puede verificar."
    );
  }

  const sinCongelar = (venta.detalles || []).find((d) => {
    const r = reconstruirConsumoOriginal(d);
    return r.ambigua || !["SERVICIO", "COMBO", "CONGELADO"].includes(r.reconstruccion);
  });
  if (sinCongelar) {
    return no(
      CODIGOS_ANULAR.CONSUMO_NO_CONGELADO,
      `La línea "${sinCongelar.nombre}" no guardó cuánto stock descontó, así que anular no sabría cuánto devolver. ` +
        "Usá Corregir venta."
    );
  }

  return { puede: true, codigo: CODIGOS_ANULAR.OK, turnoId: venta.turnoId };
}

/** El motivo es obligatorio y no puede quedar vacío; no hay mínimo inventado. */
export function validarMotivoAnulacion(motivo) {
  const texto = typeof motivo === "string" ? motivo.trim() : "";
  if (!texto) {
    return {
      ok: false,
      codigo: CODIGOS_ANULAR.MOTIVO_AUSENTE,
      error: "Escribí por qué se anula. Una venta anulada sin motivo es indistinguible dentro de un mes de un error de datos.",
    };
  }
  return { ok: true, motivo: texto };
}

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
  const delta = deltaDeDevolucion(venta.detalles);

  // ── EL ORDEN: MARCA, RASTRO, Y RECIÉN DESPUÉS EL STOCK ──────────────────────
  //
  // El Libro de Stock anota la devolución con el documento que la explica, que
  // es el registro de esta anulación: tiene que existir antes de tocar el stock.
  // Antes el stock iba primero. Nada del registro depende de la escritura de
  // stock —el delta se calcula de las líneas—, y todo sigue en la transacción
  // del llamador. Marcar primero además hace que una segunda anulación
  // concurrente se detenga en el bloqueo optimista antes de tocar el stock.

  // ── 1 · Marcar la venta ────────────────────────────────────────────────────
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

  // ── 2 · El rastro ──────────────────────────────────────────────────────────
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

  // ── 3 · El stock de la venta, a nombre de la anulación ─────────────────────
  //
  // Se declara acá aunque el llamador haya declarado otro origen antes: la
  // cancelación de una transferencia de venta interna libera el tránsito como
  // TRANSFERENCIA_CANCELACION y después llama a esto en la misma transacción.
  await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.ANULACION_VENTA, referencia: String(correccion.id) });
  await aplicarDeltaStock(tx, venta.localId, delta);

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
