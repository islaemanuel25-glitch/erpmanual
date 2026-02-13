"use client";

import { useState, useEffect } from "react";

export default function ProductosFavoritos({ localId, onAgregar }) {
  const [favoritos, setFavoritos] = useState([]);

  useEffect(() => {
    if (!localId) return;
    fetch(`/api/pos-ventas/favoritos?localId=${localId}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setFavoritos(data.items || []);
      })
      .catch(() => {});
  }, [localId]);

  if (favoritos.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="text-[11px] text-slate-400 mb-1">Acceso rapido</div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {favoritos.map((p) => (
          <button
            key={p.id}
            onClick={() => onAgregar(p)}
            className="bg-slate-800 hover:bg-slate-700 active:bg-amber-600/30 rounded-lg px-3 py-2 text-left transition-colors shrink-0 min-w-0"
          >
            <div className="text-xs font-medium truncate max-w-[100px]">
              {p.nombre}
            </div>
            <div className="text-[11px] text-amber-400">
              ${Number(p.precio_venta || p.precioVenta).toLocaleString("es-AR")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
