"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { Palette, PackageOpen, Trash2, Printer, Download, Receipt } from "lucide-react";

const SECCIONES = [
  {
    label: "Apariencia",
    href: "/modulos/configuracion/apariencia",
    icon: Palette,
    descripcion: "Theme visual y disposicion del menu.",
  },
  {
    label: "Stock",
    href: "/modulos/configuracion/stock",
    icon: PackageOpen,
    descripcion: "Permitir vender sin stock (modo carga inicial).",
  },
  {
    label: "Editor de Ticket",
    href: "/modulos/configuracion/ticket",
    icon: Receipt,
    descripcion: "Personalizar tipografia y estilos del ticket termico.",
  },
];

export default function ConfiguracionPage() {
  const { perfil, cargando } = useUser();

  // Impresora termica
  const PRINT_URL = "http://localhost:17777";
  const [printStatus, setPrintStatus] = useState("checking"); // checking | online | offline
  const [printPrinters, setPrintPrinters] = useState([]);
  const [printCurrent, setPrintCurrent] = useState("");
  const [printSaved, setPrintSaved] = useState(""); // nombre guardado en config.json
  const [printPaper, setPrintPaper] = useState(58);
  const [printSaving, setPrintSaving] = useState(false);
  const [printMsg, setPrintMsg] = useState({ text: "", ok: true });

  const showPrintMsg = (text, ok = true) => setPrintMsg({ text, ok });

  const checkPrintServer = useCallback(async () => {
    setPrintStatus("checking");
    setPrintMsg({ text: "", ok: true });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      // Traer impresoras y config en paralelo
      const [printersRes, configRes] = await Promise.all([
        fetch(`${PRINT_URL}/printers`, { signal: ctrl.signal }),
        fetch(`${PRINT_URL}/config`, { signal: ctrl.signal }),
      ]);
      clearTimeout(timer);
      const printersData = await printersRes.json();
      const configData = await configRes.json();
      if (printersData.ok && configData.ok) {
        setPrintStatus("online");
        setPrintPrinters(printersData.printers || []);
        setPrintCurrent(printersData.current || "");
        setPrintSaved(printersData.current || "");
        setPrintPaper(configData.config.paperWidth || 58);
      } else {
        setPrintStatus("offline");
      }
    } catch {
      setPrintStatus("offline");
    }
  }, []);

  useEffect(() => { checkPrintServer(); }, [checkPrintServer]);

  const handlePrintSave = async () => {
    setPrintSaving(true);
    setPrintMsg({ text: "", ok: true });
    try {
      const res = await fetch(`${PRINT_URL}/config/printer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: printCurrent, paperWidth: printPaper }),
      });
      const data = await res.json();
      if (data.ok) {
        setPrintSaved(printCurrent);
        showPrintMsg("Configuracion guardada");
      } else {
        showPrintMsg(data.error || "Error al guardar", false);
      }
    } catch {
      showPrintMsg("El servicio local no esta iniciado", false);
    } finally {
      setPrintSaving(false);
    }
  };

  const handlePrintTest = async () => {
    setPrintMsg({ text: "", ok: true });
    try {
      const res = await fetch(`${PRINT_URL}/print/test`, { method: "POST" });
      const data = await res.json();
      showPrintMsg(
        data.ok ? "Ticket de prueba enviado a la impresora" : (data.error || "Error al imprimir"),
        data.ok
      );
    } catch {
      showPrintMsg("El servicio local no esta iniciado", false);
    }
  };

  // Reset operativo
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPass, setResetPass] = useState("");
  const [resetFrase, setResetFrase] = useState("");
  const [resetCheck, setResetCheck] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetResult, setResetResult] = useState(null);

  const resetFormValid =
    resetPass.length > 0 &&
    resetFrase === "REINICIAR TODO" &&
    resetCheck;

  const handleReset = async () => {
    setResetError("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/reset-operativo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: resetPass,
          frase: resetFrase,
          confirmado: resetCheck,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setResetError(data.error || "Error desconocido");
      } else {
        setResetResult(data.deleted);
      }
    } catch {
      setResetError("Error de conexion");
    } finally {
      setResetLoading(false);
    }
  };

  const closeReset = () => {
    setResetOpen(false);
    setResetPass("");
    setResetFrase("");
    setResetCheck(false);
    setResetError("");
    setResetResult(null);
  };

  if (cargando) return null;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Configuracion"
        subtitle="Elegi una seccion para configurar."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECCIONES.map((s) => (
          <Link key={s.href} href={s.href}>
            <SunmiCard className="flex items-start gap-3 hover:ring-2 hover:ring-amber-400 transition cursor-pointer">
              <s.icon size={24} className="sunmi-text-accent mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold">{s.label}</h3>
                <p className="text-xs sunmi-text-muted">{s.descripcion}</p>
              </div>
            </SunmiCard>
          </Link>
        ))}
      </div>

      {/* Impresora termica */}
      <div className="mt-6">
        <SunmiCard>
          <div className="flex items-start gap-3">
            <Printer size={22} className="sunmi-text-accent mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Impresora termica</h3>

              {printStatus === "checking" && (
                <p className="text-[12px] sunmi-text-muted mt-2">Verificando servidor de impresion...</p>
              )}

              {printStatus === "offline" && (
                <div className="mt-2">
                  <div className="px-3 py-2 rounded sunmi-state-danger sunmi-text-danger text-[12px]">
                    El servicio de impresion no esta activo en esta PC.
                  </div>
                  <p className="text-[12px] sunmi-text-strong mt-2 whitespace-pre-line">
                    Para imprimir tickets termicos necesitás instalar el
                    servicio de impresion una sola vez.{"\n\n"}
                    1. Descargá el instalador{"\n"}
                    2. Ejecitalo (Next → Next → Install){"\n"}
                    3. Volvé al ERP y presioná &quot;Reintentar&quot;
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <SunmiButton
                      color="amber"
                      size="sm"
                      onClick={() => window.open("/downloads/ERP-Azul-Printer-Setup.exe", "_blank")}
                    >
                      <Download size={14} className="mr-1.5 inline-block -mt-0.5" />
                      Descargar instalador de impresion
                    </SunmiButton>
                    <SunmiButton size="sm" onClick={checkPrintServer}>
                      Reintentar
                    </SunmiButton>
                  </div>
                </div>
              )}

              {printStatus === "online" && (
                <div className="mt-2 space-y-3">
                  {/* Impresora guardada actualmente */}
                  {printSaved && (
                    <div className="px-3 py-2 rounded sunmi-state-success text-[12px]">
                      <span className="sunmi-text-muted">Impresora activa: </span>
                      <span className="font-semibold sunmi-text-success">{printSaved}</span>
                      <span className="sunmi-text-muted"> ({printPaper}mm)</span>
                    </div>
                  )}
                  {!printSaved && (
                    <div className="px-3 py-2 rounded sunmi-state-danger sunmi-text-danger text-[12px]">
                      No hay impresora configurada. Selecciona una abajo.
                    </div>
                  )}

                  {/* Selector */}
                  <div>
                    <label className="text-[11px] sunmi-text-muted font-medium block mb-1">Impresora</label>
                    {printPrinters.length > 0 ? (
                      <select
                        value={printCurrent}
                        onChange={(e) => setPrintCurrent(e.target.value)}
                        className="w-full px-2 py-1.5 text-[12px] rounded border sunmi-border sunmi-bg sunmi-text-strong"
                      >
                        <option value="">-- Seleccionar --</option>
                        {printPrinters.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[12px] sunmi-text-danger">
                        No se detectaron impresoras instaladas en Windows.
                      </p>
                    )}
                  </div>

                  {/* Ancho de papel */}
                  <div>
                    <label className="text-[11px] sunmi-text-muted font-medium block mb-1">Ancho de papel</label>
                    <div className="flex gap-2">
                      <button
                        className={`px-3 py-1.5 rounded text-[12px] font-medium ${printPaper === 58 ? "sunmi-state-success sunmi-text-success" : "sunmi-surface sunmi-text-muted"}`}
                        onClick={() => setPrintPaper(58)}
                      >
                        58mm
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded text-[12px] font-medium ${printPaper === 80 ? "sunmi-state-success sunmi-text-success" : "sunmi-surface sunmi-text-muted"}`}
                        onClick={() => setPrintPaper(80)}
                      >
                        80mm
                      </button>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-wrap gap-2">
                    <SunmiButton size="sm" color="amber" onClick={handlePrintSave} disabled={printSaving || !printCurrent}>
                      {printSaving ? "Guardando..." : "Guardar"}
                    </SunmiButton>
                    <SunmiButton size="sm" onClick={handlePrintTest} disabled={!printSaved}>
                      Imprimir prueba
                    </SunmiButton>
                    <SunmiButton size="sm" onClick={checkPrintServer}>
                      Actualizar
                    </SunmiButton>
                  </div>

                  {/* Mensaje de estado */}
                  {printMsg.text && (
                    <div className={`px-3 py-2 rounded text-[12px] ${printMsg.ok ? "sunmi-state-success sunmi-text-success" : "sunmi-state-danger sunmi-text-danger"}`}>
                      {printMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </SunmiCard>
      </div>

      {/* Zona peligrosa */}
      <div className="mt-8 border-t sunmi-divider pt-6">
        <h2 className="text-sm font-semibold sunmi-text-danger mb-3">Zona peligrosa</h2>
        <SunmiCard className="border border-red-500/30">
          <div className="flex items-start gap-3">
            <Trash2 size={22} className="sunmi-text-danger mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Reiniciar base operativa</h3>
              <p className="text-[12px] sunmi-text-muted mt-1">
                Elimina todos los datos operativos: productos, ventas, stock,
                transferencias, turnos, pedidos y movimientos de caja.
                No elimina usuarios, roles, categorias, proveedores ni
                configuraciones.
              </p>
              <div className="mt-3">
                <SunmiButton
                  color="red"
                  size="sm"
                  onClick={() => setResetOpen(true)}
                >
                  Reiniciar base operativa
                </SunmiButton>
              </div>
            </div>
          </div>
        </SunmiCard>
      </div>

      {/* Modal de confirmacion */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="sunmi-card w-full max-w-md mx-4 p-5 rounded-xl shadow-xl">
            {resetResult ? (
              <>
                <h3 className="text-sm font-bold sunmi-text-success mb-3">
                  Reset completado
                </h3>
                <div className="text-[12px] sunmi-text-strong space-y-1">
                  <p>Ventas eliminadas: {resetResult.ventas}</p>
                  <p>Productos eliminados: {resetResult.productos}</p>
                  <p>Transferencias eliminadas: {resetResult.transferencias}</p>
                  <p>Turnos eliminados: {resetResult.turnos}</p>
                </div>
                <div className="mt-4">
                  <SunmiButton onClick={closeReset}>Cerrar</SunmiButton>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold sunmi-text-danger mb-1">
                  Reiniciar base operativa
                </h3>
                <p className="text-[11px] sunmi-text-muted mb-4">
                  Esta accion es irreversible. Se eliminaran todos los productos,
                  ventas, stock, transferencias, turnos y pedidos.
                </p>

                <div className="space-y-3">
                  <SunmiInput
                    label="Tu contrasena"
                    type="password"
                    value={resetPass}
                    onChange={(e) => setResetPass(e.target.value)}
                    placeholder="Ingresa tu contrasena"
                  />

                  <SunmiInput
                    label='Escribe "REINICIAR TODO" para confirmar'
                    value={resetFrase}
                    onChange={(e) => setResetFrase(e.target.value)}
                    placeholder="REINICIAR TODO"
                  />

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetCheck}
                      onChange={(e) => setResetCheck(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[12px] sunmi-text-strong">
                      Entiendo que esto eliminara todos los datos operativos
                      y que no se puede deshacer
                    </span>
                  </label>
                </div>

                {resetError && (
                  <div className="mt-3 px-3 py-2 rounded sunmi-state-danger sunmi-text-danger text-[12px]">
                    {resetError}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <SunmiButton
                    color="red"
                    disabled={!resetFormValid || resetLoading}
                    onClick={handleReset}
                  >
                    {resetLoading ? "Eliminando..." : "Confirmar reinicio"}
                  </SunmiButton>
                  <SunmiButton onClick={closeReset} disabled={resetLoading}>
                    Cancelar
                  </SunmiButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
