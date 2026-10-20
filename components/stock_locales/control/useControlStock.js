"use client";

// components/stock_locales/control/useControlStock.js
//
// EL ESTADO DE LA PANTALLA DEL CONTROL DE STOCK: qué vista se ve, lo que
// contestó el servidor y las acciones. La pantalla (`PantallaControlStock`) no
// pide nada: dibuja lo que esto le da.
//
// Dos vistas de una misma página: la lista de tarjetas (o, sin control, el
// "Empezar control") y terminar. El "Contar" de un vendido en terminar vuelve a
// la lista con ese producto arriba y el foco en su campo, igual que escanearlo.
//
// Guardar un total actualiza la tarjeta y los contadores con lo que contesta
// el servidor, sin volver a pedir la lista: la tarjeta no salta de lugar ni
// desaparece del filtro mientras se está contando al lado.
//
// Un 428 es "falta el PIN": se levanta el mismo modal que en la caja.

import { useCallback, useEffect, useRef, useState } from "react";
import { useOperadorContext } from "@/app/context/OperadorContext";
import { FILTRO_CONTROL, VISTA_CONTROL } from "@/lib/stock/control/controlStock";

const API = "/api/stock_locales/control";
const ESPERA_BUSQUEDA_MS = 300;

export function useControlStock() {
  const { requerirOperador } = useOperadorContext();
  const [vista, setVista] = useState(VISTA_CONTROL.INICIO);
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);

  // La lista
  const [filtro, setFiltroCrudo] = useState(FILTRO_CONTROL.SIN_CONTAR);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [lista, setLista] = useState({ items: [], total: 0, totalPages: 1 });
  const [cargandoLista, setCargandoLista] = useState(false);
  // El producto que trajo el lector o el "Contar" de terminar: va arriba, aunque
  // el filtro lo oculte, y su campo recibe el foco (`foco` cambia en cada uno).
  const [fijado, setFijado] = useState(null);
  const [foco, setFoco] = useState(0);
  const buscadorRef = useRef(null);

  // Terminar
  const [terminar, setTerminar] = useState(null);

  const pedir = useCallback(
    async (url, opciones = {}) => {
      let r;
      try {
        r = await fetch(url, {
          credentials: "include",
          ...opciones,
          headers: { "content-type": "application/json", ...(opciones.headers || {}) },
        });
      } catch {
        return { ok: false, error: "Sin conexión." };
      }
      const datos = await r.json().catch(() => ({}));
      if (r.status === 428) requerirOperador();
      if (!r.ok || datos.ok === false) {
        return { ok: false, status: r.status, error: datos.error || `El servidor contestó ${r.status}.`, ...datos };
      }
      return { ok: true, ...datos };
    },
    [requerirOperador]
  );

  const recargar = useCallback(async () => {
    const r = await pedir(API);
    if (!r.ok) {
      setError(r.error);
    } else {
      setError(null);
      setEstado(r);
    }
    setCargando(false);
    return r;
  }, [pedir]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const hayControl = Boolean(estado?.control);

  /** Los contadores que llegan con cada lista y con cada guardado. */
  const ponerResumen = useCallback((resumen) => {
    if (!resumen) return;
    setEstado((e) => (e?.control ? { ...e, control: { ...e.control, ...resumen } } : e));
  }, []);

  // La lista se pide de nuevo cuando cambia el filtro, el texto o la página.
  useEffect(() => {
    if (!hayControl || vista !== VISTA_CONTROL.INICIO) return undefined;
    let vigente = true;
    const t = setTimeout(async () => {
      setCargandoLista(true);
      const qs = new URLSearchParams({ page: String(page) });
      if (filtro) qs.set("filtro", filtro);
      if (q.trim()) qs.set("q", q.trim());
      const r = await pedir(`${API}/productos?${qs}`);
      if (!vigente) return;
      setCargandoLista(false);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      setLista({ items: r.items, total: r.total, totalPages: r.totalPages });
      ponerResumen(r.resumen);
    }, q ? ESPERA_BUSQUEDA_MS : 0);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [hayControl, vista, filtro, q, page, pedir, ponerResumen]);

  const setFiltro = useCallback((f) => {
    setFiltroCrudo(f);
    setPage(1);
    setFijado(null);
  }, []);

  const buscar = useCallback((texto) => {
    setQ(texto);
    setPage(1);
  }, []);

  const volverAlInicio = useCallback(() => {
    setVista(VISTA_CONTROL.INICIO);
    setAviso(null);
    recargar();
  }, [recargar]);

  const abrir = useCallback(async () => {
    setOcupado(true);
    const r = await pedir(`${API}/abrir`, { method: "POST" });
    setOcupado(false);
    setAviso(r.ok ? null : r.error);
    await recargar();
  }, [pedir, recargar]);

  /** Trae UNA tarjeta —por código leído o por id— y le da el foco. */
  const fijar = useCallback(
    async (consulta) => {
      const r = await pedir(`${API}/productos?${new URLSearchParams(consulta)}`);
      if (!r.ok || !r.item) {
        setAviso(r.error || "No se encontró el producto.");
        return;
      }
      setAviso(null);
      setFijado(r.item);
      setFoco((n) => n + 1);
    },
    [pedir]
  );

  const escanear = useCallback((codigo) => fijar({ codigo: String(codigo).trim() }), [fijar]);

  const irAContar = useCallback(
    (productoLocalId) => {
      setVista(VISTA_CONTROL.INICIO);
      setAviso(null);
      fijar({ productoLocalId: String(productoLocalId) });
    },
    [fijar]
  );

  /**
   * GUARDAR EL TOTAL de un producto (`null` lo borra). Devuelve si se guardó:
   * la tarjeta decide con eso si muestra "No se guardó".
   */
  const guardarTotal = useCallback(
    async (productoLocalId, total) => {
      const r = await pedir(`${API}/conteos`, {
        method: "PUT",
        body: JSON.stringify({ productoLocalId, total }),
      });
      if (!r.ok) {
        setAviso(r.error);
        return false;
      }
      setAviso(null);
      if (r.item) {
        setLista((l) => ({ ...l, items: l.items.map((i) => (i.id === r.item.id ? r.item : i)) }));
        setFijado((f) => (f && f.id === r.item.id ? r.item : f));
      }
      ponerResumen(r.resumen);
      return true;
    },
    [pedir, ponerResumen]
  );

  const alBuscador = useCallback(() => buscadorRef.current?.focus(), []);

  const cargarTerminar = useCallback(async () => {
    setTerminar(null);
    const r = await pedir(`${API}/terminar`);
    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setTerminar({ vendidos: r.vendidos, aCero: r.aCero });
  }, [pedir]);

  const irATerminar = useCallback(() => {
    setVista(VISTA_CONTROL.TERMINAR);
    setAviso(null);
    cargarTerminar();
  }, [cargarTerminar]);

  // `ocupado` deshabilita el botón, pero llega un render tarde: dos toques
  // seguidos alcanzarían a mandar dos pedidos. La llave es síncrona.
  const terminando = useRef(false);
  const confirmarTerminar = useCallback(async () => {
    if (!terminar || terminando.current) return;
    terminando.current = true;
    setOcupado(true);
    const r = await pedir(`${API}/terminar`, {
      method: "POST",
      body: JSON.stringify({ productos: terminar.aCero.map((p) => p.productoLocalId) }),
    });
    terminando.current = false;
    setOcupado(false);
    if (!r.ok) {
      setAviso(r.error);
      // La lista cambió desde que se mostró: se trae la nueva para revisarla.
      if (r.cambioLaLista) cargarTerminar();
      return;
    }
    volverAlInicio();
  }, [terminar, pedir, cargarTerminar, volverAlInicio]);

  return {
    vista,
    estado,
    cargando,
    error,
    ocupado,
    aviso,
    filtro,
    q,
    page,
    lista,
    cargandoLista,
    fijado,
    foco,
    buscadorRef,
    terminar,
    recargar,
    abrir,
    setFiltro,
    buscar,
    setPage,
    escanear,
    irAContar,
    guardarTotal,
    alBuscador,
    irATerminar,
    volverAlInicio,
    confirmarTerminar,
  };
}
