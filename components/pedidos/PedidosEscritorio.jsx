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
// `lib/pedidos/verFotos`, la traducción de estados—; lo que vive adentro de
// una pantalla del teléfono y no está exportado se COPIA acá, marcado como
// copia y con el archivo de donde salió. Esa duplicación se acepta a
// sabiendas: si la regla cambia en el teléfono, hay que cambiarla también acá.
//
// ── POR QUÉ TIENE SU PROPIO ESTADO ────────────────────────────────────────
//
// El del teléfono vive ADENTRO de `page.jsx`, y sacarlo de ahí sería tocar el
// teléfono. Así que esta pantalla lleva el suyo: los MISMOS fetch a las
// MISMAS rutas, copiados de `page.jsx` y de `HistorialCelular`. La página
// monta UNA de las dos según el ancho de la ventana (ver el reparto en
// `page.jsx`).
//
//   · el tamaño de página guardado .......... COPIA de `CLAVE_TAMANO_DE_PAGINA`
//                                             y `tamanoGuardado` de `page.jsx`;
//   · "hoy 14:05" ........................... `cuandoSeEnvio`, COPIA;
//   · cargar el carrito ..................... COPIA de `cargarCarrito`;
//   · set-cantidad (armando) ................ COPIA de `setCantidad`;
//   · el modo sumar ......................... COPIA de `cambios`,
//                                             `confirmarCambios` y la hoja de
//                                             descartar;
//   · enviar y cancelar ..................... COPIA de `enviarPedido` y
//                                             `cancelarPendiente`;
//   · el número que se tipea ................ COPIA de `escrito`/`confirmar` de
//                                             `TarjetaPedido`;
//   · leer todo el historial ................ COPIA del de `HistorialCelular`;
//   · las fechas del detalle ................ COPIA de `lineaDeFechas` del
//                                             detalle del celular.
//
// ── LAS VISTAS (Emanuel, 2026-10-25) ──────────────────────────────────────
//
//   · ENTRADA: lo primero. La tarjeta "Pedido en curso" con lo que se puede
//     hacer según el estado, y "Pedidos anteriores" con los últimos cinco.
//   · CATÁLOGO: un paso adentro. La barra fija con el Volver, el buscador, la
//     categoría, "Ver fotos" y la acción principal; las pestañas; la lista de
//     punta a punta con anchos fijos. Enviar y "Agregar al pedido" vuelven a
//     la entrada.
//   · MIRAR: lo pedido, de solo lectura —sin − ni +, ni botones apagados—.
//     El pedido en curso ("Ver pedido" de la entrada) y uno anterior usan la
//     misma vista.
//   · HISTORIAL: todos los pedidos, con el filtro de estado, en el mismo
//     renglón que "Pedidos anteriores" (`FilaPedidoEscritorio`). Es lo que se
//     ve en `/modulos/pedidos/historial` en la computadora.
//
// Las confirmaciones de la entrada —sumar a lo enviado, cancelarlo— van
// adentro de la tarjeta, no en un `confirm()` del navegador.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { MiniaturaProductoTarjeta } from "@/components/sunmi/SunmiProductoCard";
import { showSuccess } from "@/components/sunmi/SunmiToast";
import { textoDeUnidad } from "@/components/pedidos/TarjetaPedido";
import FilaPedidoEscritorio from "@/components/pedidos/FilaPedidoEscritorio";

import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { tamanoDePaginaCatalogo, TAMANOS_DE_PAGINA_CATALOGO } from "@/lib/pedidos/tamanoDePagina";
import { salePorBulto, juntarPorProducto, claveDeLoEnviado } from "@/lib/pedidos/lineasDelPedido";
import { CLAVE_VER_FOTOS, fotosGuardadas } from "@/lib/pedidos/verFotos";
import {
  COLOR_DEL_ESTADO,
  FILTRO_HISTORIAL,
  OPCIONES_FILTRO_HISTORIAL,
  estadoParaElLocal,
  pasaFiltroHistorial,
} from "@/lib/pedidos/estadoParaElLocal";

// ═══════════════════════════════════════════════════════════════════════════
// LAS COPIAS. Ver el encabezado.
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

/** COPIA de `lineaDeFechas` de `app/modulos/pedidos/historial/[id]/page.jsx`. */
function lineaDeFechas(pedido) {
  const cuando = (fecha) => `${diaMesAR(fecha)} ${horaAR(fecha)}`;
  const partes = [];
  if (pedido.solicitadoAt) partes.push(`Enviado ${cuando(pedido.solicitadoAt)}`);
  if (pedido.transferencia?.fechaRecepcion) partes.push(`recibido ${cuando(pedido.transferencia.fechaRecepcion)}`);
  if (pedido.canceladoAt) partes.push(`cancelado ${cuando(pedido.canceladoAt)}`);
  return partes.join(" · ");
}

/** COPIA de las constantes de lectura de `HistorialCelular`. */
const HISTORIAL_DE_A = 50;
const HISTORIAL_PAGINAS_MAXIMAS = 40;
/** Cuántos por página en el historial de la computadora. */
const HISTORIAL_POR_PAGINA = 25;
/** Cuántos pedidos anteriores muestra la entrada. */
const ANTERIORES_EN_LA_ENTRADA = 5;

const cambiosTexto = (n) => (n === 1 ? "cambio" : "cambios");

const VISTA = Object.freeze({ ENTRADA: "entrada", CATALOGO: "catalogo", MIRAR: "mirar", HISTORIAL: "historial" });

// Las dos pestañas de la barra del catálogo.
const PESTANA = Object.freeze({ TODOS: "todos", PEDIDO: "pedido" });

// El pedido en curso, en las palabras de la tarjeta de la entrada.
const EN_CURSO = Object.freeze({
  nada: { etiqueta: null, detalle: null },
  borrador: { etiqueta: "Sin enviar", detalle: "se guarda solo" },
  enviado: { etiqueta: "Enviado · esperando al depósito", detalle: null },
  preparando: { etiqueta: "Preparando en el depósito", detalle: "el depósito lo está preparando" },
});

// ── NADA SE MUEVE AL CARGAR (Emanuel, 2026-10-25) ───────────────────────────
//
// Con el ancho de las columnas decidido por el contenido, el primer "Sacar
// del pedido" corría la columna CANTIDAD entera a la izquierda. La tabla es
// `table-fixed` y cada columna, menos PRODUCTO, que toma el resto, declara su
// ancho en el encabezado, que es el que manda en todos los renglones. Lo que
// aparece o cambia con la cantidad tiene su lugar reservado: el botón de
// sacar está siempre (invisible sin cantidad), el nombre ocupa lo de su
// versión en negrita, y el borde del campo es el mismo de 1 px con otro color.
// Lo prueba `escritorioNadaSeMueve.test.mjs`. La vista de solo mirar usa los
// mismos anchos.
const ANCHO = Object.freeze({ categoria: "w-48", unidad: "w-36", cantidad: "w-36", sacar: "w-48" });

const conEncabezado = (columnas) =>
  columnas.map((c) => ({ ...c, thClassName: `sunmi-surface text-xs2 uppercase tracking-wider sunmi-text-muted ${c.thClassName ?? ""}`.trim() }));

/**
 * La celda PRODUCTO: la foto (con "Ver fotos"), el nombre y, en el modo
 * sumar, la marca de lo que cambia al confirmar.
 *
 * ── TODO EN LA MISMA LÍNEA, AL CENTRO DEL RENGLÓN ──────────────────────────
 *
 * En e6e79d9 la marca tenía su renglón reservado debajo del nombre, invisible
 * sin cambio: el bloque nombre + renglón vacío quedaba centrado y el nombre,
 * medio renglón más arriba que la categoría, la cantidad y el botón (Emanuel,
 * en producción). Ahora en el flujo hay UNA línea —el nombre— y la marca
 * cuelga debajo con `absolute`: no ocupa lugar, así que ni corre al nombre ni
 * agranda el renglón cuando aparece. Entra en el espacio que deja el botón de
 * sacar, que es el que le da el alto al renglón. Lo prueba
 * `escritorioNadaSeMueve.test.mjs`.
 *
 * El nombre ocupa siempre lo que ocupa EN NEGRITA: una copia invisible en
 * negrita en la misma celda de la grilla. Sin esto, un nombre al borde del
 * renglón pasaba a dos al cargarlo.
 */
function CeldaProducto({ producto, verFotos, cargado, marca }) {
  return (
    <div className="flex items-center gap-3">
      {verFotos ? <MiniaturaProductoTarjeta url={producto.imagenUrl} conservaLugar nombre={producto.nombre} /> : null}
      <div data-celda-nombre="" className="relative min-w-0 flex-1">
        <span className="grid">
          <span aria-hidden="true" className="col-start-1 row-start-1 break-words font-bold invisible">
            {producto.nombre}
          </span>
          <span
            data-nombre-producto=""
            className={`col-start-1 row-start-1 break-words sunmi-text-strong ${cargado ? "font-bold" : "font-normal"}`}
          >
            {producto.nombre}
          </span>
        </span>
        {marca ? (
          <span data-marca-cambio="" className="absolute inset-x-0 top-full truncate text-sm2 leading-none sunmi-text-accent">
            {marca}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const columnaCategoria = {
  clave: "categoria",
  titulo: "Categoría",
  thClassName: ANCHO.categoria,
  render: (p) => <span className="break-words sunmi-text-muted">{p.categoriaNombre ?? ""}</span>,
};

const columnaUnidad = {
  clave: "unidad",
  titulo: "Se pide por",
  thClassName: ANCHO.unidad,
  // La misma frase que la tarjeta del teléfono, en la etiqueta chica del kit.
  render: (p) => (
    <span data-se-pide-por="">
      <SunmiPill color="slate">{textoDeUnidad(p)}</SunmiPill>
    </span>
  ),
};

/**
 * LO PEDIDO, DE SOLO MIRAR: nombre, categoría, se pide por y la cantidad como
 * dato. Sin − ni +, sin campo y sin botones —ni apagados—: es para mirar.
 */
function TablaDeSoloMirar({ items, verFotos }) {
  const columnas = conEncabezado([
    { clave: "producto", titulo: "Producto", render: (p) => <CeldaProducto producto={p} verFotos={verFotos} cargado={false} marca={null} /> },
    columnaCategoria,
    columnaUnidad,
    {
      clave: "cantidad",
      titulo: "Cantidad",
      thClassName: ANCHO.cantidad,
      render: (p) => (
        <span data-cantidad-pedido="" className="font-bold tabular-nums sunmi-text-strong">
          {p.cantidad}
        </span>
      ),
    },
  ]);
  return (
    <SunmiTable
      columnas={columnas}
      filas={items}
      claveFila={claveDeLoEnviado}
      densidad="normal"
      vacio="El pedido no tiene productos."
      className="text-sm3 table-fixed"
    />
  );
}

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

/** El pie de una lista paginada: "1 a 50 de N", con ‹ › si hay más de una página. */
function PieDePaginas({ page, pageSize, total, totalPages, onPagina }) {
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center gap-2">
      {totalPages > 1 ? (
        <SunmiButton color="slate" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPagina(Math.max(1, page - 1))}>
          <ChevronLeft size={14} aria-hidden="true" />
        </SunmiButton>
      ) : null}
      <span className="text-sm2 sunmi-text-muted tabular-nums">{`${desde} a ${hasta} de ${total}`}</span>
      {totalPages > 1 ? (
        <SunmiButton color="slate" aria-label="Página siguiente" disabled={page >= totalPages} onClick={() => onPagina(Math.min(totalPages, page + 1))}>
          <ChevronRight size={14} aria-hidden="true" />
        </SunmiButton>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PANTALLA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param vistaInicial "entrada" en `/modulos/pedidos`; "historial" en
 *   `/modulos/pedidos/historial` (ver el reparto en esa página).
 */
export default function PedidosEscritorio({ vistaInicial = VISTA.ENTRADA }) {
  const router = useRouter();
  const { perfil, cargando: cargandoPerfil } = useUser();
  const { requerirOperador } = useOperadorContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opciones, setOpciones] = useState(null);
  const [vista, setVista] = useState(vistaInicial);

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
  const [carritoCargado, setCarritoCargado] = useState(false);
  const [posId, setPosId] = useState(null);
  const [pendiente, setPendiente] = useState(null);
  const [enviando, setEnviando] = useState(false);
  // Lo que "Lo que pedí" necesita saber de cada producto —nombre, categoría,
  // cómo se pide, la foto—, de lo que traen el carrito y el catálogo.
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
  const [confirmandoDescartar, setConfirmandoDescartar] = useState(null); // null | destino

  const [cancelando, setCancelando] = useState(false);
  // La pregunta de la tarjeta de la entrada: null | "sumar" | "cancelar".
  const [preguntando, setPreguntando] = useState(null);

  // Los últimos pedidos, para la entrada.
  const [anteriores, setAnteriores] = useState(null);
  // El historial entero, para la vista HISTORIAL.
  const [historial, setHistorial] = useState(null);
  const [filtro, setFiltro] = useState(FILTRO_HISTORIAL.TODOS);
  const [paginaHistorial, setPaginaHistorial] = useState(1);
  // Lo que se mira: { titulo, estado, linea, items, cargando, error, volverA }.
  const [mirando, setMirando] = useState(null);

  const debounceRef = useRef(null);

  const empezado = !!pendiente?.depositoEmpezo;
  const enviado = !!pendiente && !empezado;
  const sumando = enviado && vista === VISTA.CATALOGO;
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
        setCarritoCargado(true);
        return json;
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  };

  /** Los últimos pedidos (de `/api/pedidos/historial`). Si falla, la tarjeta lo dice. */
  const cargarAnteriores = async () => {
    try {
      const res = await fetch(`/api/pedidos/historial?page=1&pageSize=${ANTERIORES_EN_LA_ENTRADA + 2}`, { cache: "no-store" });
      const json = await res.json();
      setAnteriores(json.ok ? json.items || [] : []);
    } catch (err) {
      console.error(err);
      setAnteriores([]);
    }
  };

  /** COPIA de la lectura de `HistorialCelular`: todas las páginas, de a 50. */
  const cargarHistorial = async () => {
    try {
      const todos = [];
      let p = 1;
      let paginas = 1;
      do {
        const res = await fetch(`/api/pedidos/historial?page=${p}&pageSize=${HISTORIAL_DE_A}`, { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error || "No se pudo cargar el historial.");
          setHistorial([]);
          return;
        }
        todos.push(...(json.items || []));
        paginas = json.totalPages || 1;
        p += 1;
      } while (p <= paginas && p <= HISTORIAL_PAGINAS_MAXIMAS);
      setHistorial(todos);
    } catch (err) {
      console.error(err);
      setError("Error de conexión al cargar el historial.");
      setHistorial([]);
    }
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
        cargarAnteriores();
      } catch (err) {
        console.error(err);
        setError("Error de conexión");
        setLoading(false);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El historial entero se lee al abrir su vista, cada vez.
  useEffect(() => {
    if (vista !== VISTA.HISTORIAL || !opciones) return;
    setHistorial(null);
    cargarHistorial();
  }, [vista, opciones]);

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

  // El catálogo se pide en el catálogo: la entrada no lo necesita.
  const enCatalogo = vista === VISTA.CATALOGO;
  useEffect(() => {
    if (!opciones || !enCatalogo) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargarCatalogo(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [opciones, enCatalogo, cargarCatalogo]);

  // Si el depósito empezó el pedido mientras se sumaba (un 409 releyó el
  // carrito), el catálogo ya no tiene nada que hacer: a la entrada, que lo
  // muestra "Preparando".
  useEffect(() => {
    if (empezado && vista === VISTA.CATALOGO) setVista(VISTA.ENTRADA);
  }, [empezado, vista]);

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

  // ── IR Y VOLVER ─────────────────────────────────────────────────────────

  const irAEntrada = () => {
    setPreguntando(null);
    if (vistaInicial === VISTA.HISTORIAL) router.push("/modulos/pedidos");
    else setVista(VISTA.ENTRADA);
  };

  const abrirCatalogo = () => {
    setPreguntando(null);
    setCambios({});
    setPestana(PESTANA.TODOS);
    setVista(VISTA.CATALOGO);
  };

  /** Lo pedido en curso, de solo mirar. */
  const mirarEnCurso = () => {
    setPreguntando(null);
    const estado = estadoParaElLocal({ estado: pendiente.estado, depositoEmpezo: empezado });
    setMirando({
      titulo: "Pedido al depósito",
      estado,
      linea: pendiente.solicitadoAt ? `Enviado ${cuandoSeEnvio(pendiente.solicitadoAt)}` : "",
      items: juntarPorProducto(pendiente.items, claveDeLoEnviado),
      volverA: VISTA.ENTRADA,
    });
    setVista(VISTA.MIRAR);
  };

  /** Un pedido anterior, de solo mirar: el detalle de la ruta. Nunca el historial viejo. */
  const mirarAnterior = async (posIdAnterior) => {
    const volverA = vista;
    setMirando({ titulo: `Pedido #${posIdAnterior}`, estado: null, linea: "", items: [], cargando: true, volverA });
    setVista(VISTA.MIRAR);
    try {
      const res = await fetch(`/api/pedidos/historial/${encodeURIComponent(posIdAnterior)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) {
        setMirando((m) => ({ ...m, cargando: false, error: json.error || "No se pudo cargar el pedido." }));
        return;
      }
      const p = json.pedido;
      setMirando((m) => ({
        ...m,
        cargando: false,
        estado: estadoParaElLocal({ estado: p.estado, depositoEmpezo: p.depositoEmpezo, transferenciaEstado: p.transferencia?.estado ?? null }),
        linea: lineaDeFechas(p),
        items: juntarPorProducto(p.items, claveDeLoEnviado),
      }));
    } catch (err) {
      console.error(err);
      setMirando((m) => ({ ...m, cargando: false, error: "Error de conexión al cargar el pedido." }));
    }
  };

  const volverDeMirar = () => {
    const a = mirando?.volverA ?? VISTA.ENTRADA;
    setMirando(null);
    if (a === VISTA.HISTORIAL) setVista(VISTA.HISTORIAL);
    else irAEntrada();
  };

  // Salir del catálogo con cambios sin confirmar del modo sumar: antes la hoja.
  const irDesdeCatalogo = (destino) => (destino === VISTA.HISTORIAL ? setVista(VISTA.HISTORIAL) : irAEntrada());
  const salirDelCatalogo = (destino) => {
    if (sumando && cambiosSinConfirmar > 0) setConfirmandoDescartar(destino);
    else irDesdeCatalogo(destino);
  };
  const descartarYSalir = () => {
    const destino = confirmandoDescartar;
    setConfirmandoDescartar(null);
    setCambios({});
    irDesdeCatalogo(destino);
  };

  // ── ENVIAR, SUMAR, CANCELAR ─────────────────────────────────────────────

  /** COPIA de `enviarPedido` de `page.jsx`: al primer toque, y a la entrada. */
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
        irAEntrada();
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

  /** COPIA de `confirmarCambios` de `page.jsx`: un toque, y a la entrada. */
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
        irAEntrada();
        await cargarCarrito();
        showSuccess(lista.length === 1 ? "Se agregó 1 cambio al pedido" : `Se agregaron ${lista.length} cambios al pedido`);
      } else if (res.status === 409) {
        // No entró ninguno: el aviso, los cambios afuera, y la entrada, con
        // el carrito releído, muestra el pedido como está.
        setError(json.error || "No se pudieron agregar los cambios al pedido");
        setCambios({});
        irAEntrada();
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

  /** COPIA de `cancelarPendiente` de `page.jsx`. La pregunta ya se hizo en la tarjeta. */
  const cancelarPendiente = async () => {
    setPreguntando(null);
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
        cargarAnteriores();
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
  const deDondeADonde = `${opciones.local.nombre} → ${opciones.deposito.nombre}`;

  const avisoDeError = error ? (
    <SunmiAviso tono="danger" className="flex items-center justify-between gap-3">
      <span data-aviso-escritorio="">{error}</span>
      <SunmiLinkButton onClick={() => setError("")}>cerrar</SunmiLinkButton>
    </SunmiAviso>
  ) : null;

  const estadoDe = (p) =>
    estadoParaElLocal({
      estado: p.estado,
      transferenciaEstado: p.transferenciaEstado,
      depositoEmpezo: pendiente?.posId === p.posId && empezado,
    });

  // ════════════════════════════════════════════════════════════════════════
  // LA ENTRADA
  // ════════════════════════════════════════════════════════════════════════
  if (vista === VISTA.ENTRADA) {
    const enCurso = !carritoCargado ? null : empezado ? "preparando" : enviado ? "enviado" : enPedido > 0 ? "borrador" : "nada";
    const palabras = enCurso ? EN_CURSO[enCurso] : null;
    const enviadoCuando = enCurso === "enviado" ? cuandoSeEnvio(pendiente.solicitadoAt) : null;
    const detalle =
      enCurso === "enviado"
        ? `${enviadoCuando ? `enviado ${enviadoCuando}` : "enviado"} · todavía podés sumar productos`
        : palabras?.detalle;
    const hayPedido = enCurso != null && enCurso !== "nada";
    // El pedido en curso y el borrador van en la tarjeta, no entre los anteriores.
    const delHistorial = (anteriores || []).filter((a) => a.posId !== pendiente?.posId && a.posId !== posId).slice(0, ANTERIORES_EN_LA_ENTRADA);

    let acciones = null;
    if (preguntando === "sumar") {
      acciones = (
        <div data-pregunta-entrada="" className="flex items-center gap-2">
          <span className="text-sm3 sunmi-text-strong">¿Sumar productos al pedido que ya enviaste?</span>
          <SunmiButton color="slate" onClick={() => setPreguntando(null)}>No</SunmiButton>
          <SunmiButton color="primary" onClick={abrirCatalogo}>Sí, sumar</SunmiButton>
        </div>
      );
    } else if (preguntando === "cancelar") {
      acciones = (
        <div data-pregunta-entrada="" className="flex items-center gap-2">
          <span className="text-sm3 sunmi-text-strong">¿Cancelar el pedido enviado?</span>
          <SunmiButton color="slate" onClick={() => setPreguntando(null)}>No</SunmiButton>
          <SunmiButton color="red" onClick={cancelarPendiente}>Sí, cancelar</SunmiButton>
        </div>
      );
    } else if (enCurso === "nada") {
      acciones = (
        <>
          <span className="text-sm3 sunmi-text-muted">no tenés un pedido en curso</span>
          <SunmiButton color="primary" onClick={abrirCatalogo}>Hacer un pedido</SunmiButton>
        </>
      );
    } else if (enCurso === "borrador") {
      acciones = <SunmiButton color="primary" onClick={abrirCatalogo}>Seguir armando</SunmiButton>;
    } else if (enCurso === "enviado") {
      acciones = (
        <>
          <SunmiButton color="slate" onClick={mirarEnCurso}>Ver pedido</SunmiButton>
          <SunmiButton color="primary" onClick={() => setPreguntando("sumar")}>Sumar productos</SunmiButton>
          <SunmiButton color="red" disabled={cancelando} onClick={() => setPreguntando("cancelar")}>
            {cancelando ? "Cancelando..." : "Cancelar pedido"}
          </SunmiButton>
        </>
      );
    } else if (enCurso === "preparando") {
      acciones = <SunmiButton color="slate" onClick={mirarEnCurso}>Ver pedido</SunmiButton>;
    }

    return (
      <div className="sunmi-bg w-full min-h-full p-3 space-y-3" data-pedidos-escritorio-pantalla="" data-vista="entrada">
        {avisoDeError}
        <div
          data-pedido-en-curso={enCurso ?? ""}
          className={`rounded-xl2 border sunmi-border sunmi-bg-card p-6 flex items-center justify-between gap-6${hayPedido ? " sunmi-border-accent" : ""}`}
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl2 font-bold sunmi-text-strong">Pedido al depósito</h1>
              {palabras?.etiqueta ? (
                <span data-etiqueta-en-curso="">
                  <SunmiPill color="amber">{palabras.etiqueta}</SunmiPill>
                </span>
              ) : null}
            </div>
            <p data-linea-en-curso="" className="text-sm3 sunmi-text-muted">
              {enCurso === null ? "Cargando..." : detalle ? `${deDondeADonde} · ${detalle}` : deDondeADonde}
            </p>
            {hayPedido && enPedido > 0 ? (
              <p data-productos-en-curso="" className="flex items-baseline gap-2">
                <span className="text-xl3 font-bold tabular-nums sunmi-text-strong">{enPedido}</span>
                <span className="text-sm3 sunmi-text-muted">{`${productos(enPedido)} en el pedido`}</span>
              </p>
            ) : null}
          </div>
          <div data-acciones-en-curso="" className="flex shrink-0 items-center gap-2">
            {acciones}
          </div>
        </div>

        <div data-pedidos-anteriores="" className="rounded-xl2 border sunmi-border sunmi-bg-card p-6 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold sunmi-text-strong">Pedidos anteriores</h2>
            <SunmiButton color="slate" onClick={() => setVista(VISTA.HISTORIAL)}>Ver todo el historial</SunmiButton>
          </div>
          {anteriores === null ? <p className="text-sm2 sunmi-text-muted">Cargando...</p> : null}
          {anteriores !== null && delHistorial.length === 0 ? (
            <p className="text-sm2 sunmi-text-muted">Todavía no hay pedidos anteriores.</p>
          ) : null}
          <div className="divide-y sunmi-divide">
            {delHistorial.map((a) => (
              <FilaPedidoEscritorio key={a.posId} pedido={a} estado={estadoDe(a)} onVer={() => mirarAnterior(a.posId)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // MIRAR: lo pedido, de solo lectura
  // ════════════════════════════════════════════════════════════════════════
  if (vista === VISTA.MIRAR && mirando) {
    return (
      <div className="sunmi-bg w-full min-h-full p-3 space-y-3" data-pedidos-escritorio-pantalla="" data-vista="mirar">
        {avisoDeError}
        <div className="rounded-xl2 border sunmi-border sunmi-bg-card px-6 py-4 flex items-center gap-4">
          <SunmiBackButton onVolver={volverDeMirar} />
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg3 font-bold sunmi-text-strong">{mirando.titulo}</h1>
              {mirando.estado ? <SunmiPill color={COLOR_DEL_ESTADO[mirando.estado] ?? "slate"}>{mirando.estado}</SunmiPill> : null}
            </div>
            {mirando.linea ? <p className="text-sm3 sunmi-text-muted">{mirando.linea}</p> : null}
          </div>
        </div>
        {mirando.error ? <SunmiAviso tono="danger">{mirando.error}</SunmiAviso> : null}
        {mirando.cargando ? <p className="text-sm2 sunmi-text-muted">Cargando...</p> : null}
        {!mirando.cargando && !mirando.error ? (
          <div className="overflow-hidden rounded-xl2 border sunmi-border sunmi-bg-card" data-lista-pedido="mirar">
            <TablaDeSoloMirar items={mirando.items} verFotos={verFotos} />
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-t sunmi-divider" data-pie-lista="">
              <span className="text-sm2 sunmi-text-muted">{`${mirando.items.length} ${productos(mirando.items.length)} en el pedido`}</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // EL HISTORIAL
  // ════════════════════════════════════════════════════════════════════════
  if (vista === VISTA.HISTORIAL) {
    const conEstado = (historial || []).map((p) => ({ pedido: p, estado: estadoDe(p) }));
    const filtrados = conEstado.filter((x) => pasaFiltroHistorial(x.estado, filtro));
    const paginas = Math.max(1, Math.ceil(filtrados.length / HISTORIAL_POR_PAGINA));
    const paginaVista = Math.min(paginaHistorial, paginas);
    const visibles = filtrados.slice((paginaVista - 1) * HISTORIAL_POR_PAGINA, paginaVista * HISTORIAL_POR_PAGINA);
    return (
      <div className="sunmi-bg w-full min-h-full p-3 space-y-3" data-pedidos-escritorio-pantalla="" data-vista="historial">
        {avisoDeError}
        <div className="rounded-xl2 border sunmi-border sunmi-bg-card px-6 py-4 flex items-end gap-6" data-historial-escritorio="">
          <SunmiBackButton onVolver={irAEntrada} />
          <h1 className="text-lg3 font-bold sunmi-text-strong">Historial de pedidos</h1>
          <SunmiFiltroEstado
            rotulo="Estado"
            opciones={OPCIONES_FILTRO_HISTORIAL}
            valor={filtro}
            onCambiar={(v) => {
              setFiltro(v);
              setPaginaHistorial(1);
            }}
            className="ml-auto w-96"
          />
        </div>
        <div className="rounded-xl2 border sunmi-border sunmi-bg-card px-6 py-2">
          {historial === null ? <p className="text-sm2 sunmi-text-muted py-2">Cargando...</p> : null}
          {historial !== null && filtrados.length === 0 ? (
            <p className="text-sm2 sunmi-text-muted py-2">
              {historial.length === 0 ? "Todavía no hay pedidos al depósito." : "No hay pedidos en este estado."}
            </p>
          ) : null}
          <div className="divide-y sunmi-divide">
            {visibles.map((x) => (
              <FilaPedidoEscritorio key={x.pedido.posId} pedido={x.pedido} estado={x.estado} onVer={() => mirarAnterior(x.pedido.posId)} />
            ))}
          </div>
          {filtrados.length > HISTORIAL_POR_PAGINA ? (
            <div className="py-2 border-t sunmi-divider">
              <PieDePaginas page={paginaVista} pageSize={HISTORIAL_POR_PAGINA} total={filtrados.length} totalPages={paginas} onPagina={setPaginaHistorial} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // EL CATÁLOGO
  // ════════════════════════════════════════════════════════════════════════

  // "Lo que pedí": lo que tiene cantidad en pantalla —en el modo sumar, con lo
  // nuevo sin confirmar—, en el orden del pedido.
  const loQuePedi = orden.filter((id) => cantidadEnPantalla(id) > 0).map((id) => fichas[id] || { productoLocalId: id, nombre: `Producto #${id}` });
  const viendoPedido = pestana === PESTANA.PEDIDO;

  // La marca de abajo del nombre, en el modo sumar: lo que cambia al confirmar.
  const marcaDelCambio = (id) => {
    const c = sumando ? cambios[id] : null;
    if (!c) return null;
    const antes = carrito[id];
    return antes == null ? "nuevo, sin confirmar" : `${antes} → ${c.cantidad}, sin confirmar`;
  };

  const columnas = conEncabezado([
    {
      clave: "producto",
      titulo: "Producto",
      render: (p) => (
        <CeldaProducto
          producto={p}
          verFotos={verFotos}
          cargado={cantidadEnPantalla(p.productoLocalId) > 0}
          marca={marcaDelCambio(p.productoLocalId)}
        />
      ),
    },
    columnaCategoria,
    columnaUnidad,
    {
      clave: "cantidad",
      titulo: "Cantidad",
      thClassName: ANCHO.cantidad,
      render: (p) => (
        <CampoCantidadDeFila
          producto={p}
          cantidad={cantidadEnPantalla(p.productoLocalId)}
          onCantidad={(cant, uni) => setCantidad(p.productoLocalId, cant, uni)}
        />
      ),
    },
    {
      // El ancho está declarado siempre, haya botón o no. Y el botón también
      // está siempre: sin cantidad va invisible, apagado, fuera del foco y
      // oculto al lector de pantalla —el criterio de la ✕ de `TarjetaPedido`—,
      // así aparecer no le cambia el alto al renglón.
      clave: "sacar",
      titulo: "",
      align: "der",
      thClassName: ANCHO.sacar,
      render: (p) => {
        const visible = cantidadEnPantalla(p.productoLocalId) > 0;
        return (
          <SunmiButton
            color="ghost"
            data-lugar-sacar=""
            aria-hidden={visible ? undefined : "true"}
            tabIndex={visible ? undefined : -1}
            disabled={!visible}
            className={`whitespace-nowrap border sunmi-border sunmi-bg-card sunmi-text-danger${visible ? "" : " invisible"}`}
            onClick={() => {
              if (visible) setCantidad(p.productoLocalId, 0, "UNIDAD");
            }}
          >
            Sacar del pedido
          </SunmiButton>
        );
      },
    },
  ]);

  // La acción principal de la barra.
  const principal = sumando ? (
    <SunmiButton color="primary" disabled={agregando || cambiosSinConfirmar === 0} onClick={confirmarCambios} className="shrink-0">
      {agregando ? "Agregando..." : `Agregar al pedido (${cambiosSinConfirmar})`}
    </SunmiButton>
  ) : (
    <SunmiButton color="primary" disabled={enviando || enPedido === 0} onClick={enviarPedido} className="shrink-0">
      {enviando ? "Enviando..." : `Enviar pedido al depósito (${enPedido})`}
    </SunmiButton>
  );

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

  const pie = viendoPedido ? (
    <span className="text-sm2 sunmi-text-muted">{`${loQuePedi.length} ${productos(loQuePedi.length)} en el pedido`}</span>
  ) : (
    <>
      <PieDePaginas page={page} pageSize={pageSize} total={total} totalPages={totalPages} onPagina={(p) => cargarCatalogo(p)} />
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
    <div className="sunmi-bg w-full min-h-full" data-pedidos-escritorio-pantalla="" data-vista="catalogo">
      {/* ── 1 · LA BARRA FIJA ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 sunmi-bg-card border-b sunmi-divider px-3 py-2 space-y-2" data-barra-pedido="">
        {avisoDeError}

        <div className="flex items-center gap-3" data-herramientas-pedido="">
          <SunmiBackButton onVolver={() => salirDelCatalogo(VISTA.ENTRADA)} className="shrink-0" />
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

        <div className="flex items-center gap-2" data-pestanas-pedido="">
          {pestanaBoton(PESTANA.TODOS, "Todos los productos")}
          {pestanaBoton(PESTANA.PEDIDO, `Lo que pedí · ${loQuePedi.length}`)}
          <span className="ml-auto min-w-0 text-sm2 sunmi-text-muted">
            {sumando ? `${deDondeADonde} · sumando al pedido enviado` : `${deDondeADonde} · se guarda solo`}
          </span>
          <SunmiButton color="slate" onClick={() => salirDelCatalogo(VISTA.HISTORIAL)} className="shrink-0">
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
            // `table-fixed`: el ancho de cada columna lo dice su encabezado y
            // no el contenido. Ver "NADA SE MUEVE AL CARGAR", más arriba.
            className="text-sm3 table-fixed"
          />
          {/* ── 3 · EL PIE ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t sunmi-divider" data-pie-lista="">
            {pie}
          </div>
        </div>
      </div>

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
