// lib/precios/resolverListaCliente.js
//
// Resolver central de la lista de precios aplicable a una venta, TENIENDO EN CUENTA
// la ubicación (local vs depósito). Regla funcional definitiva:
//
//   1) Cliente con ListaPrecio activa del mismo grupo → esa lista (prioridad en local Y depósito).
//   2) Sin lista de cliente:
//        - LOCAL    → null (el POS usa ProductoLocal.precio_venta).
//        - DEPÓSITO → GrupoDeposito.listaPrecioDefaultId (si es válida); si no, null.
//   La ListaPrecio.esDefault del grupo NUNCA se consulta en runtime.
//
// Entrada: { clienteId?, grupoId, localId, prisma }  — localId es OBLIGATORIO.
//   La ubicación se determina de forma AUTORITATIVA con GrupoDeposito/GrupoLocal;
//   no se confía en ningún `esDeposito` del frontend ni en Local.es_deposito.
//
// Salida (contrato NUEVO):
//   { lista: ListaPrecio | null, origen: "CLIENTE"|"DEPOSITO_DEFAULT"|"PRECIO_LOCAL",
//     ubicacion: "LOCAL"|"DEPOSITO", grupoId, localId }
//
// COMPATIBILIDAD con el código existente (buscar-producto / crear):
//   Esos endpoints todavía llaman `resolverListaCliente({ clienteId, grupoId, prisma })`
//   SIN localId. Con la nueva firma eso lanza ("localId es requerido"), y como ambos
//   endpoints ya envuelven la llamada en try/catch y degradan a `null`, el POS cae al
//   precio clásico (ProductoLocal.precio_venta) hasta que la Etapa 3 les pase `localId`
//   y lea `.lista`. No hay crash ni escritura. La Etapa 3 conecta el nuevo contrato.

// Error de CONTEXTO (no comercial): lleva `.status` para que el POS lo mapee a HTTP
// (400 params, 403 sin acceso al grupo, 404 recurso inexistente) y NO lo oculte.
function errCtx(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const SELECT_LISTA = {
  id: true,
  grupoId: true,
  nombre: true,
  tipoBase: true,
  margenPorcentaje: true,
  esDefault: true,
  redondeo_100: true,
  activo: true,
};

export async function resolverListaCliente({ clienteId, grupoId, localId, prisma }) {
  if (!prisma) throw errCtx("resolverListaCliente: prisma es requerido", 400);
  if (grupoId == null) throw errCtx("resolverListaCliente: grupoId es requerido", 400);
  if (localId == null) throw errCtx("resolverListaCliente: localId es requerido", 400);

  const gId = Number(grupoId);
  const locId = Number(localId);

  // ── 1) Validar ubicación y determinar LOCAL vs DEPÓSITO (autoritativo) ─────
  const local = await prisma.local.findUnique({ where: { id: locId }, select: { id: true } });
  if (!local) {
    throw errCtx(`resolverListaCliente: el local ${locId} no existe`, 404);
  }

  // Depósito ⇔ existe fila GrupoDeposito(grupoId, localId). Local ⇔ GrupoLocal(grupoId, localId).
  const gd = await prisma.grupoDeposito.findFirst({
    where: { grupoId: gId, localId: locId },
    select: { listaPrecioDefaultId: true },
  });

  let ubicacion = null;
  if (gd) {
    ubicacion = "DEPOSITO";
  } else {
    const gl = await prisma.grupoLocal.findFirst({
      where: { grupoId: gId, localId: locId },
      select: { id: true },
    });
    if (gl) ubicacion = "LOCAL";
  }

  if (!ubicacion) {
    throw errCtx(`resolverListaCliente: el local ${locId} no pertenece al grupo ${gId}`, 403);
  }

  const meta = { ubicacion, grupoId: gId, localId: locId };

  // ── 2) Lista explícita del cliente (prioridad en local y depósito) ────────
  // Nota (revisión pedida): se valida solo pertenencia al GRUPO, no Cliente.localId.
  // Es el comportamiento actual del POS (clientes compartidos por grupo); no se
  // introduce una restricción por local que hoy no existe.
  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(clienteId) },
      select: { grupoId: true, listaPrecio: { select: SELECT_LISTA } },
    });

    if (cliente && cliente.grupoId === gId) {
      const lp = cliente.listaPrecio;
      if (lp && lp.activo && lp.grupoId === gId) {
        return { lista: lp, origen: "CLIENTE", ...meta };
      }
    }
    // Cliente de otro grupo, sin lista, o lista inactiva/inválida → fallback por ubicación.
    // (NO se vuelve a la default global del grupo.)
  }

  // ── 3) Local sin lista de cliente → null (usa ProductoLocal.precio_venta) ─
  if (ubicacion === "LOCAL") {
    return { lista: null, origen: "PRECIO_LOCAL", ...meta };
  }

  // ── 4) Depósito sin lista de cliente → default del GrupoDeposito (validada) ─
  const defId = gd.listaPrecioDefaultId;
  if (defId == null) {
    return { lista: null, origen: "PRECIO_LOCAL", ...meta };
  }

  const def = await prisma.listaPrecio.findUnique({
    where: { id: defId },
    select: SELECT_LISTA,
  });

  // Inexistente / inactiva / de otro grupo → null (fallback seguro; usa precio del depósito).
  if (!def || !def.activo || def.grupoId !== gId) {
    return { lista: null, origen: "PRECIO_LOCAL", ...meta };
  }

  return { lista: def, origen: "DEPOSITO_DEFAULT", ...meta };
}
