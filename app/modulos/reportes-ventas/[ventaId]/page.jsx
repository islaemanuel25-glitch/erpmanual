"use client";

// Página propia "Ver venta" (Commit 1 de la migración modal → página).
// Muestra el MISMO contenido que hoy aparece en el modal del listado, pero como
// página real, sin overlay: reutiliza AccionesTicket (acciones + corrección) y
// VentaDetalleAdmin (detalle completo), cargando el detalle client-side desde el
// endpoint existente. El modal del listado sigue intacto en esta etapa.
//
// NO usa: fixed inset-0, createPortal, fondo de overlay, z-index de modal, botón
// "Cerrar", ni el estado detalleAbierto. Es una ruta navegable/directa por URL.

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { buildVolverUrl, buildCorregirUrl, parseReturnParams } from "@/lib/reportes-ventas/returnParams";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionesTicket from "@/components/reportes-ventas/AccionesTicket";
import VentaDetalleAdmin from "@/components/reportes-ventas/VentaDetalleAdmin";

const FALLBACK_VENTAS = "/modulos/reportes-ventas";

// Esta pantalla YA convertía a la zona de Argentina —era la única de las tres
// del caso que lo hacía— pero le faltaba `hour12: false`, así que mostraba
// "11:16 a. m.". Ahora sale del helper único y queda en 24 horas.
const fmtFechaHoraAR = (iso) => fechaHoraAR(iso);

export default function VerVentaPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const ventaId = params?.ventaId;

  // "Volver a ventas" reconstruido desde el contexto de retorno validado (whitelist).
  // Si no hay params válidos, queda igual a la base y caemos a back()/fallback.
  const volverUrl = useMemo(() => buildVolverUrl(searchParams), [searchParams]);

  // URL de la página de corrección, preservando el contexto de retorno.
  const corregirUrl = useMemo(
    () => buildCorregirUrl(ventaId, parseReturnParams(searchParams)),
    [ventaId, searchParams]
  );

  const [venta, setVenta] = useState(null);
  const [permisos, setPermisos] = useState(null);
  const [loading, setLoading] = useState(true);
  // { status, msg } | null
  const [error, setError] = useState(null);

  // Carga (y RECARGA) del detalle. Reutilizable tras una corrección: refetchea y
  // actualiza venta + permisos SIN salir de la página ni abrir un segundo detalle.
  // No blanquea el contenido en las recargas (solo muestra loader en la 1ra carga).
  const cargarDetalle = useCallback(async () => {
    if (!ventaId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reportes-ventas/detalle/${ventaId}`, {
        credentials: "include",
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      let data = null;
      try { data = await res.json(); } catch {}
      if (res.ok && data?.ok) {
        setVenta(data.venta);
        setPermisos(data.permisos || null);
      } else {
        setError({
          status: res.status,
          msg: data?.error || "No se pudo cargar la venta",
        });
      }
    } catch {
      setError({ status: 0, msg: "Error de conexión" });
    } finally {
      setLoading(false);
    }
  }, [ventaId, router]);

  useEffect(() => {
    cargarDetalle();
  }, [cargarDetalle]);

  // "Volver a ventas":
  //  1) si hay contexto de retorno válido en la URL → navegar EXPLÍCITO al listado
  //     con esos params (restaura tab/página/fechas/local/forma de pago);
  //  2) si no, router.back() cuando sea razonable (no dependemos SOLO de esto);
  //  3) fallback seguro al listado.
  const volver = useCallback(() => {
    if (volverUrl !== FALLBACK_VENTAS) {
      router.push(volverUrl);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(FALLBACK_VENTAS);
  }, [router, volverUrl]);

  const tituloVenta = venta ? `Venta #${venta.numero ?? venta.id}` : "Ver venta";

  const c = venta?.correccion || {};

  return (
    // Mismo patrón de contenedor que POS Ventas y el listado de reportes:
    // `w-full min-h-full p-2 lg:p-3`. Antes el contenido iba dentro de
    // `mx-auto w-full max-w-3xl`, que lo recortaba a 672 px (48rem con raíz de
    // 14px) y lo centraba, dejando el resto del ancho vacío.
    <div className="sunmi-bg w-full min-h-full p-2 lg:p-3">
      <div className="w-full space-y-3">
        {/* Franja de encabezado: Volver + título + estado/corregida + fecha.
            Una sola fila en desktop, con wrap en pantallas chicas. */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <SunmiButton color="slate" onClick={volver} className="text-sm shrink-0">
              ← Volver a ventas
            </SunmiButton>
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {tituloVenta}
            </h1>
            {venta && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                  venta.estado === "fiado"
                    ? "sunmi-state-warning sunmi-text-accent"
                    : "sunmi-state-success sunmi-text-success"
                }`}
              >
                {venta.estado === "fiado" ? "Pendiente" : "Cobrado"}
              </span>
            )}
            {c.corregida && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium sunmi-state-warning sunmi-text-accent whitespace-nowrap">
                ✎ Corregida{c.version ? ` · v${c.version}` : ""}
              </span>
            )}
            {loading && venta && (
              <span className="text-[11px] sunmi-text-muted">Actualizando…</span>
            )}
          </div>
          {venta && (
            <div className="text-right shrink-0">
              <div className="text-[11px] sunmi-text-muted leading-tight">Fecha y hora</div>
              <div className="text-sm font-medium tabular-nums leading-tight">
                {fmtFechaHoraAR(venta.fecha)}
              </div>
            </div>
          )}
        </div>

        {/* Primera carga */}
        {loading && !venta && (
          <div className="text-center py-10">
            <SunmiLoader />
          </div>
        )}

        {/* Errores de carga (solo cuando no hay datos que mostrar) */}
        {!venta && error && (
          <div className="space-y-3">
            {error.status === 404 ? (
              <div className="sunmi-state-warning sunmi-text-accent rounded-lg p-4 text-sm">
                Venta no encontrada o sin acceso.
              </div>
            ) : error.status === 403 ? (
              <div className="sunmi-state-danger sunmi-text-danger rounded-lg p-4 text-sm">
                Acceso denegado.
              </div>
            ) : (
              <div className="sunmi-state-danger sunmi-text-danger rounded-lg p-4 text-sm">
                {error.msg || "Ocurrió un error al cargar la venta."}
              </div>
            )}
            <div className="flex gap-2">
              {error.status !== 404 && error.status !== 403 && (
                <SunmiButton color="amber" onClick={cargarDetalle} className="text-sm">
                  Reintentar
                </SunmiButton>
              )}
              <SunmiButton color="slate" onClick={volver} className="text-sm">
                ← Volver a ventas
              </SunmiButton>
            </div>
          </div>
        )}

        {/* Contenido: acciones + detalle completo (reutilizados sin duplicar) */}
        {venta && (
          <>
            <AccionesTicket
              venta={venta}
              onCorregido={() => cargarDetalle()}
              onCorregirCompleta={() => router.push(corregirUrl)}
            />
            <VentaDetalleAdmin venta={venta} permisos={permisos} />
          </>
        )}
      </div>
    </div>
  );
}
