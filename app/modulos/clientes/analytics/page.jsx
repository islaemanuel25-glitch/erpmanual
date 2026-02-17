"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import useLocalSelector from "@/hooks/useLocalSelector";
import PantallaSeleccionLocal from "@/components/local/PantallaSeleccionLocal";
import SelectorLocalCompacto from "@/components/local/SelectorLocalCompacto";

// Helpers
function formatFecha(str) {
  if (!str) return "-";
  try {
    return new Date(str).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return str;
  }
}

function formatPrecio(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toDateStr(date) {
  return date.toISOString().split("T")[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

export default function AnalyticsClientesPage() {
  const router = useRouter();
  const {
    perfil,
    locales,
    localSeleccionado,
    localNombre,
    esAdminSinLocal,
    cargandoLocales,
    handleCambiarLocal,
  } = useLocalSelector();

  const localIdFinal = localSeleccionado || null;

  // Filtros globales
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toDateStr(new Date()));
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [tagId, setTagId] = useState("");
  const [tags, setTags] = useState([]);

  // Ranking
  const [rankMetric, setRankMetric] = useState("facturacion");
  const [rankTake, setRankTake] = useState(10);
  const [rankItems, setRankItems] = useState([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState("");

  // Inactivos
  const [inactDias, setInactDias] = useState(60);
  const [inactModo, setInactModo] = useState("conCompras");
  const [inactTake, setInactTake] = useState(50);
  const [inactItems, setInactItems] = useState([]);
  const [inactLoading, setInactLoading] = useState(false);
  const [inactError, setInactError] = useState("");

  const rankAbort = useRef(null);
  const inactAbort = useRef(null);
  const debounceTimer = useRef(null);

  // Debounce q
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setQDebounced(q.trim()), 400);
    return () => clearTimeout(debounceTimer.current);
  }, [q]);

  // Cargar tags
  useEffect(() => {
    if (!localIdFinal) return;
    (async () => {
      try {
        const res = await fetch(`/api/clientes/tags?localId=${localIdFinal}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) setTags(data.items || []);
      } catch {
        // silent
      }
    })();
  }, [localIdFinal]);

  // Fetch ranking
  const fetchRanking = useCallback(async () => {
    if (!localIdFinal) return;
    if (rankAbort.current) rankAbort.current.abort();
    const ctrl = new AbortController();
    rankAbort.current = ctrl;

    setRankLoading(true);
    setRankError("");

    try {
      const params = new URLSearchParams({
        localId: String(localIdFinal),
        from,
        to,
        metric: rankMetric,
        take: String(rankTake),
      });
      if (qDebounced.length >= 2) params.set("q", qDebounced);
      if (tagId) params.set("tagId", tagId);

      const res = await fetch(
        `/api/clientes/analytics/ranking?${params.toString()}`,
        { credentials: "include", signal: ctrl.signal }
      );
      const data = await res.json();
      if (data.ok) {
        setRankItems(data.items || []);
      } else {
        setRankError(data.error || "Error");
      }
    } catch (e) {
      if (e.name !== "AbortError") setRankError("Error de conexión");
    } finally {
      setRankLoading(false);
    }
  }, [localIdFinal, from, to, rankMetric, rankTake, qDebounced, tagId]);

  // Fetch inactivos
  const fetchInactivos = useCallback(async () => {
    if (!localIdFinal) return;
    if (inactAbort.current) inactAbort.current.abort();
    const ctrl = new AbortController();
    inactAbort.current = ctrl;

    setInactLoading(true);
    setInactError("");

    try {
      const params = new URLSearchParams({
        localId: String(localIdFinal),
        dias: String(inactDias),
        modo: inactModo,
        take: String(inactTake),
      });
      if (qDebounced.length >= 2) params.set("q", qDebounced);
      if (tagId) params.set("tagId", tagId);

      const res = await fetch(
        `/api/clientes/analytics/inactivos?${params.toString()}`,
        { credentials: "include", signal: ctrl.signal }
      );
      const data = await res.json();
      if (data.ok) {
        setInactItems(data.items || []);
      } else {
        setInactError(data.error || "Error");
      }
    } catch (e) {
      if (e.name !== "AbortError") setInactError("Error de conexión");
    } finally {
      setInactLoading(false);
    }
  }, [localIdFinal, inactDias, inactModo, inactTake, qDebounced, tagId]);

  // Auto-fetch on dependency change
  useEffect(() => {
    fetchRanking();
    return () => rankAbort.current?.abort();
  }, [fetchRanking]);

  useEffect(() => {
    fetchInactivos();
    return () => inactAbort.current?.abort();
  }, [fetchInactivos]);

  // Preset buttons
  const handlePreset = (days) => {
    setFrom(daysAgo(days));
    setTo(toDateStr(new Date()));
  };

  if (!perfil || cargandoLocales) return null;

  if (esAdminSinLocal && !localSeleccionado) {
    return (
      <PantallaSeleccionLocal
        locales={locales}
        onSeleccionar={handleCambiarLocal}
      />
    );
  }

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">Analytics Clientes</h1>
            <p className="text-sm text-slate-400">
              Ranking y clientes inactivos
            </p>
          </div>
          <SelectorLocalCompacto
            locales={locales}
            localSeleccionado={localSeleccionado}
            localNombre={localNombre}
            onChange={handleCambiarLocal}
          />
        </div>
        <SunmiButton
          color="slate"
          onClick={() => router.push("/modulos/clientes")}
        >
          Volver a Clientes
        </SunmiButton>
      </div>

      {/* Filtros globales */}
      <SunmiCard className="p-3">
        <div className="flex flex-col gap-2">
          {/* Presets + rango */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400">Período:</span>
            {[7, 30, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => handlePreset(d)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  from === daysAgo(d)
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500"
                }`}
              >
                {d}d
              </button>
            ))}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
            />
            <span className="text-slate-500 text-xs">—</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
            />
          </div>

          {/* Search + tag */}
          <div className="flex flex-wrap gap-2">
            <SunmiInput
              type="text"
              placeholder="Buscar cliente (nombre, tel, email)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <SunmiSelectAdv
              value={tagId}
              onChange={(val) => setTagId(val)}
              placeholder="Todas las etiquetas"
            >
              <option value="">Todas las etiquetas</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </SunmiSelectAdv>
          </div>
        </div>
      </SunmiCard>

      {/* Card Ranking */}
      <SunmiCard className="p-3">
        <SunmiSeparator label="Ranking de clientes" />

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Metric toggle */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            {["facturacion", "frecuencia"].map((m) => (
              <button
                key={m}
                onClick={() => setRankMetric(m)}
                className={`text-xs px-3 py-1.5 transition-all ${
                  rankMetric === m
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {m === "facturacion" ? "Facturación" : "Frecuencia"}
              </button>
            ))}
          </div>

          {/* Take selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">Top:</span>
            {[10, 20, 50].map((n) => (
              <button
                key={n}
                onClick={() => setRankTake(n)}
                className={`text-xs px-2 py-1 rounded border transition-all ${
                  rankTake === n
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {rankError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-2">
            {rankError}
          </div>
        )}

        <div className="overflow-x-auto">
          <SunmiTable
            headers={[
              "Cliente",
              "Total facturado",
              "Compras",
              "Ticket prom.",
              "Última compra",
              "Tags",
            ]}
          >
            {rankLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : rankItems.length === 0 ? (
              <SunmiTableEmpty colSpan={6} message="Sin datos en este período" />
            ) : (
              rankItems.map((item, i) => (
                <SunmiTableRow
                  key={item.clienteId}
                  className="cursor-pointer hover:bg-slate-800/50"
                  onClick={() =>
                    router.push(
                      `/modulos/clientes/${item.clienteId}?localId=${localIdFinal}`
                    )
                  }
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-mono w-5">
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-sm font-medium">{item.nombre}</div>
                        <div className="text-[10px] text-slate-500">
                          {item.telefono || item.email || ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm text-emerald-400">
                    ${formatPrecio(item.totalFacturado)}
                  </td>
                  <td className="px-2 py-1.5 text-sm text-center">
                    {item.cantidadCompras}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    ${formatPrecio(item.ticketPromedio)}
                  </td>
                  <td className="px-2 py-1.5 text-sm text-slate-400">
                    {formatFecha(item.ultimaCompraAt)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {item.tags?.length > 0
                        ? item.tags.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            >
                              {t}
                            </span>
                          ))
                        : <span className="text-[10px] text-slate-600">-</span>}
                    </div>
                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        </div>
      </SunmiCard>

      {/* Card Inactivos */}
      <SunmiCard className="p-3">
        <SunmiSeparator label="Clientes inactivos" />

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Días selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">Inactivos hace:</span>
            {[30, 60, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => setInactDias(d)}
                className={`text-xs px-2 py-1 rounded border transition-all ${
                  inactDias === d
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Modo toggle */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            {[
              { value: "conCompras", label: "Con compras" },
              { value: "incluyeNunca", label: "Incluye nunca" },
            ].map((m) => (
              <button
                key={m.value}
                onClick={() => setInactModo(m.value)}
                className={`text-xs px-3 py-1.5 transition-all ${
                  inactModo === m.value
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Take */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">Mostrar:</span>
            {[50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setInactTake(n)}
                className={`text-xs px-2 py-1 rounded border transition-all ${
                  inactTake === n
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {inactError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-2">
            {inactError}
          </div>
        )}

        <div className="overflow-x-auto">
          <SunmiTable
            headers={["Cliente", "Última compra", "Días inactivo", "Tags"]}
          >
            {inactLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-6 text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : inactItems.length === 0 ? (
              <SunmiTableEmpty
                colSpan={4}
                message="Sin clientes inactivos"
              />
            ) : (
              inactItems.map((item) => (
                <SunmiTableRow
                  key={item.clienteId}
                  className="cursor-pointer hover:bg-slate-800/50"
                  onClick={() =>
                    router.push(
                      `/modulos/clientes/${item.clienteId}?localId=${localIdFinal}`
                    )
                  }
                >
                  <td className="px-2 py-1.5">
                    <div>
                      <div className="text-sm font-medium">{item.nombre}</div>
                      <div className="text-[10px] text-slate-500">
                        {item.telefono || item.email || ""}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-sm text-slate-400">
                    {item.ultimaCompraAt ? formatFecha(item.ultimaCompraAt) : (
                      <span className="text-slate-600">Nunca</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {item.diasInactivo != null ? (
                      <span
                        className={
                          item.diasInactivo > 90
                            ? "text-red-400"
                            : item.diasInactivo > 30
                              ? "text-amber-400"
                              : "text-slate-300"
                        }
                      >
                        {item.diasInactivo}d
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {item.tags?.length > 0
                        ? item.tags.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            >
                              {t}
                            </span>
                          ))
                        : <span className="text-[10px] text-slate-600">-</span>}
                    </div>
                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        </div>
      </SunmiCard>
    </div>
  );
}
