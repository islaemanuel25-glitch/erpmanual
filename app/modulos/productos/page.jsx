"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import FiltrosProductos from "@/components/productos/FiltrosProductos";
import ColumnManager from "@/components/productos/ColumnManager";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import SunmiTablaProductos from "@/components/productos/SunmiTablaProductos";
import useContextoActivo from "@/hooks/useContextoActivo";

// =========================================================
// TABS
// =========================================================
const TABS = [
  { key: "listado", label: "Listado" },
  { key: "importexport", label: "Import / Export" },
];

export default function ProductosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil: perfilProd, cargando: cargandoProd } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const permisosProd = perfilProd?.permisos || [];
  const esAdminProd = Array.isArray(permisosProd) && permisosProd.includes("*");
  const puedeProd = esAdminProd || permisosProd.includes("productos.ver");

  const nuevo = searchParams.get("nuevo");
  const editarId = searchParams.get("editar");

  // =========================================================
  // TAB ACTIVO
  // =========================================================
  const [activeTab, setActiveTab] = useState("listado");

  // =========================================================
  // ESTADO LISTADO (existente)
  // =========================================================
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  const localId = contexto?.localId || 0;

  const [filtros, setFiltros] = useState({
    search: "",
    categoria: "",
    proveedor: "",
    area: "",
    activo: "",
  });

  const allColumns = [
    { key: "imagenUrl", label: "Imagen" },
    { key: "nombre", label: "Nombre" },
    { key: "codigoBarra", label: "Código barra" },
    { key: "sku", label: "SKU" },
    { key: "categoriaId", label: "Categoría" },
    { key: "proveedorId", label: "Proveedor" },
    { key: "areaFisicaId", label: "Área física" },
    { key: "unidadMedida", label: "Unidad" },
    { key: "factorPack", label: "Pack" },
    { key: "pesoKg", label: "Peso (kg)" },
    { key: "volumenMl", label: "Volumen (ml)" },
    { key: "precioCosto", label: "Costo" },
    { key: "precioVenta", label: "Venta" },
    { key: "margen", label: "Margen %" },
    { key: "ivaPorcentaje", label: "IVA %" },
    { key: "fechaVencimiento", label: "Vencimiento" },
    { key: "esCombo", label: "Combo" },
    { key: "activo", label: "Estado" },
  ];

  // "nombre" es obligatoria y no se puede ocultar
  const LOCKED_COLS = ["nombre"];

  const [visibleCols, setVisibleCols] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("productosCols");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Forzar columnas obligatorias
        for (const k of LOCKED_COLS) {
          if (!parsed.includes(k)) parsed.unshift(k);
        }
        return parsed;
      }
    }
    return allColumns.map((c) => c.key);
  });

  const handleVisibleColsChange = (next) => {
    // Nunca permitir quitar columnas obligatorias
    for (const k of LOCKED_COLS) {
      if (!next.includes(k)) next.unshift(k);
    }
    setVisibleCols(next);
  };

  useEffect(() => {
    localStorage.setItem("productosCols", JSON.stringify(visibleCols));
  }, [visibleCols]);

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadingEditar, setLoadingEditar] = useState(false);

  // =========================================================
  // ESTADO IMPORT/EXPORT
  // =========================================================
  // Export
  const [expProveedorId, setExpProveedorId] = useState("");
  const [expCategoriaId, setExpCategoriaId] = useState("");
  const [expLoading, setExpLoading] = useState(false);

  // Import
  const [impModo, setImpModo] = useState("crear_actualizar");
  const [impFile, setImpFile] = useState(null);
  const [impPreview, setImpPreview] = useState(null);
  const [impResumen, setImpResumen] = useState(null);
  const [impLoading, setImpLoading] = useState(false);
  const [impResultado, setImpResultado] = useState(null);
  const [impError, setImpError] = useState("");

  // =========================================================
  // FETCH CATALOGOS + LOCALES
  // =========================================================
  const fetchCatalogos = async () => {
    try {
      const [catRes, provRes, areaRes] = await Promise.all([
        fetch("/api/catalogos/categorias", { credentials: "include" }),
        fetch("/api/catalogos/proveedores", { credentials: "include" }),
        fetch("/api/catalogos/areas-fisicas", { credentials: "include" }),
      ]);

      if (catRes.status === 401 || provRes.status === 401 || areaRes.status === 401) {
        router.replace("/login");
        return;
      }

      const [cat, prov, area] = await Promise.all([
        catRes.json(),
        provRes.json(),
        areaRes.json(),
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

  const fetchProductos = async () => {
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
        activo: filtros.activo,
        localId: String(localId),
      });

      const res = await fetch(`/api/productos/listar?${params.toString()}`, {
        credentials: "include",
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

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
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  useEffect(() => {
    fetchProductos();
  }, [page, pageSize, sortKey, sortDir, filtros, localId]);

  useEffect(() => {
    if (nuevo === "1") {
      setEditing(null);
      setModalOpen(true);
      return;
    }

    if (editarId) {
      const idNum = Number(editarId);
      if (!idNum) return;

      const cargar = async () => {
        try {
          setLoadingEditar(true);
          const r = await fetch(
            `/api/productos/obtener?id=${idNum}&localId=${localId}`,
            { credentials: "include" }
          );

          if (r.status === 401) {
            router.replace("/login");
            return;
          }

          const data = await r.json();

          if (data.ok) {
            setEditing(data.item);
            setModalOpen(true);
          }
        } catch (err) {
          console.error("Error al editar:", err);
        } finally {
          setLoadingEditar(false);
        }
      };

      cargar();
      return;
    }

    setModalOpen(false);
    setEditing(null);
  }, [nuevo, editarId, localId]);

  const cerrarModal = () => {
    setModalOpen(false);
    setEditing(null);
    router.push("/modulos/productos");
  };

  const handleSubmit = async (form) => {
    try {
      const isEdit = Boolean(editing);

      const url = isEdit
        ? `/api/productos/editar/${editing.id}?localId=${localId}`
        : `/api/productos/crear?localId=${localId}`;

      const res = await fetch(url, {
        credentials: "include",
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error guardando producto");
        return;
      }

      cerrarModal();
      fetchProductos();
    } catch (err) {
      console.error("Error guardando producto:", err);
    }
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar producto?")) return;

    try {
      const r = await fetch(`/api/productos/eliminar/${id}`, {
        credentials: "include",
        method: "DELETE",
      });

      if (r.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await r.json();

      if (data.ok) fetchProductos();
      else alert(data.error || "Error eliminando producto");
    } catch (err) {
      console.error("Error eliminando:", err);
    }
  };

  const abrirNuevo = () => {
    router.push("/modulos/productos/nuevo");
  };

  const abrirActualizacionPrecios = () => {
    router.push("/modulos/productos/actualizacion-precios");
  };

  const abrirEditar = (id) => {
    if (!id || id === 0 || id === "0" || Number.isNaN(Number(id))) {
      alert("Error: ID de producto inválido");
      return;
    }
    router.push(`/modulos/productos/${Number(id)}/editar`);
  };

  // =========================================================
  // EXPORT: Descargar Excel
  // =========================================================
  const handleExport = async () => {
    setExpLoading(true);
    try {
      const res = await fetch("/api/productos/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: localId || null,
          proveedorId: expProveedorId ? Number(expProveedorId) : null,
          categoriaId: expCategoriaId ? Number(expCategoriaId) : null,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al exportar");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const hoy = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `productos_${hoy}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exportando:", err);
      alert("Error al exportar productos");
    }
    setExpLoading(false);
  };

  // =========================================================
  // IMPORT: Leer archivo Excel y hacer preview
  // =========================================================
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImpFile(file);
    setImpPreview(null);
    setImpResumen(null);
    setImpResultado(null);
    setImpError("");

    if (!localId) {
      setImpError("No hay contexto operativo activo");
      return;
    }

    setImpLoading(true);
    try {
      // Leer Excel
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (jsonData.length === 0) {
        setImpError("El archivo está vacío");
        setImpLoading(false);
        return;
      }

      // Validar columnas mínimas
      const cols = Object.keys(jsonData[0]);
      const requeridas = ["codigo_barra", "nombre", "precio_costo", "precio_venta"];
      const faltantes = requeridas.filter((r) => !cols.includes(r));
      if (faltantes.length > 0) {
        setImpError(`Columnas faltantes: ${faltantes.join(", ")}`);
        setImpLoading(false);
        return;
      }

      // Enviar al preview
      const res = await fetch("/api/productos/import/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: Number(localId),
          modo: impModo,
          productos: jsonData,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        setImpError(data.error || "Error en preview");
      } else {
        setImpPreview(data.items);
        setImpResumen(data.resumen);
      }
    } catch (err) {
      console.error("Error parseando archivo:", err);
      setImpError("Error al leer el archivo Excel");
    }
    setImpLoading(false);
  };

  // =========================================================
  // IMPORT: Confirmar importación
  // =========================================================
  const handleImportConfirm = async () => {
    if (!impPreview || !localId) return;

    // Filtrar solo crear y actualizar
    const productosValidos = impPreview.filter(
      (p) => p.accion === "crear" || p.accion === "actualizar"
    );

    if (productosValidos.length === 0) {
      setImpError("No hay productos válidos para importar");
      return;
    }

    setImpLoading(true);
    setImpResultado(null);
    try {
      const res = await fetch("/api/productos/import/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: Number(localId),
          modo: impModo,
          productos: productosValidos,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        setImpError(data.error || "Error al importar");
      } else {
        setImpResultado(data);
        setImpPreview(null);
        setImpResumen(null);
        setImpFile(null);
        // Refrescar productos
        fetchProductos();
      }
    } catch (err) {
      console.error("Error importando:", err);
      setImpError("Error al importar productos");
    }
    setImpLoading(false);
  };

  // Reset import
  const resetImport = () => {
    setImpFile(null);
    setImpPreview(null);
    setImpResumen(null);
    setImpResultado(null);
    setImpError("");
  };

  // Preview limitado a 50 filas
  const previewRows = useMemo(() => {
    if (!impPreview) return [];
    return impPreview.slice(0, 50);
  }, [impPreview]);

  // =========================================================
  // RENDER
  // =========================================================
  if (cargandoProd || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }
  if (!puedeProd) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-2">

          {/* =========================================================
              TABS
              ========================================================= */}
          <div className="flex gap-1 border-b border-slate-700 pb-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  px-4 py-1.5 rounded-t-md text-[13px] font-medium transition-all
                  ${activeTab === tab.key
                    ? "bg-amber-400 text-slate-900"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* =========================================================
              TAB: LISTADO (existente)
              ========================================================= */}
          {activeTab === "listado" && (
            <>
              {/* FILTROS */}
              <SunmiSeparator label="Filtros" className="!my-1" />

              <FiltrosProductos
                initial={filtros}
                catalogos={catalogos}
                onChange={(f) => {
                  setPage(1);
                  setFiltros(f);
                }}
              />

              {/* ACCIONES */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-2 w-full mt-1">
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <SunmiButton color="amber" onClick={abrirNuevo}>
                    + Nuevo producto
                  </SunmiButton>
                  <SunmiButton color="cyan" onClick={abrirActualizacionPrecios}>
                    Actualización de precios
                  </SunmiButton>
                </div>

                <ColumnManager
                  allColumns={allColumns}
                  visibleKeys={visibleCols}
                  onChange={handleVisibleColsChange}
                  lockedKeys={LOCKED_COLS}
                />
              </div>

              {/* LISTADO */}
              <SunmiSeparator label="Listado" className="!my-1" />

              <div className="overflow-x-auto w-full mt-1">
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <SunmiTablaProductos
                    rows={rows}
                    columns={allColumns.filter((c) =>
                      c.key === "nombre" ? true : visibleCols.includes(c.key)
                    )}
                    page={page}
                    pageSize={pageSize}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    onNext={() => setPage((p) => p + 1)}
                    onPrev={() => setPage((p) => Math.max(1, p - 1))}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(key) => {
                      if (key === sortKey) {
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      } else {
                        setSortKey(key);
                        setSortDir("asc");
                      }
                      setPage(1);
                    }}
                    onEditar={abrirEditar}
                    onEliminar={handleEliminar}
                    catalogos={catalogos}
                    loading={loading || loadingEditar}
                  />
                </div>
              </div>

              {(loading || loadingEditar) && (
                <SunmiLoader />
              )}
            </>
          )}

          {/* =========================================================
              TAB: IMPORT / EXPORT
              ========================================================= */}
          {activeTab === "importexport" && (
            <>
              {/* =====================================================
                  EXPORTAR
                  ===================================================== */}
              <SunmiSeparator label="Exportar productos" className="!my-1" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-1">
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Proveedor</label>
                  <SunmiSelectAdv
                    value={expProveedorId}
                    onChange={(val) => setExpProveedorId(val)}
                  >
                    <option value="">Todos</option>
                    {catalogos.PROVEEDORES.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </SunmiSelectAdv>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Categoría</label>
                  <SunmiSelectAdv
                    value={expCategoriaId}
                    onChange={(val) => setExpCategoriaId(val)}
                  >
                    <option value="">Todas</option>
                    {catalogos.CATEGORIAS.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </SunmiSelectAdv>
                </div>
              </div>

              <div className="flex px-1 mt-2">
                <SunmiButton
                  color="cyan"
                  onClick={handleExport}
                  disabled={expLoading}
                >
                  {expLoading ? "Exportando..." : "Descargar Excel"}
                </SunmiButton>
              </div>

              {/* =====================================================
                  IMPORTAR
                  ===================================================== */}
              <SunmiSeparator label="Importar productos" className="!my-2" />

              {/* Plantilla + Instructivo */}
              <div className="px-1 mt-1 mb-2">
                <a
                  href="/templates/import_productos.xlsx"
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[13px] font-semibold hover:bg-amber-500/30 transition"
                >
                  Descargar plantilla Excel
                </a>

                <details className="mt-3 rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
                  <summary className="px-3 py-2 cursor-pointer text-[13px] font-semibold text-cyan-400 hover:text-cyan-300 select-none">
                    Como preparar el Excel para importar productos
                  </summary>
                  <div className="px-3 pb-3 text-[12px] text-slate-300 leading-relaxed">
                    <p className="mt-2 mb-2 text-slate-400 font-medium">Columnas del archivo:</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-700">
                            <th className="py-1 pr-3">Columna</th>
                            <th className="py-1 pr-3">Requerido</th>
                            <th className="py-1">Valores / Notas</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-amber-400">codigo_barra</td><td className="py-1 pr-3 text-red-400">Obligatorio</td><td className="py-1">Unico por grupo</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-amber-400">nombre</td><td className="py-1 pr-3 text-red-400">Obligatorio</td><td className="py-1">Nombre del producto</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-slate-400">unidad_medida</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">unidad | pack | cajon | kg (defecto: unidad)</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-slate-400">factor_pack</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">Cantidad de unidades por bulto (para pack/cajon)</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-amber-400">precio_costo</td><td className="py-1 pr-3 text-red-400">Obligatorio</td><td className="py-1">Mayor a 0</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-amber-400">precio_venta</td><td className="py-1 pr-3 text-red-400">Obligatorio</td><td className="py-1">Mayor a 0</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-slate-400">margen</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">Porcentaje (ej: 50)</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-slate-400">categoria</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">Nombre exacto del catalogo</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-slate-400">proveedor</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">Nombre exacto del catalogo</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-slate-400">area_fisica</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">Nombre exacto del catalogo</td></tr>
                          <tr className="border-b border-slate-800"><td className="py-1 pr-3 font-mono text-slate-400">stock_inicial</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">Cantidad inicial de stock</td></tr>
                          <tr><td className="py-1 pr-3 font-mono text-slate-400">activo</td><td className="py-1 pr-3 text-slate-500">Opcional</td><td className="py-1">SI / NO / true / false (defecto: SI)</td></tr>
                        </tbody>
                      </table>
                    </div>

                    <p className="mt-3 mb-1 text-slate-400 font-medium">Reglas:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                      <li>El <span className="text-amber-400">codigo_barra</span> no puede repetirse dentro del archivo</li>
                      <li>Si el codigo ya existe en el sistema, se clasifica como <span className="text-cyan-400">actualizar</span></li>
                      <li>Si no existe, se clasifica como <span className="text-emerald-400">crear</span></li>
                      <li>Categoria, proveedor y area_fisica deben coincidir exactamente con los nombres del catalogo (sin importar mayusculas)</li>
                      <li>La primera fila del Excel debe ser los headers (nombres de columna)</li>
                    </ul>
                  </div>
                </details>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-1">
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Modo de importación
                  </label>
                  <SunmiSelectAdv
                    value={impModo}
                    onChange={(val) => {
                      setImpModo(val);
                      resetImport();
                    }}
                  >
                    <option value="crear">Solo crear nuevos</option>
                    <option value="actualizar">Solo actualizar existentes</option>
                    <option value="crear_actualizar">Crear + Actualizar</option>
                  </SunmiSelectAdv>
                </div>
              </div>

              {/* Input archivo */}
              <div className="px-1 mt-2">
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Archivo Excel (.xlsx, .xls)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={!localId || impLoading}
                  className="text-[12px] text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 disabled:opacity-50"
                />
              </div>

              {/* Loading */}
              {impLoading && (
                <div className="text-center text-amber-400 text-[12px] py-3 animate-pulse">
                  Procesando...
                </div>
              )}

              {/* Error */}
              {impError && (
                <div className="mx-1 mt-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[12px]">
                  {impError}
                </div>
              )}

              {/* Resultado final de importación */}
              {impResultado && (
                <div className="mx-1 mt-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[12px]">
                  <p className="font-semibold">{impResultado.message}</p>
                  <p className="mt-1">
                    Creados: {impResultado.creados} | Actualizados: {impResultado.actualizados} | Errores: {impResultado.errores}
                  </p>
                  {impResultado.detalles?.length > 0 && (
                    <div className="mt-2 text-red-400">
                      {impResultado.detalles.map((d, i) => (
                        <p key={i}>Fila {d.fila} ({d.nombre}): {d.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview de importación */}
              {impResumen && impPreview && (
                <>
                  {/* Resumen */}
                  <div className="flex flex-wrap gap-3 px-1 mt-3">
                    <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[12px] font-medium">
                      Crear: {impResumen.crear}
                    </span>
                    <span className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 text-[12px] font-medium">
                      Actualizar: {impResumen.actualizar}
                    </span>
                    <span className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-[12px] font-medium">
                      Errores: {impResumen.errores}
                    </span>
                    {impResumen.ignorados > 0 && (
                      <span className="px-2 py-1 rounded bg-slate-500/20 text-slate-400 text-[12px] font-medium">
                        Ignorados: {impResumen.ignorados}
                      </span>
                    )}
                  </div>

                  {impPreview.length > 50 && (
                    <p className="text-[11px] text-slate-500 px-1">
                      Mostrando primeras 50 filas de {impPreview.length}
                    </p>
                  )}

                  {/* Tabla preview */}
                  <div className="overflow-x-auto mt-2">
                    <div className="rounded-lg border border-slate-800 overflow-hidden">
                      <SunmiTable
                        headers={["Fila", "Acción", "Código", "Nombre", "Unidad", "Costo", "Venta", "Categoría", "Proveedor", "Motivo"]}
                      >
                        {previewRows.length === 0 ? (
                          <SunmiTableEmpty message="Sin productos en preview" />
                        ) : (
                          previewRows.map((row, i) => (
                            <SunmiTableRow key={i}>
                              <td className="px-2 py-1.5">{row.fila}</td>
                              <td className="px-2 py-1.5">
                                <span className={`
                                  px-1.5 py-0.5 rounded text-[10px] font-semibold
                                  ${row.accion === "crear" ? "bg-emerald-400/20 text-emerald-400" : ""}
                                  ${row.accion === "actualizar" ? "bg-cyan-400/20 text-cyan-400" : ""}
                                  ${row.accion === "error" ? "bg-red-400/20 text-red-400" : ""}
                                  ${row.accion === "ignorar" ? "bg-slate-400/20 text-slate-400" : ""}
                                `}>
                                  {row.accion}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-[11px]">{row.codigo_barra || "-"}</td>
                              <td className={`px-2 py-1.5 text-[11px] ${row.accion === "error" ? "text-red-400" : ""}`}>
                                {row.nombre}
                              </td>
                              <td className="px-2 py-1.5 text-[11px]">{row.unidad_medida}</td>
                              <td className="px-2 py-1.5 text-[11px] text-right">
                                {!isNaN(row.precio_costo) ? `$ ${Number(row.precio_costo).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] text-right">
                                {!isNaN(row.precio_venta) ? `$ ${Number(row.precio_venta).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                              </td>
                              <td className="px-2 py-1.5 text-[11px]">{row.categoria || "-"}</td>
                              <td className="px-2 py-1.5 text-[11px]">{row.proveedor || "-"}</td>
                              <td className={`px-2 py-1.5 text-[11px] ${row.accion === "error" ? "text-red-400" : "text-slate-500"}`}>
                                {row.motivoError || "-"}
                              </td>
                            </SunmiTableRow>
                          ))
                        )}
                      </SunmiTable>
                    </div>
                  </div>

                  {/* Botón confirmar */}
                  {(impResumen.crear > 0 || impResumen.actualizar > 0) && (
                    <div className="flex gap-3 px-1 mt-3">
                      <SunmiButton
                        color="amber"
                        onClick={handleImportConfirm}
                        disabled={impLoading}
                      >
                        {impLoading ? "Importando..." : "Confirmar importación"}
                      </SunmiButton>
                      <SunmiButton color="red" onClick={resetImport}>
                        Cancelar
                      </SunmiButton>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <ModalProducto
          open={modalOpen}
          onClose={cerrarModal}
          onSubmit={handleSubmit}
          catalogos={catalogos}
          initialData={editing}
          localId={localId}
        />
      </SunmiCard>
    </div>
  );
}
