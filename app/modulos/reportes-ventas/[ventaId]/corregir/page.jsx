"use client";

// Página de CORRECCIÓN completa. Monta EditorVentaCorreccion como contenido de
// página real: sin overlay/portal/z-modal, scroll normal del documento. La REVISIÓN
// de cambios es una etapa in-page del propio editor (misma URL, sin modal).
//
// El editor ya trae la venta desde /editar y muestra los 403/409 (beta, permiso,
// turno cerrado, fuera de ventana) → no duplicamos el fetch del detalle.

import { useMemo, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import EditorVentaCorreccion from "@/components/reportes-ventas/EditorVentaCorreccion";
import { buildDetalleUrl, parseReturnParams } from "@/lib/reportes-ventas/returnParams";

export default function CorregirVentaPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const ventaId = params?.ventaId;

  // URL de la VENTA (detalle) preservando el contexto de retorno (listado → detalle
  // → corregir → detalle → listado). Sin returnTo arbitrario (whitelist del helper).
  const detalleUrl = useMemo(
    () => buildDetalleUrl(ventaId, parseReturnParams(searchParams)),
    [ventaId, searchParams]
  );

  // Volver a la venta: navegación EXPLÍCITA al detalle con contexto (no router.back()).
  const volverALaVenta = useCallback(() => {
    router.push(detalleUrl);
  }, [router, detalleUrl]);

  // Tras corregir: ir al detalle actualizado (conserva params; el detalle re-fetchea
  // en su montaje). No vuelve al listado ni abre ningún modal de detalle.
  const alCorregir = useCallback(() => {
    router.push(detalleUrl);
  }, [router, detalleUrl]);

  return (
    <div className="sunmi-bg w-full min-h-full p-2 sm:p-4">
      <div className="mx-auto w-full max-w-5xl">
        <EditorVentaCorreccion
          ventaId={ventaId}
          onVolver={volverALaVenta}
          onCorregido={alCorregir}
        />
      </div>
    </div>
  );
}
