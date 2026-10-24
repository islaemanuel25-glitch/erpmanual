"use client";

// EL DATO QUE FALTA PARA ARMAR LA CUENTA, PREGUNTADO DONDE SE DICE QUE FALTA.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `TarjetaProductoDeLaLista`, tal cual, el 2026-10-24: la hoja de «Corregir»
// decía "falta saber cuántos kilos trae la pieza" sobre GRANIX BOCADITO
// FRUTILLA 2KG y solo ofrecía «No lo cambio» —un cartel que pide algo sin dónde
// ponerlo—. La regla de Emanuel: donde la tarjeta o la hoja digan que falta un
// dato, la MISMA pieza ofrece el campo. Por eso se mudó acá y las dos la usan.
//
// Dos preguntas, una forma: "¿Cuántas trae la caja?" (entero, 2 en adelante) y
// "¿Cuántos kilos trae la pieza?" (con decimales: una pieza de 2,5 kg).
//
// ── EL VALOR SUGERIDO NO SE GUARDA ────────────────────────────────────────
//
// `sugerido` es lo que dice el nombre (`respuestaSugerida`: "2KG" → 2, "500G"
// → 0,5, "X 12" → 12). Solo llena el campo. La pieza no llama a ninguna ruta:
// avisa con `onListo(numero)` cuando la persona toca «Listo», y únicamente ahí.

import { useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { CLASE_ACCION_RAPIDA } from "@/components/revision/PiezasDeRevision";
import { kilosValidos } from "@/lib/proveedores/listas/cajaRecordada";

export const TEXTO_PREGUNTA_CAJA = "¿Cuántas trae la caja?";
export const TEXTO_PREGUNTA_KILOS = "¿Cuántos kilos trae la pieza?";
export const TEXTO_LISTO = "Listo";

/** Lo que se escribió en la pregunta, como número: "2,5" y "2.5" son lo mismo. */
export function numeroDeLaRespuesta(texto) {
  const t = String(texto ?? "").trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

/** ¿Es una respuesta que se puede guardar? Las mismas reglas que la ruta. */
export function respuestaValida(n, porKilo) {
  return porKilo ? kilosValidos(n) : Number.isInteger(n) && n >= 2;
}

/** El sugerido, escrito como lo escribiría una persona: 0,5 y no 0.5. */
function textoDelSugerido(sugerido) {
  if (sugerido === null || sugerido === undefined || !Number.isFinite(Number(sugerido))) return "";
  return String(Number(sugerido)).replace(".", ",");
}

/**
 * @param id         para el `htmlFor` del rótulo
 * @param porKilo    true pregunta los kilos de la pieza; false, la caja
 * @param sugerido   el valor con que arranca el campo, o null
 * @param trabajando hay un pedido en vuelo
 * @param onListo    `(numero)`, solo al tocar «Listo» con una respuesta válida
 */
export default function PreguntaQueFalta({ id, porKilo = false, sugerido = null, trabajando = false, onListo }) {
  const [respuesta, setRespuesta] = useState(() => textoDelSugerido(sugerido));
  const n = numeroDeLaRespuesta(respuesta);
  const valida = respuestaValida(n, porKilo);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valida) onListo?.(n);
      }}
    >
      <label className="text-sm2 sunmi-text-strong flex-1" htmlFor={id}>
        {porKilo ? TEXTO_PREGUNTA_KILOS : TEXTO_PREGUNTA_CAJA}
      </label>
      {/* Los kilos admiten decimales —una pieza de 2,5 kg—, la caja no. Va
          como texto con teclado decimal: un `type="number"` no muestra "0,5". */}
      <SunmiInput
        id={id}
        type="text"
        inputMode={porKilo ? "decimal" : "numeric"}
        value={respuesta}
        onChange={(e) => setRespuesta(e.target.value)}
        disabled={trabajando}
        className="w-20 text-right tabular-nums"
      />
      <SunmiButton type="submit" disabled={trabajando || !valida} className={`shrink-0 ${CLASE_ACCION_RAPIDA}`}>
        {TEXTO_LISTO}
      </SunmiButton>
    </form>
  );
}
