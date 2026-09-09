"use client";

// UN FILTRO SEGMENTADO DE 3 A 5 ESTADOS, DONDE TODOS SE VEN A LA VEZ.
//
// ── POR QUÉ NO ALCANZABA CON LO QUE HABÍA, MIRADO PIEZA POR PIEZA ─────────
//
// `SunmiSelectorUnidad` nació para "Pack | Un": DOS opciones que se alternan
// seguido. Se lo generalizó para aceptar una lista, y por eso terminó dibujando
// los cuatro tabs del control físico de recepción — pero su forma sigue siendo
// una fila de botones pegados que no envuelve. Con cuatro opciones que además
// llevan número, a 390 px se aplastan hasta cortar el texto. Y su nombre miente:
// el control de la unidad de un producto no es el mismo control que el filtro de
// estado de una lista, aunque hoy se dibujen parecido.
//
// `SunmiChipsFiltro` es la otra mitad del problema y lo dice en su propio
// encabezado: existe para una TAXONOMÍA de muchas opciones —diez categorías— y
// por eso scrollea en horizontal. Eso es correcto cuando no se sabe cuántas hay
// y ninguna es más importante que otra. Acá son cuatro, fijas, y son los estados
// del trabajo: esconder "Todos" detrás de un arrastre obliga a descubrir que
// existe.
//
// `SunmiToggleEstado` es un interruptor booleano, otra cosa.
//
// Así que faltaba: **pocas opciones, todas visibles, sin scroll y sin cortar
// texto**. Eso es esta pieza.
//
// ── QUÉ NO SABE ──────────────────────────────────────────────────────────
//
// Qué se está filtrando. Recibe opciones con clave, texto y un conteo opcional,
// dice cuál está elegida y avisa cuando cambia. No sabe de recepción, de
// productos ni de transferencias: la pantalla arma las opciones. Por eso se
// llama por lo que hace y no por dónde se estrenó.
//
// ── POR QUÉ UNA GRILLA Y NO UNA FILA ─────────────────────────────────────
//
// Una fila con cuatro botones a 390 px da ~90 px por botón, y "Diferencias 0" no
// entra. En dos columnas cada uno tiene ~185 px y entra entero, que es la única
// forma de que el filtro se pueda leer sin abrirlo.
//
// La cantidad de columnas sale de cuántas opciones hay, con primitivas de la
// escala y sin un solo valor arbitrario. De `sm` para arriba entran todas en una
// fila, que es donde el ancho alcanza.

import SunmiButton from "@/components/sunmi/SunmiButton";

/**
 * Cuántas columnas por cantidad de opciones.
 *
 * Es un mapa explícito y no una cuenta: `grid-cols-${n}` no existe para Tailwind,
 * que solo genera las clases que encuentra ESCRITAS. Una clase construida por
 * interpolación no se genera nunca y la grilla se caería a una sola columna sin
 * que nada avise — es la misma trampa que la sonda de cascada documenta.
 */
const COLUMNAS = Object.freeze({
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-5",
});

export default function SunmiFiltroEstado({
  /** `[{ clave, texto, cantidad? }]`. Entre 3 y 5; con menos usá el selector. */
  opciones = [],
  valor = null,
  onCambiar,
  rotulo = null,
  /** Para el `role="group"` cuando no hay rótulo visible. */
  ariaLabel = undefined,
  className = "",
}) {
  if (!Array.isArray(opciones) || opciones.length === 0) return null;

  // Fuera del rango previsto se cae a dos columnas, que entra siempre. No se
  // lanza un error: una pantalla no se rompe por un filtro.
  const columnas = COLUMNAS[opciones.length] || "grid-cols-2";
  const elegida = valor == null ? null : String(valor);

  return (
    <div className={className}>
      {rotulo && <div className="text-sm2 sunmi-text-muted mb-1">{rotulo}</div>}
      <div
        role="group"
        aria-label={ariaLabel || rotulo || undefined}
        className={`grid ${columnas} gap-1.5`}
      >
        {opciones.map((o) => {
          const clave = String(o.clave);
          const activa = clave === elegida;
          return (
            <SunmiButton
              key={clave}
              type="button"
              color={activa ? "primary" : "slate"}
              aria-pressed={activa}
              onClick={() => onCambiar?.(o.clave)}
              // `w-full` para que ocupe su celda entera y los cuatro midan igual;
              // `justify-center` porque un botón de ancho completo con el texto
              // pegado a la izquierda no se lee como un segmento.
              //
              // Y `gap-1` es lo que separa el rótulo del número. NO alcanza con
              // un `{" "}` entre los dos: el botón del kit es `inline-flex`, y un
              // nodo de texto que solo tiene un espacio no genera caja en un
              // contenedor flex — se descarta. Se vio en la captura de 390 px,
              // que decía "Pendientes45" pegado; leyendo el JSX parecía bien.
              className="w-full justify-center gap-1"
            >
              {o.texto}
              {/* El conteo adentro: saber cuántos hay antes de tocarlo es la
                  mitad de para qué sirve el filtro.

                  El `{" "}` es obligatorio y no decorativo: JSX descarta el
                  espacio al principio de una expresión, así que sin él se
                  dibujaba "Pendientes45" pegado. Se vio en la captura de 390 px,
                  no leyendo el código. */}
              {o.cantidad != null && <span className="sunmi-text-muted">{o.cantidad}</span>}
            </SunmiButton>
          );
        })}
      </div>
    </div>
  );
}
