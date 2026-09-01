"use client";

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { Boxes, Store, UserCheck } from "lucide-react";

// Reglas de POS PER LOCAL (config_local.pos): un toggle canónico por regla.
const TOGGLES = [
  {
    key: "exigirClienteVenta",
    label: "Exigir cliente para cerrar la venta",
    descripcion:
      "Si la opción está activa, el POS de este local no permitirá cerrar una venta si no hay cliente seleccionado.",
    icon: Store,
    onLabel: "Obligatorio",
    offLabel: "Opcional",
    msgOn: "Cliente obligatorio activado en este local",
    msgOff: "Cliente ahora es opcional en este local",
  },
  {
    key: "exigirOperador",
    label: "Exigir operario para operar el POS",
    descripcion:
      "Si la opción está activa, este local requiere un operario activo (PIN) para vender, abrir/cerrar caja y transferir. Admin y dueño del local siempre están exentos. El cambio aplica solo a este local.",
    icon: UserCheck,
    onLabel: "Obligatorio",
    offLabel: "Opcional",
    msgOn: "Operario obligatorio activado en este local",
    msgOff: "Operario ahora es opcional en este local",
  },
  {
    key: "mostrarStockPos",
    label: "Mostrar stock en POS Ventas",
    descripcion:
      "Cambia solo lo que ve el cajero en la pantalla de venta: las existencias en el buscador y en el carrito, y los avisos de stock bajo o negativo. El control interno sigue igual — el POS descuenta stock, no deja cargar más de lo que hay y el servidor valida cada venta contra la base. No afecta al editor de combos.",
    icon: Boxes,
    onLabel: "Visible",
    offLabel: "Oculto",
    msgOn: "El POS de este local vuelve a mostrar el stock",
    msgOff: "El POS de este local deja de mostrar el stock",
  },
];

export default function ConfigPosVentasPage() {
  const { perfil, cargando: cargandoUser } = useUser();
  const [config, setConfig] = useState({
    exigirClienteVenta: false,
    exigirOperador: true, // default histórico: operario obligatorio
    // Apagado, igual que resuelve el servidor. El default se escribe en los dos
    // lados a propósito: si acá fuera `true`, la pantalla mostraría el toggle
    // encendido durante el instante previo a que llegue la respuesta, y eso se
    // lee como que el local ya lo tenía así.
    mostrarStockPos: false,
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes("config_local.pos");

  useEffect(() => {
    if (!puede) return;
    fetch("/api/config/pos-ventas-cliente")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setConfig({
            exigirClienteVenta: data.exigirClienteVenta ?? false,
            exigirOperador: data.exigirOperador ?? true,
            // `=== true` y no `?? false`: un `null` de un local que nunca lo
            // configuró tiene que quedar apagado, no heredar nada.
            mostrarStockPos: data.mostrarStockPos === true,
          });
        }
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [puede]);

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
  if (!puede) return <SinPermisos />;

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
