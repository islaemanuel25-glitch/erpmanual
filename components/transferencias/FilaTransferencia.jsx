"use client";

import Link from "next/link";
import SunmiButton from "@/components/sunmi/SunmiButton";
import MiniInfo from "./MiniInfo";

export default function FilaTransferencia({
  t,
  columns,
  filaAbierta,
  setFilaAbierta,
  formatDate,
}) {
  const toggleFila = () => {
    setFilaAbierta(filaAbierta === t.id ? null : t.id);
  };

  return (
    <>
      <tr
        className="border-t border-[var(--border)] cursor-pointer sunmi-row-hover transition"
        onClick={toggleFila}
      >
        {columns.id && <td className="px-2 py-1.5">{t.id}</td>}

        {columns.origen && (
          <td className="px-2 py-1.5">
            {t.origenNombre}
            {t.origenEsDeposito && (
              <span className="sunmi-text-accent text-[10px] ml-1">(Dep.)</span>
            )}
          </td>
        )}

        {columns.destino && <td className="px-2 py-1.5">{t.destinoNombre}</td>}

        {columns.estado && (
          <td className="px-2 py-1.5">
            <span className={`${t.estado === "Cancelada" ? "sunmi-badge-danger" : t.estado === "Recibida" ? "sunmi-badge-success" : "sunmi-badge-muted"} text-[11px] px-2 py-0.5 rounded-full font-medium`}>
              {t.estado}
            </span>
          </td>
        )}

        {columns.recepcion && (
          <td className="px-2 py-1.5">
            {t.estado !== "Recibida" ? (
              <span className="text-[11px] sunmi-text-muted">-</span>
            ) : t.tieneDiferencias ? (
              <span className="sunmi-badge-danger text-[11px] px-2 py-0.5 rounded-full font-medium">
                Con diferencias
              </span>
            ) : (
              <span className="sunmi-badge-success text-[11px] px-2 py-0.5 rounded-full font-medium">
                Correcta
              </span>
            )}
          </td>
        )}

        {columns.items && <td className="px-2 py-1.5 text-right">{t.cantidadItems}</td>}

        {columns.importe && (
          <td className="px-2 py-1.5 text-right tabular-nums">
            ${Number(t.totalCosto || 0).toFixed(2)}
          </td>
        )}

        {columns.fechaEnvio && <td className="px-2 py-1.5">{formatDate(t.fechaEnvio)}</td>}

        {columns.fechaRecepcion && <td className="px-2 py-1.5">{formatDate(t.fechaRecepcion)}</td>}

        {columns.acciones && (
          <td className="px-2 py-1.5">
            <Link
              href={`/modulos/transferencias/${t.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <SunmiButton color="cyan">Ver</SunmiButton>
            </Link>
          </td>
        )}
      </tr>

      {filaAbierta === t.id && (
        <tr>
          <td colSpan="20">
            <MiniInfo t={t} />
          </td>
        </tr>
      )}
    </>
  );
}
