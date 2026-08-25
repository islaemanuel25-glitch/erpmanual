"use client";

import { useEffect, useRef, useState } from "react";

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
    // El estado que viene de tocar una card de "Estado del stock". El servidor
    // lo valida contra la lista del dominio: si llega cualquier otra cosa, lo
    // ignora en vez de devolver una lista vacía sin explicación.
    if (filtro.estado) params.set("estado", filtro.estado);

    return params.toString();
  };

  // ── `refrescar` DISPARABA DOS LISTADOS POR CADA GUARDADO ─────────────────
  //
  // Está en las dependencias del efecto y hace un viaje de ida y vuelta: lo
  // prende quien guarda, y el `finally` de acá abajo lo devuelve a false. Las
  // DOS transiciones re-ejecutaban el efecto, así que cada Ajustar o Límites
  // pedía el listado dos veces.
  //
  // No rompía nada —el segundo pedido traía lo mismo— y por eso llevaba ahí
  // desde antes de esta tanda. Lo destapó medir la secuencia de red: el segundo
  // listado arrancaba DESPUÉS del resumen y se solapaba con él, justo lo que la
  // coordinación existe para evitar.
  //
  // Ahora se pide cuando cambió algo de verdad —ubicación, filtros o página— o
  // cuando alguien PRENDIÓ el refresco. La vuelta a false no dispara nada.
  const claveRef = useRef(null);

  useEffect(() => {
    if (!localSeleccionado) {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }

    const clave = `${localSeleccionado}|${JSON.stringify(filtro)}|${page}`;
    if (!refrescar && claveRef.current === clave) return;
    claveRef.current = clave;

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
