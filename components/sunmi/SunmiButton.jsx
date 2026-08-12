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

/** Los que existen en styles/sunmi.css. Si se agrega uno allá, va acá también. */
export const COLORES = Object.freeze(["cyan", "amber", "red", "slate", "primary", "secondary"]);

const FALLBACK = "slate";

export default function SunmiButton({ color = "cyan", children, className = "", ...props }) {
  const elegido = COLORES.includes(color) ? color : FALLBACK;
  return (
    <button
      {...props}
      className={`sunmi-btn-base sunmi-btn-${elegido} ${className}`}
    >
      {children}
    </button>
  );
}
