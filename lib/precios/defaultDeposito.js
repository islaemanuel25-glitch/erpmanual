// lib/precios/defaultDeposito.js
//
// Configuración de la LISTA PREDETERMINADA DE UN DEPÓSITO (GrupoDeposito.listaPrecioDefaultId).
// Solo define qué lista comercial usa automáticamente ESE depósito cuando la venta NO
// tiene una lista explícita de cliente. No toca ListaPrecio, ni Cliente, ni esDefault.
//
// `prisma` se inyecta siempre (cliente de la app en runtime; mock/real en tests).

function errCtx(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

// Devuelve la fila GrupoDeposito(grupoId, localId) o null (⇒ no es depósito de este grupo).
async function getGrupoDepositoRow(prisma, grupoId, localId) {
  return prisma.grupoDeposito.findFirst({
    where: { grupoId: Number(grupoId), localId: Number(localId) },
    select: { id: true, listaPrecioDefaultId: true },
  });
}

// Lectura para la pantalla de configuración.
export async function getDefaultDeposito({ prisma, grupoId, localId }) {
  const gd = await getGrupoDepositoRow(prisma, grupoId, localId);
  const esDeposito = !!gd;

  let listasDisponibles = [];
  let listaActual = null;
  if (esDeposito) {
    // Solo listas ACTIVAS del grupo son seleccionables.
    listasDisponibles = await prisma.listaPrecio.findMany({
      where: { grupoId: Number(grupoId), activo: true },
      orderBy: [{ nombre: "asc" }],
      select: { id: true, nombre: true, tipoBase: true, margenPorcentaje: true },
    });
    if (gd.listaPrecioDefaultId != null) {
      // La actual puede haber quedado inactiva o (defensivo) de otro grupo → la traemos
      // igual para poder ADVERTIR en la UI.
      listaActual = await prisma.listaPrecio.findUnique({
        where: { id: gd.listaPrecioDefaultId },
        select: { id: true, nombre: true, activo: true, grupoId: true },
      });
    }
  }

  return {
    esDeposito,
    localId: Number(localId),
    grupoId: Number(grupoId),
    listaPrecioDefaultId: gd?.listaPrecioDefaultId ?? null,
    listaActual, // {id,nombre,activo,grupoId} | null
    listasDisponibles,
  };
}

// Escritura: setea o quita (null) la default del depósito activo.
export async function setDefaultDeposito({ prisma, grupoId, localId, listaPrecioDefaultId }) {
  const gd = await getGrupoDepositoRow(prisma, grupoId, localId);
  // Un LOCAL normal no puede configurar lista automática.
  if (!gd) {
    throw errCtx("Esta ubicación no es un depósito: no puede tener lista predeterminada.", 403);
  }

  let nuevoId = null;
  if (listaPrecioDefaultId !== null && listaPrecioDefaultId !== undefined) {
    const id = Number(listaPrecioDefaultId);
    if (!Number.isInteger(id) || id <= 0) throw errCtx("listaPrecioDefaultId inválido", 400);
    const lista = await prisma.listaPrecio.findUnique({
      where: { id },
      select: { id: true, grupoId: true, activo: true },
    });
    if (!lista) throw errCtx("La lista seleccionada no existe.", 404);
    if (lista.grupoId !== Number(grupoId)) throw errCtx("La lista pertenece a otro grupo.", 403);
    if (!lista.activo) throw errCtx("La lista está inactiva: no puede usarse como predeterminada.", 400);
    nuevoId = id;
  }

  // Actualiza la fila EXACTA GrupoDeposito(grupoId, localId).
  await prisma.grupoDeposito.update({
    where: { id: gd.id },
    data: { listaPrecioDefaultId: nuevoId },
  });

  return {
    esDeposito: true,
    localId: Number(localId),
    grupoId: Number(grupoId),
    listaPrecioDefaultId: nuevoId,
  };
}
