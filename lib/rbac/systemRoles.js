// lib/rbac/systemRoles.js
//
// Fuente única de verdad de los ROLES DE SISTEMA (esSistema=true) y sus permisos
// por defecto. La consumen: el seed idempotente (prisma/seed.js), los guards de
// roles/* y la validación de "localId obligatorio". Mantener alineado con la
// matriz aprobada y con el catálogo lib/rbac/registry.js.
//
// Reglas:
//  - Admin es rol de sistema pero su permiso es el comodín "*"; no se lista aquí
//    su array (se maneja aparte, siempre ["*"]).
//  - CAJERO ⊆ ENCARGADO ⊆ DUEÑO_LOCAL (composición por herencia explícita).
//  - Estos permisos son el DEFAULT de creación: el seed NO los repisa si el rol
//    ya existe (respeta ajustes del admin).

// Nombre canónico del rol universal.
export const ROL_ADMIN = "Admin";

// Roles de sistema por-local que EXIGEN localId en el usuario.
export const CAJERO = "CAJERO";
export const ENCARGADO = "ENCARGADO";
export const DUENO_LOCAL = "DUEÑO_LOCAL";

// Todos los roles marcados esSistema=true (no eliminables ni renombrables).
export const SYSTEM_ROLE_NAMES = [ROL_ADMIN, CAJERO, ENCARGADO, DUENO_LOCAL];

// Roles cuyo usuario DEBE tener localId (creación/edición/cambio de rol/runtime).
export const ROLES_REQUIEREN_LOCAL = [CAJERO, ENCARGADO, DUENO_LOCAL];

// --- Matriz de permisos por defecto (composición por herencia) ---

const CAJERO_PERMISOS = [
  "pos.usar",
  // Cliente básico desde POS (selección va por pos.usar + scope; alta por clientes.crear).
  "clientes.crear",
  "clientes.puntos.ver",
  "clientes.puntos.canjear",
  "clientes.cc.ver",
  "clientes.cc.pagar",
];

const ENCARGADO_PERMISOS = [
  ...CAJERO_PERMISOS,
  "pos.anular",
  "turnos.ver_todos",
  "clientes.ver",
  "clientes.editar",
  "productos.ver",
  "productos.crear",
  "productos.editar",
  "stock.ver",
  "stock.editar",
  "transferencias.ver",
  "transferencias.crear",
  "transferencias.recibir",
  "transferencias.cancelar",
  "pos_transferencias.ver",
  "pos_transferencias.enviar",
  "pedidos.ver",
  "pedidos.editar",
  "pedidos.solicitar",
  "compras.ver",
  "compras.recibir",
  "reportes.ver",
  "config_local.operadores",
  "config_local.alertas",
];

const DUENO_LOCAL_PERMISOS = [
  ...ENCARGADO_PERMISOS,
  "compras.crear",
  "costos.ver",
  "clientes.cc.ajustar",
  "clientes.eliminar",
  "precios.editar_manual",
  "precios.cambiar_lista_en_venta",
  "usuarios.gestionar_local",
  "config_local.ticket",
  "config_local.fidelidad",
  "config_local.stock",
  "config_local.pos",
  "config_local.apariencia",
  // NO incluye: auditoria.ver (bitácora no scopeable por local aún),
  // precios.usar_lista_costo, modulos.acceso_sin_operador, entidades globales.
];

// Permisos por defecto de cada rol de sistema por-local (para el seed inicial).
export const DEFAULT_PERMISOS_SISTEMA = {
  [CAJERO]: CAJERO_PERMISOS,
  [ENCARGADO]: ENCARGADO_PERMISOS,
  [DUENO_LOCAL]: DUENO_LOCAL_PERMISOS,
};

// ¿El rol (por nombre) exige que el usuario tenga localId?
export function rolExigeLocal(nombreRol) {
  return ROLES_REQUIEREN_LOCAL.includes(nombreRol);
}
