// lib/integraciones/azul-chat/capacidades.js
//
// EL CATÁLOGO CERRADO DE LO QUE AZUL CHAT PUEDE PEDIRLE AL ERP.
//
// Azul Chat no ejecuta endpoints del ERP, no manda SQL ni consultas Prisma y no
// usa sesiones de usuario. Pide una CAPACIDAD por su nombre, y una capacidad es
// una de las que están escritas acá — nada más. Lo que no está en esta lista no
// existe para la integración, aunque haya una ruta del ERP que lo haga.
//
// Cada capacidad declara:
//   · `permisos`: los permisos del ERP que el HUMANO delegante tiene que tener
//     HOY en su rol (alcanza con uno, como `checkPerm`). Son los mismos que pide
//     la pantalla del ERP que muestra ese dato: la integración no puede ver más
//     que la persona en su propio ERP.
//   · `soloLectura`: V1 es 100 % lectura. Un `false` acá es un cambio de
//     arquitectura, no de catálogo, y el candado lo frena.
//   · `parametros`: las ÚNICAS claves que acepta en `parametros`. Cualquier otra
//     se rechaza antes de ejecutar.
//
// Congelado: nadie puede agregar una capacidad en tiempo de ejecución.

export const CAPACIDADES = Object.freeze({
  ventas_resumen: Object.freeze({
    // El mismo permiso que `app/api/reportes-ventas/general/route.js`, que es la
    // fuente canónica de este número.
    permisos: Object.freeze(["reportes.ver"]),
    soloLectura: true,
    parametros: Object.freeze(["periodo"]),
  }),
});

/**
 * La definición de una capacidad del catálogo, o `null`.
 *
 * Mira solo claves PROPIAS: un nombre como `constructor`, `toString` o
 * `__proto__` existe en cualquier objeto por herencia, y aceptarlo sería abrir
 * el catálogo por la puerta de atrás.
 *
 * @param {unknown} nombre
 */
export function capacidadDelCatalogo(nombre) {
  if (typeof nombre !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(CAPACIDADES, nombre)) return null;
  return CAPACIDADES[nombre];
}
