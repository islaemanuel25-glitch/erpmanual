"use client";

import { useEffect, useState } from "react";

// Fetch + estado del listado de Stock Locales. Extraído de TablaStock.jsx SIN
// cambiar comportamiento: mismos params, mismo endpoint, misma dependencia de
// efecto (incluida la limpieza de `refrescar`). La presentación queda en la tabla.
export function useStockData({ localSeleccionado, filtro, page, refrescar, setRefrescar }) {
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", page);
    params.set("localId", localSeleccionado);

    if (filtro.q) params.set("q", filtro.q);
    if (filtro.categoria) params.set("categoria", filtro.categoria);
    if (filtro.proveedor) params.set("proveedor", filtro.proveedor);
    if (filtro.area) params.set("area", filtro.area);

    if (filtro.conStock) params.set("conStock", "true");
    if (filtro.sinStock) params.set("sinStock", "true");
    if (filtro.faltantes) params.set("faltantes", "true");
    if (filtro.negativo) params.set("negativo", "true");

    return params.toString();
  };

  useEffect(() => {
    if (!localSeleccionado) {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }

    let cancelado = false;
    const debeLimpiar = refrescar;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = buildQuery();
        const res = await fetch(`/api/stock_locales/listar?${qs}`, {
          cache: "no-store",
        });

        const json = await res.json();
        if (!json.ok) {
          if (!cancelado) {
            setError(json.error || "Error cargando stock.");
            setItems([]);
            setTotal(0);
            setTotalPages(1);
          }
          return;
        }

        if (!cancelado) {
          setItems(json.items || []);
          setTotal(json.total || 0);
          setTotalPages(json.totalPages || 1);
        }
      } catch (err) {
        console.error("Error cargando stock:", err);
        if (!cancelado) setError("Error interno al cargar stock.");
      } finally {
        if (!cancelado) {
          setLoading(false);
          if (debeLimpiar) setRefrescar(false);
        }
      }
    };

    fetchData();
    return () => (cancelado = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSeleccionado, JSON.stringify(filtro), page, refrescar]);

  return { items, total, totalPages, loading, error };
}
