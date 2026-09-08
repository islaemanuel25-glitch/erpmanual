"use client";

// UNA FILA DE CHIPS PARA FILTRAR POR UNA TAXONOMÍA.
//
// ── POR QUÉ NO ALCANZABA CON LO QUE HABÍA ─────────────────────────────────
//
// `SunmiSelectorUnidad` es el control de DOS opciones que se alternan seguido:
// dos botones pegados, los dos siempre a la vista. Con diez categorías eso no
// funciona — a 360 px no entran, y `flex` sin scroll las aplasta hasta que el
// texto queda ilegible.
//
// Y un `SunmiSelectAdv` tampoco: esconde las opciones detrás de dos toques, y lo
// que hace útil a un filtro por categoría es VER de un vistazo qué categorías
// hay. Con la mercadería en la mano, abrir un desplegable para descubrir que
// "Limpieza" no vino en este remito es peor que no tener el filtro.
//
// Así que la fila SCROLLEA en horizontal. Es el patrón que ya se usa en
// cualquier teléfono para una lista de filtros: se ven los primeros, se arrastra
// para ver el resto, y ninguno se aplasta.
//
// ── QUÉ NO SABE ──────────────────────────────────────────────────────────
//
// Qué se está filtrando. Recibe opciones con clave y texto, dice cuál está
// elegida y avisa cuando cambia. No sabe de categorías, de productos ni de
// recepción: la pantalla que la usa arma las opciones.

import SunmiButton from "@/components/sunmi/SunmiButton";

/** La opción "todas", que casi todo filtro necesita y nadie debería reescribir. */
export const CLAVE_TODAS = "__todas__";

export default function SunmiChipsFiltro({
  opciones = [],
  /** `null` o `CLAVE_TODAS` = sin filtrar. */
  valor = null,
  onCambiar,
  rotulo = null,
  /** Texto del chip que limpia el filtro. `null` lo oculta. */
  textoTodas = "Todas",
  className = "",
}) {
  const elegida = valor == null ? CLAVE_TODAS : String(valor);

  const todas = textoTodas ? [{ clave: CLAVE_TODAS, texto: textoTodas }] : [];
  const lista = [...todas, ...opciones];
  if (lista.length === 0) return null;

  return (
    <div className={className}>
      {rotulo && <div className="text-sm2 sunmi-text-muted mb-1">{rotulo}</div>}
      {/* `overflow-x-auto` y chips que no se encogen: con muchas opciones se
          arrastra en vez de aplastarse. `-mx-1 px-1` para que el chip del borde
          no quede cortado contra el margen de la tarjeta. */}
      <div
        role="group"
        aria-label={rotulo || undefined}
        className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1"
      >
        {lista.map((o) => {
          const clave = String(o.clave);
          const activa = clave === elegida;
          return (
            <SunmiButton
              key={clave}
              type="button"
              color={activa ? "primary" : "slate"}
              aria-pressed={activa}
              onClick={() => onCambiar?.(clave === CLAVE_TODAS ? null : clave)}
              className="shrink-0"
            >
              {o.texto}
              {/* El conteo va adentro del chip: saber cuántos hay antes de
                  tocarlo es la mitad de para qué sirve el filtro. */}
              {o.cantidad != null && <span className="sunmi-text-muted"> ({o.cantidad})</span>}
            </SunmiButton>
          );
        })}
      </div>
    </div>
  );
}
