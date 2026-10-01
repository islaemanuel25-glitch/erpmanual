// app/modulos/finanzas/pago-a-deposito/page.jsx
//
// LA PUERTA DE "PAGO A DEPÓSITO".
//
// No es un grupo del menú: se entra desde la herramienta de Finanzas y se vuelve
// ahí. Por eso registra acción y título en el shell —por ruta diría "Finanzas",
// de dónde se vino—, igual que Pagos a proveedores y la cuenta de un local.
//
// El `Suspense` es por `useSearchParams`, que lee el período de la URL: el mismo
// envoltorio de las otras pantallas de Finanzas.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import TableroPagoADeposito from "@/components/finanzas/pago-deposito/TableroPagoADeposito";
import { RUTA_FINANZAS } from "@/lib/finanzas/contextoFinanzas";

export default function PagoADepositoPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <PagoADeposito />
    </Suspense>
  );
}

function PagoADeposito() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useTituloDePagina("Pago a depósito");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_FINANZAS} />, []);

  if (cargando) return null;
  // El que manda es el chequeo de la ruta; éste es para no dibujar algo que el
  // servidor va a rechazar.
  if (!esAdmin && !permisos.includes("finanzas.ver")) return <SinPermisos />;

  return (
    // Mismo tope y mismos espacios que el resto de Finanzas.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      {/* El repuesto del slot para escritorio, donde la fila del shell no se dibuja. */}
      <AccionDePantalla>{volver}</AccionDePantalla>
      <TableroPagoADeposito />
    </div>
  );
}
