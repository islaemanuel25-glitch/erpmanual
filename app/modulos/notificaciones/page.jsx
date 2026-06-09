"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";

const PAGE_SIZE = 20;

// Estado: "Todas" no trae todo el historial, solo todo dentro del rango de fechas.
const TABS = [
  { key: "todas", label: "Todas" },
  { key: "noleidas", label: "No leídas" },
  { key: "leidas", label: "Leídas" },
];

// ---- Helpers de fecha (YYYY-MM-DD, hora local AR) ----
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function hoyYMD() {
  return ymd(new Date());
}
function haceDiasYMD(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

// Etiqueta de día para agrupar: "Hoy — dd/mm/aaaa", "Ayer — ...", o la fecha.
function etiquetaDia(f) {
  const d = new Date(f);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dif = Math.round((hoy.getTime() - dd.getTime()) / 86400000);
  const fechaStr = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (dif === 0) return `Hoy — ${fechaStr}`;
  if (dif === 1) return `Ayer — ${fechaStr}`;
  return fechaStr;
}

function fmtHora(f) {
  if (!f) return "";
  return new Date(f).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// Agrupa items (ya ordenados desc por createdAt) por día.
function agruparPorDia(items) {
  const grupos = [];
  let actual = null;
  for (const n of items) {
    const key = new Date(n.createdAt).toLocaleDateString("es-AR");
    if (!actual || actual.key !== key) {
      actual = { key, etiqueta: etiquetaDia(n.createdAt), items: [] };
      grupos.push(actual);
    }
    actual.items.push(n);
  }
  return grupos;
}

export default function NotificacionesPage() {
  const router = useRouter();
  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [filtro, setFiltro] = useState("todas");
  // Rango obligatorio: por defecto, últimos 7 días.
  const [fechaDesde, setFechaDesde] = useState(() => haceDiasYMD(7));
  const [fechaHasta, setFechaHasta] = useState(() => hoyYMD());
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filtro,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (fechaDesde) params.set("desde", new Date(`${fechaDesde}T00:00:00`).toISOString());
      if (fechaHasta) params.set("hasta", new Date(`${fechaHasta}T23:59:59.999`).toISOString());

      const res = await fetch(`/api/notificaciones/listar?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) {
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total) || 0);
      }
    } catch {
      // silenciar
    } finally {
      setLoading(false);
    }
  }, [filtro, fechaDesde, fechaHasta, page]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) return null;

  const aplicarRango = (dias) => {
    setFechaDesde(dias === 0 ? hoyYMD() : haceDiasYMD(dias));
    setFechaHasta(hoyYMD());
    setPage(1);
  };

  const cambiarTab = (key) => {
    setFiltro(key);
    setPage(1);
  };

  const abrir = async (n) => {
    try {
      await fetch(`/api/notificaciones/marcar-leida/${n.id}`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // navegar igual
    }
    if (n.href) router.push(n.href);
  };

  // Toggle leída/no leída (acción inversa).
  const toggleLeida = async (n) => {
    const nuevoLeida = !n.leida;
    const url = nuevoLeida
      ? `/api/notificaciones/marcar-leida/${n.id}`
      : `/api/notificaciones/marcar-no-leida/${n.id}`;
    try {
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!data.ok) return;
      setItems((prev) => {
        if (filtro === "noleidas" && nuevoLeida) return prev.filter((x) => x.id !== n.id);
        if (filtro === "leidas" && !nuevoLeida) return prev.filter((x) => x.id !== n.id);
        return prev.map((x) => (x.id === n.id ? { ...x, leida: nuevoLeida } : x));
      });
    } catch {
      // silenciar
    }
  };

  const marcarTodas = async () => {
    try {
      await fetch("/api/notificaciones/marcar-todas", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // silenciar
    }
    cargar();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const grupos = agruparPorDia(items);

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <SunmiHeader title="Notificaciones" />
            <p className="text-xs sunmi-text-muted px-1">Notificaciones internas por rango de fechas</p>
          </div>
          <SunmiButton color="slate" type="button" onClick={marcarTodas}>
            Marcar todas leídas
          </SunmiButton>
        </div>

        {/* Filtros por estado — mobile: 3 en una fila (grid); desktop: ancho natural */}
        <div className="grid grid-cols-3 gap-1.5 mb-3 sm:flex sm:flex-wrap sm:gap-2">
          {TABS.map((t) => (
            <SunmiButton
              key={t.key}
              type="button"
              color={filtro === t.key ? "cyan" : "slate"}
              onClick={() => cambiarTab(t.key)}
              className="w-full text-xs whitespace-nowrap !px-2 sm:w-auto sm:text-[13px] sm:!px-4"
            >
              {t.label}
            </SunmiButton>
          ))}
        </div>

        {/* Rango de fechas (obligatorio) + atajos */}
        <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
          <div>
            <label className="block text-[11px] sunmi-text-muted mb-1">Desde</label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <label className="block text-[11px] sunmi-text-muted mb-1">Hasta</label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <SunmiButton color="slate" type="button" onClick={() => aplicarRango(0)}>Hoy</SunmiButton>
            <SunmiButton color="slate" type="button" onClick={() => aplicarRango(7)}>Últimos 7 días</SunmiButton>
          </div>
        </div>

        {/* Listado agrupado por día */}
        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="text-xs sunmi-text-muted italic px-1">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="text-xs sunmi-text-muted italic px-1">Sin notificaciones en el rango</p>
          ) : (
            grupos.map((g) => (
              <div key={g.key}>
                <div className="text-[11px] font-semibold sunmi-text-muted px-1 mb-1.5">{g.etiqueta}</div>
                <div className="rounded-xl border sunmi-border overflow-hidden divide-y sunmi-divide">
                  {g.items.map((n) => (
                    <div
                      key={n.id}
                      className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 ${
                        n.leida ? "" : "sunmi-surface"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span
                          className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                            n.leida ? "bg-transparent" : "bg-[color:var(--pos-accent)]"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-[13px] truncate ${
                              n.leida ? "sunmi-text-muted" : "font-semibold sunmi-text-strong"
                            }`}
                          >
                            {n.titulo}
                          </div>
                          {n.cuerpo && (
                            <div className="text-[11px] sunmi-text-muted truncate">{n.cuerpo}</div>
                          )}
                          <div className="text-[10px] sunmi-text-muted mt-0.5">
                            {fmtHora(n.createdAt)}{n.tipo ? ` · ${n.tipo}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                        {n.href && (
                          <button
                            type="button"
                            onClick={() => abrir(n)}
                            className="text-[11px] font-medium sunmi-text-accent px-2.5 py-1.5 rounded hover:bg-[var(--table-row-hover)] whitespace-nowrap"
                          >
                            Abrir
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleLeida(n)}
                          className="text-[11px] sunmi-text-muted px-2.5 py-1.5 rounded hover:bg-[var(--table-row-hover)] whitespace-nowrap"
                        >
                          {n.leida ? "Marcar no leída" : "Marcar leída"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Paginación */}
        <div className="flex justify-between pt-4 px-2">
          <SunmiButton color="slate" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            « Anterior
          </SunmiButton>
          <span className="sunmi-text-muted text-sm self-center">
            Página {page} de {totalPages}
          </span>
          <SunmiButton color="slate" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente »
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
