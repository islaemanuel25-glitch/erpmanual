"use client";

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { Warehouse, Store } from "lucide-react";

const TOGGLES = [
  {
    key: "exigirClienteVentasDeposito",
    label: "Exigir cliente en ventas desde depósito",
    descripcion:
      "Si la opción está activa, el POS no permitirá cerrar una venta si no hay cliente seleccionado.",
    icon: Warehouse,
    onLabel: "Obligatorio",
    offLabel: "Opcional",
    msgOn: "Cliente obligatorio en ventas de depósito activado",
    msgOff: "Cliente ahora es opcional en ventas de depósito",
  },
  {
    key: "exigirClienteVentasLocal",
    label: "Exigir cliente en ventas desde local",
    descripcion:
      "Si la opción está activa, el POS no permitirá cerrar una venta si no hay cliente seleccionado.",
    icon: Store,
    onLabel: "Obligatorio",
    offLabel: "Opcional",
    msgOn: "Cliente obligatorio en ventas de local activado",
    msgOff: "Cliente ahora es opcional en ventas de local",
  },
];

export default function ConfigPosVentasPage() {
  const { perfil, cargando: cargandoUser } = useUser();
  const [config, setConfig] = useState({
    exigirClienteVentasDeposito: false,
    exigirClienteVentasLocal: false,
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/config/pos-ventas-cliente")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setConfig({
            exigirClienteVentasDeposito: data.exigirClienteVentasDeposito ?? false,
            exigirClienteVentasLocal: data.exigirClienteVentasLocal ?? false,
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
      const res = await fetch("/api/config/pos-ventas-cliente", {
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
        title="Configuración POS Ventas"
        subtitle="Reglas de cierre de venta del POS."
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

          <SunmiCard className="text-xs sunmi-text-muted">
            Si el cliente tiene una lista de precios asignada, al seleccionarlo pueden cambiar los precios aplicados.
          </SunmiCard>

          {mensaje && (
            <div
              className={`text-xs px-3 py-2 rounded-lg ${
                mensaje.tipo === "ok"
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {mensaje.texto}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
