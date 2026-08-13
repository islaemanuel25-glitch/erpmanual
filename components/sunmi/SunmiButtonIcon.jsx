"use client";

// components/sunmi/SunmiButtonIcon.jsx
//
// UN BOTÓN DE SOLO ÍCONO. Y por eso el nombre accesible no es opcional.
//
// ── LO QUE SE ARREGLA ACÁ ──────────────────────────────────────────────────
//
// Aceptaba cuatro props y descartaba en silencio todo lo demás. El candado
// `lib/sunmi/propsDelKit.test.mjs` encontró que las pantallas le venían pasando
// dos cosas que no llegaban:
//
//   · `aria-label` en cuatro lugares. Es un botón SIN TEXTO: sin nombre
//     accesible, un lector de pantalla anuncia "botón" y nada más. Alguien ya
//     había escrito la etiqueta correcta y se perdía.
//   · `disabled` en dos. Uno de ellos es "Quitar", que SACA UN LOCAL DE UN
//     GRUPO: se creía deshabilitado mientras la operación anterior estaba en
//     vuelo y no lo estaba, así que se podía apretar dos veces.
//
// Ahora el resto se junta y se pasa al `<button>`, que es lo que hace que un
// prop nuevo no se vuelva a perder: `title`, `type`, `aria-*`, lo que venga.
//
// ── LO QUE NO SE ARREGLA ACÁ, Y ES A PROPÓSITO ─────────────────────────────
//
// Los tres colores de abajo son colores FIJOS de Tailwind, no tokens del tema:
// en un tema claro se ven igual que en el oscuro. Eso es de la fase 3 y está
// anotado en el roadmap. Tocarlo en esta tanda mezclaría un arreglo de
// comportamiento —un botón que se puede apretar cuando no debería— con un
// cambio de aspecto en todas las pantallas que lo usan.

export default function SunmiButtonIcon({
  icon: Icon,
  color = "amber",
  size = 16,
  onClick = () => {},
  className = "",
  ...resto
}) {
  const colors = {
    amber: "text-amber-300 hover:text-amber-200",
    red: "text-red-400 hover:text-red-300",
    slate: "text-slate-400 hover:text-slate-200",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1 rounded transition ${colors[color]} ${className}`.trim()}
      {...resto}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}
