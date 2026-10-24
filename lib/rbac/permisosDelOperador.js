// lib/rbac/permisosDelOperador.js
//
// LO QUE UN OPERADOR ACTIVO POR PIN NO PUEDE, aunque la cuenta del local sí.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// El operador (`OperadorLocal`) no tiene rol ni permisos: es una identidad de
// caja que se activa con PIN ENCIMA de la sesión de la cuenta del local. Todo lo
// que decide permisos —`getUsuarioSession`, `/api/me`, el menú— leía solo el JWT
// de la cuenta, así que con la operadora activa el Panel mostraba lo de la
// cuenta: el total de ventas del día y el acceso a Finanzas (producción,
// 2026-10-17, "Minimarket unidas").
//
// Decisión de Emanuel: con un operador activo manda lo que corresponde al
// operador. Un operador NO ve el total ni los tickets del día ni Finanzas; todo
// lo demás de la cuenta (POS, Stock, Compras, Transferencias) sigue igual.
//
// Por eso no es un rol: es una RESTA sobre los permisos de la cuenta. Se aplica
// en los dos lugares por donde pasan los permisos —la sesión del servidor y
// `/api/me`— con esta misma función, así no hay dos versiones de la regla.
//
// Módulo puro y con imports relativos: lo usan el servidor, el cliente y los
// candados bajo `node --test`.

import { PERMISSION_REGISTRY } from "./registry.js";
import { PERMISO_GESTIONAR_CONTROL } from "../stock/control/rutasControlStock.js";
import { PERMISO_VER_TURNOS_Y_CIERRES } from "../turnosYCierres/alcance.js";

/** El total y la cantidad de tickets del día en el Panel (`/api/dashboard/resumen`). */
export const PERMISO_VER_VENTAS_DEL_DIA = "ventas.ver_dia";

/**
 * Los permisos que se le restan a la cuenta mientras hay un operador activo.
 *
 * Son los que ABREN Finanzas —`finanzas.ver` y la Tesorería entera— más el del
 * total del día. Cada pantalla y cada ruta de Finanzas pide `finanzas.ver` o
 * `tesoreria.*`, así que restar éstos cierra el módulo del lado del servidor.
 *
 * NO se restan `finanzas.pagos_proveedores.registrar` ni
 * `finanzas.gastos.registrar`, y es a propósito: Compras los usa al recibir
 * para pagar en el momento (`compras-proveedor/recibir`), y Compras queda como
 * está. Sin `finanzas.ver` no abren ninguna pantalla de Finanzas.
 */
export const PERMISOS_FUERA_DEL_OPERADOR = Object.freeze([
  "finanzas.ver",
  "tesoreria.ver",
  "tesoreria.verificar_efectivo",
  "tesoreria.anular_verificacion",
  PERMISO_VER_VENTAS_DEL_DIA,
  // EMPEZAR Y TERMINAR UN CONTROL DE STOCK (decisión de Emanuel, 2026-10-20):
  // con PIN activo se cuenta y se corrige lo propio, pero abrir y cerrar el
  // control —que pone en cero lo que nadie contó— lo hace la cuenta sin
  // operador. Contar (`stock.control.contar`) NO se resta.
  PERMISO_GESTIONAR_CONTROL,
  // TURNOS Y CIERRES, las dos pantallas (decisión de Emanuel, 2026-10-24):
  // solo el dueño y el admin, nunca un operador por PIN.
  PERMISO_VER_TURNOS_Y_CIERRES,
]);

// Un código mal escrito acá no restaría nada y nadie lo notaría: se exige que
// cada uno exista en el catálogo.
for (const codigo of PERMISOS_FUERA_DEL_OPERADOR) {
  if (!PERMISSION_REGISTRY.some((p) => p.code === codigo)) {
    throw new Error(`permisosDelOperador: "${codigo}" no está en el catálogo`);
  }
}

const FUERA = new Set(PERMISOS_FUERA_DEL_OPERADOR);

/** ¿Este permiso queda afuera mientras hay operador activo? */
export function esPermisoFueraDelOperador(codigo) {
  return FUERA.has(codigo);
}

/**
 * Los permisos efectivos de la sesión. Sin operador, los de la cuenta tal cual.
 * Con operador, sin los de `PERMISOS_FUERA_DEL_OPERADOR`.
 *
 * El comodín `"*"` no se puede restar como lista: el Admin con operador activo
 * conserva `"*"` y la resta la hace `tieneAlguno` (lib/authorize.js) y el menú
 * (lib/menu/canAccess.js), que miran `operadorActivo`.
 *
 * @param {string[]} permisos ya normalizados
 * @param {boolean}  operadorActivo
 * @returns {string[]}
 */
export function permisosEfectivos(permisos, operadorActivo) {
  if (!operadorActivo) return permisos;
  return permisos.filter((p) => !FUERA.has(p));
}
