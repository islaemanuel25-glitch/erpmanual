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
          className="bg-amber-400 text-slate-900 font-semibold shadow"
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
          className="bg-cyan-400 text-slate-900 font-semibold shadow"
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
        className="border border-slate-700 grid md:grid-cols-2 bg-slate-900/50"
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
          <div className="font-semibold text-slate-100">Origen</div>
          <div className="text-slate-100">{item.origen.nombre}</div>
        </div>

        <div>
          <div className="font-semibold text-slate-100">Destino</div>
          <div className="text-slate-100">{item.destino.nombre}</div>
        </div>

        <div>
          <div className="font-semibold text-slate-100">Fechas</div>

          <div className="text-slate-100">
            Creada:{" "}
            {item.fechaCreada
              ? new Date(item.fechaCreada).toLocaleString()
              : "-"}
          </div>

          <div className="text-slate-100">
            Envío:{" "}
            {item.fechaEnvio
              ? new Date(item.fechaEnvio).toLocaleString()
              : "-"}
          </div>

          <div className="text-slate-100">
            Recepción:{" "}
            {item.fechaRecepcion
              ? new Date(item.fechaRecepcion).toLocaleString()
              : "-"}
          </div>
        </div>

        <div>
          <div className="font-semibold text-slate-100">Estado</div>
          <div
            className="inline-flex border border-slate-600 bg-slate-900/70 text-slate-100"
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
