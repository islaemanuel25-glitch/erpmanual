"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import usePedidosProveedor from "@/components/compras-proveedor/usePedidosProveedor";
import FiltrosPedidosProveedor from "@/components/compras-proveedor/FiltrosPedidosProveedor";
import ListadoPedidosProveedor from "@/components/compras-proveedor/ListadoPedidosProveedor";

export default function RecepcionMercaderiaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [proveedorId, setProveedorId] = useState(searchParams.get("proveedorId") || "");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Bandeja de recepción: SOLO pedidos ENVIADO (estado fijo).
  const { loading, items, page, setPage, totalPages } = usePedidosProveedor({
    estado: "ENVIADO",
    proveedorId,
    fechaDesde,
    fechaHasta,
    pageSize: 50,
    ordenar: true,
  });

  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) return null;

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  const renderAccion = (item) => (
    <SunmiButton
      color="cyan"
      onClick={() => router.push(`/modulos/compras-proveedor/${item.id}`)}
    >
      Ver / recibir
    </SunmiButton>
  );

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="mb-4">
          <SunmiHeader title="Recibir mercadería" />
          <p className="text-xs sunmi-text-muted px-1">Pedidos enviados pendientes de recibir</p>
        </div>

        <FiltrosPedidosProveedor
          estadoFijoLabel="Enviado (fijo)"
          proveedorId={proveedorId}
          onProveedor={setProveedorId}
          fechaDesde={fechaDesde}
          onFechaDesde={setFechaDesde}
          fechaHasta={fechaHasta}
          onFechaHasta={setFechaHasta}
          onLimpiar={() => {
            setProveedorId("");
            setFechaDesde("");
            setFechaHasta("");
          }}
        />

        <ListadoPedidosProveedor
          items={items}
          loading={loading}
          renderAccion={renderAccion}
          marcarAtrasados
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </SunmiCard>
    </div>
  );
}
