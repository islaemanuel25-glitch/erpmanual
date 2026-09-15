"use client";

// HASTA CUÁNDO DURA: los cuatro chips, la fecha a mano y la línea en criollo.
//
// ── POR QUÉ SE EXTRAJO ───────────────────────────────────────────────────
//
// Vivía adentro de la pantalla de crear y el detalle necesita exactamente lo
// mismo: una oferta cargada se edita con los mismos chips con los que se creó.
// Escribirlo de nuevo habría dejado dos bloques que se ven igual hasta el día
// que uno cambie — y el que cambia siempre es el que no se está mirando.
//
// Salió TAL CUAL: los mismos nodos, las mismas clases, los mismos hijos.
//
// ── LA LÍNEA DE ABAJO NO DICE `finEn` ────────────────────────────────────
//
// Dice el ÚLTIMO DÍA VIGENTE, que es `finEn` menos un instante. La ventana es
// semiabierta —`[inicioEn, finEn)`— así que mostrar `finEn` correría todo un
// día: diría "termina el martes" para una oferta que el martes ya no se aplica.
// Lo resuelve `textoDeVigencia`, que es la misma que usan las dos pantallas.

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { DURACIONES, textoDeVigencia } from "@/lib/ofertas/crearOfertaMovil";

/** Un rótulo de bloque: 11px peso 500, apagado. */
function Rotulo({ children }) {
  return <div className="text-sm2 font-medium sunmi-text-muted">{children}</div>;
}

export default function BloqueDeDuracion({
  duracion,
  fechaElegida,
  finEn,
  onDuracion,
  onFechaElegida,
}) {
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
      <Rotulo>Hasta cuándo dura</Rotulo>
      <div className="flex flex-wrap gap-2">
        {DURACIONES.map((d) => {
          const activo = duracion === d.clave;
          return (
            <SunmiButton
              key={d.clave}
              type="button"
              color={activo ? "primary" : "slate"}
              onClick={() => onDuracion?.(d.clave)}
              aria-pressed={activo}
              className="min-h-0 px-3.5 py-2.5 rounded-md text-sm3 font-medium"
            >
              {d.etiqueta}
            </SunmiButton>
          );
        })}
      </div>

      {duracion === "ELEGIR" && (
        <SunmiInput
          type="date"
          value={fechaElegida}
          onChange={(e) => onFechaElegida?.(e.target.value)}
          aria-label="Último día de la oferta"
          className="w-full text-sm3"
        />
      )}

      <div className="text-sm3 font-medium sunmi-text-strong">{textoDeVigencia(finEn)}</div>
    </section>
  );
}
