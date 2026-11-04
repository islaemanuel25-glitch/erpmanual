"use client";

// «QUÉ PRODUCTO ES», PARA UN RENGLÓN DE LA LISTA SIN PRODUCTO.
//
// Es la hoja de la recepción —`HojaCorregirLinea` con una línea sin vincular,
// que dibuja su `ElegirProducto`— copiada del lado de listas (Emanuel,
// 2026-11-04: "misma tarjeta, mismas hojas, mismo flujo"). Las originales no se
// tocan. Se copian:
//
//   · el modal: `SunmiModalLayout` en forma de hoja, con el mismo nivel, el
//     mismo `destructivo` y el mismo `gap-renglon` entre bloques;
//   · el cuerpo: "Qué producto es", lo que dice el renglón, y el buscador
//     abierto de entrada —en la recepción se abre solo cuando el motor no
//     encontró ningún candidato, que es exactamente el caso de una fila sin
//     producto—;
//   · `BuscadorProducto`, la misma pieza: primero los productos de ese
//     proveedor, después "todo el catálogo", y ahí «Crear producto»;
//   · el alta: `AltaDesdeLaLista`, la hermana de `AltaDesdeElPapel`.
//
// Elegir o crear vuelven por `onVincular(fila, productoBaseId)`, que es la ruta
// `filas/[filaId]/vincular`. Si falla, el error queda en la hoja.

import { useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { BuscadorProducto } from "@/components/comprobantes/PiezasConciliacion";
import AltaDesdeLaLista from "@/components/proveedores/listas/AltaDesdeLaLista";
import { textoParaBuscarAMano } from "@/lib/compras-proveedor/comprobante/vinculo";

export default function HojaQueProductoEsDeLaLista({
  fila,
  abierta,
  onCerrar,
  /** Vincula el renglón a un producto. Devuelve `{ ok, error? }`. */
  onVincular,
  guardando = false,
  proveedorId = null,
  proveedorNombre = null,
  /** Con el permiso de crear productos, "todo el catálogo" ofrece «Crear producto». */
  puedeCrearProducto = false,
}) {
  const [buscando, setBuscando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");

  if (!fila) return null;

  const elegir = async (productoBaseId) => {
    setError("");
    const r = await onVincular?.(fila, productoBaseId);
    if (r && r.ok === false) setError(r.error || "No se pudo vincular.");
  };

  return (
    <SunmiModalLayout
      open={!!abierta}
      title={fila.descripcionProveedor || fila.codigoCrudo || "Renglón de la lista"}
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      forma="hoja"
      destructivo
      espacioCuerpo="gap-renglon"
    >
      <div className="flex flex-col gap-renglon">
        <span className="text-sm3 font-medium sunmi-text-strong">Qué producto es</span>
        <span className="text-sm3 sunmi-text-muted break-words">
          La lista dice “{fila.descripcionProveedor || "—"}”{fila.codigoCrudo ? ` · código ${fila.codigoCrudo}` : ""}.
        </span>

        {buscando ? (
          <BuscadorProducto
            proveedorId={proveedorId}
            proveedorNombre={proveedorNombre}
            textoInicial={textoParaBuscarAMano(fila.descripcionProveedor)}
            onElegir={(p) => elegir(p.baseId ?? p.productoBaseId ?? p.id)}
            onCancelar={() => setBuscando(false)}
            onCrearProducto={puedeCrearProducto ? () => setCreando(true) : null}
          />
        ) : (
          <>
            <span className="text-sm3 sunmi-text-muted">El motor no encontró ninguno parecido. Buscalo a mano.</span>
            <SunmiButton
              color="ghost"
              type="button"
              onClick={() => setBuscando(true)}
              className="w-full min-h-toque justify-center text-sm3 sunmi-text-accent"
            >
              Buscar
            </SunmiButton>
          </>
        )}

        {error && <span className="text-sm3 sunmi-text-danger">{error}</span>}

        {creando && (
          <AltaDesdeLaLista
            fila={fila}
            proveedorId={proveedorId}
            onCancelar={() => setCreando(false)}
            onCreado={async (producto) => {
              // El producto ya existe: el alta se cierra pase lo que pase con
              // el vínculo, y si el vínculo falla lo dice esta hoja.
              setCreando(false);
              await elegir(producto.id);
            }}
          />
        )}

        <SunmiButton
          color="slate"
          type="button"
          disabled={guardando}
          onClick={onCerrar}
          className="w-full min-h-toque justify-center text-sm3"
        >
          Cancelar
        </SunmiButton>
      </div>
    </SunmiModalLayout>
  );
}
