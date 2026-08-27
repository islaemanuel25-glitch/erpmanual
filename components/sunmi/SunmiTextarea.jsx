"use client";

import { forwardRef } from "react";

import { componerClaseInput } from "@/lib/sunmi/claseAncho";

// EL TEXTAREA DEL KIT.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// De las pantallas que hoy funcionan. Había cuatro `<textarea>` crudos en el
// repo y los cuatro escriben lo mismo a mano:
//
//   ModalCierreTurno   className="w-full sunmi-input text-sm resize-none" rows={2}
//   ModalAjuste        className="sunmi-input h-20"
//   ModalAperturaTurno, clientes: la misma familia.
//
// O sea que la clase del kit —`sunmi-input`— ya era lo que usaban; lo que
// faltaba era el componente. No se inventó nada mirando casos futuros: la base
// es exactamente `sunmi-input` más los estados deshabilitados, igual que
// `SunmiInput`.
//
// ── NEGOCIA EL className, NO LO CONCATENA ─────────────────────────────────
//
// Es el punto que hace que valga la pena que exista. Dos clases de Tailwind de
// la misma familia tienen la misma especificidad, así que no decide el orden
// dentro del atributo sino el de la hoja de estilos: poner las dos es dejar que
// gane cualquiera. `ModalCierreTurno` escribe `w-full sunmi-input`, y si alguna
// vez pidiera otro ancho no se le aplicaría.
//
// `SunmiInput` es hoy el único componente del kit que lo hace bien. Éste es el
// segundo.
//
// ── LO QUE NO SE HIZO, Y HAY QUE DECIRLO ──────────────────────────────────
//
// Los cuatro `<textarea>` crudos NO se migraron. Migrarlos cambia píxeles en
// cuatro pantallas y exige compararlas una por una contra su captura, que es una
// tanda propia. Queda anotado: mientras tanto conviven el componente y los
// cuatro crudos, que es exactamente la duplicación que hay que cerrar.
const BASE = "sunmi-input disabled:opacity-60 disabled:cursor-not-allowed";

const SunmiTextarea = forwardRef(function SunmiTextarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} {...props} className={componerClaseInput(className, BASE)} />;
});

export default SunmiTextarea;
