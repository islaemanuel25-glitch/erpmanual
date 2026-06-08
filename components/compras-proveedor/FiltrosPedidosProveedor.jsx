"use client";

import { useEffect, useState } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { hoyLocalISO } from "@/components/compras-proveedor/usePedidosProveedor";

/**
 * Filtros compartidos de pedidos a proveedor.
 * Presentacional + carga propia del catálogo de proveedores.
 *
 * Props:
 *  - estadoFijoLabel: string|null  → si viene, muestra estado fijo (recepción) en vez de selector
 *  - estadoOpciones: string[]      → opciones del selector de estado
 *  - estadoTodosLabel: string      → etiqueta de la opción "todos"
 *  - estado, onEstado
 *  - proveedorId, onProveedor
 *  - fechaDesde, onFechaDesde, fechaHasta, onFechaHasta
 *  - onLimpiar
 */
export default function FiltrosPedidosProveedor({
  estadoFijoLabel = null,
  estadoOpciones = [],
  estadoTodosLabel = "Todos",
  estado = "",
  onEstado,
  mostrarEstado = true,
  separadorLabel = "Filtros",
  proveedorId = "",
  onProveedor,
  fechaDesde = "",
  onFechaDesde,
  fechaHasta = "",
  onFechaHasta,
  onLimpiar,
}) {
  const [proveedores, setProveedores] = useState([]);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(
          "/api/proveedores/listar?estado=activos&pageSize=200",
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) setProveedores(data.items);
      } catch {
        // Silenciar: el selector queda solo con "Todos los proveedores".
      }
    };
    cargar();
  }, []);

  return (
    <>
      {separadorLabel && <SunmiSeparator label={separadorLabel} className="my-4" />}

      <div className="flex flex-col md:flex-row md:flex-wrap gap-3 px-2 mb-4 items-end">
        {/* Estado */}
        {mostrarEstado && (estadoFijoLabel ? (
          <div className="w-full md:w-48">
            <label className="block text-[11px] sunmi-text-muted mb-1">Estado</label>
            <div className="px-3 py-1.5 rounded-md sunmi-surface ring-1 ring-inset sunmi-ring text-[13px] sunmi-text-muted">
              {estadoFijoLabel}
            </div>
          </div>
        ) : (
          <div className="w-full md:w-48">
            <label className="block text-[11px] sunmi-text-muted mb-1">Estado</label>
            <SunmiSelectAdv
              value={estado}
              onChange={onEstado}
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <SunmiSelectOption value="">{estadoTodosLabel}</SunmiSelectOption>
              {estadoOpciones.map((e) => (
                <SunmiSelectOption key={e} value={e}>
                  {e === "BORRADOR" ? "EN CURSO (Borrador)" : e}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </div>
        ))}

        {/* Proveedor */}
        <div className="w-full md:w-56">
          <label className="block text-[11px] sunmi-text-muted mb-1">Proveedor</label>
          <SunmiSelectAdv
            value={proveedorId ? String(proveedorId) : ""}
            onChange={(v) => onProveedor?.(v)}
            searchable
            placeholder="Todos los proveedores"
            className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
          >
            <SunmiSelectOption value="">Todos los proveedores</SunmiSelectOption>
            {proveedores.map((p) => (
              <SunmiSelectOption key={p.id} value={String(p.id)}>
                {p.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        {/* Fechas */}
        <div>
          <label className="block text-[11px] sunmi-text-muted mb-1">Desde</label>
          <SunmiInput
            type="date"
            value={fechaDesde}
            onChange={(e) => onFechaDesde?.(e.target.value)}
            className="!border !border-[var(--pos-link)]"
          />
        </div>

        <div>
          <label className="block text-[11px] sunmi-text-muted mb-1">Hasta</label>
          <SunmiInput
            type="date"
            value={fechaHasta}
            onChange={(e) => onFechaHasta?.(e.target.value)}
            className="!border !border-[var(--pos-link)]"
          />
        </div>

        <SunmiButton
          color="cyan"
          onClick={() => {
            const hoy = hoyLocalISO();
            onFechaDesde?.(hoy);
            onFechaHasta?.(hoy);
          }}
        >
          Hoy
        </SunmiButton>

        <SunmiButton
          color="slate"
          className="!border !border-[var(--pos-link)]"
          onClick={() => {
            onFechaDesde?.("");
            onFechaHasta?.("");
          }}
        >
          Ver todo
        </SunmiButton>

        <SunmiButton
          color="slate"
          className="!border !border-[var(--pos-link)]"
          onClick={() => onLimpiar?.()}
        >
          Limpiar
        </SunmiButton>
      </div>
    </>
  );
}
