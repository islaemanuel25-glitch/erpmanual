"use client";

// components/stock_diario/AtencionDelValor.jsx
//
// ATENCIÓN: lo que hace que el número no sea completo o exacto —stock negativo,
// productos sin costo, período recortado, una cuenta que no cierra—, uno por
// fila, con el enlace al módulo donde se resuelve cuando lo hay. Sin nada, no
// se dibuja: una caja vacía con borde de aviso sería una alarma falsa.

import { usePermisos } from "@/hooks/usePermisos";
import { avisosDeAtencion } from "@/lib/stock/libro/stockDiarioPantalla";

import EnlaceAlModulo from "./EnlaceAlModulo";

export default function AtencionDelValor({ respuesta }) {
  const { perfil } = usePermisos();
  const avisos = avisosDeAtencion(respuesta, perfil);
  if (avisos.length === 0) return null;
  return (
    <section className="rounded-xl sunmi-bg-card border-1.5 sunmi-border-warning overflow-hidden" data-atencion>
      <div className="px-4 py-2.5 text-sm3 font-bold sunmi-text-warning">Atención</div>
      {avisos.map((a) => (
        <div key={a.clave} className="px-4 py-2.5 border-t sunmi-divider flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm3 font-medium sunmi-text-strong">{a.titulo}</div>
            <div className="text-sm2 sunmi-text-muted">{a.explicacion}</div>
          </div>
          {a.enlace && <EnlaceAlModulo {...a.enlace} />}
        </div>
      ))}
    </section>
  );
}
