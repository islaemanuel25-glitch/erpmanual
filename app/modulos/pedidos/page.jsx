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
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
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
import PedidosEscritorio from "@/components/pedidos/PedidosEscritorio";

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

/**
 * El renglón de abajo de un pedido anterior: estado, fecha corta y, si el dato
 * está, cuántos. `itemCount` de `/api/pedidos/historial` cuenta LÍNEAS: un
 * pedido viejo con un producto repetido cuenta uno de más.
 */
function lineaDelAnterior(a) {
  const cuando = a.solicitadoAt ?? a.createdAt;
  const partes = [a.estado, cuando ? diaMesAR(cuando) : null];
  if (Number.isInteger(a.itemCount)) partes.push(`${a.itemCount} ${productos(a.itemCount)}`);
  return partes.filter(Boolean).join(" · ");
}

/** "hoy 14:05", o la fecha corta si no es de hoy: "21/10 14:05". */
function cuandoSeEnvio(solicitadoAt) {
  if (!solicitadoAt) return null;
  const dia = fechaArgentinaISO(solicitadoAt) === hoyArgentinaISO() ? "hoy" : diaMesAR(solicitadoAt);
  return `${dia} ${horaAR(solicitadoAt)}`;
}

// ── EL REPARTO: TELÉFONO Y COMPUTADORA ────────────────────────────────────
//
// Por debajo de 1024 px, la pantalla del teléfono, TAL CUAL: es
// `PedidosCatalogoPage`, más abajo, que no cambió en nada. Desde 1024 px, la
// de computadora, en su propio archivo (`components/pedidos/PedidosEscritorio`),
// con su propio estado: el del teléfono vive adentro de esta pantalla y
// sacarlo sería tocarla. Mismo reparto por CSS que `WorkspaceRecepcion`.
//
// El envoltorio del teléfono es `contents` además de `lg:hidden`: así no es
// una caja más entre la página y su contenido, y el `min-h-full` de adentro
// sigue midiendo contra lo mismo que antes. Desde `lg`, `hidden` lo apaga.
export default function PaginaPedidos() {
  return (
    <>
      <div data-pedidos-celular="" className="contents lg:hidden">
        <PedidosCatalogoPage />
      </div>
      <div data-pedidos-escritorio="" className="hidden lg:block">
        <PedidosEscritorio />
      </div>
    </>
  );
}

function PedidosCatalogoPage() {
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
  // Se entra por la página de entrada, no por el catálogo: la tarjeta del
  // pedido en curso y los pedidos anteriores (pedido de Emanuel, 2026-10-22).
  // "lectura" es "Ver pedido" del pedido enviado: lo pedido, solo para mirar.
  const [vista, setVista] = useState("entrada"); // "entrada" | "catalogo" | "carrito" | "lectura"
  // "Ver mi pedido" se abre desde el catálogo o desde la entrada, y su Volver
  // vuelve a donde se estaba.
  const [volverA, setVolverA] = useState("entrada");
  // Hasta que el carrito contesta, la entrada no sabe si hay pedido en curso:
  // sin esto diría "No tenés un pedido en curso" un instante.
  const [carritoCargado, setCarritoCargado] = useState(false);
  // Los últimos pedidos al depósito, de `/api/pedidos/historial`.
  const [anteriores, setAnteriores] = useState([]);
  // MODO SUMAR: lo que se carga sobre el pedido enviado queda acá, en la
  // pantalla, hasta que se confirma con "Agregar al pedido (N)" (Emanuel,
  // 2026-10-22: "Sumar productos debería dejar sumar pero con una
  // confirmación"). productoLocalId → { cantidad, unidad }: la cantidad que va
  // a quedar, no la diferencia.
  const [cambios, setCambios] = useState({});
  const [agregando, setAgregando] = useState(false);
  const [confirmandoDescartar, setConfirmandoDescartar] = useState(false);
  const [carritoItems, setCarritoItems] = useState([]);
  const [loadingCarrito, setLoadingCarrito] = useState(false);

  // Pedido pendiente (Solicitado)
  const [pendiente, setPendiente] = useState(null);
  const [cancelandoPendiente, setCancelandoPendiente] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);

  // Debounce busqueda
  const debounceRef = useRef(null);

  // El pedido enviado se sigue armando hasta que el depósito lo empieza
  // (`depositoEmpezo` de la ruta del carrito, el mismo criterio que hace que
  // `set-cantidad` conteste 409). Empezado, solo se mira.
  const empezado = !!pendiente?.depositoEmpezo;

  // El Volver va en el slot del shell. Desde la entrada, a donde se venía. En
  // "Ver mi pedido" abierto desde el catálogo, al catálogo. En el resto —el
  // catálogo, "Ver mi pedido" abierto desde la entrada, el pedido empezado—,
  // a la entrada.
  const enEntrada = vista === "entrada";
  const viendoPedido = vista === "carrito" && !empezado;
  const alCatalogo = viendoPedido && volverA === "catalogo";
  // El catálogo sobre el pedido enviado sin empezar es el modo sumar: nada se
  // escribe hasta confirmar, y `set-cantidad` no se llama.
  const sumando = !!pendiente && !empezado && vista === "catalogo";
  const cambiosSinConfirmar = Object.keys(cambios).length;
  // Salir del modo sumar con cambios pregunta antes de tirarlos.
  const salirDeSumar = () => {
    if (cambiosSinConfirmar > 0) setConfirmandoDescartar(true);
    else setVista("entrada");
  };
  useAccionDePagina(
    () =>
      enEntrada ? (
        <SunmiBackButton onVolver={() => router.back()} />
      ) : alCatalogo ? (
        <SunmiBackButton texto="Volver al catálogo" onVolver={() => setVista("catalogo")} />
      ) : sumando ? (
        <SunmiBackButton onVolver={salirDeSumar} />
      ) : (
        <SunmiBackButton onVolver={() => setVista("entrada")} />
      ),
    [enEntrada, alCatalogo, sumando, cambiosSinConfirmar, router]
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

        // Cargar carrito existente y los pedidos anteriores
        cargarCarrito();
        cargarAnteriores();
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
        // Con un pedido enviado, lo que se arma es ESE pedido: `set-cantidad`
        // escribe ahí y no abre borrador. Sus líneas son las del carrito.
        // Una línea por producto, con la cantidad sumada: el pedido puede
        // tener dos líneas del mismo producto (ver `juntarPorProducto`).
        const lineas = juntarPorProducto(json.pendiente ? json.pendiente.items : json.items, (it) => it.productoLocalId);
        setCarritoItems(lineas);
        setPendiente(json.pendiente || null);

        // Reconstruir mapa de cantidades segun la unidad guardada del item.
        const mapa = {};
        lineas.forEach((it) => {
          mapa[it.productoLocalId] = it.cantidad;
        });
        setCarrito(mapa);
        setCarritoCargado(true);
        return json;
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  };

  // ====================================================
  // PEDIDOS ANTERIORES (página de entrada)
  // ====================================================
  // Cuatro: los tres que se muestran más el que puede estar en curso, que el
  // historial también trae y la entrada deja afuera porque está en la tarjeta.
  // Si falla, la sección no se muestra: no es lo que la persona vino a hacer.
  const cargarAnteriores = async () => {
    try {
      const res = await fetch("/api/pedidos/historial?page=1&pageSize=4", { cache: "no-store" });
      const json = await res.json();
      setAnteriores(json.ok ? json.items || [] : []);
    } catch (err) {
      console.error(err);
      setAnteriores([]);
    }
  };

  // Volver a leer el carrito después de un 409 —el depósito empezó el pedido
  // justo antes del toque— y, si quedó empezado, ir a la entrada, que lo
  // muestra en "Preparando".
  const releerTrasRechazo = async () => {
    const k = await cargarCarrito();
    if (k?.pendiente?.depositoEmpezo) setVista("entrada");
  };

  // ====================================================
  // SET CANTIDAD
  // ====================================================
  const setCantidad = async (productoLocalId, cantidad, unidad = "UNIDAD") => {
    // Empezado no hay tarjetas vivas; esto es por si algo llegara a llamarlo.
    // Si el depósito lo empezó y la pantalla todavía no se enteró, la ruta
    // contesta 409, el mensaje sale arriba y el carrito se vuelve a leer: con
    // eso la pantalla vuelve sola a la entrada, en "Preparando".
    if (empezado) return;

    // En el modo sumar se anota en la pantalla y nada viaja. Volver a la
    // cantidad del pedido deja de ser un cambio.
    if (sumando) {
      setCambios((prev) => {
        const next = { ...prev };
        if (cantidad === (carrito[productoLocalId] ?? 0)) delete next[productoLocalId];
        else next[productoLocalId] = { cantidad, unidad };
        return next;
      });
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
        await releerTrasRechazo();
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      await releerTrasRechazo();
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
        // Enviado, la pantalla vuelve sola a la entrada, que lo muestra como
        // "Enviado". El pedido pasó a Solicitado: eso lo trae el carrito del
        // servidor.
        setVista("entrada");
        await cargarCarrito();
        cargarAnteriores();
        showSuccess("Pedido enviado al depósito correctamente");
      } else if (json.needsOperador) {
        setError("Ingresá tu PIN y volvé a tocar «Enviar pedido al depósito».");
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
  // MODO SUMAR: CONFIRMAR O DESCARTAR LOS CAMBIOS
  // ====================================================
  // "Agregar al pedido (N)" ES la confirmación: un toque y viajan todos juntos
  // a `/api/pedidos/sumar-al-enviado`, que los aplica todos o ninguno.
  const confirmarCambios = async () => {
    if (!pendiente || cambiosSinConfirmar === 0) return;
    const lista = Object.entries(cambios).map(([id, c]) => ({ productoLocalId: Number(id), cantidad: c.cantidad, unidad: c.unidad }));
    setError("");
    setAgregando(true);
    try {
      const res = await fetch("/api/pedidos/sumar-al-enviado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId: pendiente.posId, cambios: lista }),
      });
      const json = await res.json();
      if (json.ok) {
        setCambios({});
        setVista("entrada");
        await cargarCarrito();
        showSuccess(lista.length === 1 ? "Se agregó 1 cambio al pedido" : `Se agregaron ${lista.length} cambios al pedido`);
      } else if (res.status === 409) {
        // El depósito lo empezó (o el pedido ya no espera): no entró ninguno.
        // Se avisa, se tiran los cambios y la entrada, releída, lo muestra
        // como está ahora —"Preparando" si lo empezó—.
        setError(json.error || "No se pudieron agregar los cambios al pedido");
        setCambios({});
        setVista("entrada");
        await cargarCarrito();
      } else {
        setError(json.error || "No se pudieron agregar los cambios al pedido");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión al agregar los cambios");
    }
    setAgregando(false);
  };

  const descartarCambios = () => {
    setConfirmandoDescartar(false);
    setCambios({});
    setVista("entrada");
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
        // Las cantidades en pantalla eran las del pedido cancelado: se tiran,
        // y lo que haya ahora lo dice el carrito del servidor.
        setPendiente(null);
        setCarrito({});
        setCarritoItems([]);
        setVista("entrada");
        await cargarCarrito();
        cargarAnteriores();
      } else if (json.needsOperador) {
        setError("Ingresá tu PIN y volvé a tocar «Cancelar pedido».");
        requerirOperador();
      } else {
        setError(json.error || "Error al cancelar pedido");
        // El 409 de un pedido que el depósito empezó justo antes del toque: el
        // carrito, releído, lo trae empezado y la pantalla vuelve sola a la
        // entrada, en "Preparando", sin cancelar.
        await releerTrasRechazo();
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
  const abrirCarrito = async (desde = "catalogo") => {
    setVolverA(desde);
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

  // Salir del modo sumar con cambios sin confirmar. La misma hoja que la de
  // cancelar; sin `destructivo` por lo mismo: cerrarla sin querer es "Seguir
  // cargando", que no pierde nada.
  const modalDescartar = (
    <SunmiModalLayout
      open={confirmandoDescartar}
      title="Cambios sin confirmar"
      onClose={() => setConfirmandoDescartar(false)}
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      footer={
        <>
          <SunmiButton color="slate" onClick={() => setConfirmandoDescartar(false)}>
            Seguir cargando
          </SunmiButton>
          <SunmiButton color="red" onClick={descartarCambios}>
            Descartar
          </SunmiButton>
        </>
      }
    >
      <p className="text-sm2 sunmi-text-muted leading-snug">
        {`Tenés ${cambiosSinConfirmar} ${cambiosSinConfirmar === 1 ? "cambio" : "cambios"} sin confirmar. ¿Descartarlos?`}
      </p>
    </SunmiModalLayout>
  );

  // ====================================================
  // LOS ESTADOS: armando el borrador (en el catálogo o en "Ver mi pedido"),
  // enviado y todavía sin empezar (igual, pero lo que se carga va directo al
  // pedido enviado, y no hay botón de enviar), y empezado por el depósito
  // (solo lo pedido, apagado). Las tarjetas son las mismas en todos.
  // ====================================================
  const esperando = !!pendiente;
  // Solo para mirar: el pedido empezado, y el enviado abierto con "Ver pedido"
  // desde la entrada (Emanuel, 2026-10-22: "Ver pedido no debería dejar
  // agregar productos"). Lo pedido, apagado, sin buscador ni filtro.
  const soloMirar = empezado || (esperando && vista === "lectura");
  // Lo enviado, una tarjeta por producto con la cantidad sumada.
  const enviados = soloMirar ? juntarPorProducto(pendiente.items, claveDeLoEnviado) : [];
  // Cuántos PRODUCTOS hay, no cuántas líneas: `itemCount` de las rutas cuenta
  // líneas, y un producto con dos líneas contaba doble.
  const productosEnElCarrito = Object.keys(carrito).length;
  const enPedido = soloMirar ? enviados.length : productosEnElCarrito;

  // En el modo sumar, la tarjeta muestra la cantidad que va a quedar: la del
  // pedido con el cambio sin confirmar encima.
  const cantidadEnPantalla = (id) => (sumando && cambios[id] ? cambios[id].cantidad : carrito[id] ?? 0);
  const tarjetaDelCatalogo = (prod) => (
    <TarjetaPedido
      key={prod.productoLocalId}
      producto={prod}
      cantidad={cantidadEnPantalla(prod.productoLocalId)}
      enPedido={sumando ? cantidadEnPantalla(prod.productoLocalId) > 0 : carrito[prod.productoLocalId] != null}
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
  if (soloMirar) {
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
        ? vacio(esperando ? "El pedido enviado está vacío. Volvé al catálogo para sumar productos." : "El carrito está vacío. Volvé al catálogo para agregar productos.")
        : <SunmiListaProductoCards key="revision" mismoAlto={false}>{carritoItems.map(tarjetaDelCatalogo)}</SunmiListaProductoCards>;
  } else {
    lista = loadingCat
      ? vacio("Cargando productos...")
      : catalogo.length === 0
        ? vacio("No se encontraron productos.")
        : <SunmiListaProductoCards key="catalogo" mismoAlto={false}>{catalogo.map(tarjetaDelCatalogo)}</SunmiListaProductoCards>;
  }

  const enviadoCuando = esperando ? cuandoSeEnvio(pendiente.solicitadoAt) : null;

  // El aviso de arriba: en la entrada y en el catálogo, el mismo.
  const avisoDeError = error ? (
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
  ) : null;

  // ====================================================
  // LA PÁGINA DE ENTRADA
  // ====================================================
  // Lo primero que se ve al entrar: el pedido en curso, si hay, con lo que se
  // puede hacer con él, y debajo los últimos pedidos. El catálogo se abre
  // desde acá.
  if (enEntrada) {
    const enCurso = !carritoCargado
      ? null
      : empezado
        ? "preparando"
        : esperando
          ? "enviado"
          : productosEnElCarrito > 0
            ? "borrador"
            : "nada";
    // El historial trae también el pedido en curso (está Solicitado): ése va
    // en la tarjeta, no entre los anteriores.
    const delHistorial = anteriores.filter((a) => a.posId !== pendiente?.posId).slice(0, 3);
    const irAlHistorial = () => router.push("/modulos/pedidos/historial");
    const PILL = { borrador: ["slate", "Borrador"], enviado: ["cyan", "Enviado"], preparando: ["amber", "Preparando"] };
    const accion = (texto, color, onClick, className = "") => (
      <SunmiButton color={color} className={`w-full min-h-toque ${className}`} onClick={onClick}>
        {texto}
      </SunmiButton>
    );

    return (
      <div className="w-full min-h-full mx-auto max-w-xl px-4 pt-4 pb-4 space-y-4">
        {avisoDeError}
        <SunmiCard data-entrada-pedido="" className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold sunmi-text-strong">Pedido al depósito</span>
            {PILL[enCurso] ? <SunmiPill color={PILL[enCurso][0]}>{PILL[enCurso][1]}</SunmiPill> : null}
          </div>
          {enCurso === null ? <p className="text-sm2 sunmi-text-muted">Cargando...</p> : null}
          {enCurso === "nada" ? (
            <>
              <p className="text-sm2 sunmi-text-muted">No tenés un pedido en curso</p>
              {accion("Hacer un pedido", "primary", () => setVista("catalogo"))}
            </>
          ) : null}
          {enCurso === "borrador" ? (
            <>
              <p className="text-sm2 sunmi-text-muted">{`${productosEnElCarrito} ${productos(productosEnElCarrito)} sin enviar`}</p>
              <div className="space-y-2">
                {accion("Seguir armando", "primary", () => setVista("catalogo"))}
                {accion("Ver pedido", "slate", () => abrirCarrito("entrada"))}
              </div>
            </>
          ) : null}
          {enCurso === "enviado" ? (
            <>
              <p className="text-sm2 sunmi-text-muted">{`Enviado${enviadoCuando ? ` ${enviadoCuando}` : ""} · todavía podés sumar productos`}</p>
              <p className="text-sm2 sunmi-text-muted">{`${productosEnElCarrito} ${productos(productosEnElCarrito)} en el pedido`}</p>
              {/* Cancelar es un botón rojo, el último y separado de los otros
                  dos: escrito en rojo sin relleno "no parecía un lugar donde
                  se toque" (Emanuel, 2026-10-22). */}
              <div className="space-y-4">
                <div className="space-y-2">
                  {accion("Sumar productos", "primary", () => {
                    setCambios({});
                    setVista("catalogo");
                  })}
                  {accion("Ver pedido", "slate", () => setVista("lectura"))}
                </div>
                {accion(cancelandoPendiente ? "Cancelando..." : "Cancelar pedido", "red", pedirCancelarPendiente)}
              </div>
            </>
          ) : null}
          {enCurso === "preparando" ? (
            <>
              <p className="text-sm2 sunmi-text-muted">El depósito lo está preparando</p>
              <p className="text-sm2 sunmi-text-muted">{`${enviados.length} ${productos(enviados.length)}`}</p>
              {accion("Ver pedido", "slate", () => setVista("lectura"))}
            </>
          ) : null}
        </SunmiCard>

        {delHistorial.length ? (
          <section data-pedidos-anteriores="" className="space-y-2">
            <p className="text-sm2 sunmi-text-muted">Pedidos anteriores</p>
            {/* El historial no tiene una vista por pedido —despliega cada uno
                en su lugar—, así que cada fila lleva al historial. */}
            {delHistorial.map((a) => (
              <SunmiActionCard key={a.posId} data-pedido-anterior={a.posId} onClick={irAlHistorial}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm3 font-semibold sunmi-text-strong">{`Pedido #${a.posId}`}</p>
                    <p className="text-sm2 sunmi-text-muted">{lineaDelAnterior(a)}</p>
                  </div>
                  <span aria-hidden="true" className="sunmi-text-muted">›</span>
                </div>
              </SunmiActionCard>
            ))}
            <SunmiLinkButton onClick={irAlHistorial}>Ver todo el historial ›</SunmiLinkButton>
          </section>
        ) : null}
        {modalCancelar}
      </div>
    );
  }

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
              {empezado
                ? "El depósito lo está preparando"
                : esperando
                  ? `Enviado${enviadoCuando ? ` ${enviadoCuando}` : ""} · Podés sumar productos hasta que el depósito lo empiece a preparar`
                  : `${opciones.local.nombre} → ${opciones.deposito.nombre} · se guarda solo`}
            </p>
            <p className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">{enPedido}</span>{" "}
              {empezado ? `${productos(enPedido)} · ya no se puede cambiar` : `${productos(enPedido)} en el pedido`}
            </p>
          </>
        }
        buscador={
          soloMirar || viendoPedido ? null : (
            <SunmiCampoBusquedaVoz
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar producto o código"
              ariaLabel="Buscar producto o código"
            />
          )
        }
        categoria={
          soloMirar || viendoPedido ? null : (
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
            {soloMirar || viendoPedido ? null : (
              <div data-ver-fotos="">
                <SunmiToggle value={verFotos} onChange={setVerFotos} label="Ver fotos" />
              </div>
            )}
            {avisoDeError}
          </>
        }
        lista={lista}
        despuesDeLista={
          // Va aunque haya una sola página: adentro está el elegidor de 25, 50 o
          // 100 (las opciones por defecto de `SunmiPageSizer`, las mismas de la
          // ruta), y si se escondiera, quien eligió 100 y le entró todo en una
          // no podría volver a 25. Sin productos no hay nada que paginar.
          !soloMirar && !viendoPedido && total > 0 ? (
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
          sumando ? (
            // El modo sumar: cuántos cambios hay, y el botón que los confirma
            // todos juntos. Sin hoja ni segundo paso: tocarlo es confirmar.
            <div className="space-y-2">
              <span data-cambios-sin-confirmar="" className="block text-sm2 sunmi-text-muted">
                {`${cambiosSinConfirmar} ${cambiosSinConfirmar === 1 ? "cambio" : "cambios"} sin confirmar`}
              </span>
              <SunmiButton
                color="primary"
                className="w-full min-h-toque"
                disabled={agregando || cambiosSinConfirmar === 0}
                onClick={confirmarCambios}
              >
                {agregando ? "Agregando..." : `Agregar al pedido (${cambiosSinConfirmar})`}
              </SunmiButton>
            </div>
          ) : esperando ? (
            // Enviado: sin botón de enviar —ya está enviado—. Sin empezar,
            // "Ver mi pedido ›" lleva a lo pedido, con las tarjetas vivas, y se
            // puede cancelar. Solo para mirar —empezado, o "Ver pedido" desde
            // la entrada—, solo el conteo.
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">{`Pedido enviado · ${enPedido} ${productos(enPedido)}`}</span>
                {soloMirar || viendoPedido ? null : <SunmiLinkButton onClick={() => abrirCarrito("catalogo")}>Ver mi pedido ›</SunmiLinkButton>}
              </div>
              {soloMirar ? null : (
                <SunmiButton
                  color="red"
                  className="w-full min-h-toque"
                  disabled={cancelandoPendiente}
                  onClick={pedirCancelarPendiente}
                >
                  {cancelandoPendiente ? "Cancelando..." : "Cancelar pedido"}
                </SunmiButton>
              )}
            </div>
          ) : (
            // ── UN SOLO BOTÓN, Y ENVÍA ────────────────────────────────────
            // En el catálogo y en "Ver mi pedido", el mismo botón: tocarlo
            // envía. El paso de revisión de 280ec05 ("Revisar y enviar" que
            // llevaba a confirmar otra vez) se fue: Emanuel había pedido una
            // página ANTES del catálogo —la de entrada—, no un paso antes de
            // enviar. "Ver mi pedido ›" queda para mirar y editar lo cargado.
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">{`${productosEnElCarrito} ${productos(productosEnElCarrito)} en el pedido`}</span>
                {viendoPedido ? null : <SunmiLinkButton onClick={() => abrirCarrito("catalogo")}>Ver mi pedido ›</SunmiLinkButton>}
              </div>
              <SunmiButton
                color="primary"
                className="w-full min-h-toque"
                disabled={enviando || productosEnElCarrito === 0}
                onClick={enviarPedido}
              >
                {enviando ? "Enviando..." : `Enviar pedido al depósito (${productosEnElCarrito})`}
              </SunmiButton>
            </div>
          )
        }
        despuesDelPie={
          <>
            {modalCancelar}
            {modalDescartar}
          </>
        }
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
          trae la foto igual que el borrador (`pendiente.items` con `imagenUrl`).
          Apagado, no hay cuadrado y el resto usa todo el ancho. */}
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
