// app/modulos/finanzas/sueldos/page.jsx
//
// FINANZAS → SUELDOS: los pagos a los empleados del local, los del POS y los
// de Finanzas juntos, un historial por empleado.
//
// El mismo molde que Gastos y Tesorería: se entra desde las herramientas de
// Finanzas, registra título y "Volver" en el shell, y envuelve en `Suspense`
// por `useSearchParams`. Pide `finanzas.ver` —el permiso de su ruta—; pagar y
// asignar los decide el servidor con lo que contesta.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import PantallaSueldos from "@/components/finanzas/sueldos/PantallaSueldos";
import { useSueldos } from "@/components/finanzas/sueldos/useSueldos";
import { RUTA_FINANZAS } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

export default function SueldosPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Sueldos />
    </Suspense>
  );
}

function Sueldos() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useTituloDePagina("Sueldos");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_FINANZAS} />, []);
  const s = useSueldos();

  if (cargando) return null;
  // El que manda es el chequeo de la ruta; éste es para no dibujar algo que el
  // servidor va a rechazar.
  if (!esAdmin && !permisos.includes(PERMISO_VER_FINANZAS)) return <SinPermisos />;

  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <PantallaSueldos
        datos={s.datos}
        cargando={s.cargando}
        error={s.error}
        ctx={s.ctx}
        faltaRango={s.faltaRango}
        hoy={hoyArgentinaISO()}
        onCambiarUnidad={s.onCambiarUnidad}
        onElegirRango={s.onElegirRango}
        onAtras={s.onAtras}
        onAdelante={s.onAdelante}
        onReintentar={s.recargar}
        onIr={s.onIr}
        onVolver={s.onVolver}
        onRecargar={s.recargar}
      />
    </div>
  );
}
