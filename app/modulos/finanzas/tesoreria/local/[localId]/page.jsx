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
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
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
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <TableroTesoreria destino={localId} />
    </div>
  );
}
