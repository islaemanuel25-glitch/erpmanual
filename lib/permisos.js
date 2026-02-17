export const PERMISOS = {
  productos: [
    "productos.ver",
    "productos.crear",
    "productos.editar",
    "productos.eliminar",
  ],
  stock: ["stock.ver"],
  transferencias: ["transferencias.crear", "transferencias.recibir"],
  pos: ["pos.usar", "pos.anular"],
  pedidos: ["pedidos.ver", "pedidos.editar", "pedidos.solicitar"],
  pos_transferencias: ["pos_transferencias.ver", "pos_transferencias.enviar"],
  compras: ["compras.crear", "compras.ver"],
  proveedores: ["proveedores.ver"],
  usuarios: ["usuarios.ver", "usuarios.editar", "usuarios.eliminar"],
  roles: ["roles.editar"],
  reportes: ["reportes.ver"],
};
