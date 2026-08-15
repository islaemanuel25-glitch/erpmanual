"use client";

// ANDAMIO: DOS MODALES DEL KIT ABIERTOS A LA VEZ.
//
// Existe para ejercer UNA sola afirmación: con dos capas abiertas, `Escape`
// cierra la de arriba y NO las dos.
//
// ── POR QUÉ HIZO FALTA UN ANDAMIO ──────────────────────────────────────────
//
// El caso anidado que había que mirar era el detalle de `HistorialDia`, y
// resultó que **esa pantalla no usa el kit**: son dos capas hechas a mano, una
// en `z-50` y el detalle en `z-[60]`. O sea que el cierre con teclado del kit no
// la toca, ni antes ni después.
//
// Y en el sistema no hay hoy ningún lugar donde DOS modales del kit estén
// abiertos al mismo tiempo. Sin un caso real, la garantía de la pila quedaría
// escrita y sin ejercer — que es exactamente lo que este proyecto no acepta.
//
// No usa datos: los dos modales son de la pieza, con texto fijo. No hay nada que
// fabricar porque no hay nada del negocio adentro.

import { useState } from "react";
import { notFound } from "next/navigation";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function AndamioEscape() {
  // GUARDIA DE ENTORNO — ver `scripts/andamiosNoSeCommitean.test.mjs`.
  if (process.env.NODE_ENV === "production") notFound();

  const [abajo, setAbajo] = useState(false);
  const [arriba, setArriba] = useState(false);

  return (
    <div className="p-6">
      <SunmiButton onClick={() => setAbajo(true)}>Abrir el de abajo</SunmiButton>

      <SunmiModalLayout
        open={abajo}
        title="El de abajo"
        onClose={() => setAbajo(false)}
        z={9999}
        espacioCuerpo="mt-2 gap-3"
        maxWidth="max-w-lg"
      >
        <p data-andamio="abajo" className="text-sm">
          Este es el de abajo. No declara destructivo, así que Escape lo cierra —
          pero solo cuando es el de arriba de la pila.
        </p>
        <SunmiButton data-andamio="disparador-arriba" onClick={() => setArriba(true)}>
          Abrir el de arriba
        </SunmiButton>
      </SunmiModalLayout>

      <SunmiModalLayout
        open={arriba}
        title="El de arriba"
        onClose={() => setArriba(false)}
        z={9999}
        espacioCuerpo="mt-2 gap-3"
        maxWidth="max-w-md"
      >
        <p data-andamio="arriba" className="text-sm">
          Este es el de arriba. Una sola tecla tiene que cerrar este y dejar el
          otro abierto.
        </p>
      </SunmiModalLayout>
    </div>
  );
}
