"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import PreviewPreciosTable from "./PreviewPreciosTable";
import useActualizacionPrecios, { METODOS } from "./hooks/useActualizacionPrecios";
import SelectorGrupoActivo from "@/components/grupo/SelectorGrupoActivo";

const INITIAL_FORM = {
  proveedorId: "",
  pricingMode: "KEEP_VENTA",
  metodo: METODOS.AUMENTO,
  increaseKind: "PCT",
  increaseValue: "",
  rulesText: "",
  pasteText: "",
  manualRowsText: "",
};

function parseJsonArray(text) {
  if (!text?.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ActualizacionPreciosPage() {
  const router = useRouter();

  const [form, setForm] = useState(INITIAL_FORM);
  const [proveedores, setProveedores] = useState([]);
  const [loadingProveedores, setLoadingProveedores] = useState(true);
  const [tab, setTab] = useState("carga");

  const {
    loadingPreview,
    loadingApply,
    loadingHistory,
    preview,
    summary,
    alertas,
    selectedIds,
    selectedItems,
    history,
    historyDetail,
    errorMsg,
    successMsg,
    setErrorMsg,
    runPreview,
    runApply,
    loadHistory,
    loadHistoryDetail,
    toggleOne,
    toggleAll,
  } = useActualizacionPrecios(router);

  useEffect(() => {
    const cargarProveedores = async () => {
      setLoadingProveedores(true);
      try {
        const preferred = await fetch("/api/proveedores/opciones", {
          credentials: "include",
        });

        if (preferred.status === 401) {
          router.replace("/login");
          return;
        }

        if (preferred.ok) {
          const data = await preferred.json();
          const items = Array.isArray(data?.items) ? data.items : [];
          setProveedores(items);
          return;
        }

        const fallback = await fetch("/api/catalogos/proveedores", {
          credentials: "include",
        });

        if (fallback.status === 401) {
          router.replace("/login");
          return;
        }

        const dataFallback = await fallback.json();
        const itemsFallback = Array.isArray(dataFallback?.items)
          ? dataFallback.items
          : [];
        setProveedores(itemsFallback);
      } catch (err) {
        console.error("Error cargando proveedores:", err);
      } finally {
        setLoadingProveedores(false);
      }
    };

    cargarProveedores();
  }, [router]);

  useEffect(() => {
    if (tab === "historial") loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePreview = async () => {
    setErrorMsg("");

    if (!form.proveedorId) {
      setErrorMsg("Seleccioná un proveedor.");
      return;
    }

    const body = {
      // FIX: evitar Number("") => 0. Igual ya validamos arriba, pero queda blindado.
      proveedorId: form.proveedorId ? Number(form.proveedorId) : null,
      metodo: form.metodo,
      pricingMode: form.pricingMode,
    };

    if (form.metodo === METODOS.AUMENTO) {
      const value = Number(form.increaseValue);
      if (!Number.isFinite(value)) {
        setErrorMsg("Ingresá un valor numérico para el aumento.");
        return;
      }
      body.increase = { kind: form.increaseKind, value };
    }

    if (form.metodo === METODOS.REGLAS) {
      body.rules = parseJsonArray(form.rulesText);
      if (!body.rules.length) {
        setErrorMsg("Para reglas múltiples pegá un JSON de reglas válido.");
        return;
      }
    }

    if (form.metodo === METODOS.PEGADO) {
      body.pastedText = form.pasteText;
      if (!body.pastedText.trim()) {
        setErrorMsg("Pegá texto para procesar.");
        return;
      }
    }

    if (form.metodo === METODOS.MANUAL) {
      body.manualEdits = parseJsonArray(form.manualRowsText);
      if (!body.manualEdits.length) {
        setErrorMsg("Para edición manual pegá un JSON de filas válido.");
        return;
      }
    }

    await runPreview(body);
  };

  const handleApply = async () => {
    if (!form.proveedorId) {
      setErrorMsg("Seleccioná un proveedor.");
      return;
    }

    await runApply({
      // FIX: mantener consistente con preview (number)
      proveedorId: Number(form.proveedorId),
      metodo: form.metodo,
      pricingMode: form.pricingMode,
    });
  };

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm md:text-base font-semibold text-slate-100">
              Actualización de Precios por Proveedor
            </h1>
            <SunmiButton
              color="cyan"
              onClick={() => router.push("/modulos/productos")}
            >
              Volver a productos
            </SunmiButton>
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-[340px]">
            <SunmiButton
              color={tab === "carga" ? "amber" : "cyan"}
              onClick={() => setTab("carga")}
            >
              Carga + Preview
            </SunmiButton>
            <SunmiButton
              color={tab === "historial" ? "amber" : "cyan"}
              onClick={() => setTab("historial")}
            >
              Historial
            </SunmiButton>
          </div>

          {tab === "carga" ? (
            <>
              <SelectorGrupoActivo />
              <SunmiSeparator label="Paso 1 · Alcance" className="!my-0" />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <div>
                  <label className="text-xs text-slate-300 mb-1 block">
                    Proveedor
                  </label>
                  <SunmiSelect
                    value={form.proveedorId}
                    onChange={(e) =>
                      updateField("proveedorId", e.target.value)
                    }
                    disabled={loadingProveedores || loadingPreview || loadingApply}
                  >
                    <option value="">
                      {loadingProveedores ? "Cargando..." : "Seleccionar"}
                    </option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </SunmiSelect>
                </div>

                <div>
                  <label className="text-xs text-slate-300 mb-1 block">
                    Modo de precios
                  </label>
                  <SunmiSelect
                    value={form.pricingMode}
                    onChange={(e) =>
                      updateField("pricingMode", e.target.value)
                    }
                    disabled={loadingPreview || loadingApply}
                  >
                    <option value="KEEP_VENTA">Mantener precio de venta</option>
                    <option value="RECALC_BY_MARGIN">
                      Recalcular por margen
                    </option>
                    <option value="SET_VENTA">Venta enviada por método</option>
                  </SunmiSelect>
                </div>

                <div>
                  <label className="text-xs text-slate-300 mb-1 block">
                    Método
                  </label>
                  <SunmiSelect
                    value={form.metodo}
                    onChange={(e) => updateField("metodo", e.target.value)}
                    disabled={loadingPreview || loadingApply}
                  >
                    <option value={METODOS.AUMENTO}>A) Porcentaje/absoluto</option>
                    <option value={METODOS.REGLAS}>B) Reglas múltiples</option>
                    <option value={METODOS.PEGADO}>C) Pegado texto/PDF</option>
                    <option value={METODOS.MANUAL}>D) Manual</option>
                  </SunmiSelect>
                </div>
              </div>

              <SunmiSeparator label="Paso 2 · Definir cambios" className="!my-0" />

              {form.metodo === METODOS.AUMENTO ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-300 mb-1 block">
                      Tipo de aumento
                    </label>
                    <SunmiSelect
                      value={form.increaseKind}
                      onChange={(e) =>
                        updateField("increaseKind", e.target.value)
                      }
                      disabled={loadingPreview || loadingApply}
                    >
                      <option value="PCT">Porcentaje (%)</option>
                      <option value="ABS">Valor absoluto ($)</option>
                    </SunmiSelect>
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 mb-1 block">
                      Valor
                    </label>
                    <SunmiInput
                      type="number"
                      step="0.01"
                      value={form.increaseValue}
                      onChange={(e) =>
                        updateField("increaseValue", e.target.value)
                      }
                      placeholder="Ej: 10"
                      disabled={loadingPreview || loadingApply}
                    />
                  </div>
                </div>
              ) : null}

              {form.metodo === METODOS.REGLAS ? (
                <div>
                  <label className="text-xs text-slate-300 mb-1 block">
                    Reglas (JSON array) · última regla pisa
                  </label>
                  <textarea
                    className="w-full min-h-[120px] rounded-md bg-slate-900 border border-slate-700 p-2 text-xs text-slate-100"
                    value={form.rulesText}
                    onChange={(e) => updateField("rulesText", e.target.value)}
                    placeholder='[{"match":{"nombreIncludes":"Coca"},"increase":{"kind":"PCT","value":5}}]'
                  />
                </div>
              ) : null}

              {form.metodo === METODOS.PEGADO ? (
                <div>
                  <label className="text-xs text-slate-300 mb-1 block">
                    Texto/PDF pegado (código|nombre|costo|venta)
                  </label>
                  <textarea
                    className="w-full min-h-[120px] rounded-md bg-slate-900 border border-slate-700 p-2 text-xs text-slate-100"
                    value={form.pasteText}
                    onChange={(e) => updateField("pasteText", e.target.value)}
                  />
                </div>
              ) : null}

              {form.metodo === METODOS.MANUAL ? (
                <div>
                  <label className="text-xs text-slate-300 mb-1 block">
                    Filas manuales (JSON array)
                  </label>
                  <textarea
                    className="w-full min-h-[120px] rounded-md bg-slate-900 border border-slate-700 p-2 text-xs text-slate-100"
                    value={form.manualRowsText}
                    onChange={(e) =>
                      updateField("manualRowsText", e.target.value)
                    }
                    placeholder='[{"productoBaseId":12,"costoNuevo":1000,"ventaNueva":1300}]'
                  />
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-2">
                <SunmiButton
                  color="amber"
                  onClick={handlePreview}
                  disabled={loadingPreview || loadingApply}
                >
                  {loadingPreview ? "Previsualizando..." : "Paso 3 · Previsualizar"}
                </SunmiButton>

                <SunmiButton
                  color="cyan"
                  onClick={handleApply}
                  disabled={loadingPreview || loadingApply || selectedItems.length === 0}
                >
                  {loadingApply
                    ? "Aplicando..."
                    : `Paso 4 · Confirmar y aplicar (${selectedItems.length})`}
                </SunmiButton>
              </div>

              {summary ? (
                <div className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
                  Total preview: {summary.total ?? 0} · Críticas:{" "}
                  {alertas.criticas ?? 0} · Advertencias:{" "}
                  {alertas.advertencias ?? 0}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <SunmiSeparator label="Historial" className="!my-0" />
              {loadingHistory ? (
                <div className="text-xs text-slate-400">Cargando...</div>
              ) : null}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <div className="rounded-md border border-slate-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900 text-slate-200">
                      <tr>
                        <th className="text-left p-2">Fecha</th>
                        <th className="text-left p-2">Proveedor</th>
                        <th className="text-left p-2">Método</th>
                        <th className="text-right p-2">Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr
                          key={row.id}
                          className="bg-slate-950 hover:bg-slate-900 cursor-pointer"
                          onClick={() => loadHistoryDetail(row.id)}
                        >
                          <td className="p-2">{row.fecha}</td>
                          <td className="p-2">{row.proveedorNombre || "-"}</td>
                          <td className="p-2">{row.metodo}</td>
                          <td className="p-2 text-right">{row.itemsCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-md border border-slate-800 p-2">
                  <div className="text-xs text-slate-200 font-medium mb-2">
                    Detalle
                  </div>
                  {!historyDetail ? (
                    <div className="text-xs text-slate-400">
                      Seleccioná una fila del historial.
                    </div>
                  ) : (
                    <div className="text-xs text-slate-300 space-y-1">
                      <div>Update ID: {historyDetail.id}</div>
                      <div>Método: {historyDetail.metodo}</div>
                      <div>Pricing mode: {historyDetail.pricingMode}</div>
                      <div>Items: {historyDetail.items?.length || 0}</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {errorMsg ? (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {errorMsg}
            </div>
          ) : null}

          {successMsg ? (
            <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {successMsg}
            </div>
          ) : null}

          {tab === "carga" && preview.length > 0 ? (
            <>
              <SunmiSeparator label="Preview obligatorio" className="!my-0" />
              <PreviewPreciosTable
                items={preview}
                selectedIds={selectedIds}
                onToggleOne={toggleOne}
                onToggleAll={toggleAll}
              />
            </>
          ) : null}
        </div>
      </SunmiCard>
    </div>
  );
}
