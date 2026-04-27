"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import VentaDetalleContent from "@/components/dashboard/VentaDetalleContent";

export default function VentaDetallePage() {
  const params = useParams();
  const ventaId = params.id;

  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ventaId) {
      setError("ID de venta no válido");
      setLoading(false);
      return;
    }

    const cargar = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/pos-ventas/venta/${ventaId}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setVenta(data.venta);
        } else {
          setError(data.error || "Error al cargar la venta");
        }
      } catch (e) {
        console.error("Error cargando venta:", e);
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [ventaId]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <SunmiLoader />
        </div>
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <SunmiCard className="p-5">
          <p className="text-center opacity-80">{error || "Venta no encontrada"}</p>
          <div className="mt-4 flex justify-end">
            <SunmiBackButton href="/modulos/dashboard" />
          </div>
        </SunmiCard>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-lg font-semibold opacity-90">
          Ticket #{venta.numero}
        </h1>
        <SunmiBackButton href="/modulos/dashboard" />
      </div>

      <div className="flex flex-col gap-4">
        <VentaDetalleContent venta={venta} />
      </div>
    </div>
  );
}
