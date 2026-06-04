"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import usePedidosProveedor, { ESTADOS_HISTORIAL, isoHaceDias, hoyLocalISO } from "@/components/compras-proveedor/usePedidosProveedor";
import FiltrosPedidosProveedor from "@/components/compras-proveedor/FiltrosPedidosProveedor";
import ListadoPedidosProveedor from "@/components/compras-proveedor/ListadoPedidosProveedor";

export default function HistorialComprasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [estado, setEstado] = useState(searchParams.get("estado") || "");
  const [proveedorId, setProveedorId] = useState(searchParams.get("proveedorId") || "");
  // Historial arranca por defecto en los últimos 7 días (el usuario puede "Ver todo").
  const [fechaDesde, setFechaDesde] = useState(() => isoHaceDias(7));
  const [fechaHasta, setFechaHasta] = useState(() => hoyLocalISO());

  const { loading, items, page, setPage, totalPages } = usePedidosProveedor({
    estados: ESTADOS_HISTORIAL,
    estado,
    proveedorId,
    fechaDesde,
    fechaHasta,
    pageSize: 20,
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
      Ver detalle
    </SunmiButton>
  );

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="mb-4">
          <SunmiHeader title="Historial de compras" />
          <p className="text-xs sunmi-text-muted px-1">Pedidos recibidos o anulados</p>
        </div>

        <FiltrosPedidosProveedor
          estadoOpciones={ESTADOS_HISTORIAL}
          estadoTodosLabel="Todo el historial"
          estado={estado}
          onEstado={setEstado}
          proveedorId={proveedorId}
          onProveedor={setProveedorId}
          fechaDesde={fechaDesde}
          onFechaDesde={setFechaDesde}
          fechaHasta={fechaHasta}
          onFechaHasta={setFechaHasta}
          onLimpiar={() => {
            setEstado("");
            setProveedorId("");
            setFechaDesde("");
            setFechaHasta("");
          }}
        />

        <ListadoPedidosProveedor
          items={items}
          loading={loading}
          renderAccion={renderAccion}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </SunmiCard>
    </div>
  );
}
