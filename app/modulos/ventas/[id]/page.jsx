"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import VentaDetalleContent from "@/components/dashboard/VentaDetalleContent";
import { ArrowLeft } from "lucide-react";

export default function VentaDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { perfil } = useUser();
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
          <div className="mt-4 flex justify-center">
            <SunmiButton
              color="slate"
              onClick={() => router.push("/modulos/dashboard")}
            >
              Volver al panel
            </SunmiButton>
          </div>
        </SunmiCard>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => router.push("/modulos/dashboard")}
          className="p-2 rounded-lg opacity-70 hover:opacity-100 hover:bg-current/10 transition"
          aria-label="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold opacity-90">
          Ticket #{venta.numero}
        </h1>
      </div>

      <div className="flex flex-col gap-4">
        <VentaDetalleContent venta={venta} />
      </div>
    </div>
  );
}
