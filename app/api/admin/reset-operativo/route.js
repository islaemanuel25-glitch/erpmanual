import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import bcrypt from "bcrypt";
import fs from "fs/promises";
import path from "path";

const TABLAS_PROTEGIDAS_NO_TOCADAS = [
  "Usuario",
  "Rol",
  "Local",
  "Grupo",
  "GrupoDeposito",
  "ConfiguracionGrupo",
  "Categoria",
  "Proveedor",
  "AreaFisica",
  "Cliente",
  "Operador",
];

const PLAN_RESET = [
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

export async function POST(req) {
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

    if (confirmado !== true) {
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
    // 1) Conteo previo (snapshot informativo)
    // ══════════════════════════════════════════════════════
    const [
      cVentas,
      cVentaDetalles,
      cTurnos,
      cTransferencias,
      cTransferenciaDetalles,
      cPosTransferencias,
      cPosTransferenciaDetalles,
      cPedidosProveedor,
      cPedidosProveedorDetalles,
      cPrecioUpdates,
      cPrecioUpdateItems,
      cStockLocal,
      cAuditoriaStock,
      cProductoListaPrecio,
      cListaPrecio,
      cProductoLocal,
      cProductoBase,
      cPosVentaCounter,
    ] = await Promise.all([
      prisma.venta.count(),
      prisma.ventaDetalle.count(),
      prisma.turno.count(),
      prisma.transferencia.count(),
      prisma.transferenciaDetalle.count(),
      prisma.posTransferencia.count(),
      prisma.posTransferenciaDetalle.count(),
      prisma.pedidoProveedor.count(),
      prisma.pedidoProveedorDetalle.count(),
      prisma.precioUpdate.count(),
      prisma.precioUpdateItem.count(),
      prisma.stockLocal.count(),
      prisma.auditoriaStock.count(),
      prisma.productoListaPrecio.count(),
      prisma.listaPrecio.count(),
      prisma.productoLocal.count(),
      prisma.productoBase.count(),
      prisma.posVentaCounter.count(),
    ]);

    const conteoAntes = {
      ventas: cVentas,
      ventaDetalles: cVentaDetalles,
      turnos: cTurnos,
      transferencias: cTransferencias,
      transferenciaDetalles: cTransferenciaDetalles,
      posTransferencias: cPosTransferencias,
      posTransferenciaDetalles: cPosTransferenciaDetalles,
      pedidosProveedor: cPedidosProveedor,
      pedidosProveedorDetalles: cPedidosProveedorDetalles,
      precioUpdates: cPrecioUpdates,
      precioUpdateItems: cPrecioUpdateItems,
      stockLocal: cStockLocal,
      auditoriaStock: cAuditoriaStock,
      productoListaPrecio: cProductoListaPrecio,
      listaPrecio: cListaPrecio,
      productoLocal: cProductoLocal,
      productoBase: cProductoBase,
      posVentaCounter: cPosVentaCounter,
    };

    // ══════════════════════════════════════════════════════
    // 2) Backup/log previo (obligatorio antes de borrar)
    // ══════════════════════════════════════════════════════
    const createdAt = new Date().toISOString();
    const timestamp = createdAt.replace(/[:.]/g, "-");
    const backupDir = path.join(process.cwd(), "backups", "reset-operativo");
    const backupFilename = `reset-operativo-${timestamp}-admin-${session.id}.json`;
    const backupFullPath = path.join(backupDir, backupFilename);

    const backupData = {
      ok: true,
      tipo: "reset-operativo",
      createdAt,
      nodeEnv: process.env.NODE_ENV || "unknown",
      admin: {
        id: session.id,
        email: session.email || null,
      },
      conteoAntes,
      tablasProtegidasNoTocadas: TABLAS_PROTEGIDAS_NO_TOCADAS,
      planReset: PLAN_RESET,
      status: "pending",
    };

    try {
      await fs.mkdir(backupDir, { recursive: true });
      await fs.writeFile(
        backupFullPath,
        JSON.stringify(backupData, null, 2),
        "utf8"
      );
    } catch (err) {
      console.error("[RESET OPERATIVO] Fallo al crear backup previo:", err);
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo crear backup/log previo. Reset cancelado.",
        },
        { status: 500 }
      );
    }

    console.warn(`[RESET OPERATIVO] Backup creado en ${backupFullPath}`);

    // ══════════════════════════════════════════════════════
    // 3) Ejecutar reset dentro de transaccion
    // Orden: hijos → padres
    // ══════════════════════════════════════════════════════
    let deleted;
    const sequencesReset = [];
    try {
      deleted = await prisma.$transaction(async (tx) => {
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
      for (const t of PLAN_RESET) {
        try {
          await prisma.$executeRawUnsafe(
            `ALTER SEQUENCE "${t}_id_seq" RESTART WITH 1`
          );
          sequencesReset.push(t);
        } catch {
          // Secuencia no encontrada, ignorar
        }
      }
    } catch (error) {
      console.error("[RESET OPERATIVO] Error durante el reset:", error);
      // Registrar fallo en el mismo backup/log
      try {
        const failedData = {
          ...backupData,
          failedAt: new Date().toISOString(),
          status: "failed",
          error: error?.message || String(error),
        };
        await fs.writeFile(
          backupFullPath,
          JSON.stringify(failedData, null, 2),
          "utf8"
        );
      } catch (writeErr) {
        console.error(
          "[RESET OPERATIVO] No se pudo escribir log de fallo:",
          writeErr
        );
      }
      return NextResponse.json(
        { ok: false, error: "Error interno al ejecutar el reset" },
        { status: 500 }
      );
    }

    // ══════════════════════════════════════════════════════
    // 4) Sobrescribir backup con resultado completado
    // ══════════════════════════════════════════════════════
    try {
      const completedData = {
        ...backupData,
        completedAt: new Date().toISOString(),
        deleted,
        sequencesReset,
        status: "completed",
      };
      await fs.writeFile(
        backupFullPath,
        JSON.stringify(completedData, null, 2),
        "utf8"
      );
    } catch (err) {
      console.error(
        "[RESET OPERATIVO] No se pudo actualizar backup post-reset:",
        err
      );
      // El reset ya se ejecuto, no abortamos.
    }

    console.warn(
      `[RESET OPERATIVO] Ejecutado por admin ${session.id} (${session.email})`
    );

    return NextResponse.json({
      ok: true,
      backupPath: backupFilename,
      deleted: {
        ventas: deleted.ventas,
        productos: deleted.productoBase,
        transferencias: deleted.transferencias,
        turnos: deleted.turnos,
      },
      message: "Reset operativo completado. Backup/log generado.",
    });
  } catch (error) {
    console.error("Error en reset operativo:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno al ejecutar el reset" },
      { status: 500 }
    );
  }
}
