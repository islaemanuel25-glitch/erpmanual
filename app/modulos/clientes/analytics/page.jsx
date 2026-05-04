"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";

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
  const { perfil } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const localIdFinal = contexto?.localId || null;

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

  if (!perfil || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">Análisis de Clientes</h1>
            <p className="text-sm sunmi-text-muted">
              Ranking y clientes inactivos
            </p>
          </div>
        </div>
        <SunmiBackButton href="/modulos/clientes" />
      </div>

      {/* Filtros globales */}
      <SunmiCard className="p-3">
        <div className="flex flex-col gap-2">
          {/* Presets + rango */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] sunmi-text-muted">Período:</span>
            {[7, 30, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => handlePreset(d)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  from === daysAgo(d)
                    ? "sunmi-btn-link-soft"
                    : "sunmi-control sunmi-border"
                }`}
              >
                {d}d
              </button>
            ))}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-lg px-2 text-xs sunmi-select-native"
            />
            <span className="sunmi-text-muted text-xs">—</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-lg px-2 text-xs sunmi-select-native"
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
          <div className="flex rounded-lg border sunmi-border overflow-hidden">
            {["facturacion", "frecuencia"].map((m) => (
              <button
                key={m}
                onClick={() => setRankMetric(m)}
                className={`text-xs px-3 py-1.5 transition-all ${
                  rankMetric === m
                    ? "sunmi-btn-link-soft"
                    : "sunmi-control sunmi-link-muted"
                }`}
              >
                {m === "facturacion" ? "Facturación" : "Frecuencia"}
              </button>
            ))}
          </div>

          {/* Take selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] sunmi-text-muted">Top:</span>
            {[10, 20, 50].map((n) => (
              <button
                key={n}
                onClick={() => setRankTake(n)}
                className={`text-xs px-2 py-1 rounded border transition-all ${
                  rankTake === n
                    ? "sunmi-btn-link-soft"
                    : "sunmi-control sunmi-border"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {rankError && (
          <div className="text-xs sunmi-text-danger sunmi-state-danger rounded px-3 py-2 mb-2">
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
                <td colSpan={6} className="text-center py-6 sunmi-text-muted">
                  Cargando...
                </td>
              </tr>
            ) : rankItems.length === 0 ? (
              <SunmiTableEmpty colSpan={6} message="Sin datos en este período" />
            ) : (
              rankItems.map((item, i) => (
                <SunmiTableRow
                  key={item.clienteId}
                  className="cursor-pointer hover:bg-[var(--table-row-hover)]"
                  onClick={() =>
                    router.push(
                      `/modulos/clientes/${item.clienteId}`
                    )
                  }
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] sunmi-text-muted font-mono w-5">
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-sm font-medium">{item.nombre}</div>
                        <div className="text-[10px] sunmi-text-muted">
                          {item.telefono || item.email || ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm sunmi-text-success">
                    ${formatPrecio(item.totalFacturado)}
                  </td>
                  <td className="px-2 py-1.5 text-sm text-center">
                    {item.cantidadCompras}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    ${formatPrecio(item.ticketPromedio)}
                  </td>
                  <td className="px-2 py-1.5 text-sm sunmi-text-muted">
                    {formatFecha(item.ultimaCompraAt)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {item.tags?.length > 0
                        ? item.tags.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-[10px] px-1.5 py-0.5 rounded-full sunmi-badge-link"
                            >
                              {t}
                            </span>
                          ))
                        : <span className="text-[10px] sunmi-text-muted">-</span>}
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
            <span className="text-[11px] sunmi-text-muted">Inactivos hace:</span>
            {[30, 60, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => setInactDias(d)}
                className={`text-xs px-2 py-1 rounded border transition-all ${
                  inactDias === d
                    ? "sunmi-btn-accent-soft"
                    : "sunmi-control sunmi-border"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Modo toggle */}
          <div className="flex rounded-lg border sunmi-border overflow-hidden">
            {[
              { value: "conCompras", label: "Con compras" },
              { value: "incluyeNunca", label: "Incluye nunca" },
            ].map((m) => (
              <button
                key={m.value}
                onClick={() => setInactModo(m.value)}
                className={`text-xs px-3 py-1.5 transition-all ${
                  inactModo === m.value
                    ? "sunmi-btn-accent-soft"
                    : "sunmi-control sunmi-link-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Take */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] sunmi-text-muted">Mostrar:</span>
            {[50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setInactTake(n)}
                className={`text-xs px-2 py-1 rounded border transition-all ${
                  inactTake === n
                    ? "sunmi-btn-accent-soft"
                    : "sunmi-control sunmi-border"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {inactError && (
          <div className="text-xs sunmi-text-danger sunmi-state-danger rounded px-3 py-2 mb-2">
            {inactError}
          </div>
        )}

        <div className="overflow-x-auto">
          <SunmiTable
            headers={["Cliente", "Última compra", "Días inactivo", "Tags"]}
          >
            {inactLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-6 sunmi-text-muted">
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
                  className="cursor-pointer hover:bg-[var(--table-row-hover)]"
                  onClick={() =>
                    router.push(
                      `/modulos/clientes/${item.clienteId}`
                    )
                  }
                >
                  <td className="px-2 py-1.5">
                    <div>
                      <div className="text-sm font-medium">{item.nombre}</div>
                      <div className="text-[10px] sunmi-text-muted">
                        {item.telefono || item.email || ""}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-sm sunmi-text-muted">
                    {item.ultimaCompraAt ? formatFecha(item.ultimaCompraAt) : (
                      <span className="sunmi-text-muted">Nunca</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {item.diasInactivo != null ? (
                      <span
                        className={
                          item.diasInactivo > 90
                            ? "sunmi-text-danger"
                            : item.diasInactivo > 30
                              ? "sunmi-text-accent"
                              : "sunmi-text-muted"
                        }
                      >
                        {item.diasInactivo}d
                      </span>
                    ) : (
                      <span className="sunmi-text-muted">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {item.tags?.length > 0
                        ? item.tags.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-[10px] px-1.5 py-0.5 rounded-full sunmi-badge-link"
                            >
                              {t}
                            </span>
                          ))
                        : <span className="text-[10px] sunmi-text-muted">-</span>}
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
