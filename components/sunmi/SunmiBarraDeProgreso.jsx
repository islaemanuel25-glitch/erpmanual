"use client";

// CUÁNTO SE LLEVA HECHO, EN UNA BARRA.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De la pantalla "Revisar de a uno" de las listas de proveedor
// (`app/modulos/proveedores/listas/[id]/revisar/page.jsx`), TAL CUAL ESTABA en
// producción hasta `8d5e1a69`, donde se llamaba `BarraDeProgreso`. Volvió a hacer
// falta en la revisión de una lista ("X de 158 listos", Emanuel, 2026-10-24), y
// por la regla del kit se sube acá en vez de escribir una parecida al lado.
//
// Las clases son las de allá: el carril en `sunmi-surface-soft` y el avance en
// `sunmi-bg-accent`, los dos del tema. El ancho va en estilo porque es un dato
// —un porcentaje cualquiera—, no una clase que Tailwind pueda generar.

/**
 * @param hechos  cuántos están hechos
 * @param total   de cuántos
 * @param etiqueta el texto para lectores de pantalla ("3 de 158 listos")
 */
export default function SunmiBarraDeProgreso({ hechos = 0, total = 0, etiqueta = undefined }) {
  const porcentaje = total > 0 ? Math.max(0, Math.min(100, (hechos / total) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full rounded-full sunmi-surface-soft overflow-hidden"
      role="progressbar"
      aria-valuenow={hechos}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={etiqueta ?? `${hechos} de ${total}`}
    >
      <div className="h-full sunmi-bg-accent rounded-full" style={{ width: `${porcentaje}%` }} />
    </div>
  );
}
