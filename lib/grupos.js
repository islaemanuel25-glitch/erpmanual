// lib/grupos.js
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getContextoActivo } from "@/lib/contexto";
import { seedAuditoria } from "@/lib/auditoria/contexto";

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// localId EXPLÍCITO en el query string (no lee body). Para rechazar alcance ajeno.
function queryLocalId(req) {
  try {
    return toPositiveInt(
      req?.nextUrl?.searchParams?.get("localId") ??
        new URL(req.url).searchParams.get("localId")
    );
  } catch {
    return null;
  }
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

  let localId = toPositiveInt(session.localId);

  if (!session.esAdmin) {
    // No-admin: alcance EXCLUSIVO de la sesión. Nunca query/body/cookie.
    if (!localId) {
      // Sin local fijo autorizado → 403 (no seleccionar desde el request).
      return { error: "Sin alcance autorizado.", status: 403 };
    }
    // Un localId ajeno EXPLÍCITO por query no se ignora en silencio → 403.
    const q = queryLocalId(req);
    if (q && q !== localId) {
      return { error: "Local fuera de tu alcance.", status: 403 };
    }
  } else if (!localId) {
    // Admin sin local fijo → contexto activo (cookie). Sin fallback por query/body.
    const contexto = getContextoActivo(req, session);
    if (contexto.needsContexto) {
      return { error: "Seleccioná un contexto operativo.", needsContexto: true, status: 409 };
    }
    localId = toPositiveInt(contexto.localId);
  }

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

// Resuelve el alcance (localId+grupoId) para endpoints que reciben un localId/grupoId
// EXPLÍCITO en query o body. Reglas de hardening:
//  - No-admin: el alcance sale SIEMPRE de session.localId. Si el request trae un
//    localId/grupoId explícito distinto → 403 (no se ejecuta silenciosamente sobre
//    el local de sesión). Sin session.localId → 403.
//  - Admin: puede indicar contexto explícito válido (explicitLocalId) o usar el
//    contexto activo (cookie). Un grupoId explícito inconsistente → 403.
// El handler pasa los valores que YA leyó del request (o null si el campo está ausente).
export async function resolveScope(req, { explicitLocalId = null, explicitGrupoId = null } = {}) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { error: "No autenticado", status: 401 };
  }

  const eLocal = toPositiveInt(explicitLocalId);
  const eGrupo = toPositiveInt(explicitGrupoId);

  let localId;
  if (!session.esAdmin) {
    localId = toPositiveInt(session.localId);
    if (!localId) return { error: "Sin alcance autorizado.", status: 403 };
    if (eLocal && eLocal !== localId) {
      return { error: "Local fuera de tu alcance.", status: 403 };
    }
  } else {
    localId = eLocal;
    if (!localId) {
      const contexto = getContextoActivo(req, session);
      if (contexto.needsContexto) {
        return { error: "Seleccioná un contexto operativo.", needsContexto: true, status: 409 };
      }
      localId = toPositiveInt(contexto.localId);
    }
    if (!localId) return { error: "No hay contexto operativo activo.", status: 400 };
  }

  let grupoId = toPositiveInt(session.grupoId);
  if (!grupoId) grupoId = await getGrupoIdDeLocal(localId);
  if (!grupoId) return { error: "No se pudo determinar el grupo", status: 400 };

  if (eGrupo && eGrupo !== grupoId) {
    return { error: "Grupo fuera de tu alcance.", status: 403 };
  }

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
  let localId;
  if (!session.esAdmin) {
    // No-admin: alcance SOLO de la sesión. Un localId ajeno explícito → 403.
    localId = sessionLocalId;
    const q = queryLocalId(req);
    if (q && sessionLocalId && q !== sessionLocalId) {
      return { error: "Local fuera de tu alcance.", status: 403 };
    }
    if (!localId && requireLocalId) {
      return { error: "Sin alcance autorizado.", status: 403 };
    }
  } else {
    // Admin: puede indicar contexto explícito por request.
    localId = sessionLocalId || (await getLocalIdFromRequest(req));
    if (requireLocalId && !localId) {
      return { error: "No hay contexto operativo activo.", status: 400 };
    }
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
