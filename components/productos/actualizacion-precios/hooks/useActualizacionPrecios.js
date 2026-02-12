"use client";

import { useMemo, useState } from "react";

export const METODOS = {
  AUMENTO: "AUMENTO",
  REGLAS: "REGLAS",
  PEGADO: "PEGADO",
  MANUAL: "MANUAL",
};

export default function useActualizacionPrecios(router) {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [preview, setPreview] = useState([]);
  const [summary, setSummary] = useState(null);
  const [alertas, setAlertas] = useState({ criticas: 0, advertencias: 0 });
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [history, setHistory] = useState([]);
  const [historyDetail, setHistoryDetail] = useState(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const selectedItems = useMemo(() => {
    const set = new Set(selectedIds);
    return preview
      .filter((it) => set.has(String(it.productoBaseId)))
      .map((it) => ({
        productoBaseId: it.productoBaseId,
        costoAnterior: it.costoAnterior,
        costoNuevo: it.costoNuevo,
        ventaAnterior: it.ventaAnterior,
        ventaNueva: it.ventaNueva,
      }));
  }, [preview, selectedIds]);

  const parseServerError = async (res, fallbackText) => {
    try {
      const data = await res.json();
      return data?.error || data?.message || fallbackText;
    } catch {
      return fallbackText;
    }
  };

  // -------------------------
  // LIMPIAR ESTADO AL CAMBIAR GRUPO
  // -------------------------
  const resetState = () => {
    setPreview([]);
    setSummary(null);
    setAlertas({ criticas: 0, advertencias: 0 });
    setSelectedIds(new Set());
    setHistory([]);
    setHistoryDetail(null);
    setErrorMsg("");
    setSuccessMsg("");
  };

  // -------------------------
  // PREVIEW
  // -------------------------
  const runPreview = async (body) => {
    setErrorMsg("");
    setSuccessMsg("");
    setLoadingPreview(true);

    try {
      const res = await fetch("/api/productos/precios/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        setErrorMsg(await parseServerError(res, "Error al previsualizar."));
        return;
      }

      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      setPreview(items);
      setSelectedIds(new Set(items.map((it) => String(it.productoBaseId))));
      setSummary(data?.summary || null);
      setAlertas(data?.alertas || { criticas: 0, advertencias: 0 });

      // Mostrar hint si viene
      if (data?.hint) {
        setSuccessMsg(data.hint);
      } else if (!items.length) {
        setSuccessMsg("No hay productos para actualizar con los criterios elegidos.");
      }
    } catch (err) {
      console.error("Error en preview:", err);
      setErrorMsg("No se pudo generar la previsualización.");
    } finally {
      setLoadingPreview(false);
    }
  };

  // -------------------------
  // APPLY
  // -------------------------
  const runApply = async ({ proveedorId, metodo, pricingMode }) => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedItems.length) {
      setErrorMsg("Seleccioná al menos un producto para aplicar.");
      return;
    }

    const prov = Number(proveedorId);
    if (!Number.isFinite(prov) || prov <= 0) {
      setErrorMsg("Seleccioná un proveedor válido.");
      return;
    }

    setLoadingApply(true);
    try {
      const res = await fetch("/api/productos/precios/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: prov,
          metodo,
          pricingMode,
          items: selectedItems,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        setErrorMsg(await parseServerError(res, "Error al aplicar precios."));
        return;
      }

      const data = await res.json();
      setSuccessMsg(data?.message || "Aplicado OK");
      await loadHistory();
    } catch (err) {
      console.error("Error en apply:", err);
      setErrorMsg("No se pudo aplicar la actualización de precios.");
    } finally {
      setLoadingApply(false);
    }
  };

  // -------------------------
  // HISTORY
  // -------------------------
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/productos/precios/history", {
        credentials: "include",
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();
      setHistory(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      console.error("Error cargando historial:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadHistoryDetail = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/productos/precios/history/${id}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setHistoryDetail(data?.item || null);
    } catch (e) {
      console.error("Error detalle historial:", e);
    }
  };

  // -------------------------
  // SELECCIÓN
  // -------------------------
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
    setSelectedIds(new Set(preview.map((it) => String(it.productoBaseId))));
  };

  return {
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
    setSuccessMsg,
    runPreview,
    runApply,
    loadHistory,
    loadHistoryDetail,
    toggleOne,
    toggleAll,
    resetState,
  };
}