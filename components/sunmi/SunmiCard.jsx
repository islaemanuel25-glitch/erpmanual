"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import {
  declaraDifuminado,
  declaraSombra,
  tarjetaQueSobrevive,
} from "@/lib/sunmi/claseNegociada";

// LOS CUATRO EJES CHICOS SE NEGOCIAN; EL PADDING TODAVÍA NO.
//
// De los 147 usos con `className` de primer nivel, 110 declaran alguno de los
// ejes que la pieza pone. La enorme mayoría —108— son del PADDING, y esos quedan
// para una segunda tanda porque cambiarlos se ve en 114 archivos. Los otros
// cuatro ejes suman SEIS declaraciones en TRES pantallas, y son las de acá.
//
// Tres pierden hoy en silencio, y al negociar empiezan a aplicarse:
//   · `sunmi-surface-soft`        en components/turnos/ResumenCierre.jsx
//   · `border border-red-500/30`  en app/modulos/configuracion/mantenimiento
//   · `border border-current/10` + `shadow-lg` en ModalDetalleVenta
//
// Las otras tres son los `!backdrop-blur-0`, que hoy ganan por el `!` y con la
// negociación no lo necesitan. El `!` se saca en su propio paso, y recién después
// de comprobar con una captura que la pantalla no se movía.
//
// Por qué perdían: `@import "sunmi.css"` va ANTES de `@tailwind utilities` en
// `app/globals.css`, así que un `bg-*` de Tailwind le gana a `.sunmi-surface`, y
// entre dos utilidades de la misma familia decide el orden de la hoja y no el del
// atributo. Es exactamente lo que ya había pasado en `SunmiPanel`.

// EL PADDING DICE p-6 PORQUE p-6 ES LO QUE EL NAVEGADOR DIBUJA.
//
// Acá decía `p-3 /* antes p-4 / p-6 */`, y ese comentario NO era un comentario:
// vive adentro de la cadena del `className`, así que el navegador leía `p-3`,
// `p-4` y `p-6` como tres clases de verdad. Las tres existen en la hoja de
// estilos porque el repo las usa en otro lado y tienen la misma especificidad,
// así que ganaba la última que hubiera escrito Tailwind: `p-6`. Con la raíz en
// 14 px eso da 21 px, y son los 21 px que tiene hoy CADA tarjeta del sistema.
//
// El defecto no era el número, era la mentira: el código decía 12 px y el
// navegador dibujaba 21. Cualquiera que midiera algo contra una tarjeta iba a
// tropezar con eso, y de hecho pasó — el `p-0 overflow-hidden` de tres modales
// nunca se aplicó y nadie lo sabía.
//
// Por eso queda `p-6` y NO `p-3`: esto fija lo que hoy se dibuja, no lo aprieta.
// Bajar las tarjetas de 21 a 10.5 px es una decisión de aspecto, se toma
// mirando pantallas y nadie la pidió. Verificado con capturas de una tarjeta de
// modal, una de lista y una de detalle: cero píxeles de diferencia.
// Acepta y reenvía el resto de los props. Hoy nadie le pasa otra cosa que
// `className` y `key` —comprobado sobre los 233 usos, y `key` React nunca lo
// reenvía—, así que esto no enciende nada que estuviera apagado. Existe para que
// la pieza de modal pueda marcar su tarjeta con un atributo estable.
export default function SunmiCard({ children, className = "", ...props }) {
  const { theme } = useSunmiTheme();

  // Fondo y borde vienen juntos en `theme.card`, así que se filtran token por
  // token: una pantalla que declara fondo no tiene por qué perder el borde.
  const tarjeta = tarjetaQueSobrevive(theme.card, className);
  const sombra = declaraSombra(className) ? "" : "shadow-md";
  const difuminado = declaraDifuminado(className) ? "" : "backdrop-blur-sm";

  return (
    <div
      {...props}
      className={`${tarjeta} rounded-xl ${sombra} p-6 ${difuminado} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    >
      {children}
    </div>
  );
}
