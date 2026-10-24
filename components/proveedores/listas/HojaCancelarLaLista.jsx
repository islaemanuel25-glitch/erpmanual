"use client";

// "CANCELAR LA LISTA": CANCELAR UNA LISTA QUE YA APLICÓ PRECIOS (Emanuel,
// 2026-10-24).
//
// Terminar deja la lista como está. Cancelar es "esto no servía": deshace lo
// que la lista aplicó, con la reversión de siempre, y la cierra como Cancelada.
// Esta hoja dice cuántos precios vuelven a su costo anterior y cuáles quedan
// como están porque alguien los tocó a mano después; «Cancelar y deshacer» lo
// hace en una sola transacción (`cancelar/route.js`).
//
// La previa es la de «Deshacer» (GET /revertir), y sus tres números viajan con
// el pedido: si cambiaron mientras la hoja estaba abierta, el servidor no
// escribe nada. La pieza es la confirmación del kit en forma de hoja, la misma
// de "Te quedan precios sin aplicar".

import { useEffect, useState } from "react";

import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { Aviso } from "@/components/proveedores/listas/PiezasPantallas";
import { MOTIVO_OMISION } from "@/lib/proveedores/listas/reversion";

export const TITULO_CANCELAR_LA_LISTA = "Cancelar la lista";
export const TEXTO_CANCELAR_Y_DESHACER = "Cancelar y deshacer";
export const TEXTO_TOCADOS_A_MANO = "Estos se tocaron a mano después y quedan como están:";

/** El renglón de lo que se deshace. */
export function textoDeLoQueSeDeshace(revierten) {
  const n = Number(revierten) || 0;
  if (n === 0) return "No se deshace ningún precio: los que aplicaste ya no son los de esta lista.";
  if (n === 1) return "Se deshace el precio que aplicaste: vuelve a su costo anterior.";
  return `Se deshacen los ${n} precios que aplicaste: vuelven a su costo anterior.`;
}

/** Los tres números de la previa, que el servidor vuelve a calcular. */
export function confirmacionDeLaPrevia(previa) {
  const r = previa?.resumen;
  if (!r) return null;
  return { revierten: r.revierten, ventasQueSeTocan: r.ventasQueSeTocan, omitidos: r.omitidos };
}

/**
 * @param importacionId  la lista
 * @param onCancelada    con la respuesta de `cancelar`, cuando salió
 * @param onVolver
 */
export default function HojaCancelarLaLista({ importacionId, onCancelada, onVolver }) {
  const [cargando, setCargando] = useState(true);
  const [previa, setPrevia] = useState(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (!importacionId) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/proveedores/listas/${importacionId}/revertir`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !j?.ok) setError(j?.error || `No se pudo calcular qué se deshace (error ${r.status}).`);
        else setPrevia(j);
      } catch {
        if (vivo) setError("No se pudo conectar con el servidor. Probá de nuevo.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [importacionId]);

  const cancelar = async () => {
    const confirmacion = confirmacionDeLaPrevia(previa);
    if (!confirmacion) return;
    setTrabajando(true);
    setError("");
    try {
      const r = await fetch(`/api/proveedores/listas/${importacionId}/cancelar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacion }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error || `No se pudo cancelar (error ${r.status}).`);
        return;
      }
      await onCancelada?.(j);
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  };

  const omitidos = previa?.omitidos ?? [];
  const tocados = omitidos.filter((o) => o.motivo === MOTIVO_OMISION.COSTO_CAMBIADO);
  const otros = omitidos.filter((o) => o.motivo !== MOTIVO_OMISION.COSTO_CAMBIADO);

  return (
    <SunmiHojaDeConfirmacion
      forma="hoja"
      titulo={TITULO_CANCELAR_LA_LISTA}
      puntos={previa ? [textoDeLoQueSeDeshace(previa.resumen?.revierten)] : []}
      textoConfirmar={TEXTO_CANCELAR_Y_DESHACER}
      textoTrabajando="Cancelando…"
      colorConfirmar="peligro"
      trabajando={trabajando}
      confirmarDeshabilitado={!previa}
      onConfirmar={cancelar}
      onVolver={onVolver}
    >
      {cargando ? <SunmiLoader /> : null}
      {tocados.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm3 sunmi-text-strong leading-snug">{TEXTO_TOCADOS_A_MANO}</p>
          <ul className="space-y-1">
            {tocados.map((o) => (
              <li key={o.productoBaseId} className="text-sm2 sunmi-text-muted leading-snug break-words">
                {o.nombre ?? `Producto #${o.productoBaseId}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {otros.length > 0 ? (
        <ul className="space-y-1">
          {otros.map((o) => (
            <li key={o.productoBaseId} className="text-sm2 sunmi-text-muted leading-snug break-words">
              <span className="sunmi-text-strong">{o.nombre ?? `Producto #${o.productoBaseId}`}</span>: {o.texto}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <Aviso tono="danger">{error}</Aviso> : null}
    </SunmiHojaDeConfirmacion>
  );
}
