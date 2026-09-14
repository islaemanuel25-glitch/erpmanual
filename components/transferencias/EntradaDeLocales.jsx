"use client";

// components/transferencias/EntradaDeLocales.jsx
//
// LA ENTRADA DEL DEPÓSITO: la lista de locales y NADA MÁS.
//
// ── POR QUÉ LA PANTALLA SE PARTIÓ EN DOS ─────────────────────────────────
//
// Hasta acá el tablero mostraba todo junto —chips de período, importes por local
// y transferencias— y eso tenía un defecto que se vio el domingo 2026-09-13: con
// corte domingo, la semana en curso arrancaba ESE día, así que la pantalla
// mostraba cuatro transferencias que todavía no se cobran y escondía la semana
// que sí hay que cobrar.
//
// Y el problema de fondo es peor que ese domingo: **cada local corta su semana
// el día que acordó**, así que "Semana" no significa lo mismo para todos. Un
// chip arriba de la pantalla tiene que elegir UN período para todos, y
// cualquiera que elija es el equivocado para alguien.
//
// La salida es que el período no exista hasta saber de qué local se habla. Por
// eso acá no hay chips, ni importes, ni transferencias, ni buscador: hay locales.
//
// ── Y POR QUÉ TAMPOCO HAY IMPORTE AL LADO DEL NOMBRE ─────────────────────
//
// Porque un importe es siempre el importe DE UN PERÍODO, y acá no hay ninguno
// elegido. Mostrar uno obligaría a elegirlo en silencio, que es justamente lo
// que esta pantalla vino a dejar de hacer.

import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { TriangleAlert } from "lucide-react";

import TarjetaDeLocal from "./TarjetaDeLocal";

export default function EntradaDeLocales({
  locales = [],
  cargando = false,
  error = "",
  sinConfigurar = 0,
  puedeConfigurar = false,
  onConfigurar,
  onEntrar,
}) {
  return (
    <div className="space-y-3.5">
      {sinConfigurar > 0 && (
        <SunmiAviso tono="warning" icon={TriangleAlert} titulo="Corte de semana sin configurar">
          {sinConfigurar === 1
            ? "Hay 1 local sin corte configurado: se le está aplicando el domingo."
            : `Hay ${sinConfigurar} locales sin corte configurado: se les está aplicando el domingo.`}{" "}
          {puedeConfigurar && (
            <SunmiLinkButton onClick={onConfigurar}>Configurar</SunmiLinkButton>
          )}
        </SunmiAviso>
      )}

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {error}
        </div>
      )}

      {!cargando && !error && locales.length === 0 && (
        <div className="text-center py-12 sunmi-text-muted text-xs">
          Ningún local opera por transferencia con este depósito.
        </div>
      )}

      {!cargando &&
        !error &&
        locales.map((l) => <TarjetaDeLocal key={l.localId} local={l} onEntrar={onEntrar} />)}
    </div>
  );
}
