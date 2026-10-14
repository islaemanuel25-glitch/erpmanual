"use client";

// components/transferencias/MasAccionesRecepcion.jsx
//
// LAS HOJAS DE "MÁS ACCIONES" E "INFORMACIÓN GENERAL" DE LA RECEPCIÓN.
//
// Es una COPIA de las dos hojas que viven adentro de `RecepcionMovil`, para el
// botón "⋯" de la computadora (`RecepcionEscritorio`): PDF de envío, PDF de
// recepción, ticket, cámara y cancelar. El teléfono sigue con las suyas y no
// se toca —regla del 2026-10-14, ver el encabezado de `RecepcionEscritorio`—,
// así que esta lista está escrita dos veces a sabiendas: si se agrega una
// acción al teléfono, hay que agregarla también acá.
//
// Lo único distinto es la `forma` del modal del kit: la computadora la abre
// centrada. Todo lo administrativo, fuera del flujo físico pero a un toque.

import { useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { hayEscanerDisponible } from "@/components/sunmi/SunmiEscanerCodigoBarra";

import TransferenciaHeader from "./TransferenciaHeader";

export const TITULO_MAS_ACCIONES = "Más acciones";
export const TITULO_INFO_GENERAL = "Información general";

/**
 * @param {object} props
 * @param {boolean} props.abierto      la hoja de "Más acciones"
 * @param {() => void} props.onCerrar
 * @param {"hoja"|"centrado"} [props.forma]  la del modal del kit
 */
export default function MasAccionesRecepcion({
  abierto,
  onCerrar,
  item,
  puedeRecibir,
  puedeCancelar = false,
  abrirPanelCancelar,
  imprimirTicket,
  onAbrirEscaner,
  forma = "hoja",
}) {
  // Qué hoja está abierta es presentación, no negocio: por eso vive acá.
  const [infoGeneral, setInfoGeneral] = useState(false);

  return (
    <>
      <SunmiModalLayout
        open={abierto}
        title={TITULO_MAS_ACCIONES}
        subtitle={`Transferencia #${item?.id} · ${item?.origen?.nombre} a ${item?.destino?.nombre}`}
        onClose={onCerrar}
        z={NIVEL_MODAL_GLOBAL}
        forma={forma}
        espacioCuerpo="gap-2"
      >
        <SunmiButton
          color="slate"
          className="w-full justify-center"
          onClick={() => {
            onCerrar();
            setInfoGeneral(true);
          }}
        >
          {TITULO_INFO_GENERAL}
        </SunmiButton>

        <a href={`/api/transferencias/pdf?id=${item?.id}`} target="_blank" rel="noreferrer">
          <SunmiButton color="slate" className="w-full justify-center">
            📄 PDF de envío
          </SunmiButton>
        </a>
        <a href={`/api/transferencias/pdf-recepcion?id=${item?.id}`} target="_blank" rel="noreferrer">
          <SunmiButton color="slate" className="w-full justify-center">
            📄 PDF de recepción
          </SunmiButton>
        </a>
        <SunmiButton color="slate" className="w-full justify-center" onClick={imprimirTicket}>
          🖨 Imprimir ticket POS
        </SunmiButton>

        {/* ── LA CÁMARA, MIENTRAS NO HAYA UNA COMPOSICIÓN APROBADA ────────
            El V2 no dibuja un botón de escanear al lado del buscador: eso se
            descartó. Pero la cámara sigue existiendo y sacarla sería perder una
            función. Queda acá, que es la superficie aprobada menos invasiva, y
            no se inventa un lugar nuevo en el flujo principal. Solo aparece si
            el navegador sabe leer códigos. */}
        {puedeRecibir && hayEscanerDisponible() && (
          <SunmiButton
            color="slate"
            className="w-full justify-center"
            onClick={() => {
              onCerrar();
              onAbrirEscaner();
            }}
          >
            📷 Escanear con la cámara
          </SunmiButton>
        )}

        {puedeCancelar && (
          <>
            {/* Separado, porque no es una acción más de la lista.

                Con `sunmi-border border-t` se dibujaba una CAJA VACÍA: esa
                clase del kit pone los cuatro bordes, así que `border-t` solo le
                agregaba grosor arriba y el resto ya estaba puesto. En la captura
                de 390 px se veía un rectángulo blanco entre los botones.
                `SunmiSeparator` es la pieza del kit para esto y no hay que
                adivinarle el color. */}
            <SunmiSeparator />
            <SunmiButton
              color="red"
              className="w-full justify-center"
              onClick={() => {
                onCerrar();
                abrirPanelCancelar?.();
              }}
            >
              ⛔ Cancelar transferencia
            </SunmiButton>
          </>
        )}
      </SunmiModalLayout>

      {/* ── LA HOJA DE INFORMACIÓN GENERAL ────────────────────────────────
          El MISMO bloque del escritorio, sin una segunda versión. Deja de estar
          desplegado durante el conteo; no deja de existir. */}
      <SunmiModalLayout
        open={infoGeneral}
        title={TITULO_INFO_GENERAL}
        onClose={() => setInfoGeneral(false)}
        z={NIVEL_MODAL_GLOBAL}
        forma={forma}
        espacioCuerpo="gap-2"
      >
        <TransferenciaHeader item={item} />
      </SunmiModalLayout>
    </>
  );
}
