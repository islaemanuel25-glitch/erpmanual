"use client";

// "PARA REVISAR": el carrusel de controles de calidad del catálogo.
//
// ── POR QUÉ LAS CARDS SE VEN TAMBIÉN EN CERO ────────────────────────────────
//
// Una card en 0 no es una card vacía: es la respuesta "ese control está sano".
// Si desapareciera, la fila cambiaría de forma según el día y nadie podría
// distinguir "no hay ninguno" de "todavía no cargó" — que son dos cosas muy
// distintas cuando lo que se está mirando es si el catálogo tiene problemas.
//
// Y hay un motivo de layout además del de información: con las cards yendo y
// viniendo, el bloque cambiaría de alto y de cantidad de páginas entre una carga
// y la siguiente, así que el pulgar no aprendería nunca dónde está cada cosa.
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
// contra el fondo real de la card en los catorce y exige 3,0.
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
// ── PAGINA SOLO, Y POR ESO NO HAY QUE TOCARLO PARA AGREGAR UN CONTROL ──────
//
// Recorre lo que le pasen y arma páginas de a cuatro, en 2×2. Hoy los controles
// son cuatro y hay una sola página; el quinto agrega una segunda sin que este
// archivo cambie una línea, y sin que el bloque crezca en alto.

import { useId, useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";

/** Cuántas cards entran en una página: 2×2. */
const POR_PAGINA = 4;

/**
 * De rol semántico a token del theme.
 *
 * Un objeto y no un `if`: agregar un rol es agregar una entrada, y un rol que no
 * esté cae en el neutro en vez de quedar sin color.
 */
// ── LA MEZCLA NO ES ESTÉTICA: ES LO QUE HACE QUE SE LEA ───────────────────
//
// El token semántico solo no alcanzaba. Medido contra el fondo real de la card en
// los catorce temas, `--warning-fg` daba **2,94 en `grafitoEjecutivo`** y su ícono
// **2,67 sobre el fondo de la página**, con un mínimo de 3,0 para el borde de un
// componente y para el número —que a 21 px en negrita cuenta como texto grande—.
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

/** Parte una lista en páginas de a `POR_PAGINA`. */
function enPaginas(items) {
  const paginas = [];
  for (let i = 0; i < items.length; i += POR_PAGINA) {
    paginas.push(items.slice(i, i + POR_PAGINA));
  }
  return paginas;
}

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

  return (
    <button
      type="button"
      onClick={() => onSelect(control.id)}
      aria-pressed={activo}
      // ── 44 px DE ALTO MÍNIMO, ESCRITOS ────────────────────────────────
      //
      // El mínimo táctil de WCAG 2.5.5. Van escritos y no como `h-11` porque
      // **en esta aplicación 1 rem son 14 px**, así que `h-11` da 38,5. Es el
      // mismo número y el mismo motivo que la fila de acciones de la tarjeta.
      className={[
        "relative flex flex-col justify-between text-left rounded-xl border px-2.5 py-2 min-h-[44px]",
        "transition-colors sunmi-row-hover",
        activo ? "ring-2" : "",
      ].join(" ")}
      style={{
        // El borde y el anillo toman el color del estado; el fondo se queda en
        // el panel del theme. Un fondo teñido en cuatro cards seguidas convierte
        // la fila en un semáforo y deja de leerse el número, que es el dato.
        borderColor: color,
        // La superficie sale de `--card-bg`, el token de tarjeta del ERP, y no de
        // la semántica: un fondo teñido en cuatro cards seguidas convierte la
        // fila en un semáforo y deja de leerse el número, que es el dato.
        background: "var(--card-bg)",
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
          //
          // Medido después de subirlo: la card pasa de 68 a 71 px de alto y el
          // bloque 2x2 sigue entrando a 390 px sin empujar las tarjetas.
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
        <span className="block text-[11.5px] font-medium sunmi-text-strong">{control.titulo}</span>
        {/* EN CERO EL TEXTO CAMBIA, no se achica: "Precios +30 días" sobre un 0
            se sigue leyendo como el nombre de un problema. El texto sano lo
            decide el dominio, junto con el del problema. */}
        <span className="block text-[10.5px] sunmi-text-muted">
          {sano ? control.detalleSano ?? control.detalle : control.detalle}
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
  const paginas = enPaginas(controles);
  const [paginaVisible, setPaginaVisible] = useState(0);
  const pistaRef = useRef(null);
  const etiquetaId = useId();

  if (controles.length === 0) return null;

  // Qué página se está mirando: se deduce del scroll y no de un estado que la
  // pantalla mantenga aparte. Con `snap-mandatory` la pista siempre queda
  // detenida en un múltiplo del ancho, así que la división es exacta.
  const alDesplazar = (e) => {
    const ancho = e.currentTarget.clientWidth || 1;
    const indice = Math.round(e.currentTarget.scrollLeft / ancho);
    if (indice !== paginaVisible) setPaginaVisible(indice);
  };

  const irA = (indice) => {
    const pista = pistaRef.current;
    if (!pista) return;
    pista.scrollTo({ left: indice * pista.clientWidth, behavior: "smooth" });
  };

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

      {/* LA PISTA. `snap-x snap-mandatory` con cada página ocupando el 100 % del
          ancho: el dedo no puede dejarla a mitad de camino entre dos páginas,
          que es lo que hace que un carrusel se sienta roto.
          `overflow-x-auto` con la barra escondida — en el celular no se ve, y en
          escritorio este bloque no se muestra. */}
      <div
        ref={pistaRef}
        onScroll={alDesplazar}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {paginas.map((pagina, i) => (
          <div key={i} className="shrink-0 w-full snap-start pr-px">
            {/* 2×2 SIEMPRE, aunque la última página venga incompleta.
                `grid-rows-2` y no filas automáticas: con tres cards, las filas
                automáticas repartirían el alto entre dos y la página quedaría
                más baja que la anterior — el bloque saltaría al deslizar. */}
            <div className="grid grid-cols-2 grid-rows-2 gap-1.5 auto-rows-fr">
              {pagina.map((control) => (
                <CardControl
                  key={control.id}
                  control={control}
                  activo={activo === control.id}
                  onSelect={onSelect}
                  truncado={truncado}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* LOS PUNTOS, SOLO SI HAY MÁS DE UNA PÁGINA. Con una sola serían un punto
          suelto que no hace nada, y eso se lee como un control roto. */}
      {paginas.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-1.5">
          {paginas.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => irA(i)}
              aria-label={`Página ${i + 1} de ${paginas.length}`}
              aria-current={i === paginaVisible}
              className="w-6 h-6 flex items-center justify-center"
            >
              {/* ── EL ACENTO SIGUE SIENDO `--pos-accent`, Y ESTÁ DECIDIDO ──
                  No es semántica de salud: es "cuál está seleccionado". El
                  guardrail que sacó `--pos-success/warning/danger` de acá es
                  sobre los estados, y el ERP no tiene otro token de acento —no
                  existe `--accent` ni `--link-fg` en ningún tema—. Inventar uno
                  obliga a elegir su valor en los CATORCE, con su medición de
                  contraste, y eso es una tanda propia. Es el mismo criterio con
                  el que la tarjeta dejó anotada su diferencia de cuatro puntos
                  contra el prototipo en vez de crear un token al paso. */}
              <span
                className="block w-1.5 h-1.5 rounded-full transition-opacity"
                style={{
                  background: "var(--pos-accent)",
                  opacity: i === paginaVisible ? 1 : 0.3,
                }}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export { TOKEN_POR_ROL, POR_PAGINA, enPaginas };
