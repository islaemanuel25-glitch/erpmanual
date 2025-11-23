// app/modulos/transferencias/page.jsx
"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";

import ColumnSettingsModal from "@/components/transferencias/ColumnSettingsModal";
import MiniInfo from "@/components/transferencias/MiniInfo";

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "Enviada", label: "Enviada" },
  { value: "Recibiendo", label: "Recibiendo" },
  { value: "Recibida", label: "Recibida" },
  { value: "Cancelada", label: "Cancelada" },
];

const COLUMN_DEFAULTS = {
  id: true,
  origen: true,
  destino: true,
  estado: true,
  recepcion: true,
  items: true,
  importe: true,
  fechaEnvio: false,
  fechaRecepcion: false,
  acciones: true,
};

export default function TransferenciasPage() {
  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState("");
  const [localId, setLocalId] = useState("");
  const [locales, setLocales] = useState([]);

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCostoGlobal, setTotalCostoGlobal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ==== columnas persistentes ====
  const [columns, setColumns] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("transferencias-columns");
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return COLUMN_DEFAULTS;
  });

  const [openCols, setOpenCols] = useState(false);
  const [filaAbierta, setFilaAbierta] = useState(null);

  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);

  useEffect(() => {
    localStorage.setItem("transferencias-columns", JSON.stringify(columns));
  }, [columns]);

  const fetchLocales = async () => {
    const res = await fetch("/api/locales/listar");
    const json = await res.json();
    if (json.ok) setLocales(json.items || []);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      const url = new URL("/api/transferencias/listar", window.location.origin);

      url.searchParams.set("page", String(page));
      if (estado) url.searchParams.set("estado", estado);
      if (localId) url.searchParams.set("localId", localId);
      if (fechaDesde) url.searchParams.set("fechaDesde", fechaDesde);
      if (fechaHasta) url.searchParams.set("fechaHasta", fechaHasta);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error || "Error al cargar transferencias");
        setItems([]);
        setTotalPages(1);
        setTotalCostoGlobal(0);
        return;
      }

      setItems(json.items || []);
      setTotalPages(json.totalPages || 1);
      setTotalCostoGlobal(json.totalCostoGlobal || 0);

    } catch {
      setError("Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLocales(); }, []);
  useEffect(() => { fetchData(); }, [page, estado, localId, fechaDesde, fechaHasta]);

  const quitarFiltros = () => {
    const hoy = new Date().toISOString().split("T")[0];
    setEstado("");
    setLocalId("");
    setFechaDesde(hoy);
    setFechaHasta(hoy);
    setPage(1);
  };

  const prev = () => setPage((p) => Math.max(1, p - 1));
  const next = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto">
      <SunmiCard>
        <SunmiHeader title="Transferencias" color="amber">
          <div className="text-xs sm:text-sm text-slate-200">
            Historial de transferencias entre Depósito y Locales
          </div>
        </SunmiHeader>

        {/* FILTROS */}
        <SunmiSeparator label="Filtros" color="amber" />

        <div className="grid sm:grid-cols-3 gap-3 px-2 pb-2">
          <div>
            <label className="text-slate-100 text-xs mb-1 block">Estado</label>
            <select
              value={estado}
              onChange={(e) => { setEstado(e.target.value); setPage(1); }}
              className="px-2 py-1 w-full rounded bg-slate-900/60 border border-slate-600 text-slate-100 text-sm"
            >
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-100 text-xs mb-1 block">Local</label>
            <select
              value={localId}
              onChange={(e) => { setLocalId(e.target.value); setPage(1); }}
              className="px-2 py-1 w-full rounded bg-slate-900/60 border border-slate-600 text-slate-100 text-sm"
            >
              <option value="">Todos</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre} {l.esDeposito ? "(Depósito)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-100 text-xs mb-1 block">Desde</label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }}
            />
          </div>

          <div>
            <label className="text-slate-100 text-xs mb-1 block">Hasta</label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }}
            />
          </div>

          <div className="flex items-end">
            <SunmiButton size="sm" variant="outline" onClick={quitarFiltros}>
              Quitar filtros
            </SunmiButton>
          </div>
        </div>

        {/* LISTADO + botón arriba a la derecha */}
        <div className="flex items-center justify-between px-2">
          <SunmiSeparator label="Listado" color="amber" />
          <SunmiButton
            size="xs"
            variant="outline"
            onClick={() => setOpenCols(true)}
          >
            ⚙️ Columnas
          </SunmiButton>
        </div>

        <div className="w-full overflow-x-auto rounded-xl border border-slate-700 mx-1 mb-2">
          <SunmiTable className="min-w-[1000px]">
            <thead>
              <tr>
                {columns.id && <th>ID</th>}
                {columns.origen && <th>Origen</th>}
                {columns.destino && <th>Destino</th>}
                {columns.estado && <th>Estado</th>}
                {columns.recepcion && <th>Recepción</th>}
                {columns.items && <th>Ítems</th>}
                {columns.importe && <th>Importe</th>}
                {columns.fechaEnvio && <th>Fecha envío</th>}
                {columns.fechaRecepcion && <th>Fecha recepción</th>}
                {columns.acciones && <th></th>}
              </tr>
            </thead>

            <tbody>
  {items.map((t) => (
    <React.Fragment key={`row-${t.id}`}>
      <tr
        className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40"
        onClick={() =>
          setFilaAbierta(filaAbierta === t.id ? null : t.id)
        }
      >
        {columns.id && <td>{t.id}</td>}

        {columns.origen && (
          <td>
            {t.origenNombre}
            {t.origenEsDeposito && (
              <span className="text-amber-300 text-[10px] ml-1">
                (Depósito)
              </span>
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

        {columns.items && (
          <td className="text-right">{t.cantidadItems}</td>
        )}

        {columns.importe && (
          <td className="text-right">
            ${Number(t.totalCosto || 0).toFixed(2)}
          </td>
        )}

        {columns.fechaEnvio && (
          <td>
            {t.fechaEnvio
              ? new Date(t.fechaEnvio).toLocaleDateString()
              : "-"}
          </td>
        )}

        {columns.fechaRecepcion && (
          <td>
            {t.fechaRecepcion
              ? new Date(t.fechaRecepcion).toLocaleDateString()
              : "-"}
          </td>
        )}
        {columns.acciones && (
          <td>
            <Link
  href={`/modulos/transferencias/${t.id}`}
  onClick={(e) => e.stopPropagation()}   // ← AGREGAR ESTO
>
  <SunmiButton size="xs">Ver</SunmiButton>
</Link>
          </td>
        )}
      </tr>

      {filaAbierta === t.id && (
        <tr key={`info-${t.id}`} className="animate-fade">
          <td colSpan="20">
            <MiniInfo t={t} />
          </td>
        </tr>
      )}
    </React.Fragment>
  ))}
</tbody>
         </SunmiTable>
        </div>

        {/* TOTAL */}
        <SunmiCard className="mx-1 mt-3 bg-slate-950/60 border border-slate-700">
          <div className="text-slate-300 text-sm px-3 py-2 flex justify-between">
            <span className="font-semibold">Importe total transferido:</span>
            <span className="text-amber-300 font-bold">
              ${Number(totalCostoGlobal).toFixed(2)}
            </span>
          </div>
        </SunmiCard>

        {/* PAGINACIÓN */}
        <div className="flex justify-between items-center px-2 pb-2 text-xs sm:text-sm text-slate-200">
          <div>Página {page} de {totalPages}</div>

          <div className="flex items-center gap-2">
            <SunmiButton size="xs" variant="outline" onClick={prev} disabled={page <= 1}>
              Anterior
            </SunmiButton>
            <SunmiButton size="xs" variant="outline" onClick={next} disabled={page >= totalPages}>
              Siguiente
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>

      <ColumnSettingsModal
        open={openCols}
        onClose={() => setOpenCols(false)}
        columns={columns}
        setColumns={setColumns}
      />
    </div>
  );
}
