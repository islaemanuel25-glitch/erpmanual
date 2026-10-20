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
import { useStockData } from "@/hooks/useStockData";
import {
  ESPERA_PARA_SALIR_DEL_CHIP_MS,
  FILTRO_CONTROL,
  VISTA_CONTROL,
  sigueEnElChip,
  textoCodigoSinProducto,
} from "@/lib/stock/control/controlStock";

const API = "/api/stock_locales/control";

// `requerirOperador` lo pasa la página desde `useOperadorContext`: así el hook
// se puede montar entero en el arnés de la tarjeta, que no tiene el shell.
export function useControlStock({ puedeGestionar = false, requerirOperador } = {}) {
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
  // El producto del "Contar" de terminar: va arriba, aunque el filtro lo oculte.
  const [fijado, setFijado] = useState(null);
  // La tarjeta que recibe el foco en su cantidad —la del "Contar", o la que
  // mostró un código—; `foco` cambia en cada una para que vuelva a tomarlo.
  const [foco, setFoco] = useState(0);
  const [focoId, setFocoId] = useState(null);
  // ── EL LECTOR ESCRIBE EN EL BUSCADOR ─────────────────────────────────────
  //
  // Lo leído va al buscador de `FiltrosStock` como texto, y el listado lo
  // resuelve como la caja: un código del local muestra solo ese producto. La
  // pantalla recuerda qué texto vino del lector (`ultimaLectura`) para pedir
  // `lectura`: un código leído que no es de nadie se dice, no se busca por nombre.
  const [ultimaLectura, setUltimaLectura] = useState(null);
  const [textoParaBuscador, setTextoParaBuscador] = useState(null);
  // Los que dejaron de ser del chip al guardarse: salen de la lista a los 1,5 s.
  const [salidos, setSalidos] = useState(() => new Set());
  const esperas = useRef([]);
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
      if (r.status === 428) requerirOperador?.();
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

  const filtroDelListado = useMemo(
    () => ({ ...filtros, control: chip, ...(filtros.q && filtros.q === ultimaLectura ? { lectura: true } : {}) }),
    [filtros, chip, ultimaLectura]
  );
  const listado = useStockData({
    localSeleccionado: listando ? estado?.local?.id ?? null : null,
    filtro: filtroDelListado,
    page,
    refrescar,
    setRefrescar,
  });

  // Una lista nueva trae los conteos al día: lo guardado a mano ya está adentro,
  // y lo que salió del chip ya no viene.
  useEffect(() => {
    setGuardados({});
    setSalidos(new Set());
  }, [listado.items]);

  useEffect(() => () => esperas.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (listado.resumenControl) setResumen(listado.resumenControl);
  }, [listado.resumenControl]);

  // Un código mostró su producto: el foco va a su cantidad.
  const porCodigo = listado.lecturaControl?.porCodigo ?? null;
  useEffect(() => {
    if (!porCodigo) return;
    setFocoId(porCodigo);
    setFoco((n) => n + 1);
  }, [porCodigo, listado.items]);

  const items = useMemo(
    () => listado.items.filter((i) => !salidos.has(i.id)).map((i) => guardados[i.id] ?? i),
    [listado.items, guardados, salidos]
  );

  // Lo que necesita el guardado sin quedar viejo en su closure.
  const chipVigente = useRef(chip);
  chipVigente.current = chip;
  const porCodigoVigente = useRef(porCodigo);
  porCodigoVigente.current = porCodigo;

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
      setFocoId(r.item.id);
      setFoco((n) => n + 1);
      return true;
    },
    [pedir]
  );

  /**
   * EL LECTOR, desde el buscador de `FiltrosStock`: se recuerda que el texto lo
   * leyó el lector y se contesta "no lo resolví acá", así `FiltrosStock` lo
   * pone en el buscador como siempre y el listado hace el resto.
   */
  const escanear = useCallback((codigo) => {
    setUltimaLectura(String(codigo).trim());
    return false;
  }, []);

  /**
   * EL LECTOR, desde adentro de una cantidad: lo leído no queda en la cantidad
   * —lo saca la tarjeta— y va al buscador, igual que si se hubiera leído ahí.
   */
  const escanearDesdeLaCantidad = useCallback((codigo) => {
    const t = String(codigo).trim();
    setUltimaLectura(t);
    setTextoParaBuscador((p) => ({ texto: t, vez: (p?.vez ?? 0) + 1 }));
  }, []);

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
   * que es el stock del sistema. Devuelve la tarjeta como quedó —o false si no
   * se guardó—: con "Está bien" el total lo decide el servidor, y la tarjeta lo
   * pone en el campo con lo que vuelve.
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
        // Dejó de ser del chip: se ve un momento cómo quedó y sale de la lista,
        // sin volver a pedirla. Con un código en el buscador no hay chip.
        if (!porCodigoVigente.current && !sigueEnElChip(r.item, chipVigente.current)) {
          const id = r.item.id;
          esperas.current.push(setTimeout(() => setSalidos((s) => new Set(s).add(id)), ESPERA_PARA_SALIR_DEL_CHIP_MS));
        }
      }
      if (r.resumen) setResumen(r.resumen);
      return r.item ?? true;
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
    // El aviso de una acción, o el de un código leído que no es de nadie.
    aviso: aviso ?? (listado.lecturaControl?.codigoSinProducto ? textoCodigoSinProducto(listado.lecturaControl.codigoSinProducto) : null),
    chip,
    page,
    items,
    totalPages: listado.totalPages,
    totalItems: Math.max(0, listado.total - salidos.size),
    cargandoLista: listado.loading,
    errorLista: listado.error,
    contadores,
    fijado,
    foco,
    focoId,
    textoParaBuscador,
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
