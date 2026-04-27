"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import Encabezado from "@/components/pos-transferencias/nueva/Encabezado";
import TablaSugeridos from "@/components/pos-transferencias/nueva/TablaSugeridos";
import BuscadorManual from "@/components/pos-transferencias/nueva/BuscadorManual";
import PreparadosTable from "@/components/pos-transferencias/nueva/PreparadosTable";
import Separador from "@/components/pos-transferencias/nueva/Separador";

function unidadPlural(u) {
  if (!u) return "unidades";
  if (u === "unidad") return "unidades";
  if (u === "cajon") return "cajones";
  if (u === "pack") return "packs";
  return u + "s";
}

function norm(v, fallback) {
  return String(v || fallback).trim().toLowerCase();
}

const SENTINEL_ALL = "__ALL__";
const DEBUG_FILTROS = false;

function normalizarValorFiltro(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  if (v?.target?.value !== undefined) return String(v.target.value);
  return SENTINEL_ALL;
}

export default function NuevaTransferenciaPage() {
  const router = useRouter();
  const params = useSearchParams();

  // H1: Parsear query params — modo manual / posId / normal
  const qsModo = params.get("modo"); // "manual" | null
  const qsPosId = Number(params.get("posId") || 0);
  const qsOrigenId = Number(params.get("origenId") || 0);
  const qsDestinoId = Number(params.get("destinoId") || 0);

  const esModoManual = qsModo === "manual" || qsPosId > 0;

  const [me, setMe] = useState(null);
  const [origen, setOrigen] = useState(null);
  const [destino, setDestino] = useState(null);

  const [posId, setPosId] = useState(null);
  const [posEstado, setPosEstado] = useState("Borrador");
  const [origenIdResuelto, setOrigenIdResuelto] = useState(qsOrigenId);
  const [destinoIdResuelto, setDestinoIdResuelto] = useState(qsDestinoId);

  const [sugeridos, setSugeridos] = useState([]);
  const [loadingSug, setLoadingSug] = useState(false);

  const [texto, setTexto] = useState("");
  const [buscados, setBuscados] = useState([]);
  const [loadingBuscar, setLoadingBuscar] = useState(false);

  const [items, setItems] = useState([]);
  const [loadingDetalles, setLoadingDetalles] = useState(false);

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modoAgregarManual, setModoAgregarManual] = useState("manual"); // "manual" | "rotura"

  const [categoriaFiltro, setCategoriaFiltro] = useState(SENTINEL_ALL);
  const [areaFiltro, setAreaFiltro] = useState(SENTINEL_ALL);
  const [categoriaFiltroManual, setCategoriaFiltroManual] = useState(SENTINEL_ALL);
  const [areaFiltroManual, setAreaFiltroManual] = useState(SENTINEL_ALL);

  const SK_TRANS = "pos-trans-nueva";

  const [sugPage, setSugPageRaw] = useState(() => {
    try { return Number(sessionStorage.getItem(SK_TRANS + "-sugPage")) || 1; } catch { return 1; }
  });
  const [sugPageSize, setSugPageSizeRaw] = useState(() => {
    try { const v = Number(sessionStorage.getItem(SK_TRANS + "-sugPageSize")); return [25, 50, 100, 150, 200].includes(v) ? v : 50; } catch { return 50; }
  });
  const [manPage, setManPageRaw] = useState(() => {
    try { return Number(sessionStorage.getItem(SK_TRANS + "-manPage")) || 1; } catch { return 1; }
  });
  const [manPageSize, setManPageSizeRaw] = useState(() => {
    try { const v = Number(sessionStorage.getItem(SK_TRANS + "-manPageSize")); return [25, 50, 100, 150, 200].includes(v) ? v : 50; } catch { return 50; }
  });

  const [prepPage, setPrepPageRaw] = useState(() => {
    try { return Number(sessionStorage.getItem(SK_TRANS + "-prepPage")) || 1; } catch { return 1; }
  });
  const [prepPageSize, setPrepPageSizeRaw] = useState(() => {
    try { const v = Number(sessionStorage.getItem(SK_TRANS + "-prepPageSize")); return [25, 50, 100, 150, 200].includes(v) ? v : 50; } catch { return 50; }
  });

  const setSugPage = (v) => { const val = typeof v === "function" ? v(sugPage) : v; setSugPageRaw(val); try { sessionStorage.setItem(SK_TRANS + "-sugPage", String(val)); } catch {} };
  const setSugPageSize = (v) => { setSugPageSizeRaw(v); try { sessionStorage.setItem(SK_TRANS + "-sugPageSize", String(v)); } catch {} };
  const setManPage = (v) => { const val = typeof v === "function" ? v(manPage) : v; setManPageRaw(val); try { sessionStorage.setItem(SK_TRANS + "-manPage", String(val)); } catch {} };
  const setManPageSize = (v) => { setManPageSizeRaw(v); try { sessionStorage.setItem(SK_TRANS + "-manPageSize", String(v)); } catch {} };
  const setPrepPage = (v) => { const val = typeof v === "function" ? v(prepPage) : v; setPrepPageRaw(val); try { sessionStorage.setItem(SK_TRANS + "-prepPage", String(val)); } catch {} };
  const setPrepPageSize = (v) => { setPrepPageSizeRaw(v); try { sessionStorage.setItem(SK_TRANS + "-prepPageSize", String(v)); } catch {} };

  // ===============================
  // 1. Usuario
  // ===============================
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((j) => j.ok && setMe(j.user));
  }, []);

  // ===============================
  // 2. Origen y Destino (cargar nombres)
  // ===============================
  useEffect(() => {
    const cargar = async () => {
      if (origenIdResuelto) {
        const r = await fetch(`/api/locales/${origenIdResuelto}`);
        const j = await r.json();
        if (j.ok) setOrigen(j.item);
      }

      if (destinoIdResuelto) {
        const r = await fetch(`/api/locales/${destinoIdResuelto}`);
        const j = await r.json();
        if (j.ok) setDestino(j.item);
      }
    };
    cargar();
  }, [origenIdResuelto, destinoIdResuelto]);

  // ===============================
  // 3. Crear/Obtener POS
  // ===============================
  useEffect(() => {
    const iniciar = async () => {
      const url = new URL("/api/pos-transferencias/nueva", window.location.origin);

      if (qsPosId) {
        // H3: Cargar POS existente por posId
        url.searchParams.set("posId", qsPosId);
      } else if (qsModo === "manual") {
        // H2: Modo manual — backend auto-resuelve para local
        // No pasar origenId/destinoId, el backend los resuelve
      } else {
        // Modo normal
        const origenNormal = qsOrigenId || origenIdResuelto;
        const destinoNormal = qsDestinoId || destinoIdResuelto;
        if (!origenNormal || !destinoNormal) return;
        url.searchParams.set("origenId", origenNormal);
        url.searchParams.set("destinoId", destinoNormal);
      }

      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();

      if (!j.ok) return setError(j.error);

      setPosId(j.item.id);
      setPosEstado(j.item.estado || "Borrador");

      // H6: Usar origenId/destinoId resueltos del response
      if (j.item.origenId) setOrigenIdResuelto(j.item.origenId);
      if (j.item.destinoId) setDestinoIdResuelto(j.item.destinoId);
    };

    iniciar();
  }, [qsPosId, qsModo, qsOrigenId, qsDestinoId, origenIdResuelto, destinoIdResuelto]);

  // ===============================
  // 4. Cargar sugeridos (solo en modo normal)
  // ===============================
  useEffect(() => {
    if (esModoManual) return; // H4: no cargar sugeridos en modo manual
    if (!destinoIdResuelto || !posId) return;

    const cargar = async () => {
      setLoadingSug(true);

      const url = new URL("/api/pos-transferencias/sugeridos", window.location.origin);
      url.searchParams.set("destinoId", destinoIdResuelto);
      url.searchParams.set("posId", posId);

      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();

      if (j.ok) {
        setSugeridos(
          j.items.map((s) => {
            const sugeridoCantidad = s.sugeridoCantidad ?? s.sugerido ?? 0;
            const sugeridoUnidad = s.sugeridoUnidad ?? (s.factorPack > 1 ? "BULTO" : "UNIDAD");
            const faltanteUnidades = s.faltanteUnidades ?? s.faltanUnidades ?? 0;
            const factorPack = s.factorPack ?? 1;

            return {
              ...s,
              unidadPlural: unidadPlural(s.unidadMedida || "unidad"),
              factorPack,
              faltanteUnidades,
              faltanUnidades: faltanteUnidades,
              sugeridoCantidad,
              sugeridoUnidad,
              sugerido: sugeridoCantidad,
            };
          })
        );
      }

      setLoadingSug(false);
    };

    cargar();
  }, [destinoIdResuelto, posId, esModoManual]);

  // ===============================
  // Filtros opciones
  // ===============================
  const categoriasOpciones = useMemo(() => {
    const seen = new Map();
    sugeridos.forEach((s) => {
      const display = s.categoriaNombre ? String(s.categoriaNombre).trim() : "Sin categoría";
      const key = norm(s.categoriaNombre, "Sin categoría");
      if (!seen.has(key)) seen.set(key, display);
    });
    return Array.from(seen.values());
  }, [sugeridos]);

  const areasOpciones = useMemo(() => {
    const seen = new Map();
    sugeridos.forEach((s) => {
      const display = s.areaFisicaNombre ? String(s.areaFisicaNombre).trim() : "Sin área";
      const key = norm(s.areaFisicaNombre, "Sin área");
      if (!seen.has(key)) seen.set(key, display);
    });
    return Array.from(seen.values());
  }, [sugeridos]);

  const sugeridosFiltrados = useMemo(() => {
    const fc = norm(categoriaFiltro, SENTINEL_ALL);
    const fa = norm(areaFiltro, SENTINEL_ALL);
    const resultado = sugeridos.filter((s) => {
      const okCat = fc === norm(SENTINEL_ALL, SENTINEL_ALL) || norm(s.categoriaNombre, "Sin categoría") === fc;
      const okArea = fa === norm(SENTINEL_ALL, SENTINEL_ALL) || norm(s.areaFisicaNombre, "Sin área") === fa;
      return okCat && okArea;
    });
    return resultado;
  }, [sugeridos, categoriaFiltro, areaFiltro]);

  // Reset page al cambiar filtros (inline en handlers, ver onChangeCategoria/onChangeArea)

  const totalPagesSug = Math.max(1, Math.ceil(sugeridosFiltrados.length / sugPageSize));

  // Clamp: si sugPage quedó fuera de rango, corregir
  useEffect(() => {
    if (sugPage > totalPagesSug) setSugPage(totalPagesSug);
  }, [sugPage, totalPagesSug]);

  const sugPageSafe = Math.max(1, Math.min(sugPage, totalPagesSug));

  const sugeridosPaginados = useMemo(() => {
    const start = (sugPageSafe - 1) * sugPageSize;
    return sugeridosFiltrados.slice(start, start + sugPageSize);
  }, [sugeridosFiltrados, sugPageSafe, sugPageSize]);

  // ===============================
  // Derivar preparados vs pedido manual sin preparar
  // ===============================
  const itemsPreparados = useMemo(
    () => items.filter((i) => Number(i.preparado || 0) > 0),
    [items]
  );

  // Paginación preparados
  const totalPagesPrep = Math.max(1, Math.ceil(itemsPreparados.length / prepPageSize));

  useEffect(() => {
    if (prepPage > totalPagesPrep) setPrepPage(totalPagesPrep);
  }, [prepPage, totalPagesPrep]);

  const prepPageSafe = Math.max(1, Math.min(prepPage, totalPagesPrep));

  const itemsPreparadosPaginados = useMemo(() => {
    const start = (prepPageSafe - 1) * prepPageSize;
    return itemsPreparados.slice(start, start + prepPageSize);
  }, [itemsPreparados, prepPageSafe, prepPageSize]);

  const itemsPedidoManualSinPreparar = useMemo(() => {
    return items.filter((i) => {
      const sinPreparar = Number(i.preparado || 0) === 0;
      if (!sinPreparar) return false;
      if (String(i.tipo || "") === "rotura") return true;
      return Number(i.sugerido || 0) > 0;
    });
  }, [items]);

  const sugeridosDelPedido = useMemo(
    () =>
      itemsPedidoManualSinPreparar.map((d) => {
        const qty = String(d.tipo || "") === "rotura"
          ? Number(d.sugerido || d.cantidadReal || 1)
          : Number(d.sugerido || 0);
        return {
          productoLocalDestinoId: d.productoLocalId,
          productoLocalOrigenId: d.productoLocalId,
          baseId: d.baseId,
          productoNombre: d.productoNombre,
          codigoBarra: d.codigoBarra,
          stockActual: d.stockActual,
          cantidadReal: d.cantidadReal,
          precioCosto: d.precioCosto,
          unidadMedida: d.unidadMedida,
          factorPack: d.factorPack || 1,
          modoEnvio: d.modoEnvio,
          sugerido: qty,
          sugeridoCantidad: qty,
          sugeridoUnidad: d.unidadSugerida || "UNIDAD",
          faltanteUnidades: 0,
          categoriaNombre: d.categoriaNombre || null,
          areaFisicaNombre: d.areaFisicaNombre || null,
          tipo: d.tipo || null,
        };
      }),
    [itemsPedidoManualSinPreparar]
  );

  const categoriasOpcionesManual = useMemo(() => {
    const seen = new Map();
    sugeridosDelPedido.forEach((s) => {
      const display = s.categoriaNombre ? String(s.categoriaNombre).trim() : "Sin categoría";
      const key = norm(s.categoriaNombre, "Sin categoría");
      if (!seen.has(key)) seen.set(key, display);
    });
    return Array.from(seen.values());
  }, [sugeridosDelPedido]);

  const areasOpcionesManual = useMemo(() => {
    const seen = new Map();
    sugeridosDelPedido.forEach((s) => {
      const display = s.areaFisicaNombre ? String(s.areaFisicaNombre).trim() : "Sin área";
      const key = norm(s.areaFisicaNombre, "Sin área");
      if (!seen.has(key)) seen.set(key, display);
    });
    return Array.from(seen.values());
  }, [sugeridosDelPedido]);

  const sugeridosDelPedidoFiltrados = useMemo(() => {
    const fc = norm(categoriaFiltroManual, SENTINEL_ALL);
    const fa = norm(areaFiltroManual, SENTINEL_ALL);
    return sugeridosDelPedido.filter((s) => {
      const okCat = fc === norm(SENTINEL_ALL, SENTINEL_ALL) || norm(s.categoriaNombre, "Sin categoría") === fc;
      const okArea = fa === norm(SENTINEL_ALL, SENTINEL_ALL) || norm(s.areaFisicaNombre, "Sin área") === fa;
      return okCat && okArea;
    });
  }, [sugeridosDelPedido, categoriaFiltroManual, areaFiltroManual]);

  // Paginación modo manual
  const totalPagesMan = Math.max(1, Math.ceil(sugeridosDelPedidoFiltrados.length / manPageSize));

  useEffect(() => {
    if (manPage > totalPagesMan) setManPage(totalPagesMan);
  }, [manPage, totalPagesMan]);

  const manPageSafe = Math.max(1, Math.min(manPage, totalPagesMan));

  const sugeridosDelPedidoPaginados = useMemo(() => {
    const start = (manPageSafe - 1) * manPageSize;
    return sugeridosDelPedidoFiltrados.slice(start, start + manPageSize);
  }, [sugeridosDelPedidoFiltrados, manPageSafe, manPageSize]);

  // ===============================
  // 5. Upsert detalle
  // ===============================
  const upsertDetalle = (detalle) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.detalleId === detalle.detalleId);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = detalle;
        return copia;
      }
      return [...prev, detalle];
    });
  };

  // ===============================
  // 6. Cargar preparados
  // ===============================
  useEffect(() => {
    if (!posId) return;

    const cargar = async () => {
      setLoadingDetalles(true);

      const url = new URL("/api/pos-transferencias/detalle", window.location.origin);
      url.searchParams.set("posId", posId);

      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();

      if (j.ok) {
        setItems(j.item?.detalles || []);
      } else {
        setError(j.error);
      }

      setLoadingDetalles(false);
    };

    cargar();
  }, [posId]);

  // ===============================
  // 7. Editar sugerido
  // ===============================
  const handleEditSugerido = (productoLocalDestinoId, valor, unidad) => {
    const cantidad = Number(valor || 0);
    setSugeridos((prev) =>
      prev.map((s) =>
        s.productoLocalDestinoId === productoLocalDestinoId
          ? {
              ...s,
              sugeridoCantidad: cantidad,
              sugeridoUnidad: unidad || s.sugeridoUnidad || (s.factorPack > 1 ? "BULTO" : "UNIDAD"),
              sugerido: cantidad,
            }
          : s
      )
    );
  };

  // ===============================
  // 8. Marcar preparado
  // ===============================
  const handleMarcarPreparado = async (productoLocalOrigenId) => {
    if (!posId) return setError("POS no generado");

    const s = sugeridos.find((x) => x.productoLocalOrigenId === productoLocalOrigenId);
    if (!s) return;

    const rawCantidad = Number(s.sugeridoCantidad ?? s.sugerido ?? 0);
    const rawUnidad = s.sugeridoUnidad ?? (s.factorPack > 1 ? "BULTO" : "UNIDAD");
    const fp = Number(s.factorPack || 1);

    // Siempre mandar en BULTO si el producto tiene factorPack > 1,
    // así baja a Preparados como cajones (no convertido a uds).
    // El modo rotura en PreparadosTable permite luego ajustar uds sueltas.
    let prepCantidad = rawCantidad;
    let prepUnidad = rawUnidad;
    if (fp > 1 && rawUnidad === "UNIDAD") {
      prepCantidad = Math.floor(rawCantidad / fp);
      prepUnidad = "BULTO";
    }

    if (prepCantidad <= 0) return;

    const r = await fetch("/api/pos-transferencias/detalle/agregar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posId,
          productoLocalId: productoLocalOrigenId,
          sugerido: prepCantidad,
          preparado: prepCantidad,
          sugeridoUnidad: prepUnidad,
          unidadPreparada: prepUnidad,
          tipo: "sugerido",
        }),
    });

    const j = await r.json();
    if (!j.ok) return setError(j.error);

    upsertDetalle(j.item);

    setSugeridos((prev) =>
      prev.filter((x) => x.productoLocalOrigenId !== productoLocalOrigenId)
    );
  };

  // ===============================
  // 9. Agregar manual
  // ===============================
  const handleAgregarManual = async (p, tipoOverride) => {
    if (!posId) return setError("POS no generado");
    const tipoFinal = tipoOverride || modoAgregarManual;

    const r = await fetch("/api/pos-transferencias/agregarItem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posId,
        productoLocalId: p.productoLocalId,
        cantidad: 1,
        tipo: tipoFinal,
      }),
    });

    const j = await r.json();
    if (!j.ok) return setError(j.error);

    upsertDetalle(j.item);
  };

  // ===============================
  // 10. Editar preparado
  // ===============================
  const handleEditCantidad = async (detalleId, valor, unidad) => {
    const cantidad = Number(valor || 0);
    const unidadPreparada = unidad || "BULTO";

    setItems((prev) =>
      prev.map((i) =>
        i.detalleId === detalleId
          ? { ...i, preparado: cantidad, unidadPreparada }
          : i
      )
    );

    const r = await fetch("/api/pos-transferencias/detalle/editar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        detalleId,
        preparado: cantidad,
        unidadPreparada
      }),
    });

    const j = await r.json();
    if (!j.ok) setError(j.error);
    else upsertDetalle(j.item);
  };

  // ===============================
  // 11. Quitar preparado
  // ===============================
  const handleQuitarPreparado = async (detalleId) => {
    const r = await fetch("/api/pos-transferencias/detalle/quitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detalleId }),
    });

    const j = await r.json();
    if (!j.ok) return setError(j.error);

    const d = j.item;

    if (j.accion === "devuelto_a_sugerido" || Number(d.sugerido || 0) > 0) {
      // El backend puso preparado=0, mantener en items para que
      // itemsPedidoManualSinPreparar lo muestre en Sugeridos
      setItems((prev) =>
        prev.map((i) =>
          i.detalleId === detalleId ? { ...i, preparado: 0 } : i
        )
      );
    } else {
      // Eliminado completamente
      setItems((prev) => prev.filter((i) => i.detalleId !== detalleId));

      // Si era tipo sugerido (auto-calculado), devolver a la lista de sugeridos
      if (d.tipo === "sugerido") {
        setSugeridos((prev) => [
          ...prev,
          {
            productoLocalDestinoId: d.productoLocalId,
            productoLocalOrigenId: d.productoLocalId,
            baseId: d.baseId,
            productoNombre: d.productoNombre,
            codigoBarra: d.codigoBarra,
            stockActual: d.stockActual,
            cantidadReal: d.cantidadReal,
            precioCosto: d.precioCosto,
            unidadMedida: d.unidadMedida,
            factorPack: d.factorPack,
            sugerido: d.sugerido,
            categoriaNombre: d.producto?.base?.categoria?.nombre || "Sin categoría",
            areaFisicaNombre: d.producto?.base?.area_fisica?.nombre || "Sin área",
          },
        ]);
      }
    }
  };

  // ===============================
  // 11b. Editar sugerido de pedido manual (local state)
  // ===============================
  const handleEditSugeridoManual = (productoLocalId, valor, unidad) => {
    setItems((prev) =>
      prev.map((i) =>
        i.productoLocalId === productoLocalId
          ? {
              ...i,
              sugerido: Number(valor || 0),
              unidadSugerida: unidad || i.unidadSugerida,
            }
          : i
      )
    );
  };

  // ===============================
  // 11c. Preparar item de pedido manual
  // ===============================
  const handleMarcarPreparadoManual = async (productoLocalId) => {
    const item = items.find((i) => i.productoLocalId === productoLocalId);
    if (!item) return;
    const qty = Number(item.sugerido || 0);
    if (qty <= 0) return;
    const fp = Number(item.factorPack || 1);
    const unidadPedido = item.sugeridoUnidad || item.unidadSugerida || (fp > 1 ? "BULTO" : "UNIDAD");

    if (fp > 1 && unidadPedido === "UNIDAD") {
      const bultos = Math.floor(qty / fp);
      if (bultos <= 0) return;
      await handleEditCantidad(item.detalleId, bultos, "BULTO");
    } else {
      await handleEditCantidad(item.detalleId, qty, unidadPedido);
    }
  };

  // ===============================
  // 12. Buscar manual (H6: usa origenIdResuelto)
  // ===============================
  const buscarProductos = async () => {
    if (!texto.trim()) {
      setBuscados([]);
      return;
    }

    setLoadingBuscar(true);

    const url = new URL(
      "/api/pos-transferencias/buscarProductos",
      window.location.origin
    );
    url.searchParams.set("q", texto);
    url.searchParams.set("origenId", origenIdResuelto);

    const r = await fetch(url);
    const j = await r.json();

    if (j.ok) setBuscados(j.items || []);

    setLoadingBuscar(false);
  };

  useEffect(() => {
    if (texto.trim() === "") {
      setBuscados([]);
    }
  }, [texto]);

  // ===============================
  // 13. Enviar POS / Solicitar pedido
  // ===============================
  const enviarPOS = async () => {
    if (!posId) return setError("POS no generado");
    if (items.length === 0)
      return setError("Debés preparar al menos un producto");

    setEnviando(true);
    setError("");

    // H5: CTA condicional
    if (esModoManual && posEstado !== "Solicitado") {
      // Local solicita al depósito
      const r = await fetch("/api/pos-transferencias/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId }),
      });

      const j = await r.json();

      if (!j.ok) {
        setError(j.error);
        setEnviando(false);
        return;
      }

      setPosEstado("Solicitado");
      setEnviando(false);
      return;
    }

    // Modo normal / depot procesando un solicitado → enviar
    const r = await fetch("/api/pos-transferencias/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posId }),
    });

    const j = await r.json();

    if (!j.ok) {
      // Mostrar faltantes de stock si aplica
      if (j.error === "STOCK_INSUFICIENTE" && j.faltantes) {
        const msgs = j.faltantes.map(
          (f) => `${f.productoNombre}: necesario ${f.necesario}, disponible ${f.disponible}`
        );
        setError("Stock insuficiente:\n" + msgs.join("\n"));
      } else {
        setError(j.error);
      }
      setEnviando(false);
      return;
    }

    setPosEstado("Enviado");
    setEnviando(false);
  };

  // ===============================
  // Texto del botón CTA
  // ===============================
  // Determinar si el usuario es depósito/admin
  const esDepositoUser = !me?.localId || Number(me?.localId) === origenIdResuelto;

  const getCtaText = () => {
    if (enviando) return "Enviando...";
    if (esModoManual && posEstado === "Solicitado") return "Enviar transferencia";
    if (esModoManual) return "Enviar pedido al Depósito";
    return "Enviar transferencia";
  };

  const getCtaColor = () => {
    if (esModoManual && posEstado !== "Solicitado") return "sunmi-pos-btn-primary";
    return "bg-orange-500 hover:bg-orange-600 active:bg-orange-700";
  };

  // Visibilidad del CTA: depot-only para enviar, local para solicitar
  const showCTA = (() => {
    if (posEstado === "Enviado") return false;
    if (!esModoManual) return esDepositoUser;
    if (posEstado === "Solicitado") return esDepositoUser;
    return true;
  })();

  // ===============================
  // 14. Render
  // ===============================
  return (
    <div className="min-h-screen sunmi-bg">
      <div className="max-w-5xl mx-auto p-4 space-y-4">

        {/* VOLVER */}
        <button
          onClick={() => router.back()}
          className="
            sunmi-link text-xs flex items-center gap-1
            active:scale-95 transition
          "
        >
          ← Volver
        </button>

        {/* TARJETA */}
        <div
          className="
            sunmi-surface
            border sunmi-border
            rounded-2xl
            p-4
            shadow-md
            space-y-4
          "
        >
          <Encabezado
            origen={origen}
            destino={destino}
            me={me}
            modo={esModoManual ? "manual" : "normal"}
            posEstado={posEstado}
          />

          {/* BANNER ENVIADO */}
          {posEstado === "Enviado" && (
            <div className="sunmi-state-success rounded-xl px-4 py-3 sunmi-text-success text-sm font-semibold text-center">
              Transferencia enviada al local
            </div>
          )}

          {/* SUGERIDOS — H4: ocultar en modo manual y cuando ya se envió */}
          {!esModoManual && posEstado !== "Enviado" && (
            <>
              <Separador label="Productos sugeridos" />

              <TablaSugeridos
                datos={sugeridosPaginados}
                page={sugPageSafe}
                totalPages={totalPagesSug}
                onPrev={() => setSugPage((p) => Math.max(1, p - 1))}
                onNext={() => {
                  const maxP = Math.max(1, Math.ceil(sugeridosFiltrados.length / sugPageSize));
                  setSugPage((p) => Math.min(maxP, p + 1));
                }}
                pageSize={sugPageSize}
                onPageSizeChange={(v) => { setSugPageSize(v); setSugPage(1); }}
                onEditSugerido={handleEditSugerido}
                onMarcarPreparado={handleMarcarPreparado}
                loading={loadingSug}
                categorias={categoriasOpciones}
                areas={areasOpciones}
                categoriaSeleccionada={categoriaFiltro}
                areaSeleccionada={areaFiltro}
                onChangeCategoria={(v) => {
                  const final = normalizarValorFiltro(v);
                  if (DEBUG_FILTROS) console.debug("[filtro categoría] v", v, "final", final, "typeof v", typeof v);
                  setCategoriaFiltro(final);
                  setSugPage(1);
                }}
                onChangeArea={(v) => {
                  const final = normalizarValorFiltro(v);
                  if (DEBUG_FILTROS) console.debug("[filtro área] v", v, "final", final, "typeof v", typeof v);
                  setAreaFiltro(final);
                  setSugPage(1);
                }}
              />
            </>
          )}

          {/* SUGERIDOS DEL PEDIDO MANUAL (sin preparar aún) */}
          {esModoManual && posEstado !== "Enviado" && sugeridosDelPedido.length > 0 && (
            <>
              <Separador label="Sugeridos (pedido del local)" />

              <TablaSugeridos
                datos={sugeridosDelPedidoPaginados}
                page={manPageSafe}
                totalPages={totalPagesMan}
                onPrev={() => setManPage((p) => Math.max(1, p - 1))}
                onNext={() => {
                  const maxP = Math.max(1, Math.ceil(sugeridosDelPedidoFiltrados.length / manPageSize));
                  setManPage((p) => Math.min(maxP, p + 1));
                }}
                pageSize={manPageSize}
                onPageSizeChange={(v) => { setManPageSize(v); setManPage(1); }}
                onEditSugerido={handleEditSugeridoManual}
                onMarcarPreparado={handleMarcarPreparadoManual}
                loading={false}
                categorias={categoriasOpcionesManual}
                areas={areasOpcionesManual}
                categoriaSeleccionada={categoriaFiltroManual}
                areaSeleccionada={areaFiltroManual}
                onChangeCategoria={(v) => { setCategoriaFiltroManual(normalizarValorFiltro(v)); setManPage(1); }}
                onChangeArea={(v) => { setAreaFiltroManual(normalizarValorFiltro(v)); setManPage(1); }}
              />
            </>
          )}

          {/* PREPARADOS */}
          <Separador label={esModoManual ? "Productos del pedido" : "Preparados"} />

          <PreparadosTable
            datos={itemsPreparadosPaginados}
            onDesmarcar={handleQuitarPreparado}
            onEditPreparado={handleEditCantidad}
            page={prepPageSafe}
            totalPages={totalPagesPrep}
            onPrev={() => setPrepPage((p) => Math.max(1, p - 1))}
            onNext={() => {
              const maxP = Math.max(1, Math.ceil(itemsPreparados.length / prepPageSize));
              setPrepPage((p) => Math.min(maxP, p + 1));
            }}
            pageSize={prepPageSize}
            onPageSizeChange={(v) => { setPrepPageSize(v); setPrepPage(1); }}
            loading={loadingDetalles}
            bloqueado={posEstado === "Enviado"}
            buscador={
              <BuscadorManual
                texto={texto}
                onTextoChange={setTexto}
                onBuscar={buscarProductos}
                loading={loadingBuscar}
                resultados={buscados}
                onAgregar={handleAgregarManual}
                modo={modoAgregarManual}
                onModoChange={setModoAgregarManual}
              />
            }
          />

          {/* MENSAJE: Pedido ya solicitado */}
          {esModoManual && posEstado === "Solicitado" && !esDepositoUser && (
            <div className="text-[11px] sunmi-text-accent sunmi-state-warning rounded-lg px-3 py-2">
              Este pedido ya fue enviado al depósito. Esperá a que lo procesen.
            </div>
          )}

          {/* ERRORES */}
          {error && (
            <div className="sunmi-text-danger text-xs mt-1 whitespace-pre-line">
              {error}
            </div>
          )}

          {/* CTA */}
          {showCTA && (
            <div className="sticky bottom-0 z-10 pt-2 pb-1 sunmi-surface backdrop-blur-sm -mx-4 px-4 border-t sunmi-divider">
              <button
                disabled={enviando}
                onClick={enviarPOS}
                className={`
                  w-full px-4 py-3
                  rounded-xl text-sm font-semibold shadow-md
                  ${getCtaColor()}
                  transition-colors
                  disabled:opacity-60 active:scale-95
                `}
              >
                {getCtaText()}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
