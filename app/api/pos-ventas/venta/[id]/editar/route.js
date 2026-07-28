// app/api/pos-ventas/venta/[id]/editar/route.js
//
// GET — Snapshot EDITABLE de una venta para la corrección COMPLETA (Fase B).
// Solo lectura. Devuelve las líneas originales con su consumo congelado, la
// config de producto para reconstruir el editor, flags legacy por línea y —lo
// central— si el turno ORIGINAL sigue abierto (única condición que habilita la
// corrección completa). Fail-closed: sin turno / no verificable → bloqueado.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { estadoVentanaCorreccion, esVentaFiada } from "@/lib/pos-ventas/correccion";
import { reconstruirConsumoOriginal } from "@/lib/pos-ventas/motorCorreccion";
import { enBetaCorreccionCompleta, COD_FLAG_OFF, MSG_FLAG_OFF } from "@/lib/pos-ventas/correccionBeta";
import {
  cargarVentaOriginal, estadoTurnoCorreccion, detallesParaMotor,
  cargarMapsProductos, enriquecerReconstruccion, estadoReconstruccionUI,
  COD_TURNO_CERRADO, MSG_TURNO_CERRADO,
} from "@/lib/pos-ventas/correccionCompletaServer";

const j = (b, s = 200) => NextResponse.json(b, { status: s });

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);

    const perm = checkPerm(session, "ventas.corregir_completa");
    if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);
    // Feature flag (beta): además del permiso, el usuario debe estar habilitado.
    if (!enBetaCorreccionCompleta(session)) return j({ ok: false, error: MSG_FLAG_OFF, code: COD_FLAG_OFF }, 403);

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || Number.isNaN(ventaId)) return j({ ok: false, error: "ID de venta inválido" }, 400);

    const venta = await cargarVentaOriginal(prisma, ventaId);
    if (!venta) return j({ ok: false, error: "Venta no encontrada" }, 404);
    if (!session.esAdmin && venta.localId !== Number(session.localId)) {
      return j({ ok: false, error: "Venta no encontrada" }, 404);
    }

    const turno = estadoTurnoCorreccion(venta);
    const ventana = estadoVentanaCorreccion(venta);
    const detMotor = detallesParaMotor(venta);
    // Enriquecer líneas legacy con el contexto de reconstrucción (determinístico o ambiguo).
    await enriquecerReconstruccion(prisma, venta, detMotor);

    // Config de producto por línea (para reconstruir baseStock/modalidad en el editor).
    const { infoMap, baseStockMap } = await cargarMapsProductos(prisma, detMotor.map((d) => d.productoBaseId));

    // Motivo de bloqueo (prioridad: turno cerrado > sin turno > fuera de ventana).
    let motivoBloqueo = null;
    if (!turno.turnoAbierto) motivoBloqueo = turno.motivoBloqueo || COD_TURNO_CERRADO;
    else if (ventana.fueraDeVentana) motivoBloqueo = "fuera_de_ventana";

    const puedeCorregirCompleta = turno.turnoAbierto && ventana.dentroDeVentana;

    const lineas = venta.detalles.map((d) => {
      const dm = detMotor.find((x) => x.id === d.id);
      const rec = reconstruirConsumoOriginal(dm);
      const info = infoMap[d.productoBaseId] || {};
      const esCombo = (d.componentes || []).length > 0 || info.es_combo === true;
      return {
        detalleId: d.id,
        productoBaseId: d.productoBaseId,
        productoLocalId: d.productoLocalId ?? null,
        nombre: d.nombre,
        cantidad: Number(d.cantidad),
        precio: Number(d.precio),          // precio HISTÓRICO
        precioCosto: Number(d.precioCosto), // costo HISTÓRICO
        subtotal: Number(d.subtotal),
        // Tipo/naturaleza de la línea:
        esServicio: d.esServicio === true,
        esCombo,
        esFiambrePieza: info.modoVentaDeposito === "PIEZA" && Number(info.pesoReferenciaKg) > 0,
        unidad: info.unidad_medida || null,
        // modoVentaLinea NO se persistió en legacy → null (no se infiere).
        modoVentaLinea: null,
        baseStock: baseStockMap[d.productoBaseId] || null,
        // Consumo físico congelado + servicio (snapshot histórico):
        cantidadStock: d.cantidadStock != null ? Number(d.cantidadStock) : null,
        importeBaseServicio: d.importeBaseServicio != null ? Number(d.importeBaseServicio) : null,
        recargoServicioPct: d.recargoServicioPct != null ? Number(d.recargoServicioPct) : null,
        componentes: (d.componentes || []).map((c) => ({
          productoBaseId: c.productoBaseId, productoLocalId: c.productoLocalId ?? null, cantidad: Number(c.cantidad),
        })),
        // Estado de reconstrucción del consumo histórico:
        //   congelado (venta nueva) | reconstruido (auto, determinístico) | ambiguo (requiere confirmación).
        reconstruccion: estadoReconstruccionUI(rec),
        // Compat: bandera para líneas realmente ambiguas (bloquean si se tocan sin confirmar).
        legacyAmbiguo: rec.ambigua === true,
        legacyMotivo: rec.ambigua ? rec.motivo : null,
      };
    });

    return j({
      ok: true,
      venta: {
        id: venta.id,
        numero: venta.numero,
        version: venta.version ?? 0,
        corregida: !!venta.corregida,
        local: venta.local ? { id: venta.local.id, nombre: venta.local.nombre, esDeposito: venta.local.es_deposito === true } : null,
        cliente: venta.cliente ? { id: venta.cliente.id, nombre: venta.cliente.nombre } : null,
        estado: esVentaFiada(venta) ? "fiado" : "cobrado",
        esFiado: esVentaFiada(venta),
        observaciones: venta.observaciones ?? null,
        referenciaInterna: venta.referenciaInterna ?? null,
        total: Number(venta.total),
        descuento: Number(venta.descuento || 0),
        fecha: venta.fecha,
        antiguedadDias: Number.isFinite(ventana.diasTranscurridos) ? ventana.diasTranscurridos : null,
        pagos: venta.pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto), comisionPct: p.comisionPct != null ? Number(p.comisionPct) : null })),
        lineas,
      },
      turno: { turnoIdOriginal: turno.turnoId, turnoAbierto: turno.turnoAbierto },
      correccion: {
        puedeCorregirCompleta,
        motivoBloqueo,
        mensajeBloqueo: motivoBloqueo === COD_TURNO_CERRADO ? MSG_TURNO_CERRADO : null,
        dentroDeVentana: ventana.dentroDeVentana,
        hayLineasLegacyAmbiguas: lineas.some((l) => l.legacyAmbiguo),
      },
      permisos: {
        corregirCompleta: session.esAdmin || checkPerm(session, "ventas.corregir_completa").ok,
        editarPrecioManual: session.esAdmin || checkPerm(session, "precios.editar_manual").ok,
      },
    });
  } catch (error) {
    console.error("Error en venta/editar:", error);
    return j({ ok: false, error: "Error interno" }, 500);
  }
}
