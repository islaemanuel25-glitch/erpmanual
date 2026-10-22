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
import { MiniaturaProductoTarjeta } from "@/components/sunmi/SunmiProductoCard";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import { showSuccess } from "@/components/sunmi/SunmiToast";
import { tamanoDePaginaCatalogo } from "@/lib/pedidos/tamanoDePagina";
import { salePorBulto, juntarPorProducto, claveDeLoEnviado } from "@/lib/pedidos/lineasDelPedido";

// Cuántos productos por página: lo elige la persona al pie de la lista y queda
// recordado en el celular con la clave de siempre de esta pantalla. Las
// opciones y el 50 por defecto son los de la ruta: `lib/pedidos/tamanoDePagina`.
const CLAVE_TAMANO_DE_PAGINA = "pedidos_page_size";

function tamanoGuardado() {
  try {
    return tamanoDePaginaCatalogo(localStorage.getItem(CLAVE_TAMANO_DE_PAGINA));
  } catch {
    return tamanoDePaginaCatalogo(null);
  }
}

// "Ver fotos": arranca apagado y el celular recuerda lo elegido. Sin nada
// guardado, o si no se puede leer, apagado.
const CLAVE_VER_FOTOS = "pedidos_ver_fotos";

function fotosGuardadas() {
  try {
    return localStorage.getItem(CLAVE_VER_FOTOS) === "1";
  } catch {
    return false;
  }
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
  const [pageSize, setPageSizeRaw] = useState(tamanoGuardado);
  // Cambiar el tamaño vuelve a la página 1: el efecto de los filtros mira
  // `pageSize` y vuelve a pedir el catálogo desde el principio.
  const setPageSize = (size) => {
    setPageSizeRaw(size);
    setPage(1);
    try { localStorage.setItem(CLAVE_TAMANO_DE_PAGINA, String(size)); } catch {}
  };
  // Se lee lo guardado ACÁ, al crear el estado, y no en un efecto: `SunmiToggle`
  // toma su `value` una sola vez al montarse y después lleva el suyo, así que
  // tiene que nacer con el valor bueno. Se monta recién cuando terminó la carga.
  const [verFotos, setVerFotosRaw] = useState(fotosGuardadas);
  const setVerFotos = (v) => {
    setVerFotosRaw(v);
    try { localStorage.setItem(CLAVE_VER_FOTOS, v ? "1" : "0"); } catch {}
  };
  // El "Todas · N" del filtro: el total sin buscar ni filtrar. Sale de la misma
  // respuesta del catálogo, la vez que se pide sin filtros.
  const [totalCatalogo, setTotalCatalogo] = useState(null);
  const [loadingCat, setLoadingCat] = useState(false);

  // Carrito (cantidades locales)
  const [carrito, setCarrito] = useState({});
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
        const params = new URLSearchParams({ page: p, pageSize });
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
    [busqueda, categoriaId, pageSize]
  );

  // Cargar al montar y cuando cambian los filtros o el tamaño de página
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
        // Una línea por producto, con la cantidad sumada: el pedido puede
        // tener dos líneas del mismo producto (ver `juntarPorProducto`).
        const lineas = juntarPorProducto(json.items, (it) => it.productoLocalId);
        setCarritoItems(lineas);
        setPendiente(json.pendiente || null);

        // Reconstruir mapa de cantidades segun la unidad guardada del item.
        const mapa = {};
        lineas.forEach((it) => {
          mapa[it.productoLocalId] = it.cantidad;
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
  // Lo enviado, una tarjeta por producto con la cantidad sumada. La ruta no
  // manda el id del producto en el pendiente: la clave es nombre y forma.
  const enviados = esperando ? juntarPorProducto(pendiente.items, claveDeLoEnviado) : [];
  // Cuántos PRODUCTOS hay, no cuántas líneas: `itemCount` de las rutas cuenta
  // líneas, y un producto con dos líneas contaba doble.
  const productosEnElCarrito = Object.keys(carrito).length;
  const enPedido = esperando ? enviados.length : productosEnElCarrito;

  const tarjetaDelCatalogo = (prod) => (
    <TarjetaPedido
      key={prod.productoLocalId}
      producto={prod}
      cantidad={carrito[prod.productoLocalId] ?? 0}
      enPedido={carrito[prod.productoLocalId] != null}
      conFoto={verFotos}
      onCantidad={(cant, uni) => setCantidad(prod.productoLocalId, cant, uni)}
    />
  );

  const vacio = (texto) => <p className="text-sm2 sunmi-text-muted text-center py-4">{texto}</p>;

  // `mismoAlto={false}`: cada tarjeta mide lo que necesita. Con la grilla
  // igualando altos, un nombre de dos renglones estiraba todas las de la página
  // y dejaba un hueco debajo del − valor +. Miden igual entre sí por el lugar
  // de la ✕, que está siempre.
  //
  // CADA LISTA LLEVA SU PROPIA CLAVE ("catalogo", "revision", "enviado"): al
  // pasar de una a otra React tira la vieja entera y arma la nueva, sin
  // reusar ninguna tarjeta. Antes las tres eran el mismo elemento y React
  // emparejaba tarjetas por clave entre listas distintas; con dos tarjetas de
  // la misma clave en "Ver mi pedido" (un producto con dos líneas) una quedaba
  // viva, con su ✕ y su − valor +, arriba del pedido ya enviado.
  let lista;
  if (esperando) {
    lista = (
      <SunmiListaProductoCards key="enviado" mismoAlto={false}>
        {enviados.map((item) => (
          <TarjetaPedido key={claveDeLoEnviado(item)} producto={item} cantidad={item.cantidad} conFoto={verFotos} apagada />
        ))}
      </SunmiListaProductoCards>
    );
  } else if (viendoPedido) {
    lista = loadingCarrito
      ? vacio("Cargando carrito...")
      : carritoItems.length === 0
        ? vacio("El carrito está vacío. Volvé al catálogo para agregar productos.")
        : <SunmiListaProductoCards key="revision" mismoAlto={false}>{carritoItems.map(tarjetaDelCatalogo)}</SunmiListaProductoCards>;
  } else {
    lista = loadingCat
      ? vacio("Cargando productos...")
      : catalogo.length === 0
        ? vacio("No se encontraron productos.")
        : <SunmiListaProductoCards key="catalogo" mismoAlto={false}>{catalogo.map(tarjetaDelCatalogo)}</SunmiListaProductoCards>;
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
          <>
            {/* Debajo del filtro, y solo donde está el filtro: en Ver mi pedido
                y en el pedido enviado no se ve, pero lo elegido se respeta. */}
            {esperando || viendoPedido ? null : (
              <div data-ver-fotos="">
                <SunmiToggle value={verFotos} onChange={setVerFotos} label="Ver fotos" />
              </div>
            )}
            {error ? (
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
            ) : null}
          </>
        }
        lista={lista}
        despuesDeLista={
          // Va aunque haya una sola página: adentro está el elegidor de 25, 50 o
          // 100 (las opciones por defecto de `SunmiPageSizer`, las mismas de la
          // ruta), y si se escondiera, quien eligió 100 y le entró todo en una
          // no podría volver a 25. Sin productos no hay nada que paginar.
          !esperando && !viendoPedido && total > 0 ? (
            <SunmiPaginador
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalItems={total}
              onPrev={() => cargarCatalogo(Math.max(1, page - 1))}
              onNext={() => cargarCatalogo(Math.min(totalPages, page + 1))}
              onGoToPage={(p) => cargarCatalogo(p)}
              onPageSizeChange={setPageSize}
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
                <span className="text-sm2 sunmi-text-muted">{`${productosEnElCarrito} ${productos(productosEnElCarrito)} en el pedido`}</span>
                {viendoPedido ? null : <SunmiLinkButton onClick={abrirCarrito}>Ver mi pedido ›</SunmiLinkButton>}
              </div>
              <SunmiButton
                color="primary"
                className="w-full min-h-toque"
                disabled={enviando || productosEnElCarrito === 0}
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
function TarjetaPedido({ producto, cantidad, enPedido = false, apagada = false, conFoto = false, onCantidad }) {
  const { nombre, factorPack } = producto;
  const porBulto = salePorBulto(producto);
  const unidad = porBulto ? "BULTO" : "UNIDAD";
  const puedeQuitar = enPedido && !apagada;
  const [escrito, setEscrito] = useState(null);
  const campoRef = useRef(null);

  const cambiar = (s) => {
    if (typeof document !== "undefined" && document.activeElement === campoRef.current) {
      setEscrito(s);
      return;
    }
    onCantidad?.(Number(s) || 0, unidad);
  };

  // Al salir: vacío vale 0 —el producto sale del pedido, como con la ✕—, y si
  // no cambió no se manda nada.
  const confirmar = () => {
    if (escrito === null) return;
    const n = Number(escrito) || 0;
    setEscrito(null);
    if (n !== cantidad) onCantidad?.(n, unidad);
  };

  return (
    // Las dos marcas son el asidero de los candados (`pantallaPedidos.test.mjs`).
    <SunmiCard data-tarjeta-pedido={nombre} className="p-3">
      <div className="flex gap-3">
      {/* Con "Ver fotos" prendido, la foto a la izquierda ocupando su lugar
          siempre: sin foto, la inicial en el mismo cuadrado. El pedido enviado
          no trae la foto (`pendiente.items` no tiene `imagenUrl`), así que ahí
          va la inicial. Apagado, no hay cuadrado y el resto usa todo el ancho. */}
      {conFoto ? <MiniaturaProductoTarjeta url={producto.imagenUrl} conservaLugar nombre={nombre} /> : null}
      <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-sm3 font-semibold sunmi-text-strong break-words">{nombre}</p>
        {/* ── EL LUGAR DE LA ✕ ESTÁ SIEMPRE ──────────────────────────────
            Aparecía solo con el producto en el pedido, y como es un toque de
            44 px al lado de una línea de texto, al pasar de 0 a 1 el renglón
            del nombre crecía y el − valor + bajaba: el dedo quedaba sobre otra
            cosa. Ahora el botón está siempre, del mismo alto y ancho. Sin el
            producto en el pedido —y en el pedido enviado— va invisible, apagado,
            fuera del orden de foco y oculto al lector de pantalla: ocupa su
            lugar y nada más. */}
        <SunmiButton
          color="ghost"
          data-lugar-quitar=""
          aria-label={puedeQuitar ? `Quitar ${nombre} del pedido` : undefined}
          aria-hidden={puedeQuitar ? undefined : "true"}
          tabIndex={puedeQuitar ? undefined : -1}
          disabled={!puedeQuitar}
          onClick={() => {
            if (puedeQuitar) onCantidad?.(0, "UNIDAD");
          }}
          className={`shrink-0 min-w-toque min-h-toque inline-flex items-center justify-center${puedeQuitar ? "" : " invisible"}`}
        >
          <X size={18} aria-hidden="true" />
        </SunmiButton>
      </div>
      {/* Con la foto al lado, "Por BULTO de 6 u" y el − valor + no siempre
          entran en un renglón a 360 px: la unidad se parte en dos (`min-w-0`)
          y el campo no se achica (`shrink-0`), que es el que se toca. */}
      <div className="flex items-center justify-between gap-2">
        <span data-unidad-pedido="" className="min-w-0 text-sm2 sunmi-text-muted">{porBulto ? `Por BULTO de ${factorPack} u` : "UNIDAD"}</span>
        <div className="shrink-0">
          <SunmiCampoCantidad
            valor={escrito ?? String(cantidad ?? 0)}
            onCambiar={cambiar}
            etiqueta={`Cantidad de ${nombre}`}
            minimo={0}
            tamano="grande"
            claseMarco="w-16"
            apagaMenosEnMinimo
            // El 0 es guía y no un número cargado, y lo que se escribe
            // reemplaza lo que había. Vacío al salir vale 0: lo decide
            // `confirmar`, que además no manda nada si no cambió. En el pedido
            // enviado el campo está apagado y no hace falta.
            minimoComoGuia={!apagada}
            deshabilitado={apagada}
            inputRef={campoRef}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
      </div>
      </div>
      </div>
    </SunmiCard>
  );
}
