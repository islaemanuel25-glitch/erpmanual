"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import {
  Landmark,
  TrendingUp,
  Package,
} from "lucide-react";

const SECCIONES = [
  {
    key: "turnos",
    label: "Cajas",
    descripcion: "Arqueos, turnos y efectivo",
    href: "/modulos/auditoria-pos-ventas/turnos",
    icon: Landmark,
    iconColor: "#60a5fa",
    glowColor: "rgba(96,165,250,0.12)",
  },
  {
    key: "balances",
    label: "Balances",
    descripcion: "Ventas, costos, márgenes y comisiones",
    href: "/modulos/auditoria-pos-ventas/balances",
    icon: TrendingUp,
    iconColor: "#fbbf24",
    glowColor: "rgba(251,191,36,0.12)",
  },
  {
    key: "productos",
    label: "Productos",
    descripcion: "Rentabilidad, ranking y tickets conflictivos",
    href: "/modulos/auditoria-pos-ventas/productos",
    icon: Package,
    iconColor: "#a78bfa",
    glowColor: "rgba(167,139,250,0.12)",
  },
];

export default function AuditoriaPosVentasHub() {
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  if (!perfil || cargandoUsuario) return null;
  if (loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("reportes.ver")) {
    return <SinPermisos />;
  }

  const localNombre = contexto?.nombre || "—";

  return (
    <>
      <style>{`
        @keyframes hubFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes hubHeaderIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hub-header-anim {
          animation: hubHeaderIn 0.5s ease-out both;
        }
        .hub-card-anim {
          animation: hubFadeUp 0.45s ease-out both;
        }
        .hub-card-anim:nth-child(1) { animation-delay: 0.08s; }
        .hub-card-anim:nth-child(2) { animation-delay: 0.16s; }
        .hub-card-anim:nth-child(3) { animation-delay: 0.24s; }
        .hub-card {
          transition: transform 0.22s cubic-bezier(.4,0,.2,1), box-shadow 0.22s cubic-bezier(.4,0,.2,1);
        }
        .hub-card:hover {
          transform: translateY(-6px) scale(1.015);
          box-shadow: 0 20px 40px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06);
        }
        .hub-card:active {
          transform: translateY(-2px) scale(1.005);
        }
        .hub-icon-wrap {
          transition: transform 0.3s cubic-bezier(.4,0,.2,1);
        }
        .hub-card:hover .hub-icon-wrap {
          transform: scale(1.12);
        }
      `}</style>

      <div className="pb-24">
        {/* Banner */}
        <div
          className="hub-header-anim relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #0c2d4a 0%, #143d5e 40%, #1a4971 100%)",
          }}
        >
          {/* Glow decorativo */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(96,165,250,0.25) 0%, transparent 70%)",
            }}
          />
          <div className="relative z-10 px-4 py-12 sm:py-16 text-center max-w-3xl mx-auto">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Auditoría POS
            </h1>
            <p className="text-sm sm:text-base text-blue-200/60 mt-2 font-light">
              Trazabilidad operativa · {localNombre}
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12 relative z-20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {SECCIONES.map((sec, i) => (
              <div key={sec.key} className="hub-card-anim" style={{ animationDelay: `${i * 0.1}s` }}>
                <HubCard sec={sec} onClick={() => router.push(sec.href)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function HubCard({ sec, onClick }) {
  const Icon = sec.icon;

  return (
    <button
      onClick={onClick}
      className="hub-card w-full rounded-2xl bg-[var(--card-bg)] border border-[var(--border)] cursor-pointer flex flex-col items-center text-center px-5 py-8 sm:py-10 gap-4"
    >
      {/* Icono grande con glow */}
      <div
        className="hub-icon-wrap w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-[22px] flex items-center justify-center"
        style={{ backgroundColor: sec.glowColor }}
      >
        <Icon
          size={36}
          strokeWidth={1.6}
          style={{ color: sec.iconColor }}
          className="sm:!w-[44px] sm:!h-[44px]"
        />
      </div>

      {/* Texto */}
      <div className="space-y-1">
        <h2 className="text-base sm:text-lg font-bold leading-tight">
          {sec.label}
        </h2>
        <p className="text-[11px] sm:text-xs sunmi-text-muted leading-relaxed max-w-[200px] mx-auto">
          {sec.descripcion}
        </p>
      </div>
    </button>
  );
}
