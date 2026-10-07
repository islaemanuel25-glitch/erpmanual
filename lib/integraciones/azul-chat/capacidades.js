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
//   · `pideLocal`: si la capacidad es sobre UN local. Con `true` el cuerpo trae
//     `alcance: { grupoId, localId }` y la puerta comprueba que ese local esté en
//     el alcance de la persona. Con `false` el cuerpo NO puede traer `alcance`:
//     lo que la capacidad mira lo decide el ERP, no lo elige quien pregunta.
//   · `anunciaCapacidades` (opcional, solo `mi_alcance`): la autorización le
//     entrega a la capacidad, ya decidido, qué capacidades SOBRE UN LOCAL puede
//     usar la persona hoy (`capacidadesSobreUnLocal`, en autorizacion.js). Se
//     calcula recorriendo ESTE catálogo con la misma regla de permiso de la
//     puerta: una capacidad nueva con `pideLocal` se anuncia sola, sin tocar
//     `mi_alcance`.
//
// Congelado: nadie puede agregar una capacidad en tiempo de ejecución.

export const CAPACIDADES = Object.freeze({
  ventas_resumen: Object.freeze({
    // El mismo permiso que `app/api/reportes-ventas/general/route.js`, que es la
    // fuente canónica de este número.
    permisos: Object.freeze(["reportes.ver"]),
    soloLectura: true,
    parametros: Object.freeze(["periodo"]),
    pideLocal: true,
  }),
  mi_alcance: Object.freeze({
    // SIN permiso propio, a propósito: devuelve el nombre de la persona y los
    // locales de su alcance territorial, que es lo que el ERP le muestra a
    // cualquiera con sesión — `contexto-activo/get` y `grupos/opciones` solo
    // piden estar autenticado. No habilita nada: cada capacidad sobre un local
    // vuelve a pedir su permiso y su alcance.
    permisos: Object.freeze([]),
    soloLectura: true,
    parametros: Object.freeze([]),
    pideLocal: false,
    // Cada local que lista lleva las capacidades que la persona puede usar ahí
    // hoy, para que Azul Chat no tenga que adivinarlas ni probarlas una por una.
    anunciaCapacidades: true,
  }),
  transferencias_eventos: Object.freeze({
    // Las transferencias que el local RECIBIÓ, como eventos con cursor
    // (`transferenciasEventos.js`). El mismo permiso que las pantallas del ERP
    // que muestran transferencias —`listar`, `detalle`, `tablero`,
    // `por-destino`—; `transferencias.recibir` es para operar la recepción, no
    // para verla.
    permisos: Object.freeze(["transferencias.ver"]),
    soloLectura: true,
    parametros: Object.freeze(["desde", "limite"]),
    pideLocal: true,
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
