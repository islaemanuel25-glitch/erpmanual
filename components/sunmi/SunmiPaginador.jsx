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
// ── LO QUE NO SE TOCÓ, Y POR QUÉ ──────────────────────────────────────────
//
// El JSX está copiado nodo por nodo, incluidos los hijos sueltos del texto de
// "Página N / M". **Juntar dos hijos de JSX en una sola cadena mueve píxeles**:
// el navegador moldea cada nodo de texto por separado, así que el interletraje
// del límite entre dos nodos pegados no se calcula igual que dentro de uno solo.
// En este repo eso ya movió 44 píxeles una vez, sin cambiar una sola letra.
//
// Comprobado midiendo la caja de los catorce nodos del bloque antes y después de
// la mudanza: idénticas las catorce.

import { useState } from "react";

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

  return (
    <div className="flex items-center justify-between px-3 py-2 flex-wrap gap-2">
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

      <SunmiPageSizer value={pageSize} onChange={(size) => onPageSizeChange?.(size)} />
    </div>
  );
}
