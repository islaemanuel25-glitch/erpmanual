// app/modulos/finanzas/pagos-proveedores/page.jsx
//
// PAGOS A PROVEEDORES, adentro de Finanzas.
//
// No es un grupo del menú: se entra desde la puerta de Finanzas y se vuelve ahí.
// Por eso registra acción y título en el shell —por ruta el shell diría
// "Finanzas", que es de dónde se vino— igual que la cuenta de un local.
//
// El `Suspense` es por `useSearchParams`, que lee la solapa de la URL: sin él
// Next deja la pantalla sin reaccionar al cambio de solapa. Es el mismo
// envoltorio de las otras pantallas de Finanzas.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import ListaCuentasPorPagar from "@/components/finanzas/pagos/ListaCuentasPorPagar";
import { RUTA_FINANZAS } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

export default function PagosProveedoresPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <PagosProveedores />
    </Suspense>
  );
}

function PagosProveedores() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useTituloDePagina("Pagos a proveedores");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_FINANZAS} />, []);

  if (cargando) return null;
  // El que manda es el chequeo de la ruta; éste es para no dibujar algo que el
  // servidor va a rechazar.
  if (!esAdmin && !permisos.includes(PERMISO_VER_FINANZAS)) return <SinPermisos />;

  return (
    // Mismo tope y mismos espacios que el resto de Finanzas.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      {/* El repuesto del slot para escritorio, donde la fila del shell no se dibuja. */}
      <AccionDePantalla>{volver}</AccionDePantalla>
      <ListaCuentasPorPagar />
    </div>
  );
}
