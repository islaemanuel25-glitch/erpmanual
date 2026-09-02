"use client";

// UNA FILA DE TABLA.
//
// ── EL TONO Y EL HOVER NO COMPITEN ──────────────────────────────────────────
//
// Antes el hover se aplicaba siempre como `background-color`, y cualquier
// pantalla que quisiera pintar una fila según su estado —guardada, con error,
// editada, seleccionada— tenía que ganarle a esa clase. La única forma era
// `!important`, y el precio era perder el hover en esa fila y escribir un color
// fijo fuera del sistema de themes.
//
// Ahora el tono va en `background-color` y el hover en `background-image`. Son
// dos propiedades distintas: el hover se pinta ENCIMA del tono en vez de
// reemplazarlo. Nadie necesita `!important` y la fila teñida sigue reaccionando
// al mouse. Los colores salen de `--pos-*`, así que acompañan al theme.
//
// ── QUÉ COLOR Y CUÁNTO SON DOS PREGUNTAS ────────────────────────────────────
//
// `tono` dice qué estado tiene la fila y `intensidad` cuánto se nota. Están
// separados porque son decisiones independientes: la misma fila "con cambios sin
// guardar" se pinta suave en una pantalla que muestra veinte a la vez y fuerte
// en la que el usuario acaba de elegir. Con un solo eje habría que inventar un
// valor por combinación —"atencion-fuerte", "ok-fuerte", …— y cada pantalla
// nueva agregaría el suyo.
//
// ── COMPATIBILIDAD ──────────────────────────────────────────────────────────
//
// Sin `tono` la fila produce exactamente las mismas clases que antes. Las
// pantallas que ya existen no cambian ni un píxel.

import { claseDeFila } from "@/lib/sunmi/claseNegociada";

// LA PIEZA NEGOCIA POR EJE EN VEZ DE CONCATENAR.
//
// Antes juntaba `text-[12px] ${cursor} ${fondo} ${className}` y dejaba decidir a
// la hoja de estilos. Hoy no se nota —las cinco declaraciones de sus consumidores
// piden lo mismo con el mismo valor, o piden un eje que la pieza no toca— pero
// son clases de la misma familia conviviendo, que es la misma bomba que estalló
// en `SunmiPanel`: ahí 28 declaraciones nunca se aplicaron y nadie lo supo.
//
// Los cuatro ejes que la pieza pone, y quién los declara hoy:
//   text-[12px]      tamaño de letra   — nadie
//   cursor-pointer   cursor            — tres consumidores, con el mismo valor
//   hover:bg-…       fondo del hover   — dos, con el mismo valor
//   bg-… / sunmi-fila fondo            — nadie
//
// ── LA EXPRESIÓN NO VIVE ACÁ, Y ESO ES EL ARREGLO ──────────────────────────
//
// Hasta hoy este archivo llamaba a `declaraTamanoDeLetra` directo y armaba la
// cadena él mismo. Era el único de los cuatro lectores del predicado que no se
// veía abriendo `claseNegociada.js`, así que quien fuera a cambiar el predicado
// tenía a los otros tres a la vista y a éste no. La expresión se mudó entera a
// `claseDeFila` y la pieza la invoca: un solo lugar, y el candado ejerce lo que
// esto corre de verdad en vez de una copia a mano.

export default function SunmiTableRow({
  children,
  selected = false,
  onClick,
  className = "",
  /** "ok" | "alerta" | "atencion" | "apagado" | null */
  tono = null,
  /** "ambiente" | "fuerte". Ambiente es lo de siempre. */
  intensidad = "ambiente",
  // ── EL ANCLA, CON LA MISMA FORMA QUE LA DE LA TARJETA DEL CELULAR ────────
  //
  // `data-ancla` es cómo se encuentra una fila para volver al mismo lugar
  // después de editar. Es el MISMO atributo que dibuja `SunmiProductoCard`, y
  // eso es lo que permite que la restauración sea una sola función para las dos
  // superficies en vez de una por cada una.
  //
  // Sin esto, escritorio tendría que buscarse de otra forma —por índice de fila,
  // que es justo lo que no sirve— o quedarse sin restaurar.
  ancla = null,
  /** Marca de lector de pantalla. La visual la pone quien dibuja la celda. */
  destacada = false,
}) {
  return (
    <tr
      data-ancla={ancla ?? undefined}
      aria-current={destacada ? "true" : undefined}
      // MARCA INERTE PARA EL ARNÉS. No dibuja nada: deja recortar fila por fila
      // en vez de fotografiar pantallas enteras. Con 29 archivos consumidores es
      // lo único que vuelve manejable la verificación.
      //
      // No puede ser una clase: la migración toca justamente las clases, y el
      // selector tiene que encontrar la misma cosa antes y después. Es el mismo
      // recurso que `data-sunmi-panel` y `data-sunmi-modal="tarjeta"`.
      data-sunmi-row=""
      onClick={onClick}
      className={claseDeFila({ pedido: className, tono, intensidad, selected, onClick: !!onClick })}
    >
      {children}
    </tr>
  );
}
