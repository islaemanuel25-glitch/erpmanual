"use client";

// SOLO SI PAGA EN EFECTIVO.
//
// Un bloque de una línea, y aun así se extrae: lo usan la pantalla de crear y la
// de detalle, y lo que se copia no es el interruptor sino la CAJA que lo
// contiene —el padding, el radio, el borde, el tamaño del texto—. Dos cajas
// escritas por separado se separan.
//
// ── EL INTERRUPTOR DEL KIT NO TIENE `role` NI ETIQUETA ───────────────────
//
// `SunmiToggle` es un `div` con `onClick`: no es un `button`, no declara
// `role="switch"` ni `aria-checked`. Queda anotado como hueco del kit —está en
// la documentación del módulo— y no se arregla acá: tocar una pieza compartida
// por otras pantallas es otra tanda, con sus capturas.

import SunmiToggle from "@/components/sunmi/SunmiToggle";

export default function InterruptorSoloEfectivo({ valor, onChange }) {
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm3 font-medium sunmi-text-strong">
          Solo si paga en efectivo
        </span>
        <SunmiToggle value={valor} onChange={onChange} />
      </div>
    </section>
  );
}
