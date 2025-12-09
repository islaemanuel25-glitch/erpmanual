"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function Encabezado({ origen, destino, me }) {
  const { ui } = useUIConfig();

  return (
    <div
      className="bg-slate-900 border border-slate-800 shadow-md"
      style={{
        borderRadius: ui.helpers.radius("xl"),
        padding: ui.helpers.spacing("lg"),
        fontSize: ui.helpers.font("xs"),
        marginBottom: ui.helpers.spacing("lg"),
      }}
    >

      {/* =============================== */}
      {/* 🔶 TITULO POS */}
      {/* =============================== */}
      <div
        className="flex items-center justify-between"
        style={{
          marginBottom: ui.helpers.spacing("lg"),
        }}
      >
        {/* ICONO POS */}
        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("md"),
          }}
        >
          <div
            className="bg-amber-400 flex items-center justify-center text-slate-900 font-black shadow-[0_0_10px_rgba(250,204,21,0.6)]"
            style={{
              height: parseInt(ui.helpers.controlHeight()) * 1.4,
              width: parseInt(ui.helpers.controlHeight()) * 1.4,
              borderRadius: ui.helpers.radius("xl"),
              fontSize: ui.helpers.font("sm"),
            }}
          >
            POS
          </div>

          <div>
            <div
              className="uppercase tracking-wide text-slate-400"
              style={{
                fontSize: ui.helpers.font("xs"),
              }}
            >
              Sesión de preparación
            </div>
            <div
              className="font-semibold text-slate-100"
              style={{
                fontSize: ui.helpers.font("lg"),
              }}
            >
              Transferencia de mercadería
            </div>
          </div>
        </div>

        {/* ESTADO */}
        <span
          className="font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
          style={{
            paddingLeft: ui.helpers.spacing("md"),
            paddingRight: ui.helpers.spacing("md"),
            paddingTop: ui.helpers.spacing("xs"),
            paddingBottom: ui.helpers.spacing("xs"),
            fontSize: ui.helpers.font("xs"),
          }}
        >
          ● POS activa
        </span>
      </div>

      {/* =============================== */}
      {/* 🔶 ORIGEN → DESTINO */}
      {/* =============================== */}
      <div
        className="flex items-center justify-center"
        style={{
          marginBottom: ui.helpers.spacing("lg"),
        }}
      >
        <span
          className="text-slate-100 font-semibold"
          style={{
            fontSize: ui.helpers.font("sm"),
          }}
        >
          {origen?.nombre || "-"}
        </span>

        <div
          className="flex items-center"
          style={{
            marginLeft: ui.helpers.spacing("md"),
            marginRight: ui.helpers.spacing("md"),
          }}
        >
          <div
            className="bg-amber-500/40 relative overflow-hidden rounded-full"
            style={{
              width: parseInt(ui.helpers.controlHeight()) * 1.25,
              height: parseInt(ui.helpers.spacing("xs")) * 0.5,
            }}
          >
            <div className="absolute inset-0 bg-amber-400 animate-[pulseLine_1.4s_linear_infinite]"></div>
          </div>

          <span
            className="text-amber-400"
            style={{
              marginLeft: ui.helpers.spacing("sm"),
              fontSize: ui.helpers.font("lg"),
            }}
          >
            →
          </span>
        </div>

        <span
          className="text-slate-100 font-semibold"
          style={{
            fontSize: ui.helpers.font("sm"),
          }}
        >
          {destino?.nombre || "-"}
        </span>
      </div>

      {/* =============================== */}
      {/* 🧊 TARJETAS RESUMEN */}
      {/* =============================== */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3"
        style={{
          gap: ui.helpers.spacing("md"),
        }}
      >
        {/* ORIGEN */}
        <div
          className="bg-slate-800 shadow-inner border border-slate-700"
          style={{
            borderRadius: ui.helpers.radius("xl"),
            paddingLeft: ui.helpers.spacing("lg"),
            paddingRight: ui.helpers.spacing("lg"),
            paddingTop: ui.helpers.spacing("md"),
            paddingBottom: ui.helpers.spacing("md"),
          }}
        >
          <span
            className="uppercase tracking-wide text-slate-400"
            style={{
              fontSize: ui.helpers.font("xs"),
            }}
          >
            Origen
          </span>
          <div
            className="flex items-center"
            style={{
              gap: ui.helpers.spacing("sm"),
              marginTop: ui.helpers.spacing("xs"),
            }}
          >
            <span
              className="text-amber-400"
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              🏬
            </span>
            <span
              className="text-slate-100 font-medium truncate"
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              {origen?.nombre || "-"}
            </span>
          </div>
        </div>

        {/* DESTINO */}
        <div
          className="bg-slate-800 shadow-inner border border-slate-700"
          style={{
            borderRadius: ui.helpers.radius("xl"),
            paddingLeft: ui.helpers.spacing("lg"),
            paddingRight: ui.helpers.spacing("lg"),
            paddingTop: ui.helpers.spacing("md"),
            paddingBottom: ui.helpers.spacing("md"),
          }}
        >
          <span
            className="uppercase tracking-wide text-slate-400"
            style={{
              fontSize: ui.helpers.font("xs"),
            }}
          >
            Destino
          </span>
          <div
            className="flex items-center"
            style={{
              gap: ui.helpers.spacing("sm"),
              marginTop: ui.helpers.spacing("xs"),
            }}
          >
            <span
              className="text-amber-400"
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              📦
            </span>
            <span
              className="text-slate-100 font-medium truncate"
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              {destino?.nombre || "-"}
            </span>
          </div>
        </div>

        {/* USUARIO */}
        <div
          className="bg-slate-800 shadow-inner border border-slate-700"
          style={{
            borderRadius: ui.helpers.radius("xl"),
            paddingLeft: ui.helpers.spacing("lg"),
            paddingRight: ui.helpers.spacing("lg"),
            paddingTop: ui.helpers.spacing("md"),
            paddingBottom: ui.helpers.spacing("md"),
          }}
        >
          <span
            className="uppercase tracking-wide text-slate-400"
            style={{
              fontSize: ui.helpers.font("xs"),
            }}
          >
            Usuario
          </span>
          <div
            className="flex items-center"
            style={{
              gap: ui.helpers.spacing("sm"),
              marginTop: ui.helpers.spacing("xs"),
            }}
          >
            <span
              className="text-amber-400"
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              👤
            </span>
            <span
              className="text-slate-100 font-medium truncate"
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              {me?.nombre || "Usuario"}
            </span>
          </div>
        </div>
      </div>

      {/* =============================== */}
      {/* ANIMACIONES */}
      {/* =============================== */}
      <style>{`
        @keyframes pulseLine {
          0% { transform: translateX(-100%); opacity: 0.3; }
          50% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
