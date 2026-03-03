"use client";

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { PackageOpen, ClipboardCheck, ShieldAlert } from "lucide-react";

const TOGGLES = [
  {
    key: "allowNegativeStock",
    label: "Permitir vender sin stock",
    descripcion: "El POS permite completar ventas aunque el stock sea 0 o quede negativo. Útil durante la carga inicial de inventario.",
    icon: PackageOpen,
    onLabel: "Activado",
    offLabel: "Desactivado",
    msgOn: "Venta sin stock activada",
    msgOff: "Venta sin stock desactivada",
  },
  {
    key: "requireMotivoAjusteStock",
    label: "Motivo obligatorio en ajustes de stock",
    descripcion: "El usuario debe indicar un motivo al sumar o restar stock manualmente.",
    icon: ClipboardCheck,
    onLabel: "Obligatorio",
    offLabel: "Opcional",
    msgOn: "Motivo obligatorio en ajustes activado",
    msgOff: "Motivo en ajustes ahora es opcional",
  },
  {
    key: "requireMotivoLimitesStock",
    label: "Motivo obligatorio en límites de stock",
    descripcion: "El usuario debe indicar un motivo al modificar stock mínimo o máximo.",
    icon: ShieldAlert,
    onLabel: "Obligatorio",
    offLabel: "Opcional",
    msgOn: "Motivo obligatorio en límites activado",
    msgOff: "Motivo en límites ahora es opcional",
  },
];

export default function ConfigStockPage() {
  const { perfil, cargando: cargandoUser } = useUser();
  const [config, setConfig] = useState({
    allowNegativeStock: false,
    requireMotivoAjusteStock: false,
    requireMotivoLimitesStock: false,
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/config/stock-negativo")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setConfig({
            allowNegativeStock: data.allowNegativeStock ?? false,
            requireMotivoAjusteStock: data.requireMotivoAjusteStock ?? false,
            requireMotivoLimitesStock: data.requireMotivoLimitesStock ?? false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [esAdmin]);

  const handleToggle = async (key, valor, toggle) => {
    setGuardando(key);
    setMensaje(null);
    try {
      const res = await fetch("/api/config/stock-negativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: valor }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((prev) => ({ ...prev, [key]: data[key] }));
        setMensaje({
          tipo: "ok",
          texto: valor ? toggle.msgOn : toggle.msgOff,
        });
      } else {
        setMensaje({ tipo: "error", texto: data.error || "Error al guardar" });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión" });
    } finally {
      setGuardando(null);
    }
  };

  if (cargandoUser) return null;
  if (!esAdmin) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Configuración de Stock"
        subtitle="Reglas de stock, motivos y auditoría."
      />

      {cargando ? (
        <SunmiLoader />
      ) : (
        <div className="flex flex-col gap-4">
          {TOGGLES.map((t) => (
            <SunmiCard key={t.key} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <t.icon size={24} className="sunmi-text-accent mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-1">{t.label}</h3>
                  <p className="text-xs sunmi-text-muted mb-3">{t.descripcion}</p>
                  <div className="flex items-center gap-3">
                    <SunmiToggle
                      value={config[t.key]}
                      onChange={(val) => handleToggle(t.key, val, t)}
                      label={config[t.key] ? t.onLabel : t.offLabel}
                    />
                    {guardando === t.key && (
                      <span className="text-xs sunmi-text-muted">Guardando...</span>
                    )}
                  </div>
                </div>
              </div>
            </SunmiCard>
          ))}

          {mensaje && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              mensaje.tipo === "ok"
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {mensaje.texto}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
