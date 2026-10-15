// app/modulos/turnos-y-cierres/page.jsx
//
// TURNOS Y CIERRES: los turnos del período con sus cajas, y para el cajero
// solo sus cajas. Tiene entrada propia en el menú, así que no registra Volver;
// el título del shell sale del ítem del menú.
//
// La entrada mira los permisos para no dibujar algo que el servidor va a
// rechazar; QUÉ cajas se ven lo decide el servidor (`alcanceDeCajas`).
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import PantallaTurnosYCierres from "@/components/turnos-y-cierres/PantallaTurnosYCierres";
import { useTurnosYCierres } from "@/components/turnos-y-cierres/useTurnosYCierres";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { PERMISO_CAJERO, PERMISO_CLASIFICAR_PAGOS, PERMISOS_VER_TODO } from "@/lib/turnosYCierres/alcance";

export default function TurnosYCierresPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <TurnosYCierres />
    </Suspense>
  );
}

function TurnosYCierres() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const puede = permisos.includes("*") || [PERMISO_CAJERO, ...PERMISOS_VER_TODO].some((p) => permisos.includes(p));

  if (cargando) return null;
  if (!puede) return <SinPermisos />;
  return <Contenido />;
}

function Contenido() {
  const t = useTurnosYCierres();
  const { perfil } = useUser();
  const permisos = perfil?.permisos || [];
  const puedeClasificar = permisos.includes("*") || permisos.includes(PERMISO_CLASIFICAR_PAGOS);
  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4">
      <PantallaTurnosYCierres
        datos={t.datos}
        cargando={t.cargando}
        error={t.error}
        ctx={t.ctx}
        hoy={hoyArgentinaISO()}
        pestana={t.pestana}
        onCambiarPestana={t.onCambiarPestana}
        onCambiarUnidad={t.onCambiarUnidad}
        onElegirRango={t.onElegirRango}
        onAtras={t.onAtras}
        onAdelante={t.onAdelante}
        onReintentar={t.recargar}
        onVerCaja={t.onVerCaja}
        puedeClasificar={puedeClasificar}
        onClasificar={t.onClasificar}
      />
    </div>
  );
}
