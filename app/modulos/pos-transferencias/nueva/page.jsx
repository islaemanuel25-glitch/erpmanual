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

  const origenId = Number(params.get("origenId") || 0);
  const destinoId = Number(params.get("destinoId") || 0);

  const [me, setMe] = useState(null);
  const [origen, setOrigen] = useState(null);
  const [destino, setDestino] = useState(null);

  const [posId, setPosId] = useState(null);

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
  // 2. Origen y Destino
  // ===============================
  useEffect(() => {
    const cargar = async () => {
      if (origenId) {
        const r = await fetch(`/api/locales/${origenId}`);
        const j = await r.json();
        if (j.ok) setOrigen(j.item);
      }

      if (destinoId) {
        const r = await fetch(`/api/locales/${destinoId}`);
        const j = await r.json();
        if (j.ok) setDestino(j.item);
      }
    };
    cargar();
  }, [origenId, destinoId]);

  // ===============================
  // 3. Crear POS
  // ===============================
  useEffect(() => {
    if (!origenId || !destinoId) return;

    const iniciar = async () => {
      const url = new URL(
        "/api/pos-transferencias/nueva",
        window.location.origin
      );
      url.searchParams.set("origenId", origenId);
      url.searchParams.set("destinoId", destinoId);

      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();

      if (!j.ok) return setError(j.error);

      setPosId(j.item.id);
    };

    iniciar();
  }, [origenId, destinoId]);

  // ===============================
  // 4. Cargar sugeridos
  // ===============================
  useEffect(() => {
    if (!destinoId || !posId) return;

    const cargar = async () => {
      setLoadingSug(true);

      const url = new URL(
        "/api/pos-transferencias/sugeridos",
        window.location.origin
      );
      url.searchParams.set("destinoId", destinoId);
      url.searchParams.set("posId", posId);

      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();

      if (j.ok) {
        setSugeridos(
          j.items.map((s) => {
            // s.sugerido viene en UNIDADES (faltantes)
            const factor = Number(s.factorPack || s.base?.factor_pack || 1);
            const faltanUnidades = Number(s.sugerido || 0);

            // 🔥 Convertimos a BULTOS
            const sugeridoBultos =
              factor > 1
                ? Math.ceil(faltanUnidades / factor)
                : faltanUnidades;

            return {
              ...s,
              unidadPlural: unidadPlural(s.unidadMedida || "unidad"),
              factorPack: factor,
              faltanUnidades,
              // A partir de acá, sugerido = BULTOS
              sugerido: sugeridoBultos,
            };
          })
        );
      }

      setLoadingSug(false);
    };

    cargar();
  }, [destinoId, posId]);

  // ===============================
  // Filtros opciones
  // ===============================
  const categoriasOpciones = useMemo(() => {
    const set = new Set(
      sugeridos
        .map((s) => s.categoriaNombre)
        .filter((x) => x && x.trim() !== "")
    );
    return Array.from(set);
  }, [sugeridos]);

  const areasOpciones = useMemo(() => {
    const set = new Set(
      sugeridos
        .map((s) => s.areaFisicaNombre)
        .filter((x) => x && x.trim() !== "")
    );
    return Array.from(set);
  }, [sugeridos]);

  const sugeridosFiltrados = useMemo(() => {
    return sugeridos.filter((s) => {
      const okCat =
        categoriaFiltro === "todos" ||
        s.categoriaNombre === categoriaFiltro;
      const okArea =
        areaFiltro === "todos" ||
        s.areaFisicaNombre === areaFiltro;
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

      const url = new URL(
        "/api/pos-transferencias/detalle",
        window.location.origin
      );
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
  // 7. Editar sugerido (BULTOS)
  // ===============================
  const handleEditSugerido = (productoLocalDestinoId, valor) => {
    const cantidadBultos = Number(valor || 0);
    setSugeridos((prev) =>
      prev.map((s) =>
        s.productoLocalDestinoId === productoLocalDestinoId
          ? { ...s, sugerido: cantidadBultos }
          : s
      )
    );
  };

  // ===============================
  // 8. Marcar preparado
  //    → preparado = BULTOS
  // ===============================
  const handleMarcarPreparado = async (productoLocalOrigenId) => {
    if (!posId) return setError("POS no generado");

    const s = sugeridos.find(
      (x) => x.productoLocalOrigenId === productoLocalOrigenId
    );
    if (!s) return;

    const cantidadBultos = Number(s.sugerido || 0);
    if (cantidadBultos <= 0) return;

    const r = await fetch("/api/pos-transferencias/detalle/agregar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posId,
        productoLocalId: productoLocalOrigenId,
        sugerido: cantidadBultos,
        preparado: cantidadBultos,
        tipo: "sugerido",
      }),
    });

    const j = await r.json();
    if (!j.ok) return setError(j.error);

    upsertDetalle(j.item);

    setSugeridos((prev) =>
      prev.filter(
        (x) => x.productoLocalOrigenId !== productoLocalOrigenId
      )
    );
  };

  // ===============================
  // 9. Agregar manual
  //    → cantidad = 1 BULTO
  // ===============================
  const handleAgregarManual = async (p) => {
    if (!posId) return setError("POS no generado");

    const r = await fetch("/api/pos-transferencias/agregarItem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posId,
        productoLocalId: p.productoLocalId,
        cantidad: 1, // 1 bulto
        tipo: "manual",
      }),
    });

    const j = await r.json();
    if (!j.ok) return setError(j.error);

    upsertDetalle(j.item);
  };

  // ===============================
  // 10. Editar preparado
  //     → preparado = BULTOS
  // ===============================
  const handleEditCantidad = async (detalleId, valor) => {
    const cantidadBultos = Number(valor || 0);

    setItems((prev) =>
      prev.map((i) =>
        i.detalleId === detalleId ? { ...i, preparado: cantidadBultos } : i
      )
    );

    const r = await fetch("/api/pos-transferencias/detalle/editar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detalleId, preparado: cantidadBultos }),
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
      },
    ]);
  };

  // ===============================
  // 12. Buscar manual
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
    url.searchParams.set("origenId", origenId);

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
  // 13. Enviar POS
  // ===============================
  const enviarPOS = async () => {
    if (!posId) return setError("POS no generado");
    if (items.length === 0)
      return setError("Debés preparar al menos un producto");

    setEnviando(true);
    setError("");

    const r = await fetch("/api/pos-transferencias/enviar", {
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

    router.push(`/modulos/transferencias/${j.item.id}`);
  };

  // ===============================
  // 14. Render Sunmi V2
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

        {/* TÍTULO */}
        <h1 className="text-xl font-semibold tracking-tight">
          POS – Preparación
        </h1>

        {/* TARJETA GRANDE SUNMI */}
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
            origenId={origenId}
            destinoId={destinoId}
          />

          {/* SUGERIDOS */}
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

          {/* PREPARADOS */}
          <Separador label="Preparados" />

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

          {/* ERRORES */}
          {error && (
            <div className="text-red-400 text-xs mt-1">
              {error}
            </div>
          )}

          {/* BUTTON SEND */}
          <button
            disabled={enviando}
            onClick={enviarPOS}
            className="
              mt-2 w-full px-4 py-3 
              rounded-xl text-sm font-semibold shadow-md
              bg-orange-500 hover:bg-orange-600 active:bg-orange-700
              transition-colors 
              disabled:opacity-60 active:scale-95
            "
          >
            {enviando ? "Enviando..." : "Enviar transferencia"}
          </button>
        </div>
      </div>
    </div>
  );
}
