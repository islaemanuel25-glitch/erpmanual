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
// Emanuel el 2026-10-14 para la recepción y lo repitió el 2026-10-22 y el
// 2026-10-25 para ésta. Esta pantalla solo IMPORTA lo que ya está exportado,
// tal como está —`textoDeUnidad` de `TarjetaPedido`, las claves de
// `lib/pedidos/verFotos`—; lo que vive adentro de la pantalla del teléfono y
// no está exportado se COPIA acá, marcado como copia y con el archivo de donde
// salió. Esa duplicación se acepta a sabiendas: si la regla cambia en el
// teléfono, hay que cambiarla también acá.
//
// ── POR QUÉ TIENE SU PROPIO ESTADO ────────────────────────────────────────
//
// El del teléfono vive ADENTRO de `page.jsx`, y sacarlo de ahí sería tocar el
// teléfono. Así que esta pantalla lleva el suyo: los MISMOS fetch a las
// MISMAS rutas —opciones, carrito, catálogo, set-cantidad, sumar-al-enviado,
// solicitar y cancelar—, copiados de `page.jsx`. La página monta UNA de las
// dos según el ancho de la ventana (ver el reparto en `page.jsx`).
//
//   · el tamaño de página guardado .......... COPIA de `CLAVE_TAMANO_DE_PAGINA`
//                                             y `tamanoGuardado` de `page.jsx`;
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
// ── EL DISEÑO DEL 2026-10-25 ──────────────────────────────────────────────
//
//   1. Una barra FIJA arriba —solo la lista scrollea—: el buscador, la
//      categoría, "Ver fotos" y la acción principal; debajo, las dos pestañas
//      ("Todos los productos" y "Lo que pedí · N"), de dónde a dónde y
//      "Pedidos anteriores".
//   2. La lista de punta a punta, en una tarjeta: PRODUCTO, CATEGORÍA, SE PIDE
//      POR, CANTIDAD y la columna de "Sacar del pedido", de ancho fijo.
//   3. El pie: "1 a 50 de N" y "Mostrar 25 / 50 / 100"; en "Lo que pedí",
//      "N productos en el pedido".
//
// Sin el panel "Tu pedido" de la derecha: lo cargado se ve en la pestaña "Lo
// que pedí". Sin el stock del depósito. No hay página de entrada: el
// escritorio arranca en la lista.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { MiniaturaProductoTarjeta } from "@/components/sunmi/SunmiProductoCard";
import { showSuccess } from "@/components/sunmi/SunmiToast";
import { textoDeUnidad } from "@/components/pedidos/TarjetaPedido";

import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { tamanoDePaginaCatalogo, TAMANOS_DE_PAGINA_CATALOGO } from "@/lib/pedidos/tamanoDePagina";
import { salePorBulto, juntarPorProducto } from "@/lib/pedidos/lineasDelPedido";
import { CLAVE_VER_FOTOS, fotosGuardadas } from "@/lib/pedidos/verFotos";

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

/** COPIA de `productos` de `page.jsx`. */
const productos = (n) => (n === 1 ? "producto" : "productos");

/** COPIA de `cuandoSeEnvio` de `page.jsx`: "hoy 14:05", o "21/10 14:05". */
function cuandoSeEnvio(solicitadoAt) {
  if (!solicitadoAt) return null;
  const dia = fechaArgentinaISO(solicitadoAt) === hoyArgentinaISO() ? "hoy" : diaMesAR(solicitadoAt);
  return `${dia} ${horaAR(solicitadoAt)}`;
}

const cambiosTexto = (n) => (n === 1 ? "cambio" : "cambios");

// Las dos pestañas de la barra.
const PESTANA = Object.freeze({ TODOS: "todos", PEDIDO: "pedido" });

// ═══════════════════════════════════════════════════════════════════════════
// EL CAMPO DE CANTIDAD DE UNA FILA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El − valor + de una fila, en tamaño compacto. Lo que se tipea se manda al
 * salir del campo (o con Enter), no tecla por tecla, y si no cambió no se
 * manda nada: COPIA de `escrito`/`cambiar`/`confirmar` de `TarjetaPedido`.
 *
 * El borde va en el propio campo (`conMarco={false}`) y no en el marco: con
 * cantidad cargada es el del acento, y `sunmi-border-accent` le gana al borde
 * de `.sunmi-input` porque está después en la hoja. Sobre el marco no
 * funcionaría: el marco trae `sunmi-divider`, que está más abajo y le gana.
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
      conMarco={false}
      claseInput={`w-14 text-center${cantidad > 0 ? " sunmi-border-accent" : ""}`}
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
  const [pestana, setPestana] = useState(PESTANA.TODOS);

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
  // toma su valor una sola vez al montarse. Sin nada guardado, apagado.
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
  // Lo que "Lo que pedí" necesita saber de cada producto —nombre, categoría,
  // cómo se pide, la foto—, de lo que traen el carrito y el catálogo. El
  // carrito solo trae lo pedido, y un producto recién cargado desde el
  // catálogo no está ahí todavía.
  const [fichas, setFichas] = useState({});
  const conocer = (lista) =>
    setFichas((prev) => {
      const next = { ...prev };
      for (const p of lista || []) if (p?.productoLocalId != null) next[p.productoLocalId] = { ...next[p.productoLocalId], ...p };
      return next;
    });
  // El orden de "Lo que pedí": el del pedido, y lo nuevo al final.
  const [orden, setOrden] = useState([]);

  // El modo sumar: COPIA de `page.jsx`.
  const [cambios, setCambios] = useState({});
  const [agregando, setAgregando] = useState(false);
  const [confirmandoDescartar, setConfirmandoDescartar] = useState(false);

  const [cancelando, setCancelando] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);

  const debounceRef = useRef(null);

  const empezado = !!pendiente?.depositoEmpezo;
  const enviado = !!pendiente && !empezado;
  const estado = empezado ? "preparando" : enviado ? "enviado" : "armando";
  const cambiosSinConfirmar = Object.keys(cambios).length;

  // ── CARGAR ──────────────────────────────────────────────────────────────

  /** COPIA de `cargarCarrito` de `page.jsx`, más las fichas y el orden de "Lo que pedí". */
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
   * instante —el pedido se guarda solo—. Enviado: el modo sumar, se anota en
   * la pantalla y nada viaja hasta "Agregar al pedido".
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
      if (cantidad > 0) setOrden((prev) => (prev.includes(productoLocalId) ? prev : [...prev, productoLocalId]));
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

  /**
   * COPIA de `enviarPedido` de `page.jsx`: al primer toque, sin segundo paso.
   * Sin entrada en la computadora, se queda acá, en "Enviado", y vuelve a
   * "Todos los productos" para seguir sumando.
   */
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
        setPestana(PESTANA.TODOS);
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

  // ── IRSE: "PEDIDOS ANTERIORES" ──────────────────────────────────────────

  // Al historial. Con cambios sin confirmar del modo sumar, antes la hoja.
  const irAlHistorial = () => router.push("/modulos/pedidos/historial");
  const salir = () => {
    if (enviado && cambiosSinConfirmar > 0) setConfirmandoDescartar(true);
    else irAlHistorial();
  };
  const descartarYSalir = () => {
    setConfirmandoDescartar(false);
    setCambios({});
    irAlHistorial();
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

  // "Lo que pedí": lo que tiene cantidad en pantalla —en el modo sumar, con lo
  // nuevo sin confirmar—, en el orden del pedido. Con el pedido empezado es la
  // única pestaña: no hay catálogo que mirar.
  const loQuePedi = orden.filter((id) => cantidadEnPantalla(id) > 0).map((id) => fichas[id] || { productoLocalId: id, nombre: `Producto #${id}` });
  const viendoPedido = empezado || pestana === PESTANA.PEDIDO;

  const deDondeADonde = {
    armando: `${opciones.local.nombre} → ${opciones.deposito.nombre} · se guarda solo`,
    enviado: `Enviado${enviadoCuando ? ` ${enviadoCuando}` : ""} · podés sumar hasta que el depósito lo empiece`,
    preparando: "El depósito lo está preparando · ya no se puede cambiar",
  }[estado];

  // La marca de abajo del nombre, en el modo sumar: lo que cambia al confirmar.
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
        const cargado = cantidadEnPantalla(p.productoLocalId) > 0;
        return (
          <div className="flex items-center gap-3">
            {verFotos ? <MiniaturaProductoTarjeta url={p.imagenUrl} conservaLugar nombre={p.nombre} /> : null}
            <div className="min-w-0">
              <span data-nombre-producto="" className={`block break-words sunmi-text-strong ${cargado ? "font-bold" : "font-normal"}`}>
                {p.nombre}
              </span>
              {marca ? <span data-marca-cambio="" className="block text-sm2 sunmi-text-accent">{marca}</span> : null}
            </div>
          </div>
        );
      },
    },
    {
      clave: "categoria",
      titulo: "Categoría",
      render: (p) => <span className="sunmi-text-muted">{p.categoriaNombre ?? ""}</span>,
    },
    {
      clave: "unidad",
      titulo: "Se pide por",
      // La misma frase que la tarjeta del teléfono, en la etiqueta chica del kit.
      render: (p) => (
        <span data-se-pide-por="">
          <SunmiPill color="slate">{textoDeUnidad(p)}</SunmiPill>
        </span>
      ),
    },
    {
      clave: "cantidad",
      titulo: "Cantidad",
      render: (p) =>
        empezado ? (
          <span data-cantidad-pedido="" className="font-bold tabular-nums sunmi-text-strong">
            {cantidadEnPantalla(p.productoLocalId)}
          </span>
        ) : (
          <CampoCantidadDeFila
            producto={p}
            cantidad={cantidadEnPantalla(p.productoLocalId)}
            onCantidad={(cant, uni) => setCantidad(p.productoLocalId, cant, uni)}
          />
        ),
    },
    {
      // El ancho está reservado siempre, haya botón o no: así el campo de
      // cantidad no salta al cargar el primero ni al sacar el último.
      clave: "sacar",
      titulo: "",
      align: "der",
      thClassName: "w-36",
      render: (p) =>
        !empezado && cantidadEnPantalla(p.productoLocalId) > 0 ? (
          <SunmiButton
            color="ghost"
            className="whitespace-nowrap border sunmi-border sunmi-bg-card sunmi-text-danger"
            onClick={() => setCantidad(p.productoLocalId, 0, "UNIDAD")}
          >
            Sacar del pedido
          </SunmiButton>
        ) : null,
    },
  ].map((c) => ({ ...c, thClassName: `sunmi-surface text-xs2 uppercase tracking-wider sunmi-text-muted ${c.thClassName ?? ""}`.trim() }));

  // La acción principal de la barra.
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

  const pestanaBoton = (clave, texto) => (
    <SunmiButton
      color={(clave === PESTANA.PEDIDO) === viendoPedido ? "amber" : "slate"}
      aria-pressed={(clave === PESTANA.PEDIDO) === viendoPedido}
      onClick={() => setPestana(clave)}
      className="shrink-0"
    >
      {texto}
    </SunmiButton>
  );

  // El pie de la lista.
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);
  const pie = viendoPedido ? (
    <span className="text-sm2 sunmi-text-muted">{`${loQuePedi.length} ${productos(loQuePedi.length)} en el pedido`}</span>
  ) : (
    <>
      <div className="flex items-center gap-2">
        {totalPages > 1 ? (
          <SunmiButton color="slate" aria-label="Página anterior" disabled={page <= 1} onClick={() => cargarCatalogo(Math.max(1, page - 1))}>
            <ChevronLeft size={14} aria-hidden="true" />
          </SunmiButton>
        ) : null}
        <span className="text-sm2 sunmi-text-muted tabular-nums">{`${desde} a ${hasta} de ${total}`}</span>
        {totalPages > 1 ? (
          <SunmiButton color="slate" aria-label="Página siguiente" disabled={page >= totalPages} onClick={() => cargarCatalogo(Math.min(totalPages, page + 1))}>
            <ChevronRight size={14} aria-hidden="true" />
          </SunmiButton>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5" data-mostrar="">
        <span className="text-sm2 sunmi-text-muted">Mostrar</span>
        {TAMANOS_DE_PAGINA_CATALOGO.map((n) => (
          <SunmiButton key={n} color={n === pageSize ? "primary" : "slate"} aria-pressed={n === pageSize} onClick={() => setPageSize(n)}>
            {n}
          </SunmiButton>
        ))}
      </div>
    </>
  );

  return (
    <div className="sunmi-bg w-full min-h-full" data-pedidos-escritorio-pantalla="">
      {/* ── 1 · LA BARRA FIJA ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 sunmi-bg-card border-b sunmi-divider px-3 py-2 space-y-2" data-barra-pedido="">
        {error ? (
          <SunmiAviso tono="danger" className="flex items-center justify-between gap-3">
            <span data-aviso-escritorio="">{error}</span>
            <SunmiLinkButton onClick={() => setError("")}>cerrar</SunmiLinkButton>
          </SunmiAviso>
        ) : null}

        {empezado ? null : (
          <div className="flex items-center gap-3" data-herramientas-pedido="">
            <div className="flex-1 min-w-0">
              <SunmiCampoBusquedaVoz
                value={busqueda}
                onChange={(v) => {
                  setBusqueda(v);
                  setPestana(PESTANA.TODOS);
                }}
                placeholder="Buscar producto o código"
                ariaLabel="Buscar producto o código"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm2 sunmi-text-muted">Categoría</span>
              <SunmiSelectAdv
                id="categoria-pedido-escritorio"
                value={categoriaId}
                onChange={(v) => {
                  setCategoriaId(v);
                  setPestana(PESTANA.TODOS);
                }}
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
            <div className="shrink-0" data-ver-fotos-escritorio="">
              <SunmiToggle value={verFotos} onChange={setVerFotos} label="Ver fotos" />
            </div>
            {principal}
          </div>
        )}

        <div className="flex items-center gap-2" data-pestanas-pedido="">
          {empezado ? null : pestanaBoton(PESTANA.TODOS, "Todos los productos")}
          {pestanaBoton(PESTANA.PEDIDO, `Lo que pedí · ${loQuePedi.length}`)}
          <span className="ml-auto min-w-0 text-sm2 sunmi-text-muted">{deDondeADonde}</span>
          {enviado ? (
            <SunmiButton color="red" disabled={cancelando} onClick={() => setConfirmandoCancelar(true)} className="shrink-0">
              {cancelando ? "Cancelando..." : "Cancelar pedido"}
            </SunmiButton>
          ) : null}
          <SunmiButton color="slate" onClick={salir} className="shrink-0">
            Pedidos anteriores
          </SunmiButton>
        </div>
      </div>

      {/* ── 2 · LA LISTA ────────────────────────────────────────────────── */}
      <div className="p-3">
        <div className="overflow-hidden rounded-xl2 border sunmi-border sunmi-bg-card" data-lista-pedido={viendoPedido ? "pedido" : "todos"}>
          <SunmiTable
            columnas={columnas}
            filas={viendoPedido ? loQuePedi : catalogo}
            claveFila={(p) => p.productoLocalId}
            densidad="normal"
            cargando={!viendoPedido && loadingCat}
            vacio={viendoPedido ? "Todavía no cargaste productos." : "No se encontraron productos."}
            // El renglón con cantidad, en el fondo de la app.
            claseFila={(p) => (cantidadEnPantalla(p.productoLocalId) > 0 ? "sunmi-surface" : "")}
            className="text-sm3"
          />
          {/* ── 3 · EL PIE ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t sunmi-divider" data-pie-lista="">
            {pie}
          </div>
        </div>
      </div>

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
        open={confirmandoDescartar}
        title="Cambios sin confirmar"
        onClose={() => setConfirmandoDescartar(false)}
        forma="centrado"
        espacioCuerpo="mt-2 gap-3"
        z={9999}
        footer={
          <>
            <SunmiButton color="slate" onClick={() => setConfirmandoDescartar(false)}>
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
