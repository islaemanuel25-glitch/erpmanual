"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import SunmiPill from "@/components/sunmi/SunmiPill";

const POR_PAGINA = 4;
const TINTE_ACTIVO_PCT = 12;
const ACENTO_ACTIVO = "var(--pos-accent)";

const conContraste = (token) =>
  `color-mix(in srgb, var(${token}) 88%, var(--app-fg))`;

const TOKEN_POR_ROL = {
  warning: conContraste("--warning-fg"),
  danger: conContraste("--danger-fg"),
  success: conContraste("--success-fg"),
  neutro: "var(--pos-muted-strong)",
};

const colorDe = (rol) => TOKEN_POR_ROL[rol] || TOKEN_POR_ROL.neutro;

const fondoDe = (activo) =>
  activo
    ? `color-mix(in srgb, ${ACENTO_ACTIVO} ${TINTE_ACTIVO_PCT}%, var(--card-bg))`
    : "var(--card-bg)";

function enPaginas(items) {
  const paginas = [];
  for (let i = 0; i < items.length; i += POR_PAGINA) {
    paginas.push(items.slice(i, i + POR_PAGINA));
  }
  return paginas;
}

/**
 * ── QUÉ CARD AFIRMA SALUD EN CERO, Y CÓMO SE DECIDE ───────────────────────
 *
 * Hay dos clases de card en el mismo carrusel y se comportan distinto en cero:
 *
 *   · las de MANTENIMIENTO cuentan trabajo pendiente, así que un cero es una
 *     buena noticia y se dice — verde, tilde, y el texto cambia a "al día" o
 *     "sin pendientes";
 *   · las de CLASIFICACIÓN reparten el catálogo en categorías, y ahí un cero no
 *     es un logro ni un problema: "0 productos vendidos por kg" es un dato.
 *     Pintarlo de verde con un tilde afirmaría algo que nadie dijo.
 *
 * ── POR QUÉ NO ES UN PROP Y SALE DEL DATO ─────────────────────────────────
 *
 * Porque el carrusel es UNO SOLO y lleva las dos clases adentro: un prop del
 * bloque no puede decidir por cada card. Se podría haber puesto una marca en
 * cada entrada del catálogo, pero esa marca ya existe y es `detalleSano`: es
 * literalmente el texto que la card dice cuando no hay ninguno. Una card que no
 * tiene nada que decir en cero es, por definición, una card que en cero no
 * afirma nada.
 *
 * Así no hay dos cosas que mantener sincronizadas, y agregar una card nueva no
 * obliga a acordarse de un segundo campo.
 *
 * Comprobado que no mueve lo que ya existía: los cuatro controles de "Para
 * revisar" y los cuatro estados de Stock declaran `detalleSano` —hay un candado
 * en `lib/stock/estadosDeStock.test.mjs` que lo exige—, así que las dos
 * pantallas se dibujan exactamente igual que antes.
 */
const afirmaSaludEnCero = (control) =>
  control?.detalleSano !== undefined && control?.detalleSano !== null;

function CardControl({ control, activo, onSelect, truncado = false }) {
  const sano = afirmaSaludEnCero(control) && !truncado && control.cantidad === 0;
  const color = truncado
    ? colorDe("neutro")
    : sano
      ? colorDe("success")
      : colorDe(control.rol);
  const textoEstado = sano
    ? control.detalleSano ?? control.detalle
    : control.detalle;

  return (
    <button
      type="button"
      onClick={() => onSelect(control.id)}
      aria-pressed={activo}
      aria-label={
        activo
          ? `${control.titulo} ${textoEstado}: ${control.cantidad}. Filtrando. Tocá para quitar el filtro.`
          : `${control.titulo} ${textoEstado}: ${control.cantidad}. Tocá para filtrar.`
      }
      className={[
        "relative flex flex-col justify-between text-left rounded-xl border px-2.5 py-2 min-h-[44px]",
        "transition-colors sunmi-row-hover",
        activo ? "ring-2" : "",
      ].join(" ")}
      style={{
        borderColor: activo ? ACENTO_ACTIVO : color,
        background: fondoDe(activo),
        "--tw-ring-color": activo ? ACENTO_ACTIVO : color,
      }}
    >
      <span className="flex items-baseline gap-1.5">
        <span
          className="text-2xl font-bold leading-none [font-variant-numeric:tabular-nums]"
          style={{ color }}
        >
          {truncado ? `+${control.cantidad}` : control.cantidad}
        </span>
        {sano && (
          <Check
            className="w-3.5 h-3.5 shrink-0"
            style={{ color }}
            aria-hidden="true"
          />
        )}
      </span>

      <span className="mt-1 block leading-[1.25]">
        <span className="block text-[11.5px] font-medium sunmi-text-strong">
          {control.titulo}
        </span>
        <span className="block text-[10.5px] sunmi-text-muted">
          {textoEstado}
        </span>
      </span>
    </button>
  );
}

export default function CarruselControles({
  controles = [],
  activo = null,
  onSelect = () => {},
  cargando = false,
  truncado = false,
  techo = null,
  // ── EL RÓTULO ES UN PARÁMETRO, CON EL DE PRODUCTOS COMO DEFAULT ─────────
  //
  // Stock reusa esta pieza y su bloque se llama "Estado del stock", no "Para
  // revisar". Escribir un carrusel parecido al lado habría sido la salida fácil
  // y la equivocada: el día que uno cambie, el otro se queda viejo.
  //
  // El default conserva Productos EXACTAMENTE como estaba —no pasa el prop, así
  // que sigue diciendo "Para revisar"—, que es la prueba de que la pieza salió
  // bien: la pantalla de donde se sacó no se movió.
  titulo = "Para revisar",
}) {
  const paginas = enPaginas(controles);

  // ── `activo` ACEPTA UNO O VARIOS, Y ESO ES LO QUE PERMITE COMBINAR ────────
  //
  // "Estado del stock" enciende una card por vez y sigue pasando un id suelto.
  // El catálogo de Productos puede tener hasta dos encendidas —una modalidad de
  // venta y una de compra, que son una intersección— y pasa un arreglo.
  //
  // Se resuelve acá y no en cada llamador: la alternativa era un segundo carrusel
  // para poder marcar dos, que es exactamente la copia al lado que esta pieza
  // existe para no tener. Y fue el error de la tanda anterior.
  const encendidos = Array.isArray(activo) ? activo : [activo];
  const estaActivo = (id) => encendidos.includes(id);

  const [paginaVisible, setPaginaVisible] = useState(0);
  const pistaRef = useRef(null);
  const etiquetaId = useId();

  // ── LAS CARDS ENCENDIDAS, CON SUS NOMBRES DEL CATÁLOGO ───────────────────
  //
  // Se buscan en `controles`, que es el mismo arreglo que dibuja las cards y que
  // viene del dominio. Escribir los nombres otra vez acá sería tener la
  // clasificación en dos lugares — y el día que un rótulo cambie, la cinta diría
  // una cosa y la card otra.
  const indiceDe = (id) => controles.findIndex((c) => c.id === id);
  const paginaDe = (id) => {
    const i = indiceDe(id);
    return i < 0 ? null : Math.floor(i / POR_PAGINA);
  };

  const activas = encendidos
    .filter(Boolean)
    .map((id) => controles.find((c) => c.id === id))
    .filter(Boolean);

  // ── A QUÉ PÁGINA HAY QUE LLEVAR ──────────────────────────────────────────
  //
  // Solo cuando hay UNA encendida. Con dos —una de venta y una de compra— están
  // en páginas distintas y no existe una página que las muestre a las dos: ese
  // caso lo resuelve la cinta de arriba, no un scroll que elija una y esconda la
  // otra.
  //
  // Y con ninguna encendida no se toca nada: llevar a la página 1 sin motivo le
  // movería la pantalla a alguien que no pidió nada.
  const paginaDeLaActiva = activas.length === 1 ? paginaDe(activas[0].id) : null;

  // La primera vez va sin animación —es la posición de partida, no un
  // movimiento— y de ahí en adelante sí, que es lo que hace legible un Atrás.
  const yaLlevoRef = useRef(false);
  useEffect(() => {
    if (paginaDeLaActiva === null) return;
    const pista = pistaRef.current;
    if (!pista) return;

    const llevar = () => {
      const ancho = pista.clientWidth;
      // Sin ancho todavía no hay a dónde ir: el navegador no terminó de
      // maquetar. Se reintenta en el cuadro siguiente en vez de calcular sobre
      // un cero, que dejaría la card activa fuera de la vista sin ningún error.
      if (!ancho) {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(llevar);
        return;
      }
      const suave = yaLlevoRef.current;
      yaLlevoRef.current = true;
      pista.scrollTo({ left: paginaDeLaActiva * ancho, behavior: suave ? "smooth" : "auto" });
      setPaginaVisible(paginaDeLaActiva);
    };
    llevar();
  }, [paginaDeLaActiva, controles.length]);

  if (controles.length === 0) return null;

  // Las encendidas que quedaron en otra página. Se calcula DESPUÉS del early
  // return porque necesita `paginaVisible`, que es estado, y antes de dibujar el
  // encabezado, que es donde se muestran.
  const fueraDeVista = activas.filter((c) => paginaDe(c.id) !== paginaVisible);

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
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <h2 id={etiquetaId} className="text-[12px] font-semibold sunmi-text-strong shrink-0">
          {titulo}
        </h2>

        {/* ── LA CINTA DE LO QUE ESTÁ FILTRANDO Y NO SE VE ───────────────────
            El problema que resuelve: el carrusel tiene tres páginas y solo una a
            la vista. Con una card encendida en otra página, la pantalla filtra
            por algo que no se ve — y con DOS encendidas, una de venta y una de
            compra, no existe ninguna página que las muestre juntas.

            ── POR QUÉ SOLO LAS QUE NO SE VEN ──────────────────────────────
            Porque una card que está a la vista ya se anuncia sola: tiene el
            anillo y el tinte del acento. Nombrarla otra vez arriba sería decir
            dos veces lo mismo y, sobre todo, le agregaría un renglón a "Para
            revisar" —que enciende una card por vez, siempre en la primera
            página— cuando esa pantalla no cambió.

            En la práctica: con un control activo y la página 1 a la vista, acá no
            hay nada, y el bloque se dibuja idéntico a como se dibujaba antes de
            que existieran las otras dos páginas.

            Los nombres salen de `controles`, o sea del catálogo del dominio. Acá
            no se escribe ni un rótulo. */}
        {fueraDeVista.length > 0 && (
          <span className="flex items-center gap-1 min-w-0 flex-wrap justify-end" role="status">
            {fueraDeVista.map((c) => (
              <SunmiPill key={c.id} color="amber">
                {c.titulo} {c.detalle}
              </SunmiPill>
            ))}
          </span>
        )}

        {cargando && (
          <span className="text-[10.5px] sunmi-text-muted shrink-0">calculando…</span>
        )}
      </div>

      {truncado && !cargando && (
        <div
          className="flex items-start gap-1.5 mb-1.5 text-xs leading-[1.35] sunmi-text-strong"
          role="status"
        >
          <TriangleAlert
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: colorDe("warning") }}
            aria-hidden="true"
          />
          <span>
            Conteo parcial: se miraron los primeros{" "}
            {techo ? techo.toLocaleString("es-AR") : "5.000"} productos. Puede
            haber más en cada control.
          </span>
        </div>
      )}

      <div
        ref={pistaRef}
        onScroll={alDesplazar}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {paginas.map((pagina, i) => (
          <div key={i} className="shrink-0 w-full snap-start pr-px">
            <div className="grid grid-cols-2 grid-rows-2 gap-1.5 auto-rows-fr">
              {pagina.map((control) => (
                <CardControl
                  key={control.id}
                  control={control}
                  activo={estaActivo(control.id)}
                  onSelect={onSelect}
                  truncado={truncado}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

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

export { TOKEN_POR_ROL, POR_PAGINA, TINTE_ACTIVO_PCT, ACENTO_ACTIVO, enPaginas };
