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
//
// ── Y LOS CINCO DEL CONTROL DE STOCK, TERCER CONSUMIDOR ──────────────────
//
// El Control de stock guarda solo, sin botón: al salir del campo, con Enter y
// cuando el lector escanea el próximo producto adentro del campo. Para eso
// necesita los eventos del input y poder ponerle el foco:
//
//   inputRef / onKeyDown / onFocus / onBlur   pasan al input tal cual. `onBlur`
//                     corre DESPUÉS de `normalizaAlSalir`, que sigue igual.
//   conservaLoEscrito el kilo se tipea con coma: "1," es un número a medio
//           = false   escribir, no un 1. Con esto, un decimal a medias pasa tal
//                     cual escrito (con su coma) y el − / + lo entienden. Sin
//                     esto, como siempre: la coma se normaliza al tipear.
//
//   tamano="grande"   el − y el + de 44 × 44 y el número grande: ver TAMANOS.
//   ocupaElAncho      la pieza toma el ancho de su fila y el marco crece.
//           = false
//
// Sin ellos —la caja y recepción— el marcado es el de siempre.
//
// ── Y LOS DOS DE PEDIDOS AL DEPÓSITO, CUARTO CONSUMIDOR ──────────────────
//
//   apagaMenosEnMinimo  el − apagado cuando el número está en el mínimo. Pedidos
//           = false     lo pide en 0: es la señal de que el producto no está en
//                       el pedido, y tocarlo no haría nada. Los demás siguen
//                       como siempre: el − en el mínimo se toca y no resta.
//   deshabilitado       los dos botones y el campo apagados. Pedidos lo pide con
//           = false     el pedido ya enviado: se ve lo pedido y no se cambia.
//
//   minimoComoGuia      el mínimo como GUÍA y no como valor, y lo que se escribe
//           = false     REEMPLAZA lo que había. Pedidos lo pidió (2026-10-22):
//                       con el producto en 0, el 0 quedaba escrito y lo que se
//                       tipeaba se le sumaba —"05", "50"—. Emanuel: "el 0 como
//                       formato inicial podría ser, pero no debe interferir en
//                       el resultado". Con la opción:
//                       · en el mínimo, el campo está VACÍO y el mínimo se ve
//                         como placeholder, en el texto suave del kit;
//                       · al enfocar, el número queda SELECCIONADO entero, así
//                         lo primero que se escribe lo reemplaza: con 9, tocar
//                         y escribir 1 da 1, no 91;
//                       · y si el teclado igual deja el cursor al final —la
//                         selección se pierde—, la primera tecla después de
//                         enfocar reemplaza igual: si lo escrito es lo que
//                         había más algo, queda solo ese algo.
//                       El − y el + no cambian. Qué hacer con un campo vacío
//                       al salir lo decide el consumidor: Pedidos lo toma como
//                       0. `normalizaAlSalir` no se reusa para eso porque al
//                       salir ESCRIBE el mínimo adentro del campo, que es justo
//                       lo que esta opción evita.
//
// El apagado es `disabled:opacity-40`, el mismo de los botones de
// `SunmiPaginador`. Va en la clase SOLO si alguno de los dos está pedido: sin
// ellos el HTML es byte a byte el de antes, que es lo que congela el candado del
// carrito.

import SunmiInput from "@/components/sunmi/SunmiInput";

/**
 * Lo que tenía cada campo al enfocarlo, hasta la primera tecla (con
 * `minimoComoGuia`). Va en un `WeakMap` por elemento y no en un `useRef`: la
 * pieza NO TIENE ESTADO —hay candados que la llaman como función común, y es
 * parte de su contrato—, y lo que se anota es del campo del DOM, no del render.
 */
const ANTES_DE_LA_PRIMERA_TECLA = new WeakMap();

/**
 * Selecciona todo el texto del campo. Dos veces, y es a propósito: en el acto,
 * y otra vez en la tarea siguiente. En Chrome de Android el toque llega como
 * touchend → mousedown (que enfoca) → mouseup → click, todo seguido, y el
 * mouseup puede dejar el cursor donde cayó el dedo y deshacer un `select()`
 * hecho al enfocar. El `setTimeout(…, 0)` corre después de esa ráfaga. Se usa
 * `setSelectionRange` y no `select()` porque es el que respeta un `type="text"`
 * con teclado numérico, que es como se dibuja este campo.
 */
function seleccionarTodo(el) {
  const elegir = () => {
    try {
      if (el && el.ownerDocument?.activeElement === el) el.setSelectionRange(0, el.value.length);
    } catch {
      // Un `type="number"` no deja seleccionar: queda la red de la primera tecla.
    }
  };
  elegir();
  setTimeout(elegir, 0);
}

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
//
// ── `grande`, EL DEL CONTROL DE STOCK ───────────────────────────────────
//
// El Control de stock se cuenta de parado, con el celular en una mano: el − y
// el + van al mínimo que se toca, 44 × 44 —`min-w-toque` y `min-h-toque`, en px
// a propósito—, con el signo más grande, y el campo del mismo alto con el
// número del orden del número de STOCK de la tarjeta (`text-xl2`, 22 px). Los
// otros dos tamaños quedan como estaban, letra por letra.
const TAMANOS = Object.freeze({
  normal: "w-9 h-9",
  compacto: "w-7 h-7",
  grande: "min-w-toque min-h-toque",
});

const LETRA_DEL_BOTON = Object.freeze({ grande: "text-lg" });

/** Lo que el tamaño le agrega al campo del número. */
const CAMPO_DEL_TAMANO = Object.freeze({ grande: "min-h-toque text-xl2" });

const claseBoton = (tamano) =>
  `flex items-center justify-center ${
    TAMANOS[tamano] || TAMANOS.normal
  } rounded pos-control ${LETRA_DEL_BOTON[tamano] || "text-sm"} font-bold transition-colors select-none shrink-0`;

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
  inputRef = undefined,
  onKeyDown = undefined,
  onFocus = undefined,
  onBlur = undefined,
  conservaLoEscrito = false,
  // El control lo pide para que el campo ocupe el ancho de su fila: la pieza
  // toma todo el ancho y el marco crece entre los dos botones, que no se
  // achican nunca. Sin esto, como siempre: lo que mide el contenido.
  ocupaElAncho = false,
  apagaMenosEnMinimo = false,
  deshabilitado = false,
  minimoComoGuia = false,
}) {
  const conApagado = apagaMenosEnMinimo || deshabilitado;
  const claseDelBoton = `${claseBoton(tamano)}${conApagado ? " disabled:opacity-40" : ""}`;
  const enElMinimo = valor === "" || valor == null || Number(String(valor).replace(",", ".")) <= minimo;
  const menosApagado = deshabilitado || (apagaMenosEnMinimo && enElMinimo);
  const delTamano = CAMPO_DEL_TAMANO[tamano] ? `${CAMPO_DEL_TAMANO[tamano]} ` : "";
  // Con decimales o con un paso fraccionario, el campo acepta comas y decide con
  // `parseFloat`. Sin ellos, `parseInt` — que es lo que impide que en el carrito
  // se escriba "2,5" sobre un producto que se vende por unidad.
  const esDecimal = decimales > 0 || paso < 1;

  /** Deja el número en la forma en que se escribe: con los ceros del peso. */
  const comoTexto = (n) => {
    const t = decimales > 0 ? n.toFixed(decimales) : String(n);
    return conservaLoEscrito ? t.replace(".", ",") : t;
  };

  // Un decimal a medio escribir —"1,", "1,2"—, con no más decimales que los
  // pedidos. Solo cuenta con `conservaLoEscrito`.
  const aMedias = new RegExp(`^\\d*[.,]?\\d{0,${Math.max(decimales, 0)}}$`);

  const limitar = (n) => {
    let v = Math.max(minimo, n);
    if (maximo != null && maximo > 0) v = Math.min(maximo, v);
    return v;
  };

  const alEscribir = (e) => {
    let bruto = e.target.value;
    // La primera tecla después de enfocar REEMPLAZA (con `minimoComoGuia`): si
    // la selección se perdió y el teclado escribió atrás de lo que había, queda
    // solo lo nuevo. Si la selección anduvo, lo escrito ya es solo lo nuevo y
    // esto no toca nada.
    const previo = e.target ? ANTES_DE_LA_PRIMERA_TECLA.get(e.target) : undefined;
    if (e.target) ANTES_DE_LA_PRIMERA_TECLA.delete(e.target);
    if (minimoComoGuia && previo && bruto.length > previo.length && bruto.startsWith(previo)) {
      bruto = bruto.slice(previo.length);
    }
    if (bruto === "") {
      onCambiar("");
      return;
    }
    if (conservaLoEscrito && esDecimal) {
      // Se queda como se escribió, coma incluida. Lo que no es un número a medio
      // escribir no entra: el campo no cambia.
      if (aMedias.test(String(bruto))) onCambiar(String(bruto));
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

  const normalizar = () => {
    if (!normalizaAlSalir) return;
    const n = Number(valor);
    if (valor === "" || valor == null || Number.isNaN(n)) {
      onCambiar(comoTexto(minimo));
      return;
    }
    if (n < minimo) onCambiar(comoTexto(minimo));
    else if (!esDecimal) onCambiar(comoTexto(Math.round(n)));
  };
  const alSalir = (e) => {
    if (e?.target) ANTES_DE_LA_PRIMERA_TECLA.delete(e.target);
    normalizar();
    onBlur?.(e);
  };

  // En el mínimo, con la opción, se muestra vacío: el mínimo va de guía.
  const enElMinimoComoGuia =
    minimoComoGuia && valor !== "" && valor != null && Number(String(valor).replace(",", ".")) === minimo;

  // Al enfocar, con la opción: se anota lo que había —para la red de la
  // primera tecla— y se selecciona todo, así lo que se escribe reemplaza.
  const alEnfocar = (e) => {
    const el = e.currentTarget;
    ANTES_DE_LA_PRIMERA_TECLA.set(el, el.value);
    seleccionarTodo(el);
    onFocus?.(e);
  };

  const pasoDe = (dir) => {
    // La coma vale como punto: con `conservaLoEscrito` el valor puede traerla.
    const n = Number(valor === "" ? 0 : String(valor).replace(",", "."));
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
      ref={inputRef}
      // Con `minimoComoGuia`, en el mínimo el VALOR es vacío y el mínimo es
      // solo el placeholder. Sin la opción, como siempre: ni placeholder.
      value={enElMinimoComoGuia ? "" : valor}
      placeholder={minimoComoGuia ? comoTexto(minimo) : undefined}
      onChange={alEscribir}
      onBlur={alSalir}
      onFocus={minimoComoGuia ? alEnfocar : onFocus}
      onKeyDown={onKeyDown}
      disabled={deshabilitado || undefined}
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
            `w-full border-0 px-0 text-center ${delTamano}${claseInput} ${difiere ? "sunmi-text-danger" : ""}`
          : `${delTamano}${claseInput}`
      }
    />
  );

  return (
    <div className={ocupaElAncho ? "flex w-full items-center gap-1" : "flex items-center gap-1"}>
      <button
        type="button"
        className={claseDelBoton}
        aria-label={`Restar uno a ${etiqueta}`}
        disabled={menosApagado || undefined}
        onClick={() => pasoDe(-1)}
      >
        −
      </button>

      {conMarco ? (
        <span
          className={`min-w-0 rounded-lg ${ocupaElAncho ? "flex-1 " : ""}${claseMarco} ${
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
        className={claseDelBoton}
        aria-label={`Sumar uno a ${etiqueta}`}
        disabled={deshabilitado || undefined}
        onClick={() => pasoDe(1)}
      >
        +
      </button>
    </div>
  );
}
