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
// estar-costando-plata. Acá se traduce a los tokens que el ERP ya define en los
// CATORCE temas —`--pos-warning`, `--pos-danger`, `--pos-success`—, y no a los
// RGB del prototipo. Escribir los hex haría dos daños: el bloque se vería igual
// en los catorce temas —o sea, mal en trece— y cada uno subiría el contador de
// hardcodeo.
//
// El verde no es decorativo: un control en 0 pasa a `success` porque el mensaje
// cambia. Un "0" en rojo se lee como una alarma apagada; en verde se lee como lo
// que es.
//
// ── PAGINA SOLO, Y POR ESO NO HAY QUE TOCARLO PARA AGREGAR UN CONTROL ──────
//
// Recorre lo que le pasen y arma páginas de a cuatro, en 2×2. Hoy los controles
// son cuatro y hay una sola página; el quinto agrega una segunda sin que este
// archivo cambie una línea, y sin que el bloque crezca en alto.

import { useId, useRef, useState } from "react";
import { Check } from "lucide-react";

/** Cuántas cards entran en una página: 2×2. */
const POR_PAGINA = 4;

/**
 * De rol semántico a token del theme.
 *
 * Un objeto y no un `if`: agregar un rol es agregar una entrada, y un rol que no
 * esté cae en el neutro en vez de quedar sin color.
 */
const TOKEN_POR_ROL = {
  warning: "var(--pos-warning)",
  danger: "var(--pos-danger)",
  success: "var(--pos-success)",
  neutro: "var(--pos-muted)",
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

function CardControl({ control, activo, onSelect }) {
  // ── EN CERO, EL ROL CAMBIA ────────────────────────────────────────────
  //
  // Y no es un detalle de color: la card deja de decir "mirá esto" y pasa a
  // decir "esto está bien". El rol del dominio es el del PROBLEMA; el de la
  // card es el del ESTADO ACTUAL, que son dos preguntas distintas.
  const sano = control.cantidad === 0;
  const color = sano ? colorDe("success") : colorDe(control.rol);

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
        background: "var(--pos-panel-bg)",
        "--tw-ring-color": color,
      }}
    >
      <span className="flex items-baseline gap-1.5">
        <span
          // `text-xl` y no una medida escrita: está en la escala y no suma al
          // contador de hardcodeo. Son 17,5 px reales, porque en esta aplicación
          // 1 rem son 14 — ver el encabezado de `app/globals.css`.
          className="text-xl font-bold leading-none [font-variant-numeric:tabular-nums]"
          style={{ color }}
        >
          {control.cantidad}
        </span>
        {sano && <Check className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden="true" />}
      </span>
      <span className="mt-1 block leading-[1.25]">
        <span className="block text-[11.5px] font-medium sunmi-text-strong">{control.titulo}</span>
        <span className="block text-[10.5px] sunmi-text-muted">{control.detalle}</span>
      </span>
    </button>
  );
}

/**
 * @param {Array}  controles  los del dominio, ya con `cantidad`
 * @param {string} activo     id del control filtrando, o null
 * @param {func}   onSelect   recibe el id; la pantalla decide prender o apagar
 * @param {bool}   cargando   mientras no llegó el conteo
 */
export default function CarruselControles({
  controles = [],
  activo = null,
  onSelect = () => {},
  cargando = false,
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
