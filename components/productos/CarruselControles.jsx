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

// ── LAS DOS VARIANTES DE CARD, Y NO SON UN DETALLE DE COLOR ────────────────
//
// `alerta` es lo que esta pieza siempre hizo: la card cuenta trabajo pendiente,
// así que un cero es una buena noticia y se dice — verde, tilde, y el texto
// cambia a "al día" o "sin pendientes". Es el default, y por eso "Para revisar"
// y "Estado del stock" no pasan el prop y siguen exactamente igual.
//
// `clasificacion` es la card que reparte el catálogo en categorías. Ahí un cero
// no es un logro ni un problema: "0 productos vendidos por kg" es un dato, y
// pintarlo de verde con un tilde afirmaría algo que nadie dijo — que ese cero
// está bien—. Tampoco tiene `detalleSano`, porque no hay una segunda cosa que
// decir cuando no hay ninguno.
//
// Lo que las dos comparten sin excepción es el ESTADO ACTIVO: el acento del
// theme, el anillo y el tinte del fondo salen del mismo lugar. Escribir un
// resaltado parecido para el bloque nuevo habría sido la forma de que un día se
// separen.
export const VARIANTE_ALERTA = "alerta";
export const VARIANTE_CLASIFICACION = "clasificacion";

function CardControl({ control, activo, onSelect, truncado = false, variante = VARIANTE_ALERTA }) {
  // Solo la variante de alerta afirma salud. En clasificación, `sano` es siempre
  // falso, así que el color cae en `control.rol` —que estas cards no traen— y de
  // ahí al neutro, sin ninguna rama de color escrita aparte.
  const sano = variante === VARIANTE_ALERTA && !truncado && control.cantidad === 0;
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
  // La variante de las cards. El default es la de siempre, así que las dos
  // pantallas que ya usaban esta pieza no cambian ni un píxel.
  variante = VARIANTE_ALERTA,
}) {
  const paginas = enPaginas(controles);

  // ── `activo` ACEPTA UNO O VARIOS, Y ESO ES LO QUE PERMITE COMBINAR ────────
  //
  // "Para revisar" y "Estado del stock" encienden una card por vez y siguen
  // pasando un id suelto. Presentaciones enciende hasta dos —una de venta y una
  // de compra, que son una intersección— y pasa un arreglo.
  //
  // Se resuelve acá y no en cada llamador: la alternativa era que el bloque nuevo
  // trajera su propio carrusel para poder marcar dos, que es exactamente la copia
  // al lado que esta pieza existe para no tener.
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
  const paginaDeLaActiva =
    activas.length === 1
      ? Math.floor(controles.findIndex((c) => c.id === activas[0].id) / POR_PAGINA)
      : null;

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

        {/* ── LA CINTA DE LO QUE ESTÁ FILTRANDO ──────────────────────────────
            El problema que resuelve: con una sola card encendida el carrusel ya
            lleva a su página, pero con DOS —una de venta y una de compra— están
            en páginas distintas y no hay ninguna que las muestre juntas. Sin
            esto, la pantalla filtra por algo que no se ve.

            Va solo en la variante de clasificación: "Para revisar" enciende una
            card por vez y siempre está a la vista, así que no le hace falta — y
            agregársela le movería píxeles a una pantalla que no cambió.

            Los nombres salen de `activas`, o sea del catálogo del dominio. Acá
            no se escribe ni un rótulo. */}
        {variante === VARIANTE_CLASIFICACION && activas.length > 0 && (
          <span className="flex items-center gap-1 min-w-0 flex-wrap justify-end" role="status">
            {activas.map((c) => (
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
                  variante={variante}
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
