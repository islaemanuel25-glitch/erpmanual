import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { lineasPagoTicket, esPagoDividido } from "@/lib/pos-ventas/pagos";
import { esVentaFiada, estadoVentanaCorreccion } from "@/lib/pos-ventas/correccion";
import { enBetaCorreccionCompleta } from "@/lib/pos-ventas/correccionBeta";
import { descriptorDeposito } from "@/lib/reportes-ventas/modoLineaDeposito";

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
        // Sin esto, el detalle imprimiría "Comisión $0" y un neto igual al total
        // para una venta a la que le falta el dato. Ver
        // `lib/pos-ventas/comisionPendiente.js`.
        comisionPendiente: true,
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
        // Anulación: la pantalla la muestra con su cinta y decide si ofrece el
        // botón. Ésta es una vista de UNA venta, así que la anulada NO se
        // esconde — se muestra marcada, que es lo contrario de lo que hacen las
        // vistas agregadas.
        anuladaEn: true,
        anuladaPorId: true,
        motivoAnulacion: true,
        // El remito vinculado: la venta anulada muestra a qué documento
        // pertenece, que es donde se resolvió.
        transferencia: { select: { id: true } },
        observaciones: true,
        referenciaInterna: true,
        turnoId: true,
        turno: { select: { cierre: true } },
        cliente: { select: { id: true, nombre: true, documento: true, telefono: true, direccion: true } },
        vendedor: { select: { id: true, nombre: true } },
        // es_deposito: necesario para saber si la línea se vendió en un depósito
        // (Pack/Unidad suelta solo aplica ahí).
        local: { select: { id: true, nombre: true, es_deposito: true } },
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
            // Consumo físico CONGELADO de la línea. Junto con el factor de pack del
            // producto permite inferir si se vendió por Pack o por Unidad suelta.
            // NULL en líneas legacy, combos y servicios → presentación neutra.
            cantidadStock: true,
            productoBase: {
              select: {
                unidad_medida: true,
                factor_pack: true,
                modoVentaDeposito: true,
                // modo_envio SOLO_UNIDAD ⇒ la línea nunca pudo ser un pack.
                modo_envio: true,
              },
            },
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
      // Los dos de arriba —y la ganancia neta de abajo— son placeholders cuando
      // esto es `true`. Viaja adentro de `totales` porque es lo que consumen
      // tanto el detalle del admin como la reimpresión del ticket.
      comisionPendiente: venta.comisionPendiente === true,
    };
    if (verCostos) {
      totales.costoTotal = num(venta.costoTotal).toFixed(2);
      totales.gananciaBruta = num(venta.gananciaBruta).toFixed(2);
      totales.gananciaNeta = num(venta.gananciaNeta).toFixed(2);
    }

    // ¿La venta ocurrió en un depósito? Pack / Unidad suelta solo aplica ahí.
    const ventaEnDeposito = venta.local?.es_deposito === true;

    const detalles = venta.detalles.map((d) => {
      const subtotalLinea = num(d.subtotal);
      const base = {
        id: d.id,
        nombre: d.nombre,
        cantidad: num(d.cantidad),
        precio: num(d.precio).toFixed(2),
        subtotal: subtotalLinea.toFixed(2),
        // --- Modo de venta y consumo físico (presentación del detalle) ---------
        // `modo` sale de inferirModo() (lib/pos-ventas/lineaModoDeposito), el MISMO
        // helper que usa la corrección: compara cantidadStock con cantidad×factor.
        // Es null cuando no hay datos suficientes (línea legacy sin cantidadStock,
        // combo, servicio, producto sin pack o modo_envio SOLO_UNIDAD): en ese caso
        // el frontend muestra una presentación neutra, sin inventar el modo.
        deposito: descriptorDeposito(d, ventaEnDeposito),
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

    // Última corrección aplicada (para el bloque "Venta corregida" del ticket:
    // fecha/usuario/motivo/versiones). Auditoría detallada (snapshots) vive aparte.
    let ultimaCorreccion = null;
    if (venta.corregida && venta.ultimaCorreccionId) {
      const c = await prisma.ventaCorreccion.findUnique({
        where: { id: venta.ultimaCorreccionId },
        select: { id: true, tipo: true, motivo: true, createdAt: true, versionAntes: true, versionDespues: true, usuarioId: true },
      });
      if (c) {
        let usuarioNombre = null;
        if (c.usuarioId) {
          const u = await prisma.usuario.findUnique({ where: { id: c.usuarioId }, select: { nombre: true } });
          usuarioNombre = u?.nombre ?? null;
        }
        ultimaCorreccion = {
          id: c.id,
          tipo: c.tipo,
          motivo: c.motivo,
          fecha: c.createdAt,
          usuario: usuarioNombre,
          versionAntes: c.versionAntes,
          versionDespues: c.versionDespues,
        };
      }
    }

    const correccion = {
      version: venta.version ?? 0,
      corregida: !!venta.corregida,
      ultimaCorreccion,
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

    // ── ANULACIÓN: SOLO PARA MOSTRARLA ───────────────────────────────────────
    //
    // Es informativa. NO trae `puedeAnular` y eso es a propósito: una venta
    // interna se anula cancelando su REMITO, desde el módulo Transferencias, que
    // es el documento que el local destino recibe y revisa. Acá solo se muestra
    // que pasó, con quién, cuándo y por qué — ERP Azul no borra la historia de
    // una operación, así que una venta anulada tiene que decirlo en su pantalla.
    //
    // Durante unas horas del 2026-08-20 esto tuvo un `puedeAnular` que encendía
    // un botón en Ventas. Se retiró: tener dos caminos operativos para el mismo
    // hecho es peor que tener uno incómodo.
    let anuladaPorNombre = null;
    if (venta.anuladaPorId) {
      const u = await prisma.usuario.findUnique({
        where: { id: venta.anuladaPorId },
        select: { nombre: true },
      });
      anuladaPorNombre = u?.nombre ?? null;
    }
    const anulacion = {
      anulada: venta.anuladaEn != null,
      fecha: venta.anuladaEn,
      usuario: anuladaPorNombre,
      motivo: venta.motivoAnulacion,
      // El remito, para que desde la venta se llegue al documento donde se
      // resuelve. Es un dato, no una acción.
      transferenciaId: venta.transferencia?.id ?? null,
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
          ? {
              id: venta.local.id,
              nombre: venta.local.nombre,
              // Aditivo: el comprobante PDF etiqueta el origen como Depósito o Local.
              esDeposito: venta.local.es_deposito === true,
            }
          : null,
        totales,
        detalles,
        pagos,
        pagoDividido: dividido,
        correccion,
        anulacion,
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
