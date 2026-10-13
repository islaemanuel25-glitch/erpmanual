// app/modulos/finanzas/tesoreria/local/[localId]/page.jsx
//
// LA TESORERÍA DE UN LOCAL, VISTA DESDE EL DEPÓSITO.
//
// La dibuja el MISMO tablero que ve un local cuando mira la suya; acá solo queda
// cómo se llega: el depósito pasa por la lista y entra a uno. Una ruta y no un
// estado, como Pago a depósito y la cuenta de un local, para que el "atrás" del
// teléfono vuelva a la lista. Que un local no pueda pedir otro lo decide el
// servidor (`resolverLocalPedido`), con `destino`.
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import TableroTesoreria from "@/components/tesoreria/TableroTesoreria";
import { RUTA_TESORERIA } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_VER_TESORERIA } from "@/lib/tesoreria/permisos";

export default function TesoreriaDeUnLocalPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <TesoreriaDelLocal />
    </Suspense>
  );
}

function TesoreriaDelLocal() {
  const { localId } = useParams();
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useTituloDePagina("Tesorería");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_TESORERIA} />, []);

  if (cargando) return null;
  if (!esAdmin && !permisos.includes(PERMISO_VER_TESORERIA)) return <SinPermisos />;

  return (
    // Desde `md` el molde de Finanzas va de costado a costado: sin tope, 32 px
    // de margen con los 14 del shell (`md:px-4.5`) y sin el `pt-4`. Los
    // detalles se topean solos (`AnchoDeLectura`). El Volver lo ubica el
    // tablero: en la barra del molde o en su fila (`AccionDePantalla`).
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5 md:max-w-none md:px-4.5 md:pt-0">
      <TableroTesoreria destino={localId} volver={volver} />
    </div>
  );
}
