"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiRow from "@/components/sunmi/SunmiRow";
import SelectorGrupoActivo from "@/components/grupo/SelectorGrupoActivo";
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

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ActualizacionPreciosPage() {
  const router = useRouter();

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

  // Tab Excel
  const [excelProveedorId, setExcelProveedorId] = useState("");
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelPreview, setExcelPreview] = useState([]);
  const [applyingExcel, setApplyingExcel] = useState(false);

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
    setFilas((prev) => prev.map((f) => ({ ...f, pct: globalPct })));
  };

  // Editar % de una fila individual
  const handlePctChange = (idx, value) => {
    setFilas((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], pct: value };
      return next;
    });
  };

  // Productos con cambios reales (% distinto de vacio y de 0)
  const itemsConCambios = useMemo(
    () =>
      filas.filter((f) => {
        const p = parseFloat(f.pct);
        return !isNaN(p) && p !== 0;
      }),
    [filas]
  );

  // Aplicar cambios al servidor
  const handleAplicar = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!proveedorId) {
      setErrorMsg("Selecciona un proveedor.");
      return;
    }

    const items = itemsConCambios.map((f) => {
      const cn = calcCompraNueva(f.compraActual, f.pct);
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
  // Reset al cambiar de grupo
  // -----------------------------------------------------------------------
  const handleGrupoChanged = () => {
    setFilas([]);
    setExcelPreview([]);
    setErrorMsg("");
    setSuccessMsg("");
    setGlobalPct("");
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm md:text-base font-semibold">
              Actualizacion de Precios
            </h1>
            <SunmiButton
              color="cyan"
              onClick={() => router.push("/modulos/productos")}
            >
              Volver a productos
            </SunmiButton>
          </div>

          <SelectorGrupoActivo onGrupoChanged={handleGrupoChanged} />

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 max-w-[340px]">
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
          </div>

          {/* =================== TAB: POR PROVEEDOR =================== */}
          {tab === "proveedor" && (
            <>
              {/* Selector de proveedor + boton cargar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <div className="md:col-span-2">
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Proveedor
                  </label>
                  <SunmiSelect
                    value={proveedorId}
                    onChange={(e) => setProveedorId(e.target.value)}
                    disabled={loadingProveedores || loadingProductos}
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
                  </SunmiSelect>
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
                    className="!my-0"
                  />

                  {/* Input global + boton aplicar a todos */}
                  <div className="flex gap-2 items-end">
                    <div className="w-32">
                      <label className="text-[11px] text-slate-400 mb-1 block">
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

                  {/* Tabla de productos editable */}
                  <SunmiTable
                    headers={[
                      "Producto",
                      "Compra actual",
                      "% Aumento",
                      "Compra nueva",
                      "Venta actual",
                      "Venta nueva",
                    ]}
                  >
                    {filas.map((f, idx) => {
                      const cn = calcCompraNueva(f.compraActual, f.pct);
                      const vn = calcVentaNueva(cn, f.margen);
                      return (
                        <tr
                          key={f.productoBaseId}
                          className="bg-slate-950 hover:bg-slate-900"
                        >
                          <td className="px-2 py-1.5 truncate max-w-[200px]">
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
                                handlePctChange(idx, e.target.value)
                              }
                              placeholder="%"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {cn != null ? formatPrecio(cn) : "\u2014"}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {formatPrecio(f.ventaActual)}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {vn != null ? formatPrecio(vn) : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                  </SunmiTable>

                  {/* Boton aplicar cambios */}
                  <SunmiButton
                    color="amber"
                    onClick={handleAplicar}
                    disabled={applying || !itemsConCambios.length}
                  >
                    {applying
                      ? "Aplicando..."
                      : `Aplicar cambios (${itemsConCambios.length} productos)`}
                  </SunmiButton>
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
                className="!my-0"
              />

              <SunmiRow
                left={
                  <div className="flex-1">
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Proveedor
                    </label>
                    <SunmiSelect
                      value={excelProveedorId}
                      onChange={(e) => setExcelProveedorId(e.target.value)}
                      disabled={loadingProveedores || loadingExcel}
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
                    </SunmiSelect>
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
                className="!my-0"
              />

              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Subir archivo Excel (.xlsx)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleSubirExcel}
                  disabled={loadingExcel || !excelProveedorId}
                  className="text-xs text-slate-300 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600"
                />
                {!excelProveedorId && (
                  <div className="text-xs text-slate-500 mt-1">
                    Selecciona un proveedor arriba antes de importar.
                  </div>
                )}
              </div>

              {/* Preview de cambios importados */}
              {excelPreview.length > 0 && (
                <>
                  <SunmiSeparator
                    label={`Preview (${excelPreview.length} productos)`}
                    className="!my-0"
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
                      <tr
                        key={p.productoBaseId}
                        className="bg-slate-950 hover:bg-slate-900"
                      >
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
                      </tr>
                    ))}
                  </SunmiTable>

                  <SunmiButton
                    color="amber"
                    onClick={handleAplicarExcel}
                    disabled={applyingExcel}
                  >
                    {applyingExcel
                      ? "Aplicando..."
                      : `Aplicar cambios (${excelPreview.length} productos)`}
                  </SunmiButton>
                </>
              )}
            </>
          )}

          {/* Mensajes de error / exito */}
          {errorMsg && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {successMsg}
            </div>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
