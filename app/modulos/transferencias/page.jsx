// app/modulos/transferencias/page.jsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

import ColumnSettingsModal from "@/components/transferencias/ColumnSettingsModal";
import TablaTransferencias from "@/components/transferencias/TablaTransferencias";

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
  const { perfil: perfilTr, cargando: cargandoTr } = useUser();

  // 🔥 FECHAS INICIALIZADAS SIN FLASH
  const hoy = new Date().toISOString().split("T")[0];

  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState("");
  const [localId, setLocalId] = useState("");
  const [locales, setLocales] = useState([]);

  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCostoGlobal, setTotalCostoGlobal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  // 🔥 SE ELIMINÓ EL USEEFFECT QUE PROVOCABA EL FLASH
  // (ya no es necesario porque las fechas están inicializadas correctamente)

  // ==============================
  // PERSISTENCIA DE COLUMNAS
  // ==============================
  useEffect(() => {
    localStorage.setItem("transferencias-columns", JSON.stringify(columns));
  }, [columns]);

  // ==============================
  // CARGA DE LOCALES
  // ==============================
  const fetchLocales = async () => {
    const res = await fetch("/api/locales/listar");
    const json = await res.json();
    if (json.ok) setLocales(json.items || []);
  };

  // ==============================
  // CARGA DE TRANSFERENCIAS
  // ==============================
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

  if (cargandoTr) return null;
  const permisosTr = perfilTr?.permisos || [];
  const esAdminTr = Array.isArray(permisosTr) && permisosTr.includes("*");
  if (!esAdminTr && !permisosTr.includes("transferencias.crear")) return <SinPermisos />;

  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto">
      
      <SunmiCard>
        <SunmiHeader title="Transferencias">
          <div className="text-xs sm:text-sm sunmi-text-strong">
            Historial de transferencias entre Depósito y Locales
          </div>
        </SunmiHeader>

        {/* ======================
            FILTROS
        ======================= */}
        <SunmiSeparator label="Filtros" />

        <div className="grid sm:grid-cols-3 gap-3 px-2 pb-2">

          {/* ESTADO */}
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Estado</label>
            <SunmiSelectAdv
              value={estado}
              onChange={(val) => { setEstado(val); setPage(1); }}
            >
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </SunmiSelectAdv>
          </div>

          {/* LOCAL */}
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Local</label>
            <SunmiSelectAdv
              value={localId}
              onChange={(val) => { setLocalId(val); setPage(1); }}
            >
              <option value="">Todos</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre} {l.esDeposito ? "(Depósito)" : ""}
                </option>
              ))}
            </SunmiSelectAdv>
          </div>

          {/* DESDE */}
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Desde</label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }}
            />
          </div>

          {/* HASTA */}
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Hasta</label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }}
            />
          </div>

          <div className="flex items-end">
            <SunmiButton color="slate" onClick={quitarFiltros}>
              Quitar filtros
            </SunmiButton>
          </div>

        </div>

        {/* ======================
            LISTADO + BOTÓN DE COLUMNAS
        ======================= */}
        <div className="flex items-center justify-between px-2">
          <SunmiSeparator label="Listado" />

          <SunmiButton
            color="slate"
            onClick={() => setOpenCols(true)}
          >
            ⚙️ Columnas
          </SunmiButton>
        </div>

        {/* ======================
            TABLA REAL (componente)
        ======================= */}
        <TablaTransferencias
          items={items}
          columns={columns}
          filaAbierta={filaAbierta}
          setFilaAbierta={setFilaAbierta}
        />

        {/* ======================
            TOTAL GLOBAL
        ======================= */}
        <SunmiCard className="mx-1 mt-3">
          <div className="sunmi-text-muted text-sm px-3 py-2 flex justify-between">
            <span className="font-semibold">Importe total transferido:</span>
            <span className="sunmi-text-accent font-bold">
              ${Number(totalCostoGlobal).toFixed(2)}
            </span>
          </div>
        </SunmiCard>

        {/* ======================
            PAGINACIÓN
        ======================= */}
        <div className="flex justify-between items-center px-2 pb-2 text-xs sm:text-sm sunmi-text-strong">
          
          <div>Página {page} de {totalPages}</div>

          <div className="flex items-center gap-2">
            <SunmiButton color="slate" onClick={prev} disabled={page <= 1}>
              Anterior
            </SunmiButton>

            <SunmiButton color="slate" onClick={next} disabled={page >= totalPages}>
              Siguiente
            </SunmiButton>
          </div>

        </div>

      </SunmiCard>

      {/* ======================
          MODAL DE COLUMNAS
      ======================= */}
      <ColumnSettingsModal
        open={openCols}
        onClose={() => setOpenCols(false)}
        columns={columns}
        setColumns={setColumns}
      />

    </div>
  );
}
