// lib/tesoreria/permisos.js
//
// Los permisos de Tesorería, por nombre, para que la ruta y los candados no
// escriban el texto a mano. El registro está en lib/rbac/registry.js.

/** Leer Tesorería: entregas, cobrado por medio y egresos exteriores. Solo lectura. */
export const PERMISO_VER_TESORERIA = "tesoreria.ver";

/** Verificar efectivo: dejar lo contado de un conjunto de entregas. No autoriza anular. */
export const PERMISO_VERIFICAR_EFECTIVO = "tesoreria.verificar_efectivo";

/** Anular una verificación de efectivo. No autoriza verificar. */
export const PERMISO_ANULAR_VERIFICACION = "tesoreria.anular_verificacion";
