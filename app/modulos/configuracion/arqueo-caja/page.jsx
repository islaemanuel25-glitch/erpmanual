"use client";

// Configuración de arqueos de caja, POR LOCAL (config_local.alertas).
//
// Mismo patrón que las demás pantallas de configuración del local: toggles y
// campos numéricos que guardan de a uno, con feedback inmediato. La opción nace
// DESACTIVADA: activar alertas en una caja en producción es una decisión
// explícita del encargado, no un efecto de haber desplegado.

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { Timer, ShieldCheck } from "lucide-react";

const PERMISO = "config_local.alertas";

const NUMERICOS = [
  {
    key: "intervaloArqueoMinutos",
    label: "Intervalo entre arqueos",
    ayuda:
      "Minutos entre un arqueo y el siguiente. Se cuenta desde el último arqueo del turno, o desde la apertura si todavía no hubo ninguno — nunca desde una hora fija del día.",
    min: 5,
    max: 1440,
  },
  {
    key: "toleranciaPostergacionMinutos",
    label: "Tolerancia antes de exigir autorización",
    ayuda:
      "Minutos de demora que el cajero puede postergar por su cuenta. Pasada la tolerancia, la postergación necesita autorización.",
    min: 0,
    max: 240,
  },
  {
    key: "postergacionCajeroMinutos",
    label: "Duración de cada postergación",
    ayuda: "Cuánto se corre la alerta cada vez que se posterga.",
    min: 1,
    max: 240,
  },
];

export default function ConfigArqueoCajaPage() {
  const { perfil, cargando: cargandoUser } = useUser();
  const [config, setConfig] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  // Se incrementa DESPUÉS de cada intento de guardado, salga bien o mal.
  // Forma parte de la `key` de los toggles, así que los remonta y los obliga a
  // releer el valor confirmado por el backend: si el guardado falló, el switch
  // vuelve solo a donde estaba en vez de quedar mostrando algo que no se guardó.
  const [revision, setRevision] = useState(0);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes(PERMISO);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/config/arqueo-caja", { credentials: "include" });
        const d = await res.json();
        if (!vivo) return;
        if (d.ok) {
          setConfig(d.config);
          setBorrador(d.config);
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const guardar = async (campos, msg) => {
    setGuardando(Object.keys(campos)[0]);
    setMensaje(null);
    try {
      const res = await fetch("/api/config/arqueo-caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(campos),
      });
      const d = await res.json();
      if (d.ok) {
        setConfig(d.config);
        setBorrador(d.config);
        setMensaje({ tipo: "ok", texto: msg });
      } else {
        setMensaje({ tipo: "error", texto: d.error || "No se pudo guardar" });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión" });
    } finally {
      setGuardando(null);
      // Siempre, incluso al fallar: es lo que revierte el switch a su valor real.
      setRevision((n) => n + 1);
    }
  };

  if (cargandoUser || cargando) {
    return (
      <div className="w-full min-h-full p-2 lg:p-3">
        <div className="text-center py-10"><SunmiLoader /></div>
      </div>
    );
  }
  if (!puede) return <SinPermisos />;

  return (
    <div className="w-full min-h-full p-2 lg:p-3 space-y-3">
      <SunmiHeader titulo="Arqueos de caja" subtitulo="Alertas de conteo parcial de este local" />

      {mensaje && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            mensaje.tipo === "ok" ? "sunmi-state-success sunmi-text-success" : "sunmi-state-danger sunmi-text-danger"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Activación */}
      <SunmiCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft sunmi-text-link">
              <Timer size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold sunmi-text-strong">Arqueos de caja</div>
              <p className="text-[12px] sunmi-text-muted leading-snug mt-0.5">
                Cuando esta opción está activa, el POS permite realizar arqueos manuales
                y muestra alertas según el intervalo configurado. Cuando está desactivada,
                no se muestran el botón ni las alertas.
              </p>
            </div>
          </div>
          <Interruptor
            campo="arqueoCajaActivo"
            valor={config?.arqueoCajaActivo}
            revision={revision}
            guardando={guardando}
            onCambiar={(v) =>
              guardar(
                { arqueoCajaActivo: v },
                v ? "Arqueos activados en este local" : "Arqueos desactivados en este local"
              )
            }
          />
        </div>
      </SunmiCard>

      {/* Tiempos */}
      <SunmiCard className="space-y-4">
        {NUMERICOS.map((c) => (
          <div key={c.key} className="space-y-1.5">
            <div className="text-sm font-semibold sunmi-text-strong">{c.label}</div>
            <p className="text-[12px] sunmi-text-muted leading-snug">{c.ayuda}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-32">
                <SunmiInput
                  type="number"
                  min={c.min}
                  max={c.max}
                  value={borrador?.[c.key] ?? ""}
                  onChange={(e) => setBorrador((b) => ({ ...b, [c.key]: e.target.value }))}
                  className="text-center"
                />
              </div>
              <span className="text-[12px] sunmi-text-muted">minutos</span>
              <SunmiButton
                color="amber"
                disabled={
                  guardando === c.key || String(borrador?.[c.key]) === String(config?.[c.key])
                }
                onClick={() => guardar({ [c.key]: Number(borrador[c.key]) }, `${c.label} actualizado`)}
                className="text-sm"
              >
                {guardando === c.key ? "Guardando…" : "Guardar"}
              </SunmiButton>
            </div>
          </div>
        ))}
      </SunmiCard>

      {/* Autorización */}
      <SunmiCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft sunmi-text-warning">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold sunmi-text-strong">
                Exigir autorización para postergar
              </div>
              <p className="text-[12px] sunmi-text-muted leading-snug mt-0.5">
                Pasada la tolerancia, postergar deja de estar en manos del cajero y
                requiere un usuario con permiso para ver todos los turnos del local.
              </p>
            </div>
          </div>
          <Interruptor
            campo="requiereAutorizacionPostergacion"
            valor={config?.requiereAutorizacionPostergacion}
            revision={revision}
            guardando={guardando}
            onCambiar={(v) =>
              guardar(
                { requiereAutorizacionPostergacion: v },
                v ? "Autorización requerida para postergar" : "El cajero puede postergar sin autorización"
              )
            }
          />
        </div>
      </SunmiCard>
    </div>
  );
}

/**
 * Interruptor de configuración, atado al valor confirmado por el backend.
 *
 * Envuelve a SunmiToggle porque ese componente tiene dos límites conocidos y no
 * se toca acá: su prop es `value` (no `checked`), y siembra su estado interno
 * UNA sola vez, al montar — no vuelve a mirar `value` después. Lo usan otras 14
 * pantallas, así que cambiarlo por este caso sería mover algo ajeno.
 *
 * En su lugar:
 *   · se le pasa `value`, que es su API real;
 *   · la `key` incluye el valor confirmado Y la revisión, así que después de
 *     cada intento de guardado el toggle se remonta y relee el estado del
 *     servidor. Si el guardado falla, el switch vuelve solo a donde estaba;
 *   · mientras guarda, el envoltorio bloquea los clics: un doble clic no puede
 *     disparar dos escrituras.
 */
function Interruptor({ campo, valor, revision, guardando, onCambiar }) {
  const ocupado = guardando === campo;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div
        className={ocupado ? "pointer-events-none opacity-60" : ""}
        aria-busy={ocupado}
      >
        <SunmiToggle
          key={`${campo}-${String(valor)}-${revision}`}
          value={valor === true}
          onChange={onCambiar}
        />
      </div>
      {ocupado && <span className="text-[11px] sunmi-text-muted">Guardando…</span>}
    </div>
  );
}
