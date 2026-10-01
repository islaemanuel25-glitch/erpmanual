// app/modulos/finanzas/pago-a-deposito/local/[localId]/page.jsx
//
// EL PAGO A DEPÓSITO DE UN LOCAL, VISTO DESDE EL DEPÓSITO.
//
// La dibuja `CuentaPagoADeposito`, la MISMA pieza que ve un local cuando mira la
// suya. Acá solo queda cómo se llega: el depósito pasa por la lista y entra a la
// de uno, así que esta ruta existe y tiene su botón de volver; el local entra
// directo desde `/modulos/finanzas/pago-a-deposito`.
//
// Es el mismo criterio que `/modulos/finanzas/local/[localId]` y que
// `/modulos/transferencias/local/[localId]`: una ruta y no un estado, para que el
// "atrás" del teléfono vuelva a la lista y no salga de Finanzas.
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";

import CuentaPagoADeposito from "@/components/finanzas/pago-deposito/CuentaPagoADeposito";
import { usePagoADeposito } from "@/components/finanzas/pago-deposito/usePagoADeposito";
import { RUTA_PAGO_A_DEPOSITO } from "@/lib/finanzas/contextoFinanzas";

export default function LocalDePagoADepositoPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <CuentaDelLocal />
    </Suspense>
  );
}

function CuentaDelLocal() {
  const { localId } = useParams();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const cuenta = usePagoADeposito({ destino: localId });

  // El título sale del dato y no de la ruta: por ruta el shell diría "Finanzas" o
  // el id. El nombre del local lo trae el dato, después de cargar.
  useTituloDePagina(cuenta.datos?.local?.nombre || "Local");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_PAGO_A_DEPOSITO} />, []);

  if (cargandoUsuario) return null;
  // El que manda es el chequeo de la ruta; éste es para no dibujar algo que el
  // servidor va a rechazar. Que un local no pueda pedir otro lo decide el
  // servidor con `resolverLocalPedido`.
  if (!esAdmin && !permisos.includes("finanzas.ver")) return <SinPermisos />;

  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <CuentaPagoADeposito {...cuenta} />
    </div>
  );
}
