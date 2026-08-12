"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import FiltrosProductos from "@/components/productos/FiltrosProductos";
import ColumnManager from "@/components/productos/ColumnManager";
import {
  MAX_CODIGO_BARRA,
  alEscribirCodigoBarra,
  paraMostrarCodigoBarra,
} from "@/lib/productos/codigoBarra";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const PAGE_SIZES = [25, 50, 100];
const LOCKED_COLS = ["nombre"];

const ALL_COLUMNS = [
  { key: "nombre", label: "Nombre" },
  { key: "codigoBarra", label: "Código barra" },
  { key: "sku", label: "SKU" },
  { key: "categoriaId", label: "Categoría" },
  { key: "proveedorId", label: "Proveedor" },
  { key: "areaFisicaId", label: "Área física" },
  { key: "unidadMedida", label: "Unidad" },
  { key: "factorPack", label: "Factor pack" },
  { key: "precioCosto", label: "Costo" },
  { key: "precioVenta", label: "Venta" },
  { key: "margen", label: "Margen %" },
  { key: "activo", label: "Estado" },
  { key: "modoPedido", label: "Modo pedido" },
  { key: "modoCompraProveedor", label: "Compra prov." },
];

const DEFAULT_VISIBLE = [
  "nombre",
  "categoriaId",
  "proveedorId",
  "areaFisicaId",
  "unidadMedida",
  "factorPack",
  "activo",
];

const UNIDAD_OPCIONES = [
  { value: "unidad", label: "Unidad" },
  { value: "kg", label: "Kg" },
  { value: "pack", label: "Pack" },
  { value: "cajon", label: "Cajón" },
];

const MODO_PEDIDO_OPCIONES = [
  { value: "BULTO", label: "Bulto" },
  { value: "UNIDAD", label: "Unidad" },
];

const MODO_COMPRA_OPCIONES = [
  { value: "BULTO", label: "Bulto" },
  { value: "UNIDAD", label: "Unidad (fiambre)" },
];

// ---------------------------------------------------------------------------
// Helper: camelCase UI → snake_case payload para PUT
// ---------------------------------------------------------------------------
function uiToPayload(row) {
  return {
    nombre: row.nombre ?? null,
    descripcion: row.descripcion ?? null,
    sku: row.sku ?? null,
    codigo_barra: row.codigoBarra ?? null,

    categoria_id: row.categoriaId ?? null,
    proveedor_id: row.proveedorId ?? null,
    proveedor2_id: row.proveedor2Id ?? null,
    proveedor3_id: row.proveedor3Id ?? null,
    area_fisica_id: row.areaFisicaId ?? null,

    unidad_medida: row.unidadMedida ?? "unidad",
    factor_pack: row.factorPack ?? null,
    modo_pedido: row.modoPedido ?? "BULTO",

    peso_kg: row.pesoKg ?? null,
    volumen_ml: row.volumenMl ?? null,

    precio_costo: row.precioCosto ?? null,
    precio_venta: row.precioVenta ?? null,
    margen: row.margen ?? null,

    precio_sugerido: row.precioSugerido ?? null,
    iva_porcentaje: row.ivaPorcentaje ?? null,
    fecha_vencimiento: row.fechaVencimiento ?? null,

    redondeo_100: row.redondeo100 ?? true,
    activo: row.activo ?? true,

    imagen_url: row.imagenUrl ?? null,
    es_combo: row.esCombo ?? false,

    modoCompraProveedor: row.modoCompraProveedor ?? "BULTO",
  };
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function EdicionRapidaPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeVer = esAdmin || permisos.includes("productos.ver");
  const puedeEditar = esAdmin || permisos.includes("productos.editar");

  const localId = contexto?.localId || 0;
  const esDeposito = contexto?.esDeposito === true;

  // ¿Se puede editar el COSTO de esta fila desde la ubicación actual?
  // Desde el depósito: sí (solo ve productos de depósito). Desde un local: solo
  // sus productos exclusivos (creadoEnLocalId === local actual); los del depósito
  // son solo-lectura. Espeja la regla del backend (puedeEditarCosto), que sigue
  // siendo la fuente de verdad.
  const puedeEditarCostoRow = useCallback(
    (row) => {
      if (esDeposito) return true;
      return row?.creadoEnLocalId != null && Number(row.creadoEnLocalId) === Number(localId);
    },
    [esDeposito, localId]
  );

  // =========================================================
  // Estado listado
  // =========================================================
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortKey, setSortKey] = useState("nombre");
  const [sortDir, setSortDir] = useState("asc");

  const [filtros, setFiltros] = useState({
    search: "",
    categoria: "",
    proveedor: "",
    area: "",
    estado: "activos",
  });
  const [incompletos, setIncompletos] = useState(false);

  // =========================================================
  // Catálogos
  // =========================================================
  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });

  useEffect(() => {
    const cargar = async () => {
      try {
        const [catRes, provRes, areaRes] = await Promise.all([
          fetch("/api/catalogos/categorias", { credentials: "include" }),
          fetch("/api/catalogos/proveedores", { credentials: "include" }),
          fetch("/api/catalogos/areas-fisicas", { credentials: "include" }),
        ]);
        if (catRes.status === 401) { router.replace("/login"); return; }
        const [cat, prov, area] = await Promise.all([
          catRes.json(), provRes.json(), areaRes.json(),
        ]);
        setCatalogos({
          CATEGORIAS: cat.items ?? [],
          PROVEEDORES: prov.items ?? [],
          AREAS: area.items ?? [],
        });
      } catch (err) {
        console.error("Error cargando catálogos:", err);
      }
    };
    cargar();
  }, []);

  // =========================================================
  // Columnas configurables
  // =========================================================
  const [visibleCols, setVisibleCols] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("productosEdicionRapidaCols");
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const k of LOCKED_COLS) {
          if (!parsed.includes(k)) parsed.unshift(k);
        }
        return parsed;
      }
    }
    return DEFAULT_VISIBLE;
  });

  const handleVisibleColsChange = (next) => {
    for (const k of LOCKED_COLS) {
      if (!next.includes(k)) next.unshift(k);
    }
    setVisibleCols(next);
  };

  useEffect(() => {
    localStorage.setItem("productosEdicionRapidaCols", JSON.stringify(visibleCols));
  }, [visibleCols]);

  // =========================================================
  // Selección múltiple
  // =========================================================
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Limpiar selección al cambiar de página
  useEffect(() => {
    setSelectedRows(new Set());
  }, [page, pageSize]);

  const allSelected = rows.length > 0 && rows.every((r) => selectedRows.has(r.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // =========================================================
  // Acciones masivas
  // =========================================================
  const [bulkProveedor, setBulkProveedor] = useState("");
  const [bulkCategoria, setBulkCategoria] = useState("");
  const [bulkArea, setBulkArea] = useState("");

  const applyBulk = (field, value) => {
    if (!value) return;
    const numVal = Number(value);
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of selectedRows) {
        next[id] = { ...(next[id] || {}), [field]: numVal };
      }
      return next;
    });
    setRowStatus((prev) => {
      const next = { ...prev };
      for (const id of selectedRows) {
        next[id] = "idle";
      }
      return next;
    });
  };

  // =========================================================
  // Ediciones y estados de filas
  // =========================================================
  // edits: Map<productoId, {field: value, ...}>
  const [edits, setEdits] = useState({});
  // rowStatus: Map<productoId, "idle"|"saving"|"saved"|"error">
  const [rowStatus, setRowStatus] = useState({});

  // Limpiar edits cuando cambian las filas
  useEffect(() => {
    setEdits({});
    setRowStatus({});
  }, [rows]);

  const setFieldEdit = useCallback((id, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
    setRowStatus((prev) => ({ ...prev, [id]: "idle" }));
  }, []);

  const editedIds = useMemo(
    () => Object.keys(edits).filter((id) => Object.keys(edits[id]).length > 0),
    [edits]
  );

  // =========================================================
  // Fetch productos
  // =========================================================
  const fetchProductos = useCallback(async () => {
    if (!localId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        pageSize,
        sortKey,
        sortDir,
        q: filtros.search,
        categoriaId: filtros.categoria,
        proveedorId: filtros.proveedor,
        areaFisicaId: filtros.area,
        estado: filtros.estado || "activos",
        localId: String(localId),
        ...(incompletos ? { incompletos: "true" } : {}),
      });
      const res = await fetch(`/api/productos/listar?${params.toString()}`, {
        credentials: "include",
      });
      if (res.status === 401) { router.replace("/login"); return; }
      const data = await res.json();
      if (data.ok) {
        setRows(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total);
      }
    } catch (err) {
      console.error("Error cargando productos:", err);
    }
    setLoading(false);
  }, [page, pageSize, sortKey, sortDir, filtros, localId, incompletos]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // =========================================================
  // Guardar fila
  // =========================================================
  const handleSaveRow = async (row) => {
    const id = row.id;
    const changes = edits[id];
    if (!changes || Object.keys(changes).length === 0) return;

    setRowStatus((prev) => ({ ...prev, [id]: "saving" }));

    // Merge row original + edits
    const merged = { ...row, ...changes };
    const payload = uiToPayload(merged);

    // Costo administrado por el depósito (producto de depósito desde un local):
    // no enviar precio_costo. El backend igual lo bloquea (fuente de verdad).
    if (!puedeEditarCostoRow(row)) delete payload.precio_costo;

    try {
      const res = await fetch(
        `/api/productos/editar/${id}?localId=${localId}`,
        {
          credentials: "include",
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (res.status === 401) { router.replace("/login"); return; }
      const data = await res.json();
      if (data.ok) {
        setRowStatus((prev) => ({ ...prev, [id]: "saved" }));
        setEdits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Actualizar la fila en el estado local con los datos del server
        if (data.item) {
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, ...data.item } : r))
          );
        }
        // Limpiar "saved" después de 2 segundos
        setTimeout(() => {
          setRowStatus((prev) => {
            if (prev[id] === "saved") return { ...prev, [id]: "idle" };
            return prev;
          });
        }, 2000);
      } else {
        setRowStatus((prev) => ({ ...prev, [id]: "error" }));
        console.error("Error guardando:", data.error);
      }
    } catch (err) {
      console.error("Error guardando producto:", err);
      setRowStatus((prev) => ({ ...prev, [id]: "error" }));
    }
  };

  // =========================================================
  // Guardar filas seleccionadas (cola secuencial)
  // =========================================================
  const [bulkSaving, setBulkSaving] = useState(false);

  const handleSaveSelected = async () => {
    const idsToSave = [...selectedRows].filter(
      (id) => edits[id] && Object.keys(edits[id]).length > 0
    );
    if (idsToSave.length === 0) return;

    setBulkSaving(true);

    for (const id of idsToSave) {
      const row = rows.find((r) => r.id === Number(id) || r.id === id);
      if (!row) continue;
      await handleSaveRow(row);
    }

    setBulkSaving(false);
  };

  // =========================================================
  // Navegacion Enter/Tab vertical (SunmiInput)
  // =========================================================
  const handleCellKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    if (e.key === "Tab" && e.shiftKey) return; // Shift+Tab = navegación natural
    e.preventDefault();
    const row = Number(e.target.dataset.row);
    const col = e.target.dataset.col;
    if (!col) return;
    const nextRow = e.key === "Enter" && e.shiftKey ? row - 1 : row + 1;
    const next = document.querySelector(
      `input[data-row="${nextRow}"][data-col="${col}"]`
    );
    if (next) { next.focus(); next.select(); }
  };

  // =========================================================
  // Navegacion vertical para SunmiSelectAdv (onClose)
  // =========================================================
  const handleSelectClose = useCallback((rowIdx, colKey) => {
    const nextRow = rowIdx + 1;
    const wrapper = document.querySelector(
      `[data-row="${nextRow}"][data-col="${colKey}"] button`
    );
    if (wrapper) {
      setTimeout(() => wrapper.focus(), 0);
    }
  }, []);

  // =========================================================
  // Row style por estado
  // =========================================================
  // El estado de la fila se dice con el tono de SunmiTableRow, no con una clase
  // que le gane al hover. Antes hacían falta tres `!important` y la fila teñida
  // dejaba de responder al mouse; ahora el hover se compone encima del tono y
  // los colores salen del theme en vez de estar escritos a mano.
  const getRowTono = (id) => {
    const s = rowStatus[id];
    const hasE = edits[id] && Object.keys(edits[id]).length > 0;
    if (s === "saving") return "apagado";
    if (s === "saved") return "ok";
    if (s === "error") return "alerta";
    if (hasE) return "atencion";
    return null;
  };

  /** Lo que no es tono: la barra lateral de la fila con cambios sin guardar. */
  const getRowClassName = (id) => {
    const hasE = edits[id] && Object.keys(edits[id]).length > 0;
    const s = rowStatus[id];
    return hasE && s !== "saving" && s !== "saved" && s !== "error"
      ? "border-l-2 border-l-[var(--pos-accent)]"
      : "";
  };

  // =========================================================
  // Render helpers
  // =========================================================
  const getRowValue = (row, field) => {
    const changes = edits[row.id];
    if (changes && field in changes) return changes[field];
    return row[field];
  };

  const renderCell = (row, colKey, rowIdx) => {
    const val = getRowValue(row, colKey);
    const isEditable = puedeEditar;

    switch (colKey) {
      case "nombre":
        return (
          <span className="truncate block max-w-[220px]" title={row.nombre}>
            {row.nombre}
            {row.modoCompraProveedor === "UNIDAD" && (
              <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-red-600 text-white leading-none align-middle">
                Fiambre
              </span>
            )}
          </span>
        );

      case "categoriaId":
        if (!isEditable) return catalogos.CATEGORIAS.find((c) => c.id === val)?.nombre || "—";
        return (
          <SunmiSelectAdv
            value={val != null ? String(val) : ""}
            onChange={(v) => setFieldEdit(row.id, "categoriaId", v ? Number(v) : null)}
            searchable
            data-row={rowIdx}
            data-col="categoriaId"
            onClose={() => handleSelectClose(rowIdx, "categoriaId")}
          >
            <option value="">—</option>
            {catalogos.CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </SunmiSelectAdv>
        );

      case "proveedorId":
        if (!isEditable) return catalogos.PROVEEDORES.find((p) => p.id === val)?.nombre || "—";
        return (
          <SunmiSelectAdv
            value={val != null ? String(val) : ""}
            onChange={(v) => setFieldEdit(row.id, "proveedorId", v ? Number(v) : null)}
            searchable
            data-row={rowIdx}
            data-col="proveedorId"
            onClose={() => handleSelectClose(rowIdx, "proveedorId")}
          >
            <option value="">—</option>
            {catalogos.PROVEEDORES.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </SunmiSelectAdv>
        );

      case "areaFisicaId":
        if (!isEditable) return catalogos.AREAS.find((a) => a.id === val)?.nombre || "—";
        return (
          <SunmiSelectAdv
            value={val != null ? String(val) : ""}
            onChange={(v) => setFieldEdit(row.id, "areaFisicaId", v ? Number(v) : null)}
            searchable
            data-row={rowIdx}
            data-col="areaFisicaId"
            onClose={() => handleSelectClose(rowIdx, "areaFisicaId")}
          >
            <option value="">—</option>
            {catalogos.AREAS.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </SunmiSelectAdv>
        );

      case "unidadMedida":
        if (!isEditable) return val || "—";
        return (
          <SunmiSelectAdv
            value={val || ""}
            onChange={(v) => setFieldEdit(row.id, "unidadMedida", v)}
            data-row={rowIdx}
            data-col="unidadMedida"
            onClose={() => handleSelectClose(rowIdx, "unidadMedida")}
          >
            {UNIDAD_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SunmiSelectAdv>
        );

      case "factorPack":
        if (!isEditable) return val ?? "—";
        return (
          <SunmiInput
            type="number"
            min="1"
            step="1"
            value={val ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setFieldEdit(row.id, "factorPack", v === "" ? null : Number(v));
            }}
            onKeyDown={handleCellKeyDown}
            data-row={rowIdx}
            data-col="factorPack"
            className="text-right w-20"
          />
        );

      case "activo":
        if (!isEditable) return val ? "Activo" : "Inactivo";
        return (
          <SunmiSelectAdv
            value={val ? "true" : "false"}
            onChange={(v) => setFieldEdit(row.id, "activo", v === "true")}
            data-row={rowIdx}
            data-col="activo"
            onClose={() => handleSelectClose(rowIdx, "activo")}
          >
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </SunmiSelectAdv>
        );

      case "codigoBarra":
        if (!isEditable) return val || "—";
        return (
          <SunmiInput
            type="text"
            value={paraMostrarCodigoBarra(val)}
            maxLength={MAX_CODIGO_BARRA}
            onChange={(e) => setFieldEdit(row.id, "codigoBarra", alEscribirCodigoBarra(e.target.value, val ?? ""))}
            onKeyDown={handleCellKeyDown}
            data-row={rowIdx}
            data-col="codigoBarra"
            // 160 px, no 176. Los 176 estaban dimensionados para "LIVRA POMELO
            // 1.5 GAS", 20 caracteres, que era el peor valor real cuando no había
            // tope. Con el tope en 16 ya no puede entrar nada así.
            //
            // Medido con la sonda sobre el ancho de 16 caracteres: 16 dígitos
            // piden 144 px, y el valor de 16 caracteres más ancho que existe hoy
            // en producción —"ESCOBILLON CURVO", mayúsculas con espacio— pide
            // 160. Se toma ese.
            //
            // Los 16 códigos viejos de más de 16 caracteres siguen guardados y se
            // siguen viendo: los de 17 y 18 se leen enteros, y los tres de 20 se
            // cortan en pantalla pero NO se tocan ni se pierden al guardar.
            className="w-[160px]"
          />
        );

      case "sku":
        if (!isEditable) return val || "—";
        return (
          <SunmiInput
            type="text"
            value={val ?? ""}
            onChange={(e) => setFieldEdit(row.id, "sku", e.target.value)}
            onKeyDown={handleCellKeyDown}
            data-row={rowIdx}
            data-col="sku"
            // `w-28` son 98 px y el SKU más largo de producción es un EAN-13
            // —"7790639003536"—, que necesita 120.
            className="w-[120px]"
          />
        );

      case "precioCosto": {
        // Costo administrado por el depósito: solo-lectura desde un local.
        const costoBloqueado = !puedeEditarCostoRow(row);
        if (!isEditable || costoBloqueado) {
          const display = val == null ? "—" : `$ ${Number(val).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
          return (
            <span
              className="inline-flex items-center gap-1 justify-end w-24 sunmi-text-muted"
              title={costoBloqueado ? "Costo administrado por el depósito" : undefined}
            >
              {display}
              {costoBloqueado && <span className="text-[9px]" aria-hidden>🔒</span>}
            </span>
          );
        }
        return (
          <SunmiInput
            type="number"
            step="0.01"
            value={val ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setFieldEdit(row.id, colKey, v === "" ? null : Number(v));
            }}
            onKeyDown={handleCellKeyDown}
            data-row={rowIdx}
            data-col={colKey}
            className="text-right w-24"
          />
        );
      }

      case "precioVenta":
      case "margen":
        if (!isEditable) {
          if (val == null) return "—";
          return colKey === "margen"
            ? `${Number(val).toFixed(1)}%`
            : `$ ${Number(val).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
        }
        return (
          <SunmiInput
            type="number"
            step="0.01"
            value={val ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setFieldEdit(row.id, colKey, v === "" ? null : Number(v));
            }}
            onKeyDown={handleCellKeyDown}
            data-row={rowIdx}
            data-col={colKey}
            className="text-right w-24"
          />
        );

      case "modoPedido":
        if (!isEditable) return val || "—";
        return (
          <SunmiSelectAdv
            value={val || "BULTO"}
            onChange={(v) => setFieldEdit(row.id, "modoPedido", v)}
            data-row={rowIdx}
            data-col="modoPedido"
            onClose={() => handleSelectClose(rowIdx, "modoPedido")}
          >
            {MODO_PEDIDO_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SunmiSelectAdv>
        );

      case "modoCompraProveedor":
        if (!isEditable) return val || "—";
        return (
          <SunmiSelectAdv
            value={val || "BULTO"}
            onChange={(v) => setFieldEdit(row.id, "modoCompraProveedor", v)}
            data-row={rowIdx}
            data-col="modoCompraProveedor"
            onClose={() => handleSelectClose(rowIdx, "modoCompraProveedor")}
          >
            {MODO_COMPRA_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SunmiSelectAdv>
        );

      default:
        return val ?? "—";
    }
  };

  // =========================================================
  // Status indicator
  // =========================================================
  const statusIndicator = (id) => {
    const s = rowStatus[id];
    const hasEdits = edits[id] && Object.keys(edits[id]).length > 0;
    if (s === "saving") return <span className="text-[10px] text-amber-400 animate-pulse">Guardando...</span>;
    if (s === "saved") return <span className="text-[10px] text-emerald-400">Guardado</span>;
    if (s === "error") return <span className="text-[10px] text-red-400">Error</span>;
    if (hasEdits) return <span className="text-amber-400">●</span>;
    return null;
  };

  // =========================================================
  // Render
  // =========================================================
  if (cargandoUser || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }
  if (!puedeVer) return <SinPermisos />;

  const activeColumns = ALL_COLUMNS.filter((c) => visibleCols.includes(c.key));

  const checkboxHeader = puedeEditar ? (
    <input
      type="checkbox"
      checked={allSelected}
      onChange={toggleSelectAll}
      className="accent-amber-500 cursor-pointer"
      title="Seleccionar todos"
    />
  ) : null;

  const headers = [
    ...(puedeEditar ? [checkboxHeader] : []),
    ...activeColumns.map((c) => c.label),
    ...(puedeEditar ? [""] : []),
  ];

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-sm md:text-base font-semibold">
              Edición rápida de productos
            </h1>
            <div className="flex items-center gap-2">
              <ColumnManager
                allColumns={ALL_COLUMNS}
                visibleKeys={visibleCols}
                onChange={handleVisibleColsChange}
                lockedKeys={LOCKED_COLS}
              />
              <SunmiBackButton href="/modulos/productos" />
            </div>
          </div>

          {/* Filtros */}
          <FiltrosProductos
            initial={filtros}
            catalogos={catalogos}
            onChange={(f) => {
              const changed =
                f.search !== filtros.search ||
                f.categoria !== filtros.categoria ||
                f.proveedor !== filtros.proveedor ||
                f.area !== filtros.area ||
                f.estado !== filtros.estado;
              if (changed) {
                setPage(1);
                setFiltros(f);
              }
            }}
          />

          {/* Toggle faltantes críticos */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setIncompletos((v) => !v); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-[12px] font-medium transition border ${
                incompletos
                  ? "border-amber-500 bg-amber-500/10 text-amber-400"
                  : "border-[var(--app-border)] sunmi-text-muted hover:text-[var(--app-fg)]"
              }`}
            >
              {incompletos ? "✕ Faltantes críticos" : "Solo con faltantes críticos"}
            </button>
            {incompletos && (
              <span className="text-[11px] sunmi-text-muted">
                Proveedor, categoría, área física o factor pack sin completar
              </span>
            )}
          </div>

          {/* Toolbar acciones masivas */}
          {puedeEditar && selectedRows.size > 0 && (
            <div className="rounded-xl p-3 border border-[var(--app-border)] bg-[var(--app-input-bg)] flex flex-col md:flex-row md:items-end gap-3">
              <span className="text-xs sunmi-text-muted shrink-0 self-center">
                {selectedRows.size} seleccionado{selectedRows.size > 1 ? "s" : ""}
              </span>
              {(() => {
                const count = [...selectedRows].filter(
                  (id) => edits[id] && Object.keys(edits[id]).length > 0
                ).length;
                return count > 0 ? (
                  <SunmiButton
                    color="primary"
                    className="!text-[11px] !px-3 !py-1 shrink-0 self-center"
                    disabled={bulkSaving}
                    onClick={handleSaveSelected}
                  >
                    {bulkSaving
                      ? "Guardando..."
                      : `Guardar seleccionadas (${count})`}
                  </SunmiButton>
                ) : null;
              })()}
              <div className="flex flex-col md:flex-row gap-2 flex-1">
                {/* Proveedor masivo */}
                <div className="flex items-center gap-1.5">
                  <SunmiSelectAdv
                    value={bulkProveedor}
                    onChange={setBulkProveedor}
                    placeholder="Proveedor..."
                    searchable
                    className="!w-44"
                  >
                    <SunmiSelectOption value="">—</SunmiSelectOption>
                    {catalogos.PROVEEDORES.map((p) => (
                      <SunmiSelectOption key={p.id} value={String(p.id)}>
                        {p.nombre}
                      </SunmiSelectOption>
                    ))}
                  </SunmiSelectAdv>
                  <SunmiButton
                    color="amber"
                    className="!text-[11px] !px-2 !py-1"
                    disabled={!bulkProveedor}
                    onClick={() => { applyBulk("proveedorId", bulkProveedor); setBulkProveedor(""); }}
                  >
                    Aplicar
                  </SunmiButton>
                </div>
                {/* Categoría masiva */}
                <div className="flex items-center gap-1.5">
                  <SunmiSelectAdv
                    value={bulkCategoria}
                    onChange={setBulkCategoria}
                    placeholder="Categoría..."
                    searchable
                    className="!w-44"
                  >
                    <SunmiSelectOption value="">—</SunmiSelectOption>
                    {catalogos.CATEGORIAS.map((c) => (
                      <SunmiSelectOption key={c.id} value={String(c.id)}>
                        {c.nombre}
                      </SunmiSelectOption>
                    ))}
                  </SunmiSelectAdv>
                  <SunmiButton
                    color="amber"
                    className="!text-[11px] !px-2 !py-1"
                    disabled={!bulkCategoria}
                    onClick={() => { applyBulk("categoriaId", bulkCategoria); setBulkCategoria(""); }}
                  >
                    Aplicar
                  </SunmiButton>
                </div>
                {/* Área física masiva */}
                <div className="flex items-center gap-1.5">
                  <SunmiSelectAdv
                    value={bulkArea}
                    onChange={setBulkArea}
                    placeholder="Área física..."
                    searchable
                    className="!w-44"
                  >
                    <SunmiSelectOption value="">—</SunmiSelectOption>
                    {catalogos.AREAS.map((a) => (
                      <SunmiSelectOption key={a.id} value={String(a.id)}>
                        {a.nombre}
                      </SunmiSelectOption>
                    ))}
                  </SunmiSelectAdv>
                  <SunmiButton
                    color="amber"
                    className="!text-[11px] !px-2 !py-1"
                    disabled={!bulkArea}
                    onClick={() => { applyBulk("areaFisicaId", bulkArea); setBulkArea(""); }}
                  >
                    Aplicar
                  </SunmiButton>
                </div>
              </div>
            </div>
          )}

          {/* Aviso: costo de productos del depósito es solo-lectura desde un local */}
          {puedeEditar && !esDeposito && (
            <p className="text-[11px] sunmi-text-muted flex items-center gap-1">
              <span aria-hidden>🔒</span>
              El costo de los productos del depósito es de solo lectura (lo administra el depósito). Podés editar el costo de los productos creados por este local.
            </p>
          )}

          {/* Tabla */}
          {loading ? (
            <SunmiLoader />
          ) : (
            <>
              <div className="overflow-x-auto">
                <SunmiTable headers={headers}>
                  {rows.length === 0 ? (
                    <SunmiTableRow>
                      <td
                        colSpan={headers.length}
                        className="px-3 py-4 text-center sunmi-text-muted text-sm"
                      >
                        No se encontraron productos.
                      </td>
                    </SunmiTableRow>
                  ) : (
                    rows.map((row, rowIdx) => {
                      const hasEdits = edits[row.id] && Object.keys(edits[row.id]).length > 0;
                      return (
                        <SunmiTableRow
                          key={row.id}
                          tono={getRowTono(row.id)}
                          className={getRowClassName(row.id)}
                        >
                          {puedeEditar && (
                            <td className="px-2 py-1 align-middle w-8">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(row.id)}
                                onChange={() => toggleSelectRow(row.id)}
                                className="accent-amber-500 cursor-pointer"
                              />
                            </td>
                          )}
                          {activeColumns.map((col) => (
                            <td
                              key={col.key}
                              className="px-2 py-1 align-middle"
                            >
                              {col.key === "nombre" ? (
                                <div className="flex items-center gap-1.5">
                                  {statusIndicator(row.id)}
                                  {renderCell(row, col.key, rowIdx)}
                                </div>
                              ) : (
                                renderCell(row, col.key, rowIdx)
                              )}
                            </td>
                          ))}
                          {puedeEditar && (
                            <td className="px-2 py-1 align-middle whitespace-nowrap">
                              {hasEdits && (
                                <SunmiButton
                                  color="amber"
                                  onClick={() => handleSaveRow(row)}
                                  disabled={rowStatus[row.id] === "saving"}
                                  className="!text-[11px] !px-2 !py-1"
                                >
                                  {rowStatus[row.id] === "saving" ? "..." : "Guardar"}
                                </SunmiButton>
                              )}
                            </td>
                          )}
                        </SunmiTableRow>
                      );
                    })
                  )}
                </SunmiTable>
              </div>

              {/* Paginacion */}
              <div className="flex items-center justify-between px-3 py-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <SunmiButton
                    color="slate"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    « Anterior
                  </SunmiButton>
                  <span className="sunmi-text-muted text-[11px]">
                    Página {page} / {totalPages}
                    {totalItems > 0 && (
                      <span className="ml-1 opacity-70">({totalItems} items)</span>
                    )}
                  </span>
                  <SunmiButton
                    color="slate"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente »
                  </SunmiButton>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="sunmi-text-muted text-[11px]">Mostrar</span>
                  {PAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => { setPageSize(size); setPage(1); }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                        pageSize === size ? "sunmi-badge-accent" : "sunmi-control"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
