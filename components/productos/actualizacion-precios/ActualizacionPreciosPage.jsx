"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiRow from "@/components/sunmi/SunmiRow";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import useVersionGuard from "@/hooks/useVersionGuard";
import AvisoVersionNueva from "@/components/version/AvisoVersionNueva";
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formato argentino: $ 1.234,56 */
function formatPrecio(n) {
  if (n == null || isNaN(n)) return "\u2014";
  return (
    "$ " +
    Number(n).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function calcCompraNueva(compraActual, pct) {
  const p = parseFloat(pct);
  if (isNaN(p)) return null;
  return compraActual * (1 + p / 100);
}

function calcVentaNueva(compraNueva, margen) {
  if (compraNueva == null) return null;
  return compraNueva * (1 + (margen || 0) / 100);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const PAGE_SIZES = [25, 50, 100];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ActualizacionPreciosPage() {
  const router = useRouter();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto, contexto } = useContextoActivo();

  // Guard de versión: las tres vías de aplicación (proveedor, Excel y margen
  // masivo) escriben precios, así que las tres consultan /api/version fresco
  // antes de mandar nada.
  const { versionNueva, verificando: verificandoVersion, puedeGuardar } = useVersionGuard();

  // Estado compartido
  const [tab, setTab] = useState("proveedor");
  const [proveedores, setProveedores] = useState([]);
  const [loadingProveedores, setLoadingProveedores] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Tab Proveedor
  const [proveedorId, setProveedorId] = useState("");
  const [filas, setFilas] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [globalPct, setGlobalPct] = useState("");
  const [applying, setApplying] = useState(false);

  // Paginacion tabla proveedor
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Tab Excel
  const [excelProveedorId, setExcelProveedorId] = useState("");
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelPreview, setExcelPreview] = useState([]);
  const [applyingExcel, setApplyingExcel] = useState(false);

  // Tab Margen masivo
  const [margenPct, setMargenPct] = useState("30");
  const [margenRedondeo, setMargenRedondeo] = useState("CIEN_ARRIBA");
  const [margenSoloIgualCosto, setMargenSoloIgualCosto] = useState(true);
  const [margenForzar, setMargenForzar] = useState(false);
  const [margenFiltroCategoria, setMargenFiltroCategoria] = useState("");
  const [margenFiltroProveedor, setMargenFiltroProveedor] = useState("");
  const [margenFiltroDesde, setMargenFiltroDesde] = useState("");
  const [margenCategorias, setMargenCategorias] = useState([]);
  const [margenLoadingCategorias, setMargenLoadingCategorias] = useState(false);
  const [margenLoadingPreview, setMargenLoadingPreview] = useState(false);
  const [margenApplying, setMargenApplying] = useState(false);
  const [margenItems, setMargenItems] = useState([]);
  const [margenSummary, setMargenSummary] = useState(null);
  const [margenConfirmOpen, setMargenConfirmOpen] = useState(false);

  // -----------------------------------------------------------------------
  // Cargar proveedores al montar
  // -----------------------------------------------------------------------
  useEffect(() => {
    const cargar = async () => {
      setLoadingProveedores(true);
      try {
        const res = await fetch("/api/proveedores/opciones", {
          credentials: "include",
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setProveedores(Array.isArray(data?.items) ? data.items : []);
          return;
        }
        // Fallback
        const fallback = await fetch("/api/catalogos/proveedores", {
          credentials: "include",
        });
        if (fallback.status === 401) {
          router.replace("/login");
          return;
        }
        const fb = await fallback.json();
        setProveedores(Array.isArray(fb?.items) ? fb.items : []);
      } catch (err) {
        console.error("Error cargando proveedores:", err);
      } finally {
        setLoadingProveedores(false);
      }
    };
    cargar();
  }, [router]);

  // -----------------------------------------------------------------------
  // Helper: cargar productos via preview con 0% (sin cambios)
  // -----------------------------------------------------------------------
  const fetchProductos = async (provId) => {
    const res = await fetch("/api/productos/precios/preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proveedorId: Number(provId),
        metodo: "AUMENTO",
        pricingMode: "KEEP_VENTA",
        increase: { kind: "PCT", value: 0 },
        localId: contexto?.localId || null,
      }),
    });
    if (res.status === 401) {
      router.replace("/login");
      return null;
    }
    if (!res.ok) return null;
    return res.json();
  };

  // -----------------------------------------------------------------------
  // TAB PROVEEDOR - Cargar productos
  // -----------------------------------------------------------------------
  const handleCargarProductos = async () => {
    if (!proveedorId) {
      setErrorMsg("Selecciona un proveedor.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setLoadingProductos(true);
    try {
      const data = await fetchProductos(proveedorId);
      if (!data) {
        setErrorMsg("Error al cargar productos.");
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        setErrorMsg(
          data.hint || "No se encontraron productos para este proveedor."
        );
        setFilas([]);
        return;
      }
      // Mapear a filas editables
      setFilas(
        items.map((p) => ({
          productoBaseId: p.productoBaseId,
          nombre: p.nombre,
          codigoBarra: p.codigoBarra || "",
          compraActual: p.costoAnterior,
          ventaActual: p.ventaAnterior,
          margen: p.margen ?? 0,
          pct: "",
          compraNueva: "",
          editadoPor: null,
        }))
      );
    } catch (err) {
      console.error("Error cargando productos:", err);
      setErrorMsg("Error al cargar productos.");
    } finally {
      setLoadingProductos(false);
    }
  };

  // Aplicar % global a todas las filas
  const handleAplicarGlobal = () => {
    const val = parseFloat(globalPct);
    if (isNaN(val)) {
      setErrorMsg("Ingresa un % valido.");
      return;
    }
    setErrorMsg("");
    setFilas((prev) =>
      prev.map((f) => {
        const cn = calcCompraNueva(f.compraActual, globalPct);
        return {
          ...f,
          pct: globalPct,
          compraNueva: cn != null ? String(round2(cn)) : "",
          editadoPor: "porcentaje",
        };
      })
    );
  };

  // Editar % de una fila individual
  const handlePctChange = (idx, value) => {
    setFilas((prev) => {
      const next = [...prev];
      const f = next[idx];
      const cn = calcCompraNueva(f.compraActual, value);
      next[idx] = {
        ...f,
        pct: value,
        compraNueva: cn != null ? String(round2(cn)) : "",
        editadoPor: value === "" ? null : "porcentaje",
      };
      return next;
    });
  };

  // Editar precio directo de una fila
  const handlePrecioDirectoChange = (idx, value) => {
    setFilas((prev) => {
      const next = [...prev];
      const f = next[idx];
      const precio = parseFloat(value);
      let pct = "";
      if (!isNaN(precio) && f.compraActual > 0) {
        pct = String(round2(((precio - f.compraActual) / f.compraActual) * 100));
      }
      next[idx] = {
        ...f,
        compraNueva: value,
        pct,
        editadoPor: value === "" ? null : "precio",
      };
      return next;
    });
  };

  // Productos con cambios reales
  const itemsConCambios = useMemo(
    () =>
      filas.filter((f) => {
        const cn = parseFloat(f.compraNueva);
        return !isNaN(cn) && cn > 0 && cn !== f.compraActual;
      }),
    [filas]
  );

  // Resetear pagina al cargar nuevos productos
  useEffect(() => { setPage(1); }, [filas.length]);

  // Paginacion frontend
  const totalPages = Math.max(1, Math.ceil(filas.length / pageSize));
  const visibleFilas = filas.slice((page - 1) * pageSize, page * pageSize);

  // Navegacion con Enter tipo planilla
  const handleInputKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const row = Number(e.target.dataset.row);
    const col = e.target.dataset.col;
    const nextRow = e.shiftKey ? row - 1 : row + 1;
    const next = document.querySelector(
      `input[data-row="${nextRow}"][data-col="${col}"]`
    );
    if (next) { next.focus(); next.select(); }
  };

  // Aplicar cambios al servidor
  const handleAplicar = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!proveedorId) {
      setErrorMsg("Selecciona un proveedor.");
      return;
    }

    const items = itemsConCambios.map((f) => {
      const cn = parseFloat(f.compraNueva);
      const vn = calcVentaNueva(cn, f.margen);
      return {
        productoBaseId: f.productoBaseId,
        costoAnterior: f.compraActual,
        costoNuevo: round2(cn),
        ventaAnterior: f.ventaActual,
        ventaNueva: round2(vn),
      };
    });

    if (!items.length) {
      setErrorMsg("No hay productos con cambios para aplicar.");
      return;
    }

    const invalid = items.find((it) => it.costoNuevo <= 0);
    if (invalid) {
      setErrorMsg("Hay productos con compra nueva <= 0. Revisa los porcentajes.");
      return;
    }

    // Barrera de versión antes de cualquier escritura.
    if (!(await puedeGuardar())) return;

    setApplying(true);
    try {
      const res = await fetch("/api/productos/precios/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: Number(proveedorId),
          metodo: "AUMENTO",
          pricingMode: "SET_VENTA",
          items,
          localId: contexto?.localId || null,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(
          data.message || `Actualizacion aplicada: ${items.length} productos.`
        );
        // Recargar productos para reflejar nuevos precios
        await handleCargarProductos();
      } else {
        setErrorMsg(data.error || "Error al aplicar precios.");
      }
    } catch (err) {
      console.error("Error aplicando precios:", err);
      setErrorMsg("Error de conexion al aplicar precios.");
    } finally {
      setApplying(false);
    }
  };

  // -----------------------------------------------------------------------
  // TAB EXCEL - Descargar
  // -----------------------------------------------------------------------
  const handleDescargarExcel = async () => {
    if (!excelProveedorId) {
      setErrorMsg("Selecciona un proveedor para exportar.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setLoadingExcel(true);
    try {


      const data = await fetchProductos(excelProveedorId);
      if (!data) {
        setErrorMsg("Error al cargar productos.");
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        setErrorMsg(data.hint || "No hay productos para exportar.");
        return;
      }

      const rows = items.map((p) => ({
        codigo_barra: p.codigoBarra || "",
        nombre: p.nombre,
        compra_actual: p.costoAnterior,
        compra_nueva: "",
        venta_actual: p.ventaAnterior,
        venta_nueva: "",
        margen: p.margen ?? 0,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Productos");

      const provNombre =
        proveedores.find((p) => String(p.id) === String(excelProveedorId))
          ?.nombre || excelProveedorId;
      XLSX.writeFile(wb, `precios_${provNombre}.xlsx`);
      setSuccessMsg("Excel descargado correctamente.");
    } catch (err) {
      console.error("Error descargando Excel:", err);
      setErrorMsg("Error al generar el archivo Excel.");
    } finally {
      setLoadingExcel(false);
    }
  };

  // -----------------------------------------------------------------------
  // TAB EXCEL - Subir y parsear
  // -----------------------------------------------------------------------
  const handleSubirExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!excelProveedorId) {
      setErrorMsg("Selecciona un proveedor antes de importar.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setLoadingExcel(true);
    try {


      // Parsear archivo
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      if (!rows.length) {
        setErrorMsg("El archivo Excel esta vacio.");
        return;
      }

      // Cargar productos actuales para matchear por codigo de barra
      const data = await fetchProductos(excelProveedorId);
      if (!data) {
        setErrorMsg("Error al cargar productos para comparar.");
        return;
      }

      const productsByBarcode = new Map();
      for (const p of data.items || []) {
        if (p.codigoBarra) {
          productsByBarcode.set(String(p.codigoBarra), p);
        }
      }

      // Matchear filas del Excel con productos existentes
      const matched = [];
      const notFound = [];

      for (const row of rows) {
        const barcode = String(row.codigo_barra || "").trim();
        if (!barcode) continue;
        if (!row.compra_nueva && !row.venta_nueva) continue;

        const product = productsByBarcode.get(barcode);
        if (product) {
          const compraNueva = Number(row.compra_nueva) || product.costoAnterior;
          const ventaNueva =
            Number(row.venta_nueva) ||
            calcVentaNueva(compraNueva, product.margen ?? 0);

          matched.push({
            productoBaseId: product.productoBaseId,
            nombre: product.nombre,
            codigoBarra: barcode,
            compraActual: product.costoAnterior,
            compraNueva: round2(compraNueva),
            ventaActual: product.ventaAnterior,
            ventaNueva: round2(ventaNueva),
          });
        } else {
          notFound.push(barcode);
        }
      }

      if (!matched.length) {
        setErrorMsg(
          `No se encontraron coincidencias por codigo de barra.${
            notFound.length ? ` (${notFound.length} no encontrados)` : ""
          }`
        );
        return;
      }

      if (notFound.length) {
        setSuccessMsg(
          `${matched.length} productos encontrados. ${notFound.length} codigos no encontrados.`
        );
      }

      setExcelPreview(matched);
    } catch (err) {
      console.error("Error leyendo Excel:", err);
      setErrorMsg("Error al leer el archivo Excel.");
    } finally {
      setLoadingExcel(false);
    }
  };

  // -----------------------------------------------------------------------
  // TAB EXCEL - Aplicar cambios importados
  // -----------------------------------------------------------------------
  const handleAplicarExcel = async () => {
    if (!excelPreview.length) return;
    setErrorMsg("");
    setSuccessMsg("");

    const items = excelPreview.map((p) => ({
      productoBaseId: p.productoBaseId,
      costoAnterior: p.compraActual,
      costoNuevo: p.compraNueva,
      ventaAnterior: p.ventaActual,
      ventaNueva: p.ventaNueva,
    }));

    const invalid = items.find((it) => it.costoNuevo <= 0);
    if (invalid) {
      setErrorMsg("Hay productos con compra nueva <= 0.");
      return;
    }

    // Barrera de versión antes de cualquier escritura.
    if (!(await puedeGuardar())) return;

    setApplyingExcel(true);
    try {
      const res = await fetch("/api/productos/precios/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: Number(excelProveedorId),
          metodo: "XLSX",
          pricingMode: "SET_VENTA",
          items,
          localId: contexto?.localId || null,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(
          data.message ||
            `Aplicados ${items.length} productos desde Excel.`
        );
        setExcelPreview([]);
      } else {
        setErrorMsg(data.error || "Error al aplicar precios.");
      }
    } catch (err) {
      console.error("Error aplicando Excel:", err);
      setErrorMsg("Error de conexion al aplicar precios.");
    } finally {
      setApplyingExcel(false);
    }
  };

  // -----------------------------------------------------------------------
  // TAB MARGEN MASIVO
  // -----------------------------------------------------------------------
  const cargarMargenCategorias = async () => {
    if (margenCategorias.length || margenLoadingCategorias) return;
    setMargenLoadingCategorias(true);
    try {
      const res = await fetch("/api/categorias/listar", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMargenCategorias(Array.isArray(data?.items) ? data.items : []);
      }
    } catch (err) {
      console.error("Error cargando categorías:", err);
    } finally {
      setMargenLoadingCategorias(false);
    }
  };

  const handleMargenPreview = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setMargenItems([]);
    setMargenSummary(null);

    const pct = parseFloat(margenPct);
    if (isNaN(pct) || pct <= -100) {
      setErrorMsg("Margen inválido. Ingresá un número mayor a -100.");
      return;
    }

    setMargenLoadingPreview(true);
    try {
      const filtros = {};
      if (margenFiltroCategoria) filtros.categoriaId = Number(margenFiltroCategoria);
      if (margenFiltroProveedor) filtros.proveedorId = Number(margenFiltroProveedor);
      if (margenFiltroDesde) filtros.creadosDesde = margenFiltroDesde;

      const res = await fetch("/api/productos/precios/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "MARGEN_MASIVO",
          pricingMode: "SET_VENTA",
          margenPorcentaje: pct,
          redondeo: margenRedondeo,
          soloDondeVentaIgualCosto: margenSoloIgualCosto,
          forzar: margenForzar,
          filtros,
          localId: contexto?.localId || null,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || "Error al previsualizar.");
        return;
      }
      setMargenItems(Array.isArray(data.items) ? data.items : []);
      setMargenSummary(data.summary || null);
      if (!data.items?.length) {
        setErrorMsg(
          "No hay productos para actualizar con los filtros y reglas seleccionadas."
        );
      }
    } catch (err) {
      console.error("Error previsualizando margen masivo:", err);
      setErrorMsg("Error de conexión al previsualizar.");
    } finally {
      setMargenLoadingPreview(false);
    }
  };

  const handleMargenAplicar = async () => {
    if (!margenItems.length) return;
    setMargenConfirmOpen(false);
    setErrorMsg("");
    setSuccessMsg("");

    // Barrera de versión antes de cualquier escritura.
    if (!(await puedeGuardar())) return;

    const items = margenItems.map((it) => ({
      productoBaseId: it.productoBaseId,
      costoAnterior: it.precioCosto,
      costoNuevo: it.precioCosto,
      ventaAnterior: it.ventaAnterior,
      ventaNueva: it.ventaNueva,
    }));

    setMargenApplying(true);
    try {
      const res = await fetch("/api/productos/precios/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "MARGEN_MASIVO",
          pricingMode: "SET_VENTA",
          proveedorId: margenFiltroProveedor ? Number(margenFiltroProveedor) : null,
          items,
          localId: contexto?.localId || null,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(
          data.message ||
            `Margen aplicado a ${items.length} productos.`
        );
        setMargenItems([]);
        setMargenSummary(null);
      } else {
        setErrorMsg(data.error || "Error al aplicar margen masivo.");
      }
    } catch (err) {
      console.error("Error aplicando margen masivo:", err);
      setErrorMsg("Error de conexión al aplicar margen masivo.");
    } finally {
      setMargenApplying(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (!perfil || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm md:text-base font-semibold">
              Actualizacion de Precios
            </h1>
            <SunmiBackButton href="/modulos/productos" />
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-3 gap-2 max-w-[510px]">
            <SunmiButton
              color={tab === "proveedor" ? "amber" : "cyan"}
              onClick={() => {
                setTab("proveedor");
                setErrorMsg("");
                setSuccessMsg("");
              }}
            >
              Por Proveedor
            </SunmiButton>
            <SunmiButton
              color={tab === "excel" ? "amber" : "cyan"}
              onClick={() => {
                setTab("excel");
                setErrorMsg("");
                setSuccessMsg("");
              }}
            >
              Excel
            </SunmiButton>
            <SunmiButton
              color={tab === "margen" ? "amber" : "cyan"}
              onClick={() => {
                setTab("margen");
                setErrorMsg("");
                setSuccessMsg("");
                cargarMargenCategorias();
              }}
            >
              Margen masivo
            </SunmiButton>
          </div>

          {/* =================== TAB: POR PROVEEDOR =================== */}
          {tab === "proveedor" && (
            <>
              {/* Selector de proveedor + boton cargar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <div className="md:col-span-2">
                  <label className="text-[11px] sunmi-label mb-1 block">
                    Proveedor
                  </label>
                  <SunmiSelectAdv
                    value={proveedorId}
                    onChange={(val) => setProveedorId(val)}
                    disabled={loadingProveedores || loadingProductos}
                    searchable
                  >
                    <option value="">
                      {loadingProveedores
                        ? "Cargando..."
                        : "Seleccionar proveedor"}
                    </option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </SunmiSelectAdv>
                </div>
                <SunmiButton
                  color="amber"
                  onClick={handleCargarProductos}
                  disabled={!proveedorId || loadingProductos}
                >
                  {loadingProductos ? "Cargando..." : "Cargar productos"}
                </SunmiButton>
              </div>

              {/* Ajuste de precios (visible solo si hay productos) */}
              {filas.length > 0 && (
                <>
                  <SunmiSeparator
                    label="Ajuste de precios"
                    className="my-0"
                  />

                  {/* Toolbar sticky: % global + aplicar */}
                  <div className="sticky top-0 z-10 bg-[var(--app-bg)] border-b border-[var(--app-border)] py-2 -mx-3 px-3">
                    <div className="flex flex-wrap gap-2 items-end justify-between">
                      <div className="flex gap-2 items-end">
                        <div className="w-32">
                          <label className="text-[11px] sunmi-label mb-1 block">
                            % Aumento
                          </label>
                          <SunmiInput
                            type="number"
                            step="0.01"
                            value={globalPct}
                            onChange={(e) => setGlobalPct(e.target.value)}
                            placeholder="Ej: 10"
                          />
                        </div>
                        <SunmiButton color="cyan" onClick={handleAplicarGlobal}>
                          Aplicar a todos
                        </SunmiButton>
                      </div>
                      <SunmiButton
                        color="amber"
                        onClick={handleAplicar}
                        disabled={applying || verificandoVersion || versionNueva || !itemsConCambios.length}
                      >
                        {applying
                          ? "Aplicando..."
                          : `Aplicar cambios (${itemsConCambios.length})`}
                      </SunmiButton>
                    </div>
                  </div>

                  {/* Tabla de productos editable */}
                  <SunmiTable
                    headers={[
                      "Producto",
                      "Compra actual",
                      "% Aumento",
                      "Nuevo precio",
                      "Venta actual",
                      "Venta nueva",
                    ]}
                  >
                    {visibleFilas.map((f, localIdx) => {
                      const globalIdx = (page - 1) * pageSize + localIdx;
                      const cn = parseFloat(f.compraNueva);
                      const vn = !isNaN(cn) ? calcVentaNueva(cn, f.margen) : null;
                      const isPct = f.editadoPor === "porcentaje";
                      const isPrecio = f.editadoPor === "precio";
                      return (
                        <SunmiTableRow key={f.productoBaseId}>
                          <td className="px-2 py-1.5 truncate max-w-[200px]">
                            {f.editadoPor && <span className="text-amber-400 mr-1">●</span>}
                            {f.nombre}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {formatPrecio(f.compraActual)}
                          </td>
                          <td className="px-2 py-1.5 w-24">
                            <SunmiInput
                              type="number"
                              step="0.01"
                              value={f.pct}
                              onChange={(e) =>
                                handlePctChange(globalIdx, e.target.value)
                              }
                              onKeyDown={handleInputKeyDown}
                              data-row={globalIdx}
                              data-col="pct"
                              placeholder="%"
                              className={`text-right ${isPct ? "!border-amber-400/60" : ""}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 w-28">
                            <SunmiInput
                              type="number"
                              step="0.01"
                              value={f.compraNueva}
                              onChange={(e) =>
                                handlePrecioDirectoChange(globalIdx, e.target.value)
                              }
                              onKeyDown={handleInputKeyDown}
                              data-row={globalIdx}
                              data-col="precio"
                              placeholder="$"
                              className={`text-right ${isPrecio ? "!border-cyan-400/60" : ""}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {formatPrecio(f.ventaActual)}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {vn != null
                              ? formatPrecio(vn)
                              : <span className="sunmi-text-muted">{formatPrecio(f.ventaActual)}</span>}
                          </td>
                        </SunmiTableRow>
                      );
                    })}
                  </SunmiTable>

                  {/* Paginacion */}
                  <div className="flex items-center justify-between px-3 py-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <SunmiButton color="slate" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        « Anterior
                      </SunmiButton>
                      <span className="sunmi-text-muted text-[11px]">
                        Página {page} / {totalPages}
                        {filas.length > 0 && <span className="ml-1 opacity-70">({filas.length} items)</span>}
                      </span>
                      <SunmiButton color="slate" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
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
            </>
          )}

          {/* =================== TAB: EXCEL =================== */}
          {tab === "excel" && (
            <>
              {/* Exportar */}
              <SunmiSeparator
                label="Exportar productos"
                className="my-0"
              />

              <SunmiRow
                left={
                  <div className="flex-1">
                    <label className="text-[11px] sunmi-label mb-1 block">
                      Proveedor
                    </label>
                    <SunmiSelectAdv
                      value={excelProveedorId}
                      onChange={(val) => setExcelProveedorId(val)}
                      disabled={loadingProveedores || loadingExcel}
                      searchable
                    >
                      <option value="">
                        {loadingProveedores
                          ? "Cargando..."
                          : "Seleccionar proveedor"}
                      </option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </SunmiSelectAdv>
                  </div>
                }
                right={
                  <SunmiButton
                    color="cyan"
                    onClick={handleDescargarExcel}
                    disabled={!excelProveedorId || loadingExcel}
                  >
                    {loadingExcel ? "Generando..." : "Descargar Excel"}
                  </SunmiButton>
                }
              />

              {/* Importar */}
              <SunmiSeparator
                label="Importar cambios"
                className="my-0"
              />

              <div>
                <label className="text-[11px] sunmi-label mb-1 block">
                  Subir archivo Excel (.xlsx)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleSubirExcel}
                  disabled={loadingExcel || !excelProveedorId}
                  className="text-xs sunmi-text-strong file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-[var(--pos-control-bg)] file:text-[var(--pos-muted-strong)] hover:file:bg-[var(--pos-control-hover)] disabled:opacity-50"
                />
                {!excelProveedorId && (
                  <div className="text-xs sunmi-text-muted mt-1">
                    Selecciona un proveedor arriba antes de importar.
                  </div>
                )}
              </div>

              {/* Preview de cambios importados */}
              {excelPreview.length > 0 && (
                <>
                  <SunmiSeparator
                    label={`Preview (${excelPreview.length} productos)`}
                    className="my-0"
                  />

                  <SunmiTable
                    headers={[
                      "Producto",
                      "Compra actual",
                      "Compra nueva",
                      "Venta actual",
                      "Venta nueva",
                    ]}
                  >
                    {excelPreview.map((p) => (
                      <SunmiTableRow key={p.productoBaseId}>
                        <td className="px-2 py-1.5 truncate max-w-[200px]">
                          {p.nombre}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {formatPrecio(p.compraActual)}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {formatPrecio(p.compraNueva)}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {formatPrecio(p.ventaActual)}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {formatPrecio(p.ventaNueva)}
                        </td>
                      </SunmiTableRow>
                    ))}
                  </SunmiTable>

                  <SunmiButton
                    color="amber"
                    onClick={handleAplicarExcel}
                    disabled={applyingExcel || verificandoVersion || versionNueva}
                  >
                    {applyingExcel
                      ? "Aplicando..."
                      : `Aplicar cambios (${excelPreview.length} productos)`}
                  </SunmiButton>
                </>
              )}
            </>
          )}

          {/* =================== TAB: MARGEN MASIVO =================== */}
          {tab === "margen" && (
            <>
              <SunmiSeparator label="Configuración" className="my-0" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    Margen porcentual sobre costo
                  </label>
                  <SunmiInput
                    type="number"
                    step="0.01"
                    value={margenPct}
                    onChange={(e) => setMargenPct(e.target.value)}
                    placeholder="Ej: 30"
                  />
                </div>
                <div>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    Redondeo
                  </label>
                  <SunmiSelectAdv
                    value={margenRedondeo}
                    onChange={(val) => setMargenRedondeo(val)}
                  >
                    <option value="NINGUNO">Sin redondeo</option>
                    <option value="CIEN_ARRIBA">Redondear a 100 hacia arriba</option>
                  </SunmiSelectAdv>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[12px] sunmi-text-strong cursor-pointer">
                  <input
                    type="checkbox"
                    checked={margenSoloIgualCosto}
                    onChange={(e) => setMargenSoloIgualCosto(e.target.checked)}
                  />
                  Solo productos donde precio venta = precio costo
                </label>
                <label className="flex items-center gap-2 text-[12px] sunmi-text-strong cursor-pointer">
                  <input
                    type="checkbox"
                    checked={margenForzar}
                    onChange={(e) => setMargenForzar(e.target.checked)}
                  />
                  Forzar actualización de productos ya modificados
                </label>
                {margenForzar && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                    Atención: forzar pisará precios de venta editados manualmente.
                    No se puede deshacer.
                  </div>
                )}
              </div>

              <SunmiSeparator label="Filtros (opcionales)" className="my-0" />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    Categoría
                  </label>
                  <SunmiSelectAdv
                    value={margenFiltroCategoria}
                    onChange={(val) => setMargenFiltroCategoria(val)}
                    disabled={margenLoadingCategorias}
                    searchable
                  >
                    <option value="">Todas</option>
                    {margenCategorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </SunmiSelectAdv>
                </div>
                <div>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    Proveedor
                  </label>
                  <SunmiSelectAdv
                    value={margenFiltroProveedor}
                    onChange={(val) => setMargenFiltroProveedor(val)}
                    disabled={loadingProveedores}
                    searchable
                  >
                    <option value="">Todos</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </SunmiSelectAdv>
                </div>
                <div>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    Creados desde
                  </label>
                  <SunmiInput
                    type="date"
                    value={margenFiltroDesde}
                    onChange={(e) => setMargenFiltroDesde(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <SunmiButton
                  color="cyan"
                  onClick={handleMargenPreview}
                  disabled={margenLoadingPreview || margenApplying}
                >
                  {margenLoadingPreview ? "Calculando..." : "Previsualizar"}
                </SunmiButton>
                {margenItems.length > 0 && (
                  <SunmiButton
                    color="amber"
                    onClick={() => setMargenConfirmOpen(true)}
                    disabled={margenApplying || verificandoVersion || versionNueva}
                  >
                    {margenApplying
                      ? "Aplicando..."
                      : `Aplicar cambios (${margenItems.length})`}
                  </SunmiButton>
                )}
              </div>

              {margenSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-md sunmi-card px-3 py-2">
                    <div className="sunmi-text-muted">Encontrados</div>
                    <div className="text-base font-semibold">
                      {margenSummary.encontrados}
                    </div>
                  </div>
                  <div className="rounded-md sunmi-card px-3 py-2">
                    <div className="sunmi-text-muted">A actualizar</div>
                    <div className="text-base font-semibold sunmi-text-success">
                      {margenSummary.aActualizar}
                    </div>
                  </div>
                  <div className="rounded-md sunmi-card px-3 py-2">
                    <div className="sunmi-text-muted">Ignorados precio modificado</div>
                    <div className="text-base font-semibold">
                      {margenSummary.ignoradosPrecioModificado}
                    </div>
                  </div>
                  <div className="rounded-md sunmi-card px-3 py-2">
                    <div className="sunmi-text-muted">Ignorados costo 0</div>
                    <div className="text-base font-semibold">
                      {margenSummary.ignoradosCostoCero}
                    </div>
                  </div>
                </div>
              )}

              {margenItems.length > 0 && (
                <>
                  <SunmiSeparator
                    label={`Vista previa (${margenItems.length} productos)`}
                    className="my-0"
                  />
                  <SunmiTable
                    headers={[
                      "Producto",
                      "Cód. barras",
                      "Costo",
                      "Venta actual",
                      "Venta nueva",
                      "Diferencia",
                      "Estado",
                    ]}
                  >
                    {margenItems.slice(0, 200).map((it) => (
                      <SunmiTableRow key={it.productoBaseId}>
                        <td className="px-2 py-1.5 truncate max-w-[200px]">
                          {it.nombre}
                        </td>
                        <td className="px-2 py-1.5 sunmi-text-muted whitespace-nowrap">
                          {it.codigoBarra || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {formatPrecio(it.precioCosto)}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {formatPrecio(it.ventaAnterior)}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap font-semibold">
                          {formatPrecio(it.ventaNueva)}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {formatPrecio(it.diferencia)}
                        </td>
                        <td className="px-2 py-1.5 text-[11px]">
                          {it.estado === "forzado" ? (
                            <span className="text-amber-400">forzado</span>
                          ) : it.estado === "inicial" ? (
                            <span className="sunmi-text-muted">inicial</span>
                          ) : (
                            <span className="sunmi-text-success">aplicar</span>
                          )}
                        </td>
                      </SunmiTableRow>
                    ))}
                  </SunmiTable>
                  {margenItems.length > 200 && (
                    <div className="text-[11px] sunmi-text-muted px-1">
                      Mostrando los primeros 200 de {margenItems.length}. Al aplicar
                      se actualizarán todos.
                    </div>
                  )}
                </>
              )}

              {/* Modal de confirmación */}
              {margenConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="sunmi-card w-full max-w-md mx-4 p-5 rounded-xl shadow-xl">
                    <h3 className="text-sm font-bold mb-2">
                      Confirmar aplicación masiva
                    </h3>
                    <p className="text-[12px] sunmi-text-muted mb-3">
                      Se actualizará el precio de venta de {margenItems.length}{" "}
                      productos aplicando un margen de {margenPct}% sobre el costo
                      {margenRedondeo === "CIEN_ARRIBA"
                        ? " con redondeo a 100 hacia arriba"
                        : " sin redondeo"}
                      .
                    </p>
                    {margenForzar && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300 mb-3">
                        Forzar está activado: se pisarán precios manualmente
                        modificados.
                      </div>
                    )}
                    <div className="flex gap-2">
                      <SunmiButton
                        color="amber"
                        onClick={handleMargenAplicar}
                        disabled={margenApplying || verificandoVersion || versionNueva}
                      >
                        {margenApplying ? "Aplicando..." : "Confirmar"}
                      </SunmiButton>
                      <SunmiButton
                        color="slate"
                        onClick={() => setMargenConfirmOpen(false)}
                        disabled={margenApplying || verificandoVersion || versionNueva}
                      >
                        Cancelar
                      </SunmiButton>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Bundle viejo tras un deploy: bloquea la aplicación de precios. */}
          <AvisoVersionNueva visible={versionNueva} />

          {/* Mensajes de error / exito */}
          {errorMsg && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              {successMsg}
            </div>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
