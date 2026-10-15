"use client";

// app/modulos/compras-proveedor/por-cargar/page.jsx
//
// COMPRAS POR CARGAR (Figma EVJ2KvVCrY0oVSowfboymQ, P4 387:660). Lo que se le
// pagó a un proveedor desde "Pagar" del POS y todavía no se recibió. "Cargar"
// abre la recepción de siempre de esa compra —con la foto del remito, si se
// sacó—; al confirmarla, el pago ya hecho queda en su cuenta y la caja no se
// descuenta otra vez.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SinPermisos from "@/components/auth/SinPermisos";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import { horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { formatearMoneda } from "@/lib/moneda";
import { rotuloDeDia } from "@/lib/turnosYCierres/pantallaTurnosYCierres";

export default function ComprasPorCargarPage() {
  const router = useRouter();
  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useAccionDePagina(() => <SunmiBackButton href="/modulos/compras" />, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/compras-proveedor/por-cargar", { credentials: "include", cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!d?.ok) setError(d?.error || "No se pudieron leer las compras por cargar.");
      else setDatos(d);
    } catch {
      setError("No se pudieron leer las compras por cargar.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!loadingCtx && !needsContexto) cargar();
  }, [loadingCtx, needsContexto, cargar]);

  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  if (!perfil || loadingCtx || needsContexto) return null;
  const permisos = perfil?.permisos || [];
  if (!permisos.includes("*") && !permisos.includes("compras.recibir")) return <SinPermisos />;

  const items = datos?.items || [];

  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3">
      {datos?.local?.nombre ? <p className="text-sm2 sunmi-text-muted">{datos.local.nombre}</p> : null}

      {error && !cargando ? (
        <div role="alert" className="rounded-xl border sunmi-border-danger px-4 py-3 space-y-2">
          <p className="text-sm2 sunmi-text-danger">{error}</p>
          <SunmiButton color="slate" type="button" onClick={cargar} className="min-h-toque">
            Reintentar
          </SunmiButton>
        </div>
      ) : null}

      {cargando && !datos ? (
        <div className="py-12">
          <SunmiLoader />
        </div>
      ) : null}

      {datos && !items.length ? (
        <p className="py-10 text-center text-sm3 sunmi-text-muted">No hay compras por cargar.</p>
      ) : null}

      {items.map((c) => (
        <CompraPorCargar
          key={c.id}
          c={c}
          onCargar={() => router.push(`/modulos/compras-proveedor/${c.id}`)}
        />
      ))}
    </div>
  );
}

function CompraPorCargar({ c, onCargar }) {
  const cuando = [rotuloDeDia(fechaArgentinaISO(c.fecha)), horaAR(c.fecha), c.cajero].filter(Boolean).join(" · ");
  return (
    <SunmiButton
      type="button"
      color="ghost"
      data-compra-por-cargar={c.id}
      onClick={onCargar}
      className="w-full min-h-0 rounded-xl2 border sunmi-border sunmi-bg-card px-4 py-3.5 justify-start text-left font-normal"
    >
      <span className="flex w-full items-center gap-3">
        {c.fotoComprobanteId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/compras-proveedor/comprobantes/foto/${c.fotoComprobanteId}`}
            alt=""
            className="size-12 shrink-0 rounded-lg object-cover sunmi-bg"
          />
        ) : (
          <span aria-hidden="true" className="size-12 shrink-0 rounded-lg sunmi-bg" />
        )}
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block truncate text-sm3 font-semibold sunmi-text-strong">{c.proveedor?.nombre}</span>
          <span className="block truncate text-sm2 sunmi-text-muted">{cuando}</span>
          <SunmiPill color="amber">{c.estado}</SunmiPill>
        </span>
        <span className="shrink-0 space-y-1 text-right">
          <span className="block text-sm3 font-semibold tabular-nums sunmi-text-strong">{formatearMoneda(c.monto)}</span>
          <span className="block text-sm2 font-semibold sunmi-text-accent">Cargar ›</span>
        </span>
      </span>
    </SunmiButton>
  );
}
