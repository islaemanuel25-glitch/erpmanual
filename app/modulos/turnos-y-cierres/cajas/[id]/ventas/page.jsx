// app/modulos/turnos-y-cierres/cajas/[id]/ventas/page.jsx
//
// "VENTAS DE LA CAJA #N": todas las ventas de una caja en orden de hora, con
// las anuladas y las internas marcadas, y al pie lo cobrado por medio. Se llega
// desde el recuadro "N tickets · Ver ventas de esta caja ›" de la tarjeta del
// trabajador. Tocar una venta abre su detalle en Reportes de ventas. Solo lee.
"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import { VentasDeCaja } from "@/components/turnos-y-cierres/DetalleDeCaja";
import { useCajaDeTurnosYCierres } from "@/components/turnos-y-cierres/useCajaDeTurnosYCierres";
import { puedeVerTurnosYCierres } from "@/lib/turnosYCierres/alcance";
import { urlDeCaja, urlDeLaVenta } from "@/lib/turnosYCierres/pantallaTurnosYCierres";

export default function VentasDeCajaPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Ventas />
    </Suspense>
  );
}

function Ventas() {
  const { perfil, cargando } = useUser();
  const puede = puedeVerTurnosYCierres(perfil);

  const params = useParams();
  const qs = useSearchParams().toString();
  const router = useRouter();
  const volver = useAccionDePagina(
    () => <SunmiBackButton href={urlDeCaja(params?.id, qs)} texto={`Caja #${params?.id}`} />,
    [params?.id, qs]
  );
  const t = useCajaDeTurnosYCierres(params?.id, "/ventas");

  if (cargando) return null;
  if (!puede) return <SinPermisos />;

  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      {t.cargando && !t.datos ? (
        <div className="py-12">
          <SunmiLoader />
        </div>
      ) : null}
      {t.error && !t.cargando ? (
        <div role="alert" className="rounded-xl border sunmi-border-danger px-4 py-3 space-y-2">
          <p className="text-sm2 sunmi-text-danger">{t.error}</p>
          <SunmiButton color="slate" type="button" onClick={t.recargar} className="min-h-toque">
            Reintentar
          </SunmiButton>
        </div>
      ) : null}
      {t.datos ? <VentasDeCaja datos={t.datos} onVerVenta={(id) => router.push(urlDeLaVenta(id))} /> : null}
    </div>
  );
}
