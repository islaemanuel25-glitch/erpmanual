"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function Encabezado({ origen, destino, me }) {
  const { ui } = useUIConfig();

  return (
    <div
      className="border shadow-md"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
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
            className="flex items-center justify-center font-black"
            style={{
              backgroundColor: "#fbbf24", // amber-400
              color: "#0f172a", // slate-900
              boxShadow: "0 0 10px rgba(250,204,21,0.6)",
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
              className="uppercase tracking-wide"
              style={{
                color: "var(--sunmi-text)",
                opacity: 0.7,
              }}
              style={{
                fontSize: ui.helpers.font("xs"),
              }}
            >
              Sesión de preparación
            </div>
            <div
              className="font-semibold"
              style={{
                color: "var(--sunmi-text)",
              }}
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
          className="font-semibold rounded-full border"
          style={{
            backgroundColor: "rgba(16,185,129,0.2)", // emerald-500/20
            color: "#6ee7b7", // emerald-300
            borderColor: "rgba(52,211,153,0.4)", // emerald-400/40
            borderWidth: "1px",
          }}
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
          className="font-semibold"
          style={{
            color: "var(--sunmi-text)",
          }}
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
            className="relative overflow-hidden rounded-full"
            style={{
              backgroundColor: "rgba(245,158,11,0.4)", // amber-500/40
            }}
            style={{
              width: parseInt(ui.helpers.controlHeight()) * 1.25,
              height: parseInt(ui.helpers.spacing("xs")) * 0.5,
            }}
          >
            <div
              className="absolute inset-0 animate-[pulseLine_1.4s_linear_infinite]"
              style={{
                backgroundColor: "#fbbf24", // amber-400
              }}
            ></div>
          </div>

          <span
            style={{
              color: "#fbbf24", // amber-400
            }}
            style={{
              marginLeft: ui.helpers.spacing("sm"),
              fontSize: ui.helpers.font("lg"),
            }}
          >
            →
          </span>
        </div>

        <span
          className="font-semibold"
          style={{
            color: "var(--sunmi-text)",
          }}
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
          className="shadow-inner border"
          style={{
            backgroundColor: "var(--sunmi-table-row-bg)",
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
          }}
          style={{
            borderRadius: ui.helpers.radius("xl"),
            paddingLeft: ui.helpers.spacing("lg"),
            paddingRight: ui.helpers.spacing("lg"),
            paddingTop: ui.helpers.spacing("md"),
            paddingBottom: ui.helpers.spacing("md"),
          }}
        >
          <span
            className="uppercase tracking-wide"
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.7,
            }}
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
              style={{
              color: "#fbbf24", // amber-400
            }}
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              🏬
            </span>
            <span
              className="font-medium truncate"
              style={{
                color: "var(--sunmi-text)",
              }}
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
          className="shadow-inner border"
          style={{
            backgroundColor: "var(--sunmi-table-row-bg)",
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
          }}
          style={{
            borderRadius: ui.helpers.radius("xl"),
            paddingLeft: ui.helpers.spacing("lg"),
            paddingRight: ui.helpers.spacing("lg"),
            paddingTop: ui.helpers.spacing("md"),
            paddingBottom: ui.helpers.spacing("md"),
          }}
        >
          <span
            className="uppercase tracking-wide"
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.7,
            }}
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
              style={{
              color: "#fbbf24", // amber-400
            }}
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              📦
            </span>
            <span
              className="font-medium truncate"
              style={{
                color: "var(--sunmi-text)",
              }}
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
          className="shadow-inner border"
          style={{
            backgroundColor: "var(--sunmi-table-row-bg)",
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
          }}
          style={{
            borderRadius: ui.helpers.radius("xl"),
            paddingLeft: ui.helpers.spacing("lg"),
            paddingRight: ui.helpers.spacing("lg"),
            paddingTop: ui.helpers.spacing("md"),
            paddingBottom: ui.helpers.spacing("md"),
          }}
        >
          <span
            className="uppercase tracking-wide"
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.7,
            }}
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
              style={{
              color: "#fbbf24", // amber-400
            }}
              style={{
                fontSize: ui.helpers.font("sm"),
              }}
            >
              👤
            </span>
            <span
              className="font-medium truncate"
              style={{
                color: "var(--sunmi-text)",
              }}
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
