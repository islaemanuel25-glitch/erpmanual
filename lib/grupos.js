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
