"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "Solicitado", label: "Solicitado" },
  { value: "Preparando", label: "Preparando" },
  { value: "Enviado", label: "Enviado" },
];

const BADGE_COLORS = {
  Solicitado: "bg-amber-500/20 text-amber-300 border-amber-400/40",
  Preparando: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
  Enviado: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
};

const TRANS_BADGE_COLORS = {
  Enviada: "bg-blue-500/20 text-blue-300 border-blue-400/40",
  Recibida: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
};

export default function HistorialPedidosPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [estado, setEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [expandido, setExpandido] = useState(null);

  const debounceRef = useRef(null);

  // ====================================================
  // CARGAR HISTORIAL
  // ====================================================
  const cargar = useCallback(
    async (p = 1) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: p, pageSize: 20 });
        if (estado) params.set("estado", estado);
        if (busqueda.trim()) params.set("q", busqueda.trim());

        const res = await fetch(`/api/pedidos/historial?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!json.ok) {
          setError(json.error || "Error al cargar historial");
          setItems([]);
          setTotalPages(1);
          setTotal(0);
          return;
        }

        setItems(json.items || []);
        setPage(json.page || 1);
        setTotalPages(json.totalPages || 1);
        setTotal(json.total || 0);
      } catch {
        setError("Error de conexión");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [estado, busqueda]
  );

  // Debounce búsqueda + cambio de estado
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargar(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [estado, busqueda, cargar]);

  // ====================================================
  // PERMISOS
  // ====================================================
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes("pedidos.ver");

  if (cargandoUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-sm text-slate-300">Cargando...</span>
      </div>
    );
  }

  if (!puede) return <SinPermisos />;

  // ====================================================
  // RENDER
  // ====================================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
        <button
          type="button"
          onClick={() => router.push("/modulos/pedidos")}
          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
        >
          ← Volver al catálogo
        </button>

        <SunmiCard>
          <SunmiHeader title="Historial de Pedidos" color="cyan">
            <div className="text-[11px] text-slate-900/80 mt-1">
              Pedidos solicitados, en preparación y enviados
            </div>
          </SunmiHeader>

          {error && (
            <div className="mb-3 text-[11px] text-red-400 bg-red-900/20 border border-red-500/40 rounded-lg px-3 py-2">
              {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setError("")}
              >
                cerrar
              </button>
            </div>
          )}

          {/* FILTROS */}
          <SunmiSeparator label="Filtros" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            <SunmiInput
              placeholder="Buscar por nombre o código..."
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            <SunmiSelectAdv
              value={estado}
              placeholder="Estado"
              onChange={(v) => setEstado(v)}
            >
              {ESTADOS.map((e) => (
                <div key={e.value} value={e.value}>
                  {e.label}
                </div>
              ))}
            </SunmiSelectAdv>
          </div>

          {/* RESULTADOS */}
          <SunmiSeparator label={`Pedidos (${total})`} />

          {loading ? (
            <div className="text-[12px] text-slate-400 py-6 text-center">
              Cargando historial...
            </div>
          ) : items.length === 0 ? (
            <div className="text-[12px] text-slate-400 py-6 text-center">
              No se encontraron pedidos.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <PedidoCard
                  key={item.posId}
                  item={item}
                  expandido={expandido === item.posId}
                  onToggle={() =>
                    setExpandido((prev) =>
                      prev === item.posId ? null : item.posId
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* PAGINACIÓN */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-3 pb-1">
              <SunmiButton
                color="slate"
                disabled={page <= 1 || loading}
                onClick={() => cargar(page - 1)}
              >
                ← Anterior
              </SunmiButton>
              <span className="text-[12px] text-slate-400">
                Página {page} de {totalPages}
              </span>
              <SunmiButton
                color="slate"
                disabled={page >= totalPages || loading}
                onClick={() => cargar(page + 1)}
              >
                Siguiente →
              </SunmiButton>
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}

// ====================================================
// COMPONENTE: Tarjeta de pedido
// ====================================================
function PedidoCard({ item, expandido, onToggle }) {
  const fecha = item.solicitadoAt
    ? new Date(item.solicitadoAt).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date(item.createdAt).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const badgeClass =
    BADGE_COLORS[item.estado] ||
    "bg-slate-500/20 text-slate-300 border-slate-400/40";

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-slate-200">
              POS #{item.posId}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}
            >
              {item.estado}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-400">
            <span>{fecha}</span>
            <span>{item.itemCount} producto{item.itemCount !== 1 ? "s" : ""}</span>
            {item.totalBultos > 0 && (
              <span>{item.totalBultos} bulto{item.totalBultos !== 1 ? "s" : ""}</span>
            )}
            {item.totalUnidades > 0 && (
              <span>{item.totalUnidades} unidad{item.totalUnidades !== 1 ? "es" : ""}</span>
            )}
          </div>

          {/* Vínculo a transferencia */}
          {item.transferenciaId && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Link
                href={`/modulos/transferencias/${item.transferenciaId}`}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline transition"
              >
                Transferencia #{item.transferenciaId}
              </Link>
              {item.transferenciaEstado && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    TRANS_BADGE_COLORS[item.transferenciaEstado] ||
                    "bg-slate-500/20 text-slate-300 border-slate-400/40"
                  }`}
                >
                  {item.transferenciaEstado}
                </span>
              )}
              {item.transferenciaFechaRecepcion && (
                <span className="text-[10px] text-slate-500">
                  Recibida el{" "}
                  {new Date(item.transferenciaFechaRecepcion).toLocaleString(
                    "es-AR",
                    { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
                  )}
                </span>
              )}
            </div>
          )}

          {/* Preview de items (resumen) */}
          {!expandido && item.resumen.length > 0 && (
            <div className="mt-1.5 text-[10px] text-slate-500 truncate">
              {item.resumen.map((r) => r.nombre).join(", ")}
              {item.itemCount > 5 && ` (+${item.itemCount - 5} más)`}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="text-[11px] text-cyan-400 hover:text-cyan-300 underline transition whitespace-nowrap"
        >
          {expandido ? "Ocultar" : "Ver detalle"}
        </button>
      </div>

      {/* Detalle expandido */}
      {expandido && item.resumen.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-700 pt-2">
          {item.resumen.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-[11px] text-slate-300"
            >
              <span className="truncate flex-1 min-w-0">{r.nombre}</span>
              <span className="ml-2 text-amber-300 font-medium whitespace-nowrap">
                {r.sugerido}{" "}
                {r.unidadSugerida === "BULTO"
                  ? `bulto${r.sugerido !== 1 ? "s" : ""} (x${r.factorPack})`
                  : `unidad${r.sugerido !== 1 ? "es" : ""}`}
              </span>
            </div>
          ))}
          {item.itemCount > 5 && (
            <div className="text-[10px] text-slate-500 pt-1">
              ... y {item.itemCount - 5} producto{item.itemCount - 5 !== 1 ? "s" : ""} más
            </div>
          )}
        </div>
      )}
    </div>
  );
}
