"use client";

// EL BOTÓN "DESCARGAR PDF" DE UN PEDIDO AL DEPÓSITO (2026-11-02).
//
// Lo usan las cuatro pantallas que muestran un pedido: "Ver pedido" del local
// y el detalle de un pedido anterior, y la hoja "Más acciones" de preparar en
// el celular y en la computadora. El PDF lo arma el servidor
// (`/api/pedidos/pdf/[id]`); acá solo se baja, con `descargar` de
// `lib/compartir/compartirArchivo.js`, y con el nombre que pone la ruta.
//
// Un error se dice debajo del botón, no se traga: un botón que no hace nada al
// tocarlo es el defecto del INC-0006 (igual que `PanelListaDePrecios`).

import { useState } from "react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { descargar } from "@/lib/compartir/compartirArchivo";

export const TEXTO_DESCARGAR_PDF = "Descargar PDF";

/** El nombre que manda la ruta en `Content-Disposition`, o uno con el número. */
export function nombreDeLaRespuesta(encabezado, posId) {
  const m = /filename="?([^";]+)"?/i.exec(encabezado || "");
  return m ? m[1] : `pedido-${posId}.pdf`;
}

/**
 * @param {number} posId
 * @param {string} [className] la del botón, para que se pare como las otras acciones de la pantalla
 * @param {func} [onBajado] después de bajarlo (la hoja de "Más acciones" se cierra)
 */
export default function BotonDescargarPdfPedido({ posId, className = "", onBajado }) {
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");

  const bajar = async () => {
    setBajando(true);
    setError("");
    try {
      const res = await fetch(`/api/pedidos/pdf/${encodeURIComponent(posId)}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `El servidor no pudo armar el PDF (error ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      descargar(blob, nombreDeLaRespuesta(res.headers.get("Content-Disposition"), posId));
      onBajado?.();
    } catch {
      setError("No se pudo bajar el PDF: sin conexión.");
    } finally {
      setBajando(false);
    }
  };

  return (
    <>
      <SunmiButton color="slate" onClick={bajar} disabled={bajando || !posId} className={className}>
        {bajando ? "Armando el PDF..." : TEXTO_DESCARGAR_PDF}
      </SunmiButton>
      {error ? <p className="text-sm2 sunmi-text-danger">{error}</p> : null}
    </>
  );
}
