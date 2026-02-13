"use client";

import { useState, useEffect } from "react";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Hook que carga stats del dia y actualiza cada 30s.
 */
export function useStatsDelDia(localId) {
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

  return stats;
}

/**
 * Componente compacto inline para mostrar stats en el header.
 */
export default function StatsDelDia({ localId }) {
  const stats = useStatsDelDia(localId);

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="text-slate-400">
        <span className="text-cyan-400 font-semibold">{stats.ventas}</span> ventas
      </span>
      <span className="text-slate-400">
        $<span className="text-amber-400 font-semibold">{formatPrecio(stats.total)}</span>
      </span>
      <span className="text-slate-400 hidden sm:inline">
        <span className="text-emerald-400 font-semibold">{stats.items}</span> items
      </span>
    </div>
  );
}
