// El botón del kit.
//
// ── UN COLOR QUE NO EXISTE DEJABA EL BOTÓN INVISIBLE ───────────────────────
//
// La clase salía de concatenar: `sunmi-btn-${color}`. Si ese color no estaba
// definido en el CSS, el botón se quedaba solo con `sunmi-btn-base` —tamaño y
// tipografía— SIN FONDO Y SIN COLOR. O sea: parecía texto suelto.
//
// No es hipotético. `color="accent"` no existe —lo definido es
// `.sunmi-btn-accent-soft`, que es otra clase— y así estaban CINCO botones del
// panel de comprobantes, incluido "Subir fotos", que es la acción principal de
// esa pantalla. Emanuel lo reportó como "parece una etiqueta". También hay
// `neutral`, `green` y `emerald` dados en otras pantallas, y ninguno existe.
//
// Nada lo avisaba: no es un error de compilación ni de tipos, es una clase de
// CSS que simplemente no matchea.
//
// Ahora los colores válidos están enumerados acá y un desconocido cae en
// `slate`, que es visible. Un botón del color equivocado se ve y se corrige; uno
// invisible no se encuentra hasta que alguien no puede apretarlo.
//
// El candado de `SunmiButton.test.mjs` recorre el repo, junta los colores que se
// usan y falla si alguno no está definido en el CSS: así el que agrega uno nuevo
// se entera al correr los candados y no cuando la pantalla llega al mostrador.

// ── Y LA PIEZA NEGOCIA POR EJE, EN VEZ DE CONCATENAR ───────────────────────
//
// Emitía `sunmi-btn-base` entero y le pegaba el `className` de la pantalla
// atrás. Las dos partes tienen especificidad 0-1-0, así que el orden del
// atributo no decide nada: decide cuál se escribió última en la hoja. Y hoy
// gana la pantalla **solo porque `app/globals.css` importa `styles/sunmi.css`
// en la línea 6 y declara `@tailwind utilities` en la 13**.
//
// Eso no es una decisión declarada en ningún lado, es un orden de import. Son
// 391 declaraciones medidas, de 248 consumidores, colgando de dos líneas: el día
// que alguien agregue un `@layer`, mueva esa línea o migre a Tailwind v4, se dan
// vuelta todas en silencio y solo se ve abriendo las pantallas de a una.
//
// Ahora la pieza no pone lo que la pantalla pidió, así que no hay pelea que
// ganar. El reparto —qué sub-clase cede ante qué— está en la tabla
// `PARTES_DEL_BOTON` de `lib/sunmi/claseNegociada.js`, y las sub-clases en
// `styles/sunmi.css`.
//
// `sunmi-btn-base` NO se emite más desde acá, y sigue existiendo en el CSS
// idéntica: hay catorce lugares del repo que la escriben a mano.

import { baseDeBoton } from "@/lib/sunmi/claseNegociada";

/** Los que existen en styles/sunmi.css. Si se agrega uno allá, va acá también. */
export const COLORES = Object.freeze(["cyan", "amber", "red", "slate", "primary", "secondary"]);

const FALLBACK = "slate";

export default function SunmiButton({ color = "cyan", children, className = "", ...props }) {
  const elegido = COLORES.includes(color) ? color : FALLBACK;
  return (
    <button
      {...props}
      className={`${baseDeBoton(className)} sunmi-btn-${elegido} ${className}`}
    >
      {children}
    </button>
  );
}
