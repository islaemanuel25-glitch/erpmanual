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

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiAccionRapida from "@/components/sunmi/SunmiAccionRapida";
import { kilosValidos, packDeLaListaValido } from "@/lib/proveedores/listas/cajaRecordada";

export const TEXTO_PREGUNTA_CAJA = "¿Cuántas trae la caja?";
export const TEXTO_PREGUNTA_KILOS = "¿Cuántos kilos trae la pieza?";
// Cuando el catálogo ya sabe la caja (DYSSA, 2026-11-04: caja de 24, la lista
// cotiza el pack de 6), lo que falta es de cuántas unidades es el precio.
export const TEXTO_PREGUNTA_PACK_DE_LA_LISTA = "¿De cuántas unidades es el precio de la lista?";
export const TEXTO_LISTO = "Listo";

/** Lo que se escribió en la pregunta, como número: "2,5" y "2.5" son lo mismo. */
export function numeroDeLaRespuesta(texto) {
  const t = String(texto ?? "").trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

/**
 * ¿Es una respuesta que se puede guardar? Las mismas reglas que la ruta: con la
 * caja del catálogo, el pack de la lista tiene que dividirla.
 */
export function respuestaValida(n, porKilo, cajaDelCatalogo = null) {
  if (porKilo) return kilosValidos(n);
  if (cajaDelCatalogo !== null && cajaDelCatalogo !== undefined) return packDeLaListaValido(n, cajaDelCatalogo);
  return Number.isInteger(n) && n >= 2;
}

/**
 * Con qué arranca el campo: el sugerido escrito como lo escribiría una persona
 * (0,5 y no 0.5), SOLO si «Listo» lo aceptaría. Si no, vacío.
 *
 * DR LEMON LIMÓN 1L X CAJA (2026-11-04): con la caja de 12, el campo de "¿De
 * cuántas unidades es el precio de la lista?" vino con 12, que es la opción "la
 * CAJA entera" y que «Listo» rechaza. Un número que no se puede contestar no se
 * precarga, venga de donde venga.
 */
export function textoInicialDeLaRespuesta(sugerido, porKilo = false, cajaDelCatalogo = null) {
  if (sugerido === null || sugerido === undefined || !Number.isFinite(Number(sugerido))) return "";
  if (!respuestaValida(Number(sugerido), porKilo, cajaDelCatalogo)) return "";
  return String(Number(sugerido)).replace(".", ",");
}

/**
 * @param id         para el `htmlFor` del rótulo
 * @param porKilo    true pregunta los kilos de la pieza; false, la caja
 * @param sugerido   el valor con que arranca el campo, o null
 * @param trabajando hay un pedido en vuelo
 * @param onListo    `(numero)`, solo al tocar «Listo» con una respuesta válida
 * @param cajaDelCatalogo  cuántas trae la caja según el catálogo, o null: con
 *                   ella se pregunta de cuántas unidades es el precio de la lista
 */
export default function PreguntaQueFalta({
  id,
  porKilo = false,
  sugerido = null,
  trabajando = false,
  onListo,
  cajaDelCatalogo = null,
}) {
  // ── SI LA PREGUNTA CAMBIA, EL CAMPO ARRANCA DE NUEVO ──────────────────
  //
  // El estado se inicializaba una sola vez: si la misma tarjeta pasaba de
  // "¿Cuántas trae la caja?" a la pregunta del pack —o le llegaba otro
  // sugerido—, el campo se quedaba con el número de antes. Cuando cambia con
  // qué arrancaría, se vuelve a arrancar con eso; lo que la persona escribió
  // sobre la MISMA pregunta no se toca.
  const inicial = textoInicialDeLaRespuesta(sugerido, porKilo, cajaDelCatalogo);
  const pregunta = `${porKilo ? "kilos" : "caja"}|${cajaDelCatalogo ?? ""}|${inicial}`;
  const [respuesta, setRespuesta] = useState(inicial);
  const [arrancoCon, setArrancoCon] = useState(pregunta);
  if (arrancoCon !== pregunta) {
    setArrancoCon(pregunta);
    setRespuesta(inicial);
  }
  const n = numeroDeLaRespuesta(respuesta);
  const valida = respuestaValida(n, porKilo, cajaDelCatalogo);
  const conCaja = !porKilo && cajaDelCatalogo !== null && cajaDelCatalogo !== undefined;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valida) onListo?.(n);
      }}
    >
      <label className="text-sm2 sunmi-text-strong flex-1" htmlFor={id}>
        {porKilo ? TEXTO_PREGUNTA_KILOS : conCaja ? TEXTO_PREGUNTA_PACK_DE_LA_LISTA : TEXTO_PREGUNTA_CAJA}
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
      <SunmiAccionRapida type="submit" disabled={trabajando || !valida}>
        {TEXTO_LISTO}
      </SunmiAccionRapida>
    </form>
  );
}
