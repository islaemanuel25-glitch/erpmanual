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

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/compras-proveedor/resumen", {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok && data.conteos) setConteos(data.conteos);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, []);

  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) return null;

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  // Tarjetas orientadas a tareas (no a estados técnicos).
  const cards = [
    {
      key: "nuevo",
      titulo: "Nuevo pedido",
      desc: "Cargar un pedido a proveedor",
      href: `${COMPRAS}/nueva`,
      boton: "Crear pedido",
    },
    {
      key: "pendientes",
      titulo: "Pedidos pendientes",
      desc: "En preparación o listos para enviar",
      valor: conteos.BORRADOR + conteos.CONFIRMADO,
      href: `${COMPRAS}/pendientes`,
      boton: "Ver pendientes",
    },
    {
      key: "recibir",
      titulo: "Recibir mercadería",
      desc: "Enviados pendientes de recibir",
      valor: conteos.ENVIADO,
      href: `${COMPRAS}/recepcion`,
      boton: "Recibir",
    },
    {
      key: "historial",
      titulo: "Historial",
      desc: "Compras recibidas o anuladas",
      valor: conteos.RECIBIDO + conteos.ANULADO,
      href: `${COMPRAS}/historial`,
      boton: "Ver historial",
    },
    {
      key: "proveedores",
      titulo: "Proveedores",
      desc: "Administrar proveedores",
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
              className="ring-2 ring-inset sunmi-ring shadow-sm flex flex-col gap-2"
            >
              <div className="text-[12px] sunmi-text-muted">{c.titulo}</div>
              {c.valor !== undefined && (
                <div className="text-3xl font-bold sunmi-text-strong leading-none">
                  {loading ? "—" : c.valor}
                </div>
              )}
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
