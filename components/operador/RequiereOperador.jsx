"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import OperadorSelector from "./OperadorSelector";

export default function RequiereOperador({ operador, loading, onLogin, onLogout, children }) {
  if (loading) return null;

  if (!operador) {
    return (
      <div className="flex items-center justify-center py-12">
        <SunmiCard className="p-4 max-w-xs text-center space-y-3">
          <p className="text-sm font-semibold">Operador requerido</p>
          <p className="text-[11px] sunmi-text-muted">
            Identificate con tu nombre y PIN para continuar.
          </p>
          <OperadorSelector operador={operador} onLogin={onLogin} onLogout={onLogout} />
        </SunmiCard>
      </div>
    );
  }

  return children;
}
