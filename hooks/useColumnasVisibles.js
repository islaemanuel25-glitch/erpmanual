"use client";

import { useEffect, useState } from "react";

// Definición de columnas + visibilidad persistida en localStorage. Extraído de
// components/stock_locales/TablaStock.jsx sin cambiar comportamiento.

export const COLUMN_DEFS = [
  { key: "producto",   label: "Producto",   align: "left",   required: true },
  { key: "codigo",     label: "Código",     align: "left"   },
  { key: "unidad",     label: "Unidad",     align: "left"   },
  { key: "stock",      label: "Stock",      align: "right",  required: true },
  { key: "min",        label: "Mín",        align: "right"  },
  { key: "max",        label: "Máx",        align: "right"  },
  { key: "costo",      label: "Costo",      align: "right"  },
  { key: "venta",      label: "Venta",      align: "right"  },
  { key: "acciones",   label: "Acciones",   align: "center", required: true },
];

const LS_KEY = "stockColumnsVisible_v1";
const DEFAULT_VISIBLE = COLUMN_DEFS.map((c) => c.key);

function loadVisibleCols() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    // Ensure required columns are always present
    const required = COLUMN_DEFS.filter((c) => c.required).map((c) => c.key);
    const merged = [...new Set([...required, ...parsed])];
    return merged.filter((k) => COLUMN_DEFS.some((d) => d.key === k));
  } catch {
    return DEFAULT_VISIBLE;
  }
}

function saveVisibleCols(cols) {
  localStorage.setItem(LS_KEY, JSON.stringify(cols));
}

export function useColumnasVisibles() {
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);

  // Cargar desde localStorage al montar
  useEffect(() => {
    setVisibleCols(loadVisibleCols());
  }, []);

  const isVisible = (key) => visibleCols.includes(key);

  const toggleCol = (key) => {
    const def = COLUMN_DEFS.find((c) => c.key === key);
    if (def?.required) return;
    const next = isVisible(key)
      ? visibleCols.filter((k) => k !== key)
      : [...visibleCols, key];
    setVisibleCols(next);
    saveVisibleCols(next);
  };

  const visibleCount = COLUMN_DEFS.filter((c) => isVisible(c.key)).length;

  return { visibleCols, isVisible, toggleCol, visibleCount, COLUMN_DEFS };
}
