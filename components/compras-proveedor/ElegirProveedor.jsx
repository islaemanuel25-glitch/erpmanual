"use client";

// ELEGIR PROVEEDOR — el primer paso de un pedido nuevo.
//
// ── POR QUÉ NO ES UN DESPLEGABLE ───────────────────────────────────────────
//
// A esta pantalla se entra a hacer UNA sola cosa: elegir a quién se le compra.
// Con `SunmiSelectAdv` había que abrir el desplegable para recién ahí poder
// escribir, o sea un toque de más antes de la primera letra, y la lista vivía
// adentro de una capa que tapa el resto. Acá el buscador ya está abierto, con
// el foco puesto, y la lista ocupa la pantalla.
//
// El orden de los proveedores es el que llega: el que decide es quien arma la
// consulta, no esta pantalla.
//
// ── EL TÍTULO Y EL VOLVER NO SE DIBUJAN ACÁ ────────────────────────────────
//
// Los pone el shell. El título porque ya lo resuelve la ruta —dibujarlo otra
// vez adentro del contenido era verlo DOS veces— y el botón de volver por el
// slot de acción de página, que lo deja fijo arriba a la derecha. Dentro del
// contenido, volver se va de pantalla apenas la lista baja.

import { useMemo, useRef, useEffect } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiListItem from "@/components/sunmi/SunmiListItem";

/**
 * @param proveedores  [{ id, nombre }] en el orden en que se muestran.
 * @param filtro       texto del buscador (lo gobierna la pantalla de arriba).
 * @param onFiltro     recibe el texto nuevo.
 * @param onElegir     recibe el id del proveedor elegido.
 */
export default function ElegirProveedor({
  proveedores = [],
  filtro = "",
  onFiltro,
  onElegir,
}) {
  const campo = useRef(null);

  // El foco al entrar: se entra a escribir un nombre, no a mirar la lista.
  useEffect(() => {
    campo.current?.focus();
  }, []);

  const visibles = useMemo(() => {
    const q = String(filtro).trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((p) => String(p.nombre ?? "").toLowerCase().includes(q));
  }, [proveedores, filtro]);

  const total = proveedores.length;
  const hayFiltro = String(filtro).trim() !== "";

  // "12 proveedores" cuando no se filtró; "2 de 12" cuando sí. El total NO
  // desaparece al filtrar: es lo que deja saber cuánto quedó afuera.
  const conteo = hayFiltro
    ? `${visibles.length} de ${total}`
    : `${total} ${total === 1 ? "proveedor" : "proveedores"}`;

  return (
    <div className="flex flex-col gap-3">
      <SunmiInput
        ref={campo}
        type="text"
        inputMode="search"
        placeholder="Buscar proveedor"
        aria-label="Buscar proveedor"
        value={filtro}
        onChange={(e) => onFiltro?.(e.target.value)}
        className="w-full"
      />

      <p className="text-sm2 sunmi-text-muted">{conteo}</p>

      {visibles.length === 0 ? (
        <SunmiCard className="p-4">
          <p className="text-sm3 sunmi-text-strong">No hay ningún proveedor con ese nombre</p>
          <p className="text-sm2 sunmi-text-muted mt-1">Probá con menos letras.</p>
        </SunmiCard>
      ) : (
        <SunmiCard className="p-0 overflow-hidden">
          <ul className="flex flex-col">
            {visibles.map((p) => (
              <li key={p.id}>
                <SunmiListItem
                  label={p.nombre}
                  clickable
                  onClick={() => onElegir?.(String(p.id))}
                />
              </li>
            ))}
          </ul>
        </SunmiCard>
      )}
    </div>
  );
}
