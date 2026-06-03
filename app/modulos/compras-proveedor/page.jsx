"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import { recibeHoy } from "@/lib/proveedores/diasPedido";

const PAGE_SIZE = 20;
const PAGE_SIZE_ACTIVOS = 50;

const ESTADOS_ACTIVOS = ["BORRADOR", "CONFIRMADO", "ENVIADO"];
const ESTADOS_HISTORIAL = ["RECIBIDO", "ANULADO"];

// Prioridad de la vista activos: ENVIADO (pendiente de recepción) → CONFIRMADO → BORRADOR.
const PRIORIDAD_ACTIVOS = { ENVIADO: 0, CONFIRMADO: 1, BORRADOR: 2 };

function formatFecha(f) {
  if (!f) return "-";
  return new Date(f).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Hoy local en YYYY-MM-DD (zona del navegador, default AR).
function hoyLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Orden de la vista activos: por prioridad de estado; dentro de ENVIADO, más viejo
// primero (más demorado); en el resto, más nuevo primero.
function ordenarActivos(list) {
  return [...list].sort((a, b) => {
    const pa = PRIORIDAD_ACTIVOS[a.estado] ?? 9;
    const pb = PRIORIDAD_ACTIVOS[b.estado] ?? 9;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return a.estado === "ENVIADO" ? ta - tb : tb - ta;
  });
}

function estadoBadgeClass(estado) {
  return [
    estado === "BORRADOR" ? "sunmi-badge-accent" : "",
    estado === "CONFIRMADO" ? "sunmi-badge-accent" : "",
    estado === "ENVIADO" ? "sunmi-badge-link" : "",
    estado === "RECIBIDO" ? "sunmi-badge-success" : "",
    estado === "ANULADO" ? "sunmi-badge-danger" : "",
  ].join(" ");
}

function estadoLabel(estado) {
  return estado === "BORRADOR" ? "EN CURSO" : estado;
}

export default function ComprasProveedorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  // Vista y filtros derivados de la URL (navegación por menú).
  const vista = searchParams.get("vista") === "historial" ? "historial" : "activos";
  const estadoParam = searchParams.get("estado") || "";
  const proveedorIdParam = searchParams.get("proveedorId") || "";

  // Modo recepción: entrada desde "Recepción de mercadería" (?vista=activos&estado=ENVIADO).
  // Solo adapta la UX; la lógica de filtrado/listado no cambia.
  const modoRecepcion = vista === "activos" && estadoParam === "ENVIADO";

  const titulo = modoRecepcion
    ? "Recepción de mercadería"
    : vista === "historial"
    ? "Historial de compras"
    : "Pedidos activos";
  const subtitulo = modoRecepcion
    ? "Pedidos enviados pendientes de recibir"
    : vista === "historial"
    ? "Pedidos recibidos o anulados"
    : "Pedidos pendientes de gestión";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState(estadoParam);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [proveedoresHoy, setProveedoresHoy] = useState([]);

  const pageSize = vista === "activos" ? PAGE_SIZE_ACTIVOS : PAGE_SIZE;

  // Sincronizar el filtro de estado con la URL (p. ej. menú "Recepción" → estado=ENVIADO).
  useEffect(() => {
    setEstado(estadoParam);
    setPage(1);
  }, [estadoParam, vista]);

  // Volver a página 1 al cambiar filtros locales.
  useEffect(() => {
    setPage(1);
  }, [estado, fechaDesde, fechaHasta]);

  const cargar = async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (proveedorIdParam) qs.set("proveedorId", proveedorIdParam);

      // Si hay un estado puntual elegido, se filtra por ese; si no, por el grupo de la vista.
      if (estado) {
        qs.set("estado", estado);
      } else {
        qs.set(
          "estados",
          (vista === "historial" ? ESTADOS_HISTORIAL : ESTADOS_ACTIVOS).join(",")
        );
      }

      // El filtro de fecha SOLO aplica en historial (no oculta pedidos activos).
      if (vista === "historial" && fechaDesde && fechaHasta) {
        qs.set("fechaDesde", fechaDesde);
        qs.set("fechaHasta", fechaHasta);
      }

      const res = await fetch(`/api/compras-proveedor/listar?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        const list = data.items || [];
        setItems(vista === "activos" ? ordenarActivos(list) : list);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, vista, estado, proveedorIdParam, fechaDesde, fechaHasta]);

  // Cargar proveedores activos para detectar los que reciben pedido hoy.
  useEffect(() => {
    const cargarProveedoresHoy = async () => {
      try {
        const res = await fetch(
          "/api/proveedores/listar?estado=activos&pageSize=200",
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          setProveedoresHoy(data.items.filter((p) => recibeHoy(p.dias_pedido)));
        }
      } catch {
        // Silenciar: el strip queda vacío y se muestra el placeholder.
      }
    };
    cargarProveedoresHoy();
  }, []);

  // Redirigir a inicio si falta contexto (evitar router.push durante render)
  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  const totalPages = Math.ceil(total / pageSize);

  const irAVista = (v) => {
    const qs = new URLSearchParams();
    qs.set("vista", v);
    if (proveedorIdParam) qs.set("proveedorId", proveedorIdParam);
    router.push(`/modulos/compras-proveedor?${qs}`);
  };

  if (!perfil || loadingCtx) return null;
  if (needsContexto) return null;

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  const accionPedido = (item) =>
    item.estado === "BORRADOR" ? (
      <SunmiButton
        color="green"
        onClick={() => router.push(`/modulos/compras-proveedor/nueva?pedidoId=${item.id}`)}
      >
        Continuar pedido
      </SunmiButton>
    ) : (
      <SunmiButton
        color="cyan"
        onClick={() => router.push(`/modulos/compras-proveedor/${item.id}`)}
      >
        {modoRecepcion ? "Ver / recibir" : "Ver"}
      </SunmiButton>
    );

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <SunmiHeader title={titulo} />
            <p className="text-xs sunmi-text-muted px-1">{subtitulo}</p>
          </div>
          <SunmiButton onClick={() => router.push("/modulos/compras-proveedor/nueva")}>
            ＋ Nuevo pedido
          </SunmiButton>
        </div>

        {/* Toggle Activos / Historial (oculto en modo recepción) */}
        {!modoRecepcion && (
          <div className="flex gap-2 mb-4">
            <SunmiButton
              color={vista === "activos" ? "cyan" : "slate"}
              onClick={() => irAVista("activos")}
            >
              Pedidos activos
            </SunmiButton>
            <SunmiButton
              color={vista === "historial" ? "cyan" : "slate"}
              onClick={() => irAVista("historial")}
            >
              Historial
            </SunmiButton>
          </div>
        )}

        {/* Strip: proveedores que reciben pedido hoy (solo en activos, no en recepción) */}
        {vista === "activos" && !modoRecepcion && (
          <div
            className="rounded-2xl border p-3 mb-4"
            style={{ borderColor: "var(--pos-link)" }}
          >
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--pos-link)" }}>
              Proveedores que reciben pedido hoy
            </div>

            {proveedoresHoy.length === 0 ? (
              <div className="text-[11px] sunmi-text-muted">
                Hoy no hay proveedores configurados para recibir pedidos.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {proveedoresHoy.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border px-2 py-1 sunmi-surface"
                    style={{ borderColor: "var(--pos-link)" }}
                  >
                    <span className="text-[12px] font-medium sunmi-text-strong">
                      {p.nombre}
                    </span>
                    <SunmiButton
                      color="cyan"
                      onClick={() =>
                        router.push(`/modulos/compras-proveedor/nueva?proveedorId=${p.id}`)
                      }
                    >
                      Crear compra
                    </SunmiButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!modoRecepcion && (
        <>
        <SunmiSeparator label="Filtros" className="my-4" />

        <div className="flex flex-col md:flex-row md:flex-wrap gap-3 px-2 mb-4 items-end">
          <div className="w-full md:w-48">
            <label className="block text-[11px] sunmi-text-muted mb-1">Estado</label>
            <SunmiSelectAdv
              value={estado}
              onChange={setEstado}
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <SunmiSelectOption value="">
                {vista === "historial" ? "Todo el historial" : "Todos los activos"}
              </SunmiSelectOption>
              {(vista === "historial" ? ESTADOS_HISTORIAL : ESTADOS_ACTIVOS).map((e) => (
                <SunmiSelectOption key={e} value={e}>
                  {e === "BORRADOR" ? "EN CURSO (Borrador)" : e}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </div>

          {/* Filtro de fecha SOLO en historial */}
          {vista === "historial" && (
            <>
              <div>
                <label className="block text-[11px] sunmi-text-muted mb-1">Desde</label>
                <SunmiInput
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="!border !border-[var(--pos-link)]"
                />
              </div>

              <div>
                <label className="block text-[11px] sunmi-text-muted mb-1">Hasta</label>
                <SunmiInput
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="!border !border-[var(--pos-link)]"
                />
              </div>

              <SunmiButton
                color="cyan"
                onClick={() => {
                  const hoy = hoyLocalISO();
                  setFechaDesde(hoy);
                  setFechaHasta(hoy);
                }}
              >
                Hoy
              </SunmiButton>

              <SunmiButton
                color="slate"
                className="!border !border-[var(--pos-link)]"
                onClick={() => {
                  setFechaDesde("");
                  setFechaHasta("");
                }}
              >
                Ver todo
              </SunmiButton>
            </>
          )}
        </div>
        </>
        )}

        <SunmiSeparator label="Listado" className="my-4" />

        {/* DESKTOP: tabla */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border sunmi-border">
          <SunmiTable
            headers={["#", "Proveedor", "Depósito", "Items", "Estado", "Creado", "Acciones"]}
          >
            {loading ? (
              <SunmiTableEmpty label="Cargando..." />
            ) : items.length === 0 ? (
              <SunmiTableEmpty label="Sin pedidos" />
            ) : (
              items.map((item) => (
                <SunmiTableRow key={item.id}>
                  <td className="px-3 py-2 font-mono text-xs">#{item.id}</td>
                  <td className="px-3 py-2">{item.proveedorNombre}</td>
                  <td className="px-3 py-2">{item.depositoNombre}</td>
                  <td className="px-3 py-2 text-center">{item.cantItems}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${estadoBadgeClass(item.estado)}`}>
                      {estadoLabel(item.estado)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatFecha(item.createdAt)}</td>
                  <td className="px-3 py-2">{accionPedido(item)}</td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        </div>

        {/* MOBILE: cards */}
        <div className="md:hidden flex flex-col gap-2">
          {loading ? (
            <p className="text-xs sunmi-text-muted italic px-1">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="text-xs sunmi-text-muted italic px-1">Sin pedidos</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border sunmi-border p-3 sunmi-surface flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium sunmi-text-strong truncate">
                    {item.proveedorNombre}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${estadoBadgeClass(item.estado)}`}>
                    {estadoLabel(item.estado)}
                  </span>
                </div>
                <div className="text-[12px] sunmi-text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="font-mono">#{item.id}</span>
                  <span>{item.depositoNombre}</span>
                  <span>{item.cantItems} ítems</span>
                  <span>{formatFecha(item.createdAt)}</span>
                </div>
                <div className="flex justify-end">{accionPedido(item)}</div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-between pt-4 px-2">
          <SunmiButton color="slate" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            « Anterior
          </SunmiButton>
          <span className="sunmi-text-muted text-sm self-center">
            Página {page} de {totalPages || 1}
          </span>
          <SunmiButton
            color="slate"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente »
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
