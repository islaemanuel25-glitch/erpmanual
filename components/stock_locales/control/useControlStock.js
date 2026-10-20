"use client";

// components/stock_locales/control/useControlStock.js
//
// EL ESTADO DE LA PANTALLA DEL CONTROL DE STOCK: qué vista se ve, lo que
// contestó el servidor y las acciones. La pantalla (`PantallaControlStock`) no
// pide nada: dibuja lo que esto le da.
//
// Tres vistas de una misma página: la lista de tarjetas (o, sin control, el
// "Empezar control" y el historial), terminar, y las diferencias de un control.
//
// ── LA LISTA ES LA DE STOCK LOCALES ─────────────────────────────────────────
//
// Mismo `FiltrosStock`, mismo `useStockData`, mismo `/api/stock_locales/listar`
// —universo, orden y página—. Lo único que agrega el control es el chip
// (`filtro.control`), con el que el listado trae el conteo de cada producto y
// los contadores. Los filtros de `FiltrosStock` se FUSIONAN con el chip, igual
// que Stock Locales fusiona la card de estado: buscar no apaga el chip.
//
// Guardar un total actualiza la tarjeta y los contadores con lo que contesta
// el servidor, sin volver a pedir la lista: la tarjeta no salta de lugar ni
// desaparece del filtro mientras se está contando al lado.
//
// Un 428 es "falta el PIN": se levanta el mismo modal que en la caja.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOperadorContext } from "@/app/context/OperadorContext";
import { useStockData } from "@/hooks/useStockData";
import { FILTRO_CONTROL, VISTA_CONTROL } from "@/lib/stock/control/controlStock";

const API = "/api/stock_locales/control";

export function useControlStock({ puedeGestionar = false } = {}) {
  const { requerirOperador } = useOperadorContext();
  const [vista, setVista] = useState(VISTA_CONTROL.INICIO);
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);

  // La lista
  const [filtros, setFiltros] = useState({});
  const [chip, setChipCrudo] = useState(FILTRO_CONTROL.TODOS);
  const [page, setPage] = useState(1);
  const [refrescar, setRefrescar] = useState(false);
  // Lo que contestó cada guardado, por producto, hasta que llegue otra lista.
  const [guardados, setGuardados] = useState({});
  const [resumen, setResumen] = useState(null);
  // El producto que trajo el lector o el "Contar" de terminar: va arriba, aunque
  // el filtro lo oculte, y su campo recibe el foco (`foco` cambia en cada uno).
  const [fijado, setFijado] = useState(null);
  const [foco, setFoco] = useState(0);
  // El contenedor de `FiltrosStock`: Enter en una cantidad vuelve a su buscador.
  const buscadorRef = useRef(null);

  // Terminar y diferencias
  const [terminar, setTerminar] = useState(null);
  const [diferencias, setDiferencias] = useState(null);

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
  const listando = hayControl && vista === VISTA_CONTROL.INICIO;

  const filtroDelListado = useMemo(() => ({ ...filtros, control: chip }), [filtros, chip]);
  const listado = useStockData({
    localSeleccionado: listando ? estado?.local?.id ?? null : null,
    filtro: filtroDelListado,
    page,
    refrescar,
    setRefrescar,
  });

  // Una lista nueva trae los conteos al día: lo guardado a mano ya está adentro.
  useEffect(() => {
    setGuardados({});
  }, [listado.items]);

  useEffect(() => {
    if (listado.resumenControl) setResumen(listado.resumenControl);
  }, [listado.resumenControl]);

  const items = useMemo(() => listado.items.map((i) => guardados[i.id] ?? i), [listado.items, guardados]);

  /** Los contadores: los de la última lista o el último guardado, si no los del inicio. */
  const contadores = resumen ?? estado?.control ?? null;

  const alCambiarFiltros = useCallback((nuevos) => {
    setPage(1);
    setFiltros(nuevos);
  }, []);

  const alLimpiar = useCallback(() => {
    setPage(1);
    setFiltros({});
  }, []);

  const setChip = useCallback((clave) => {
    setChipCrudo(clave ?? FILTRO_CONTROL.TODOS);
    setPage(1);
    setFijado(null);
  }, []);

  const volverAlInicio = useCallback(() => {
    setVista(VISTA_CONTROL.INICIO);
    setAviso(null);
    setDiferencias(null);
    setRefrescar(true);
    recargar();
  }, [recargar]);

  const abrir = useCallback(async () => {
    setOcupado(true);
    const r = await pedir(`${API}/abrir`, { method: "POST" });
    setOcupado(false);
    setAviso(r.ok ? null : r.error);
    setResumen(null);
    await recargar();
  }, [pedir, recargar]);

  /** Trae UNA tarjeta —por código leído o por id— y le da el foco. Contesta si la encontró. */
  const fijar = useCallback(
    async (consulta) => {
      const r = await pedir(`${API}/productos?${new URLSearchParams(consulta)}`);
      if (!r.ok) {
        setAviso(r.error);
        return false;
      }
      if (!r.item) return false;
      setAviso(null);
      setFijado(r.item);
      setFoco((n) => n + 1);
      return true;
    },
    [pedir]
  );

  /**
   * EL LECTOR, desde el buscador de `FiltrosStock`: un código de un producto del
   * local lleva a su tarjeta. Si no lo encuentra, `FiltrosStock` filtra por el
   * texto, como siempre.
   */
  const escanear = useCallback((codigo) => fijar({ codigo: String(codigo).trim() }), [fijar]);

  /**
   * EL LECTOR, desde adentro de una cantidad: el texto no se puede poner en el
   * buscador de `FiltrosStock`, que es suyo. Sin producto, se avisa y el foco
   * vuelve al buscador para leer de nuevo.
   */
  const escanearDesdeLaCantidad = useCallback(
    async (codigo) => {
      const t = String(codigo).trim();
      const encontrado = await fijar({ codigo: t });
      if (!encontrado) {
        setAviso(`Ningún producto de este local tiene el código ${t}.`);
        buscadorRef.current?.querySelector("input")?.focus();
      }
    },
    [fijar]
  );

  const irAContar = useCallback(
    (productoLocalId) => {
      setVista(VISTA_CONTROL.INICIO);
      setAviso(null);
      fijar({ productoLocalId: String(productoLocalId) });
    },
    [fijar]
  );

  /**
   * GUARDAR UN PRODUCTO: `{ total }` (`null` lo borra) o `{ estaBien: true }`,
   * que es el stock del sistema. Devuelve si se guardó: la tarjeta decide con
   * eso si muestra "No se guardó".
   */
  const guardarTotal = useCallback(
    async (productoLocalId, cuerpo) => {
      const r = await pedir(`${API}/conteos`, {
        method: "PUT",
        body: JSON.stringify({ productoLocalId, ...cuerpo }),
      });
      if (!r.ok) {
        setAviso(r.error);
        return false;
      }
      setAviso(null);
      if (r.item) {
        setGuardados((g) => ({ ...g, [r.item.id]: r.item }));
        setFijado((f) => (f && f.id === r.item.id ? r.item : f));
      }
      if (r.resumen) setResumen(r.resumen);
      return true;
    },
    [pedir]
  );

  const alBuscador = useCallback(() => buscadorRef.current?.querySelector("input")?.focus(), []);

  // ── LA REVISIÓN: EL STOCK CONTRA LO CONTADO MÁS LO QUE PASÓ DESPUÉS ──────
  //
  // Solo quien gestiona: corregir mueve stock sin un conteo nuevo. Se pide al
  // entrar a la lista y después de cada corrección.
  const [revision, setRevision] = useState(null);
  const cargarRevision = useCallback(async () => {
    const r = await pedir(`${API}/revision`);
    setRevision(r.ok ? r : null);
  }, [pedir]);

  useEffect(() => {
    if (puedeGestionar && listando) cargarRevision();
  }, [puedeGestionar, listando, cargarRevision]);

  const corrigiendo = useRef(false);
  const corregirProducto = useCallback(
    async (productoLocalId) => {
      if (corrigiendo.current) return;
      corrigiendo.current = true;
      setOcupado(true);
      const r = await pedir(`${API}/revision`, { method: "POST", body: JSON.stringify({ productoLocalId }) });
      corrigiendo.current = false;
      setOcupado(false);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      setAviso(null);
      if (r.item) {
        setGuardados((g) => ({ ...g, [r.item.id]: r.item }));
        setFijado((f) => (f && f.id === r.item.id ? r.item : f));
      }
      cargarRevision();
    },
    [pedir, cargarRevision]
  );

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

  /** El informe de un control: sin `controlId`, el abierto. */
  const verDiferencias = useCallback(
    async (controlId = null) => {
      setVista(VISTA_CONTROL.DIFERENCIAS);
      setAviso(null);
      setDiferencias(null);
      const qs = controlId ? `?${new URLSearchParams({ controlId: String(controlId) })}` : "";
      const r = await pedir(`${API}/diferencias${qs}`);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      setDiferencias(r);
    },
    [pedir]
  );

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
    // Terminado, se abre su informe. El inicio se pone al día por detrás: al
    // volver ya está sin control y con este en el historial.
    setResumen(null);
    setFijado(null);
    recargar();
    verDiferencias(r.controlId);
  }, [terminar, pedir, cargarTerminar, recargar, verDiferencias]);

  return {
    vista,
    estado,
    cargando,
    error,
    ocupado,
    aviso,
    chip,
    page,
    items,
    totalPages: listado.totalPages,
    totalItems: listado.total,
    cargandoLista: listado.loading,
    errorLista: listado.error,
    contadores,
    fijado,
    foco,
    buscadorRef,
    terminar,
    diferencias,
    revision,
    corregirProducto,
    recargar,
    abrir,
    alCambiarFiltros,
    alLimpiar,
    setChip,
    setPage,
    escanear,
    escanearDesdeLaCantidad,
    irAContar,
    guardarTotal,
    alBuscador,
    irATerminar,
    verDiferencias,
    volverAlInicio,
    confirmarTerminar,
  };
}
