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
//
// ── LAS MEDIDAS SALEN DEL DISEÑO, Y SE ESCRIBEN CON TOKENS ─────────────────
//
// El buscador va de 44 px de alto —`min-h-toque`, que es el mínimo que se
// toca con el pulgar sin fallar— con 14 px a los costados y texto de 17.
// `SunmiInput` NO se toca: sus 247 usos se quedan como están. Lo que hace que
// la pantalla mande es la cascada —una utilidad de Tailwind le gana a la clase
// del kit—, que es justamente lo que `scripts/sonda-cascada.mjs` verifica en
// cada despliegue. `componerClaseInput` no interviene acá: ese módulo negocia
// el ANCHO y nada más.
//
// La fila va de 60 px exactos con `h-fila`, que es un token del config. No se
// puede escribir con la escala de espaciado: con `1rem = 14px` los pasos son
// múltiplos de 3,5 y 60 no cae en la grilla.

import { useMemo, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";

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
    <div className="flex flex-col">
      {/* El buscador DECLARA su alto, su padding y su letra; el kit los cede. */}
      <SunmiInput
        ref={campo}
        type="text"
        inputMode="search"
        placeholder="Buscar proveedor"
        aria-label="Buscar proveedor"
        value={filtro}
        onChange={(e) => onFiltro?.(e.target.value)}
        className="w-full min-h-toque px-4 text-lg2"
      />

      <p className="text-sm3 sunmi-text-muted pt-2.5 pb-2">{conteo}</p>

      {visibles.length === 0 ? (
        <SunmiCard className="rounded-xl px-4 py-3">
          <p className="text-sm3 font-medium sunmi-text-strong">
            No hay ningún proveedor con ese nombre
          </p>
          <p className="text-sm2 sunmi-text-muted mt-1">Probá con menos letras.</p>
        </SunmiCard>
      ) : (
        <SunmiCard className="rounded-xl p-0 overflow-hidden">
          <ul className="flex flex-col">
            {visibles.map((p, i) => (
              // El separador va ARRIBA de cada fila menos la primera: así no
              // queda una línea colgando abajo de la última, contra el borde de
              // la tarjeta, que es donde se ve como un error.
              <li key={p.id} className={i > 0 ? "border-t sunmi-divider" : ""}>
                <SunmiListItem
                  label={p.nombre}
                  clickable
                  onClick={() => onElegir?.(String(p.id))}
                  className="h-fila px-4 py-3 gap-3.5 font-medium"
                  right={
                    <ChevronRight size={20} className="sunmi-text-muted" aria-hidden="true" />
                  }
                />
              </li>
            ))}
          </ul>
        </SunmiCard>
      )}
    </div>
  );
}
