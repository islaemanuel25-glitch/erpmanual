// lib/tesoreria/permisos.js
//
// Los permisos de Tesorería, por nombre, para que la ruta y los candados no
// escriban el texto a mano. El registro está en lib/rbac/registry.js.

/** Leer Tesorería: entregas, cobrado por medio y egresos exteriores. Solo lectura. */
export const PERMISO_VER_TESORERIA = "tesoreria.ver";
