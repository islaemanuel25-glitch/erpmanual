// lib/precios/resolverListaCliente.js
//
// Resuelve la lista de precios aplicable a un cliente en un grupo:
//  1) Si el cliente tiene listaPrecioId asignada y activa del mismo grupo, la devuelve.
//  2) Sino, busca la lista default activa del grupo.
//  3) Si no existe default activa, lanza error.
//
// Entrada: { clienteId?, grupoId, prisma }
// Salida:  objeto ListaPrecio (o throw)

export async function resolverListaCliente({ clienteId, grupoId, prisma }) {
  if (!grupoId) {
    throw new Error("resolverListaCliente: grupoId es requerido");
  }
  if (!prisma) {
    throw new Error("resolverListaCliente: prisma es requerido");
  }

  // 1) Cliente con lista asignada (mismo grupo, lista activa)
  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(clienteId) },
      select: {
        grupoId: true,
        listaPrecio: {
          select: {
            id: true,
            grupoId: true,
            nombre: true,
            tipoBase: true,
            margenPorcentaje: true,
            esDefault: true,
            redondeo_100: true,
            activo: true,
          },
        },
      },
    });

    if (cliente && cliente.grupoId !== Number(grupoId)) {
      throw new Error(
        `resolverListaCliente: cliente ${clienteId} no pertenece al grupo ${grupoId}`
      );
    }

    const lp = cliente?.listaPrecio;
    if (lp && lp.activo && lp.grupoId === Number(grupoId)) {
      return lp;
    }
  }

  // 2) Default del grupo
  const def = await prisma.listaPrecio.findFirst({
    where: {
      grupoId: Number(grupoId),
      esDefault: true,
      activo: true,
    },
    select: {
      id: true,
      grupoId: true,
      nombre: true,
      tipoBase: true,
      margenPorcentaje: true,
      esDefault: true,
      redondeo_100: true,
      activo: true,
    },
  });

  if (!def) {
    throw new Error(`No hay lista de precios default activa para el grupo ${grupoId}`);
  }

  return def;
}
