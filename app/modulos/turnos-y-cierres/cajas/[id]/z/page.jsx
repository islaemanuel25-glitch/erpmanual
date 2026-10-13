// app/modulos/turnos-y-cierres/cajas/[id]/z/page.jsx
//
// EL COMPROBANTE Z DE UNA CAJA (Figma 359:605). En pantalla, los números del
// detalle; "Reimprimir" imprime el MISMO papel que la ficha del turno, con
// `imprimirZReport` —una sola copia del comprobante—. Vuelve al detalle.
"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import { imprimirZReport } from "@/components/turnos/imprimirZReport";
import { ComprobanteZ } from "@/components/turnos-y-cierres/DetalleDeCaja";
import { useCajaDeTurnosYCierres } from "@/components/turnos-y-cierres/useCajaDeTurnosYCierres";
import { PERMISO_CAJERO, PERMISOS_VER_TODO } from "@/lib/turnosYCierres/alcance";
import { esCerrada, urlDeMovimientos } from "@/lib/turnosYCierres/pantallaTurnosYCierres";

export default function ComprobanteZPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Comprobante />
    </Suspense>
  );
}

function Comprobante() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const puede = permisos.includes("*") || [PERMISO_CAJERO, ...PERMISOS_VER_TODO].some((p) => permisos.includes(p));

  const params = useParams();
  const qs = useSearchParams().toString();
  const volver = useAccionDePagina(
    // Se entra desde "Arqueos, pagos y Z" y se vuelve ahí.
    () => <SunmiBackButton href={urlDeMovimientos(params?.id, qs)} texto={`Caja #${params?.id}`} />,
    [params?.id, qs]
  );
  const t = useCajaDeTurnosYCierres(params?.id);

  if (cargando) return null;
  if (!puede) return <SinPermisos />;

  const z = t.datos?.z;
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
      {t.datos && !esCerrada(t.datos.caja) ? (
        <p className="py-10 text-center text-sm3 sunmi-text-muted">La caja sigue abierta: todavía no tiene Z.</p>
      ) : null}
      {t.datos && esCerrada(t.datos.caja) ? (
        <ComprobanteZ datos={t.datos} onReimprimir={() => imprimirZReport(z.turno, z.resumen, z.movimientos)} />
      ) : null}
    </div>
  );
}
