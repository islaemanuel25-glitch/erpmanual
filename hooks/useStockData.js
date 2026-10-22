"use client";

import { useEffect, useRef, useState } from "react";

/** El pedido del listado no tuvo respuesta: sin conexión, o se cortó. */
export const TEXTO_SIN_RESPUESTA = "No llegó respuesta del servidor al cargar el stock. Revisá la conexión y volvé a intentar.";

/** El servidor contestó, pero sin datos: el motivo está en su log con ese status. */
export const textoSinDatos = (status) => `El servidor contestó ${status} sin datos al cargar el stock.`;

// Fetch + estado del listado de Stock Locales. Extraído de TablaStock.jsx SIN
// cambiar comportamiento: mismos params, mismo endpoint, misma dependencia de
// efecto (incluida la limpieza de `refrescar`). La presentación queda en la tabla.
export function useStockData({ localSeleccionado, filtro, page, refrescar, setRefrescar }) {
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Solo con `filtro.control`: los contadores del Control de stock.
  const [resumenControl, setResumenControl] = useState(null);
  // Y qué pasó con un código: el producto que mostró, o que no hay ninguno.
  const [lecturaControl, setLecturaControl] = useState(null);

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
    // El chip del Control de stock: el mismo listado, con su conteo por ítem.
    if (filtro.control) params.set("control", filtro.control);
    // Y si el texto lo escribió el lector: un código que no es de ningún
    // producto del local se dice, en vez de buscarse como nombre.
    if (filtro.control && filtro.lectura) params.set("lectura", "1");

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

        // Una respuesta que no es JSON —un 500 que no pasó por el `catch` de la
        // ruta, un 502 o 504 del proxy— se dice con su status, no como "Error
        // interno": ése fue todo lo que se vio en producción el 2026-10-22.
        const cuerpo = await res.text();
        let json;
        try {
          json = JSON.parse(cuerpo);
        } catch {
          console.error(`Error cargando stock: el servidor contestó ${res.status} sin datos`, cuerpo.slice(0, 300));
          if (!cancelado) setError(textoSinDatos(res.status));
          return;
        }
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
          setResumenControl(json.resumenControl ?? null);
          setLecturaControl(json.lecturaControl ?? null);
        }
      } catch (err) {
        // `fetch` rechaza sin respuesta: el pedido no llegó o se cortó, y el
        // servidor no tiene nada que loguear.
        console.error("Error cargando stock:", err);
        if (!cancelado) setError(TEXTO_SIN_RESPUESTA);
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

  return { items, total, totalPages, loading, error, resumenControl, lecturaControl };
}
