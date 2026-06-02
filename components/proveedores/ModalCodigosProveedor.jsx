"use client";

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";

/**
 * ModalCodigosProveedor — vista de SOLO LECTURA de los productos del ERP
 * vinculados a un proveedor por su código interno.
 * Consume GET /api/proveedores/codigos?proveedorId=ID. No crea/edita/elimina.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - proveedor: { id, nombre }
 */
export default function ModalCodigosProveedor({ open, onClose, proveedor }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !proveedor?.id) return;
    let cancelado = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/proveedores/codigos?proveedorId=${proveedor.id}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado) return;
        if (data.ok) {
          setItems(data.items || []);
        } else {
          setError(data.error || "No se pudieron cargar los productos vinculados.");
        }
      } catch {
        if (!cancelado) setError("Error de conexión al cargar los productos vinculados.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [open, proveedor?.id]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-3">
      <SunmiCard className="w-[95%] max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title={`Productos vinculados — ${proveedor?.nombre ?? ""}`} />
          <SunmiButton color="cyan" onClick={onClose}>
            Cerrar
          </SunmiButton>
        </div>

        <p className="text-xs sunmi-text-muted mb-3">
          Productos del ERP identificados con un código interno de este proveedor. Solo lectura.
        </p>

        <div className="max-h-[65vh] overflow-y-auto">
          {loading ? (
            <p className="text-xs sunmi-text-muted italic">Cargando...</p>
          ) : error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-xs sunmi-text-muted italic">
              Este proveedor no tiene productos vinculados.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-start justify-between gap-3 rounded-md px-3 py-2 sunmi-surface ring-1 ring-inset sunmi-ring"
                >
                  <div className="text-[13px] min-w-0">
                    <div className="truncate">
                      <span className="font-mono font-medium">{it.codigoInterno}</span>
                      {it.descripcionProveedor && (
                        <span className="sunmi-text-muted"> · {it.descripcionProveedor}</span>
                      )}
                    </div>
                    <div className="truncate">
                      <span className="sunmi-text-muted">Producto ERP: </span>
                      <span className="font-medium">{it.nombre ?? "—"}</span>
                    </div>
                  </div>
                  <div className="text-[12px] text-right shrink-0 sunmi-text-muted">
                    {it.codigo_barra || it.codigo_barra_secundario ? (
                      <>
                        <div>CB: {it.codigo_barra || "—"}</div>
                        {it.codigo_barra_secundario && (
                          <div>CB2: {it.codigo_barra_secundario}</div>
                        )}
                      </>
                    ) : (
                      <div>Sin código de barras</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
