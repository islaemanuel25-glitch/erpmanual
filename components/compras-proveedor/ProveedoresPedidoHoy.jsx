"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { recibeHoy } from "@/lib/proveedores/diasPedido";

/**
 * Franja de proveedores que reciben pedido hoy (autocontenida).
 * Solo se usa en "Pedidos activos".
 */
export default function ProveedoresPedidoHoy() {
  const router = useRouter();
  const [proveedores, setProveedores] = useState([]);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(
          "/api/proveedores/listar?estado=activos&pageSize=200",
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          setProveedores(data.items.filter((p) => recibeHoy(p.dias_pedido)));
        }
      } catch {
        // Silenciar: se muestra el placeholder.
      }
    };
    cargar();
  }, []);

  return (
    <div className="rounded-2xl border p-3 mb-4" style={{ borderColor: "var(--pos-link)" }}>
      <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--pos-link)" }}>
        Proveedores que reciben pedido hoy
      </div>

      {proveedores.length === 0 ? (
        <div className="text-[11px] sunmi-text-muted">
          Hoy no hay proveedores configurados para recibir pedidos.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {proveedores.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-lg border px-2 py-1 sunmi-surface"
              style={{ borderColor: "var(--pos-link)" }}
            >
              <span className="text-[12px] font-medium sunmi-text-strong">{p.nombre}</span>
              <SunmiButton
                color="cyan"
                onClick={() => router.push(`/modulos/compras-proveedor/nueva?proveedorId=${p.id}`)}
              >
                Crear compra
              </SunmiButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
