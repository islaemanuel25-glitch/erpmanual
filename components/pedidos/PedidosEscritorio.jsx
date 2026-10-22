"use client";

// components/pedidos/PedidosEscritorio.jsx
//
// LA COMPOSICIÓN DE COMPUTADORA DE "PEDIDO AL DEPÓSITO", desde `lg` (1024
// px), pensada para 1366 de ancho. Por debajo de 1024 se ve lo de siempre,
// sin tocar: la pantalla del teléfono de `app/modulos/pedidos/page.jsx`.
//
// ── LA REGLA DE ESTA PANTALLA: NO TOCA NADA DEL TELÉFONO ─────────────────
//
// La misma que `components/transferencias/RecepcionEscritorio.jsx`: los
// archivos que usa el teléfono —`app/modulos/pedidos/page.jsx`, sus piezas,
// el kit— NO se modifican para servir a esta pantalla: ni por dentro, ni para
// "compartir" lógica, ni con una prop nueva con valor por defecto. Lo decidió
// Emanuel el 2026-10-14 para la recepción y lo repitió el 2026-10-22 para
// ésta. Esta pantalla solo IMPORTA lo que ya está exportado, tal como está;
// lo que vive adentro de la pantalla del teléfono y no está exportado se COPIA
// acá, marcado como copia y con el archivo de donde salió. Esa duplicación se
// acepta a sabiendas: si la regla cambia en el teléfono, hay que cambiarla
// también acá.
//
// ── POR QUÉ TIENE SU PROPIO ESTADO ────────────────────────────────────────
//
// En la recepción el estado vive en `WorkspaceRecepcion` y las dos
// composiciones lo reciben. Acá vive ADENTRO de la pantalla del teléfono, en
// `page.jsx`, y sacarlo de ahí sería tocar el teléfono. Así que esta pantalla
// lleva el suyo: los MISMOS fetch a las MISMAS rutas —opciones, carrito,
// catálogo, set-cantidad, sumar-al-enviado, solicitar y cancelar—, copiados de
// `page.jsx`. La página monta UNA de las dos según el ancho de la ventana
// (ver el reparto en `page.jsx`), así que cada lectura sale una vez; si la
// ventana cruza los 1024 px, esta se desmonta y su estado se pierde.
//
//   · las claves guardadas en el celular .... COPIA de `CLAVE_TAMANO_DE_PAGINA`,
//                                             `CLAVE_VER_FOTOS`, `tamanoGuardado`
//                                             y `fotosGuardadas` de `page.jsx`;
//   · "hoy 14:05" ........................... `cuandoSeEnvio`, COPIA;
//   · cargar el carrito ..................... COPIA de `cargarCarrito`;
//   · set-cantidad (armando) ................ COPIA de `setCantidad`;
//   · el modo sumar ......................... COPIA de `cambios`,
//                                             `confirmarCambios` y la hoja de
//                                             descartar;
//   · enviar y cancelar ..................... COPIA de `enviarPedido`,
//                                             `cancelarPendiente` y su hoja;
//   · el número que se tipea ................ COPIA de `escrito`/`confirmar` de
//                                             `TarjetaPedido`.
//
// ── TRES FRANJAS ──────────────────────────────────────────────────────────
//
//   1. El pedido: título, estado, el dato, y las acciones —Pedidos
//      anteriores, Volver y la acción principal—, en una tarjeta.
//   2. Las herramientas en una fila: buscar, categoría, Ver fotos y cuántos
//      por página. No va con el pedido empezado.
//   3. El cuerpo: el catálogo como tabla a la izquierda y, a la derecha, el
//      panel "Tu pedido", pegado arriba mientras la lista scrollea.
//
// No hay página de entrada: el escritorio arranca en el catálogo.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { MiniaturaProductoTarjeta } from "@/components/sunmi/SunmiProductoCard";
import { showSuccess } from "@/components/sunmi/SunmiToast";

import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { tamanoDePaginaCatalogo } from "@/lib/pedidos/tamanoDePagina";
import { salePorBulto, juntarPorProducto } from "@/lib/pedidos/lineasDelPedido";

// ═══════════════════════════════════════════════════════════════════════════
// LAS COPIAS. Ver el encabezado: el teléfono no se toca, así que lo que esta
// pantalla necesita de adentro de `app/modulos/pedidos/page.jsx` se copia acá.
// ═══════════════════════════════════════════════════════════════════════════

/** COPIA de `CLAVE_TAMANO_DE_PAGINA` de `page.jsx`: la misma clave que el celular. */
const CLAVE_TAMANO_DE_PAGINA = "pedidos_page_size";

/** COPIA de `tamanoGuardado` de `page.jsx`. */
function tamanoGuardado() {
  try {
    return tamanoDePaginaCatalogo(localStorage.getItem(CLAVE_TAMANO_DE_PAGINA));
  } catch {
    return tamanoDePaginaCatalogo(null);
  }
}

/** COPIA de `CLAVE_VER_FOTOS` de `page.jsx`. */
const CLAVE_VER_FOTOS = "pedidos_ver_fotos";

/** COPIA de `fotosGuardadas` de `page.jsx`. */
function fotosGuardadas() {
  try {
    return localStorage.getItem(CLAVE_VER_FOTOS) === "1";
  } catch {
    return false;
  }
}

/** COPIA de `productos` de `page.jsx`. */
const productos = (n) => (n === 1 ? "producto" : "productos");

/** COPIA de `cuandoSeEnvio` de `page.jsx`: "hoy 14:05", o "21/10 14:05". */
function cuandoSeEnvio(solicitadoAt) {
  if (!solicitadoAt) return null;
  const dia = fechaArgentinaISO(solicitadoAt) === hoyArgentinaISO() ? "hoy" : diaMesAR(solicitadoAt);
  return `${dia} ${horaAR(solicitadoAt)}`;
}

const cambiosTexto = (n) => (n === 1 ? "cambio" : "cambios");

/** "1 bulto", "3 bultos", o el número: lo que el panel dice de una cantidad. */
function cantidadDelPanel(producto, n) {
  if (salePorBulto(producto)) return `${n} ${n === 1 ? "bulto" : "bultos"}`;
  return String(n);
}

// ═══════════════════════════════════════════════════════════════════════════
// EL CAMPO DE CANTIDAD DE UNA FILA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El − valor + de una fila del catálogo, en tamaño compacto. Lo que se tipea
 * se manda al salir del campo (o con Enter), no tecla por tecla, y si no
 * cambió no se manda nada: COPIA de `escrito`/`cambiar`/`confirmar` de
 * `TarjetaPedido`, en `page.jsx`.
 */
function CampoCantidadDeFila({ producto, cantidad, onCantidad }) {
  const { nombre } = producto;
  const unidad = salePorBulto(producto) ? "BULTO" : "UNIDAD";
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
    <SunmiCampoCantidad
      valor={escrito ?? String(cantidad ?? 0)}
      onCambiar={cambiar}
      etiqueta={`Cantidad de ${nombre}`}
      minimo={0}
      tamano="compacto"
      claseMarco="w-14"
      apagaMenosEnMinimo
      minimoComoGuia
      inputRef={campoRef}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/**
 * La ✕ de una fila o de un renglón del panel. Su LUGAR está siempre —COPIA
 * del criterio de `TarjetaPedido`—: sin el producto en el pedido va
 * invisible, apagada, fuera del foco y oculta al lector de pantalla, y ocupa
 * el mismo lugar. Así la fila no cambia de ancho al cargar el primero.
 */
function Quitar({ nombre, visible, onQuitar }) {
  return (
    <SunmiButton
      color="ghost"
      data-lugar-quitar-escritorio=""
      aria-label={visible ? `Quitar ${nombre} del pedido` : undefined}
      aria-hidden={visible ? undefined : "true"}
      tabIndex={visible ? undefined : -1}
      disabled={!visible}
      onClick={() => {
        if (visible) onQuitar();
      }}
      className={`shrink-0 min-w-toque min-h-toque inline-flex items-center justify-center${visible ? "" : " invisible"}`}
    >
      <X size={16} aria-hidden="true" />
    </SunmiButton>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PANTALLA
// ═══════════════════════════════════════════════════════════════════════════

export default function PedidosEscritorio() {
  const router = useRouter();
  const { perfil, cargando: cargandoPerfil } = useUser();
  const { requerirOperador } = useOperadorContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opciones, setOpciones] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  const [catalogo, setCatalogo] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalCatalogo, setTotalCatalogo] = useState(null);
  const [loadingCat, setLoadingCat] = useState(false);
  const [pageSize, setPageSizeRaw] = useState(tamanoGuardado);
  const setPageSize = (size) => {
    setPageSizeRaw(size);
    setPage(1);
    try { localStorage.setItem(CLAVE_TAMANO_DE_PAGINA, String(size)); } catch {}
  };
  // Se lee al crear el estado, por lo mismo que en el teléfono: `SunmiToggle`
  // toma su valor una sola vez al montarse.
  const [verFotos, setVerFotosRaw] = useState(fotosGuardadas);
  const setVerFotos = (v) => {
    setVerFotosRaw(v);
    try { localStorage.setItem(CLAVE_VER_FOTOS, v ? "1" : "0"); } catch {}
  };

  // El pedido: cantidades por producto, el pedido que se arma o el enviado.
  const [carrito, setCarrito] = useState({});
  const [posId, setPosId] = useState(null);
  const [pendiente, setPendiente] = useState(null);
  const [enviando, setEnviando] = useState(false);
  // Lo que el panel necesita saber de cada producto —nombre y cómo se pide—,
  // de lo que traen el carrito y el catálogo. El carrito solo trae lo pedido, y
  // un producto recién cargado desde el catálogo no está ahí todavía.
  const [fichas, setFichas] = useState({});
  const conocer = (lista) =>
    setFichas((prev) => {
      const next = { ...prev };
      for (const p of lista || []) if (p?.productoLocalId != null) next[p.productoLocalId] = { ...next[p.productoLocalId], ...p };
      return next;
    });
  // El orden del panel: el del pedido, y lo nuevo al final.
  const [orden, setOrden] = useState([]);

  // El modo sumar: COPIA de `page.jsx`.
  const [cambios, setCambios] = useState({});
  const [agregando, setAgregando] = useState(false);
  const [confirmandoDescartar, setConfirmandoDescartar] = useState(null); // null | "volver" | "historial"

  const [cancelando, setCancelando] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);

  const debounceRef = useRef(null);

  const empezado = !!pendiente?.depositoEmpezo;
  const enviado = !!pendiente && !empezado;
  const estado = empezado ? "preparando" : enviado ? "enviado" : "armando";
  const cambiosSinConfirmar = Object.keys(cambios).length;

  // ── CARGAR ──────────────────────────────────────────────────────────────

  /** COPIA de `cargarCarrito` de `page.jsx`, más las fichas y el orden del panel. */
  const cargarCarrito = async () => {
    try {
      const res = await fetch("/api/pedidos/carrito", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setPosId(json.posId || null);
        const lineas = juntarPorProducto(json.pendiente ? json.pendiente.items : json.items, (it) => it.productoLocalId);
        setPendiente(json.pendiente || null);
        const mapa = {};
        lineas.forEach((it) => {
          mapa[it.productoLocalId] = it.cantidad;
        });
        setCarrito(mapa);
        conocer(lineas);
        setOrden(lineas.map((l) => l.productoLocalId));
        return json;
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  };

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
        cargarCarrito();
      } catch (err) {
        console.error(err);
        setError("Error de conexión");
        setLoading(false);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** COPIA de `cargarCatalogo` de `page.jsx`. */
  const cargarCatalogo = useCallback(
    async (p = 1) => {
      setLoadingCat(true);
      try {
        const params = new URLSearchParams({ page: p, pageSize });
        if (busqueda.trim()) params.set("q", busqueda.trim());
        if (categoriaId) params.set("categoriaId", categoriaId);
        const res = await fetch(`/api/pedidos/catalogo?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (json.ok) {
          setCatalogo(json.items || []);
          conocer(json.items);
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

  useEffect(() => {
    if (!opciones) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargarCatalogo(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [opciones, cargarCatalogo]);

  // ── CAMBIAR UNA CANTIDAD ────────────────────────────────────────────────

  /**
   * Armando: COPIA de `setCantidad` de `page.jsx`, va por set-cantidad al
   * instante. Enviado: el modo sumar, se anota en la pantalla y nada viaja.
   */
  const setCantidad = async (productoLocalId, cantidad, unidad = "UNIDAD") => {
    if (empezado) return;

    if (enviado) {
      setCambios((prev) => {
        const next = { ...prev };
        if (cantidad === (carrito[productoLocalId] ?? 0)) delete next[productoLocalId];
        else next[productoLocalId] = { cantidad, unidad };
        return next;
      });
      return;
    }

    setCarrito((prev) => {
      const next = { ...prev };
      if (cantidad === 0) delete next[productoLocalId];
      else next[productoLocalId] = cantidad;
      return next;
    });
    if (cantidad > 0) setOrden((prev) => (prev.includes(productoLocalId) ? prev : [...prev, productoLocalId]));

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
        await cargarCarrito();
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      await cargarCarrito();
    }
  };

  // ── ENVIAR, SUMAR, CANCELAR ─────────────────────────────────────────────

  /** COPIA de `enviarPedido` de `page.jsx`. Sin entrada: se queda acá, en "Enviado". */
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
        setPosId(null);
        setCambios({});
        await cargarCarrito();
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

  /** COPIA de `confirmarCambios` de `page.jsx`. */
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
        await cargarCarrito();
        showSuccess(lista.length === 1 ? "Se agregó 1 cambio al pedido" : `Se agregaron ${lista.length} cambios al pedido`);
      } else if (res.status === 409) {
        // No entró ninguno: el aviso, los cambios afuera, y el carrito
        // releído trae el pedido como está —"Preparando" si lo empezó—.
        setError(json.error || "No se pudieron agregar los cambios al pedido");
        setCambios({});
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

  /** COPIA de `cancelarPendiente` de `page.jsx`. */
  const cancelarPendiente = async () => {
    setConfirmandoCancelar(false);
    if (!pendiente) return;
    setError("");
    setCancelando(true);
    try {
      const res = await fetch("/api/pos-transferencias/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId: pendiente.posId }),
      });
      const json = await res.json();
      if (json.ok) {
        setPendiente(null);
        setCarrito({});
        setCambios({});
        await cargarCarrito();
      } else if (json.needsOperador) {
        setError("Ingresá tu PIN y volvé a tocar «Cancelar pedido».");
        requerirOperador();
      } else {
        setError(json.error || "Error al cancelar pedido");
        await cargarCarrito();
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión al cancelar");
    }
    setCancelando(false);
  };

  // ── IRSE ────────────────────────────────────────────────────────────────

  // Volver va a donde va hoy el Volver de la entrada del teléfono; "Pedidos
  // anteriores", al historial. Con cambios sin confirmar, antes la hoja.
  const irA = (destino) => {
    if (destino === "historial") router.push("/modulos/pedidos/historial");
    else router.back();
  };
  const salir = (destino) => {
    if (enviado && cambiosSinConfirmar > 0) setConfirmandoDescartar(destino);
    else irA(destino);
  };
  const descartarYSalir = () => {
    const destino = confirmandoDescartar;
    setConfirmandoDescartar(null);
    setCambios({});
    irA(destino);
  };

  // ── PERMISOS Y CARGA: COPIA de `page.jsx` ───────────────────────────────

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes("pedidos.ver");

  if (cargandoPerfil || loading) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando...</span>
      </div>
    );
  }
  if (!puede) return <SinPermisos />;
  if (!opciones) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-danger">{error || "Sin opciones"}</span>
      </div>
    );
  }

  // ── LO QUE SE DIBUJA ────────────────────────────────────────────────────

  const enPedido = Object.keys(carrito).length;
  const cantidadEnPantalla = (id) => (enviado && cambios[id] ? cambios[id].cantidad : carrito[id] ?? 0);
  const enviadoCuando = pendiente ? cuandoSeEnvio(pendiente.solicitadoAt) : null;

  const PILL = { armando: ["slate", "Borrador"], enviado: ["cyan", "Enviado"], preparando: ["amber", "Preparando"] };
  const subtitulo = {
    armando: `${opciones.local.nombre} → ${opciones.deposito.nombre} · se guarda solo`,
    enviado: `Enviado${enviadoCuando ? ` ${enviadoCuando}` : ""} · podés sumar hasta que el depósito lo empiece`,
    preparando: "El depósito lo está preparando",
  }[estado];
  const dato = enviado
    ? { rotulo: "Cambios sin confirmar", valor: cambiosSinConfirmar }
    : { rotulo: "Productos en el pedido", valor: enPedido };

  // La marca de abajo del nombre, en el modo sumar.
  const marcaDelCambio = (id) => {
    const c = enviado ? cambios[id] : null;
    if (!c) return null;
    const antes = carrito[id];
    return antes == null ? "nuevo, sin confirmar" : `${antes} → ${c.cantidad}, sin confirmar`;
  };

  const columnas = [
    {
      clave: "producto",
      titulo: "Producto",
      render: (p) => {
        const marca = marcaDelCambio(p.productoLocalId);
        return (
          <div className="flex items-center gap-3">
            {verFotos ? <MiniaturaProductoTarjeta url={p.imagenUrl} conservaLugar nombre={p.nombre} /> : null}
            <div className="min-w-0">
              <span className="block font-semibold sunmi-text-strong break-words">{p.nombre}</span>
              {p.categoriaNombre ? <span className="block text-sm2 sunmi-text-muted">{p.categoriaNombre}</span> : null}
              {marca ? <span data-marca-cambio="" className="block text-sm2 sunmi-text-accent">{marca}</span> : null}
            </div>
          </div>
        );
      },
    },
    {
      clave: "unidad",
      titulo: "Unidad",
      render: (p) => (
        <span className="whitespace-nowrap sunmi-text-muted">{salePorBulto(p) ? `Por BULTO de ${p.factorPack} u` : "UNIDAD"}</span>
      ),
    },
    {
      clave: "cantidad",
      titulo: "Cantidad",
      render: (p) => (
        <CampoCantidadDeFila
          producto={p}
          cantidad={cantidadEnPantalla(p.productoLocalId)}
          onCantidad={(cant, uni) => setCantidad(p.productoLocalId, cant, uni)}
        />
      ),
    },
    {
      clave: "quitar",
      titulo: "",
      align: "der",
      render: (p) => (
        <Quitar
          nombre={p.nombre}
          visible={cantidadEnPantalla(p.productoLocalId) > 0}
          onQuitar={() => setCantidad(p.productoLocalId, 0, "UNIDAD")}
        />
      ),
    },
  ].map((c) => ({ ...c, thClassName: "text-xs2 uppercase tracking-wider sunmi-text-muted" }));

  // El panel: lo pedido, y en el modo sumar lo nuevo o cambiado sin confirmar.
  const idsDelPanel = [...orden.filter((id) => carrito[id] != null), ...Object.keys(cambios).map(Number).filter((id) => carrito[id] == null)];
  const renglones = idsDelPanel.map((id) => {
    const ficha = fichas[id] || { productoLocalId: id, nombre: `Producto #${id}` };
    const c = enviado ? cambios[id] : null;
    return { id, ficha, cantidad: c ? c.cantidad : carrito[id], pendiente: c ? (carrito[id] == null ? "nuevo" : "cambiado") : null };
  });
  const subtituloPanel = {
    armando: `${enPedido} ${productos(enPedido)} · se guarda solo`,
    enviado: `${enPedido} en el pedido · ${cambiosSinConfirmar} ${cambiosTexto(cambiosSinConfirmar)} sin confirmar`,
    preparando: `${enPedido} ${productos(enPedido)}`,
  }[estado];

  const panel = (
    <SunmiCard className="p-5 space-y-3" data-panel-pedido="">
      <div>
        <h2 className="text-lg2 font-bold sunmi-text-strong">Tu pedido</h2>
        <p className="text-sm2 sunmi-text-muted">{subtituloPanel}</p>
      </div>
      {renglones.length === 0 ? (
        <p className="text-sm2 sunmi-text-muted">Todavía no cargaste productos.</p>
      ) : (
        <div className="divide-y sunmi-divider">
          {renglones.map((r) => (
            <div key={r.id} data-renglon-pedido={r.ficha.nombre} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 text-sm3 sunmi-text-strong break-words">{r.ficha.nombre}</span>
              <span className={`whitespace-nowrap text-sm3 tabular-nums ${r.pendiente ? "sunmi-text-accent" : "sunmi-text-muted"}`}>
                {cantidadDelPanel(r.ficha, r.cantidad)}
                {r.pendiente === "nuevo" ? " · nuevo" : r.pendiente === "cambiado" ? (r.cantidad === 0 ? " · se saca" : " · cambiado") : ""}
              </span>
              {empezado ? null : (
                <Quitar nombre={r.ficha.nombre} visible={r.cantidad > 0} onQuitar={() => setCantidad(r.id, 0, "UNIDAD")} />
              )}
            </div>
          ))}
        </div>
      )}
      {enviado ? (
        <SunmiButton
          color="red"
          className="w-full min-h-toque"
          disabled={cancelando}
          onClick={() => setConfirmandoCancelar(true)}
        >
          {cancelando ? "Cancelando..." : "Cancelar pedido"}
        </SunmiButton>
      ) : null}
    </SunmiCard>
  );

  // La acción principal de la franja.
  let principal = null;
  if (estado === "armando") {
    principal = (
      <SunmiButton color="primary" disabled={enviando || enPedido === 0} onClick={enviarPedido} className="shrink-0">
        {enviando ? "Enviando..." : `Enviar pedido al depósito (${enPedido})`}
      </SunmiButton>
    );
  } else if (estado === "enviado") {
    principal = (
      <SunmiButton color="primary" disabled={agregando || cambiosSinConfirmar === 0} onClick={confirmarCambios} className="shrink-0">
        {agregando ? "Agregando..." : `Agregar al pedido (${cambiosSinConfirmar})`}
      </SunmiButton>
    );
  }

  return (
    <div className="sunmi-bg w-full min-h-full p-2 lg:p-3 space-y-3" data-pedidos-escritorio-pantalla="">
      {error ? (
        <SunmiAviso tono="danger" className="flex items-center justify-between gap-3">
          <span data-aviso-escritorio="">{error}</span>
          <SunmiLinkButton onClick={() => setError("")}>cerrar</SunmiLinkButton>
        </SunmiAviso>
      ) : null}

      {/* ── 1 · EL PEDIDO ───────────────────────────────────────────────── */}
      <SunmiCard className="px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3" data-franja-pedido="">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg3 font-bold sunmi-text-strong">Pedido al depósito</h1>
            <SunmiPill color={PILL[estado][0]}>{PILL[estado][1]}</SunmiPill>
          </div>
          <p className="text-sm2 sunmi-text-muted">{subtitulo}</p>
        </div>

        {/* En "Preparando" el dato es lo pedido, que el panel ya dice; va igual. */}
        <div data-dato-pedido="">
          <div className="text-sm2 sunmi-text-muted">{dato.rotulo}</div>
          <div className="text-xl2 font-bold tabular-nums sunmi-text-strong">{dato.valor}</div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SunmiLinkButton onClick={() => salir("historial")}>Pedidos anteriores ›</SunmiLinkButton>
          <SunmiButton color="slate" onClick={() => salir("volver")} className="shrink-0">
            ← Volver
          </SunmiButton>
          {principal}
        </div>
      </SunmiCard>

      {/* ── 2 · LAS HERRAMIENTAS ─────────────────────────────────────────── */}
      {empezado ? null : (
        <div className="flex flex-wrap items-center gap-4" data-herramientas-pedido="">
          {/* ~450 px a 1366: `max-w-lg` (32rem con el rem de 14 px). El diseño
              pide unos 470; un ancho exacto sería una medida a mano. */}
          <div className="w-full max-w-lg">
            <SunmiCampoBusquedaVoz
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar producto o código"
              ariaLabel="Buscar producto o código"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm2 sunmi-text-muted">Categoría</span>
            <SunmiSelectAdv
              id="categoria-pedido-escritorio"
              value={categoriaId}
              onChange={(v) => setCategoriaId(v)}
              aria-label="Categoría"
              className="w-56 shrink-0"
            >
              <SunmiSelectOption value="">{`Todas · ${totalCatalogo ?? total}`}</SunmiSelectOption>
              {(opciones.categorias || []).map((c) => (
                <SunmiSelectOption key={c.id} value={String(c.id)}>
                  {c.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </div>
          <div data-ver-fotos-escritorio="">
            <SunmiToggle value={verFotos} onChange={setVerFotos} label="Ver fotos" />
          </div>
          <div className="ml-auto">
            <SunmiPageSizer value={pageSize} onChange={setPageSize} />
          </div>
        </div>
      )}

      {/* ── 3 · EL CATÁLOGO Y TU PEDIDO ──────────────────────────────────── */}
      {empezado ? (
        // Preparando: solo el panel, más ancho, y nada se toca.
        <div className="max-w-2xl">{panel}</div>
      ) : (
        // Cinco séptimos el catálogo y dos el panel: ~370 px a 1366, donde el
        // diseño pide 380. Un ancho fijo pediría un token nuevo en
        // `tailwind.config.js`, y esta pantalla no toca archivos compartidos.
        <div className="grid grid-cols-7 items-start gap-4">
          <div className="col-span-5 min-w-0 space-y-2">
            <div className="overflow-hidden rounded-xl2 border sunmi-border sunmi-bg-card">
              <SunmiTable
                columnas={columnas}
                filas={catalogo}
                claveFila={(p) => p.productoLocalId}
                densidad="normal"
                cargando={loadingCat}
                vacio="No se encontraron productos."
                // La fila con un cambio sin confirmar, en el tono de fila
                // destacada del kit.
                tonoFila={(p) => (enviado && cambios[p.productoLocalId] ? "atencion" : null)}
                className="text-sm3"
              />
            </div>
            {total > 0 ? (
              <SunmiPaginador
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
                totalItems={total}
                onPrev={() => cargarCatalogo(Math.max(1, page - 1))}
                onNext={() => cargarCatalogo(Math.min(totalPages, page + 1))}
                onGoToPage={(p) => cargarCatalogo(p)}
                // "‹ Página 1 de 44 ›" y al lado "viendo 1–50 de 2156", como
                // pide el diseño: la disposición del celular del kit. El
                // "Mostrar" va arriba, en las herramientas.
                formaDelCelular
              />
            ) : null}
          </div>
          <div className="col-span-2 sticky top-3 min-w-0">{panel}</div>
        </div>
      )}

      {/* COPIA de la hoja de cancelar de `page.jsx`. */}
      <SunmiModalLayout
        open={confirmandoCancelar}
        title="Cancelar pedido"
        onClose={() => setConfirmandoCancelar(false)}
        forma="centrado"
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

      {/* COPIA de la hoja de descartar de `page.jsx`. */}
      <SunmiModalLayout
        open={confirmandoDescartar != null}
        title="Cambios sin confirmar"
        onClose={() => setConfirmandoDescartar(null)}
        forma="centrado"
        espacioCuerpo="mt-2 gap-3"
        z={9999}
        footer={
          <>
            <SunmiButton color="slate" onClick={() => setConfirmandoDescartar(null)}>
              Seguir cargando
            </SunmiButton>
            <SunmiButton color="red" onClick={descartarYSalir}>
              Descartar
            </SunmiButton>
          </>
        }
      >
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {`Tenés ${cambiosSinConfirmar} ${cambiosTexto(cambiosSinConfirmar)} sin confirmar. ¿Descartarlos?`}
        </p>
      </SunmiModalLayout>
    </div>
  );
}
