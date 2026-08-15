"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { tarjetaQueSobrevive, paddingQueSobrevive } from "@/lib/sunmi/claseNegociada";

// LA PIEZA NEGOCIA POR EJE EN VEZ DE CONCATENAR.
//
// Antes ponía `${theme.card} rounded-2xl ${padding} ${className}` y dejaba que
// decidiera la hoja de estilos. Dos clases de Tailwind de la misma familia tienen
// la misma especificidad, así que no gana la que está última en el atributo sino
// la que está última en el CSS — o sea, cualquiera.
//
// ── EL PADDING VA PARTIDO, Y NO ES UN DETALLE ──────────────────────────────
//
// El default era `p-4`, que declara los dos ejes en un solo token, así que no se
// puede ceder solo la mitad. Se escribe `px-4 py-4`, que en CSS vale exactamente
// lo mismo, y con eso `paddingQueSobrevive` puede soltar el eje Y y conservar el
// X. Los cuatro consumidores que declaran `py-3` quedan igual que hoy: 10,5 px
// arriba y 14 px a los costados, medidos.
const PADDING = "px-4 py-4";

export default function SunmiPanel({
  children,
  className = "",
  noPadding = false,
}) {
  const { theme } = useSunmiTheme();
  const padding = noPadding ? "" : paddingQueSobrevive(PADDING, className);
  // La tarjeta del tema son DOS ejes en una cadena —fondo y borde—, así que se
  // filtra token por token: una pantalla que declara fondo no tiene por qué
  // perder el borde, que no pidió.
  const tarjeta = tarjetaQueSobrevive(theme.card, className);

  return (
    <div
      // MARCA INERTE PARA EL ARNÉS DE CAPTURAS. No dibuja nada: es un atributo
      // para que `--elemento` pueda recortar a cada panel y comparar antes contra
      // después panel por panel.
      //
      // ── POR QUÉ HIZO FALTA ────────────────────────────────────────────────
      //
      // Tres de las cinco pantallas que usan la pieza tienen un SCROLLER INTERNO:
      // la página mide 900 px y el contenido scrollea adentro, así que subir
      // `--alto-captura` no captura más —se comprobó con 1800 y el recorte siguió
      // en 900—. `ganancia` se corta 726 px y `reportes-stock` 51.680. Y son
      // justo las que más paneles tienen: 7 y 12.
      //
      // Sin esto, "cero píxeles" solo podría afirmarse sobre la banda visible.
      //
      // El selector NO puede ser posicional ni depender de una clase que la
      // migración vaya a cambiar —`sunmi-surface` se va a sacar de las 28
      // declaraciones—, así que tiene que ser un atributo propio que valga igual
      // antes y después. Es el mismo recurso que `data-sunmi-modal="tarjeta"`.
      data-sunmi-panel=""
      className={`${tarjeta} rounded-2xl ${padding} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    >
      {children}
    </div>
  );
}
