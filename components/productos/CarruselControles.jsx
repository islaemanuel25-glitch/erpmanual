"use client";

// "PARA REVISAR": el riel de controles de calidad del catálogo.
//
// ── POR QUÉ DEJÓ DE SER UNA GRILLA 2×2 ──────────────────────────────────────
//
// Salió a producción como cuatro cards en dos filas. Funcionaba, y se veía como
// lo que era: **cuatro cajas fijas**. Nada en la pantalla decía que la lista
// pudiera crecer, y con exactamente cuatro controles los puntos de paginado no se
// dibujaban —había una sola página—, así que el bloque no tenía ni un solo
// elemento que insinuara movimiento.
//
// Ahora es un RIEL: una fila que se desliza, con las cards a un ancho que hace que
// la tercera asome. Un borde cortado es la señal más barata y más entendida de
// "esto sigue", y no depende de que alguien lea un texto ni de que aparezca un
// control extra el día que haya cinco controles.
//
// ── LO QUE SE GANA Y LO QUE SE PAGA, DICHO ────────────────────────────────
//
// SE GANA ALTO. Dos filas de 71 px más su separación eran 148; una fila son 78, y
// la barra de avance suma 4. El bloque pasa de 148 a 82 px: **66 px menos**, que
// en un teléfono de 390 es la diferencia entre ver una tarjeta de producto entera
// o media.
//
// SE PAGA VISIBILIDAD. Antes se veían los cuatro números de una; ahora se ven dos
// y un pedazo del tercero. Los dos que quedan del otro lado son "Venta ≤ costo" y
// "Escala / precio", que son los dos `danger`. Es una decisión, no un descuido: el
// pedido de esta tanda fue explícito en que el bloque no podía seguir leyéndose
// como cuatro cajas estáticas, y no hay forma de que cuatro cards entren enteras
// en 390 px y a la vez algo asome.
//
// El orden lo decide el dominio —`CONTROLES` en `controlesCalidad.js`— así que si
// mañana se decide que los `danger` van primero, se cambia ahí y no acá.
//
// ── POR QUÉ LAS CARDS SE VEN TAMBIÉN EN CERO ────────────────────────────────
//
// Una card en 0 no es una card vacía: es la respuesta "ese control está sano".
// Si desapareciera, la fila cambiaría de forma según el día y nadie podría
// distinguir "no hay ninguno" de "todavía no cargó" — que son dos cosas muy
// distintas cuando lo que se está mirando es si el catálogo tiene problemas.
//
// ── LOS COLORES SON SEMÁNTICOS Y SALEN DEL THEME ────────────────────────────
//
// El dominio dice `rol`: "warning" es hay-que-mirarlo y "danger" es esto-puede-
// estar-costando-plata. Acá se traduce a tokens, nunca a los RGB del prototipo:
// escribir los hex haría que el bloque se viera igual en los catorce temas —o
// sea, mal en trece— y cada uno subiría el contador de hardcodeo.
//
// ── Y SON LOS SEMÁNTICOS GENERALES, NO LOS DEL POS ────────────────────────
//
// La primera versión usaba `--pos-success`, `--pos-warning` y `--pos-danger`.
// Son tokens y se ven bien, pero pertenecen al tema paralelo del POS, y esto es
// el catálogo: atar la semántica de salud de Productos al POS significa que el
// día que alguien retoque el rojo del mostrador se mueve también el de acá, sin
// que nadie lo haya pedido.
//
// Los generales del ERP son `--success-fg`, `--warning-fg` y `--danger-fg`. Están
// definidos en `:root` con valores pensados para tema oscuro y los ocho temas
// claros los sobrescriben; los cuatro que no lo hacen son oscuros y heredan los
// de `:root`, así que los catorce tienen un valor válido. Está medido: ver
// `scripts/sonda-controles-tokens.mjs`, que calcula el contraste de cada uno
// contra el fondo real de la card en los catorce y exige el umbral de cada uso.
//
// La SUPERFICIE sigue siendo del ERP y no de la semántica: el fondo de la card es
// `--card-bg`, que existe en los catorce.
//
// El verde no es decorativo: un control en 0 pasa a `success` porque el mensaje
// cambia. Un "0" en rojo se lee como una alarma apagada; en verde se lee como lo
// que es.
//
// ── UN CONTEO PARCIAL NO SE PUEDE MOSTRAR COMO SANO ───────────────────────
//
// El servidor clasifica en memoria con un techo de 5.000 productos, así que un
// catálogo más grande devuelve un conteo PARCIAL. Un 0 parcial no significa "no
// hay ninguno": significa "no lo sé". Pintarlo de verde con un tilde sería la
// pantalla afirmando salud sobre datos que no tiene, que es peor que no mostrar
// nada.
//
// Con `truncado`, las cards se dibujan en neutro, sin tilde, con el número
// prefijado por un "+" —porque hay al menos ésos— y el bloque avisa arriba sobre
// cuántos se contó. Ninguna dice "al día".
//
// ── NO HAY QUE TOCARLO PARA AGREGAR UN CONTROL ────────────────────────────
//
// Recorre lo que le pasen y las pone en el riel. Hoy son cuatro; el quinto entra
// solo, el riel se hace más largo y la barra de avance se acorta sola.

import { useEffect, useId, useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";

/**
 * ── EL ANCHO DE CADA CARD, Y POR QUÉ ES ESTE NÚMERO ───────────────────────
 *
 * 43 % del riel. A 390 px de pantalla el contenido mide unos 366, así que cada
 * card queda en 157 y entran dos enteras más 40 px de la tercera.
 *
 * Ese pedazo asomando ES el mecanismo: con 50 % entrarían dos justas y el borde
 * quedaría alineado con el de la pantalla, que es exactamente cómo se ve algo que
 * no se mueve. Con 33 % entrarían tres pero el número —que es el dato— se
 * quedaría sin lugar.
 *
 * Vive en una constante porque la usan dos cosas: el ancho de la card y el cálculo
 * inicial de la barra de avance. Si fueran dos números, la barra arrancaría con
 * una proporción y el riel con otra, y se vería un salto al montar.
 */
const ANCHO_CARD_PCT = 43;

/**
 * Cuánto se tiñe el fondo de la card ACTIVA.
 *
 * ── DE DÓNDE SALE EL NÚMERO ───────────────────────────────────────────────
 *
 * De medir, igual que el 88 % de la mezcla de texto. El fondo activo empuja
 * `--card-bg` hacia el color del estado, así que sube el fondo hacia el color del
 * texto y **baja el contraste**. Con 12 % el peor caso de los catorce temas sigue
 * por encima del umbral que a cada uso le corresponde; con más, `grafitoEjecutivo`
 * no llega.
 *
 * Lo verifica `scripts/sonda-controles-tokens.mjs`, que mide los dos fondos —el
 * normal y el activo— resolviendo estas mismas expresiones en el navegador.
 */
const TINTE_ACTIVO_PCT = 12;

/**
 * La pista sobre la que corre la barra de avance del riel.
 *
 * `--app-border` aclarado hacia el fondo. El 30 % sale de medir, no de elegir:
 * el porqué está donde se usa, y `scripts/sonda-controles-tokens.mjs` lo verifica
 * en los catorce temas contra el color del pulgar.
 */
const PISTA_DEL_RIEL = "color-mix(in srgb, var(--app-border) 30%, var(--app-bg))";

// ── LA MEZCLA NO ES ESTÉTICA: ES LO QUE HACE QUE SE LEA ───────────────────
//
// El token semántico solo no alcanzaba. Medido contra el fondo real de la card en
// los catorce temas, `--warning-fg` daba **2,94 en `grafitoEjecutivo`** y su ícono
// **2,67 sobre el fondo de la página**, con un mínimo de 3,0 para el borde de un
// componente y para el número —que en negrita y grande cuenta como texto grande—.
//
// La salida obvia era subir el token de ese tema, y de hecho se hizo y SE
// REVIRTIÓ: `--warning-fg` lo usa también `components/Header.jsx`, así que mover
// el token cambia una pantalla que no es la de este issue, y eso es una decisión
// de producto que nadie tomó. Un arreglo transversal no entra de contrabando en
// la tanda de otra cosa.
//
// Lo que sí es local: mezclar el color semántico con el color de TEXTO de la
// aplicación. `--app-fg` es, por definición, el color que contrasta contra el
// fondo en cada tema —oscuro en los claros, claro en los oscuros—, así que
// empujar hacia él sube el contraste en los catorce y en la dirección correcta,
// sin que ningún theme cambie.
//
// EL 12 % SALE DE MEDIR, no de elegir. Con esa mezcla el peor caso pasa de 2,94 a
// 3,58 y el del ícono de 2,67 a 3,26; con menos, `grafitoEjecutivo` no llega. Y no
// se subió más porque el matiz se apaga: a esta altura el ámbar sigue siendo
// ámbar y el rojo sigue siendo rojo, que es de lo que vive la card.
//
// Lo verifica `scripts/sonda-controles-tokens.mjs`, que mide ESTA expresión —no
// el token suelto— resolviéndola en el navegador, uso por uso y con el umbral que
// a cada uso le corresponde.
const conContraste = (token) => `color-mix(in srgb, var(${token}) 88%, var(--app-fg))`;

const TOKEN_POR_ROL = {
  warning: conContraste("--warning-fg"),
  danger: conContraste("--danger-fg"),
  success: conContraste("--success-fg"),
  neutro: "var(--pos-muted-strong)",
};

const colorDe = (rol) => TOKEN_POR_ROL[rol] || TOKEN_POR_ROL.neutro;

/** El fondo de una card según esté activa o no. */
const fondoDe = (color, activo) =>
  activo ? `color-mix(in srgb, ${color} ${TINTE_ACTIVO_PCT}%, var(--card-bg))` : "var(--card-bg)";

function CardControl({ control, activo, onSelect, truncado = false }) {
  // ── EN CERO, EL ROL CAMBIA ────────────────────────────────────────────
  //
  // Y no es un detalle de color: la card deja de decir "mirá esto" y pasa a
  // decir "esto está bien". El rol del dominio es el del PROBLEMA; el de la
  // card es el del ESTADO ACTUAL, que son dos preguntas distintas.
  //
  // ── SALVO QUE EL CONTEO SEA PARCIAL ───────────────────────────────────
  //
  // Con `truncado`, un 0 no significa "no hay ninguno": significa "no lo sé,
  // porque solo miré una parte del catálogo". Ahí NO hay estado sano — la card
  // queda en neutro, sin tilde y sin el texto de "al día". Afirmar salud sobre
  // datos incompletos es peor que no decir nada.
  const sano = !truncado && control.cantidad === 0;
  const color = truncado ? colorDe("neutro") : sano ? colorDe("success") : colorDe(control.rol);

  // ── EL RENGLÓN DE ABAJO SE CALCULA UNA VEZ ────────────────────────────
  //
  // Lo usan el texto visible Y el nombre accesible, y tienen que decir lo
  // mismo. La primera versión de esta tanda armaba el `aria-label` con
  // `control.detalle` fijo, así que una card en 0 se veía "Precios · al día" y
  // se anunciaba "Precios +30 días" — un lector de pantalla habría oído el
  // nombre de un problema sobre una card sana. Lo encontró el candado G1, que
  // busca que el nombre del problema NO aparezca sobre un 0: como mira el HTML
  // entero, el atributo también cuenta.
  const textoEstado = sano ? control.detalleSano ?? control.detalle : control.detalle;

  return (
    <button
      type="button"
      onClick={() => onSelect(control.id)}
      aria-pressed={activo}
      // ── EL NOMBRE ACCESIBLE DICE EL ESTADO, NO SOLO EL NÚMERO ────────
      //
      // `aria-pressed` ya lo dice para un lector de pantalla, pero el nombre
      // suelto —"2361 Precios +30 días"— no distingue la card que está
      // filtrando de las otras tres. Acá se dice con palabras.
      aria-label={
        activo
          ? `${control.titulo} ${textoEstado}: ${control.cantidad}. Filtrando. Tocá para quitar el filtro.`
          : `${control.titulo} ${textoEstado}: ${control.cantidad}. Tocá para filtrar.`
      }
      // ── 44 px DE ALTO MÍNIMO, ESCRITOS ────────────────────────────────
      //
      // El mínimo táctil de WCAG 2.5.5. Van escritos y no como `h-11` porque
      // **en esta aplicación 1 rem son 14 px**, así que `h-11` da 38,5. Es el
      // mismo número y el mismo motivo que la fila de acciones de la tarjeta.
      //
      // `snap-start` y `shrink-0`: sin el segundo, flex las comprimiría para
      // que las cuatro entren y el riel dejaría de desbordar — o sea, dejaría
      // de deslizarse, que es todo el punto.
      className={[
        "relative flex flex-col justify-between text-left rounded-xl border px-2.5 py-2 min-h-[44px]",
        "shrink-0 snap-start transition-colors sunmi-row-hover",
        activo ? "ring-2" : "",
      ].join(" ")}
      style={{
        width: `${ANCHO_CARD_PCT}%`,
        // El borde y el anillo toman el color del estado. El FONDO solo se tiñe
        // en la card activa: teñir las cuatro convertiría la fila en un
        // semáforo y dejaría de leerse el número, que es el dato. Teñir UNA es
        // justamente lo que la separa de las otras tres.
        borderColor: color,
        background: fondoDe(color, activo),
        "--tw-ring-color": color,
      }}
    >
      <span className="flex items-baseline gap-1.5">
        <span
          // ── 21 px BOLD, Y EL NÚMERO NO ES ESTÉTICO ───────────────────────
          //
          // Era `text-xl` —17,5 px—. El umbral de WCAG para "texto grande" es
          // 14 pt en negrita, que son **18,67 px CSS**: a 17,5 el número NO
          // califica y le corresponde 4,5:1 como a cualquier texto, no 3,0.
          //
          // `text-2xl` son 1,5 rem = 21 px en esta aplicación —1 rem son 14—,
          // así que en negrita SÍ califica y el requisito baja a 3,0, que es el
          // que los tokens de salud cumplen. Es el ajuste más chico que resuelve
          // el contraste sin tocar ningún theme.
          className="text-2xl font-bold leading-none [font-variant-numeric:tabular-nums]"
          style={{ color }}
        >
          {/* CON CONTEO PARCIAL, EL NÚMERO LLEVA "+". Lo que se sabe es que hay
              AL MENOS ésos; escribirlo pelado sería afirmar un total que nadie
              calculó. */}
          {truncado ? `+${control.cantidad}` : control.cantidad}
        </span>
        {sano && <Check className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden="true" />}
      </span>
      <span className="mt-1 block leading-[1.25]">
        <span className="block text-[11.5px] font-medium sunmi-text-strong truncate">
          {control.titulo}
        </span>
        {/* ── EL RENGLÓN DE ABAJO CAMBIA TRES VECES ──────────────────────
            · activo  → cómo se sale, que es lo único que falta saber cuando
              la card ya está encendida y el listado ya está filtrado;
            · en cero → el texto sano del dominio;
            · si no   → el nombre del problema.

            El de "activo" va primero porque una card encendida en cero
            —filtrando por un control que no marca a nadie— tiene que seguir
            diciendo cómo apagarse, no "al día". */}
        {/* ── EL TEXTO ACTIVO NO VA PINTADO CON EL COLOR DEL ESTADO ──────
            La primera versión lo pintaba con `color`, y la sonda de contraste lo
            puso en ROJO: son 10,5 px —texto chico, umbral 4,5— y sobre el fondo
            teñido daba **3,14 en `grafitoEjecutivo`** y 3,42 en `verdeComercio`.
            El mismo color que en el número de 21 px pasa holgado, porque ahí el
            umbral es 3,0. Es el mismo error que ya se había cometido con el texto
            del aviso de conteo parcial, y por el mismo motivo: el umbral lo
            decide el TAMAÑO, no el color.

            Va con el color de texto de la aplicación, que sobre ese mismo fondo
            mide entre 9,7 y 12,5. Y se distingue igual del renglón de las otras
            cards, que va apagado: no hace falta el color para eso. */}
        <span
          className={`block text-[10.5px] truncate ${activo ? "sunmi-text-strong" : "sunmi-text-muted"}`}
        >
          {activo ? "Tocá para quitar" : textoEstado}
        </span>
      </span>
    </button>
  );
}

/**
 * @param {Array}  controles  los del dominio, ya con `cantidad`
 * @param {string} activo     id del control filtrando, o null
 * @param {func}   onSelect   recibe el id; la pantalla decide prender o apagar
 * @param {bool}   cargando   mientras no llegó el conteo
 * @param {bool}   truncado   el servidor contó solo una parte del catálogo
 * @param {number} techo      cuántos productos alcanzó a mirar
 */
export default function CarruselControles({
  controles = [],
  activo = null,
  onSelect = () => {},
  cargando = false,
  truncado = false,
  techo = null,
}) {
  const pistaRef = useRef(null);
  const etiquetaId = useId();

  // ── LA BARRA DE AVANCE ────────────────────────────────────────────────
  //
  // Dos números: qué fracción del riel se ve, y cuánto se corrió. Salen de medir
  // la pista, no de contar cards: si mañana las cards cambian de ancho o el
  // teléfono es más grande, la barra sigue diciendo la verdad sin que nadie la
  // ajuste.
  //
  // Arranca con la fracción que la geometría PREDICE —de `ANCHO_CARD_PCT`, la
  // misma constante que define el ancho— para que no haya un salto entre el
  // primer pintado y la medición. Un valor cualquiera acá se vería como un
  // parpadeo de la barra al abrir.
  const fraccionPrevista = controles.length
    ? Math.min(1, 100 / (ANCHO_CARD_PCT * controles.length))
    : 1;
  const [avance, setAvance] = useState({ fraccion: fraccionPrevista, corrido: 0 });

  const medir = () => {
    const pista = pistaRef.current;
    if (!pista || pista.scrollWidth <= 0) return;
    const fraccion = Math.min(1, pista.clientWidth / pista.scrollWidth);
    const recorrible = pista.scrollWidth - pista.clientWidth;
    setAvance({ fraccion, corrido: recorrible > 0 ? pista.scrollLeft / recorrible : 0 });
  };

  // Se mide al montar y cuando cambia la cantidad de controles. No hace falta un
  // observador de tamaño: el riel solo cambia de geometría si gira el teléfono, y
  // ahí el propio scroll dispara la medición de nuevo.
  // Sin `eslint-disable`: la regla no se queja de este efecto, y una directiva de
  // silencio que no silencia nada es ruido que el próximo lector va a leer como
  // "acá hay algo raro". Lo dijo el lint —"Unused eslint-disable directive"— y
  // se sacó.
  useEffect(() => {
    medir();
  }, [controles.length]);

  if (controles.length === 0) return null;

  // La barra solo tiene sentido si sobra riel. Con dos controles entrarían los dos
  // y una barra completa se leería como un control roto.
  const desborda = avance.fraccion < 0.999;

  return (
    <section aria-labelledby={etiquetaId} className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <h2 id={etiquetaId} className="text-[12px] font-semibold sunmi-text-strong">
          Para revisar
        </h2>
        {cargando && <span className="text-[10.5px] sunmi-text-muted">calculando…</span>}
      </div>

      {/* ── EL CÁLCULO PARCIAL SE DICE, NO SE CALLA ────────────────────────
          Los endpoints ya devolvían el flag y la pantalla no lo miraba, así que
          un catálogo por encima del techo mostraba conteos parciales —incluido un
          0— con la misma cara que un resultado completo. Un límite que no se
          informa es lo mismo que no tenerlo: el que mira no puede saber que está
          viendo la mitad. */}
      {truncado && !cargando && (
        <div
          // ── EL TEXTO NO VA PINTADO, Y EL ÍCONO SÍ ────────────────────────
          //
          // Estaba entero en `--warning-fg`. Son 10,5 px: texto chico, así que le
          // corresponde 4,5:1, y el ámbar de varios temas no llega —en
          // `sunmiLight` da 3,19 contra el fondo—. Un aviso ilegible es peor que
          // no ponerlo.
          //
          // El texto pasa al color de texto de la aplicación, que es el que ya
          // cumple en todos los temas por ser el del cuerpo. El ÍCONO se queda
          // ambar: es un objeto gráfico y su umbral es 3,0, y es el que hace que
          // el renglón se lea como un aviso de un vistazo.
          //
          // `text-xs` y no `text-[10.5px]`: en esta aplicación 1 rem son 14 px,
          // así que `text-xs` ES 10,5 px. Mismo píxel, sin sumar al contador.
          className="flex items-start gap-1.5 mb-1.5 text-xs leading-[1.35] sunmi-text-strong"
          role="status"
        >
          <TriangleAlert
            className="w-3.5 h-3.5 shrink-0"
            // La misma mezcla que las cards, por lo mismo: suelto daba 2,67
            // contra el fondo de la página en `grafitoEjecutivo`.
            style={{ color: colorDe("warning") }}
            aria-hidden="true"
          />
          <span>
            Conteo parcial: se miraron los primeros {techo ? techo.toLocaleString("es-AR") : "5.000"}{" "}
            productos. Puede haber más en cada control.
          </span>
        </div>
      )}

      {/* EL RIEL. `snap-x snap-mandatory` con cada card ocupando el 43 %: el dedo
          suelta siempre sobre el borde de una card y nunca la deja partida al
          medio, que es lo que hace que un riel se sienta roto.
          `overflow-x-auto` con la barra escondida — en el celular no se ve, y en
          escritorio este bloque no se muestra. */}
      <div
        ref={pistaRef}
        onScroll={medir}
        // Asidero estable para recortar la foto al riel y para que las sondas lo
        // busquen por algo que no sea una clase de Tailwind.
        data-riel="controles"
        className="flex gap-1.5 overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {controles.map((control) => (
          <CardControl
            key={control.id}
            control={control}
            activo={activo === control.id}
            onSelect={onSelect}
            truncado={truncado}
          />
        ))}
      </div>

      {/* ── LA BARRA DE AVANCE ──────────────────────────────────────────────
          No es decoración: es lo que dice que hay más de lo que se ve, incluso
          antes de tocar nada. La card cortada en el borde lo insinúa; esto lo
          afirma, y además dice CUÁNTO falta.

          `aria-hidden`: para un lector de pantalla no aporta —las cards ya están
          todas en el árbol y se recorren igual— y anunciarla sería ruido. */}
      {desborda && (
        <div
          className="mt-1.5 h-1 rounded-full overflow-hidden"
          // ── LA PISTA, Y POR QUÉ ESTÁ ACLARADA ────────────────────────────
          //
          // Sale de `--app-border`, el mismo gris de la línea divisoria del kit
          // —lo usa `.sunmi-divider`— y que existe en los catorce temas.
          //
          // Va aclarada hacia el fondo porque la MEDICIÓN lo pidió: con el gris
          // entero, el pulgar daba 2,47 en `sunmiFrance` contra los 3,0 que
          // necesita un objeto gráfico. Y el número no se puede elegir a ojo: al
          // 60 % el peor caso EMPEORA a 1,38, al 45 % da 2,34 y recién al 30 %
          // llega a 3,26. Está en `scripts/sonda-controles-tokens.mjs`, que mide
          // esta misma expresión en los catorce temas.
          style={{ background: PISTA_DEL_RIEL }}
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full transition-transform"
            style={{
              width: `${Math.max(avance.fraccion * 100, 12)}%`,
              // `translateX` en porcentaje del PROPIO ancho: con el pulgar al
              // 100 % de avance, correrlo (1/f − 1) veces su ancho lo deja
              // exactamente pegado al borde derecho, sea cual sea la fracción.
              transform: `translateX(${(avance.corrido * (1 / Math.max(avance.fraccion, 0.12) - 1)) * 100}%)`,
              // ── EL ACENTO SOLO NO SE VEÍA CONTRA LA PISTA ──────────────
              //
              // `var(--pos-accent)` pelado sobre `--app-border` daba **2,15 en
              // `sunmiLight`**, y un objeto gráfico que informa necesita 3,0: la
              // barra existía y no se distinguía de su propia pista, o sea que
              // no decía nada. Lo encontró la sonda de contraste, no el ojo.
              //
              // La misma mezcla que usan las cards, por el mismo motivo y con la
              // misma proporción: empujar hacia el color de texto de la
              // aplicación sube el contraste en los catorce temas sin tocar
              // ningún theme.
              background: conContraste("--pos-accent"),
            }}
          />
        </div>
      )}
    </section>
  );
}

export { TOKEN_POR_ROL, ANCHO_CARD_PCT, TINTE_ACTIVO_PCT, PISTA_DEL_RIEL, fondoDe };
