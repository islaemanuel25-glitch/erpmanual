"use client";

// Las tres piezas que quedan de la versión anterior del módulo.
//
// ── QUÉ SE FUE Y POR QUÉ ────────────────────────────────────────────────────
//
// Este archivo tenía catorce piezas y once eran para la pantalla vieja del
// detalle: el badge de estado, el aviso de variación, el motivo, la sugerencia,
// las métricas, la casilla de selección, la fila de tabla y la tarjeta móvil.
// Esa pantalla se eliminó entera —era de la versión anterior y Emanuel llegaba a
// ella sin querer, desde "Ver los N" y desde un "Volver al historial"— así que
// sus piezas se van con ella.
//
// Quedan tres, que son las que usan las pantallas nuevas: el vacío, el error
// recuperable y la paginación del historial. Se comprobó una por una con
// `git grep` antes de borrar: las otras once no las importa nadie.
//
// Todo el color sale de tokens semánticos del sistema de temas. Ninguna clase de
// color literal: el ERP tiene ocho temas y un `text-red-500` que se lee en uno
// puede ser ilegible en otro.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

/** Nada que mostrar, dicho sin que parezca un error. */
export function Vacio({ titulo, detalle, accion = null }) {
  return (
    <SunmiCard className="p-6 text-center space-y-2">
      <p className="text-sm font-semibold sunmi-text-strong">{titulo}</p>
      {detalle && <p className="text-sm2 sunmi-text-muted">{detalle}</p>}
      {accion}
    </SunmiCard>
  );
}

/** Error recuperable: dice qué pasó y ofrece reintentar. */
export function ErrorRecuperable({ mensaje, onReintentar }) {
  return (
    <SunmiCard className="p-6 text-center space-y-3">
      <p className="text-sm sunmi-text-danger">{mensaje}</p>
      {onReintentar && (
        <SunmiButton color="slate" onClick={onReintentar} className="px-4 min-h-toque text-sm2">
          Reintentar
        </SunmiButton>
      )}
    </SunmiCard>
  );
}

/** Paginación real: no carga todo y lo pagina en memoria. */
export function Paginacion({ page, paginas, total, onPage, cargando = false }) {
  if (!paginas || paginas <= 1) {
    return (
      <p className="text-xs2 sunmi-text-muted text-center py-2">
        {total ?? 0} {total === 1 ? "registro" : "registros"}
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <SunmiButton
        color="slate"
        onClick={() => onPage(page - 1)}
        disabled={cargando || page <= 1}
        className="px-3 min-h-toque text-sm2 disabled:opacity-40"
      >
        Anterior
      </SunmiButton>
      <span className="text-xs2 sunmi-text-muted tabular-nums">
        Página {page} de {paginas} · {total} registros
      </span>
      <SunmiButton
        color="slate"
        onClick={() => onPage(page + 1)}
        disabled={cargando || page >= paginas}
        className="px-3 min-h-toque text-sm2 disabled:opacity-40"
      >
        Siguiente
      </SunmiButton>
    </div>
  );
}
