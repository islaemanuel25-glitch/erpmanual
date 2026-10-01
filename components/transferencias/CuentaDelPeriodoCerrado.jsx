"use client";

// components/transferencias/CuentaDelPeriodoCerrado.jsx
//
// LO QUE HAY QUE COBRARLE A ESTE LOCAL EN EL PERÍODO QUE SE ESTÁ MIRANDO.
//
// ── EL DEFECTO QUE CERRÓ LA V41, Y ERA UN TEXTO FALSO ────────────────────
//
// Este componente escribía **"Semana cerrada" a mano**, en el JSX, aunque el
// chip estuviera en Mes. El título decía una cosa y el rango de abajo decía
// otra, en la pantalla que dice cuánta plata hay que cobrar.
//
// Ahora el título, el rango y el rótulo del importe vienen los TRES de
// `descripcionDelPeriodo`, del lado del servidor y de los mismos datos con los
// que se consultó. No pueden contradecirse entre ellos porque salen del mismo
// lugar, y el componente no tiene ningún nombre de período escrito adentro.
//
// ── "PARA COBRAR" vs "VA ACUMULADO" ES UNA REGLA DE NEGOCIO ──────────────
//
// Si el período terminó, el número es una deuda cerrada. Si sigue abierto, va a
// crecer. Poner "Para cobrar" sobre un período abierto es pedirle a alguien que
// cobre un número que mañana es otro — que es exactamente lo que pasaba el
// domingo 2026-09-13 y lo que abrió esta línea de trabajo.
//
// El nombre del archivo quedó de cuando solo mostraba el período cerrado. No se
// renombra en esta tanda para no mezclar un movimiento de archivos con un cambio
// de comportamiento; queda anotado.
//
// ── DOS CRITERIOS, LA MISMA TARJETA (2026-10-01) ─────────────────────────
//
// Con la cuenta de siempre —por fecha de envío— el importe es lo que se cobra
// del período y el aviso dice si el total sigue abierto porque falta recibir.
//
// Con el criterio de recepción —el que abre el "Ver" del Pago a depósito de
// Finanzas— el importe es SOLO lo que el local confirmó en el período, que es
// exactamente el número de Finanzas. Lo que falta confirmar va abajo, en el
// detalle, con su nota: se informa y no está en el total. Por eso en este
// criterio no hay aviso de "faltan recibir": lo que suma ya está recibido. El
// aviso de un período que todavía no terminó sí queda, porque es verdad: otra
// confirmación puede caer antes del cierre.

import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import { avisoDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";
import {
  CRITERIO_CUENTA,
  NOTA_PENDIENTES,
  ROTULO_PAGO_A_DEPOSITO,
  ROTULO_PENDIENTE_DE_RECEPCION,
  rotuloDeTransferencias,
} from "@/lib/transferencias/criterioDeCuenta";

/** Lo que falta confirmar, como renglón informativo. Nunca con el peso del total. */
function PendientesDeRecepcion({ pendientes, money }) {
  const cantidad = Number(pendientes?.cantidad || 0);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm3 sunmi-text-muted">{ROTULO_PENDIENTE_DE_RECEPCION}</div>
        <div className="shrink-0 text-sm3 tabular-nums sunmi-text-muted">
          {money ? money(pendientes?.importe) : pendientes?.importe}
        </div>
      </div>
      <div className="text-xs2 sunmi-text-muted">
        {cantidad > 0 ? `${rotuloDeTransferencias(cantidad)} · ${NOTA_PENDIENTES}` : "Ninguna sin confirmar."}
      </div>
    </div>
  );
}

export default function CuentaDelPeriodoCerrado({
  periodo,
  money,
  puedeConfigurarCorte = false,
  onConfigurarCorte,
}) {
  const d = periodo?.descripcion || {};
  const porRecepcion = periodo?.criterio === CRITERIO_CUENTA.RECEPCION;
  const aviso = avisoDelPeriodo({
    sinRecibir: periodo?.sinRecibir,
    enCurso: d.enCurso,
    unidad: d.unidad,
  });
  const vacio = Number(periodo?.cantidad || 0) === 0;
  const notaVacio = porRecepcion
    ? "No confirmó ninguna recepción en ese período."
    : "No se le envió nada en ese período.";

  // El dibujo es `ResumenConImporte`, sacado de acá tal cual. El borde de aviso
  // se enciende allá por lo mismo que el aviso de abajo: el total todavía se
  // puede mover. Así el marco y la frase no pueden discrepar.
  return (
    <ResumenConImporte
      rotulo={porRecepcion ? ROTULO_PAGO_A_DEPOSITO : d.rotuloDelImporte || "Para cobrar"}
      importe={money ? money(periodo?.aPagar) : periodo?.aPagar}
      // Dos nodos de texto, como estaban: juntarlos en una cadena mueve píxeles.
      // El tercero existe solo en el criterio de recepción; en el de siempre
      // queda vacío y los dos de antes no cambian.
      subtitulo={
        <>
          {d.titulo}
          {d.subtitulo ? ` · ${d.subtitulo}` : ""}
          {porRecepcion && !vacio ? ` · ${rotuloDeTransferencias(periodo?.cantidad)} recibidas` : ""}
        </>
      }
      // ── EL PERÍODO SIN MOVIMIENTO ─────────────────────────────────────
      // Pasa con un local recién vinculado, con una semana en la que no se le
      // mandó nada, y ahora también al caminar hacia atrás con las flechas. El
      // rango EXISTE igual —es una cuenta de calendario, no de datos— así que
      // se muestra con su importe en cero y una frase que dice qué pasó. Decir
      // "no hay período" sería falso: lo hay, y está vacío, que es una
      // respuesta distinta y es la verdadera.
      //
      // En el criterio de recepción la frase es otra porque el hecho es otro:
      // puede haberse enviado mucho y no haberse confirmado nada.
      nota={vacio ? notaVacio : null}
      detalle={
        porRecepcion ? <PendientesDeRecepcion pendientes={periodo?.pendientes} money={money} /> : null
      }
      aviso={aviso}
      // ── EL ATAJO AL CORTE VIVE ACÁ Y SOLO CON SEMANA ──────────────────
      // Es donde la pregunta surge: el rango de una semana depende del corte, y
      // el del mes no. Ofrecerlo con el chip en Mes llevaría a una pantalla que
      // no cambia nada de lo que se está mirando.
      //
      // Y solo a quien puede usarlo: un atajo a una pantalla donde no se puede
      // configurar nada es peor que no ofrecerlo.
      accion={
        puedeConfigurarCorte ? (
          <SunmiLinkButton onClick={onConfigurarCorte}>Semana operativa ›</SunmiLinkButton>
        ) : null
      }
    />
  );
}
