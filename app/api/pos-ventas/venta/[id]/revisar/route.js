// app/api/pos-ventas/venta/[id]/revisar/route.js
//
// POST — REVISAR una corrección completa. NO ESCRIBE NADA. Recalcula todo en el
// backend (nunca confía en el cliente) y devuelve el diff completo: líneas
// agregadas/eliminadas/modificadas, impacto de stock, totales, diferencia,
// pagos, cliente, impacto en cuenta corriente y advertencias + puedeConfirmar.
//
// Bloquea (fail-closed) si el turno ORIGINAL no está abierto.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getConfigLocalEfectiva } from "@/lib/config/local";
import { estadoVentanaCorreccion, esVentaFiada } from "@/lib/pos-ventas/correccion";
import { evaluarCorreccion } from "@/lib/pos-ventas/motorCorreccion";
import { enBetaCorreccionCompleta, COD_FLAG_OFF, MSG_FLAG_OFF } from "@/lib/pos-ventas/correccionBeta";
import {
  cargarVentaOriginal, estadoTurnoCorreccion, detallesParaMotor,
  resolverLineasCorregidas, leerStockActual, COD_TURNO_CERRADO, MSG_TURNO_CERRADO,
} from "@/lib/pos-ventas/correccionCompletaServer";
import { normalizarMedio } from "@/lib/pos-ventas/pagos";

const j = (b, s = 200) => NextResponse.json(b, { status: s });

// Preview (no autoritativo) del impacto en cuenta corriente por la corrección.
function previewCuentaCorriente({ esFiadoAntes, esFiadoDespues, clienteAntes, clienteDespues, totalAnterior, totalNuevo }) {
  const cambiaCliente = (clienteAntes ?? null) !== (clienteDespues ?? null);
  if (!esFiadoAntes && !esFiadoDespues) return { aplica: false, tipo: "sin_cc" };
  if (esFiadoAntes && !esFiadoDespues) return { aplica: true, tipo: "fiada_a_cobrada", compensa: { clienteId: clienteAntes, credito: totalAnterior } };
  if (!esFiadoAntes && esFiadoDespues) return { aplica: true, tipo: "cobrada_a_fiada", debito: { clienteId: clienteDespues, monto: totalNuevo } };
  // fiada → fiada
  if (cambiaCliente) {
    return { aplica: true, tipo: "cambio_cliente_fiado", compensa: { clienteId: clienteAntes, credito: totalAnterior }, debito: { clienteId: clienteDespues, monto: totalNuevo } };
  }
  return { aplica: true, tipo: "ajuste_total_fiado", clienteId: clienteAntes, deltaDeuda: Number((totalNuevo - totalAnterior).toFixed(2)) };
}

export async function POST(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);

    const perm = checkPerm(session, "ventas.corregir_completa");
    if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);
    if (!enBetaCorreccionCompleta(session)) return j({ ok: false, error: MSG_FLAG_OFF, code: COD_FLAG_OFF }, 403);

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || Number.isNaN(ventaId)) return j({ ok: false, error: "ID de venta inválido" }, 400);

    let body = {};
    try { body = await req.json(); } catch { return j({ ok: false, error: "Cuerpo inválido" }, 400); }

    const venta = await cargarVentaOriginal(prisma, ventaId);
    if (!venta) return j({ ok: false, error: "Venta no encontrada" }, 404);
    if (!session.esAdmin && venta.localId !== Number(session.localId)) {
      return j({ ok: false, error: "Venta no encontrada" }, 404);
    }

    // REGLA CENTRAL: turno original abierto (fail-closed).
    const turno = estadoTurnoCorreccion(venta);
    if (!turno.turnoAbierto) {
      const esCerrado = turno.motivoBloqueo === COD_TURNO_CERRADO;
      return j({ ok: false, code: turno.motivoBloqueo, error: esCerrado ? MSG_TURNO_CERRADO : "El turno original no puede verificarse: la corrección completa está bloqueada." }, 409);
    }

    // Bloqueo optimista.
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== (venta.version ?? 0)) {
      return j({ ok: false, code: "conflicto_version", error: "La venta cambió desde que la abriste. Recargá y volvé a intentar." }, 409);
    }

    // Ventana de 30 días.
    const ventana = estadoVentanaCorreccion(venta);
    if (ventana.fueraDeVentana) {
      return j({ ok: false, code: "fuera_de_ventana", error: `Fuera de la ventana de corrección (${ventana.diasTranscurridos} días).` }, 409);
    }

    const lineasEditor = Array.isArray(body.lineas) ? body.lineas : [];
    if (!lineasEditor.length) return j({ ok: false, code: "sin_lineas", error: "La venta corregida no tiene líneas." }, 400);

    const esDeposito = venta.local?.es_deposito === true;
    const grupoId = await getGrupoIdDeLocal(venta.localId);
    const { allowNegativeStock } = await getConfigLocalEfectiva(venta.localId, grupoId, { esDeposito });

    // Resolver líneas corregidas server-authoritative.
    let lineasCorregidas;
    try {
      lineasCorregidas = await resolverLineasCorregidas(prisma, { localId: venta.localId, esDeposito, lineasEditor });
    } catch (e) {
      return j({ ok: false, code: e.code || "linea_invalida", error: e.message || "Línea inválida." }, e.status || 400);
    }

    // Stock actual de todos los productoLocalId involucrados (originales + nuevos).
    const detMotor = detallesParaMotor(venta);
    const plsInvolucrados = new Set();
    for (const d of detMotor) {
      if (d.productoLocalId != null) plsInvolucrados.add(d.productoLocalId);
      for (const c of d.componentes) if (c.productoLocalId != null) plsInvolucrados.add(c.productoLocalId);
    }
    for (const l of lineasCorregidas) {
      if (l.tipo === "NORMAL") plsInvolucrados.add(l.productoLocalId);
      if (l.tipo === "COMBO") for (const c of l.componentes) plsInvolucrados.add(c.productoLocalId);
    }
    const stockActual = await leerStockActual(prisma, venta.localId, [...plsInvolucrados]);

    // Cliente corregido.
    const clienteDespues = body.cliente && body.cliente.id != null ? Number(body.cliente.id) : (body.clienteId != null ? Number(body.clienteId) : null);

    // Pagos corregidos (normalizados).
    const pagosCorr = (Array.isArray(body.pagos) ? body.pagos : []).map((p) => ({ medio: normalizarMedio(p.medio) || p.medio, monto: Number(p.monto) }));

    const evalr = evaluarCorreccion({
      original: { detalles: detMotor, pagos: venta.pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto) })), clienteId: venta.clienteId ?? null, total: Number(venta.total), esFiado: esVentaFiada(venta) },
      corregido: { lineas: lineasCorregidas, pagos: pagosCorr, clienteId: clienteDespues, descuento: Number(body.descuento || 0) },
      esDeposito, stockActual, allowNegative: allowNegativeStock === true,
    });

    // Preview de cuenta corriente + puntos.
    const esFiadoDespues = pagosCorr.some((p) => String(p.medio).toUpperCase() === "FIADO");
    const cc = previewCuentaCorriente({
      esFiadoAntes: esVentaFiada(venta), esFiadoDespues,
      clienteAntes: venta.clienteId ?? null, clienteDespues,
      totalAnterior: evalr.totales.totalAnterior, totalNuevo: evalr.totales.totalNuevo,
    });
    // Si pasa a FIADO, exige cliente (no se puede fiar a consumidor final).
    const advertencias = [...evalr.advertencias];
    if (esFiadoDespues && clienteDespues == null) advertencias.push({ tipo: "fiado_sin_cliente", detalle: "Una venta fiada requiere cliente." });

    const puedeConfirmar = evalr.puedeConfirmar && !(esFiadoDespues && clienteDespues == null);

    return j({
      ok: true,
      turno: { turnoIdOriginal: turno.turnoId, turnoAbierto: true },
      version: expectedVersion,
      diff: {
        productos: evalr.diffProductos,
        clasificacion: evalr.clasificacion,
        pagos: evalr.diffPagos,
        cambioCliente: evalr.cambioCliente,
      },
      impactoStock: evalr.deltaStock,
      stockInsuficiente: evalr.stockInsuficiente,
      bloqueosLegacy: evalr.bloqueos,
      totales: evalr.totales,
      pagos: { anteriores: venta.pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto) })), nuevos: pagosCorr, cuadran: evalr.pagos.cuadran },
      cuentaCorriente: cc,
      puntos: { nota: "El impacto de puntos se calcula y aplica en la confirmación (corregir)." },
      advertencias,
      sinCambios: evalr.sinCambios,
      puedeConfirmar,
    });
  } catch (error) {
    console.error("Error en venta/revisar:", error);
    return j({ ok: false, error: "Error interno" }, 500);
  }
}
