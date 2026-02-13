"use client";

import { useState, useEffect } from "react";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function StatsDelDia({ localId }) {
  const [stats, setStats] = useState({ ventas: 0, total: 0, items: 0 });

  useEffect(() => {
    if (!localId) return;

    const cargar = async () => {
      try {
        const res = await fetch(
          `/api/pos-ventas/stats-dia?localId=${localId}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) setStats(data.stats);
      } catch {
        // silencioso
      }
    };

    cargar();
    const interval = setInterval(cargar, 30000);
    return () => clearInterval(interval);
  }, [localId]);

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-slate-800/60 p-2 rounded-lg text-center">
        <div className="text-[10px] text-slate-400">Ventas</div>
        <div className="text-lg font-bold text-cyan-400">{stats.ventas}</div>
      </div>
      <div className="bg-slate-800/60 p-2 rounded-lg text-center">
        <div className="text-[10px] text-slate-400">Total</div>
        <div className="text-lg font-bold text-amber-400">
          ${formatPrecio(stats.total)}
        </div>
      </div>
      <div className="bg-slate-800/60 p-2 rounded-lg text-center">
        <div className="text-[10px] text-slate-400">Items</div>
        <div className="text-lg font-bold text-emerald-400">{stats.items}</div>
      </div>
    </div>
  );
}
