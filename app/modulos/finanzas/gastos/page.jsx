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
    // En el celular, mismos espacios que Pagos a proveedores. Desde `md` el
    // molde de Finanzas va de costado a costado: sin tope, 32 px de margen con
    // los 14 del shell (`md:px-4.5`), y sin el `pt-4`: la barra del molde ya
    // arranca con el espacio de abajo.
    //
    // `AccionDePantalla` queda VACÍA a propósito. En escritorio el Volver va en
    // la barra del molde (`volver` a `ListaGastos`) y no en su propia fila; el
    // elemento se conserva porque en el celular no se ve pero cuenta —es la
    // hermana anterior que le da a lo que sigue el margen de `space-y-3.5`—, y
    // sacarlo subiría la pantalla 12 px.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5 md:max-w-none md:px-4.5 md:pt-0">
      <AccionDePantalla />
      <ListaGastos volver={volver} />
    </div>
  );
}
