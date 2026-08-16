"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import {
  declaraDifuminado,
  declaraSombra,
  paddingQueSobrevive,
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

// EL PADDING SE NEGOCIA ENTERO, Y ESO MUEVE 86 TARJETAS A PROPÓSITO.
//
// Son 108 las declaraciones de padding sobre `SunmiCard`, y hasta acá ninguna
// se aplicaba salvo las siete tablas de la tanda anterior: la pieza concatenaba
// su `p-6`, y entre dos utilidades de la misma familia decide el orden de la
// hoja de Tailwind y no el del atributo.
//
// El reparto de las 108, para saber qué se movió y qué no:
//
//   ·  86  piden menos aire y NO se aplicaban a ningún ancho. Estas cambian, y
//          ese es el arreglo: 49 `p-3` pasan de 21 a 10.5 px, 30 `p-4` de 21 a
//          14, y el resto —`p-5`, `p-2`, `p-2.5`, `p-4 py-8`— a lo suyo.
//   ·   9  piden `p-6`, que es exactamente lo que la pieza dibuja. No mueven un
//          píxel: antes ganaba el de la pieza, ahora gana el de la pantalla, y
//          los dos son 21 px.
//   ·   4  traen variante `lg:` y estaban A MEDIAS: ya ganaban por encima de
//          1024 px y perdían por debajo. Dejan de estar a medias.
//   ·   1  era `!p-3` y ganaba por el `!`. El `!` se sacó, y se sacó DESPUÉS de
//          comprobar con una captura que sin él la pantalla quedaba igual.
//   ·   8  piden cero, y son las de la tanda anterior. Siguen igual.
//
// EL RELLENO SALE DE `paddingQueSobrevive`, QUE YA EXISTÍA.
//
// Es la misma función con la que la tabla negocia el padding de sus celdas, y
// hace lo que hay que hacer: `p-6` sobrevive salvo que la pantalla declare LOS
// DOS ejes. Una que declarara solo `px-2` conserva el vertical de la pieza, en
// vez de perder los cuatro lados por declarar uno.
//
// Y para una tarjeta sin `className` la cadena que sale es carácter por carácter
// la de antes. Eso es lo que se exige a cero píxeles en las pantallas de
// control: las que usan la pieza sin declarar nada son las que hablan por las
// 114.
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
  const relleno = paddingQueSobrevive("p-6", className);

  return (
    <div
      {...props}
      className={`${tarjeta} rounded-xl ${sombra} ${relleno} ${difuminado} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    >
      {children}
    </div>
  );
}
