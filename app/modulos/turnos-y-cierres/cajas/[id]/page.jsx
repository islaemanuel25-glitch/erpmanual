// app/modulos/turnos-y-cierres/cajas/[id]/page.jsx
//
// EL DETALLE DE UNA CAJA (Figma 359:523). Se entra desde la lista y se vuelve
// a ella con el período y la pestaña que tenía: viajan en la dirección. El
// Volver va en el slot del shell, que no scrollea con el contenido.
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
import DetalleDeCaja from "@/components/turnos-y-cierres/DetalleDeCaja";
import { useCajaDeTurnosYCierres } from "@/components/turnos-y-cierres/useCajaDeTurnosYCierres";
import { PERMISO_CAJERO, PERMISOS_VER_TODO } from "@/lib/turnosYCierres/alcance";
import { urlDeLaLista, urlDelZ } from "@/lib/turnosYCierres/pantallaTurnosYCierres";

export default function CajaPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Caja />
    </Suspense>
  );
}

function Caja() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const puede = permisos.includes("*") || [PERMISO_CAJERO, ...PERMISOS_VER_TODO].some((p) => permisos.includes(p));

  const params = useParams();
  const qs = useSearchParams().toString();
  const router = useRouter();
  const volver = useAccionDePagina(() => <SunmiBackButton href={urlDeLaLista(qs)} texto="Turnos y cierres" />, [qs]);
  const t = useCajaDeTurnosYCierres(params?.id);

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
      {t.datos ? <DetalleDeCaja datos={t.datos} onVerZ={() => router.push(urlDelZ(params.id, qs))} /> : null}
    </div>
  );
}
