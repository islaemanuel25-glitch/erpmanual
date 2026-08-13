"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import OperadorSelector from "./OperadorSelector";

/**
 * Modal de PIN que aparece POR ENCIMA de la pantalla actual cuando se cae el
 * operario a mitad de sesión (vencimiento, logout o 428). No es descartable:
 * se cierra solo cuando vuelve a haber operario (lo maneja OperadorProvider).
 * Lo que el usuario tuviera armado (carrito, turno, caja) queda intacto detrás.
 *
 * ── POR ENCIMA DE TODO, Y ESE NÚMERO NO ES DECORATIVO ──────────────────────
 *
 * Estaba en `z-[100]` y los modales del sistema están en `z-[9999]`. Los dos
 * viven en el MISMO contexto de apilado: `OperadorProvider` dibuja este cartel
 * como hermano de `{children}` en `app/modulos/layout.jsx`, así que compiten de
 * verdad.
 *
 * Se ejerció en el navegador, no se dedujo: con un modal abierto, el cartel se
 * dibuja PERO QUEDA DEBAJO DEL VELO DEL MODAL. Se ve apagado, y el campo del PIN
 * y el botón de ingresar no se pueden tocar. Es peor que no verse: el operario
 * lee "identificate para seguir", lo intenta, no pasa nada, y queda trabado con
 * el mostrador lleno.
 *
 * Por eso va arriba de TODO lo que el sistema pueda tener abierto. Si algún día
 * un modal sube más que esto, el candado de `ModalPedirOperador.test.mjs` lo
 * frena — es lo único que separa a este cartel de volver a quedar tapado.
 */
export default function ModalPedirOperador({ onLogin }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sunmi-overlay-strong">
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
