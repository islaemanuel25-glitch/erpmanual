"use client";

// components/finanzas/pago-deposito/TableroPagoADeposito.jsx
//
// LO QUE SE VE AL ABRIR "PAGO A DEPÓSITO".
//
// Dos entradas, y las elige el servidor con `Local.es_deposito`, igual que el
// Resumen financiero y que Transferencias: el DEPÓSITO —o un admin en vista
// global— ve la lista de los locales que PAGAN y entra a uno; un LOCAL ve directo
// la suya. La lista NO incluye al depósito: no se paga a sí mismo, así que no es
// un local pagador.

import { useRouter } from "next/navigation";

import SunmiLoader from "@/components/sunmi/SunmiLoader";
import EntradaDeLocales from "@/components/transferencias/EntradaDeLocales";
import { insigniaDelLocal } from "@/components/finanzas/TableroFinanzas";
import { urlDeLocalPagoADeposito } from "@/lib/finanzas/contextoFinanzas";

import CuentaPagoADeposito from "./CuentaPagoADeposito";
import { usePagoADeposito } from "./usePagoADeposito";

export default function TableroPagoADeposito() {
  const router = useRouter();

  const cuenta = usePagoADeposito({});
  const esEntrada = cuenta.datos?.vista === "ENTRADA";

  // El contenedor —tope de ancho y espacios— lo pone la página, igual que Pagos a
  // proveedores: así el botón "Volver" y el contenido comparten el mismo marco.
  return (
    <>
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
          textoVacio="Este grupo todavía no tiene locales que le paguen al depósito."
          // Un local dado de baja tuvo historia y se nombra; el depósito no está
          // en esta lista. `insigniaDelLocal` da "Dado de baja" para los inactivos.
          insigniaDe={insigniaDelLocal}
          onEntrar={(l) => router.push(urlDeLocalPagoADeposito(l.localId, cuenta.contexto))}
        />
      )}

      {!esEntrada && cuenta.datos?.vista === "UN_LOCAL" && <CuentaPagoADeposito {...cuenta} />}
    </>
  );
}
