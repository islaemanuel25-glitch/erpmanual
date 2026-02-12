"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
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

      <SunmiSeparator label="Datos generales" />

      <SunmiCard className="grid gap-3 md:grid-cols-2 mx-1 text-sm">

        <div>
          <div className="font-semibold">Origen</div>
          <div>{item.origen.nombre}</div>
        </div>

        <div>
          <div className="font-semibold">Destino</div>
          <div>{item.destino.nombre}</div>
        </div>

        <div>
          <div className="font-semibold">Fechas</div>

          <div>
            Creada:{" "}
            {item.fechaCreada
              ? new Date(item.fechaCreada).toLocaleString()
              : "-"}
          </div>

          <div>
            Envío:{" "}
            {item.fechaEnvio
              ? new Date(item.fechaEnvio).toLocaleString()
              : "-"}
          </div>

          <div>
            Recepción:{" "}
            {item.fechaRecepcion
              ? new Date(item.fechaRecepcion).toLocaleString()
              : "-"}
          </div>
        </div>

        <div>
          <div className="font-semibold">Estado</div>
          <div className="inline-flex px-2 py-1 rounded bg-slate-800 text-slate-200">
            {item.estado}
          </div>
        </div>

      </SunmiCard>
    </div>
  );
}
