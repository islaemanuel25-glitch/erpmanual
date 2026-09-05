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
  // ── LA SEPARACIÓN LA HACE EL TILDE, NO ESTA LISTA ────────────────────
  //
  // `compras.revisar` y `comprobantes.ver` van acá, y por lo tanto también los
  // hereda DUEÑO_LOCAL. La razón es cómo funciona este sistema: el que tiene
  // el permiso tildado puede hacer la acción, igual que en todos los módulos.
  // Si mañana hay que sacárselo a alguien, se destilda — no se reescribe esta
  // lista.
  //
  // Una versión anterior los dejaba solo en DUEÑO_LOCAL para forzar que
  // recibir y revisar fueran personas distintas. Se sacó porque en el depósito
  // hoy trabaja una sola persona con rol de administrador: esa regla no
  // protegía a nadie y trababa al único que trabaja.
  //
  // ⚠️ FRAGILIDAD QUE SIGUE VIVA: `DUENO_LOCAL_PERMISOS` hace spread de esta
  // lista. Todo lo que se agregue acá lo hereda el dueño, y eso NO se ve
  // leyendo el bloque del dueño. Al revés no pasa. Si alguna vez hace falta un
  // permiso que el encargado tenga y el dueño no, esta estructura no lo
  // permite y hay que cambiarla, no buscarle la vuelta.
  "compras.revisar",
  "comprobantes.ver",
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
  // Los medios de cobro del POS: cuáles se ven al cobrar, cómo se llaman, en qué
  // orden, con qué recargo y con qué comisión. Va acá y NO en ENCARGADO_PERMISOS
  // a propósito: como esta lista hace spread de aquélla, ponerlo allá se lo daría
  // también al encargado, y la decisión fue que por ahora no lo tenga.
  //
  // Esto alcanza a las instalaciones NUEVAS. La que ya está corriendo lo recibe
  // por la migración `20260906010000_permiso_medios_cobro_dueno_local`, porque el
  // seed no repisa los permisos de un rol que ya existe.
  "config_local.medios_cobro",
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
