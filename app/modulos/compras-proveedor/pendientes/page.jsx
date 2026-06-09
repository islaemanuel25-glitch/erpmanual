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

// Referencia ESTABLE (fuera del componente): pasar el array inline al hook
// recreaba la dependencia en cada render → loop de fetch/render.
const ESTADOS_EN_CURSO = ["BORRADOR"];

export default function PedidosPendientesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [estado, setEstado] = useState(searchParams.get("estado") || "");
  const [proveedorId, setProveedorId] = useState(searchParams.get("proveedorId") || "");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { loading, items, page, setPage, totalPages, recargar } = usePedidosProveedor({
    estados: ESTADOS_EN_CURSO,
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

  const anularPedido = async (item) => {
    if (!window.confirm("¿Seguro que querés anular este pedido?")) return;
    try {
      const res = await fetch(`/api/compras-proveedor/anular/${item.id}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        recargar();
      } else {
        alert(data.error || "No se pudo anular el pedido");
      }
    } catch {
      alert("Error de conexión al anular el pedido");
    }
  };

  const renderAccion = (item) => (
    <div className="flex flex-wrap items-center gap-2 justify-end">
      <SunmiButton
        type="button"
        color="cyan"
        onClick={() => router.push(`/modulos/compras-proveedor/nueva?pedidoId=${item.id}`)}
      >
        Continuar pedido
      </SunmiButton>
      <SunmiButton type="button" color="red" onClick={() => anularPedido(item)}>
        Anular
      </SunmiButton>
    </div>
  );

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="mb-4">
          <SunmiHeader title="Pedidos pendientes" />
          <p className="text-xs sunmi-text-muted px-1">Pedidos en preparación o listos para enviar</p>
        </div>

        <FiltrosPedidosProveedor
          mostrarEstado={false}
          separadorLabel={null}
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
          agruparPorDia
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </SunmiCard>
    </div>
  );
}
