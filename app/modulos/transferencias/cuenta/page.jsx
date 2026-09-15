"use client";

// EL TABLERO DE TRANSFERENCIAS, EN SU PROPIA RUTA.
//
// ── POR QUÉ SE MUDÓ ─────────────────────────────────────────────────────
//
// Vivía adentro de `/modulos/transferencias`, bajo un `lg:hidden`, compartiendo
// archivo con el REPORTE de escritorio. Y ese archivo tiene escrita, con su
// motivo, la decisión de NO escribir la URL:
//
//     "Mismo criterio que Ventas: sessionStorage, sin escribir la URL
//      (evita loops estado↔URL)."
//
// Esa decisión es correcta para el reporte —650 líneas de estado compartido— y
// es incompatible con lo que el tablero necesita: que el local, el chip y el
// período vivan en la barra para que volver funcione solo.
//
// Con ruta propia no hay que elegir: el reporte se queda con su
// `sessionStorage` y el tablero usa la URL. Mudar el reporte habría sido la
// otra salida y es una tanda entera, como dice su propio comentario.
//
// ── LA RUTA VIEJA SIGUE ANDANDO ─────────────────────────────────────────
//
// `/modulos/transferencias` en un teléfono redirige acá con `replace`, así que
// el menú, los enlaces viejos y cualquier atajo guardado siguen llegando — y sin
// dejar una entrada de más en el historial.

import { Suspense } from "react";
import { useRouter } from "next/navigation";

import SunmiLoader from "@/components/sunmi/SunmiLoader";
import TableroMovil from "@/components/transferencias/TableroMovil";
import { RUTA_DETALLE } from "@/lib/transferencias/contextoDelTablero";

// `useSearchParams` obliga a un límite de Suspense: sin él, el build de Next
// falla al prerenderizar. El fallback es el mismo cargador que usa el tablero
// mientras pide la cuenta, así que no se ve un salto.
export default function CuentaDeTransferenciasPage() {
  const router = useRouter();
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <TableroMovil
        // EL REPORTE SIGUE A UN TOQUE. Vive en la ruta vieja, que en el teléfono
        // redirige acá — salvo con `?reporte=1`, que es esta puerta. Sin esto,
        // mudar el tablero dejaba al teléfono sin forma de abrirlo.
        onAbrirReporte={() => router.push(`${RUTA_DETALLE}?reporte=1`)}
      />
    </Suspense>
  );
}
