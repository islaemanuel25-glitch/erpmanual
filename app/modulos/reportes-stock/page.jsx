"use client";

import { useState, useEffect, useMemo } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { Search } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

function fmtMonto(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCant(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Number.isInteger(v)) return v.toLocaleString("es-AR");
  return v.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

export default function ReportesStockPage() {
  const { perfil, cargando } = useUser();

  // Catálogos
  const [locales, setLocales] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [proveedores, setProveedores] = useState([]);

  // Filtros
  const [localId, setLocalId] = useState("");
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [estadoStock, setEstadoStock] = useState("todos");

  // Datos
  const [resumen, setResumen] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes("stock.ver");

  // Cargar catálogos al montar
  useEffect(() => {
    let cancelado = false;
    const load = async () => {
      try {
        const [locRes, catRes, provRes] = await Promise.all([
          fetch("/api/locales/opciones", { credentials: "include" }),
          fetch("/api/catalogos/categorias", { credentials: "include" }),
          fetch("/api/catalogos/proveedores", { credentials: "include" }),
        ]);
        const [locJson, catJson, provJson] = await Promise.all([
          locRes.ok ? locRes.json() : { items: [] },
          catRes.ok ? catRes.json() : { items: [] },
          provRes.ok ? provRes.json() : { items: [] },
        ]);
        if (cancelado) return;
        const locsArr = locJson.items || [];
        setLocales(locsArr);
        setCategorias(catJson.items || []);
        setProveedores(provJson.items || []);

        // Pre-seleccionar local del usuario, o el primero disponible.
        if (perfil?.localId) {
          setLocalId(String(perfil.localId));
        } else if (locsArr.length > 0) {
          setLocalId(String(locsArr[0].id));
        }
      } catch {
        // Silenciar: el usuario igual puede usar la UI con catálogos vacíos.
      }
    };
    if (perfil) load();
    return () => {
      cancelado = true;
    };
  }, [perfil]);

  // Cargar reporte cada vez que cambia un filtro
  useEffect(() => {
    if (!puede) return;
    if (!localId) return;

    let cancelado = false;
    const cargar = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ localId });
        if (q.trim()) qs.set("q", q.trim());
        if (categoria) qs.set("categoria", categoria);
        if (proveedor) qs.set("proveedor", proveedor);
        if (estadoStock && estadoStock !== "todos") {
          qs.set("estadoStock", estadoStock);
        }
        const res = await fetch(`/api/reportes-stock/valorizado?${qs}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (cancelado) return;
        if (data.ok) {
          setResumen(data.resumen);
          setItems(data.items || []);
        } else {
          setResumen(null);
          setItems([]);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    cargar();
    return () => {
      cancelado = true;
    };
  }, [puede, localId, q, categoria, proveedor, estadoStock]);

  const exportarExcel = () => {
    if (!localId) return;
    const qs = new URLSearchParams({ localId });
    if (q.trim()) qs.set("q", q.trim());
    if (categoria) qs.set("categoria", categoria);
    if (proveedor) qs.set("proveedor", proveedor);
    if (estadoStock && estadoStock !== "todos") qs.set("estadoStock", estadoStock);
    window.open(`/api/reportes-stock/valorizado/exportar-excel?${qs}`, "_blank");
  };

  const limpiar = () => {
    setQ("");
    setCategoria("");
    setProveedor("");
    setEstadoStock("todos");
  };

  const localNombre = useMemo(() => {
    const l = locales.find((x) => String(x.id) === String(localId));
    return l?.nombre || "";
  }, [locales, localId]);

  if (cargando) return null;
  if (!perfil) return null;
  if (!puede) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <SunmiHeader title="Stock Valorizado" />
          <SunmiButton
            color="cyan"
            disabled={!localId || loading}
            onClick={exportarExcel}
          >
            Exportar Excel
          </SunmiButton>
        </div>

        {/* Filtros */}
        <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
          <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
            <h3 className="text-[13px] font-semibold sunmi-text-strong">
              Filtros
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs sunmi-text-muted mb-1">Local</label>
              {esAdmin ? (
                <SunmiSelectAdv
                  value={localId}
                  onChange={setLocalId}
                  searchable
                  placeholder="Seleccionar local..."
                >
                  {locales.map((l) => (
                    <SunmiSelectOption key={l.id} value={String(l.id)}>
                      {l.nombre}
                      {l.esDeposito ? " (depósito)" : ""}
                    </SunmiSelectOption>
                  ))}
                </SunmiSelectAdv>
              ) : (
                <div className="px-3 py-1.5 rounded-md sunmi-control text-[13px] sunmi-text-strong">
                  {localNombre || "—"}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs sunmi-text-muted mb-1">
                Categoría
              </label>
              <SunmiSelectAdv
                value={categoria}
                onChange={setCategoria}
                searchable
                placeholder="Todas..."
              >
                <SunmiSelectOption value="">Todas</SunmiSelectOption>
                {categorias.map((c) => (
                  <SunmiSelectOption key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </div>

            <div>
              <label className="block text-xs sunmi-text-muted mb-1">
                Proveedor
              </label>
              <SunmiSelectAdv
                value={proveedor}
                onChange={setProveedor}
                searchable
                placeholder="Todos..."
              >
                <SunmiSelectOption value="">Todos</SunmiSelectOption>
                {proveedores.map((p) => (
                  <SunmiSelectOption key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </div>

            <div>
              <label className="block text-xs sunmi-text-muted mb-1">
                Estado stock
              </label>
              <SunmiSelectAdv value={estadoStock} onChange={setEstadoStock}>
                <SunmiSelectOption value="todos">Todos</SunmiSelectOption>
                <SunmiSelectOption value="conStock">Con stock</SunmiSelectOption>
                <SunmiSelectOption value="sinStock">Sin stock</SunmiSelectOption>
                <SunmiSelectOption value="negativo">Negativo</SunmiSelectOption>
              </SunmiSelectAdv>
            </div>

            <div>
              <label className="block text-xs sunmi-text-muted mb-1">Buscar</label>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                  style={{ color: "var(--pos-link)" }}
                />
                <SunmiInput
                  placeholder="Producto o código..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="!pl-9 !border-2 pulse-neon"
                  style={{ borderColor: "var(--pos-link)" }}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <SunmiButton
              color="slate"
              className="!border !border-[var(--pos-link)]"
              onClick={limpiar}
            >
              Limpiar
            </SunmiButton>
          </div>
        </SunmiPanel>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Kpi titulo="Stock al costo" valor={`$${fmtMonto(resumen?.totalCosto || 0)}`} />
          <Kpi titulo="Stock a venta" valor={`$${fmtMonto(resumen?.totalVenta || 0)}`} />
          <Kpi
            titulo="Ganancia potencial"
            valor={`$${fmtMonto(resumen?.gananciaPotencial || 0)}`}
            destacar={(resumen?.gananciaPotencial || 0) >= 0 ? "success" : "danger"}
          />
          <Kpi titulo="Productos" valor={fmtCant(resumen?.cantidadProductos || 0)} />
          <Kpi titulo="Unidades" valor={fmtCant(resumen?.unidadesTotales || 0)} />
        </div>

        {/* Tabla detalle */}
        <SunmiSeparator label="Detalle" className="my-4" />

        <div className="overflow-x-auto rounded-2xl border sunmi-border">
          <SunmiTable
            headers={[
              "Producto",
              "Código",
              "Local",
              "Categoría",
              "Proveedor",
              "Stock",
              "Costo",
              "Venta",
              "Valor costo",
              "Valor venta",
              "Ganancia",
              "Obs.",
            ]}
          >
            {loading ? (
              <SunmiTableEmpty label="Cargando..." />
            ) : !localId ? (
              <SunmiTableEmpty label="Elegí un local" />
            ) : items.length === 0 ? (
              <SunmiTableEmpty label="Sin productos para los filtros aplicados" />
            ) : (
              items.map((it) => (
                <SunmiTableRow
                  key={`${it.localId}-${it.productoLocalId}`}
                >
                  <td className="px-3 py-1.5 text-sm">{it.productoNombre}</td>
                  <td className="px-3 py-1.5 text-xs sunmi-text-muted">
                    {it.codigoBarra || "-"}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{it.localNombre}</td>
                  <td className="px-3 py-1.5 text-xs">{it.categoriaNombre || "-"}</td>
                  <td className="px-3 py-1.5 text-xs">{it.proveedorNombre || "-"}</td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono">
                    {fmtCant(it.cantidad)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono">
                    ${fmtMonto(it.precioCostoUnitario)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono">
                    ${fmtMonto(it.precioVentaUnitario)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono font-medium">
                    ${fmtMonto(it.valorCosto)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono font-medium">
                    ${fmtMonto(it.valorVenta)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-xs text-right font-mono font-medium ${
                      it.gananciaPotencial >= 0
                        ? "sunmi-text-success"
                        : "sunmi-text-danger"
                    }`}
                  >
                    ${fmtMonto(it.gananciaPotencial)}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] sunmi-text-muted">
                    {it.observacion}
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

function Kpi({ titulo, valor, destacar }) {
  const valueClass =
    destacar === "success"
      ? "sunmi-text-success"
      : destacar === "danger"
      ? "sunmi-text-danger"
      : "sunmi-text-strong";

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: "var(--pos-link)" }}
    >
      <div className="text-[11px] sunmi-text-muted">{titulo}</div>
      <div className={`text-lg font-bold ${valueClass}`}>{valor}</div>
    </div>
  );
}
