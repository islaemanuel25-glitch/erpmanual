"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import usePedidosProveedor, { ESTADOS_PENDIENTES } from "@/components/compras-proveedor/usePedidosProveedor";
import FiltrosPedidosProveedor from "@/components/compras-proveedor/FiltrosPedidosProveedor";
import ListadoPedidosProveedor from "@/components/compras-proveedor/ListadoPedidosProveedor";
import ProveedoresPedidoHoy from "@/components/compras-proveedor/ProveedoresPedidoHoy";

export default function PedidosPendientesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [estado, setEstado] = useState(searchParams.get("estado") || "");
  const [proveedorId, setProveedorId] = useState(searchParams.get("proveedorId") || "");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { loading, items, page, setPage, totalPages } = usePedidosProveedor({
    estados: ESTADOS_PENDIENTES,
    estado,
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

  const renderAccion = (item) => {
    if (item.estado === "BORRADOR") {
      return (
        <SunmiButton
          color="green"
          onClick={() => router.push(`/modulos/compras-proveedor/nueva?pedidoId=${item.id}`)}
        >
          Continuar pedido
        </SunmiButton>
      );
    }
    return (
      <SunmiButton
        color="cyan"
        onClick={() => router.push(`/modulos/compras-proveedor/${item.id}`)}
      >
        Ver / enviar
      </SunmiButton>
    );
  };

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <SunmiHeader title="Pedidos pendientes" />
            <p className="text-xs sunmi-text-muted px-1">Pedidos en preparación o listos para enviar</p>
          </div>
          <SunmiButton onClick={() => router.push("/modulos/compras-proveedor/nueva")}>
            ＋ Nuevo pedido
          </SunmiButton>
        </div>

        <ProveedoresPedidoHoy />

        <FiltrosPedidosProveedor
          estadoOpciones={ESTADOS_PENDIENTES}
          estadoTodosLabel="Todos los pendientes"
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
