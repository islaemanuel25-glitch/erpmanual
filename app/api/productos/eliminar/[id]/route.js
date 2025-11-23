import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req, context) {
  console.log("========================================");
  console.log("🗑️ DELETE /api/productos/:id");
  console.log("Headers:", Object.fromEntries(req.headers));
  console.log("Context recibido:", context);

  try {
    const { id } = await context.params;
    console.log("➡️ Param ID crudo:", id);

    const numId = Number(id);
    console.log("➡️ Param ID numérico:", numId);

    if (!numId || Number.isNaN(numId)) {
      console.log("❌ ID inválido");
      return NextResponse.json(
        { ok: false, error: "ID inválido o faltante" },
        { status: 400 }
      );
    }

    console.log("✅ Borrando overrides productoLocal...");
    const delLocal = await prisma.productoLocal.deleteMany({
      where: { baseId: numId },
    });
    console.log("✅ Overrides borrados:", delLocal);

    console.log("✅ Borrando productoBase...");
    const delBase = await prisma.productoBase.delete({
      where: { id: numId },
    });
    console.log("✅ ProductoBase borrado:", delBase);

    console.log("✅ DELETE FINALIZADO OK");
    console.log("========================================");

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.log("============== ❌ ERROR DELETE PRODUCTO ==============");
    console.error(error);
    console.log("======================================================");

    // ✅ Respuesta JSON garantizada
    return NextResponse.json(
      { ok: false, error: "Error interno al eliminar", detalle: String(error) },
      { status: 500 }
    );
  }
}
