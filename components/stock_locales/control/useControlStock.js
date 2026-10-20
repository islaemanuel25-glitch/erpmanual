"use client";

// components/stock_locales/control/useControlStock.js
//
// EL ESTADO DE LA PANTALLA DEL CONTROL DE STOCK: qué vista se ve, lo que
// contestó el servidor y las acciones. La pantalla (`PantallaControlStock`) no
// pide nada: dibuja lo que esto le da.
//
// Las tres vistas son de una misma página —inicio, contar, terminar—, como
// Sueldos con sus detalles: el "Contar" de un vendido en Terminar lleva a
// contar con ese producto ya cargado, sin perder dónde se estaba.
//
// Un 428 es "falta el PIN": se levanta el mismo modal que en la caja.

import { useCallback, useEffect, useState } from "react";
import { useOperadorContext } from "@/app/context/OperadorContext";
import { VISTA_CONTROL } from "@/lib/stock/control/controlStock";

const API = "/api/stock_locales/control";

/** La cantidad con la que arranca un producto recién escaneado. */
const cantidadInicial = (producto) => (producto?.admiteDecimales ? "" : "1");

export function useControlStock() {
  const { requerirOperador } = useOperadorContext();
  const [vista, setVista] = useState(VISTA_CONTROL.INICIO);
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Contar
  const [escaneado, setEscaneado] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [vueltas, setVueltas] = useState(0);
  const [editando, setEditando] = useState(null);

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
        return { ok: false, error: "Sin conexión: no se sabe si se guardó. Mirá la lista antes de repetirlo." };
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

  const volverAlInicio = useCallback(() => {
    setVista(VISTA_CONTROL.INICIO);
    setEscaneado(null);
    setEditando(null);
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

  /** Carga el producto para contar: su unidad y el aviso de "ya contado". */
  const elegirProducto = useCallback(
    async (productoLocalId) => {
      setAviso(null);
      setEditando(null);
      const r = await pedir(`${API}/producto?productoLocalId=${Number(productoLocalId)}`);
      if (!r.ok) {
        setEscaneado(null);
        setAviso(r.error);
        return;
      }
      setEscaneado({ ...r.producto, aviso: r.aviso });
      setCantidad(cantidadInicial(r.producto));
    },
    [pedir]
  );

  const irAContar = useCallback(
    (productoLocalId = null) => {
      setVista(VISTA_CONTROL.CONTAR);
      setEscaneado(null);
      setAviso(null);
      if (productoLocalId) elegirProducto(productoLocalId);
    },
    [elegirProducto]
  );

  const guardar = useCallback(async () => {
    if (!escaneado || cantidad === "") return;
    setOcupado(true);
    const r = await pedir(`${API}/conteos`, {
      method: "POST",
      body: JSON.stringify({ productoLocalId: escaneado.productoLocalId, cantidad: Number(cantidad) }),
    });
    setOcupado(false);
    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setAviso(null);
    setEscaneado(null);
    setCantidad("");
    // El buscador se vuelve a montar: arranca vacío y con el foco puesto, listo
    // para el próximo escaneo.
    setVueltas((n) => n + 1);
    recargar();
  }, [escaneado, cantidad, pedir, recargar]);

  const empezarAEditar = useCallback((c) => {
    setEditando({ id: c.id, cantidad: String(c.cantidad), admiteDecimales: c.admiteDecimales, unidad: c.unidad });
  }, []);

  const corregir = useCallback(
    async ({ borrar = false } = {}) => {
      if (!editando) return;
      if (!borrar && editando.cantidad === "") return;
      setOcupado(true);
      const r = await pedir(`${API}/conteos/${editando.id}`, {
        method: borrar ? "DELETE" : "PATCH",
        ...(borrar ? {} : { body: JSON.stringify({ cantidad: Number(editando.cantidad) }) }),
      });
      setOcupado(false);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      setAviso(null);
      setEditando(null);
      setVueltas((n) => n + 1);
      recargar();
    },
    [editando, pedir, recargar]
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

  const confirmarTerminar = useCallback(async () => {
    if (!terminar) return;
    setOcupado(true);
    const r = await pedir(`${API}/terminar`, {
      method: "POST",
      body: JSON.stringify({ productos: terminar.aCero.map((p) => p.productoLocalId) }),
    });
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
    escaneado,
    cantidad,
    vueltas,
    editando,
    terminar,
    recargar,
    abrir,
    irAContar,
    irATerminar,
    volverAlInicio,
    elegirProducto,
    setCantidad,
    guardar,
    empezarAEditar,
    cambiarEdicion: (valor) => setEditando((e) => (e ? { ...e, cantidad: valor } : e)),
    cancelarEdicion: () => setEditando(null),
    corregir,
    confirmarTerminar,
  };
}
