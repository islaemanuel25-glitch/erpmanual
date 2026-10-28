// lib/pedidos/depositosDelPedido.js
//
// QUÉ DEPÓSITOS ARMAN EL PEDIDO DE UN LOCAL.
//
// Regla de Emanuel (2026-10-28): una empresa puede tener DOS depósitos —uno de
// frío y otro de mercadería— que arman EL MISMO pedido de un local, cada uno su
// parte. El pedido sale una sola vez, cuando no queda nada sin definir, y lo
// manda el último que termina.
//
// "La empresa" es el grupo del local que pidió (`GrupoLocal`), y sus depósitos
// son los `GrupoDeposito` de ese grupo. El pedido sigue teniendo UN origen
// (`PosTransferencia.origenId`, el que eligió el local al pedir): es el catálogo
// del pedido y el depósito del que sale lo que nadie resolvió. Los demás
// depósitos de la empresa lo ven, lo preparan y lo envían igual.
//
// Lo leen las rutas del depósito (`solicitados`, `detalle`, `detalle/editar`,
// `agregarItem`, `buscarProductos`, `enviar`, `cancelar`): así el alcance se
// decide en un solo lugar.

/** Los depósitos de la empresa del local `localId`, en el orden en que se dieron de alta. */
export async function depositosDelLocal(db, localId) {
  const gl = await db.grupoLocal.findFirst({ where: { localId: Number(localId) }, select: { grupoId: true } });
  if (!gl) return [];
  const ds = await db.grupoDeposito.findMany({ where: { grupoId: gl.grupoId }, select: { localId: true }, orderBy: { id: "asc" } });
  return ds.map((d) => d.localId);
}

/**
 * ¿El local `localId` es uno de los depósitos que arman este pedido? Su origen,
 * o cualquier depósito de la empresa del local que lo pidió.
 *
 * @param {{ origenId: number, destinoId: number }} pos
 */
export async function esDepositoDelPedido(db, localId, pos) {
  const id = Number(localId);
  if (!id || !pos) return false;
  if (id === pos.origenId) return true;
  return (await depositosDelLocal(db, pos.destinoId)).includes(id);
}

/** Los locales cuyos pedidos arma el depósito: los de cada empresa de la que es depósito. */
export async function localesQueArmaElDeposito(db, depositoId) {
  const grupos = await db.grupoDeposito.findMany({ where: { localId: Number(depositoId) }, select: { grupoId: true } });
  if (!grupos.length) return [];
  const ls = await db.grupoLocal.findMany({ where: { grupoId: { in: grupos.map((g) => g.grupoId) } }, select: { localId: true } });
  return ls.map((l) => l.localId);
}

/**
 * El producto de ESTE depósito para la misma base. Las líneas del pedido son
 * del catálogo del origen; lo que resuelve otro depósito sale de SU stock, que
 * está en su propio `ProductoLocal`. Null si ese depósito no tiene el producto.
 */
export function productoDelDeposito(db, depositoId, baseId) {
  return db.productoLocal.findUnique({
    where: { localId_baseId: { localId: Number(depositoId), baseId: Number(baseId) } },
    include: { base: true },
  });
}

/** Lo que se dice cuando un depósito resuelve algo que no tiene en su catálogo. */
export const mensajeNoEstaEnElCatalogo = (producto, deposito) =>
  `${producto} no está en el catálogo de ${deposito}: no puede salir de su stock.`;

/** ¿Los dos depósitos son de una misma empresa? (Para buscar en el catálogo del pedido.) */
export async function sonDepositosHermanos(db, unoId, otroId) {
  if (Number(unoId) === Number(otroId)) return true;
  const grupos = await db.grupoDeposito.findMany({ where: { localId: Number(unoId) }, select: { grupoId: true } });
  if (!grupos.length) return false;
  const hermano = await db.grupoDeposito.findFirst({
    where: { localId: Number(otroId), grupoId: { in: grupos.map((g) => g.grupoId) } },
    select: { id: true },
  });
  return !!hermano;
}
