"use client";

import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function TransferenciaHeader({ item, id }) {
  const { ui } = useUIConfig();
  
  if (!item) return null;

  return (
    <div
      className="flex flex-col"
      style={{
        gap: ui.helpers.spacing("sm"),
      }}
    >
      {/* BOTONES PDF */}
      <div
        className="flex"
        style={{
          gap: ui.helpers.spacing("sm"),
          paddingLeft: ui.helpers.spacing("sm"),
          paddingRight: ui.helpers.spacing("sm"),
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
        }}
      >
        <a
          href={`/api/transferencias/pdf?id=${id}`}
          target="_blank"
          className="font-semibold shadow"
          style={{
            backgroundColor: "#fbbf24", // amber-400
            color: "#0f172a", // slate-900
          }}
          style={{
            paddingLeft: ui.helpers.spacing("md"),
            paddingRight: ui.helpers.spacing("md"),
            paddingTop: ui.helpers.spacing("xs"),
            paddingBottom: ui.helpers.spacing("xs"),
            borderRadius: ui.helpers.radius("md"),
            fontSize: ui.helpers.font("sm"),
          }}
        >
          📄 PDF Envío
        </a>

        <a
          href={`/api/transferencias/pdf-recepcion?id=${id}`}
          target="_blank"
          className="font-semibold shadow"
          style={{
            backgroundColor: "#22d3ee", // cyan-400
            color: "#0f172a", // slate-900
          }}
          style={{
            paddingLeft: ui.helpers.spacing("md"),
            paddingRight: ui.helpers.spacing("md"),
            paddingTop: ui.helpers.spacing("xs"),
            paddingBottom: ui.helpers.spacing("xs"),
            borderRadius: ui.helpers.radius("md"),
            fontSize: ui.helpers.font("sm"),
          }}
        >
          📄 PDF Recepción
        </a>
      </div>

      <SunmiSeparator label="Datos generales" color="amber" />

      <div
        className="border grid md:grid-cols-2"
        style={{
          backgroundColor: "var(--sunmi-card-bg)",
          opacity: 0.8,
          borderColor: "var(--sunmi-card-border)",
          borderWidth: "1px",
        }}
        style={{
          borderRadius: ui.helpers.radius("xl"),
          padding: ui.helpers.spacing("md"),
          gap: ui.helpers.spacing("md"),
          marginLeft: ui.helpers.spacing("xs"),
          marginRight: ui.helpers.spacing("xs"),
          fontSize: ui.helpers.font("sm"),
        }}
      >
        <div>
          <div
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Origen
          </div>
          <div style={{ color: "var(--sunmi-text)" }}>{item.origen.nombre}</div>
        </div>

        <div>
          <div
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Destino
          </div>
          <div style={{ color: "var(--sunmi-text)" }}>{item.destino.nombre}</div>
        </div>

        <div>
          <div
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Fechas
          </div>

          <div style={{ color: "var(--sunmi-text)" }}>
            Creada:{" "}
            {item.fechaCreada
              ? new Date(item.fechaCreada).toLocaleString()
              : "-"}
          </div>

          <div style={{ color: "var(--sunmi-text)" }}>
            Envío:{" "}
            {item.fechaEnvio
              ? new Date(item.fechaEnvio).toLocaleString()
              : "-"}
          </div>

          <div style={{ color: "var(--sunmi-text)" }}>
            Recepción:{" "}
            {item.fechaRecepcion
              ? new Date(item.fechaRecepcion).toLocaleString()
              : "-"}
          </div>
        </div>

        <div>
          <div
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Estado
          </div>
          <div
            className="inline-flex border"
            style={{
              backgroundColor: "var(--sunmi-card-bg)",
              opacity: 0.7,
              borderColor: "var(--sunmi-card-border)",
              borderWidth: "1px",
              color: "var(--sunmi-text)",
            }}
            style={{
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
              paddingTop: ui.helpers.spacing("xs"),
              paddingBottom: ui.helpers.spacing("xs"),
              borderRadius: ui.helpers.radius("md"),
            }}
          >
            {item.estado}
          </div>
        </div>

      </div>
    </div>
  );
}
