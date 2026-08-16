"use client";

// TERMINAR UNA IMPORTACIÓN: "con esto alcanza".
//
// Cerrar no aplica nada ni toca un solo costo: las filas pendientes quedan como
// están. Lo que cambia es que la lista deja de aceptar trabajo y libera el
// archivo para la siguiente.
//
// ES DEFINITIVO, igual que cancelar, y por eso lleva modal con los números
// adelante: lo que se pierde es la posibilidad de aplicar los que quedaron sin
// aplicar, y ese número tiene que estar a la vista ANTES de confirmar, no
// después.
//
// Lo que NO se pierde es la vuelta atrás: una importación terminada se puede
// deshacer. Se dice explícitamente porque es la diferencia con cancelar y es lo
// que permite terminar sin miedo.

import { createPortal } from "react-dom";
import { CheckCheck } from "lucide-react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalTerminar({
  abierto,
  sinAplicar = 0,
  actualizados = 0,
  trabajando = false,
  onCerrar,
  onTerminar,
}) {
  if (!abierto) return null;

  const contenido = (
    <SunmiModalLayout
      open={abierto}
      title="Terminar esta importación"
      subtitle="Se cierra el trabajo sobre esta lista. No se toca ningún costo."
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      maxWidth="max-w-lg"
      // El valor que este modal ya tenía: era el default del kit y ahora se
      // declara, porque el kit dejó de tener uno. No cambia un píxel.
      espacioCuerpo="mt-2 gap-3"
      // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
      // default de `z`.
      z={9999}
      destructivo
      footer={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <SunmiButton color="slate" onClick={onCerrar} disabled={trabajando} className="py-2 text-xs">
            No, volver
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={onTerminar}
            disabled={trabajando}
            className="py-2 font-bold text-xs inline-flex items-center gap-1"
          >
            <CheckCheck size={14} aria-hidden="true" />
            {trabajando ? "Terminando…" : "Sí, terminar"}
          </SunmiButton>
        </div>
      }
    >
      <div className="rounded-lg border sunmi-border p-2.5">
        <div className="text-[22px] leading-none font-bold tabular-nums sunmi-text-warning">
          {sinAplicar}
        </div>
        <div className="text-[11.5px] sunmi-text-strong leading-snug mt-1">
          {sinAplicar === 1
            ? "producto queda sin aplicar, y va a quedar así"
            : "productos quedan sin aplicar, y van a quedar así"}
        </div>
        <div className="text-[10.5px] sunmi-text-muted leading-snug mt-1">
          Siguen con el costo que tienen hoy. Después de terminar no se van a poder confirmar ni
          aplicar desde esta lista: para actualizarlos hay que importar una lista nueva.
        </div>
      </div>

      <p className="text-[11.5px] sunmi-text-muted leading-snug">
        Los {actualizados} {actualizados === 1 ? "producto que ya se actualizó" : "productos que ya se actualizaron"}{" "}
        no se tocan: sus costos quedan como están.
      </p>

      {/* Dice exactamente lo que hace el sistema. La primera versión de este
          texto decía "no se puede volver a abrir", y era falso: deshacer la
          aplicación la reabre, porque si no las filas quedarían sin aplicar y sin
          forma de aplicarlas nunca. */}
      <p className="text-[11.5px] sunmi-text-muted leading-snug">
        No hay un botón para reabrirla. Lo que sí podés hacer es{" "}
        <span className="sunmi-text-strong">deshacer la aplicación</span>: eso devuelve los costos al
        valor que tenían antes y la lista vuelve a quedar abierta, para corregir y aplicar de nuevo.
      </p>
    </SunmiModalLayout>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : null;
}
