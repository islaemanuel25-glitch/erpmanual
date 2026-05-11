"use client";

import { ArrowUpRight, X, MapPin, Warehouse } from "lucide-react";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";

const ICON_MAP = {
  local: { Icon: MapPin, color: "text-amber-400" },
  deposito: { Icon: Warehouse, color: "text-cyan-400" },
};

function formatNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR");
}

export default function GrupoItemRow({
  local,
  tipo = "local",
  productCount,
  onIr,
  onQuitar,
  showActivo = true,
  pending = false,
}) {
  const { Icon, color } = ICON_MAP[tipo] || ICON_MAP.local;

  return (
    <div
      className={`flex flex-col gap-0.5 px-3 py-2.5 transition ${
        pending ? "opacity-60" : "hover:bg-[var(--table-row-hover)]"
      }`}
      aria-busy={pending}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={15} className={`shrink-0 ${color}`} />
        <span className="text-sm font-semibold sunmi-text-strong truncate">
          {local?.nombre || "—"}
        </span>
        {showActivo && local?.activo && (
          <span className="text-[10px] px-1.5 py-[1px] rounded font-semibold bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 leading-none whitespace-nowrap">
            Activo
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {onIr && (
            <SunmiButtonIcon
              icon={ArrowUpRight}
              size={14}
              onClick={onIr}
              disabled={pending}
              aria-label="Abrir local"
            />
          )}
          {onQuitar && (
            <SunmiButtonIcon
              icon={X}
              color="red"
              size={14}
              onClick={onQuitar}
              disabled={pending}
              aria-label="Quitar"
            />
          )}
        </div>
      </div>
      <div className="text-[11px] sunmi-text-muted pl-[23px]">
        {pending ? "Quitando…" : `${formatNumber(productCount)} productos`}
      </div>
    </div>
  );
}
