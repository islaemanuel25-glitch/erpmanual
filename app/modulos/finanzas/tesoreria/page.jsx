// app/modulos/finanzas/tesoreria/page.jsx
//
// LA PUERTA DE TESORERÍA: qué plata conocemos del período, qué está verificado
// y qué falta revisar.
//
// Mismo molde que Pago a depósito: se entra desde las herramientas de Finanzas,
// registra título y "Volver" en el shell, y envuelve en `Suspense` por
// `useSearchParams`. Pide `tesoreria.ver` —el permiso de su ruta—, no
// `finanzas.ver`: el servidor vuelve a chequear todo, esto es para no dibujar
// algo que va a ser rechazado.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import TableroTesoreria from "@/components/tesoreria/TableroTesoreria";
import { RUTA_FINANZAS } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_VER_TESORERIA } from "@/lib/tesoreria/permisos";

export default function TesoreriaPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Tesoreria />
    </Suspense>
  );
}

function Tesoreria() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useTituloDePagina("Tesorería");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_FINANZAS} />, []);

  if (cargando) return null;
  if (!esAdmin && !permisos.includes(PERMISO_VER_TESORERIA)) return <SinPermisos />;

  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <TableroTesoreria />
    </div>
  );
}
