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

  const [categoriaFiltro, setCategoriaFiltro] = useState("todos");
  const [areaFiltro, setAreaFiltro] = useState("todos");

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
        if (!qsOrigenId || !qsDestinoId) return;
        url.searchParams.set("origenId", qsOrigenId);
        url.searchParams.set("destinoId", qsDestinoId);
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
  }, [qsPosId, qsModo, qsOrigenId, qsDestinoId]);

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
    const set = new Set(
      sugeridos.map((s) => {
        return s.categoriaNombre
          ? String(s.categoriaNombre).trim()
          : "Sin categoría";
      })
    );
    return Array.from(set);
  }, [sugeridos]);

  const areasOpciones = useMemo(() => {
    const set = new Set(
      sugeridos.map((s) => {
        return s.areaFisicaNombre
          ? String(s.areaFisicaNombre).trim()
          : "Sin área";
      })
    );
    return Array.from(set);
  }, [sugeridos]);

  const sugeridosFiltrados = useMemo(() => {
    return sugeridos.filter((s) => {
      const cat = (s.categoriaNombre || "").trim().toLowerCase();
      const area = (s.areaFisicaNombre || "").trim().toLowerCase();

      const filtroCat = categoriaFiltro.trim().toLowerCase();
      const filtroArea = areaFiltro.trim().toLowerCase();

      const okCat = filtroCat === "todos" || cat === filtroCat;
      const okArea = filtroArea === "todos" || area === filtroArea;

      return okCat && okArea;
    });
  }, [sugeridos, categoriaFiltro, areaFiltro]);

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

    const sugeridoCantidad = Number(s.sugeridoCantidad ?? s.sugerido ?? 0);
    const sugeridoUnidad = s.sugeridoUnidad ?? (s.factorPack > 1 ? "BULTO" : "UNIDAD");

    if (sugeridoCantidad <= 0) return;

    const r = await fetch("/api/pos-transferencias/detalle/agregar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posId,
          productoLocalId: productoLocalOrigenId,
          sugerido: sugeridoCantidad,
          preparado: sugeridoCantidad,
          sugeridoUnidad,
          unidadPreparada: sugeridoUnidad,
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
  const handleAgregarManual = async (p) => {
    if (!posId) return setError("POS no generado");

    const r = await fetch("/api/pos-transferencias/agregarItem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posId,
        productoLocalId: p.productoLocalId,
        cantidad: 1,
        tipo: "manual",
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

    setItems((prev) => prev.filter((i) => i.detalleId !== detalleId));

    if (d.tipo !== "sugerido") return;

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

    router.push(`/modulos/transferencias/${j.item.id}`);
  };

  // ===============================
  // Texto del botón CTA
  // ===============================
  const getCtaText = () => {
    if (enviando) return "Enviando...";
    if (esModoManual && posEstado === "Solicitado") return "Enviar transferencia";
    if (esModoManual) return "Enviar pedido al Depósito";
    return "Enviar transferencia";
  };

  const getCtaColor = () => {
    if (esModoManual && posEstado !== "Solicitado") return "bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700";
    return "bg-orange-500 hover:bg-orange-600 active:bg-orange-700";
  };

  // ===============================
  // 14. Render
  // ===============================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-5xl mx-auto p-4 space-y-4">

        {/* VOLVER */}
        <button
          onClick={() => router.back()}
          className="
            text-cyan-400 text-xs flex items-center gap-1
            hover:text-cyan-300 active:scale-95 transition
          "
        >
          ← Volver
        </button>

        {/* TARJETA */}
        <div
          className="
            bg-slate-800/70
            border border-slate-700
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

          {/* SUGERIDOS — H4: ocultar en modo manual */}
          {!esModoManual && (
            <>
              <Separador label="Productos sugeridos" />

              <TablaSugeridos
                datos={sugeridosFiltrados}
                page={1}
                totalPages={1}
                onPrev={() => {}}
                onNext={() => {}}
                pageSize={50}
                onPageSizeChange={() => {}}
                onEditSugerido={handleEditSugerido}
                onMarcarPreparado={handleMarcarPreparado}
                loading={loadingSug}
                categorias={categoriasOpciones}
                areas={areasOpciones}
                categoriaSeleccionada={categoriaFiltro}
                areaSeleccionada={areaFiltro}
                onChangeCategoria={setCategoriaFiltro}
                onChangeArea={setAreaFiltro}
              />
            </>
          )}

          {/* PREPARADOS */}
          <Separador label={esModoManual ? "Productos del pedido" : "Preparados"} />

          <PreparadosTable
            datos={items}
            onDesmarcar={handleQuitarPreparado}
            onEditPreparado={handleEditCantidad}
            page={1}
            totalPages={1}
            onPrev={() => {}}
            onNext={() => {}}
            pageSize={50}
            onPageSizeChange={() => {}}
            loading={loadingDetalles}
            buscador={
              <BuscadorManual
                texto={texto}
                onTextoChange={setTexto}
                onBuscar={buscarProductos}
                loading={loadingBuscar}
                resultados={buscados}
                onAgregar={handleAgregarManual}
              />
            }
          />

          {/* MENSAJE: Pedido ya solicitado */}
          {esModoManual && posEstado === "Solicitado" && (
            <div className="text-[11px] text-amber-400 bg-amber-900/20 border border-amber-500/40 rounded-lg px-3 py-2">
              Este pedido ya fue enviado al depósito. Esperá a que lo procesen.
            </div>
          )}

          {/* ERRORES */}
          {error && (
            <div className="text-red-400 text-xs mt-1 whitespace-pre-line">
              {error}
            </div>
          )}

          {/* CTA */}
          {!(esModoManual && posEstado === "Solicitado") && (
            <button
              disabled={enviando}
              onClick={enviarPOS}
              className={`
                mt-2 w-full px-4 py-3
                rounded-xl text-sm font-semibold shadow-md
                ${getCtaColor()}
                transition-colors
                disabled:opacity-60 active:scale-95
              `}
            >
              {getCtaText()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
