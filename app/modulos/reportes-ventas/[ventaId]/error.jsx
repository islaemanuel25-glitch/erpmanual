"use client";

// Error boundary del segmento "Ver venta" — captura errores INESPERADOS del render
// del segmento (no los 404/403 del fetch, que la página maneja inline). Ofrece
// Reintentar (reset del boundary) y un retorno seguro al listado.
import { useRouter } from "next/navigation";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function VerVentaError({ error, reset }) {
  const router = useRouter();
  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="sunmi-state-danger sunmi-text-danger rounded-lg p-4 text-sm">
          Ocurrió un error al mostrar la venta.
          {error?.digest ? (
            <span className="sunmi-text-muted ml-1">(ref: {error.digest})</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <SunmiButton color="amber" onClick={() => reset()} className="text-sm">
            Reintentar
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={() => router.push("/modulos/reportes-ventas")}
            className="text-sm"
          >
            ← Volver a ventas
          </SunmiButton>
        </div>
      </div>
    </div>
  );
}
