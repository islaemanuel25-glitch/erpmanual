// app/modulos/finanzas/gastos/page.jsx
//
// GASTOS, adentro de Finanzas.
//
// El mismo armado que Pagos a proveedores: se entra desde la puerta de Finanzas
// y se vuelve ahí, así que registra acción y título en el shell. El `Suspense`
// es por `useSearchParams`, que lee pestaña, período y categoría de la URL.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import ListaGastos from "@/components/finanzas/gastos/ListaGastos";
import { RUTA_FINANZAS } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

export default function GastosPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Gastos />
    </Suspense>
  );
}

function Gastos() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useTituloDePagina("Gastos");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_FINANZAS} />, []);

  if (cargando) return null;
  // El que manda es el chequeo de la ruta; éste es para no dibujar algo que el
  // servidor va a rechazar.
  if (!esAdmin && !permisos.includes(PERMISO_VER_FINANZAS)) return <SinPermisos />;

  return (
    // Mismo tope y mismos espacios que Pagos a proveedores.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <ListaGastos />
    </div>
  );
}
