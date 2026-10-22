"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiListaProductoCards from "@/components/sunmi/SunmiListaProductoCards";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { showSuccess } from "@/components/sunmi/SunmiToast";

// El selector de tamaño de página se fue de la pantalla: el catálogo se pide
// siempre de a 50, que era el tamaño por defecto.
const TAMANO_DE_PAGINA = 50;

/** Si el producto se pide por bulto. Es el criterio de siempre de la pantalla. */
const salePorBulto = (p) => p.modoEnvio === "SOLO_BULTO" && p.factorPack > 1;

/**
 * La cantidad que se muestra de una línea guardada, según su unidad.
 * - Si unidadSugerida === "BULTO" → it.sugerido ya esta en bultos, leer tal cual.
 * - Si unidadSugerida === "UNIDAD" y el producto sale por bulto (legacy):
 *   convertir a bultos para que el frontend en bultoMode funcione coherente.
 * - Si producto sale por unidad: it.sugerido en unidades, tal cual.
 * La usan el carrito y el pedido enviado: es el mismo dato.
 */
function cantidadEnPantalla(it) {
  if (salePorBulto(it)) {
    return it.unidadSugerida === "BULTO" ? it.sugerido : Math.floor(it.sugerido / it.factorPack);
  }
  return it.sugerido;
}

const productos = (n) => (n === 1 ? "producto" : "productos");

/** "hoy 14:05", o la fecha corta si no es de hoy: "21/10 14:05". */
function cuandoSeEnvio(solicitadoAt) {
  if (!solicitadoAt) return null;
  const dia = fechaArgentinaISO(solicitadoAt) === hoyArgentinaISO() ? "hoy" : diaMesAR(solicitadoAt);
  return `${dia} ${horaAR(solicitadoAt)}`;
}

export default function PedidosCatalogoPage() {
  const router = useRouter();
  const { perfil: perfilPed, cargando: cargandoPed } = useUser();
  // Solicitar y cancelar contestan `needsOperador` cuando falta o venció el PIN.
  // Es el mismo mecanismo del POS: el modal del PIN se levanta encima de esta
  // pantalla sin navegar, y el carrito queda como estaba. No se reintenta solo:
  // con el PIN puesto, la persona vuelve a tocar el botón.
  const { requerirOperador } = useOperadorContext();

  // Estado general
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opciones, setOpciones] = useState(null);

  // Filtros: uno solo, la categoría. Proveedor y área la ruta los sigue
  // aceptando; la pantalla no los manda.
  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  // Catálogo
  const [catalogo, setCatalogo] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // El "Todas · N" del filtro: el total sin buscar ni filtrar. Sale de la misma
  // respuesta del catálogo, la vez que se pide sin filtros.
  const [totalCatalogo, setTotalCatalogo] = useState(null);
  const [loadingCat, setLoadingCat] = useState(false);

  // Carrito (cantidades locales)
  const [carrito, setCarrito] = useState({});
  const [carritoCount, setCarritoCount] = useState(0);
  const [posId, setPosId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [vista, setVista] = useState("catalogo"); // "catalogo" | "carrito"
  const [carritoItems, setCarritoItems] = useState([]);
  const [loadingCarrito, setLoadingCarrito] = useState(false);

  // Pedido pendiente (Solicitado)
  const [pendiente, setPendiente] = useState(null);
  const [cancelandoPendiente, setCancelandoPendiente] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);

  // Debounce busqueda
  const debounceRef = useRef(null);

  // El Volver va en el slot del shell. En "Ver mi pedido" vuelve al catálogo;
  // en el resto, a donde se venía.
  const viendoPedido = vista === "carrito" && !pendiente;
  useAccionDePagina(
    () =>
      viendoPedido ? (
        <SunmiBackButton texto="Volver al catálogo" onVolver={() => setVista("catalogo")} />
      ) : (
        <SunmiBackButton onVolver={() => router.back()} />
      ),
    [viendoPedido, router]
  );

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
        const params = new URLSearchParams({ page: p, pageSize: TAMANO_DE_PAGINA });
        if (busqueda.trim()) params.set("q", busqueda.trim());
        if (categoriaId) params.set("categoriaId", categoriaId);

        const res = await fetch(`/api/pedidos/catalogo?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (json.ok) {
          setCatalogo(json.items || []);
          setPage(json.page || 1);
          setTotalPages(json.totalPages || 1);
          setTotal(json.total || 0);
          if (!busqueda.trim() && !categoriaId) setTotalCatalogo(json.total || 0);
        }
      } catch (err) {
        console.error(err);
      }
      setLoadingCat(false);
    },
    [busqueda, categoriaId]
  );

  // Cargar al montar y cuando cambian los filtros
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
        const mapa = {};
        (json.items || []).forEach((it) => {
          mapa[it.productoLocalId] = cantidadEnPantalla(it);
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
        // El pedido pasó a Solicitado: lo que ahora hay que mostrar es el
        // pendiente, y eso lo trae el carrito del servidor.
        await cargarCarrito();
        showSuccess("Pedido enviado al depósito correctamente");
      } else if (json.needsOperador) {
        setError("Ingresá tu PIN y volvé a tocar «Enviar pedido».");
        requerirOperador();
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
  // El botón de la barra solo pregunta; cancelar de verdad es el del modal.
  const pedirCancelarPendiente = () => {
    if (!pendiente) return;
    setConfirmandoCancelar(true);
  };

  const cancelarPendiente = async () => {
    setConfirmandoCancelar(false);
    if (!pendiente) return;

    setError("");
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
      } else if (json.needsOperador) {
        setError("Ingresá tu PIN y volvé a tocar «Cancelar pedido».");
        requerirOperador();
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

  // Confirmación de cancelar.
  // Sin `destructivo`: es una confirmación, y cerrar sin querer es justamente la
  // salida segura —no se pierde nada—.
  const modalCancelar = (
    <SunmiModalLayout
      open={confirmandoCancelar}
      title="Cancelar pedido"
      onClose={() => setConfirmandoCancelar(false)}
      forma="hoja-o-centrado"
      // Los dos que el kit no tiene por defecto, con los valores de su hoja de
      // confirmación (`SunmiHojaDeConfirmacion`).
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      footer={
        <>
          <SunmiButton color="slate" onClick={() => setConfirmandoCancelar(false)}>
            Volver
          </SunmiButton>
          <SunmiButton color="red" onClick={cancelarPendiente}>
            Cancelar pedido
          </SunmiButton>
        </>
      }
    >
      <p className="text-sm2 sunmi-text-muted leading-snug">¿Cancelar el pedido solicitado? Se eliminarán todos los items.</p>
    </SunmiModalLayout>
  );

  // ====================================================
  // LOS TRES ESTADOS: armando en el catálogo, armando en "Ver mi pedido", y
  // esperando al depósito. Las tarjetas son las mismas en los tres.
  // ====================================================
  const esperando = !!pendiente;
  const enPedido = esperando ? pendiente.itemCount ?? pendiente.items?.length ?? 0 : carritoCount;

  const tarjetaDelCatalogo = (prod) => (
    <TarjetaPedido
      key={prod.productoLocalId}
      producto={prod}
      cantidad={carrito[prod.productoLocalId] ?? 0}
      enPedido={carrito[prod.productoLocalId] != null}
      onCantidad={(cant, uni) => setCantidad(prod.productoLocalId, cant, uni)}
    />
  );

  const vacio = (texto) => <p className="text-sm2 sunmi-text-muted text-center py-4">{texto}</p>;

  let lista;
  if (esperando) {
    // Lo enviado no trae el id del producto: se identifica por su lugar.
    lista = (
      <SunmiListaProductoCards>
        {(pendiente.items || []).map((item, i) => (
          <TarjetaPedido key={i} producto={item} cantidad={cantidadEnPantalla(item)} apagada />
        ))}
      </SunmiListaProductoCards>
    );
  } else if (viendoPedido) {
    lista = loadingCarrito
      ? vacio("Cargando carrito...")
      : carritoItems.length === 0
        ? vacio("El carrito está vacío. Volvé al catálogo para agregar productos.")
        : <SunmiListaProductoCards>{carritoItems.map(tarjetaDelCatalogo)}</SunmiListaProductoCards>;
  } else {
    lista = loadingCat
      ? vacio("Cargando productos...")
      : catalogo.length === 0
        ? vacio("No se encontraron productos.")
        : <SunmiListaProductoCards>{catalogo.map(tarjetaDelCatalogo)}</SunmiListaProductoCards>;
  }

  const enviadoCuando = esperando ? cuandoSeEnvio(pendiente.solicitadoAt) : null;

  return (
    <div className="w-full min-h-full mx-auto max-w-xl px-4 pt-4 pb-4">
      <SunmiPantallaDeTrabajo
        idCategoria="categoria-pedido"
        contexto={
          <>
            <div className="flex items-center gap-2">
              <span className="font-semibold sunmi-text-strong">Pedido al depósito</span>
              <SunmiPill color={esperando ? "cyan" : "slate"}>{esperando ? "Enviado" : "Borrador"}</SunmiPill>
            </div>
            <p className="text-sm2 sunmi-text-muted">
              {esperando
                ? `Enviado${enviadoCuando ? ` ${enviadoCuando}` : ""} · esperando al depósito`
                : `${opciones.local.nombre} → ${opciones.deposito.nombre} · se guarda solo`}
            </p>
            <p className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">{enPedido}</span>{" "}
              {esperando
                ? `${productos(enPedido)} · para pedir otra cosa, cancelalo`
                : `${productos(enPedido)} en el pedido`}
            </p>
          </>
        }
        buscador={
          esperando || viendoPedido ? null : (
            <SunmiCampoBusquedaVoz
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar producto o código"
              ariaLabel="Buscar producto o código"
            />
          )
        }
        categoria={
          esperando || viendoPedido ? null : (
            <SunmiSelectAdv id="categoria-pedido" value={categoriaId} onChange={(v) => setCategoriaId(v)}>
              <SunmiSelectOption value="">{`Todas · ${totalCatalogo ?? total}`}</SunmiSelectOption>
              {(opciones.categorias || []).map((c) => (
                <SunmiSelectOption key={c.id} value={String(c.id)}>
                  {c.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          )
        }
        antesDeLista={
          error ? (
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
          ) : null
        }
        lista={lista}
        despuesDeLista={
          !esperando && !viendoPedido && totalPages > 1 ? (
            <SunmiPaginador
              page={page}
              pageSize={TAMANO_DE_PAGINA}
              totalPages={totalPages}
              totalItems={total}
              onPrev={() => cargarCatalogo(Math.max(1, page - 1))}
              onNext={() => cargarCatalogo(Math.min(totalPages, page + 1))}
              onGoToPage={(p) => cargarCatalogo(p)}
            />
          ) : null
        }
        pieDePantalla={
          esperando ? (
            <div className="space-y-2">
              <p className="text-sm2 sunmi-text-muted">{`Pedido enviado · ${enPedido} ${productos(enPedido)}`}</p>
              <SunmiButton
                color="red"
                className="w-full min-h-toque"
                disabled={cancelandoPendiente}
                onClick={pedirCancelarPendiente}
              >
                {cancelandoPendiente ? "Cancelando..." : "Cancelar pedido"}
              </SunmiButton>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">{`${carritoCount} ${productos(carritoCount)} en el pedido`}</span>
                {viendoPedido ? null : <SunmiLinkButton onClick={abrirCarrito}>Ver mi pedido ›</SunmiLinkButton>}
              </div>
              <SunmiButton
                color="primary"
                className="w-full min-h-toque"
                disabled={enviando || carritoCount === 0}
                onClick={enviarPedido}
              >
                {enviando ? "Enviando..." : "Enviar pedido al depósito"}
              </SunmiButton>
            </div>
          )
        }
        despuesDelPie={modalCancelar}
      />
    </div>
  );
}

// ====================================================
// COMPONENTE: Tarjeta de un producto del pedido
// ====================================================
// La misma en el catálogo, en "Ver mi pedido" y en el pedido enviado. No
// muestra stock del depósito —está mayormente en negativo y confunde—, ni foto,
// ni categoría, ni código.
//
// El número se puede tipear: lo escrito se manda al salir del campo (o con
// Enter), no tecla por tecla, para que "12" no viaje como un 1 y después un 12.
// El − y el + mandan en el acto.
function TarjetaPedido({ producto, cantidad, enPedido = false, apagada = false, onCantidad }) {
  const { nombre, factorPack } = producto;
  const porBulto = salePorBulto(producto);
  const unidad = porBulto ? "BULTO" : "UNIDAD";
  const [escrito, setEscrito] = useState(null);
  const campoRef = useRef(null);

  const cambiar = (s) => {
    if (typeof document !== "undefined" && document.activeElement === campoRef.current) {
      setEscrito(s);
      return;
    }
    onCantidad?.(Number(s) || 0, unidad);
  };

  const confirmar = () => {
    if (escrito === null) return;
    const n = Number(escrito) || 0;
    setEscrito(null);
    if (n !== cantidad) onCantidad?.(n, unidad);
  };

  return (
    // Las dos marcas son el asidero de los candados (`pantallaPedidos.test.mjs`).
    <SunmiCard data-tarjeta-pedido={nombre} className="p-3 space-y-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-sm3 font-semibold sunmi-text-strong break-words">{nombre}</p>
        {enPedido && !apagada ? (
          <SunmiButton
            color="ghost"
            aria-label={`Quitar ${nombre} del pedido`}
            onClick={() => onCantidad?.(0, "UNIDAD")}
            className="shrink-0 min-w-toque min-h-toque inline-flex items-center justify-center"
          >
            <X size={18} aria-hidden="true" />
          </SunmiButton>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span data-unidad-pedido="" className="text-sm2 sunmi-text-muted">{porBulto ? `Por BULTO de ${factorPack} u` : "UNIDAD"}</span>
        <SunmiCampoCantidad
          valor={escrito ?? String(cantidad ?? 0)}
          onCambiar={cambiar}
          etiqueta={`Cantidad de ${nombre}`}
          minimo={0}
          tamano="grande"
          claseMarco="w-16"
          apagaMenosEnMinimo
          deshabilitado={apagada}
          inputRef={campoRef}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
    </SunmiCard>
  );
}
