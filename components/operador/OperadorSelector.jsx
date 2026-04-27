"use client";

import { useState, useEffect } from "react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function OperadorSelector({ operador, onLogin, onLogout }) {
  const [operadores, setOperadores] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (abierto) {
      fetch("/api/operador/listar", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setOperadores(d.items);
        })
        .catch(() => {});
    }
  }, [abierto]);

  const handleLogin = async () => {
    if (!selectedId || !pin) {
      setError("Seleccioná un operador e ingresá el PIN.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await onLogin(Number(selectedId), pin);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Error al identificarse.");
    } else {
      setPin("");
      setSelectedId("");
      setAbierto(false);
    }
  };

  if (operador) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 sunmi-surface px-2 py-1 rounded-lg">
          <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white">
            {operador.nombre?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <span className="text-[11px] font-medium">{operador.nombre}</span>
        </div>
        <button
          onClick={onLogout}
          className="text-[10px] sunmi-text-muted hover:sunmi-text-danger transition-colors"
          title="Cambiar operador"
        >
          Cambiar
        </button>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 sunmi-surface px-2 py-1 rounded-lg text-[11px] sunmi-text-muted hover:sunmi-text-primary transition-colors"
      >
        <span className="w-5 h-5 rounded-full border border-dashed border-current flex items-center justify-center text-[10px]">?</span>
        Identificarse
      </button>
    );
  }

  return (
    <div className="sunmi-surface rounded-lg p-3 space-y-2 min-w-[240px]">
      <p className="text-xs font-semibold">Identificarse como operador</p>

      <div>
        <label className="text-[9px] sunmi-text-muted block mb-0.5">Operador</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded px-2 py-1 text-xs sunmi-input bg-transparent"
        >
          <option value="">Seleccionar...</option>
          {operadores.map((op) => (
            <option key={op.id} value={op.id}>
              {op.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[9px] sunmi-text-muted block mb-0.5">PIN</label>
        <SunmiInput
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="****"
          className="!py-1 text-xs"
          maxLength={8}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
      </div>

      {error && (
        <p className="text-[10px] sunmi-text-danger">{error}</p>
      )}

      <div className="flex gap-1.5">
        <SunmiButton color="amber" onClick={handleLogin} disabled={loading} className="!py-1 text-xs flex-1">
          {loading ? "..." : "Ingresar"}
        </SunmiButton>
        <SunmiButton color="neutral" onClick={() => { setAbierto(false); setError(""); }} className="!py-1 text-xs">
          Cancelar
        </SunmiButton>
      </div>
    </div>
  );
}
