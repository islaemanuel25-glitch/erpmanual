"use client";

import Link from "next/link";
import SunmiButton from "@/components/sunmi/SunmiButton";
import MiniInfo from "./MiniInfo";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function FilaTransferencia({
  t,
  columns,
  filaAbierta,
  setFilaAbierta,
  formatDate,
}) {
  const { ui } = useUIConfig();
  
  const toggleFila = () => {
    setFilaAbierta(filaAbierta === t.id ? null : t.id);
  };

  return (
    <>
      <tr
        className="border-t cursor-pointer"
        style={{
          borderTopColor: "var(--sunmi-card-border)",
          borderTopWidth: "1px",
          backgroundColor: "transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        onClick={toggleFila}
      >
        {columns.id && <td>{t.id}</td>}

        {columns.origen && (
          <td>
            {t.origenNombre}
            {t.origenEsDeposito && (
              <span
                style={{
                  color: "#fcd34d", // amber-300
                }}
                style={{
                  fontSize: ui.helpers.font("xs"),
                  marginLeft: ui.helpers.spacing("xs"),
                }}
              >
                (Depósito)
              </span>
            )}
          </td>
        )}

        {columns.destino && <td>{t.destinoNombre}</td>}

        {columns.estado && (
          <td>
            <span
              className="inline-flex border rounded-full"
              style={{
                backgroundColor: "var(--sunmi-table-row-bg)",
                borderColor: "var(--sunmi-card-border)",
                borderWidth: "1px",
                color: "var(--sunmi-text)",
              }}
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: parseInt(ui.helpers.spacing("xs")) * 0.5,
                paddingBottom: parseInt(ui.helpers.spacing("xs")) * 0.5,
                fontSize: ui.helpers.font("xs"),
              }}
            >
              {t.estado}
            </span>
          </td>
        )}

        {columns.recepcion && (
          <td>
            {t.estado !== "Recibida" ? (
              <span
                style={{
                  color: "var(--sunmi-text)",
                  opacity: 0.6,
                }}
                style={{
                  fontSize: ui.helpers.font("xs"),
                }}
              >
                -
              </span>
            ) : t.tieneDiferencias ? (
              <span
                className="inline-flex border rounded-full"
                style={{
                  backgroundColor: "rgba(127,29,29,0.4)", // red-900/40
                  borderColor: "#dc2626", // red-600
                  borderWidth: "1px",
                  color: "#fca5a5", // red-300
                }}
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: parseInt(ui.helpers.spacing("xs")) * 0.5,
                  paddingBottom: parseInt(ui.helpers.spacing("xs")) * 0.5,
                  fontSize: ui.helpers.font("xs"),
                }}
              >
                Con diferencias
              </span>
            ) : (
              <span
                className="inline-flex border rounded-full"
                style={{
                  backgroundColor: "rgba(6,78,59,0.4)", // emerald-900/40
                  borderColor: "#059669", // emerald-600
                  borderWidth: "1px",
                  color: "#6ee7b7", // emerald-300
                }}
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: parseInt(ui.helpers.spacing("xs")) * 0.5,
                  paddingBottom: parseInt(ui.helpers.spacing("xs")) * 0.5,
                  fontSize: ui.helpers.font("xs"),
                }}
              >
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
