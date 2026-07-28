import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { lineasPagoTicket, esPagoDividido } from "@/lib/pos-ventas/pagos";
import { esVentaFiada, estadoVentanaCorreccion } from "@/lib/pos-ventas/correccion";
import { enBetaCorreccionCompleta } from "@/lib/pos-ventas/correccionBeta";

const num = (v) => (v == null ? 0 : Number(v));

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "reportes.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || isNaN(ventaId)) {
      return NextResponse.json(
        { ok: false, error: "ID de venta invalido" },
        { status: 400 }
      );
    }

    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      select: {
        id: true,
        numero: true,
        fecha: true,
        localId: true,
        subtotal: true,
        descuento: true,
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaBruta: true,
        gananciaNeta: true,
        formaPago: true,
        esFiado: true,
        // Corrección de ventas (flags/versionado + campos descriptivos).
        version: true,
        corregida: true,
        ultimaCorreccionId: true,
        observaciones: true,
        referenciaInterna: true,
        turnoId: true,
        turno: { select: { cierre: true } },
        cliente: { select: { id: true, nombre: true, documento: true, telefono: true, direccion: true } },
        vendedor: { select: { id: true, nombre: true } },
        local: { select: { id: true, nombre: true } },
        pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
        detalles: {
          select: {
            id: true,
            nombre: true,
            cantidad: true,
            precio: true,
            subtotal: true,
            precioCosto: true,
            ganancia: true,
            tipoPrecioAplicado: true,
            margenAplicado: true,
            // Snapshot de servicio de importe variable (para reimpresión fiel).
            esServicio: true,
            importeBaseServicio: true,
            recargoServicioPct: true,
            recargoServicioImporte: true,
          },
        },
      },
    });

    if (!venta) {
      return NextResponse.json(
        { ok: false, error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    // Scope de local: un no-admin solo ve ventas de su local. Lectura ajena → 404
    // (no revela la existencia de la venta).
    if (!session.esAdmin && venta.localId !== Number(session.localId)) {
      return NextResponse.json(
        { ok: false, error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    // Ver costos/rentabilidad: admin o costos.ver (acotado al local por el scope).
    const verCostos = !!session.esAdmin || checkPerm(session, "costos.ver").ok;

    const totales = {
      subtotal: num(venta.subtotal).toFixed(2),
      descuento: num(venta.descuento).toFixed(2),
      total: num(venta.total).toFixed(2),
      comisionBancaria: num(venta.comisionBancaria).toFixed(2),
      netoRecibido: num(venta.netoRecibido).toFixed(2),
    };
    if (verCostos) {
      totales.costoTotal = num(venta.costoTotal).toFixed(2);
      totales.gananciaBruta = num(venta.gananciaBruta).toFixed(2);
      totales.gananciaNeta = num(venta.gananciaNeta).toFixed(2);
    }

    const detalles = venta.detalles.map((d) => {
      const subtotalLinea = num(d.subtotal);
      const base = {
        id: d.id,
        nombre: d.nombre,
        cantidad: num(d.cantidad),
        precio: num(d.precio).toFixed(2),
        subtotal: subtotalLinea.toFixed(2),
        // Snapshot de servicio (para reimpresión). No expone costos.
        esServicio: !!d.esServicio,
        importeBaseServicio: d.importeBaseServicio != null ? num(d.importeBaseServicio).toFixed(2) : null,
        recargoServicioPct: d.recargoServicioPct != null ? num(d.recargoServicioPct) : null,
        recargoServicioImporte: d.recargoServicioImporte != null ? num(d.recargoServicioImporte).toFixed(2) : null,
      };
      if (verCostos) {
        const gananciaLinea = num(d.ganancia);
        const margen =
          subtotalLinea > 0 ? (gananciaLinea / subtotalLinea) * 100 : 0;
        base.precioCosto = num(d.precioCosto).toFixed(2);
        base.ganancia = gananciaLinea.toFixed(2);
        base.margen = margen.toFixed(1);
        base.tipoPrecioAplicado = d.tipoPrecioAplicado || null;
        base.margenAplicado =
          d.margenAplicado != null ? num(d.margenAplicado).toFixed(2) : null;
      }
      return base;
    });

    // --- Corrección de ventas: flags de habilitación y versionado ---
    const esFiado = esVentaFiada(venta);
    const ventana = estadoVentanaCorreccion(venta);
    const permiteSimple = !!session.esAdmin || checkPerm(session, "ventas.corregir_simple").ok;
    const permiteCompleta = !!session.esAdmin || checkPerm(session, "ventas.corregir_completa").ok;
    const permiteTurnoCerrado = !!session.esAdmin || checkPerm(session, "ventas.corregir_turno_cerrado").ok;

    // Corrección COMPLETA (Fase B): feature flag beta + permiso + turno ABIERTO.
    const enBeta = enBetaCorreccionCompleta(session);
    const turnoAbierto = !!venta.turnoId && venta.turno != null && venta.turno.cierre == null;
    let motivoCompleta = null;
    if (!permiteCompleta) motivoCompleta = "sin_permiso";
    else if (!enBeta) motivoCompleta = "flag_no_habilitado";
    else if (!venta.turnoId) motivoCompleta = "sin_turno_original";
    else if (!turnoAbierto) motivoCompleta = "turno_cerrado_no_corregible";
    else if (ventana.fueraDeVentana) motivoCompleta = "fuera_de_ventana";

    const correccion = {
      version: venta.version ?? 0,
      corregida: !!venta.corregida,
      observaciones: venta.observaciones ?? null,
      referenciaInterna: venta.referenciaInterna ?? null,
      diasTranscurridos: Number.isFinite(ventana.diasTranscurridos) ? ventana.diasTranscurridos : null,
      diasRestantes: ventana.diasRestantes,
      dentroDeVentana: ventana.dentroDeVentana,
      // SIMPLE: habilitada si hay permiso y está dentro de la ventana.
      puedeCorregirSimple: permiteSimple && ventana.dentroDeVentana,
      // COMPLETA (Fase B): flag beta + permiso + turno original ABIERTO + ventana.
      puedeCorregirCompleta: permiteCompleta && enBeta && turnoAbierto && ventana.dentroDeVentana,
      motivoCompletaDeshabilitada: motivoCompleta,
      turnoAbierto,
      puedeCorregirTurnoCerrado: permiteTurnoCerrado,
    };

    // --- Datos de medios de pago (desglose para UI + reimpresión) ---
    const pagos = lineasPagoTicket(venta).map((l) => ({
      medio: l.medio,
      label: l.label,
      monto: Number(l.monto).toFixed(2),
    }));
    const dividido = esPagoDividido(venta);

    return NextResponse.json({
      ok: true,
      permisos: { verCostos },
      venta: {
        id: venta.id,
        numero: venta.numero,
        fecha: venta.fecha,
        formaPago: venta.formaPago,
        esFiado,
        estado: esFiado ? "fiado" : "cobrado",
        cliente: venta.cliente
          ? {
              id: venta.cliente.id,
              nombre: venta.cliente.nombre,
              documento: venta.cliente.documento || null,
              telefono: venta.cliente.telefono || null,
              direccion: venta.cliente.direccion || null,
            }
          : null,
        vendedor: venta.vendedor
          ? { id: venta.vendedor.id, nombre: venta.vendedor.nombre }
          : null,
        local: venta.local
          ? { id: venta.local.id, nombre: venta.local.nombre }
          : null,
        totales,
        detalles,
        pagos,
        pagoDividido: dividido,
        correccion,
      },
    });
  } catch (error) {
    console.error("Error en detalle venta:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
