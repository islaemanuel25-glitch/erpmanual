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
  subtituloConAvance,
  tituloDeTransferencia,
} from "@/lib/transferencias/rotulosDeTransferencia";

export default function FilaTransferenciaLocal({ t, onRecibir, money }) {
  const pendiente = !t?.recibida;

  return (
    <div
      className={`sunmi-surface rounded-xl2 p-4 flex items-center justify-between gap-3 ${
        pendiente ? "border-1.5 sunmi-border-warning" : "border sunmi-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-base2 font-semibold sunmi-text-strong truncate">
          {tituloDeTransferencia(t)}
        </div>
        <div className={`text-sm2 ${pendiente ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
          {subtituloConAvance(t)}
        </div>
      </div>

      {pendiente ? (
        <SunmiButton
          type="button"
          color="primary"
          onClick={() => onRecibir?.(t)}
          className="shrink-0 px-4 py-2.5 rounded-lg text-sm3 font-semibold"
        >
          Recibir
        </SunmiButton>
      ) : (
        <div className="shrink-0 text-base2 font-semibold sunmi-text-strong tabular-nums">
          {money ? money(t?.importe) : t?.importe}
        </div>
      )}
    </div>
  );
}
