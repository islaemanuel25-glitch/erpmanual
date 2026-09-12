"use client";

// UN PRODUCTO DEL CATÁLOGO DEL ORIGEN, COMO FILA DE LA LISTA DE RECEPCIÓN.
//
// ── POR QUÉ EXISTE COMO ARCHIVO PROPIO ───────────────────────────────────
//
// Esta fila vivía adentro de `AgregarProductoRecibido`, que es un modal. El V16
// saca ese modal del camino del teléfono: los resultados del catálogo aparecen
// como filas de la MISMA lista, debajo del aviso de "no figura", y tocar una
// agrega la línea.
//
// El motivo es concreto y salió de usarlo: eran DOS búsquedas para lo mismo. Se
// escribía en el buscador de la pantalla, la pantalla avisaba que el producto no
// estaba, había que tocar un botón, se abría un modal, y **había que volver a
// escribir lo mismo**. Con la mercadería en la mano, eso es tipear dos veces
// para informar una caja.
//
// Se extrae en vez de duplicarse porque el modal sigue existiendo para
// escritorio: allá la lista y la ficha van lado a lado y el panel no estorba. Si
// hubiera dos filas, el día que una cambie el teléfono y la computadora dirían
// cosas distintas sobre el mismo producto.
//
// ── QUÉ NO MUESTRA, Y ES PARTE DEL CONTRATO ──────────────────────────────
//
// Ni stock ni costo del origen. `transferencias.recibir` no es el permiso de ver
// stock ni costos, y el endpoint dejó de mandarlos a propósito. Lo que hace
// falta para identificar lo que uno tiene en la mano es el nombre, el código y
// en qué presentación viene.
//
// El PRECIO sí va, a la derecha: es el precio de venta del catálogo del origen,
// y es lo que deja estimar qué impacto tiene lo que se está por agregar. Cuando
// el endpoint no lo manda, no se dibuja — no se inventa un cero, que es lo que
// ya pasó una vez con "Stock origen 0".

import SunmiButton from "@/components/sunmi/SunmiButton";
import { formatearMoneda } from "@/lib/moneda";

/** El rótulo de la sección, exportado para que el candado no lo escriba a mano. */
export const ROTULO_CATALOGO = "EN EL CATÁLOGO";

/** La acción de cada fila. Corta: la fila entera es el área tocable. */
export const ACCION_AGREGAR_FILA = "Agregar +";

export default function FilaCatalogoRecepcion({ p, onElegir, agregando = false }) {
  const factor = Number(p?.factorPack || 1);
  const precio = p?.precioVenta ?? p?.precio ?? null;

  return (
    <SunmiButton
      color="slate"
      onClick={() => onElegir?.(p)}
      disabled={agregando}
      className="w-full !justify-start text-left"
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="block min-w-0">
          <span className="block font-semibold sunmi-text-strong break-words">{p?.nombre}</span>
          <span className="block text-sm2 sunmi-text-muted">
            <span className="font-mono">{p?.codigoBarra || "Sin código"}</span>
            {" · "}
            {factor > 1 ? `PACK x${factor}` : "Unidad"}
            {p?.categoriaNombre ? ` · ${p.categoriaNombre}` : ""}
          </span>
        </span>

        <span className="shrink-0 text-right">
          {precio != null && (
            <span className="block tabular-nums sunmi-text-strong">{formatearMoneda(precio)}</span>
          )}
          <span className="block text-sm2 sunmi-link-accent">{ACCION_AGREGAR_FILA}</span>
        </span>
      </span>
    </SunmiButton>
  );
}
