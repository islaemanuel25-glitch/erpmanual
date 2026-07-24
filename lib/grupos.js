// lib/grupos.js
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getContextoActivo } from "@/lib/contexto";
import { seedAuditoria } from "@/lib/auditoria/contexto";

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function getLocalIdFromRequest(req) {
  // 1) Query param: /api/...?...&localId=123
  const queryLocalId = toPositiveInt(
    req?.nextUrl?.searchParams?.get("localId") ??
      new URL(req.url).searchParams.get("localId")
  );
  if (queryLocalId) return queryLocalId;

  // 2) Body: { localId: 123 } (sin consumir el body original)
  try {
    const body = await req.clone().json();
    const bodyLocalId = toPositiveInt(body?.localId);
    if (bodyLocalId) return bodyLocalId;
  } catch {
    // Request sin body JSON
  }

  return null;
}

export async function resolveLocalAndGrupo(req) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { error: "No autenticado", status: 401 };
  }

  // 1. Local fijo del usuario (JWT)
  let localId = toPositiveInt(session.localId);

  // 2. Contexto activo (cookie) — para admin sin local fijo
  if (!localId && session.esAdmin) {
    const contexto = getContextoActivo(req, session);
    if (contexto.needsContexto) {
      // Admin DEBE elegir contexto en /inicio — sin fallback por query/body
      return { error: "Seleccioná un contexto operativo.", needsContexto: true, status: 409 };
    }
    localId = toPositiveInt(contexto.localId);
  }

  // 3. Request params (query/body) — solo para no-admin sin local fijo
  if (!localId) {
    localId = await getLocalIdFromRequest(req);
  }

  // 4. Sin localId → error
  if (!localId) {
    return { error: "No hay contexto operativo activo.", status: 400 };
  }

  let grupoId = toPositiveInt(session.grupoId);
  if (!grupoId) {
    grupoId = await getGrupoIdDeLocal(localId);
  }

  if (!grupoId) {
    return { error: "No se pudo determinar el grupo", status: 400 };
  }

  // Auditoría: sembramos local/grupo activos para el interceptor de Prisma.
  seedAuditoria({ localId, grupoId });

  return { localId, grupoId, session };
}

// ✅ NUEVO — Resuelve grupoId (localId opcional, útil para admin sin local)
export async function resolveGrupo(req, requireLocalId = false) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { error: "No autenticado", status: 401 };
  }

  const sessionLocalId = toPositiveInt(session.localId);
  const requestLocalId = await getLocalIdFromRequest(req);
  const localId = sessionLocalId || requestLocalId;

  // Si requireLocalId es true, exigir localId (comportamiento original)
  if (requireLocalId && !localId) {
    return { error: "No hay contexto operativo activo.", status: 400 };
  }

  // Obtener grupoId: primero de session (cookie grupo activo), luego de localId
  let grupoId = toPositiveInt(session.grupoId);
  if (!grupoId && localId) {
    grupoId = await getGrupoIdDeLocal(localId);
  }

  if (!grupoId) {
    return { error: "No se pudo determinar el grupo", status: 400 };
  }

  // Auditoría: sembramos grupo (y local si se resolvió) para el interceptor.
  seedAuditoria({ localId, grupoId });

  return { localId, grupoId, session };
}

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
