"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPill from "@/components/sunmi/SunmiPill";

import { pesos } from "@/lib/ofertas/formato";
import { importeRecargo } from "@/lib/recargos-pago/recargoPago";

// RECARGOS POR MEDIO DE PAGO — lo que el comercio le cobra AL CLIENTE.
//
// ── LA ACLARACIÓN DE ARRIBA NO ES DECORATIVA ───────────────────────────────
//
// Esta pantalla y la de comisiones bancarias muestran cuatro porcentajes sobre
// los mismos medios de pago. Son lo único que las distingue a simple vista, y
// confundirlas tiene consecuencias en direcciones opuestas: cargar acá la
// comisión del banco le cobraría de más a todos los clientes, y cargar allá el
// recargo comercial haría que los reportes de neto den cualquier cosa.
//
// Por eso el texto está arriba de todo y con un ejemplo con números, no una
// leyenda al pie que nadie lee.

export default function RecargosPagoPage() {
  const { perfil, cargando } = useUser();
  const { contexto } = useContextoActivo();

  const permisos = useMemo(() => perfil?.permisos || [], [perfil]);
  const puede = permisos.includes("*") || permisos.includes("config_local.recargos_pago");

  const [medios, setMedios] = useState([]);
  const [valores, setValores] = useState({});
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    setCargandoDatos(true);
    setError(null);
    try {
      const res = await fetch("/api/recargos-pago", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || `No se pudieron leer los recargos (HTTP ${res.status}).`);
        return;
      }
      setMedios(json.medios || []);
      const v = {};
      for (const m of json.medios || []) v[m.medio] = String(m.porcentaje ?? 0);
      setValores(v);
    } catch (e) {
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setCargandoDatos(false);
    }
  }, []);

  useEffect(() => {
    if (puede) cargar();
  }, [puede, cargar]);

  if (cargando) return null;
  if (!puede) return <SinPermisos />;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const recargos = {};
      for (const [medio, valor] of Object.entries(valores)) recargos[medio] = Number(valor);

      const res = await fetch("/api/recargos-pago", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recargos }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || `No se pudieron guardar los recargos (HTTP ${res.status}).`);
        return;
      }
      setAviso("Recargos guardados. Se aplican a las ventas nuevas de este local.");
      cargar();
    } catch (e) {
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Recargos por medio de pago"
          subtitle={contexto?.nombre ? `Local: ${contexto.nombre}` : ""}
        />

        <div className="sunmi-panel rounded-lg p-3 flex gap-2 text-xs sunmi-text-muted">
          <Info size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="sunmi-text-strong text-sm">
              Esto es lo que le cobrás VOS AL CLIENTE. No es la comisión del banco.
            </span>
            <span>
              El recargo SUBE el total de la venta y lo paga el cliente. La comisión bancaria la
              cobra el procesador y te la descuenta a vos: se configura aparte, por grupo, y no
              cambia el total.
            </span>
            <span>
              Ejemplo con débito, 5 % de recargo y 7 % de comisión sobre una venta de {pesos(10000)}:
              el cliente paga {pesos(10500)}, el banco se queda {pesos(735)} y a vos te quedan{" "}
              {pesos(9765)}.
            </span>
          </div>
        </div>

        <SunmiSeparator label="Porcentaje por medio" />

        {cargandoDatos && <SunmiLoader />}
        {error && <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-danger">{error}</div>}
        {aviso && <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-success">{aviso}</div>}

        {!cargandoDatos && (
          <div className="flex flex-col gap-2">
            {medios.map((m) => {
              const pct = Number(valores[m.medio] ?? 0);
              return (
                <div key={m.medio} className="sunmi-panel rounded-lg p-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm sunmi-text-strong">{m.label}</div>
                    <div className="text-sm2 sunmi-text-muted">
                      {pct > 0
                        ? `Una venta de ${pesos(10000)} pasa a ${pesos(10000 + importeRecargo(10000, pct))}`
                        : "Sin recargo: el cliente paga el precio de lista."}
                    </div>
                  </div>
                  {!m.configurado && <SunmiPill color="slate">Sin configurar</SunmiPill>}
                  <div className="w-24 shrink-0">
                    <SunmiInput
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      value={valores[m.medio] ?? "0"}
                      onChange={(e) => setValores((v) => ({ ...v, [m.medio]: e.target.value }))}
                      aria-label={`Recargo de ${m.label} en porcentaje`}
                    />
                  </div>
                </div>
              );
            })}

            <div className="text-sm2 sunmi-text-muted">
              El fiado no aparece porque no es una forma de cobrar sino una promesa de pago: el
              recargo se define cuando se cobra de verdad.
            </div>

            <div className="flex gap-2 mt-1">
              <SunmiButton onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </SunmiButton>
              <SunmiButton color="slate" onClick={cargar} disabled={guardando}>
                Descartar cambios
              </SunmiButton>
            </div>
          </div>
        )}
      </SunmiCard>
    </div>
  );
}
