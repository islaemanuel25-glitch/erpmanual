"use client";

// LLEGÓ ALGO SIN PEDIDO.
//
// ── POR QUÉ ESTÁ AL FINAL Y NO ARRIBA ─────────────────────────────────────
//
// Es el camino de excepción. Lo normal es que la mercadería que llega
// corresponda a un pedido que está en esta lista; recibir algo que nadie pidió
// pasa poco. Arriba competiría con lo que se hace todos los días, que es tocar
// "Recibir" en el pedido que corresponde.
//
// ── POR QUÉ EL BORDE ES PUNTEADO ──────────────────────────────────────────
//
// Las tarjetas de día tienen borde sólido y son cosas que EXISTEN: pedidos
// hechos, con número y con plata. Esto no es una cosa, es una puerta. El
// punteado lo separa sin necesitar un rótulo que lo explique.

// ── POR QUÉ `SunmiLinkButton` Y NO UN `<button>` ──────────────────────────
//
// Hace falta un botón de verdad —tocable con teclado y con foco— y SIN caja
// propia: la caja ya la pone esta tarjeta, con su borde punteado. Los colores
// de `SunmiButton` traen fondo y dibujarían una caja adentro de otra.
// `SunmiLinkButton` no trae ninguno; lo que sí trae —subrayado, acento y
// `text-xs`— lo ceden las clases de acá, que son utilidades y le ganan por el
// orden de la hoja. Es el mismo criterio que usa `TarjetaRecepcionMovil`.
import { ChevronRight } from "lucide-react";

import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";

export const TITULO_SIN_PEDIDO = "Llegó algo sin pedido";
export const BAJADA_SIN_PEDIDO = "Sacale una foto a la factura y se arma solo";

export default function EntradaSinPedido({ onEntrar }) {
  return (
    <SunmiLinkButton
      onClick={onEntrar}
      className="w-full min-h-entradaSinPedido rounded-xl border border-dashed sunmi-border-accent px-4 flex items-center justify-between gap-renglon text-left no-underline"
    >
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-sm3 font-medium sunmi-text-accent">{TITULO_SIN_PEDIDO}</span>
        <span className="text-sm3 sunmi-text-muted">{BAJADA_SIN_PEDIDO}</span>
      </span>
      <ChevronRight size={22} className="sunmi-text-accent shrink-0" aria-hidden="true" />
    </SunmiLinkButton>
  );
}
