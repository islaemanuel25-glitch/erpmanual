"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import OperadorSelector from "./OperadorSelector";

/**
 * Modal de PIN que aparece POR ENCIMA de la pantalla actual cuando se cae el
 * operario a mitad de sesión (vencimiento, logout o 428). No es descartable:
 * se cierra solo cuando vuelve a haber operario (lo maneja OperadorProvider).
 * Lo que el usuario tuviera armado (carrito, turno, caja) queda intacto detrás.
 */
export default function ModalPedirOperador({ onLogin }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sunmi-overlay-strong">
      <SunmiCard className="w-full max-w-sm p-5 space-y-3 text-center">
        <p className="text-base font-bold">Identificate para seguir</p>
        <p className="text-xs sunmi-text-muted">
          Se cerró o venció la sesión del operario. Ingresá tu PIN para continuar
          — lo que tenías armado queda intacto.
        </p>
        <OperadorSelector operador={null} onLogin={onLogin} forzado />
      </SunmiCard>
    </div>
  );
}
