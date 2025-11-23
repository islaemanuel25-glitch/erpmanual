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
        className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40"
        onClick={toggleFila}
      >
        {columns.id && <td>{t.id}</td>}

        {columns.origen && (
          <td>
            {t.origenNombre}
            {t.origenEsDeposito && (
              <span className="text-amber-300 text-[10px] ml-1">(Depósito)</span>
            )}
          </td>
        )}

        {columns.destino && <td>{t.destinoNombre}</td>}

        {columns.estado && (
          <td>
            <span className="inline-flex px-2 py-[2px] text-[11px] bg-slate-800 border border-slate-600 rounded-full text-slate-100">
              {t.estado}
            </span>
          </td>
        )}

        {columns.recepcion && (
          <td>
            {t.estado !== "Recibida" ? (
              <span className="text-slate-500 text-[11px]">-</span>
            ) : t.tieneDiferencias ? (
              <span className="inline-flex px-2 py-[2px] text-[11px] bg-red-900/40 border border-red-600 text-red-300 rounded-full">
                Con diferencias
              </span>
            ) : (
              <span className="inline-flex px-2 py-[2px] text-[11px] bg-emerald-900/40 border border-emerald-600 text-emerald-300 rounded-full">
                Correcta
              </span>
            )}
          </td>
        )}

        {columns.items && <td className="text-right">{t.cantidadItems}</td>}

        {columns.importe && (
          <td className="text-right">
            ${Number(t.totalCosto || 0).toFixed(2)}
          </td>
        )}

        {columns.fechaEnvio && <td>{formatDate(t.fechaEnvio)}</td>}

        {columns.fechaRecepcion && <td>{formatDate(t.fechaRecepcion)}</td>}

        {columns.acciones && (
          <td>
            <Link
              href={`/modulos/transferencias/${t.id}`}
              onClick={(e) => e.stopPropagation()} // evita abrir/cerrar fila
            >
              <SunmiButton size="xs">Ver</SunmiButton>
            </Link>
          </td>
        )}
      </tr>

      {filaAbierta === t.id && (
        <tr className="animate-fade">
          <td colSpan="20">
            <MiniInfo t={t} />
          </td>
        </tr>
      )}
    </>
  );
}
