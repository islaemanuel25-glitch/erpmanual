"use client";

// Buscador de productos FULLSCREEN (patrón compras/recibir): input arriba,
// resultados en tarjetas grandes (nombre, presentación, stock, precio) con
// controles táctiles. Portal a document.body por encima del editor (z-[10002]).

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ModalBuscarProducto({ localId, onSelect, onClose }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    if (!q || q.length < 2) { setRes([]); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      setCargando(true);
      try {
        const r = await fetch(`/api/pos-ventas/buscar-producto?q=${encodeURIComponent(q)}&localId=${localId}`, { credentials: "include" });
        const d = await r.json();
        if (vivo) setRes((d.items || d.productos || []).slice(0, 20));
      } catch { if (vivo) setRes([]); }
      finally { if (vivo) setCargando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(id); };
  }, [q, localId]);

  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10002] sunmi-bg flex flex-col" style={{ overflowX: "hidden" }}>
      <div className="flex items-center gap-2 p-3 border-b sunmi-divider shrink-0">
        <SunmiButton color="slate" onClick={onClose} className="text-sm">← Volver</SunmiButton>
        <div className="font-bold">Agregar producto</div>
      </div>
      <div className="p-3 shrink-0">
        <SunmiInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código…" className="text-base" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2" style={{ overflowX: "hidden" }}>
        {cargando && <div className="text-center py-4 sunmi-text-muted text-sm">Buscando…</div>}
        {!cargando && q.length >= 2 && res.length === 0 && (
          <div className="text-center py-8 sunmi-text-muted text-sm">Sin resultados para “{q}”.</div>
        )}
        {res.map((p) => {
          const baseId = p.productoBaseId ?? p.baseId;
          const precio = Number(p.precioVenta ?? p.precio ?? p.precio_venta ?? 0);
          const presentacion = p.esServicioImporteVariable ? "Servicio" : (p.modoSalidaDefault === "BULTO" ? "Bulto" : "Unidad");
          return (
            <button
              key={p.productoLocalId ?? baseId}
              type="button"
              onClick={() => onSelect({ productoBaseId: baseId, nombre: p.nombre, precio, esServicio: !!p.esServicioImporteVariable, esCombo: !!p.esCombo })}
              className="w-full text-left sunmi-surface rounded-lg p-3 flex items-center justify-between gap-3 active:opacity-70"
            >
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.nombre}</div>
                <div className="text-[11px] sunmi-text-muted mt-0.5 flex flex-wrap gap-x-2">
                  {p.codigoBarra ? <span>Cód. {p.codigoBarra}</span> : null}
                  <span>{presentacion}</span>
                  {p.stock != null ? <span>Stock {Number(p.stock)}</span> : null}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold tabular-nums">{precio > 0 ? money(precio) : "—"}</div>
                <div className="text-[11px] sunmi-text-link">Agregar +</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
