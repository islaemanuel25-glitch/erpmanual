"use client";

// Error boundary del segmento "Corregir venta" — errores INESPERADOS del render del
// segmento (los 403/409 de /editar los muestra el propio editor). Ofrece reintentar y
// un retorno seguro a la venta.
import { useParams, useRouter } from "next/navigation";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function CorregirVentaError({ error, reset }) {
  const router = useRouter();
  const params = useParams();
  const ventaId = params?.ventaId;
  const volver = () => {
    const id = Number(ventaId);
    router.push(Number.isInteger(id) && id > 0 ? `/modulos/reportes-ventas/${id}` : "/modulos/reportes-ventas");
  };
  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <div className="sunmi-state-danger sunmi-text-danger rounded-lg p-4 text-sm">
          Ocurrió un error al abrir la corrección.
          {error?.digest ? <span className="sunmi-text-muted ml-1">(ref: {error.digest})</span> : null}
        </div>
        <div className="flex gap-2">
          <SunmiButton color="amber" onClick={() => reset()} className="text-sm">Reintentar</SunmiButton>
          <SunmiButton color="slate" onClick={volver} className="text-sm">← Volver a la venta</SunmiButton>
        </div>
      </div>
    </div>
  );
}
