"use client";

// components/finanzas/TableroFinanzas.jsx
//
// LO QUE SE VE AL ABRIR FINANZAS.
//
// ── DOS ENTRADAS, Y LA ELIGE UN DATO QUE YA EXISTE ────────────────────────
//
// El DEPÓSITO —o un admin en vista global— ve la lista de locales y entra a uno.
// Un LOCAL ve directo la suya, sin esa lista: es la única suya, elegirla no sería
// una elección.
//
// Lo decide `Local.es_deposito` en el servidor —no el `modo` de
// `resolveVistaOperativa`, que dice el ALCANCE y no quién sos— y acá llega
// resuelto: el depósito recibe `vista: "ENTRADA"` y el local `vista: "UN_LOCAL"`.
// Es exactamente el mecanismo del tablero de Transferencias, y se copia el
// MECANISMO reusando sus piezas, no el código.
//
// ── LA LISTA INCLUYE AL DEPÓSITO, Y ÉSA ES LA DIFERENCIA CON AQUÉL ───────
//
// El depósito vende: tiene su POS, sus turnos y su caja. La lista de
// Transferencias lo saca a propósito —no se transfiere a sí mismo— y usarla acá
// habría hecho desaparecer su venta sin que nada falle. Por eso la lista sale de
// `lib/finanzas/alcanceFinanciero.js` y no de `destinosDeTransferencia`.

import { useRouter } from "next/navigation";

import SunmiLoader from "@/components/sunmi/SunmiLoader";
import EntradaDeLocales from "@/components/transferencias/EntradaDeLocales";
import { urlDelLocal, urlDelTurno } from "@/lib/finanzas/contextoFinanzas";

import CuentaFinancieraDeUnLocal from "./CuentaFinancieraDeUnLocal";
import { useFinanzasDelLocal } from "./useFinanzasDelLocal";

/**
 * La palabra que va al lado del nombre en la lista, o `null`.
 *
 * "Dado de baja" gana sobre "Depósito": si el depósito estuviera inactivo, lo
 * que hay que decir es eso. Un depósito cerrado rotulado solo como "Depósito" se
 * lee como si operara.
 */
export function insigniaDelLocal(local) {
  if (local?.inactivo) return "Dado de baja";
  if (local?.esDeposito) return "Depósito";
  return null;
}

export default function TableroFinanzas() {
  const router = useRouter();

  // UNA SOLA LLAMADA DECIDE LAS DOS VISTAS. `entrada=1` contesta la lista SI
  // quien pregunta es el depósito; si es un local, el servidor ignora el pedido
  // y devuelve su cuenta.
  const cuenta = useFinanzasDelLocal({});
  const esEntrada = cuenta.datos?.vista === "ENTRADA";

  return (
    // Padding 14 a los lados y arriba —`p-4` en la escala del proyecto, donde
    // 1rem = 14 px— y 12,25 entre bloques. Los mismos que el tablero de
    // Transferencias, para que las dos pantallas se sientan la misma.
    //
    // ── EL TOPE DE ANCHO ES LO ÚNICO QUE SE AGREGA, Y ES PARA ESCRITORIO ──
    //
    // El tablero de Transferencias no lo necesita porque en escritorio ni
    // siquiera se dibuja: esa ruta redirige al reporte. Finanzas no tiene un
    // reporte aparte, así que la misma pantalla se abre a 1366 px, y ahí una
    // tarjeta de ancho completo deja un importe solo en un renglón de 1300 px.
    //
    // `max-w-4xl` son 784 px con `1rem = 14px`, o sea más que cualquier
    // teléfono: en móvil el tope no llega a aplicarse y el armado queda
    // exactamente igual al de transferencias.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      {cuenta.cargando && !cuenta.datos && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {cuenta.error && !cuenta.cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {cuenta.error}
        </div>
      )}

      {esEntrada && (
        <EntradaDeLocales
          locales={cuenta.datos.locales || []}
          rotulo="LOCALES"
          textoVacio="Este grupo todavía no tiene locales cargados."
          // `sinConfigurar` queda en cero: el aviso de corte de semana es de
          // Transferencias, donde el corte es un acuerdo de pago. El período de
          // Finanzas no depende de ningún acuerdo —corta domingo, siempre— así
          // que no hay nada que configurar y el aviso no se dibuja.
          sinConfigurar={0}
          // El depósito y los locales cerrados se nombran. Un local dado de baja
          // dibujado igual que uno abierto afirma algo falso, y el depósito
          // conviene distinguirlo porque su caja no es la de un local más.
          insigniaDe={insigniaDelLocal}
          onEntrar={(l) => router.push(urlDelLocal(l.localId, cuenta.contexto))}
        />
      )}

      {!esEntrada && cuenta.datos?.vista === "UN_LOCAL" && (
        <CuentaFinancieraDeUnLocal
          {...cuenta}
          // EL CONTEXTO VIAJA CON EL LINK. Sin esto, volver del turno cae en el
          // período de hoy: la pantalla se remonta y el estado arranca en su
          // valor por defecto. Es un `push` —el turno SÍ es otro lugar— y las
          // flechas usan `replace`, que es lo que deja una sola entrada.
          onAbrirTurno={(turnoId) =>
            router.push(urlDelTurno(cuenta.datos.local.id, turnoId, cuenta.contexto))
          }
        />
      )}
    </div>
  );
}
