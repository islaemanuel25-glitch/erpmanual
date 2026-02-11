// lib/grupos.js
import prisma from "@/lib/prisma";

// ✅ Versión FINAL — obtiene el grupo de un local
export async function getGrupoIdDeLocal(localId) {
  if (!localId) return null;

  // ✅ 1) Si el local es LOCAL
  const gl = await prisma.grupoLocal.findFirst({
    where: { localId },
    select: { grupoId: true },
  });

  if (gl?.grupoId) return gl.grupoId;

  // ✅ 2) Si el local es DEPÓSITO
  const gd = await prisma.grupoDeposito.findFirst({
    where: { localId },
    select: { grupoId: true },
  });

  if (gd?.grupoId) return gd.grupoId;

  // ✅ 3) No está en ningún grupo
  return null;
}

// ✅ NUEVO — obtiene todos los locales del grupo (EXCEPTO depósito)
export async function getLocalesDeGrupo(grupoId) {
  if (!grupoId) return [];

  const locales = await prisma.grupoLocal.findMany({
    where: { grupoId },
    include: { local: true },
  });

  // ✅ Devolvemos SOLO el local, no el wrapper
  return locales.map((g) => g.local);
}

// ✅ HEREDAR PRODUCTOS DEL DEPÓSITO AL CREAR/ASIGNAR UN LOCAL
// tx = prisma de transacción (tx)
export async function inheritDepositoProductsToLocal(tx, grupoId, newLocalId) {
  if (!grupoId || !newLocalId) {
    throw new Error("grupoId y newLocalId son requeridos");
  }

  // A) Obtener depósito del grupo
  const grupoDeposito = await tx.grupoDeposito.findFirst({
    where: { grupoId },
    select: { localId: true },
  });

  if (!grupoDeposito) {
    console.warn(`⚠️ Grupo ${grupoId} no tiene depósito asignado`);
    throw new Error(`El grupo ${grupoId} no tiene depósito asignado`);
  }

  const depositoLocalId = grupoDeposito.localId;
  console.log(`🔍 Buscando productos del depósito ${depositoLocalId} en grupo ${grupoId} para heredar al local ${newLocalId}`);

  // B) Obtener ProductoBase del grupo creados por el depósito
  // Heredamos productos con creadoEnLocalId = depositoLocalId O null (productos viejos del grupo)
  const productosBase = await tx.productoBase.findMany({
    where: {
      grupoId,
      OR: [
        { creadoEnLocalId: depositoLocalId },
        { creadoEnLocalId: null }, // ✅ incluye productos viejos sin creador
      ],
    },
    select: {
      id: true,
      precio_costo: true,
      precio_venta: true,
      margen: true,
      activo: true,
    },
  });

  console.log(`🔍 Grupo ${grupoId}, Depósito ${depositoLocalId}: encontrados ${productosBase.length} productos base para heredar`);

  if (productosBase.length === 0) {
    console.warn(`⚠️ No hay productos del depósito para heredar al local ${newLocalId}`);
    return { inherited: 0 };
  }

  // C) Crear ProductoLocal para el nuevo local (idempotente)
  const productosLocalData = productosBase.map((base) => ({
    localId: newLocalId,
    baseId: base.id,
    precio_costo: base.precio_costo,
    precio_venta: base.precio_venta,
    margen: base.margen,
    activo: base.activo,
  }));

  const result = await tx.productoLocal.createMany({
    data: productosLocalData,
    skipDuplicates: true,
  });

  // D) Crear StockLocal para cada ProductoLocal del local (idempotente)
  const productosLocal = await tx.productoLocal.findMany({
    where: {
      localId: newLocalId,
      baseId: { in: productosBase.map((b) => b.id) },
    },
    select: { id: true },
  });

  const stockData = productosLocal.map((pl) => ({
    localId: newLocalId,
    productoId: pl.id,
    cantidad: "0", // Decimal safe
    stockMin: null,
    stockMax: null,
  }));

  const stockResult = await tx.stockLocal.createMany({
    data: stockData,
    skipDuplicates: true,
  });

  console.log(`✅ Heredados ${result.count} ProductoLocal y ${stockResult.count} StockLocal al local ${newLocalId}`);

  return { inherited: result.count };
}
