"use client";

import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

export default function TransferenciaHeader({ item, id }) {
  if (!item) return null;

  return (
    <div className="space-y-2">

      {/* BOTONES PDF */}
      <div className="flex gap-2 px-2 py-2">
        <a
          href={`/api/transferencias/pdf?id=${id}`}
          target="_blank"
          className="px-3 py-1 bg-amber-400 text-slate-900 rounded text-sm font-semibold shadow"
        >
          📄 PDF Envío
        </a>

        <a
          href={`/api/transferencias/pdf-recepcion?id=${id}`}
          target="_blank"
          className="px-3 py-1 bg-cyan-400 text-slate-900 rounded text-sm font-semibold shadow"
        >
          📄 PDF Recepción
        </a>
      </div>

      <SunmiSeparator label="Datos generales" color="amber" />

      <div className="border border-slate-700 rounded-2xl p-3 grid gap-3 md:grid-cols-2 bg-slate-900/50 mx-1 text-sm">
        
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
          <div className="inline-flex px-2 py-1 rounded border border-slate-600 bg-slate-900/70 text-slate-100">
            {item.estado}
          </div>
        </div>

      </div>
    </div>
  );
}
