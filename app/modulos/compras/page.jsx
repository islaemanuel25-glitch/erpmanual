"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPanel from "@/components/sunmi/SunmiPanel";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import { recibeHoy } from "@/lib/proveedores/diasPedido";

const COMPRAS = "/modulos/compras-proveedor";

export default function PanelComprasPage() {
  const router = useRouter();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [loading, setLoading] = useState(true);
  const [conteos, setConteos] = useState({
    BORRADOR: 0,
    CONFIRMADO: 0,
    ENVIADO: 0,
    RECIBIDO: 0,
    ANULADO: 0,
  });
  const [activos, setActivos] = useState(0);
  const [historial, setHistorial] = useState(0);
  const [proveedoresHoy, setProveedoresHoy] = useState(0);

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/compras-proveedor/resumen", {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setConteos(data.conteos || conteos);
          setActivos(data.activos || 0);
          setHistorial(data.historial || 0);
        }
      } finally {
        setLoading(false);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proveedores que reciben pedido hoy (misma lógica que la lista de compras).
  useEffect(() => {
    const cargarHoy = async () => {
      try {
        const res = await fetch(
          "/api/proveedores/listar?estado=activos&pageSize=200",
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          setProveedoresHoy(data.items.filter((p) => recibeHoy(p.dias_pedido)).length);
        }
      } catch {
        // Silenciar: queda en 0.
      }
    };
    cargarHoy();
  }, []);

  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) return null;

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  const cards = [
    {
      key: "activos",
      titulo: "Pedidos activos",
      desc: "Borrador + confirmado + enviado",
      valor: activos,
      href: `${COMPRAS}?vista=activos`,
      boton: "Ver activos",
    },
    {
      key: "enviados",
      titulo: "Enviados pendientes de recepción",
      desc: "Esperando recibir mercadería",
      valor: conteos.ENVIADO,
      href: `${COMPRAS}?vista=activos&estado=ENVIADO`,
      boton: "Recibir",
    },
    {
      key: "confirmados",
      titulo: "Confirmados sin enviar",
      desc: "Listos para enviar al proveedor",
      valor: conteos.CONFIRMADO,
      href: `${COMPRAS}?vista=activos&estado=CONFIRMADO`,
      boton: "Enviar pedidos",
    },
    {
      key: "borradores",
      titulo: "Borradores",
      desc: "Pedidos en curso",
      valor: conteos.BORRADOR,
      href: `${COMPRAS}?vista=activos&estado=BORRADOR`,
      boton: "Continuar",
    },
    {
      key: "historial",
      titulo: "Historial / compras cerradas",
      desc: "Recibido + anulado",
      valor: historial,
      href: `${COMPRAS}?vista=historial`,
      boton: "Ver historial",
    },
    {
      key: "proveedoresHoy",
      titulo: "Proveedores que reciben hoy",
      desc: "Configurados para pedido hoy",
      valor: proveedoresHoy,
      href: "/modulos/proveedores",
      boton: "Ver proveedores",
    },
  ];

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-center justify-between mb-4">
          <SunmiHeader title="Panel de compras" />
          <SunmiButton onClick={() => router.push(`${COMPRAS}/nueva`)}>
            ＋ Nuevo pedido
          </SunmiButton>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((c) => (
            <SunmiPanel
              key={c.key}
              className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm flex flex-col gap-2"
            >
              <div className="text-[12px] sunmi-text-muted">{c.titulo}</div>
              <div className="text-3xl font-bold sunmi-text-strong leading-none">
                {loading ? "—" : c.valor}
              </div>
              <div className="text-[11px] sunmi-text-muted">{c.desc}</div>
              <div className="mt-2">
                <SunmiButton color="cyan" onClick={() => router.push(c.href)}>
                  {c.boton}
                </SunmiButton>
              </div>
            </SunmiPanel>
          ))}
        </div>
      </SunmiCard>
    </div>
  );
}
