"use client";

// EL PIE DE PAGINACIÓN DEL KIT.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// De `components/productos/SunmiTablaProductos.jsx`, tal cual estaba y sin
// rediseñar nada. Vivía adentro de la tabla, así que la lista de tarjetas del
// catálogo —que es la misma pantalla vista en un celular— se quedó sin
// paginación: mostraba los primeros 25 productos de 2.600 y no había forma de
// pasar a la página siguiente. La tabla la tenía y la lista no.
//
// No se escribió una parecida al lado: dos paginadores no se rompen el día que
// se escriben, se rompen el día que uno cambia.
//
// ── Y AHORA TIENE DOS CARAS, QUE SIGUE SIENDO UN SOLO PAGINADOR ───────────
//
// Al mudarlo, la lista del celular heredó el pie de la TABLA: dos botones con la
// palabra escrita, "Página 1 / 95", "(2361 items)", un campo "Ir a" y los tres
// tamaños de página, todo en una fila que a 390 px se parte en tres renglones. Es
// un pie de escritorio metido en un teléfono — funciona, y se siente prestado.
//
// Acá hay DOS DISPOSICIONES del MISMO paginador, no dos paginadores:
//
//   · de 768 px para arriba, la de siempre, nodo por nodo y sin tocar un píxel;
//   · abajo, una compacta pensada para el pulgar.
//
// Los dos reciben los mismos ocho datos y llaman a los mismos manejadores. No hay
// forma de que uno pagine distinto que el otro, que es lo que este archivo existe
// para evitar.
//
// ── LO QUE NO SE TOCÓ, Y POR QUÉ ──────────────────────────────────────────
//
// La disposición de escritorio quedó IDÉNTICA, incluidos los hijos sueltos del
// texto de "Página N / M". **Juntar dos hijos de JSX en una sola cadena mueve
// píxeles**: el navegador moldea cada nodo de texto por separado, así que el
// interletraje del límite entre dos nodos pegados no se calcula igual que dentro
// de uno solo. En este repo eso ya movió 44 píxeles una vez, sin cambiar una sola
// letra.
//
// Lo único que se le agregó al contenedor de escritorio es `hidden md:flex`. A
// 768 px y más arriba eso resuelve a `flex`, que es lo que ya tenía: el nodo, sus
// hijos y sus otras clases quedan iguales.

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";

export default function SunmiPaginador({
  page,
  pageSize = 25,
  totalPages,
  totalItems = 0,
  onNext,
  onPrev,
  onGoToPage,
  onPageSizeChange,
}) {
  // "Ir a página": valida 1..totalPages y delega en onGoToPage.
  const [goToValue, setGoToValue] = useState("");
  const submitGoTo = () => {
    if (goToValue === "" || !onGoToPage) return;
    let n = parseInt(goToValue, 10);
    if (Number.isNaN(n)) { setGoToValue(""); return; }
    n = Math.min(Math.max(1, n), totalPages || 1);
    onGoToPage(n);
    setGoToValue("");
  };

  // ── EN EL CELULAR, "IR A" NO OCUPA LUGAR HASTA QUE SE LO PIDE ───────────
  //
  // Con 2.361 productos hay 95 páginas: llegar a la 40 a fuerza de "siguiente"
  // son 39 toques, así que la capacidad de saltar tiene que quedar. Lo que no
  // tiene que quedar es un formulario a la vista ocupando un renglón entero para
  // algo que se usa una vez cada tanto.
  //
  // El propio "Página 3 de 95" es el botón: se toca y se convierte en el campo.
  const [saltando, setSaltando] = useState(false);
  const cerrarSalto = () => {
    submitGoTo();
    setSaltando(false);
  };

  // Qué productos se están viendo. Es la pregunta que el pie de escritorio
  // contestaba con "(2361 items)" —el TOTAL, que ya está arriba en la línea de
  // contexto— y que en el teléfono no contestaba nadie: cuál es este pedazo.
  const desde = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, totalItems);

  return (
    <>
      {/* ══ CELULAR ═══════════════════════════════════════════════════════ */}
      {/* `data-paginador` es el asidero para recortar la foto a este bloque. El
          repo ya usa la misma idea con `[data-sunmi-modal]`: sin un selector
          estable, una captura de "el pie" termina apuntando a un `div` que
          mañana cambia de clase y retrata otra región sin avisar. */}
      <div data-paginador="celular" className="md:hidden px-1 py-2">
        <div className="flex items-center justify-center gap-3">
          {/* 44 px ESCRITOS, no `h-11`: en esta aplicación 1 rem son 14 px, así
              que `h-11` daría 38,5. Es el mismo número y el mismo motivo que las
              cards de "Para revisar" y la fila de acciones de la tarjeta. */}
          <SunmiButton
            color="slate"
            disabled={page <= 1}
            onClick={onPrev}
            aria-label="Página anterior"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center disabled:opacity-40"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </SunmiButton>

          {saltando ? (
            <form
              onSubmit={(e) => { e.preventDefault(); cerrarSalto(); }}
              className="flex items-center gap-1.5"
            >
              <SunmiInput
                type="text"
                inputMode="numeric"
                autoFocus
                value={goToValue}
                onChange={(e) => setGoToValue(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={cerrarSalto}
                placeholder={String(page)}
                className="w-20 !text-center min-h-[44px]"
                aria-label={`Ir a página, de 1 a ${totalPages}`}
              />
              {/* `text-sm2` ES 11 px: está declarado en `tailwind.config.js`.
                  Mismo píxel que escribir el valor a mano, sin sumar al contador
                  de medidas mágicas.

                  Y ojo con cómo se redacta este comentario: la primera versión
                  nombraba la clase escrita a mano como ejemplo, y **el contador la
                  contó desde acá adentro** — el trinquete informó un aumento que
                  no existía en el código. Es la cuarta vez en este repo que un
                  analizador de texto encuentra su patrón en prosa. */}
          <span className="text-sm2 sunmi-text-muted whitespace-nowrap">de {totalPages}</span>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { setGoToValue(""); setSaltando(true); }}
              disabled={!onGoToPage || totalPages <= 1}
              className="min-h-[44px] px-2 text-[13px] font-medium sunmi-text-strong [font-variant-numeric:tabular-nums] disabled:opacity-100"
              aria-label={
                totalPages > 1
                  ? `Página ${page} de ${totalPages}. Tocá para ir a otra página.`
                  : `Página ${page} de ${totalPages}`
              }
            >
              Página {page} de {totalPages}
            </button>
          )}

          <SunmiButton
            color="slate"
            disabled={page >= totalPages}
            onClick={onNext}
            aria-label="Página siguiente"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </SunmiButton>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-sm2 sunmi-text-muted [font-variant-numeric:tabular-nums]">
            {totalItems === 0 ? "sin resultados" : `viendo ${desde}–${hasta} de ${totalItems}`}
          </span>
          {onPageSizeChange && (
            <SunmiPageSizer value={pageSize} onChange={onPageSizeChange} />
          )}
        </div>
      </div>

      {/* ══ ESCRITORIO — IDÉNTICO A LO QUE HABÍA ═══════════════════════════ */}
      <div className="hidden md:flex items-center justify-between px-3 py-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <SunmiButton color="slate" disabled={page <= 1} onClick={onPrev}>
            « Anterior
          </SunmiButton>

          <span className="sunmi-text-muted text-[11px]">
            Página {page} / {totalPages}
            {totalItems > 0 && <span className="ml-1 opacity-70">({totalItems} items)</span>}
          </span>

          <SunmiButton color="slate" disabled={page >= totalPages} onClick={onNext}>
            Siguiente »
          </SunmiButton>

          {/* Ir directo a una página (valida 1..totalPages) */}
          {onGoToPage && totalPages > 1 && (
            <form
              onSubmit={(e) => { e.preventDefault(); submitGoTo(); }}
              className="flex items-center gap-1"
            >
              <span className="sunmi-text-muted text-[11px] whitespace-nowrap">Ir a</span>
              <SunmiInput
                type="text"
                inputMode="numeric"
                value={goToValue}
                onChange={(e) => setGoToValue(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={submitGoTo}
                placeholder={String(totalPages)}
                className="w-16 !text-center !py-1 text-[12px]"
                aria-label="Ir a página"
              />
            </form>
          )}
        </div>

        {onPageSizeChange && (
          <SunmiPageSizer value={pageSize} onChange={onPageSizeChange} />
        )}
      </div>
    </>
  );
}
