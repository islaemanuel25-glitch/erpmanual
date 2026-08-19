"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";
import { Search } from "lucide-react";
export default function PedidosCatalogoPage() {
  const router = useRouter();
  const { perfil: perfilPed, cargando: cargandoPed } = useUser();

  // Estado general
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opciones, setOpciones] = useState(null);

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [areaId, setAreaId] = useState("");

  // Voz
  const [escuchando, setEscuchando] = useState(false);
  const recognitionRef = useRef(null);
  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const iniciarVoz = () => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;

    if (escuchando && recognitionRef.current) {
      recognitionRef.current.stop();
      setEscuchando(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setEscuchando(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setBusqueda(transcript);
      setEscuchando(false);
    };
    recognition.onerror = () => setEscuchando(false);
    recognition.onend = () => setEscuchando(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Catálogo
  const [productos, setProductos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSizeRaw] = useState(() => {
    try {
      const v = Number(localStorage.getItem("pedidos_page_size"));
      return [25, 50, 100].includes(v) ? v : 50;
    } catch { return 50; }
  });
  const setPageSize = (size) => {
    setPageSizeRaw(size);
    try { localStorage.setItem("pedidos_page_size", String(size)); } catch {}
  };
  const [loadingCat, setLoadingCat] = useState(false);

  // Carrito (cantidades locales)
  const [carrito, setCarrito] = useState({});
  const [carritoCount, setCarritoCount] = useState(0);
  const [posId, setPosId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [vista, setVista] = useState("catalogo"); // "catalogo" | "carrito"
  const [carritoItems, setCarritoItems] = useState([]);
  const [loadingCarrito, setLoadingCarrito] = useState(false);
  const [carritoPage, setCarritoPage] = useState(1);
  const [carritoPageSize, setCarritoPageSize] = useState(25);

  // Pedido pendiente (Solicitado)
  const [pendiente, setPendiente] = useState(null);
  const [verDetallePendiente, setVerDetallePendiente] = useState(false);
  const [cancelandoPendiente, setCancelandoPendiente] = useState(false);

  // Debounce busqueda
  const debounceRef = useRef(null);

  // ====================================================
  // CARGAR OPCIONES
  // ====================================================
  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/pedidos/opciones", { cache: "no-store" });
        const json = await res.json();

        if (!json.ok) {
          if (json.needsContexto) {
            router.push("/inicio");
            return;
          }
          setError(json.error || "Error cargando opciones");
          setLoading(false);
          return;
        }

        setOpciones(json);
        setLoading(false);

        // Cargar carrito existente
        cargarCarrito();
      } catch (err) {
        console.error(err);
        setError("Error de conexión");
        setLoading(false);
      }
    };

    cargar();
  }, []);

  // ====================================================
  // CARGAR CATÁLOGO
  // ====================================================
  const cargarCatalogo = useCallback(
    async (p = 1) => {
      setLoadingCat(true);
      try {
        const params = new URLSearchParams({ page: p, pageSize });
        if (busqueda.trim()) params.set("q", busqueda.trim());
        if (categoriaId) params.set("categoriaId", categoriaId);
        if (proveedorId) params.set("proveedorId", proveedorId);
        if (areaId) params.set("areaId", areaId);

        const res = await fetch(`/api/pedidos/catalogo?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (json.ok) {
          setProductos(json.items || []);
          setPage(json.page || 1);
          setTotalPages(json.totalPages || 1);
          setTotal(json.total || 0);
        }
      } catch (err) {
        console.error(err);
      }
      setLoadingCat(false);
    },
    [busqueda, categoriaId, proveedorId, areaId, pageSize]
  );

  // Cargar al montar y cuando cambian filtros o pageSize
  useEffect(() => {
    if (!opciones) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargarCatalogo(1);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [opciones, cargarCatalogo]);

  // ====================================================
  // CARGAR CARRITO
  // ====================================================
  const cargarCarrito = async () => {
    try {
      const res = await fetch("/api/pedidos/carrito", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setPosId(json.posId || null);
        setCarritoCount(json.itemCount || 0);
        setCarritoItems(json.items || []);
        setPendiente(json.pendiente || null);

        // Reconstruir mapa de cantidades segun la unidad guardada del item.
        // - Si unidadSugerida === "BULTO" → it.sugerido ya esta en bultos, leer tal cual.
        // - Si unidadSugerida === "UNIDAD" y el producto sale por bulto (legacy):
        //   convertir a bultos para que el frontend en bultoMode funcione coherente.
        // - Si producto sale por unidad: it.sugerido en unidades, tal cual.
        const mapa = {};
        (json.items || []).forEach((it) => {
          const isBultoMode = it.modoEnvio === "SOLO_BULTO" && it.factorPack > 1;
          if (isBultoMode) {
            mapa[it.productoLocalId] =
              it.unidadSugerida === "BULTO"
                ? it.sugerido
                : Math.floor(it.sugerido / it.factorPack);
          } else {
            mapa[it.productoLocalId] = it.sugerido;
          }
        });
        setCarrito(mapa);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ====================================================
  // SET CANTIDAD
  // ====================================================
  const setCantidad = async (productoLocalId, cantidad, unidad = "UNIDAD") => {
    if (pendiente) {
      setError("Hay un pedido solicitado pendiente. Esperá a que el depósito lo procese o cancelalo.");
      return;
    }

    // Optimistic update (siempre en total unidades)
    setCarrito((prev) => {
      const next = { ...prev };
      if (cantidad === 0) {
        delete next[productoLocalId];
      } else {
        next[productoLocalId] = cantidad;
      }
      return next;
    });

    if (cantidad === 0) {
      setCarritoItems((prev) => prev.filter((it) => it.productoLocalId !== productoLocalId));
    }

    try {
      const res = await fetch("/api/pedidos/set-cantidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoLocalId, cantidad, unidad }),
      });
      const json = await res.json();
      if (json.ok) {
        setPosId(json.posId);
        setCarritoCount(json.itemCount);
      } else {
        setError(json.error || "Error al actualizar cantidad");
        // Revert
        cargarCarrito();
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      cargarCarrito();
    }
  };

  // ====================================================
  // ENVIAR PEDIDO (solicitar)
  // ====================================================
  const enviarPedido = async () => {
    if (!posId) {
      setError("No hay pedido para enviar");
      return;
    }

    setEnviando(true);
    setError("");

    try {
      const res = await fetch("/api/pos-transferencias/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId }),
      });
      const json = await res.json();

      if (json.ok) {
        setCarrito({});
        setCarritoCount(0);
        setCarritoItems([]);
        setPosId(null);
        setVista("catalogo");
        alert("Pedido enviado al depósito correctamente");
      } else {
        setError(json.error || "Error al solicitar pedido");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión al solicitar");
    }
    setEnviando(false);
  };

  // ====================================================
  // CANCELAR PEDIDO PENDIENTE
  // ====================================================
  const cancelarPendiente = async () => {
    if (!pendiente) return;
    if (!confirm("¿Cancelar el pedido solicitado? Se eliminarán todos los items.")) return;

    setCancelandoPendiente(true);
    try {
      const res = await fetch("/api/pos-transferencias/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId: pendiente.posId }),
      });
      const json = await res.json();
      if (json.ok) {
        setPendiente(null);
        setVerDetallePendiente(false);
      } else {
        setError(json.error || "Error al cancelar pedido");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión al cancelar");
    }
    setCancelandoPendiente(false);
  };

  // ====================================================
  // VER CARRITO
  // ====================================================
  const abrirCarrito = async () => {
    setVista("carrito");
    setLoadingCarrito(true);
    await cargarCarrito();
    setLoadingCarrito(false);
  };

  // ====================================================
  // PERMISOS + LOADING
  // ====================================================
  const permisosPed = perfilPed?.permisos || [];
  const esAdminPed = Array.isArray(permisosPed) && permisosPed.includes("*");
  const puedePed = esAdminPed || permisosPed.includes("pedidos.ver");

  if (cargandoPed || loading) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando...</span>
      </div>
    );
  }

  if (!puedePed) return <SinPermisos />;

  if (!opciones) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-danger">{error || "Sin opciones"}</span>
      </div>
    );
  }

  // ====================================================
  // VISTA CARRITO
  // ====================================================
  if (vista === "carrito") {
    return (
      <div className="min-h-screen sunmi-bg">
        <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
          <button
            type="button"
            onClick={() => setVista("catalogo")}
            className="text-xs sunmi-link flex items-center gap-1 transition"
          >
            ← Volver al catálogo
          </button>

          <SunmiCard>
            <SunmiHeader title="Mi Pedido" color="amber">
              <div className="text-[11px] text-slate-900/80 mt-1">
                {opciones.local.nombre} → {opciones.deposito.nombre}
              </div>
            </SunmiHeader>

            {error && (
              <div className="mb-3 text-[11px] sunmi-text-danger sunmi-state-danger rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {pendiente && (
              <BannerPendiente
                pendiente={pendiente}
                verDetalle={verDetallePendiente}
                onToggleDetalle={() => setVerDetallePendiente((v) => !v)}
                onCancelar={cancelarPendiente}
                cancelando={cancelandoPendiente}
              />
            )}

            {loadingCarrito ? (
              <div className="text-[12px] sunmi-text-muted py-4 text-center">
                Cargando carrito...
              </div>
            ) : carritoItems.length === 0 ? (
              <div className="text-[12px] sunmi-text-muted py-4 text-center">
                El carrito está vacío. Volvé al catálogo para agregar productos.
              </div>
            ) : (() => {
              const carritoTotalPages = Math.max(1, Math.ceil(carritoItems.length / carritoPageSize));
              const carritoPagedItems = carritoItems.slice(
                (carritoPage - 1) * carritoPageSize,
                carritoPage * carritoPageSize
              );
              return (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <span className="text-[12px] sunmi-text-muted">
                      {carritoItems.length} producto{carritoItems.length !== 1 ? "s" : ""} en el pedido
                    </span>
                    <SunmiPageSizer
                      value={carritoPageSize}
                      options={[25, 50, 100]}
                      onChange={(size) => { setCarritoPageSize(size); setCarritoPage(1); }}
                    />
                  </div>

                  <div className="space-y-2">
                    {carritoPagedItems.map((item) => (
                      <CarritoItemCard
                        key={item.detalleId}
                        item={item}
                        totalActual={carrito[item.productoLocalId] || item.sugerido}
                        onSetCantidad={(cant, uni) => setCantidad(item.productoLocalId, cant, uni)}
                      />
                    ))}
                  </div>

                  {carritoTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <SunmiButton
                        color="slate"
                        disabled={carritoPage <= 1}
                        onClick={() => setCarritoPage((p) => p - 1)}
                      >
                        ← Anterior
                      </SunmiButton>
                      <span className="text-[12px] sunmi-text-muted">
                        Página {carritoPage} de {carritoTotalPages}
                      </span>
                      <SunmiButton
                        color="slate"
                        disabled={carritoPage >= carritoTotalPages}
                        onClick={() => setCarritoPage((p) => p + 1)}
                      >
                        Siguiente →
                      </SunmiButton>
                    </div>
                  )}

                  <div className="pt-4">
                    <SunmiButton
                      color="amber"
                      disabled={enviando || carritoItems.length === 0}
                      onClick={enviarPedido}
                    >
                      {enviando
                        ? "Enviando..."
                        : `Enviar pedido al depósito (${carritoItems.length} productos)`}
                    </SunmiButton>
                  </div>
                </>
              );
            })()}
          </SunmiCard>
        </div>
      </div>
    );
  }

  // ====================================================
  // VISTA CATÁLOGO
  // ====================================================
  return (
    <div className="min-h-screen sunmi-bg">
      <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs sunmi-link flex items-center gap-1 transition"
        >
          ← Volver
        </button>

        <SunmiCard>
          <SunmiHeader title="Catálogo de Pedido" color="cyan">
            <div className="text-[11px] text-slate-900/80 mt-1">
              {opciones.local.nombre} → {opciones.deposito.nombre}
            </div>
          </SunmiHeader>

          {error && (
            <div className="mb-3 text-[11px] sunmi-text-danger sunmi-state-danger rounded-lg px-3 py-2">
              {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setError("")}
              >
                cerrar
              </button>
            </div>
          )}

          {/* BANNER PEDIDO PENDIENTE */}
          {pendiente && (
            <BannerPendiente
              pendiente={pendiente}
              verDetalle={verDetallePendiente}
              onToggleDetalle={() => setVerDetallePendiente((v) => !v)}
              onCancelar={cancelarPendiente}
              cancelando={cancelandoPendiente}
            />
          )}

          {/* CARRITO FLOTANTE */}
          {carritoCount > 0 && (
            <div className="mb-3">
              <button
                type="button"
                onClick={abrirCarrito}
                className="
                  w-full
                  sunmi-btn-accent-soft
                  rounded-xl px-4 py-2.5
                  flex items-center justify-between
                  transition
                "
              >
                <span className="text-[13px] font-medium sunmi-text-accent">
                  Ver mi pedido
                </span>
                <span className="text-[12px] sunmi-badge-accent font-bold px-2.5 py-0.5 rounded-full">
                  {carritoCount}
                </span>
              </button>
            </div>
          )}

          {/* FILTROS */}
          <SunmiSeparator label="Buscar productos" />

          <div className="space-y-2">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ color: "var(--pos-link)" }}
              />
              <SunmiInput
                placeholder="Buscar por nombre, código de barras, SKU..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={`!pl-9 !border-2 pulse-neon ${soportaVoz ? "!pr-12" : ""}`}
                style={{ borderColor: "var(--pos-link)" }}
              />
              {soportaVoz && (
                <button
                  onClick={iniciarVoz}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded transition-colors ${
                    escuchando
                      ? "bg-red-600 text-white animate-pulse"
                      : "sunmi-text-muted hover:text-[var(--app-fg)] hover:bg-[var(--pos-control-bg)]"
                  }`}
                  title="Buscar por voz"
                  type="button"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </button>
              )}
              {escuchando && (
                <span className="absolute left-3 -bottom-5 text-xs text-red-400 animate-pulse">
                  Escuchando...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <SunmiSelectAdv
                value={categoriaId}
                placeholder="Categoría"
                onChange={(v) => setCategoriaId(v)}
                className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
              >
                <div value="">Todas</div>
                {(opciones.categorias || []).map((c) => (
                  <div key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </div>
                ))}
              </SunmiSelectAdv>

              <SunmiSelectAdv
                value={proveedorId}
                placeholder="Proveedor"
                onChange={(v) => setProveedorId(v)}
                className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
              >
                <div value="">Todos</div>
                {(opciones.proveedores || []).map((p) => (
                  <div key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </div>
                ))}
              </SunmiSelectAdv>

              <SunmiSelectAdv
                value={areaId}
                placeholder="Área"
                onChange={(v) => setAreaId(v)}
                className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
              >
                <div value="">Todas</div>
                {(opciones.areas || []).map((a) => (
                  <div key={a.id} value={String(a.id)}>
                    {a.nombre}
                  </div>
                ))}
              </SunmiSelectAdv>
            </div>
          </div>

          {/* RESULTADOS */}
          <SunmiSeparator
            label={`Productos (${total})`}
          />

          {loadingCat ? (
            <div className="text-[12px] sunmi-text-muted py-4 text-center">
              Cargando productos...
            </div>
          ) : productos.length === 0 ? (
            <div className="text-[12px] sunmi-text-muted py-4 text-center">
              No se encontraron productos.
            </div>
          ) : (
            <div className="space-y-2">
              {productos.map((prod) => (
                <ProductoCard
                  key={prod.productoLocalId}
                  producto={prod}
                  cantidadActual={carrito[prod.productoLocalId] || 0}
                  onSetCantidad={(cant, uni) =>
                    setCantidad(prod.productoLocalId, cant, uni)
                  }
                />
              ))}
            </div>
          )}

          {/* PAGINACIÓN */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
              <div className="flex items-center gap-3">
                <SunmiButton
                  color="slate"
                  disabled={page <= 1 || loadingCat}
                  onClick={() => cargarCatalogo(page - 1)}
                >
                  ← Anterior
                </SunmiButton>
                <span className="text-[12px] sunmi-text-muted">
                  Página {page} de {totalPages}
                </span>
                <SunmiButton
                  color="slate"
                  disabled={page >= totalPages || loadingCat}
                  onClick={() => cargarCatalogo(page + 1)}
                >
                  Siguiente →
                </SunmiButton>
              </div>
              <SunmiPageSizer
                value={pageSize}
                options={[25, 50, 100]}
                onChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}

// ====================================================
// COMPONENTE: Tarjeta de producto
// ====================================================
function ProductoCard({ producto, cantidadActual, onSetCantidad }) {
  const {
    nombre,
    codigoBarra,
    imagenUrl,
    stockDeposito,
    factorPack,
    categoriaNombre,
    unidadMedida,
    modoEnvio,
  } = producto;

  const bultoMode = modoEnvio === "SOLO_BULTO" && factorPack > 1;

  const labelBulto =
    unidadMedida === "cajon" ? "Cajón" :
    unidadMedida === "pack" ? "Pack" :
    // "caja" y "carton" no están en el enum `UnidadMedida`: eran ramas muertas.
    "Bulto";

  return (
    <div
      className={`
        sunmi-surface border rounded-xl px-4 py-3
        ${cantidadActual > 0 ? "" : "sunmi-border"}
        transition-colors
      `}
      style={cantidadActual > 0 ? {borderColor: 'var(--pos-accent)'} : undefined}
    >
      <div className="flex gap-3">
        {/* Imagen */}
        {imagenUrl ? (
          <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 sunmi-control">
            <img
              src={imagenUrl}
              alt={nombre}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-lg flex-shrink-0 sunmi-control flex items-center justify-center">
            <span className="text-[18px] sunmi-text-muted">
              {nombre?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{nombre}</div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {codigoBarra && (
              <span className="text-[10px] sunmi-text-muted">{codigoBarra}</span>
            )}
            {categoriaNombre && (
              <span className="text-[10px] sunmi-link opacity-70">
                {categoriaNombre}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] sunmi-text-muted">
              Stock dep.: {stockDeposito} u.
            </span>
            {bultoMode && (
              <span className="text-[10px] sunmi-text-muted">
                {labelBulto} x{factorPack}
              </span>
            )}
          </div>
        </div>

        {/* Control +/- */}
        <div className="flex-shrink-0 flex items-center">
          <InputCantidad
            totalActual={cantidadActual}
            factorPack={factorPack}
            unidadMedida={unidadMedida}
            modoEnvio={modoEnvio}
            onChange={onSetCantidad}
          />
        </div>
      </div>

      {/* Info de bultos debajo (cantidadActual ya esta en bultos cuando bultoMode) */}
      {bultoMode && cantidadActual > 0 && (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] sunmi-text-muted">
            = {cantidadActual * factorPack} uds totales
          </span>
          <button
            type="button"
            onClick={() => onSetCantidad(0, "UNIDAD")}
            className="text-[10px] sunmi-link-danger flex-shrink-0"
          >
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}

// ====================================================
// COMPONENTE: Input cantidad (mixto o simple)
// ====================================================
function InputCantidad({ totalActual, factorPack, onChange, mostrarAgregar = true, unidadMedida, modoEnvio }) {
  const bultoMode = modoEnvio === "SOLO_BULTO" && factorPack > 1;

  const labelBulto =
    unidadMedida === "cajon" ? "caj." :
    unidadMedida === "pack" ? "packs" :
    // "caja" y "carton" no están en el enum `UnidadMedida`: eran ramas muertas.
    "bultos";

  // Botón agregar
  if (totalActual === 0 && mostrarAgregar) {
    return (
      <button
        type="button"
        onClick={() => onChange(1, bultoMode ? "BULTO" : "UNIDAD")}
        className="
          h-[32px] px-3
          rounded-lg
          sunmi-btn-link-soft
          text-[12px] font-medium
          transition
        "
      >
        + Agregar
      </button>
    );
  }

  // BULTO mode: +/- en bultos. totalActual ya representa bultos.
  if (bultoMode) {
    const bultos = totalActual;
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0 sunmi-control rounded-lg border sunmi-border overflow-hidden">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, bultos - 1), "BULTO")}
            className="h-[32px] w-[32px] flex items-center justify-center text-[16px] sunmi-control transition"
          >
            -
          </button>
          <div className="h-[32px] px-2 flex items-center justify-center min-w-[36px] text-[13px] font-bold sunmi-text-accent">
            {bultos}
          </div>
          <button
            type="button"
            onClick={() => onChange(bultos + 1, "BULTO")}
            className="h-[32px] w-[32px] flex items-center justify-center text-[16px] sunmi-control transition"
          >
            +
          </button>
        </div>
        <span className="text-[11px] sunmi-text-muted">{labelBulto}</span>
      </div>
    );
  }

  // UNIDAD mode: +/- en unidades
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0 sunmi-control rounded-lg border sunmi-border overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, totalActual - 1), "UNIDAD")}
          className="h-[32px] w-[32px] flex items-center justify-center text-[16px] sunmi-control transition"
        >
          -
        </button>
        <div className="h-[32px] px-2 flex items-center justify-center min-w-[36px] text-[13px] font-bold sunmi-text-accent">
          {totalActual}
        </div>
        <button
          type="button"
          onClick={() => onChange(totalActual + 1, "UNIDAD")}
          className="h-[32px] w-[32px] flex items-center justify-center text-[16px] sunmi-control transition"
        >
          +
        </button>
      </div>
      <span className="text-[11px] sunmi-text-muted">uds</span>
    </div>
  );
}

// ====================================================
// COMPONENTE: Item del carrito (vista pedido)
// ====================================================
function CarritoItemCard({ item, totalActual, onSetCantidad }) {
  const bultoMode = item.modoEnvio === "SOLO_BULTO" && item.factorPack > 1;
  const labelBulto =
    item.unidadMedida === "cajon" ? "caj." :
    item.unidadMedida === "pack" ? "packs" :
    // "caja" y "carton" no están en el enum `UnidadMedida`: eran ramas muertas.
    "bultos";

  return (
    <div className="sunmi-surface border sunmi-border rounded-xl px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">
            {item.nombre}
          </div>
          {item.codigoBarra && (
            <div className="text-[10px] sunmi-text-muted">
              {item.codigoBarra}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSetCantidad(0, "UNIDAD")}
          className="text-[10px] sunmi-link-danger ml-3 flex-shrink-0"
        >
          Quitar
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <InputCantidad
          totalActual={totalActual}
          factorPack={item.factorPack}
          unidadMedida={item.unidadMedida}
          modoEnvio={item.modoEnvio}
          onChange={onSetCantidad}
          mostrarAgregar={false}
        />
        {bultoMode && totalActual > 0 && (
          <span className="text-[10px] sunmi-text-muted ml-2">
            = {totalActual * item.factorPack} uds totales
          </span>
        )}
      </div>
    </div>
  );
}

// ====================================================
// COMPONENTE: Banner pedido pendiente (Solicitado)
// ====================================================
function BannerPendiente({ pendiente, verDetalle, onToggleDetalle, onCancelar, cancelando }) {
  const fecha = pendiente.solicitadoAt
    ? new Date(pendiente.solicitadoAt).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mb-3 sunmi-state-warning rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold sunmi-text-accent">
            Pedido solicitado pendiente
          </div>
          <div className="text-[11px] sunmi-text-muted mt-0.5">
            POS #{pendiente.posId}
            {fecha && <> &middot; {fecha}</>}
            {" "}&middot; {pendiente.itemCount} producto{pendiente.itemCount !== 1 ? "s" : ""}
          </div>
          <div className="text-[11px] sunmi-text-muted mt-1">
            Esperá a que el depósito lo procese o cancelalo para hacer un pedido nuevo.
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onToggleDetalle}
          className="text-[11px] sunmi-link underline transition"
        >
          {verDetalle ? "Ocultar detalle" : "Ver detalle"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={cancelando}
          className="text-[11px] sunmi-link-danger underline transition disabled:opacity-50"
        >
          {cancelando ? "Cancelando..." : "Cancelar pedido"}
        </button>
      </div>

      {verDetalle && pendiente.items?.length > 0 && (
        <div className="mt-3 space-y-1 border-t sunmi-divider pt-2">
          {pendiente.items.map((item, i) => {
            const isBultoMode = item.modoEnvio === "SOLO_BULTO" && item.factorPack > 1;
            const enBulto = item.unidadSugerida === "BULTO";
            // bultos y uds segun como esta guardado el sugerido (compat legacy)
            const bultos = enBulto
              ? item.sugerido
              : (isBultoMode ? Math.floor(item.sugerido / item.factorPack) : 0);
            const uds = enBulto ? item.sugerido * item.factorPack : item.sugerido;
            return (
              <div
                key={i}
                className="flex items-center justify-between text-[11px] sunmi-text-strong"
              >
                <span className="truncate flex-1 min-w-0">{item.nombre}</span>
                <span className="ml-2 sunmi-text-accent font-medium whitespace-nowrap">
                  {isBultoMode
                    ? `${bultos} bulto${bultos !== 1 ? "s" : ""} (${uds} uds)`
                    : `${item.sugerido} unidad${item.sugerido !== 1 ? "es" : ""}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
