// lib/semanaOperativa/rutas.js
//
// DÓNDE SE CONFIGURA LA SEMANA OPERATIVA, Y QUIÉN PUEDE.
//
// La ruta la nombran el menú, la portada de Configuración, la redirección de la
// pantalla vieja de Transferencias y el atajo de la vista del local. Escrita a
// mano en cada uno, el día que cambie alguno queda apuntando a una pantalla que
// ya no está.
//
// Vivía en `components/transferencias/corteDeSemana.js`, cuando la semana era un
// acuerdo de Transferencias. Ya no lo es: es de la ubicación, y su pantalla está
// en Configuración.

import { PERMISO_SEMANA_OPERATIVA } from "./semanaOperativa.js";

export const RUTA_SEMANA_OPERATIVA = "/modulos/configuracion/semana-operativa";

/** A dónde vuelve el "Volver" de la pantalla: la portada de Configuración. */
export const RUTA_CONFIGURACION = "/modulos/configuracion";

/** La pantalla vieja de Transferencias, que ahora solo redirige. */
export const RUTA_VIEJA_CORTE_DE_SEMANA = "/modulos/transferencias/corte-de-semana";

/**
 * ¿Esta persona puede configurar la semana de su ubicación?
 *
 * El comodín `*` es el administrador, como en el resto de las pantallas. No hay
 * roles por nombre: el permiso se da a mano. El servidor vuelve a preguntar; acá
 * se decide qué se DIBUJA.
 */
export function puedeConfigurarLaSemana(permisos = []) {
  const lista = Array.isArray(permisos) ? permisos : [];
  return lista.includes("*") || lista.includes(PERMISO_SEMANA_OPERATIVA);
}
