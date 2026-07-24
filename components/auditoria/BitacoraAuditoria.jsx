"use client";

import { useEffect, useState, useCallback, Fragment } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";

import { ChevronDown, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;
const FILTROS_VACIOS = { desde: "", hasta: "", localId: "", usuarioId: "", operadorId: "", accion: "" };

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Render legible de los cambios: por entidad, campo por campo "antes → después".
function CambiosView({ cambios }) {
  if (!Array.isArray(cambios) || cambios.length === 0) {
    return <div className="text-xs opacity-60 p-2">Sin cambios de campos registrados.</div>;
  }
  return (
    <div className="flex flex-col gap-3 p-2">
      {cambios.map((grupo, gi) => (
        <div key={gi}>
          {(grupo.nombre || grupo.entidad) && (
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--pos-link)" }}>
              {grupo.entidad}{grupo.nombre ? `: ${grupo.nombre}` : ""}
            </div>
          )}
          {Array.isArray(grupo.campos) && grupo.campos.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {grupo.campos.map((c, ci) => (
                <div key={ci} className="text-[13px]">
                  <span className="opacity-70">{c.label}: </span>
                  {c.antes != null && (
                    <>
                      <span className="line-through opacity-60">{String(c.antes)}</span>
                      <span className="opacity-60"> → </span>
                    </>
                  )}
                  <span className="font-semibold">{c.despues != null ? String(c.despues) : "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs opacity-60">—</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function BitacoraAuditoria() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [opciones, setOpciones] = useState({ acciones: [], locales: [], operadores: [], usuarios: [] });

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [expandida, setExpandida] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setF = (k, v) => setFiltros((prev) => ({ ...prev, [k]: v }));

  // Cargar opciones de filtro una vez
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auditoria/opciones", { credentials: "include", cache: "no-store" });
        const json = await res.json();
        if (json.ok) {
          setOpciones({
            acciones: json.acciones || [],
            locales: json.locales || [],
            operadores: json.operadores || [],
            usuarios: json.usuarios || [],
          });
        }
      } catch {
        /* noop */
      }
    })();
  }, []);

  const fetchItems = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      for (const [k, v] of Object.entries(filtros)) {
        if (v) qs.set(k, v);
      }
      const res = await fetch(`/api/auditoria/listar?${qs.toString()}`, { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setItems(json.items || []);
        setTotal(json.pagination?.total || 0);
      } else {
        setItems([]);
        setTotal(0);
      }
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [page, filtros]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Al cambiar filtros, volver a la página 1
  useEffect(() => {
    setPage(1);
  }, [filtros]);

  const limpiar = () => setFiltros(FILTROS_VACIOS);

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Bitácora de auditoría"
          subtitle="Registro central de acciones sensibles: quién, cuándo, sobre qué y el antes/después."
        />

        {/* FILTROS */}
        <SunmiSeparator label="Filtros" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Desde</label>
            <SunmiInput type="date" value={filtros.desde} onChange={(e) => setF("desde", e.target.value)} />
          </div>
          <div>
            <label className="text-xs opacity-70">Hasta</label>
            <SunmiInput type="date" value={filtros.hasta} onChange={(e) => setF("hasta", e.target.value)} />
          </div>
          <div>
            <label className="text-xs opacity-70">Acción</label>
            <SunmiSelectAdv value={filtros.accion} onChange={(v) => setF("accion", v)} placeholder="Todas" searchable>
              <option value="">Todas</option>
              {opciones.acciones.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </SunmiSelectAdv>
          </div>
          <div>
            <label className="text-xs opacity-70">Local</label>
            <SunmiSelectAdv value={filtros.localId} onChange={(v) => setF("localId", v)} placeholder="Todos" searchable>
              <option value="">Todos</option>
              {opciones.locales.map((l) => (
                <option key={l.id} value={String(l.id)}>{l.nombre}</option>
              ))}
            </SunmiSelectAdv>
          </div>
          <div>
            <label className="text-xs opacity-70">Usuario</label>
            <SunmiSelectAdv value={filtros.usuarioId} onChange={(v) => setF("usuarioId", v)} placeholder="Todos" searchable>
              <option value="">Todos</option>
              {opciones.usuarios.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.nombre}</option>
              ))}
            </SunmiSelectAdv>
          </div>
          <div>
            <label className="text-xs opacity-70">Operador</label>
            <SunmiSelectAdv value={filtros.operadorId} onChange={(v) => setF("operadorId", v)} placeholder="Todos" searchable>
              <option value="">Todos</option>
              {opciones.operadores.map((o) => (
                <option key={o.id} value={String(o.id)}>{o.nombre}</option>
              ))}
            </SunmiSelectAdv>
          </div>
        </div>

        <div className="flex justify-end mt-3">
          <SunmiButton onClick={limpiar} color="slate" className="!border !border-[var(--pos-link)]">
            Limpiar filtros
          </SunmiButton>
        </div>

        {/* LISTADO */}
        <SunmiSeparator label={`Registros${total ? ` (${total})` : ""}`} />

        <SunmiTable headers={["", "Fecha", "Acción", "Entidad", "Usuario", "Operador", "Local"]}>
          {items.length === 0 ? (
            <SunmiTableEmpty message={cargando ? "Cargando..." : "No hay registros para los filtros aplicados"} />
          ) : (
            items.map((r) => {
              const abierta = expandida === r.id;
              return (
                <Fragment key={r.id}>
                  <SunmiTableRow onClick={() => setExpandida(abierta ? null : r.id)} className="cursor-pointer">
                    <td>{abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                    <td className="whitespace-nowrap">{fmtFecha(r.createdAt)}</td>
                    <td>
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                        style={{ background: "var(--pos-bg-soft, rgba(127,127,127,0.12))", color: "var(--pos-link)" }}
                      >
                        {r.accion}
                      </span>
                    </td>
                    <td>
                      <div className="font-semibold">{r.entidadNombre || r.entidad || "—"}</div>
                      {r.entidadNombre && (
                        <div className="text-[11px] opacity-60">{r.entidad}</div>
                      )}
                    </td>
                    <td>{r.usuario?.nombre || "—"}</td>
                    <td>{r.operador?.nombre || "—"}</td>
                    <td>{r.local?.nombre || "—"}</td>
                  </SunmiTableRow>
                  {abierta && (
                    <tr>
                      <td colSpan={7}>
                        <CambiosView cambios={r.cambios} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </SunmiTable>

        {/* PAGINACIÓN */}
        <SunmiSeparator />

        <div className="flex justify-between items-center gap-2">
          <SunmiButton color="slate" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            « Anterior
          </SunmiButton>
          <span className="text-xs opacity-70">
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
