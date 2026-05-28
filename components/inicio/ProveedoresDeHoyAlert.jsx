"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { useUser } from "@/app/context/UserContext";
import { recibeHoy } from "@/lib/proveedores/diasPedido";

const MAX_VISIBLES = 5;

function puedeVer(perfil) {
  const permisos = perfil?.permisos;
  if (!Array.isArray(permisos)) return false;
  return (
    permisos.includes("*") ||
    permisos.includes("compras.ver") ||
    permisos.includes("proveedores.ver")
  );
}

export default function ProveedoresDeHoyAlert() {
  const router = useRouter();
  const { perfil } = useUser();

  const [proveedoresHoy, setProveedoresHoy] = useState([]);
  const [loading, setLoading] = useState(true);

  const tienePermiso = puedeVer(perfil);

  useEffect(() => {
    if (!tienePermiso) {
      setLoading(false);
      return;
    }

    let cancelado = false;

    const cargar = async () => {
      try {
        const res = await fetch(
          "/api/proveedores/listar?estado=activos&pageSize=200",
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado) return;
        if (data.ok && Array.isArray(data.items)) {
          setProveedoresHoy(data.items.filter((p) => recibeHoy(p.dias_pedido)));
        }
      } catch {
        // Silenciar: la card no se muestra si no hay datos.
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    cargar();

    return () => {
      cancelado = true;
    };
  }, [tienePermiso]);

  // No mostrar si: no tiene permisos, está cargando, o no hay proveedores hoy.
  if (!tienePermiso || loading || proveedoresHoy.length === 0) return null;

  const visibles = proveedoresHoy.slice(0, MAX_VISIBLES);
  const extras = proveedoresHoy.length - visibles.length;
  const n = proveedoresHoy.length;

  return (
    <div
      className="rounded-2xl border p-4 mb-6"
      style={{ borderColor: "var(--pos-link)" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] font-semibold"
            style={{ color: "var(--pos-link)" }}
          >
            Hoy tenés proveedores para levantar pedido
          </div>
          <div className="text-[12px] sunmi-text-muted mt-1">
            {n === 1
              ? "1 proveedor recibe pedido hoy"
              : `${n} proveedores reciben pedido hoy`}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {visibles.map((p) => (
              <SunmiPill key={p.id} color="cyan">
                {p.nombre}
              </SunmiPill>
            ))}
            {extras > 0 && (
              <span className="text-[11px] sunmi-text-muted">
                +{extras} más
              </span>
            )}
          </div>
        </div>

        <SunmiButton
          color="cyan"
          onClick={() => router.push("/modulos/compras-proveedor")}
        >
          Ir a Compras
        </SunmiButton>
      </div>
    </div>
  );
}
