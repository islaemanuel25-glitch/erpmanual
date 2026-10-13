"use client";

// components/pos-ventas/AvisoProductoNoEncontrado.jsx
//
// EL AVISO DE "PRODUCTO NO ENCONTRADO" DEL ESCÁNER DEL POS.
//
// Bloqueante a propósito: el defecto que lo trajo es que un código sin producto
// quedaba escrito en el buscador sin que nadie lo notara, y el producto no se
// cobraba. La decisión de cuándo se abre está en `lib/pos-ventas/lecturaEscaner.js`.
//
// ── POR QUÉ SE TRAGA EL TECLADO ENTERO MIENTRAS ESTÁ ABIERTO ────────────────
//
// El escáner es un teclado que termina cada lectura con Enter. Si las teclas
// llegaran al botón "Entendido", la lectura siguiente lo apretaría sola y el
// aviso se cerraría sin que el cajero lo vea — el mismo defecto por otra puerta.
// Por eso se cierra solo tocando el botón: ni Enter, ni Escape, ni el velo.
//
// `destructivo`: lo que se pierde al cerrarlo sin querer es justamente el
// aviso, y con él un producto sin cobrar.

import { useEffect } from "react";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";

export const TITULO_NO_ENCONTRADO = "Producto no encontrado";

/**
 * `codigos`: los leídos sin producto. Casi siempre uno; más de uno solo si una
 * búsqueda en vuelo vuelve vacía con el aviso ya abierto. Vacío es cerrado.
 */
export default function AvisoProductoNoEncontrado({ codigos = [], onEntendido }) {
  const abierto = codigos.length > 0;

  useEffect(() => {
    if (!abierto) return undefined;
    const tragar = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", tragar, true);
    window.addEventListener("keypress", tragar, true);
    return () => {
      window.removeEventListener("keydown", tragar, true);
      window.removeEventListener("keypress", tragar, true);
    };
  }, [abierto]);

  return (
    <SunmiModalLayout
      open={abierto}
      title={TITULO_NO_ENCONTRADO}
      showCloseButton={false}
      destructivo
      z={NIVEL_MODAL_GLOBAL}
      espacioCuerpo="mt-2"
      maxWidth="max-w-md"
      role="alertdialog"
      footer={
        <SunmiButton color="red" onClick={onEntendido} className="w-full min-h-toque">
          Entendido
        </SunmiButton>
      }
    >
      <div className="sunmi-state-danger rounded-xl p-4 text-center">
        <div className="text-sm3 sunmi-text-danger font-semibold">
          {codigos.length > 1
            ? "Estos códigos no corresponden a ningún producto"
            : "Este código no corresponde a ningún producto"}
        </div>
        {codigos.map((codigo) => (
          <div key={codigo} className="text-xl3 sunmi-text-danger font-bold break-all mt-2" data-codigo-leido>
            {codigo}
          </div>
        ))}
      </div>
    </SunmiModalLayout>
  );
}
