"use client";

// UN CAMPO DE CANTIDAD CON − Y +, PARA TODO EL ERP.
//
// ── DE DÓNDE SALIÓ, Y POR QUÉ EXISTE ─────────────────────────────────────
//
// Salió de `CantidadStepper`, que vivía INLINE en
// `components/pos-ventas/CarritoVenta.jsx` y no estaba exportado. El POS lo tiene
// resuelto desde hace mucho y se ve bien; recepción venía rediseñando el suyo
// desde cero hace tres tandas sin saber que existía.
//
// Dos controles de cantidad distintos en el mismo ERP se separan el día que uno
// cambia. Por eso esto es una pieza del kit y no una copia.
//
// ── LO QUE SE CONSERVÓ DE CADA LADO ──────────────────────────────────────
//
// Del POS, que es lo que lo hace verse bien: los botones con FONDO RELLENO
// —`pos-control`—, el número centrado en su propia caja, y el manejo de decimales
// con la coma normalizada a punto, que el POS ya tenía resuelto para vender por
// kilo.
//
// De recepción: el mínimo configurable, los ceros a la derecha del peso, el borde
// en danger sobre la caja del número, y el botón un poco más grande.
//
// ── LOS TRECE PROPS, Y DE QUÉ CONSUMIDOR SALE CADA UNO ───────────────────
//
// Ninguno está escrito adivinando: los trece salen de una de las dos pantallas
// que la usan HOY, que es la regla del kit. Son trece porque los dos consumidores
// difieren en trece cosas reales, no porque se haya previsto un tercero.
//
//   valor             el contenido del campo, como string. El estado del
//                     formulario es lo que está escrito, no un número.
//   onCambiar         recibe un STRING. `""` es "no escribió nada" y no es lo
//                     mismo que "0" — en recepción esa diferencia decide si la
//                     línea se guarda como no revisada.
//   etiqueta          arma los tres `aria-label`: el del campo y el de los dos
//                     botones. Es lo que el arnés usa para tocarlos.
//   minimo    = 0     el piso del −. RECEPCIÓN pasa 0: "no llegó nada" es una
//                     respuesta válida. EL POS pasa 1: una línea de carrito con
//                     cantidad 0 no significa nada.
//   maximo    = null  el tope del +. EL POS pasa el stock disponible; recepción
//                     no tiene tope —puede llegar más de lo que dice el remito—.
//   paso      = 1     cuánto suma y resta. EL POS pasa 0.001 para vender por
//                     kilo; recepción usa 1 incluso en KG, porque ahí se tipea.
//   decimales = 0     ceros a la derecha que se CONSERVAN. RECEPCIÓN pasa 3 en
//                     peso: la balanza pesa en gramos y 0,730 no es 0,73.
//   normalizaAlSalir  al perder el foco, un campo vacío vuelve al mínimo. EL POS
//           = false   lo pide; RECEPCIÓN NO puede tenerlo, porque ahí `""` se
//                     guarda como `null` —no revisada— y un 0 se guarda como 0.
//   difiere  = false  pinta el número y SU MARCO en danger. Es de recepción: dice
//                     "este número no coincide con el remito". El borde va en la
//                     caja del número y no en los botones, para no decir "estos
//                     controles están mal".
//   tipo      = text  `text` deja tipear la coma y el componente la normaliza —es
//                     lo que el POS necesita para vender por kilo—. RECEPCIÓN pasa
//                     `number`, que es lo que tenía.
//   conMarco  = true  el borde va en un envoltorio alrededor del número
//                     —recepción— o en el propio input —el carrito—. Es lo que
//                     permite que sacar la pieza del carrito no le mueva la caja.
//   claseMarco = ""   el ancho del envoltorio. Recepción lo deja crecer con
//                     `flex-1` entre los dos botones.
//   claseInput = ""   lo del input: el ancho en el carrito —vive en una celda de
//                     tabla— y el tamaño de letra en recepción, que pide 18 px.
//   tamano            el botón. RECEPCIÓN usa `normal` y EL CARRITO `compacto`, y
//     = "normal"      esa diferencia es a propósito: sacar la pieza del carrito no
//                     puede moverlo ni un píxel, y hoy mide `w-7`. La auditoría de
//                     UX del POS ya dice que es "aceptable pero justo"; subirlo ahí
//                     es una decisión de esa pantalla, no un efecto de esta
//                     mudanza.

import SunmiInput from "@/components/sunmi/SunmiInput";

/**
 * El botón. `pos-control` es lo que le da el fondo relleno que hace que se lea
 * como un control y no como un texto tocable.
 */
// ── LOS DOS TAMAÑOS SALEN DE LA ESCALA, Y ESTÁN MEDIDOS ─────────────────
//
// El pedido decía 30 px. `w-[30px]` es una medida mágica y el trinquete la
// atrapó con razón: la escala de Tailwind no tiene 30 y escribirlo a mano deja un
// número que nadie va a encontrar el día que el diseño lo mueva.
//
// Y OJO CON LA ESCALA: en este proyecto `1rem` son 14 px, no 16 —lo mide la
// sonda de cascada—, así que `w-8` da 28 y no 32. Medido en el navegador, no
// deducido: la primera versión puso `w-8` creyendo que eran 32 y el arnés informó
// 28, por debajo de los 30 pedidos.
//
// `w-9` son 2,25rem = 31,5 px, que es el escalón que pasa los 30. `w-7` son los
// del carrito y no se tocan.
const TAMANOS = Object.freeze({
  normal: "w-9 h-9",
  compacto: "w-7 h-7",
});

const claseBoton = (tamano) =>
  `flex items-center justify-center ${
    TAMANOS[tamano] || TAMANOS.normal
  } rounded pos-control text-sm font-bold transition-colors select-none shrink-0`;

export default function SunmiCampoCantidad({
  valor,
  onCambiar,
  etiqueta,
  minimo = 0,
  maximo = null,
  paso = 1,
  decimales = 0,
  normalizaAlSalir = false,
  difiere = false,
  tipo = "text",
  conMarco = true,
  claseMarco = "",
  claseInput = "",
  tamano = "normal",
}) {
  // Con decimales o con un paso fraccionario, el campo acepta comas y decide con
  // `parseFloat`. Sin ellos, `parseInt` — que es lo que impide que en el carrito
  // se escriba "2,5" sobre un producto que se vende por unidad.
  const esDecimal = decimales > 0 || paso < 1;

  /** Deja el número en la forma en que se escribe: con los ceros del peso. */
  const comoTexto = (n) => (decimales > 0 ? n.toFixed(decimales) : String(n));

  const limitar = (n) => {
    let v = Math.max(minimo, n);
    if (maximo != null && maximo > 0) v = Math.min(maximo, v);
    return v;
  };

  const alEscribir = (e) => {
    const bruto = e.target.value;
    if (bruto === "") {
      onCambiar("");
      return;
    }
    // La coma a punto: el POS ya lo tenía resuelto para vender por kilo, y es la
    // diferencia entre que un cajero pueda tipear 1,5 y que no.
    const n = esDecimal ? parseFloat(String(bruto).replace(",", ".")) : parseInt(bruto, 10);
    if (Number.isNaN(n)) {
      onCambiar("");
      return;
    }
    onCambiar(String(Math.max(minimo, n)));
  };

  const alSalir = () => {
    if (!normalizaAlSalir) return;
    const n = Number(valor);
    if (valor === "" || valor == null || Number.isNaN(n)) {
      onCambiar(comoTexto(minimo));
      return;
    }
    if (n < minimo) onCambiar(comoTexto(minimo));
    else if (!esDecimal) onCambiar(comoTexto(Math.round(n)));
  };

  const pasoDe = (dir) => {
    const n = Number(valor === "" ? 0 : valor);
    const base = Number.isFinite(n) ? n : 0;
    let siguiente = base + dir * paso;
    // Tres decimales de redondeo: sin esto, sumar 0,001 doce veces deja
    // 0,012000000000000002 y el campo lo muestra.
    if (esDecimal) siguiente = Math.round(siguiente * 1000) / 1000;
    onCambiar(comoTexto(limitar(siguiente)));
  };

  // ── EL MARCO ES OPCIONAL, Y ES LA CLAVE DE QUE EL POS NO SE MUEVA ──────
  //
  // Recepción pone el borde en un ENVOLTORIO que rodea solo al número, para que
  // la señal de diferencia diga "este número no coincide" y no "estos controles
  // están mal". El carrito del POS lo pone en el INPUT, con su padding.
  //
  // Esa diferencia no es estilo: es estructura. Forzar el envoltorio en el POS le
  // movería el borde de lugar y le sacaría el padding lateral — o sea, movería la
  // caja. Y el pedido fue explícito: antes de romper el carrito, el carrito se
  // queda como está.
  //
  // Con `conMarco={false}` el marcado del POS queda IDÉNTICO al de hoy, y eso no
  // es una opinión: hay un candado que monta las dos versiones y compara el HTML
  // byte a byte —`sunmiCampoCantidad.test.mjs`—.
  const campo = (
    <SunmiInput
      // ── EL TIPO ES DEL CONSUMIDOR, Y NO ES UN DETALLE ────────────────────
      //
      // El carrito usa `text` a propósito: con `inputMode` decimal el cajero
      // puede tipear "1,5" con coma, que es como se escribe acá, y el componente
      // la normaliza a punto. Con `number` el navegador rechaza la coma.
      //
      // Recepción usa `number`, que es lo que tenía. Unificarla en `text` habría
      // sido un cambio de comportamiento —y además invalidaba treinta candados y
      // el arnés, que buscan el campo por `input[type="number"]`—. Lo primero es
      // una decisión de esa pantalla; lo segundo, la señal de que no era gratis.
      type={tipo}
      inputMode={esDecimal ? "decimal" : "numeric"}
      value={valor}
      onChange={alEscribir}
      onBlur={alSalir}
      aria-label={etiqueta}
      className={
        conMarco
          ? // `border-0` y `px-0`: el marco y la separación son del envoltorio. Si
            // el input trajera los suyos se verían dos cajas, una adentro de la
            // otra, y el padding se comería los dígitos.
            //
            // `claseInput` entra igual en esta rama: el tamaño de letra del número
            // es del consumidor. Recepción pide 18 px —`text-lg`— y sin eso el
            // número queda en el tamaño heredado: medido, el ancho de un dígito
            // bajaba de 9,7 a 8 px.
            `w-full border-0 px-0 text-center ${claseInput} ${difiere ? "sunmi-text-danger" : ""}`
          : claseInput
      }
    />
  );

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={claseBoton(tamano)}
        aria-label={`Restar uno a ${etiqueta}`}
        onClick={() => pasoDe(-1)}
      >
        −
      </button>

      {conMarco ? (
        <span
          className={`min-w-0 rounded-lg ${claseMarco} ${
            difiere ? "border-2 sunmi-border-danger" : "border sunmi-divider"
          }`}
        >
          {campo}
        </span>
      ) : (
        campo
      )}

      <button
        type="button"
        className={claseBoton(tamano)}
        aria-label={`Sumar uno a ${etiqueta}`}
        onClick={() => pasoDe(1)}
      >
        +
      </button>
    </div>
  );
}
