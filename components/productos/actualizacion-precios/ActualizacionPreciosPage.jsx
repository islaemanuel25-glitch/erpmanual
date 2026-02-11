"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import PreviewPreciosTable from "./PreviewPreciosTable";

const INITIAL_FORM = {
  proveedorId: "",
  pricingMode: "KEEP_VENTA",
  increaseKind: "PCT",
  increaseValue: "",
};

function normalizePreviewItem(item) {
  return {
    productoBaseId: item?.productoBaseId,
    nombre: item?.nombre ?? item?.productoNombre ?? item?.descripcion ?? "",
    costoAnterior: Number(item?.costoAnterior ?? 0),
    costoNuevo: Number(item?.costoNuevo ?? 0),
    ventaAnterior: Number(item?.ventaAnterior ?? 0),
    ventaNueva: Number(item?.ventaNueva ?? 0),
  };
}

export default function ActualizacionPreciosPage() {
  const router = useRouter();

  const [form, setForm] = useState(INITIAL_FORM);
  const [proveedores, setProveedores] = useState([]);
  const [loadingProveedores, setLoadingProveedores] = useState(true);

  const [previewItems, setPreviewItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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
        setErrorMsg("No se pudieron cargar los proveedores.");
      } finally {
        setLoadingProveedores(false);
      }
    };

    cargarProveedores();
  }, [router]);

  const selectedItems = useMemo(() => {
    const byId = new Set(selectedIds);
    return previewItems
      .filter((it) => byId.has(String(it.productoBaseId)))
      .map((it) => ({
        productoBaseId: it.productoBaseId,
        costoAnterior: it.costoAnterior,
        costoNuevo: it.costoNuevo,
        ventaAnterior: it.ventaAnterior,
        ventaNueva: it.ventaNueva,
      }));
  }, [previewItems, selectedIds]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const parseServerError = async (res, fallbackText) => {
    try {
      const data = await res.json();
      return data?.error || data?.message || fallbackText;
    } catch {
      return fallbackText;
    }
  };

  const handlePreview = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!form.proveedorId) {
      setErrorMsg("Seleccioná un proveedor.");
      return;
    }

    const increaseValueNum = Number(form.increaseValue);
    if (!Number.isFinite(increaseValueNum)) {
      setErrorMsg("Ingresá un valor numérico para el aumento.");
      return;
    }

    setLoadingPreview(true);
    try {
      const res = await fetch("/api/productos/precios/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: Number(form.proveedorId),
          pricingMode: form.pricingMode,
          increase: {
            kind: form.increaseKind,
            value: increaseValueNum,
          },
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        const parsedError = await parseServerError(res, "Error al previsualizar.");
        setErrorMsg(parsedError);
        return;
      }

      const data = await res.json();
      const rawItems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.preview)
          ? data.preview
          : [];

      const normalized = rawItems
        .map(normalizePreviewItem)
        .filter((it) => it.productoBaseId != null);

      setPreviewItems(normalized);
      setSelectedIds(new Set(normalized.map((it) => String(it.productoBaseId))));

      if (normalized.length === 0) {
        setSuccessMsg("No hay productos para actualizar con los criterios elegidos.");
      }
    } catch (err) {
      console.error("Error en preview:", err);
      setErrorMsg("No se pudo generar la previsualización.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleApply = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!form.proveedorId) {
      setErrorMsg("Seleccioná un proveedor.");
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMsg("Seleccioná al menos un producto para aplicar.");
      return;
    }

    setLoadingApply(true);
    try {
      const res = await fetch("/api/productos/precios/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: Number(form.proveedorId),
          metodo: "AUMENTO",
          pricingMode: form.pricingMode,
          items: selectedItems,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        const parsedError = await parseServerError(res, "Error al aplicar precios.");
        setErrorMsg(parsedError);
        return;
      }

      const data = await res.json();
      setSuccessMsg(data?.message || "Aplicado OK");
    } catch (err) {
      console.error("Error en apply:", err);
      setErrorMsg("No se pudo aplicar la actualización de precios.");
    } finally {
      setLoadingApply(false);
    }
  };

  const toggleOne = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(previewItems.map((it) => String(it.productoBaseId))));
  };

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm md:text-base font-semibold text-slate-100">
              Actualización de Precios por Proveedor
            </h1>
            <SunmiButton color="cyan" onClick={() => router.push("/modulos/productos")}>
              Volver a productos
            </SunmiButton>
          </div>

          <SunmiSeparator label="Método" className="!my-0" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              type="button"
              className="h-[36px] px-3 rounded-md bg-amber-400 text-slate-900 text-[13px] font-medium"
            >
              Aumento por proveedor
            </button>
            <button
              type="button"
              disabled
              className="h-[36px] px-3 rounded-md bg-slate-800 text-slate-400 text-[13px] cursor-not-allowed"
            >
              Manual (Próximamente)
            </button>
            <button
              type="button"
              disabled
              className="h-[36px] px-3 rounded-md bg-slate-800 text-slate-400 text-[13px] cursor-not-allowed"
            >
              XLSX (Próximamente)
            </button>
          </div>

          <SunmiSeparator label="Parámetros" className="!my-0" />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <div>
              <label className="text-xs text-slate-300 mb-1 block">Proveedor</label>
              <SunmiSelect
                value={form.proveedorId}
                onChange={(e) => updateField("proveedorId", e.target.value)}
                disabled={loadingProveedores || loadingPreview || loadingApply}
              >
                <option value="">{loadingProveedores ? "Cargando..." : "Seleccionar"}</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </SunmiSelect>
            </div>

            <div>
              <label className="text-xs text-slate-300 mb-1 block">Modo de precios</label>
              <SunmiSelect
                value={form.pricingMode}
                onChange={(e) => updateField("pricingMode", e.target.value)}
                disabled={loadingPreview || loadingApply}
              >
                <option value="KEEP_VENTA">Mantener precio de venta</option>
                <option value="RECALC_BY_MARGIN">Recalcular por margen</option>
              </SunmiSelect>
            </div>

            <div>
              <label className="text-xs text-slate-300 mb-1 block">Tipo de aumento</label>
              <SunmiSelect
                value={form.increaseKind}
                onChange={(e) => updateField("increaseKind", e.target.value)}
                disabled={loadingPreview || loadingApply}
              >
                <option value="PCT">Porcentaje (%)</option>
                <option value="ABS">Valor absoluto ($)</option>
              </SunmiSelect>
            </div>

            <div>
              <label className="text-xs text-slate-300 mb-1 block">Valor</label>
              <SunmiInput
                type="number"
                step="0.01"
                value={form.increaseValue}
                onChange={(e) => updateField("increaseValue", e.target.value)}
                placeholder="Ej: 10"
                disabled={loadingPreview || loadingApply}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <SunmiButton
              color="amber"
              onClick={handlePreview}
              disabled={loadingPreview || loadingApply}
            >
              {loadingPreview ? "Previsualizando..." : "Previsualizar"}
            </SunmiButton>

            <SunmiButton
              color="cyan"
              onClick={handleApply}
              disabled={loadingPreview || loadingApply || selectedItems.length === 0}
            >
              {loadingApply
                ? "Aplicando..."
                : `Aplicar seleccionados (${selectedItems.length})`}
            </SunmiButton>
          </div>

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

          {previewItems.length > 0 ? (
            <>
              <SunmiSeparator label="Preview" className="!my-0" />
              <PreviewPreciosTable
                items={previewItems}
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
