// app/api/pos-ventas/venta/[id]/corregir/route.js
//
// POST — APLICA la corrección COMPLETA de una venta (Fase B). RECALCULA todo en
// el backend (no confía en revisar) y ejecuta TODO en UNA transacción con:
//   · advisory lock por venta (pg_advisory_xact_lock)
//   · lock de stock (FOR UPDATE) en orden estable
//   · reversión + reaplicación de stock (delta neto)
//   · reemplazo de VentaDetalle / VentaDetalleComponente / VentaPago
//   · ajuste de cuenta corriente y puntos con movimientos COMPENSATORIOS
//   · VentaCorreccion (COMPLETA, antes/después) + bitácora compacta
// Regla central: SOLO con turno ORIGINAL abierto. Rollback total ante cualquier error.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getConfigLocalEfectiva } from "@/lib/config/local";
import { validarMotivo, estadoVentanaCorreccion, esVentaFiada } from "@/lib/pos-ventas/correccion";
import { evaluarCorreccion } from "@/lib/pos-ventas/motorCorreccion";
import { planConsumoVenta } from "@/lib/combos/planConsumoVenta";
import { normalizarYConsolidarPagos, aplicarComisiones, derivarCamposVenta, round2 } from "@/lib/pos-ventas/pagos";
import { enBetaCorreccionCompleta, COD_FLAG_OFF, MSG_FLAG_OFF } from "@/lib/pos-ventas/correccionBeta";
import {
  cargarVentaOriginal, estadoTurnoCorreccion, detallesParaMotor, resolverLineasCorregidas,
  lockStockActual, aplicarDeltaStock, ajustarCuentaCorriente, ajustarPuntosCorreccion,
  subtotalElegiblePuntos, cargarMapsProductos, COD_TURNO_CERRADO, MSG_TURNO_CERRADO,
} from "@/lib/pos-ventas/correccionCompletaServer";

const j = (b, s = 200) => NextResponse.json(b, { status: s });

function snapshotVenta(venta, { detalles, pagos, cliente, total }) {
  return {
    ventaId: venta.id, numero: venta.numero, clienteId: cliente ?? null, total: String(total),
    detalles: detalles.map((d) => ({ productoBaseId: d.productoBaseId, nombre: d.nombre, cantidad: Number(d.cantidad), precio: Number(d.precio), subtotal: Number(d.subtotal ?? Number(d.precio) * Number(d.cantidad)) })),
    pagos: pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto) })),
  };
}

export async function POST(req, { params }) {
  let ventaIdForCatch = null;
  let idemForCatch = null;
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);
    const perm = checkPerm(session, "ventas.corregir_completa");
    if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);
    if (!enBetaCorreccionCompleta(session)) return j({ ok: false, error: MSG_FLAG_OFF, code: COD_FLAG_OFF }, 403);

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || Number.isNaN(ventaId)) return j({ ok: false, error: "ID de venta inválido" }, 400);
    ventaIdForCatch = ventaId;

    let body = {};
    try { body = await req.json(); } catch { return j({ ok: false, error: "Cuerpo inválido" }, 400); }

    const vm = validarMotivo(body.motivo);
    if (!vm.ok) return j({ ok: false, error: vm.error, code: vm.code }, 400);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    idemForCatch = idempotencyKey;
    if (!idempotencyKey) return j({ ok: false, error: "Falta idempotencyKey.", code: "idempotency_requerida" }, 400);
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return j({ ok: false, error: "Falta la versión de la venta.", code: "version_requerida" }, 400);

    // Scope + idempotencia (fast-path fuera de tx).
    const ventaPre = await cargarVentaOriginal(prisma, ventaId);
    if (!ventaPre) return j({ ok: false, error: "Venta no encontrada" }, 404);
    if (!session.esAdmin && ventaPre.localId !== Number(session.localId)) return j({ ok: false, error: "Venta no encontrada" }, 404);

    const previa = await prisma.ventaCorreccion.findUnique({ where: { ventaId_idempotencyKey: { ventaId, idempotencyKey } } }).catch(() => null);
    if (previa) return j({ ok: true, yaAplicada: true, correccionId: previa.id, version: previa.versionDespues, diferencia: Number(previa.diferencia) });

    const localId = ventaPre.localId;
    const esDeposito = ventaPre.local?.es_deposito === true;
    const grupoId = await getGrupoIdDeLocal(localId);
    const { allowNegativeStock } = await getConfigLocalEfectiva(localId, grupoId, { esDeposito });

    const lineasEditor = Array.isArray(body.lineas) ? body.lineas : [];
    if (!lineasEditor.length) return j({ ok: false, error: "La venta corregida no tiene líneas.", code: "sin_lineas" }, 400);
    const clienteDespues = body.cliente && body.cliente.id != null ? Number(body.cliente.id) : (body.clienteId != null ? Number(body.clienteId) : null);
    const descuento = round2(Number(body.descuento || 0));

    const resultado = await prisma.$transaction(async (tx) => {
      // Advisory lock por venta (se libera al terminar la tx).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ventaId})`;

      const venta = await cargarVentaOriginal(tx, ventaId);
      const turno = estadoTurnoCorreccion(venta);
      if (!turno.turnoAbierto) { const e = new Error(turno.motivoBloqueo === COD_TURNO_CERRADO ? MSG_TURNO_CERRADO : "El turno original no puede verificarse."); e.status = 409; e.code = turno.motivoBloqueo; throw e; }
      if ((venta.version ?? 0) !== expectedVersion) { const e = new Error("La venta cambió desde que la abriste."); e.status = 409; e.code = "conflicto_version"; throw e; }
      const ventana = estadoVentanaCorreccion(venta);
      if (ventana.fueraDeVentana) { const e = new Error(`Fuera de la ventana de corrección (${ventana.diasTranscurridos} días).`); e.status = 409; e.code = "fuera_de_ventana"; throw e; }

      // Resolver líneas + plan de consumo (server-authoritative).
      const lineasCorregidas = await resolverLineasCorregidas(tx, { localId, esDeposito, lineasEditor });
      const { lineasComerciales } = planConsumoVenta({ lineas: lineasCorregidas, esDeposito });
      const { infoMap } = await cargarMapsProductos(tx, lineasCorregidas.map((l) => l.productoBaseId));

      const detMotor = detallesParaMotor(venta);

      // Lock de stock de todos los productoLocalId involucrados (originales + nuevos).
      const pls = new Set();
      for (const d of detMotor) { if (d.productoLocalId != null) pls.add(d.productoLocalId); for (const c of d.componentes) if (c.productoLocalId != null) pls.add(c.productoLocalId); }
      for (const l of lineasCorregidas) { if (l.tipo === "NORMAL") pls.add(l.productoLocalId); if (l.tipo === "COMBO") for (const c of l.componentes) pls.add(c.productoLocalId); }
      const stockActual = await lockStockActual(tx, localId, [...pls]);

      // Totales + pagos server-authoritative.
      const subtotalNuevo = round2(lineasComerciales.reduce((a, l) => a + Number(l.subtotal), 0));
      const totalNuevo = round2(subtotalNuevo - descuento);
      const consol = normalizarYConsolidarPagos(body.pagos, totalNuevo);
      if (consol.error) { const e = new Error(consol.error); e.status = 400; e.code = "pagos_invalidos"; throw e; }

      let comisionPctPorMedio = {};
      if (consol.pagos.some((p) => ["MERCADOPAGO", "DEBITO", "CREDITO"].includes(p.medio))) {
        const comCfg = await tx.configuracionGrupo.findUnique({ where: { grupoId }, select: { comisionDebito: true, comisionCredito: true, comisionMercadopago: true } });
        comisionPctPorMedio = { DEBITO: Number(comCfg?.comisionDebito ?? 7), CREDITO: Number(comCfg?.comisionCredito ?? 7), MERCADOPAGO: Number(comCfg?.comisionMercadopago ?? 7) };
      }
      const pagosConComision = aplicarComisiones(consol.pagos, comisionPctPorMedio);
      const derivado = derivarCamposVenta(pagosConComision);
      const esFiadoDespues = derivado.esFiado;
      if (esFiadoDespues && !clienteDespues) { const e = new Error("Una venta fiada requiere cliente."); e.status = 400; e.code = "fiado_sin_cliente"; throw e; }

      // Motor: valida stock (bajo lock), legacy y calcula el delta neto.
      const evalr = evaluarCorreccion({
        original: { detalles: detMotor, pagos: venta.pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto) })), clienteId: venta.clienteId ?? null, total: Number(venta.total), esFiado: esVentaFiada(venta) },
        corregido: { lineas: lineasCorregidas, pagos: consol.pagos, clienteId: clienteDespues, descuento },
        esDeposito, stockActual, allowNegative: allowNegativeStock === true,
      });
      if (evalr.bloqueos.length) { const e = new Error("Hay líneas cuyo consumo original no se puede reconstruir."); e.status = 409; e.code = "bloqueo_legacy"; e.bloqueos = evalr.bloqueos; throw e; }
      if (evalr.stockInsuficiente.length) { const e = new Error("Stock insuficiente para aplicar la corrección."); e.status = 409; e.code = "stock_insuficiente"; e.stock = evalr.stockInsuficiente; throw e; }
      if (evalr.sinCambios) { const e = new Error("No hay cambios para aplicar."); e.status = 400; e.code = "sin_cambios"; throw e; }

      // Costos / ganancias.
      const costoTotal = round2(lineasComerciales.reduce((a, l) => a + Number(l.costoLinea), 0));
      const comisionBancaria = derivado.comisionBancaria;
      const gananciaBruta = round2(subtotalNuevo - costoTotal);
      const gananciaNeta = round2(gananciaBruta - comisionBancaria);

      // VentaCorreccion (fuente) — se crea primero para tener correccionId en los movimientos.
      const snapAntes = snapshotVenta(venta, { detalles: venta.detalles, pagos: venta.pagos, cliente: venta.clienteId, total: Number(venta.total) });
      const snapDespues = snapshotVenta(venta, { detalles: lineasComerciales.map((l) => ({ productoBaseId: l.productoBaseId, nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, subtotal: l.subtotal })), pagos: consol.pagos, cliente: clienteDespues, total: totalNuevo });
      const totalAnterior = round2(Number(venta.total));
      const diferencia = round2(totalNuevo - totalAnterior);

      const correccion = await tx.ventaCorreccion.create({
        data: {
          ventaId, tipo: "COMPLETA", motivo: vm.motivo, idempotencyKey,
          usuarioId: session.id ?? null, operadorId: venta.operadorId ?? null, localId, grupoId: grupoId ?? null,
          turnoIdOriginal: turno.turnoId, turnoIdCorreccion: turno.turnoId, turnoCerrado: false,
          versionAntes: expectedVersion, versionDespues: expectedVersion + 1,
          totalAnterior, totalNuevo, diferencia,
          snapshotAntes: snapAntes, snapshotDespues: snapDespues,
          diffProductos: evalr.diffProductos, diffPagos: evalr.diffPagos, impactoStock: evalr.deltaStock, impactoCaja: null,
        },
      });
      const correccionId = correccion.id;

      // Aplicar delta de stock (una escritura por productoLocalId).
      await aplicarDeltaStock(tx, localId, evalr.deltaStock);

      // Reemplazar líneas y pagos.
      await tx.ventaDetalle.deleteMany({ where: { ventaId } }); // cascade: VentaDetalleComponente
      await tx.ventaPago.deleteMany({ where: { ventaId } });

      for (const l of lineasComerciales) {
        const esCombo = l.tipo === "COMBO"; const esServicio = l.tipo === "SERVICIO";
        const share = totalNuevo > 0 ? Number(l.subtotal) / totalNuevo : 0;
        const comisionLinea = esServicio ? 0 : round2(comisionBancaria * share);
        const svc = esServicio ? l.servicio : null;
        const detalle = await tx.ventaDetalle.create({
          data: {
            ventaId, productoBaseId: l.productoBaseId, nombre: l.nombre, precio: l.precio, precioCosto: l.costoUnitario,
            cantidad: l.cantidad, subtotal: l.subtotal, ganancia: round2(Number(l.subtotal) - Number(l.costoLinea)),
            comisionLinea: comisionLinea > 0 ? comisionLinea : null,
            esServicio, importeBaseServicio: svc ? svc.importeBaseServicio : null, recargoServicioPct: svc ? svc.recargoServicioPct : null, recargoServicioImporte: svc ? svc.recargoServicioImporte : null,
            productoLocalId: l.consumoFisico?.productoLocalId ?? null, cantidadStock: l.consumoFisico?.cantidadStock ?? null,
          },
        });
        if (esCombo && l.componentesCongelables?.length) {
          await tx.ventaDetalleComponente.createMany({ data: l.componentesCongelables.map((c) => ({ ventaDetalleId: detalle.id, productoBaseId: c.productoBaseId, productoLocalId: c.productoLocalId, cantidad: c.cantidad, precioCosto: c.costoUnitario })) });
        }
      }
      await tx.ventaPago.createMany({ data: pagosConComision.map((t) => ({ ventaId, medio: t.medio, monto: t.monto, comisionPct: t.comisionPct, comision: t.comision, neto: t.neto })) });

      // Header.
      await tx.venta.update({
        where: { id: ventaId },
        data: {
          clienteId: clienteDespues, subtotal: subtotalNuevo, descuento, total: totalNuevo,
          comisionBancaria, comisionPct: derivado.comisionPct, netoRecibido: derivado.netoRecibido,
          costoTotal, gananciaBruta, gananciaNeta, formaPago: derivado.formaPago, esFiado: esFiadoDespues,
          version: { increment: 1 }, corregida: true, ultimaCorreccionId: correccionId,
        },
      });

      // Cuenta corriente (compensatorios).
      const ccMovs = await ajustarCuentaCorriente(tx, {
        correccionId, grupoId, localId, ventaId, numero: venta.numero, userId: session.id,
        esFiadoAntes: esVentaFiada(venta), esFiadoDespues, clienteAntes: venta.clienteId ?? null, clienteDespues,
        totalAnterior, totalNuevo,
      });

      // Puntos (fail-closed en saldo negativo).
      let puntosMovs = [];
      const puntosConfig = await tx.puntosConfigLocal.findFirst({ where: { localId, activo: true } });
      if (puntosConfig) {
        const puntosPorPeso = puntosConfig.reglasJson?.puntosPorPeso || 0;
        const exclus = puntosConfig.exclusionesJson || {};
        const acredOrig = await tx.clientePuntoMovimiento.findFirst({ where: { ventaId, tipo: "ACREDITACION", correccionId: 0 } });
        const puntosOriginal = acredOrig ? Number(acredOrig.puntos) : 0;
        const puntosNuevo = Math.floor(subtotalElegiblePuntos(lineasComerciales, infoMap, exclus) * puntosPorPeso);
        puntosMovs = await ajustarPuntosCorreccion(tx, { correccionId, grupoId, localId, ventaId, numero: venta.numero, userId: session.id, clienteAntes: venta.clienteId ?? null, clienteDespues, puntosOriginal, puntosNuevo });
      }

      await tx.ventaCorreccion.update({ where: { id: correccionId }, data: { impactoCaja: { cuentaCorriente: ccMovs, puntos: puntosMovs, diferencia } } });

      // Bitácora compacta.
      await tx.auditoriaBitacora.create({
        data: {
          usuarioId: session.id ?? null, operadorId: venta.operadorId ?? null, localId, grupoId: grupoId ?? null,
          accion: "venta.corregir_completa", entidad: "Venta", entidadId: String(ventaId), entidadNombre: `Ticket #${venta.numero}`,
          cambios: [{ entidad: "Venta", nombre: `Ticket #${venta.numero}`, id: String(ventaId), motivo: vm.motivo, campos: [
            { campo: "total", label: "Total", antes: totalAnterior, despues: totalNuevo },
            { campo: "lineas", label: "Líneas", antes: `${evalr.clasificacion.preservadas + evalr.clasificacion.modificadas + evalr.clasificacion.eliminadas}`, despues: `${evalr.clasificacion.preservadas + evalr.clasificacion.modificadas + evalr.clasificacion.agregadas}` },
          ] }],
        },
      });

      return { correccionId, version: expectedVersion + 1, totalNuevo, diferencia, impactoStock: evalr.deltaStock, cuentaCorriente: ccMovs, puntos: puntosMovs };
    }, { timeout: 20000 });

    return j({ ok: true, ...resultado });
  } catch (error) {
    // Idempotencia concurrente: unique de (ventaId, idempotencyKey).
    if (error?.code === "P2002" && ventaIdForCatch && idemForCatch) {
      const previa = await prisma.ventaCorreccion.findUnique({ where: { ventaId_idempotencyKey: { ventaId: ventaIdForCatch, idempotencyKey: idemForCatch } } }).catch(() => null);
      if (previa) return j({ ok: true, yaAplicada: true, correccionId: previa.id, version: previa.versionDespues });
      return j({ ok: false, error: "Conflicto de idempotencia." }, 409);
    }
    if (error?.status) return j({ ok: false, error: error.message, code: error.code, bloqueos: error.bloqueos, stock: error.stock }, error.status);
    console.error("Error en venta/corregir:", error);
    return j({ ok: false, error: "Error interno" }, 500);
  }
}
