"use client";

// components/transferencias/CabeceraDeCuenta.jsx
//
// LO QUE EL LOCAL LE DEBE AL DEPÓSITO EN ESTE PERÍODO (V28b, arriba de todo).
//
// Es el mismo hecho que el bloque de la vista del depósito —`cuentaDelLocal` y
// `bloquesPorLocal` calculan el importe con la misma puerta—, sin agrupar,
// porque del lado del local hay un solo local.
//
// ── EL AVISO NO SE DIBUJA SIEMPRE ─────────────────────────────────────────
//
// `avisoDeTotalAbierto` devuelve `null` cuando no queda nada por recibir, y ése
// es el que decide. Un renglón que dijera "0 transferencias sin recibir · el
// total todavía no está cerrado" sería literalmente falso: con cero pendientes
// el total SÍ está cerrado.
//
// ── EL RANGO TAMBIÉN VA ACÁ ───────────────────────────────────────────────
//
// Decidido sin diseño: la especificación pone el rango "dentro de cada bloque"
// para la vista del depósito y no dice dónde va en la del local. Va acá abajo
// del importe por el mismo motivo que allá — el local también tiene su propio
// día de corte, así que el rango es una propiedad de esta cuenta y no de la
// pantalla.

import { rotuloDelRango } from "@/lib/transferencias/periodoDePago";
import { avisoDeTotalAbierto, rotuloDeCuenta } from "@/lib/transferencias/rotulosDeTransferencia";

export default function CabeceraDeCuenta({ cuenta, unidad, money }) {
  const aviso = avisoDeTotalAbierto(cuenta || {});

  // `sunmi-bg-card` y no `sunmi-surface`: aquélla pinta `--app-bg`, el fondo de
  // la APLICACIÓN, así que la tarjeta salía del color de la página. Medido en el
  // navegador: los dos daban `rgb(15, 23, 42)`.
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
      <div>
        <div className="text-xs sunmi-text-muted">{rotuloDeCuenta(unidad)}</div>
        <div className="text-xl3 font-semibold sunmi-text-strong tabular-nums">
          {money ? money(cuenta?.aPagar) : cuenta?.aPagar}
        </div>
        <div className="text-sm2 sunmi-text-muted">{rotuloDelRango(cuenta?.rango)}</div>
      </div>

      {cuenta?.sinConfigurar && (
        <div className="text-sm2 sunmi-text-warning">
          El corte de semana de este local no está configurado: se está usando el domingo.
        </div>
      )}

      {aviso && (
        <>
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          <div className="text-sm2 font-medium sunmi-text-warning">{aviso}</div>
        </>
      )}
    </section>
  );
}
