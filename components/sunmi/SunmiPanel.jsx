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
  elevado = false,
}) {
  const { theme } = useSunmiTheme();
  const padding = noPadding ? "" : paddingQueSobrevive(PADDING, className);
  // La tarjeta del tema son DOS ejes en una cadena —fondo y borde—, así que se
  // filtra token por token: una pantalla que declara fondo no tiene por qué
  // perder el borde, que no pidió.
  const tarjeta = tarjetaQueSobrevive(theme.card, className);
  // ── ELEVACIÓN, Y POR QUÉ ES UNA PROP Y NO EL DEFAULT ─────────────────────
  //
  // `SunmiPanel` NUNCA dio elevación: medido sobre la pantalla real en los
  // catorce temas, el fondo de un panel está entre 1,00 y 1,15 de contraste
  // contra el fondo de la página, y su borde no llega a 1,5 en doce de ellos. En
  // `sunmiDark` panel y página son literalmente el mismo color. Eso no molestó
  // nunca porque los paneles son pocos, grandes y llenos de contenido que sí
  // contrasta; apilar veinticinco tarjetas iguales en el catálogo del celular
  // fue la primera vez que quedó a la vista.
  //
  // Va como prop y no como default porque encenderlo en todos lados le cambiaría
  // el límite a los paneles de las 28 pantallas que ya existen, y eso es una
  // tanda con su comparación de huellas, no un efecto lateral de ésta.
  //
  // Y CEDE, como el resto del kit: si la pantalla declara su propio `outline`,
  // la pieza no pone el suyo. Sin esto serían dos anillos peleando por el mismo
  // borde, y ganaría el orden de la hoja en vez de la pantalla.
  const declaraOutline = /(^|\s)(outline|\[outline)/.test(String(className));
  const elevacion = elevado && !declaraOutline ? "sunmi-elevado" : "";

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
      className={`${tarjeta} rounded-2xl ${elevacion} ${padding} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    >
      {children}
    </div>
  );
}
