"use client";

// components/finanzas/ResumenDelPeriodo.jsx
//
// EL RESUMEN DEL PERÍODO: CELULAR Y ESCRITORIO, SOBRE EL MISMO `resumen`.
//
// ── DOS DIBUJOS, UN SOLO DATO ────────────────────────────────────────────
//
// El diseño aprobado en Figma es SOLO de celular; escritorio todavía no tiene
// diseño y conserva la presentación de antes (`ResumenDelPeriodoEscritorio`).
// Los dos reciben el MISMO objeto `resumen` desde acá —ninguno lo recalcula ni
// lo arma: la fórmula vive en `resumenDelPeriodo`, en el servidor— y comparten
// sus piezas (`PiezasDelResumen.jsx`).
//
// ── CÓMO SE ELIGE: CON LAS CLASES, COMO EL RESTO DEL ERP ─────────────────
//
// Es el patrón de `SunmiPaginador`: los dos dibujos van en el DOM y el
// breakpoint `md` (768 px) decide cuál se ve —`md:hidden` el de celular,
// `hidden md:block` el de escritorio—. Es la misma frontera que ya usa
// Finanzas: la fila del shell es `md:hidden`. No se usa `useEsEscritorio`
// porque ése devuelve `null` en el primer render y decide COMPORTAMIENTO; acá
// lo que cambia es solo el dibujo, y el CSS lo resuelve sin un render
// intermedio. `data-resumen` es el asidero para los candados y las capturas.

import ResumenDelPeriodoEscritorio from "./ResumenDelPeriodoEscritorio";
import ResumenDelPeriodoMovil from "./ResumenDelPeriodoMovil";

export default function ResumenDelPeriodo({ resumen, descripcion }) {
  if (!resumen) return null;

  return (
    <>
      <div data-resumen="celular" className="md:hidden">
        <ResumenDelPeriodoMovil resumen={resumen} />
      </div>
      <div data-resumen="escritorio" className="hidden md:block">
        <ResumenDelPeriodoEscritorio resumen={resumen} descripcion={descripcion} />
      </div>
    </>
  );
}
