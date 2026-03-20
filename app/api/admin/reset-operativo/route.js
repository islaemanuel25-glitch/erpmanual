import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import bcrypt from "bcrypt";

export async function POST(req) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "No disponible" }, { status: 404 });
  }
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    if (!session.esAdmin) {
      return NextResponse.json(
        { ok: false, error: "Solo administradores pueden ejecutar esta accion" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { password, frase, confirmado } = body;

    if (!password) {
      return NextResponse.json(
        { ok: false, error: "Contrasena requerida" },
        { status: 400 }
      );
    }

    if (frase !== "REINICIAR TODO") {
      return NextResponse.json(
        { ok: false, error: "Frase de confirmacion incorrecta" },
        { status: 400 }
      );
    }

    if (!confirmado) {
      return NextResponse.json(
        { ok: false, error: "Debe confirmar que entiende la accion" },
        { status: 400 }
      );
    }

    // Validar contrasena contra la DB
    const usuario = await prisma.usuario.findUnique({
      where: { id: session.id },
      select: { passwordHash: true },
    });

    if (!usuario) {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    if (!usuario.passwordHash) {
      return NextResponse.json(
        { ok: false, error: "Usuario sin password configurada" },
        { status: 400 }
      );
    }

    const passOk = await bcrypt.compare(password, usuario.passwordHash);
    if (!passOk) {
      return NextResponse.json(
        { ok: false, error: "Contrasena incorrecta" },
        { status: 403 }
      );
    }

    // ══════════════════════════════════════════════════════
    // Ejecutar reset dentro de transaccion
    // Orden: hijos → padres
    // ══════════════════════════════════════════════════════
    const deleted = await prisma.$transaction(async (tx) => {
      // Dependencias de Venta
      const ventaDetalle = await tx.ventaDetalle.deleteMany({});
      const movCuenta = await tx.movimientoCuenta.deleteMany({});
      const puntoMov = await tx.clientePuntoMovimiento.deleteMany({});
      const ventas = await tx.venta.deleteMany({});

      // Turnos (CajaMovimiento NO existe en VPS, no tocar)
      const turnos = await tx.turno.deleteMany({});

      // Transferencias
      const transfDet = await tx.transferenciaDetalle.deleteMany({});
      const transf = await tx.transferencia.deleteMany({});
      const posTransfDet = await tx.posTransferenciaDetalle.deleteMany({});
      const posTransf = await tx.posTransferencia.deleteMany({});

      // Pedidos
      const pedidoDet = await tx.pedidoProveedorDetalle.deleteMany({});
      const pedidos = await tx.pedidoProveedor.deleteMany({});

      // Precios
      const precioItem = await tx.precioUpdateItem.deleteMany({});
      const precioUpdate = await tx.precioUpdate.deleteMany({});

      // Stock y auditoria
      const auditoria = await tx.auditoriaStock.deleteMany({});
      const stockLocal = await tx.stockLocal.deleteMany({});

      // Productos
      const prodListaPrecio = await tx.productoListaPrecio.deleteMany({});
      const listaPrecio = await tx.listaPrecio.deleteMany({});
      const prodLocal = await tx.productoLocal.deleteMany({});
      const prodBase = await tx.productoBase.deleteMany({});

      // Contador de tickets
      const counter = await tx.posVentaCounter.deleteMany({});

      return {
        ventas: ventas.count,
        ventaDetalle: ventaDetalle.count,
        movimientosCuenta: movCuenta.count,
        puntoMovimientos: puntoMov.count,
        turnos: turnos.count,
        transferencias: transf.count + posTransf.count,
        transferenciaDetalles: transfDet.count + posTransfDet.count,
        pedidos: pedidos.count,
        pedidoDetalles: pedidoDet.count,
        precioUpdates: precioUpdate.count + precioItem.count,
        auditoriaStock: auditoria.count,
        stockLocal: stockLocal.count,
        productoListaPrecio: prodListaPrecio.count,
        listaPrecio: listaPrecio.count,
        productoLocal: prodLocal.count,
        productoBase: prodBase.count,
        posVentaCounter: counter.count,
      };
    });

    // Reiniciar secuencias de autoincrement
    // (No incluir CajaMovimiento porque no existe en VPS)
    const secuencias = [
      "VentaDetalle",
      "Venta",
      "MovimientoCuenta",
      "ClientePuntoMovimiento",
      "Turno",
      "TransferenciaDetalle",
      "Transferencia",
      "PosTransferenciaDetalle",
      "PosTransferencia",
      "PedidoProveedorDetalle",
      "PedidoProveedor",
      "PrecioUpdateItem",
      "PrecioUpdate",
      "AuditoriaStock",
      "StockLocal",
      "ProductoListaPrecio",
      "ListaPrecio",
      "ProductoLocal",
      "ProductoBase",
      "PosVentaCounter",
    ];

    for (const t of secuencias) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER SEQUENCE "${t}_id_seq" RESTART WITH 1`
        );
      } catch {
        // Secuencia no encontrada, ignorar
      }
    }

    console.log(
      `[RESET OPERATIVO] Ejecutado por admin ${session.id} (${session.email})`,
      deleted
    );

    return NextResponse.json({
      ok: true,
      deleted: {
        ventas: deleted.ventas,
        productos: deleted.productoBase,
        transferencias: deleted.transferencias,
        turnos: deleted.turnos,
      },
    });
  } catch (error) {
    console.error("Error en reset operativo:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno al ejecutar el reset" },
      { status: 500 }
    );
  }
}