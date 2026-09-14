"use client";

// components/transferencias/FilaTransferenciaLocal.jsx
//
// UNA TRANSFERENCIA en la vista del local (V28b). Es una tarjeta y no un
// renglón: del lado del local la transferencia es la unidad de trabajo —hay que
// abrirla, contarla y confirmarla— mientras que del lado del depósito es una
// línea más de la cuenta de un local. Por eso ésta tiene su borde y su padding
// y la del bloque no.
//
// ── LA LÍNEA DE ABAJO DICE EL AVANCE, NO EL ESTADO ────────────────────────
//
// El que está por recibir ya sabe que está para recibir: la sección se llama
// PARA RECIBIR. Lo que necesita saber es cuánto le falta contar, y eso es lo
// que lo hace volver. El porqué del denominador está en `subtituloConAvance`.

import SunmiButton from "@/components/sunmi/SunmiButton";
import {
  estadoEnPalabras,
  tituloDeTransferencia,
} from "@/lib/transferencias/rotulosDeTransferencia";

export default function FilaTransferenciaLocal({ t, onRecibir, onVer, money }) {
  const pendiente = !t?.recibida;
  const estado = estadoEnPalabras(t);

  // `sunmi-bg-card` y no `sunmi-surface`: aquélla pinta `--app-bg`, el fondo de
  // la APLICACIÓN, así que la fila salía del color de la página. Este marco se
  // usa en las DOS formas de la fila —el `div` de la pendiente y el
  // `SunmiButton` de la recibida—, así que el cambio vale para las dos.
  const marco = `sunmi-bg-card rounded-xl2 p-4 flex items-center justify-between gap-3 ${
    pendiente ? "border-1.5 sunmi-border-warning" : "border sunmi-border"
  }`;

  const contenido = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-base2 font-semibold sunmi-text-strong truncate">
          {tituloDeTransferencia(t)}
        </div>
        {/* EL ESTADO EN PALABRAS, el mismo que la vista del depósito. Antes acá
            decía "20 de 77 revisados" y allá el nombre del estado: dos formas de
            contar lo mismo, que es como empiezan a divergir. */}
        <div
          className={`text-sm2 ${
            estado.tono === "warning" ? "sunmi-text-warning" : "sunmi-text-muted"
          }`}
        >
          {estado.texto}
        </div>
      </div>

      {pendiente ? null : (
        <div className="shrink-0 text-right">
          <div className="text-base2 font-semibold sunmi-text-strong tabular-nums">
            {money ? money(t?.importe) : t?.importe}
          </div>
          <div className="text-sm2 font-medium sunmi-text-accent">Ver ›</div>
        </div>
      )}
    </>
  );

  if (pendiente) {
    return (
      <div className={marco}>
        {contenido}
        <SunmiButton
          type="button"
          color="primary"
          onClick={() => onRecibir?.(t)}
          className="shrink-0 px-4 py-2.5 rounded-lg text-sm3 font-semibold"
        >
          Recibir
        </SunmiButton>
      </div>
    );
  }

  // ── LA RECIBIDA SE ABRE, Y LA TARJETA ENTERA ES EL OBJETIVO ────────────
  //
  // Era el mismo defecto que en la vista del depósito: la ya recibida no tenía
  // forma de abrirse. El "Ver ›" es la señal, no el botón — si fuera el único
  // objetivo, en un teléfono habría que acertarle a dos palabras.
  return (
    <SunmiButton
      type="button"
      color="ghost"
      onClick={() => onVer?.(t)}
      className={`${marco} w-full min-h-0 text-left`}
    >
      {contenido}
    </SunmiButton>
  );
}
