"use client";

// components/sunmi/SunmiModalLayout.jsx
//
// LAS CUATRO FORMAS QUE EL SISTEMA USA HOY, Y NINGUNA MÁS.
//
// Hasta acá solo sabía centrar, y por eso había pantallas que no lo podían usar
// y se armaban la capa a mano. Hay 54 capas de modal escritas a mano en el repo,
// medidas: 47 centradas, 4 hoja inferior, 3 cajón lateral, y de esas 47 hay dos
// que además cambian de forma con el ancho.
//
// Las cuatro salen de pantallas que HOY funcionan, y ninguna se inventó:
//
//   centrado         lo que este componente ya hacía
//   hoja             el carrito del pedido en el teléfono (CarritoPedido)
//   cajon            el mismo carrito, en pantalla grande
//   hoja-o-centrado  los dos modales de caja: pegado abajo en el teléfono y
//                    centrado de `sm` para arriba. Es UNA forma, no dos usos:
//                    es lo que esas pantallas hacen hoy y funcionan.
//
// No hay un sistema de puntos de corte configurables. El único corte que existe
// en el repo es ese `sm`, así que es el único que la pieza sabe.
//
// ── EL VELO ES UN BOTÓN, y eso deja de ser privilegio de una pantalla ───────
//
// El carrito ya lo tenía bien: su velo es un `<button type="button">` con
// `aria-label="Cerrar"`, así que se puede cerrar con el teclado y un lector de
// pantalla lo anuncia. Acá era un `<div aria-hidden>` con `onClick`, que para
// quien no usa mouse no existe. Se lleva al kit, que es para lo que está.
//
// Cuando el velo NO cierra —`destructivo`— vuelve a ser un `<div aria-hidden>`:
// un botón que no hace nada es peor que ninguno, porque recibe el foco y no
// contesta.
//
// ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
//
// La tarjeta, el encabezado, el botón de cerrar y el pie quedan como estaban:
// los cuatro usos actuales tienen que verse idénticos. Las formas nuevas cambian
// dónde se para el panel, no de qué está hecho.

import { createPortal } from "react-dom";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { declaraAncho } from "@/lib/sunmi/claseAncho";
import { declaraAnchoMaximo } from "@/lib/sunmi/claseNegociada";

// EL COLOR Y LA OPACIDAD DEL VELO, en un solo lugar y no repetidos en las dos
// ramas —la que cierra al tocar y la que no—. Estaban escritos dos veces, y dos
// copias de un color se separan el día que alguien toca una.
//
// Los dos números salen de MEDIR, no de elegir: barrido de los catorce temas
// sobre `/modulos/categorias`, con los dos ejes que el velo tiene que cumplir.
// El detalle está en `docs/roadmap/kit-sunmi-fases.md`.
export const COLOR_VELO = "color-mix(in srgb, black 70%, var(--app-bg))";
export const OPACIDAD_VELO = 0.92;

/**
 * Dónde se para el panel, por forma. La capa y el panel se deciden juntos.
 *
 * ── EL REDONDEO LO DERIVA LA FORMA, Y NO ES UNA PREFERENCIA DE PANTALLA ────
 *
 * Una hoja pegada al borde de abajo con las esquinas de abajo redondeadas se ve
 * ROTA: quedan dos medialunas de fondo entre la tarjeta y el borde de la
 * pantalla. Eso no es gusto, es parte de lo que la forma significa.
 *
 * Por eso lo pone la forma y no la pantalla. Si se dejara declarar, la próxima
 * que use `hoja` y se olvide nace mal, y nadie lo va a ver hasta que alguien
 * abra esa pantalla en un teléfono.
 *
 * El `!` no es decoración: `SunmiCard` CONCATENA su `rounded-xl` en vez de
 * negociarlo, así que sin `!important` gana la que Tailwind haya escrito última
 * en la hoja de estilos. Está anotado como deuda en el roadmap; el día que la
 * tarjeta negocie, estos `!` se sacan.
 */
//
// ── Y LA FORMA DECIDE DÓNDE CAE EL ALTO ────────────────────────────────────
//
// Lo que una pantalla quiere declarar es "este modal no pasa de tanto". Que eso
// se implemente topando el CUERPO o topando la TARJETA es una consecuencia de la
// forma, no una decisión de la pantalla:
//
//   centrado  el tope va al cuerpo; la tarjeta crece con su contenido.
//   hoja      el tope va a la TARJETA y el cuerpo crece contra él con
//             `flex-1 min-h-0`. Si fuera al revés, la tarjeta mediría el tope
//             MÁS el encabezado y el pie, y se pasaría de la pantalla.
//   cajon     ninguno: su `h-full` ya fija el alto.
//
// Es el mismo patrón que el `z`: UN solo valor del que la pieza deriva los
// destinos. Dos parámetros sueltos dejarían ponerlos incoherentes sin que nadie
// se entere.
//
// ── LA COLUMNA TAMBIÉN ES DE LA FORMA ──────────────────────────────────────
//
// Una hoja cuyo pie se va con el scroll está rota: los botones de confirmar
// tienen que quedar a la vista mientras el cuerpo se recorre. Por eso el
// `flex flex-col` va acá y no en la pantalla, igual que ya lo lleva `cajon` por
// exactamente la misma razón.
const FORMAS = {
  // ── EL TOPE DE `centrado` PASÓ AL CUERPO ➜ A LA TARJETA, Y CON MOTIVO ─────
  //
  // Decía `altoVa: "cuerpo"`. Lo cambió la tabla de declaraciones: de los cinco
  // modales que declaran `alto`, **los cinco lo mandan a la TARJETA** —cuatro con
  // `altoVa="tarjeta"` y `ModalCambioPrevio` por su forma— y **ninguno al
  // cuerpo**. Un destino que cero consumidores eligen no es un default.
  //
  // Y no es solo estadística: con el tope en el cuerpo, la tarjeta mide el tope
  // MÁS el encabezado y el pie. Con el default nuevo de 90vh eso se pasaba de la
  // pantalla — medido, `ModalRol` daba 926 px en una ventana de 900 y arrancaba
  // en y=−13, con el título y el botón de cerrar afuera. Es exactamente lo que el
  // comentario de `hoja` ya advertía, y le pasaba igual a `centrado`.
  centrado: { capa: "flex items-center justify-center p-3", panel: "", tarjeta: "", altoVa: "tarjeta" },
  // Pegada abajo: se redondea arriba y queda recta abajo.
  hoja: {
    capa: "flex flex-col justify-end",
    panel: "",
    tarjeta: "!rounded-t-2xl !rounded-b-none flex flex-col",
    altoVa: "tarjeta",
  },
  // El cajón ocupa el alto entero: si la tarjeta quedara del alto de su
  // contenido, el panel se vería pegado arriba y no como un cajón. Se midió
  // dibujándolo — sin esto la tarjeta terminaba a los 105 píxeles.
  //
  // Su redondeo estaba pendiente a propósito, para no adivinarlo. CONTESTADO Y
  // MEDIDO el 2026-08-13 mirando `CarritoPedido`, que es de donde salió la
  // forma: su panel no tiene NINGUNA clase `rounded-*`. Es un panel de alto
  // completo pegado al borde derecho con un borde a la izquierda, y las esquinas
  // rectas son lo que lo hace parecer parte de la pantalla y no una tarjeta
  // flotando. Verificado en la captura: 420x900 arrancando en x=946 sobre 1366.
  cajon: {
    capa: "flex justify-end",
    panel: "h-full",
    tarjeta: "h-full flex flex-col !rounded-none",
    altoVa: "ninguno",
  },
  // Hoja en el teléfono, centrada de `sm` para arriba: el redondeo acompaña.
  "hoja-o-centrado": {
    capa: "flex items-end sm:items-center justify-center",
    panel: "",
    tarjeta: "!rounded-t-2xl !rounded-b-none sm:!rounded-t-xl sm:!rounded-b-xl flex flex-col",
    altoVa: "tarjeta",
  },
};

export default function SunmiModalLayout({
  open,
  title,
  subtitle,
  color = "amber",
  onClose,
  children,
  footer = null,
  maxWidth = "max-w-xl",
  showCloseButton = true,
  /**
   * Con esto en true, tocar el velo NO cierra.
   *
   * ── EL CRITERIO: QUÉ SE PIERDE, NO QUÉ TAN PELIGROSO ES ────────────────
   *
   * **El velo no cierra cuando cerrar sin querer PIERDE algo** — lo que la
   * persona escribió, o una operación en vuelo. No cuando la acción es
   * peligrosa.
   *
   * Son dos cosas distintas y mezclarlas lleva a la respuesta equivocada.
   * "¿Borrar este comprobante?" es todo lo peligrosa que se quiera, y cerrarla
   * sin querer no cuesta NADA: se vuelve a abrir y se confirma. Un formulario de
   * proveedor con media pantalla escrita no es peligroso, y un toque al costado
   * —que en el teléfono pasa solo— tira lo escrito.
   *
   * Así que: los modales de CARGA y EDICIÓN lo declaran. Los informativos, los
   * de confirmación y los de selección NO, porque no hay nada que perder.
   *
   * El criterio anterior decía "una acción que escribe y no se puede deshacer
   * sola", que es la pregunta de si la acción es peligrosa. Por eso está
   * cambiado.
   *
   * **El nombre `destructivo` arrastra esa confusión y es candidato a
   * renombrarse al cerrar la fase 2** — no antes: renombrar mientras se migra
   * ensucia las comparaciones. Está anotado en el roadmap junto con los dos
   * modales que lo declaran por el criterio viejo, `ModalRevertir` y
   * `ModalTerminar`, que se revisan en esa misma vuelta.
   */
  destructivo = false,
  /** "centrado" | "hoja" | "cajon" | "hoja-o-centrado". Ver arriba de dónde sale cada una. */
  forma = "centrado",
  /**
   * A qué altura se apila. UN SOLO NÚMERO, y va en la capa.
   *
   * ── POR QUÉ UNO SOLO, Y POR QUÉ ACÁ ────────────────────────────────────
   *
   * La capa es `fixed` con `z-index`, así que crea un contexto de apilado: todo
   * lo que está adentro —el velo y el panel— se apila ENTRE SÍ y nada de afuera
   * se puede meter en el medio. El velo y el panel no llevan z propio a
   * propósito: se ordenan por el orden en que están escritos, que es el único
   * orden que hace falta.
   *
   * Si alguna vez se les pusiera un z a cada uno, ese contexto dejaría de ser
   * atómico y volvería a existir el hueco. Hay un candado que lo fija.
   *
   * El default es el de siempre. Se parametriza porque el repo tiene un
   * escalonado con intención que no se puede pisar: 40 el fondo del cajón, 50 el
   * modal, 60 el desplegable que se abre adentro del modal. Unificar se mira
   * cuando estén todas migradas y se puedan comparar al lado.
   */
  z = 9999,
  /**
   * El espaciado del CUERPO y del PIE, con el del kit por defecto.
   *
   * ── POR QUÉ SON PARÁMETRO Y NO UNA OPINIÓN DEL KIT ─────────────────────
   *
   * Emparejar los modales es emparejar la CAPA y la ESTRUCTURA —el velo, el
   * apilado, el botón de cerrar—, no repintar el interior de cada cuerpo. El
   * `gap-3` del kit no es un borde: separa TODOS los bloques del formulario
   * entre sí, así que imponerlo estira un modal de permisos con quince toggles.
   * Migrar la capa de una pantalla no puede cambiar cómo se ve su formulario.
   *
   * Es la cuarta cosa de la misma familia —el alto del cuerpo, el apilado, el
   * padding de la tarjeta y esto—: el kit tiene una opinión y las pantallas
   * tienen otra. En todas se resolvió igual, y el criterio está escrito en el
   * roadmap: el parámetro es una POSTERGACIÓN, no un perdón. Cada pantalla que
   * declare uno queda anotada ahí con qué declaró y por qué, para que al final
   * de la fase se pueda decidir qué se unifica y qué tiene razón de ser distinto.
   */
  espacioCuerpo = "mt-2 gap-3",
  espacioPie = "mt-3",
  /**
   * HASTA DÓNDE CRECE EL MODAL. Uno solo, y la forma decide dónde lo aplica —
   * ver el comentario de FORMAS.
   *
   * Estaba decidido en el roadmap desde el principio y sin escribir, esperando a
   * la primera pantalla que lo necesitara: hoy conviven 65, 70, 80, 90 y 92vh en
   * el repo. La primera fue `ModalCambioPrevio`.
   *
   * Recibe la clase TAL COMO LA ESCRIBE LA PANTALLA, así el par
   * `max-h-[92vh] sm:max-h-[88vh]` pasa entero y ningún número de una sola
   * pantalla entra al kit.
   */
  alto = "max-h-[90vh]",
  /**
   * DÓNDE CAE EL `alto`: `"tarjeta"`, `"cuerpo"` o `"ninguno"`.
   *
   * ── ES UNA EXCEPCIÓN DECLARABLE, NO LA REGLA CAYÉNDOSE ─────────────────────
   *
   * **Sin declarar, lo sigue derivando la FORMA**, y eso sigue siendo el default
   * y la regla: ver el comentario de `FORMAS`. Lo único que se agrega es poder
   * decir lo contrario A MANO, con el porqué al lado.
   *
   * La regla existía para que nadie los pusiera incoherentes POR DESCUIDO, y un
   * parámetro que hay que escribir a propósito no rompe eso. Lo que sí hace es
   * obligar a que quien lo escriba quede anotado en el registro del roadmap,
   * como los otros seis.
   *
   * ── DE DÓNDE SALE, QUE ES UNA NECESIDAD REAL Y NO UNA PREVISIÓN ────────────
   *
   * Los dos modales de `clientes` —"Historial de Ventas" y "Cuenta Corriente"—
   * son CENTRADOS y declaran `max-h-[90vh]` en la TARJETA, con
   * `overflow-hidden`. Migrarlos sin esto movía la pantalla: medido forzando el
   * desborde con una ventana de 250 px, la tarjeta pasaba de 225 px topada a
   * **312 px sin tope**, porque el alto se le aplicaba al cuerpo y la tarjeta
   * quedaba creciendo con su contenido. 87 píxeles.
   *
   * Y el caso normal NO lo mostraba: a 900 de ventana el contenido entra y todo
   * se ve bien. El defecto solo aparece con contenido largo.
   *
   * ── EL PATRÓN DEL QUE ESTE ES EL SEGUNDO CASO ──────────────────────────────
   *
   * **La pieza decide algo que la pantalla necesita decidir.** El primero fue el
   * encabezado, que no se puede apagar y por eso frenó a `CarritoPedido`; este
   * es el alto. Está anotado como patrón en el roadmap para que el tercero se
   * reconozca al toque y no se vuelva a resolver desde cero.
   *
   * ── Y LA COLUMNA VIAJA CON EL ALTO ─────────────────────────────────────────
   *
   * Cuando el tope va a la TARJETA, la tarjeta tiene que ser una columna: el
   * cuerpo crece contra ella con `flex-1 min-h-0`, y sin la columna ese `flex-1`
   * no resuelve contra nada y el scroll no aparece nunca. Las formas que ya
   * nacen con el tope en la tarjeta traen su `flex flex-col` en `FORMAS`;
   * `centrado` no, así que se lo agrega acá. Son dos caras de lo mismo y por eso
   * no se declaran por separado.
   */
  altoVa,
  /**
   * El PADDING y la SOMBRA de la tarjeta, por props explícitas.
   *
   * ── POR QUÉ ASÍ Y NO HACIENDO NEGOCIABLE A `SunmiCard` ────────────────────
   *
   * Lo primero que se pensó fue que la tarjeta negociara su `className`, como ya
   * lo hace el panel. Contado antes de escribirlo: `SunmiCard` tiene 234 usos,
   * 150 con `className`, y **117 declaran un padding**. Hoy todas dibujan 21px
   * igual, porque el `p-6` de la pieza le gana a lo que escribieron. Con la
   * negociación, esas 117 pasarían a recibir el padding que declararon
   * —cincuenta y seis de ellas escribieron `p-3`— y eso es cambiar el aspecto de
   * media aplicación por una pantalla.
   *
   * Acá decía 246 / 151 / 109 y el registro decía 233 / 130 / 104: dos cifras
   * para el mismo hecho, las dos contadas buscando clases literales. El recuento
   * del 2026-08-13 las reemplazó por una sola, y el porqué de cada corrección
   * está en `docs/roadmap/kit-sunmi-fases.md`.
   *
   * Así que no. Dos props, con el default del kit, y las usa quien las necesita.
   * Hoy es una sola.
   *
   * **Tienen que venir con `!`**, por lo mismo que el redondeo: `SunmiCard`
   * concatena en vez de negociar. Hay un candado que lo exige, para que no entre
   * una sin `!` que parezca aplicarse y no se aplique — que es el defecto que
   * este kit ya se comió una vez, con el `p-0 overflow-hidden` de tres modales
   * que nunca hizo nada.
   */
  paddingTarjeta = "",
  sombraTarjeta = "",
  /**
   * Una referencia al div del CUERPO.
   *
   * ── POR QUÉ EXISTE, Y NO ES DE ASPECTO ─────────────────────────────────
   *
   * `ModalProveedor` la usa para mandar el scroll arriba cuando el modal se
   * reabre. Sin eso, abrirlo para editar otro proveedor lo deja scrolleado donde
   * quedó el anterior — y eso no es un detalle: es la clase de cosa que hace que
   * alguien edite el campo equivocado.
   *
   * Hasta que la pieza se quedó con el div del cuerpo, esa pantalla no se podía
   * migrar sin perder la función. Es la quinta cosa de la misma familia y se
   * resuelve igual: sale de una pantalla que hoy funciona y queda anotada en el
   * registro.
   *
   * Cuando estén las 36 se mira si esto debería hacerlo la pieza para todos —
   * reabrir un modal arriba es razonable siempre— en vez de recibirlo de afuera.
   */
  refCuerpo,
  /**
   * Qué encabezado dibuja: `"tarjeta"` —el de siempre— o `"cinta"`.
   *
   * ── QUÉ SE VE DISTINTO, QUE ES LO QUE IMPORTA ──────────────────────────
   *
   * No es "usar otro componente": es que el título deje de ser una CINTA ÁMBAR
   * EN MAYÚSCULAS con borde y pase a ser texto blanco normal. Cinco modales del
   * sistema tienen la cinta, y perderla de golpe es un cambio que nadie pidió.
   *
   * Sexta cosa de la misma familia —el alto, el apilado, el padding de la
   * tarjeta, el espaciado, la referencia y esto— y se resuelve igual: parámetro,
   * con el del kit por defecto, y anotado en el registro quién declara qué.
   */
  encabezado = "tarjeta",
  /**
   * Clases del panel. NEGOCIA, no concatena: si acá viene un ancho o un ancho
   * máximo, la pieza retira el suyo. Dos clases de la misma familia tienen la
   * misma especificidad y ganaría la que Tailwind haya puesto última en la hoja
   * de estilos, no la que alguien quiso. El porqué largo está en
   * `lib/sunmi/claseAncho.js`.
   */
  className = "",
  /** Cómo se anuncia. Sin `aria-label` ni `aria-labelledby`, el título alcanza. */
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  role = "dialog",
}) {
  if (!open) return null;

  const f = FORMAS[forma] ?? FORMAS.centrado;
  const pedido = typeof className === "string" ? className.trim() : "";

  const clasesDelPanel = [
    "relative",
    declaraAncho(pedido) ? "" : "w-full",
    declaraAnchoMaximo(pedido) ? "" : maxWidth,
    f.panel,
    pedido,
  ]
    .filter(Boolean)
    .join(" ");

  // Dónde cae el alto, según la forma. Cuando va a la tarjeta, el cuerpo crece
  // contra ella: `flex-1` para que ocupe lo que sobra y `min-h-0` para que
  // pueda encogerse — sin eso un hijo flex no baja de su contenido y el scroll
  // nunca aparece.
  // Sin `altoVa` declarado esto es EXACTAMENTE lo que era antes: lo deriva la
  // forma. El `??` no cambia una clase de ninguno de los consumidores que no lo
  // pasen, y hay un candado que lo fija para las cuatro formas.
  const dondeVaElAlto = altoVa ?? f.altoVa;

  const altoEnLaTarjeta = dondeVaElAlto === "tarjeta" ? alto : "";
  const altoEnElCuerpo = dondeVaElAlto === "cuerpo" ? alto : "flex-1 min-h-0";

  // La columna viaja con el alto — ver el comentario de `altoVa`. Solo se agrega
  // si la forma no la trae ya, para no escribir la misma clase dos veces.
  const columnaEnLaTarjeta =
    dondeVaElAlto === "tarjeta" && !/(^|\s)flex(\s|$)/.test(f.tarjeta)
      ? "flex flex-col"
      : "";

  const cierraElVelo = !destructivo && typeof onClose === "function";

  // LA CAPA SE ARMA ACÁ Y SE MONTA MÁS ABAJO — ver el comentario del portal al
  // final de la función. El nombre importa: hay un candado que delimita el cuerpo
  // del componente por este `const capa = (`, justamente para no volver a
  // anclarse a un `return (` que se muda.
  const capa = (
    <div
      style={{ zIndex: z }}
      className={`fixed inset-0 ${f.capa}`}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : title)}
      aria-labelledby={ariaLabelledBy}
    >
      {/* EL VELO. Tiene que decir DOS cosas, y la primera versión solo decía una.
          Las dos están medidas y el detalle largo está en el roadmap.

          Decía `var(--app-bg) 78%`: el color del fondo de la app con
          transparencia. Eso apagaba muy bien lo de atrás —mejor que el negro al
          50 % que usaban las pantallas sin migrar— pero **desvanece hacia el
          fondo de la app**, y la tarjeta de un modal ES el fondo de la app en la
          mayoría de los temas. Medido sobre `/modulos/categorias` en los catorce:
          en DIEZ el relleno de la tarjeta y el del velo daban EXACTAMENTE el
          mismo color, contraste 1,00, y lo único que separaba el modal de la
          pantalla era un borde de un píxel. Los otros cuatro no pasaban de 1,12.

          O sea que las trece pantallas ya migradas quedaron peor que antes de
          tocarlas, que es justo lo que la fase se comprometió a no hacer.

          Ahora el color sigue saliendo del tema —un velo negro fijo en un tema
          claro se ve como un apagón, y eso no cambió— pero se lo lleva al 30 %
          hacia el negro antes de aplicarlo. Conserva el matiz del tema y queda
          más oscuro que cualquier tarjeta.

          `opacity` en vez de un tercer color adentro del `color-mix`: anidar
          `color-mix` es una función más nueva que la que ya se usaba, y este velo
          se dibuja en la Sunmi de la caja. Con dos propiedades separadas el piso
          de soporte no se mueve. */}
      {cierraElVelo ? (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          style={{ background: COLOR_VELO, opacity: OPACIDAD_VELO }}
          className="absolute inset-0"
        />
      ) : (
        <div
          aria-hidden="true"
          style={{ background: COLOR_VELO, opacity: OPACIDAD_VELO }}
          className="absolute inset-0"
        />
      )}

      <div className={clasesDelPanel}>
        {/* LA MARCA DE LA TARJETA, que existe para poder COMPARARLA.

            El arnés de capturas recorta por selector, y el antes y el después
            tienen que compartirlo o la comparación mide regiones distintas. Un
            selector posicional no sirve: al migrar, la tarjeta deja de ser el
            primer hijo de la capa —ahora el primero es el velo— y eso va a pasar
            en TODAS las migraciones que quedan. Con un selector posicional
            perderíamos la resta de píxeles todas las veces; pasó con
            `ModalCambioPrevio`, que quedó verificado por geometría.

            Así que la tarjeta se marca, y el marcador es el mismo para todos los
            modales del sistema. Para el "antes" se le pone el mismo atributo a
            la tarjeta hecha a mano —no cambia un píxel— y con eso los dos lados
            comparten selector. */}
        <SunmiCard
          data-sunmi-modal="tarjeta"
          className={[
            f.tarjeta,
            columnaEnLaTarjeta,
            altoEnLaTarjeta,
            paddingTarjeta,
            sombraTarjeta,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* `shrink-0` en el encabezado y en el pie: cuando la forma hace de la
              tarjeta una columna, lo único que tiene que ceder alto es el
              cuerpo. En las formas que no son columna no hace nada. */}
          <div className="shrink-0 flex items-start justify-between gap-2">
            {/* EL SUBTÍTULO NO SE REENVÍA, Y ES A PROPÓSITO.

                `SunmiCardHeader` acaba de aprender a dibujarlo. Si esta línea lo
                pasara, se encenderían solos los SEIS subtítulos de modal que hoy
                están muertos —`ModalLocal`, `ModalUsuario`, `ModalRevertir`,
                `ModalTerminar` y los dos de `PanelComprobantes`— y esa no era la
                tanda: la tanda son los diez de PANTALLA.

                Y no es solo cuestión de alcance. Dos de esos seis —"Configurá
                los datos del local" y "Configurá los datos del usuario"— repiten
                lo que ya dice su título, así que por el criterio que se aprobó
                habría que BORRARLOS, no mostrarlos. Reenviarlo acá publicaría
                justo la repetición que el criterio saca.

                Los seis se deciden aparte, con el mismo criterio, y ese día esta
                línea vuelve. Está anotado en el roadmap. */}
            {encabezado === "cinta" ? (
              <SunmiHeader title={title} color={color} />
            ) : (
              <SunmiCardHeader
                title={title}
                color={color}
              />
            )}

            {showCloseButton && onClose && (
              // `SunmiButton` no acepta `size`: lo desparramaba sobre el
              // `<button>` con el resto de los props, así que el botón nunca se
              // achicó y quedaba un atributo inválido en el DOM.
              <SunmiButton
                color="slate"
                onClick={onClose}
              >
                Cerrar
              </SunmiButton>
            )}
          </div>

          <div
            ref={refCuerpo}
            className={`flex flex-col ${altoEnElCuerpo} overflow-y-auto ${espacioCuerpo}`.trim()}
          >
            {children}
          </div>

          {footer && (
            <div className={`shrink-0 flex justify-end gap-2 ${espacioPie}`.trim()}>
              {footer}
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );

  // ── LA CAPA SE MONTA EN EL `body`, Y NO DONDE CAE EN EL ÁRBOL ─────────────
  //
  // `backdrop-filter`, `filter`, `transform` y `perspective` distintos de `none`
  // **crean un bloque contenedor para los descendientes `position: fixed`**: esos
  // hijos dejan de resolver su `inset` contra la pantalla y lo resuelven contra
  // ese ancestro. No hay aviso, no hay error de consola, y el `fixed` sigue
  // diciendo `fixed` en las herramientas.
  //
  // `SunmiCard` trae `backdrop-blur-sm`, y hay pantallas que dibujan sus modales
  // adentro de una. Medido a 360x640 antes de esto: en `/modulos/proveedores` la
  // capa medía **1004 px de alto en vez de 640, arrancando en y=131**, la tarjeta
  // iba de 346,3 a 918,3 —278 px fuera de la ventana— y encima quedaba de **273
  // de ancho contra los 339** de los modales sanos, porque su 95 % se calculaba
  // sobre la tarjeta y no sobre la pantalla. En `categorias` y en los dos de
  // `clientes` el desfase era de 10 a 14 px.
  //
  // ── POR QUÉ LO ARREGLA LA PIEZA Y NO CADA PANTALLA ───────────────────────
  //
  // Si el kit se hace cargo de la capa, le corresponde garantizar que se resuelva
  // contra la pantalla. Las dos alternativas que se midieron eran peores: mover
  // los modales de a uno arregla el caso que se conoce y deja la lista abierta
  // —el relevamiento no pudo abrir todos—, y sacarle el `backdrop-blur-sm` a
  // `SunmiCard` toca 240 usos en 62 pantallas para conseguir lo mismo.
  //
  // ── POR QUÉ EL `typeof document` Y NO UN EFECTO ──────────────────────────
  //
  // Montar el portal con `useEffect` y estado hace que el PRIMER RENDER devuelva
  // `null`, y eso **rompió cuatro candados de verdad**:
  // `lib/caja/ordenCambioPrevio.test.mjs` renderiza este modal a HTML para
  // verificar su contenido y recibía vacío. Así, en cambio, el navegador porta y
  // cualquier render sin DOM —los candados, y el del servidor si algún día llega—
  // dibuja la capa donde cae, exactamente como antes.
  //
  // Medido: el HTML que manda el servidor **no traía el modal ni antes ni
  // después** —comprobado apagando el JavaScript—, y no hay ningún aviso de
  // hidratación en consola.
  //
  // ── LO QUE ESTO NO CUBRE ─────────────────────────────────────────────────
  //
  // Los 32 archivos que todavía arman su capa a mano siguen igual de expuestos.
  // El kit no tiene cómo enterarse de ellos: se arreglan migrando.
  return typeof document !== "undefined" ? createPortal(capa, document.body) : capa;
}
