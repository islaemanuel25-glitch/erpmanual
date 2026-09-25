"use client";

// components/sunmi/SunmiSelectorDeOpciones.jsx
//
// POCAS OPCIONES FIJAS, REPARTIÉNDOSE EL ANCHO, UNA SIEMPRE ELEGIDA.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `components/transferencias/ChipsDePeriodo.jsx`, tal cual estaba: los
// mismos botones, las mismas clases, el mismo `aria-pressed`. No se escribió
// adivinando: apareció la segunda pantalla que necesitaba lo mismo —las solapas
// Pendientes / Pagados / Todos de Pagos a proveedores, que en el teléfono tenían
// que verse como los chips de período de Transferencias— y lo que se sacó fue lo
// que no sabe de dominio. `ChipsDePeriodo` sigue existiendo, con sus cuatro
// opciones de período, y ahora dibuja con esta pieza el MISMO marcado.
//
// ── QUÉ LA DISTINGUE DE LAS OTRAS DOS ─────────────────────────────────────
//
//   · `SunmiChipsFiltro` SCROLLEA y puede quedar sin nada elegido: es un filtro
//     por taxonomía, para diez categorías.
//   · `SunmiSolapas` es una `tablist`: cambia de VISTA, con su propio tema de
//     solapa.
//   · Ésta es un selector: pocas opciones, todas a la vista, una siempre
//     elegida, y el resultado se ve abajo en la misma pantalla.
//
// ── SIN `className` ───────────────────────────────────────────────────────
//
// Ninguna de las dos pantallas que la usan le pasa uno, y una pieza del kit que
// recibe clases tiene que negociarlas, no concatenarlas —CLAUDE.md, "Cómo
// negocia una pieza"—. Sin consumidor no hay contra qué probar esa negociación,
// así que no se ofrece hasta que alguien la necesite.

import SunmiButton from "@/components/sunmi/SunmiButton";

/**
 * @param {object} props
 * @param {Array<{clave:string, texto:string}>} props.opciones  en el orden en que se dibujan
 * @param {string} props.valor  la clave elegida
 * @param {(clave:string) => void} props.onCambiar
 * @param {string} props.etiqueta  el `aria-label` del grupo
 * @param {string[]} [props.deshabilitadas]  claves que se dibujan apagadas
 */
export default function SunmiSelectorDeOpciones({
  opciones = [],
  valor,
  onCambiar,
  etiqueta,
  deshabilitadas = [],
}) {
  const apagadas = new Set(deshabilitadas || []);
  return (
    // `gap-1.5` son 5,25 px: el 6 de la especificación ajustado a la escala del
    // proyecto, donde 1rem = 14 px. Por qué se ajusta en vez de entrar al
    // config está en docs/roadmap/rediseno-transferencias-movil.md.
    //
    // El espacio final es a propósito: es lo que dejaba `${className}` vacío en
    // la pieza original, y así el HTML de `ChipsDePeriodo` sale idéntico.
    <div role="group" aria-label={etiqueta} className="flex gap-1.5 ">
      {opciones.map((o) => {
        const activo = o.clave === valor;
        const apagado = apagadas.has(o.clave);
        return (
          <SunmiButton
            key={o.clave}
            type="button"
            color={activo ? "primary" : "slate"}
            aria-pressed={activo}
            // `disabled` solo cuando la pantalla lo pidió. Sin la prop, esto es
            // `false` y el atributo no se emite.
            disabled={apagado || undefined}
            // El motivo, para quien pase el dedo por encima y para el lector de
            // pantalla. Un control apagado sin explicación se lee como roto.
            title={apagado ? "Todavía no disponible" : undefined}
            onClick={apagado ? undefined : () => onCambiar?.(o.clave)}
            // `flex-1 basis-0` y no solo `flex-1`: sin base cero se reparten el
            // sobrante y no el ancho, así que una opción con más letras quedaría
            // más ancha. Todas iguales.
            //
            // El resto son los ejes que `SunmiButton` cede cuando la pantalla
            // los declara: alto, padding, radio, tamaño y peso de letra.
            //
            // `min-h-toque` es el mínimo táctil del proyecto, 44 px. Sin él la
            // tecla heredaba los 36 de `sunmi-btn-parte-alto`, que para un dedo
            // en un Sunmi es un blanco que se falla. Va ACÁ, en la pieza, y no en
            // cada pantalla: el toque es una propiedad del selector.
            //
            // ── EL ANCHO TÁCTIL NO ES EL ANCHO QUE SE VE ─────────────────────
            //
            // Con siete opciones en un teléfono de 360 no entran siete cajas de
            // 44 px VISIBLES con su separación. Lo que sí entra es que cada una
            // se TOQUE en todo su tramo: el `::after` transparente se extiende
            // 3,5 px a cada lado —`-inset-x-1`— y cubre los 5,25 del gap, así que
            // el área táctil de cada tecla es su paso completo (ancho + gap) y no
            // queda franja muerta entre dos. Donde se pisan, gana la de la
            // derecha, que pinta encima; ninguna queda por debajo del paso.
            //
            // No cambia nada de lo que se ve: el pseudo-elemento no tiene fondo,
            // borde ni contenido, y el botón no recorta lo que sale de su caja.
            // Lo sostiene `components/sunmi/selectorDeOpcionesToque.test.mjs`; la
            // medición en un navegador real, a 360, 390 y 412, está en el commit
            // que lo trajo.
            className={`relative after:absolute after:inset-y-0 after:-inset-x-1 flex-1 basis-0 justify-center min-h-toque py-2.5 px-1 rounded-lg text-sm3 ${
              activo ? "font-semibold" : "font-medium"
            }`}
          >
            {o.texto}
          </SunmiButton>
        );
      })}
    </div>
  );
}
