"use client";

// EL BLOQUE DE LA FACTURA: EL PROTAGONISTA DE RECIBIR UN PEDIDO.
//
// ── QUÉ REEMPLAZA, Y POR QUÉ ES UNO SOLO ──────────────────────────────────
//
// Antes esta parte de la pantalla eran tres cosas repartidas: un cartel naranja
// de tres renglones explicando cuándo marcar la recepción, un panel "Factura y
// ganancia" con cuatro campos para teclear a mano —total factura, total real,
// número y fecha—, y un botón "Subir fotos" escondido entre medio.
//
// Los cuatro campos los llena la foto. Pedirlos a mano al lado del botón que
// los completa solo es ofrecer dos caminos para lo mismo, y el manual es el
// que se equivoca. El cartel de tres renglones decía cuándo usar un botón que
// estaba veinte centímetros más abajo.
//
// ── POR QUÉ EL BORDE ES DE 2 Y EN ACENTO ──────────────────────────────────
//
// Es la única acción de la pantalla en este estado. Con el borde de 1 que tiene
// la tarjeta de contexto quedaba como un bloque más de información y había que
// leerlo para darse cuenta de que era lo que había que hacer.
//
// ── DOS PUERTAS Y NO UNA ──────────────────────────────────────────────────
//
// "Sacar foto" abre la cámara —`capture` en el campo de archivo— y es el camino
// normal: el papel está en la mano. "Subir desde el teléfono" abre la galería,
// para cuando la foto ya se sacó o llegó por mensaje. Son el mismo circuito de
// subida y la misma validación: lo único que cambia es de dónde sale el archivo.

import { Camera } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";

export const TITULO_FACTURA = "Sacale una foto a la factura";
export const BAJADA_FACTURA =
  "Se acomodan los productos como vienen en el papel. Si es larga, una foto por hoja.";
export const TEXTO_SACAR_FOTO = "Sacar foto";
export const TEXTO_SUBIR = "Subir desde el teléfono";
export const TEXTO_SIN_FACTURA = "Llegó sin factura";
export const BAJADA_SIN_FACTURA = "Vas a tener que contar los bultos a mano";

export default function BloqueDeLaFactura({
  onSacarFoto,
  onSubir,
  onSinFactura,
  subiendo = false,
}) {
  return (
    <>
      <div className="min-h-bloqueFactura rounded-xl border-2 sunmi-border-accent sunmi-bg-card px-bloque py-4.5 flex flex-col items-center text-center gap-renglon">
        <Camera size={32} className="sunmi-text-accent" aria-hidden="true" />

        <span className="text-lg2 font-bold sunmi-text-strong">{TITULO_FACTURA}</span>

        <span className="text-sm3 sunmi-text-muted">{BAJADA_FACTURA}</span>

        <SunmiButton
          color="primary"
          type="button"
          disabled={subiendo}
          onClick={onSacarFoto}
          className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
        >
          {subiendo ? "Subiendo…" : TEXTO_SACAR_FOTO}
        </SunmiButton>

        {/* Sin caja propia: la caja es este bloque. `SunmiLinkButton` da un
            botón de verdad —tocable con teclado y con foco— y sin fondo. */}
        <SunmiLinkButton
          onClick={onSubir}
          disabled={subiendo}
          className="text-sm3 font-medium sunmi-text-accent no-underline"
        >
          {TEXTO_SUBIR}
        </SunmiLinkButton>
      </div>

      {/* ── LA SALIDA SECUNDARIA ────────────────────────────────────────────
          Existe porque el caso pasa: el camión llega y la factura viene después,
          o no viene. Va en slate y abajo, no compitiendo con la foto, y dice lo
          que cuesta —contar los bultos a mano— en vez de dejarlo descubrir. */}
      <div className="flex flex-col gap-dato">
        <SunmiButton
          color="slate"
          type="button"
          onClick={onSinFactura}
          className="w-full min-h-toque justify-center text-sm3"
        >
          {TEXTO_SIN_FACTURA}
        </SunmiButton>
        <span className="text-sm3 sunmi-text-muted text-center">{BAJADA_SIN_FACTURA}</span>
      </div>
    </>
  );
}
