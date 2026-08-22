"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import FiltrosProductos from "@/components/productos/FiltrosProductos";
import ColumnManager from "@/components/productos/ColumnManager";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import ModalVerComposicion from "@/components/productos/ModalVerComposicion";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiTablaProductos from "@/components/productos/SunmiTablaProductos";
// La tarjeta del celular pasó a tener dos caras, y quien las administra es
// `TarjetaProductoMovil`: `SunmiProductoCard` sigue siendo la pieza del kit y
// esta pantalla ya no la monta directo.
import TarjetaProductoMovil from "@/components/productos/TarjetaProductoMovil";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import CarruselControles from "@/components/productos/CarruselControles";
import HojaMasAcciones from "@/components/productos/HojaMasAcciones";
import HojaPersonalizarTarjeta from "@/components/productos/HojaPersonalizarTarjeta";
// `Eye` se fue con el botón "Ver": la tarjeta del celular deja Editar como única
// acción. La pantalla de sólo lectura sigue existiendo y se llega desde la tabla
// de escritorio, que no cambió.
// `X` se fue con el chip de control y `Pencil` con la tarjeta: el ícono de
// Editar lo pone ahora `TarjetaProductoMovil`, junto al botón.
import { SlidersHorizontal, MoreHorizontal, CheckCheck } from "lucide-react";
// `lineaDeEquivalencia` se fue con la franja; el único caso donde su texto sigue
// haciendo falta —kilo y pieza fija— lo pide `carasDeTarjeta`, que la llama
// igual. Y los dos helpers de redondeo se importaban para armar el número a
// mano: ahora el número sale de `valorEnLaEscalaDeVenta`, que los llama por
// dentro. Un import sin consumidor documenta un cálculo que esta pantalla ya no
// hace, que es justo lo que no puede volver a hacer.
import { formatearMoneda } from "@/lib/moneda";
import { escalaDeVentaDe, valorEnLaEscalaDeVenta } from "@/lib/precios/escalaDeVenta";
// `seVendeSinGanancia` y `GANANCIA_FALTA` se importaban acá para los dos avisos
// de mantenimiento de la tarjeta. Los dos avisos se fueron a "Para revisar", que
// los cuenta y los deja filtrar, así que estos imports quedaron sin consumidor.
// Se sacan: un import que nadie usa documenta una UX que ya no existe, y el
// próximo que lea el archivo va a buscar dónde se dibuja ese aviso.
import { reglaDeGananciaDe, textoDeGanancia } from "@/lib/precios/reglaDeGanancia";
// LA MARCA DEL SERVICIO ES LA DEL POS, no una nueva. `esProductoServicio` mira
// `modalidad`, que es el mismo campo con el que el POS decide abrir el modal de
// importe en vez de cobrar un precio fijo.
import { esProductoServicio } from "@/lib/pos-ventas/servicios";
import { CONTROL, esControlValido } from "@/lib/productos/controlesCalidad";
import { pedidoYaSalio } from "@/lib/productos/pedidoYaSalio";
import {
  filtrosNeutros,
  mismosFiltros,
  hayFiltrosPuestos,
  normalizarEstadoDeUrl,
  CLAVES_DE_FILTRO,
} from "@/lib/productos/filtrosCatalogo";
// `REGION` y `camposVisiblesDe` se fueron con el reordenamiento: la
// personalización pasó a ser prender y apagar, y la posición la define el diseño.
import {
  CAMPO,
  campoVisible,
  claveDeConfiguracion,
  configuracionPorDefecto,
  normalizarConfiguracion,
} from "@/lib/productos/camposTarjeta";
import { carasDeTarjeta } from "@/lib/productos/carasDeTarjeta";
import useContextoActivo from "@/hooks/useContextoActivo";

// =========================================================
// TABS
// =========================================================
const TABS = [
  { key: "listado", label: "Listado" },
  { key: "importexport", label: "Import / Export" },
];

// ── LO QUE MUESTRA UN SERVICIO DE IMPORTE VARIABLE ────────────────────────
//
// El texto —"Importe variable"— es el mismo que ya muestra el buscador del POS.
// Vive ahora en `TarjetaProductoMovil`, que es quien dibuja el número: acá la
// constante quedaba sin consumidor, y una constante que nadie usa documenta una
// pantalla que ya no existe.
//
// Con la constante se fue también `EQUIVALENCIA_IMPORTE_VARIABLE`, el texto de
// la franja: la franja no existe más.

// ── LA REGLA DE GANANCIA EN LA TARJETA, YA SIN AVISAR ─────────────────────
//
// ACÁ VIVÍAN LOS DOS AVISOS DE MANTENIMIENTO, y se fueron enteros: la constante
// "Se vende sin ganancia" y el ámbar del "falta %". Los dos son ahora controles
// de "Para revisar", donde se cuentan y se pueden filtrar; en la tarjeta
// informaban de a uno y no llevaban a ningún lado. Dejar la constante y el texto
// que la explicaba habría dejado el archivo documentando una pantalla que ya no
// existe.
//
// Lo que queda es el renglón que dice CUÁL es la regla —un porcentaje, o
// "+$100/un" en las 231 filas de recargo fijo— en el gris tenue de la tarjeta,
// sin distinguir al que no tiene ninguna. Esa distinción la hace la card de
// "Falta regla".
//
// Los servicios de importe variable quedan afuera: no tienen precio fijo, así
// que no les falta un porcentaje — no les corresponde.
//
// `text-xs` y no una medida escrita: está en la escala y no sube el contador de
// hardcodeo. Son 10,5 px reales —1 rem son 14 acá—.
const GANANCIA_CLASE = "text-xs [font-variant-numeric:tabular-nums] whitespace-nowrap";

// ── EL ESTADO INICIAL SALE DE LA URL, Y SE NORMALIZA ANTES DE USARSE ──────
//
// Las dos lecturas viven acá arriba, fuera del componente, por un motivo
// concreto: tienen que poder combinarse ANTES de que ninguno de los dos `useState`
// las use. Leídas cada una en su inicializador —que es como estaban— nunca se
// miran juntas, y por ahí entraba el agujero de `?control=sin-regla&q=aceite`.
function controlDeLaUrl(sp) {
  const pedido = sp.get("control");
  return esControlValido(pedido) ? pedido : null;
}

function filtrosDeLaUrl(sp) {
  return {
    search: sp.get("q") || "",
    categoria: sp.get("categoria") || "",
    proveedor: sp.get("proveedor") || "",
    area: sp.get("area") || "",
    // estado: activos (default) | inactivos | todos. Soporta URL vieja con
    // ?activo=true/false para no romper bookmarks de operadores.
    estado:
      sp.get("estado") ||
      (sp.get("activo") === "false"
        ? "inactivos"
        : sp.get("activo") === "true"
        ? "activos"
        : "activos"),
    // tipo: todos (default) | productos | combos.
    tipo: sp.get("tipo") || "todos",
  };
}

// Contenedor scrolleable de la lista: con header sticky el scroll vive en
// #productos-scroll (la tabla). Fallback al <main> de LayoutBase.
function getProductosScrollEl() {
  if (typeof document === "undefined") return null;
  return document.getElementById("productos-scroll") || document.querySelector("main");
}

export default function ProductosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil: perfilProd, cargando: cargandoProd } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const permisosProd = perfilProd?.permisos || [];
  const esAdminProd = Array.isArray(permisosProd) && permisosProd.includes("*");
  const puedeProd = esAdminProd || permisosProd.includes("productos.ver");
  // El export baja el catálogo CON costos y márgenes, así que desde el INC-0007
  // pide `costos.ver` y no `productos.ver`. Sin esto quedaría un botón visible
  // que contesta 403 al tocarlo — un botón que no hace nada es la clase de cosa
  // que después se reporta como "el sistema anda mal".
  const puedeExportar = esAdminProd || permisosProd.includes("costos.ver");

  // ── EL COSTO EN LA TARJETA NO VA DETRÁS DE NINGÚN PERMISO ───────────────
  //
  // Estaba atado a `costos.ver` —el mismo del export— y Emanuel lo sacó el
  // 2026-08-19: el costo y el porcentaje se ven en el catálogo para todos. El
  // motivo es que nadie vea un número distinto que su compañero, que es lo que
  // pasaba con los tres roles que ven el catálogo y no tienen el permiso
  // —`Deposito`, `Mini` y `ENCARGADO`—.
  //
  // OJO CON LO QUE NO CAMBIÓ: `puedeExportar` sigue pidiendo `costos.ver` y no
  // se toca. El export baja el catálogo entero con costos y márgenes a un
  // archivo, que es otra cosa que mirar un número en pantalla; ese permiso viene
  // del INC-0007. Estaban compartiendo la misma variable y por eso se separan
  // acá, en vez de aflojar el del export.
  //
  // Queda un pendiente anotado y sin resolver: si el catálogo muestra el costo a
  // todos, `costos.ver` queda decorativo al menos ahí, y en algún momento hay
  // que decidir si sigue teniendo sentido en el resto.

  // ── LAS PREFERENCIAS DE LA TARJETA, DEL LOCAL ────────────────────────────
  //
  // Vienen de `/api/me` por el contexto de usuario, el mismo camino que ya usa
  // `exigirOperador`. Llegan ya resueltas a booleano: `null` —nunca las
  // tocaron— y un servidor viejo que no las mande dan las dos en `false`, que es
  // lo que se ve hoy.
  //
  // Se leen ACÁ y no adentro de `SunmiProductoCard`: la pieza del kit sabe
  // dibujar, no sabe de sesiones ni de locales. Si leyera el contexto por su
  // cuenta, el andamio —que la monta sin sesión— dejaría de funcionar.
  // ── EL INTERRUPTOR DE "SIEMPRE UNITARIO" YA NO DECIDE LA ESCALA ─────────
  //
  // Y no es un olvido. Desde que la tarjeta muestra la escala en la que se
  // VENDE —la que decide el POS— ya no hay nada que elegir: el número y su
  // rótulo salen de `escalaDeVentaDe`. Dejar además una preferencia que los
  // forzara a otra escala sería reponer el defecto que esta tanda arregla, solo
  // que a pedido.
  //
  // En la práctica el interruptor pasó a no hacer nada, porque en un local el
  // POS ya vende por unidad —o sea que ahí la tarjeta muestra el unitario igual,
  // sin prenderlo— y en el depósito forzarlo haría que la tarjeta contradiga al
  // mostrador. La columna y la pantalla quedan en su lugar; sacarlas es una
  // decisión de Emanuel y está anotada.
  // ── Y "OCULTAR LA EQUIVALENCIA DE BULTO" TAMPOCO SE LEE MÁS ─────────────
  //
  // Era la otra preferencia de apariencia por local, y apagaba la franja de
  // conversión. Esa franja no existe: la presentación pasó a viajar pegada al
  // precio y la otra escala vive en el dorso.
  //
  // **No se repurposeó para apagar el dorso, a propósito.** El interruptor dice
  // "ocultar la equivalencia", y lo que ocultaba era un bloque PERMANENTE que
  // aparecía sin pedirlo; el dorso solo se ve si alguien lo pide tocando. Usar
  // ese booleano guardado para significar otra cosa es cambiarle el sentido a una
  // preferencia que ya tomó gente, sin avisarles.
  //
  // Así que hoy la columna y su interruptor quedan SIN EFECTO sobre esta
  // pantalla. Está anotado como pendiente: o se le da un sentido nuevo con su
  // texto nuevo, o se saca. Las dos son decisiones de Emanuel.

  // La ubicación en la que estoy parado. Es la mitad de la respuesta: el MISMO
  // producto se vende por bulto en el depósito y por unidad en un local.
  const esDepositoProd = contexto?.esDeposito === true;

  const nuevo = searchParams.get("nuevo");
  const editarId = searchParams.get("editar");

  // =========================================================
  // TAB ACTIVO
  // =========================================================
  const [activeTab, setActiveTab] = useState("listado");

  // =========================================================
  // ESTADO LISTADO — inicializado desde URL query params
  // =========================================================
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  // ── ¿ACÁ EL POS COBRA EL COSTO? ─────────────────────────────────────────
  //
  // Propiedad de la UBICACIÓN, no de las filas, así que es un estado de la
  // página y no un campo de cada producto. Lo contesta el servidor con el mismo
  // resolver que usa el POS; la pantalla no lo deduce de `esDeposito` ni de
  // ninguna otra pista, porque lo que decide es la lista configurada y no el
  // tipo de ubicación.
  //
  // Arranca en `false`, que es el comportamiento de siempre: mientras no haya
  // respuesta —o si el servidor degradó— la tarjeta muestra el precio de venta.
  const [vendeConListaAlCosto, setVendeConListaAlCosto] = useState(false);
  const [listaAlCostoRedondea100, setListaAlCostoRedondea100] = useState(false);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortKey, setSortKey] = useState(searchParams.get("sortKey") || "nombre");
  const [sortDir, setSortDir] = useState(searchParams.get("sortDir") || "asc");

  // ── EL CONTROL QUE ESTÁ FILTRANDO ────────────────────────────────────────
  //
  // Vive en la URL como los demás filtros: así el botón de atrás del teléfono
  // deshace el filtro, y un enlace a "los que faltan revisar" se puede mandar.
  //
  // Se valida contra el dominio al leerlo. Un id inventado en la URL no puede
  // dejar la pantalla filtrando por algo que el servidor no sabe contar: quedaría
  // la lista vacía sin ninguna card marcada, y eso se lee como "no hay productos".
  //
  // ── Y SE NORMALIZA CONTRA LOS FILTROS ANTES DE ENTRAR AL ESTADO ─────────
  //
  // Una URL con los dos —`?control=sin-regla&q=aceite`— rompía el criterio del
  // issue sin pasar por ningún manejador: bastaba con recargar la página o abrir
  // un enlace compartido. `normalizarEstadoDeUrl` decide que gana el control y
  // los filtros se van, que es lo mismo que hace tocar la card.
  //
  // Se calcula UNA vez y de ahí salen los dos `useState`. Leído en cada
  // inicializador por separado, el control y los filtros nunca se miran juntos —
  // que es exactamente cómo se coló este caso.
  const inicialRef = useRef(null);
  if (inicialRef.current === null) {
    inicialRef.current = normalizarEstadoDeUrl({
      control: controlDeLaUrl(searchParams),
      filtros: filtrosDeLaUrl(searchParams),
    });
  }

  const [control, setControl] = useState(inicialRef.current.control);
  const [controles, setControles] = useState([]);
  const [cargandoControles, setCargandoControles] = useState(true);
  // El conteo puede ser PARCIAL: el servidor clasifica en memoria con un techo.
  // Se guarda para poder decirlo, porque un 0 parcial no significa "no hay
  // ninguno" sino "no lo sé".
  const [controlesTruncado, setControlesTruncado] = useState(false);
  const [techoControles, setTechoControles] = useState(null);
  // Y el mismo caso del lado del listado: con el filtro puesto, el servidor avisa
  // si tuvo que cortar. Si corta, el total tampoco es el total.
  const [listadoTruncado, setListadoTruncado] = useState(false);
  const [marcandoRevisado, setMarcandoRevisado] = useState(false);

  // Las tres hojas del celular. Ninguna existe en escritorio.
  const [hojaMas, setHojaMas] = useState(false);
  const [hojaPersonalizar, setHojaPersonalizar] = useState(false);
  const [hojaFiltros, setHojaFiltros] = useState(false);

  // ── LA CONFIGURACIÓN DE LA TARJETA ARRANCA EN EL DEFAULT, SIEMPRE ────────
  //
  // Y se lee del `localStorage` recién en un efecto, no en el inicializador.
  // Motivo: esta pantalla se renderiza también en el servidor, donde no hay
  // `localStorage`. Un inicializador que lea el navegador devuelve una cosa en el
  // servidor y otra en el cliente, y React lo reporta como error de hidratación
  // —o peor, no lo reporta y deja el árbol desincronizado.
  //
  // `visibleCols` lo hace del otro modo y funciona porque tiene su
  // `typeof window`; acá se elige el camino que no depende de acordarse.
  const [configTarjeta, setConfigTarjeta] = useState(() => configuracionPorDefecto());

  // Selección persistente de fila + restauración de scroll al volver de editar.
  // El contenedor scrolleable es el <main> de LayoutBase (no window).
  const restoredScrollRef = useRef(false);
  // Acá vivía `tarjetaAbierta`, el estado de qué tarjeta tenía la capa abierta.
  // Se fue con la capa: los botones están a la vista, así que no hay nada que
  // abrir y la tarjeta dejó de tener estado.
  const [selectedProductId, setSelectedProductId] = useState(() => {
    if (typeof window === "undefined") return null;
    // Conservar la selección SOLO si venimos de editar (hay scroll guardado).
    // En una entrada fresca al módulo, arrancar sin selección.
    if (sessionStorage.getItem("productos:scrollY") == null) return null;
    const v = sessionStorage.getItem("productos:selectedProductId");
    return v ? Number(v) : null;
  });

  // Click en una fila (fuera de los botones) → marca persistente.
  const handleSelectProducto = useCallback((id) => {
    setSelectedProductId(id);
    try { sessionStorage.setItem("productos:selectedProductId", String(id)); } catch {}
  }, []);

  // ── LA PAGINACIÓN, DEFINIDA UNA SOLA VEZ ─────────────────────────────────
  //
  // La consumen DOS vistas de la misma pantalla: la tabla, de 768 px para
  // arriba, y la lista de tarjetas del celular. Se arma como un objeto y se
  // pasa entera a las dos, en vez de escribir los cuatro manejadores dos veces:
  // dos copias no se rompen el día que se escriben, se rompen el día que una
  // cambia — y acá "cambiar" significa que el celular pagine distinto que la
  // computadora sobre los mismos 2.600 productos.
  const propsPaginacion = {
    page,
    pageSize,
    totalPages,
    totalItems,
    onNext: () => setPage((p) => p + 1),
    onPrev: () => setPage((p) => Math.max(1, p - 1)),
    onGoToPage: (n) => setPage(Math.min(Math.max(1, Number(n) || 1), totalPages || 1)),
    onPageSizeChange: (size) => {
      setPageSize(size);
      setPage(1);
    },
  };

  const localId = contexto?.localId || 0;

  // Salen del mismo estado inicial normalizado que el control — ver `inicialRef`.
  const [filtros, setFiltros] = useState(inicialRef.current.filtros);

  // Los filtros que NO reducen el universo: exactamente el que cuenta la card de
  // "Para revisar". Es el estado al que se vuelve al activar un control.
  //
  // `estado: "activos"` y `tipo: "todos"` no son "vacío", son los valores por
  // defecto — y son los que el contador usa, así que son los que hacen que los
  // dos números cierren.
  const filtrosAntesDelControlRef = useRef(null);

  // =========================================================
  // SYNC ESTADO LISTADO → URL (query params)
  // =========================================================
  const buildListingUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (sortKey !== "nombre") params.set("sortKey", sortKey);
    if (sortDir !== "asc") params.set("sortDir", sortDir);
    if (filtros.search) params.set("q", filtros.search);
    if (filtros.categoria) params.set("categoria", filtros.categoria);
    if (filtros.proveedor) params.set("proveedor", filtros.proveedor);
    if (filtros.area) params.set("area", filtros.area);
    // Sólo persistir estado en URL cuando no es el default "activos".
    if (filtros.estado && filtros.estado !== "activos") {
      params.set("estado", filtros.estado);
    }
    if (filtros.tipo && filtros.tipo !== "todos") {
      params.set("tipo", filtros.tipo);
    }
    // El control filtrando viaja en la URL como un filtro más: así el botón de
    // atrás lo deshace y el enlace se puede compartir.
    if (control) params.set("control", control);
    const qs = params.toString();
    return qs ? `/modulos/productos?${qs}` : "/modulos/productos";
  }, [page, sortKey, sortDir, filtros, control]);

  const urlSyncRef = useRef(false);
  useEffect(() => {
    // ── LA URL EN MODO MODAL NO ES DEL LISTADO, ASÍ QUE NO SE PISA ──────────
    //
    // `buildListingUrl` arma la query DESDE CERO con los parámetros del listado,
    // así que cualquier otro —`editar`, `nuevo`— desaparece. Eso está bien cuando
    // se vuelve al listado a propósito (al cerrar el modal, o al fallar la carga)
    // y está mal acá, donde la URL se sincroniza sola.
    //
    // MEDIDO, no deducido: entrando por `/modulos/productos?editar=<id>`, este
    // efecto disparaba un `replaceState` a `/modulos/productos` alrededor de un
    // segundo después de cargar, y el modal abría o no según quién llegara
    // primero — la respuesta del `fetch` o el re-render sin el parámetro. Siete
    // corridas seguidas dieron 4, y otras siete dieron 1. Sin ningún error a la
    // vista: no salta ningún alert y la URL simplemente queda sin el parámetro.
    //
    // El disparador es que el guardia de abajo NO ALCANZA: React en modo estricto
    // monta, desmonta y vuelve a montar, y en la segunda montada el `ref` ya está
    // en `true`, así que el efecto pasa de largo y pisa la URL. Comprobado
    // apagando `reactStrictMode` en `next.config.mjs`: con eso pasó a abrir 5 de
    // 5 y el parámetro sobrevivió las cinco veces.
    //
    // **Eso significa que en producción hoy no ocurre**, porque el doble montado
    // es de desarrollo. No se arregla apagando el modo estricto —sería apagar el
    // detector— sino sacando el motivo: el listado no escribe la URL cuando la
    // URL está en manos del modal. Y de paso deja de ser una bomba para
    // producción, donde el mismo pisotón ocurriría si cualquiera de las cuatro
    // dependencias de `buildListingUrl` cambiara con el modal abierto.
    if (editarId || nuevo === "1") return;

    // Saltar el primer render (la URL ya tiene los params correctos)
    if (!urlSyncRef.current) { urlSyncRef.current = true; return; }
    router.replace(buildListingUrl(), { scroll: false });
  }, [buildListingUrl, editarId, nuevo]);

  const allColumns = [
    { key: "imagenUrl", label: "Imagen" },
    { key: "nombre", label: "Nombre" },
    { key: "codigoBarra", label: "Código barra" },
    // El nombre largo: "Código interno" a secas se confundía con el id del
    // producto y con el SKU — y de hecho la tarjeta del celular llegó a mostrar
    // el id bajo ese rótulo. Es el código que le da EL PROVEEDOR.
    { key: "codigoInterno", label: "Código interno por proveedor" },
    { key: "sku", label: "SKU" },
    { key: "categoriaId", label: "Categoría" },
    { key: "proveedorId", label: "Proveedor" },
    { key: "areaFisicaId", label: "Área física" },
    { key: "unidadMedida", label: "Unidad" },
    { key: "factorPack", label: "Pack" },
    { key: "pesoKg", label: "Peso (kg)" },
    { key: "volumenMl", label: "Volumen (ml)" },
    { key: "precioCosto", label: "Costo" },
    { key: "precioVenta", label: "Venta" },
    { key: "margen", label: "Margen %" },
    { key: "ivaPorcentaje", label: "IVA %" },
    { key: "fechaVencimiento", label: "Vencimiento" },
    { key: "esCombo", label: "Combo" },
    { key: "activo", label: "Estado" },
  ];

  // "nombre" es obligatoria y no se puede ocultar
  const LOCKED_COLS = ["nombre"];

  const [visibleCols, setVisibleCols] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("productosCols");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Forzar columnas obligatorias
        for (const k of LOCKED_COLS) {
          if (!parsed.includes(k)) parsed.unshift(k);
        }
        return parsed;
      }
    }
    // Por defecto, "Código interno" arranca oculta (opt-in desde el selector de
    // columnas) para no ensanchar la tabla por defecto.
    return allColumns.map((c) => c.key).filter((k) => k !== "codigoInterno");
  });

  const handleVisibleColsChange = (next) => {
    // Nunca permitir quitar columnas obligatorias
    for (const k of LOCKED_COLS) {
      if (!next.includes(k)) next.unshift(k);
    }
    setVisibleCols(next);
  };

  useEffect(() => {
    localStorage.setItem("productosCols", JSON.stringify(visibleCols));
  }, [visibleCols]);

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  // Propiedad resuelta por el BACKEND (obtener) — no inferir en el front. Default
  // true para el alta; en edición viene del endpoint según dueño del producto.
  const [editFlags, setEditFlags] = useState({ puedeEditarCosto: true, puedeEditarBase: true });
  const [loadingEditar, setLoadingEditar] = useState(false);
  const [verCombo, setVerCombo] = useState(null); // Ver composición: { productoLocalId } | null

  // =========================================================
  // ESTADO IMPORT/EXPORT
  // =========================================================
  // Export
  const [expProveedorId, setExpProveedorId] = useState("");
  const [expCategoriaId, setExpCategoriaId] = useState("");
  const [expLoading, setExpLoading] = useState(false);

  // Import
  const [impModo, setImpModo] = useState("crear_actualizar");
  const [impFile, setImpFile] = useState(null);
  const [impPreview, setImpPreview] = useState(null);
  const [impResumen, setImpResumen] = useState(null);
  const [impLoading, setImpLoading] = useState(false);
  const [impResultado, setImpResultado] = useState(null);
  const [impError, setImpError] = useState("");
  const [impTab, setImpTab] = useState("errores"); // errores | correctos
  const [impPage, setImpPage] = useState(1);
  const IMP_PAGE_SIZE = 50;

  // =========================================================
  // FETCH CATALOGOS + LOCALES
  // =========================================================
  const fetchCatalogos = async () => {
    try {
      const [catRes, provRes, areaRes] = await Promise.all([
        fetch("/api/catalogos/categorias", { credentials: "include" }),
        fetch("/api/catalogos/proveedores", { credentials: "include" }),
        fetch("/api/catalogos/areas-fisicas", { credentials: "include" }),
      ]);

      if (catRes.status === 401 || provRes.status === 401 || areaRes.status === 401) {
        router.replace("/login");
        return;
      }

      const [cat, prov, area] = await Promise.all([
        catRes.json(),
        provRes.json(),
        areaRes.json(),
      ]);

      setCatalogos({
        CATEGORIAS: cat.items ?? [],
        PROVEEDORES: prov.items ?? [],
        AREAS: area.items ?? [],
      });
    } catch (err) {
      console.error("Error cargando catálogos:", err);
    }
  };

  // ── LOS DOS PEDIDOS NO ESPERAN AL CONTEXTO ────────────────────────────────
  //
  // Medido: al abrir la pantalla había una CASCADA de dos vueltas. Primero
  // `useContextoActivo` iba a buscar `/api/contexto-activo/get`, y recién cuando
  // volvía —porque `localId` pasaba de 0 a su valor— salían el listado y los
  // contadores. Dos viajes en serie donde alcanzaba uno.
  //
  // Lo que lo hace innecesario: **el servidor ya resuelve la ubicación solo.**
  // `resolveScope` sin `localId` explícito llama a `getContextoActivo`, que es
  // LA MISMA función que usa el endpoint del contexto y lee LA MISMA cookie. Un
  // usuario con local fijo ni siquiera pasa por ahí: sale de la sesión.
  //
  // Así que los dos pedidos salen de entrada, sin `localId`, y el servidor
  // contesta para la ubicación que corresponde. Cuando el contexto llega, se
  // compara contra el `localId` que la respuesta trae: si es el mismo —que es
  // siempre, salvo que alguien cambie de local en otra pestaña— no se vuelve a
  // pedir. Si difiere, se pide de nuevo y gana el dato bueno.
  //
  // Lo que NO se toca: el hook sigue existiendo y sigue siendo el que sabe si
  // hay que mostrar el selector de contexto. Esto no reemplaza esa decisión,
  // solo deja de esperarla para pedir datos.
  //
  // ── SE RECUERDA EL PEDIDO QUE SALIÓ, NO EL QUE VOLVIÓ ──────────────────
  //
  // La primera versión de este arreglo guardaba solo los pedidos ya CONTESTADOS,
  // y se pisaba sola. Medido en el log del servidor: el contexto tarda unos
  // milisegundos y el listado unos cientos, así que cuando `localId` cambia de 0
  // a su valor el pedido anticipado **todavía está viajando** — no hay nada
  // guardado, el efecto no ve motivo para saltear, y sale un segundo pedido
  // idéntico. En el log se veían los dos: uno sin `localId` y otro con él.
  //
  // O sea: el arreglo de la cascada, mal hecho, no la quita — la cambia por dos
  // pedidos en paralelo. Se ahorra la espera y se gasta el doble de servidor.
  //
  // Por eso se anota al SALIR. Y se guarda con qué se pidió:
  //
  //   · `localIdPedido: null`  → salió sin ubicación, así que el servidor la
  //     resuelve de la misma cookie que el contexto: sea cual sea el `localId`
  //     que llegue después, ese pedido ya está contestando por él;
  //   · `localIdPedido: N`     → salió por una ubicación concreta, y solo sirve
  //     si sigue siendo la misma.
  //
  // `localIdRespondido` es la red de seguridad: si el servidor contestó por otra
  // ubicación —la cookie cambió en otra pestaña entre los dos pedidos—, ahí sí se
  // vuelve a pedir. Es el único caso en el que los dos pueden diferir.
  //
  // La clave incluye página, orden y filtros: sin eso, comparar solo la ubicación
  // haría que un cambio de página se saltease por "ya salió", que es un listado
  // que deja de actualizarse.
  // La regla vive en `lib/productos/pedidoYaSalio.js`, que es puro y tiene sus
  // candados: acá adentro sería una condición de cuatro ramas imposible de
  // ejercer sin montar la pantalla entera.
  const pedidoRef = useRef(null);
  const controlesRef = useRef(null);
  const yaSalio = (ref, clave, localIdActual) =>
    pedidoYaSalio(ref.current, clave, localIdActual);

  const claveDelPedido = useMemo(
    () => JSON.stringify({ page, pageSize, sortKey, sortDir, filtros, control }),
    [page, pageSize, sortKey, sortDir, filtros, control]
  );

  const fetchProductos = async () => {
    setLoading(true);
    const claveDeEstePedido = claveDelPedido;
    // Se anota ANTES de salir: mientras viaja, nadie más tiene que volver a
    // pedir lo mismo. Ver el comentario largo de `pedidoRef`.
    pedidoRef.current = { clave: claveDeEstePedido, localIdPedido: localId || null };
    try {
      const params = new URLSearchParams({
        page,
        pageSize,
        sortKey,
        sortDir,
        q: filtros.search,
        categoriaId: filtros.categoria,
        proveedorId: filtros.proveedor,
        areaFisicaId: filtros.area,
        estado: filtros.estado || "activos",
        tipo: filtros.tipo || "todos",
      });
      // El `localId` va SOLO si ya se conoce. Mandarlo en 0 no es "sin dato":
      // `resolveScope` lo lee con `Number(...) || null`, así que el 0 cae en null
      // y termina resolviendo igual — pero deja la petición diciendo algo que no
      // es cierto, y el día que esa conversión cambie el catálogo saldría vacío.
      if (localId) params.set("localId", String(localId));
      // El control va aparte y solo si hay uno: `URLSearchParams` con un `null`
      // manda el texto "null", que el servidor descartaría por inválido pero
      // dejaría la intención sin registrar en la URL del pedido.
      if (control) params.set("control", control);

      const res = await fetch(`/api/productos/listar?${params.toString()}`, {
        credentials: "include",
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (data.ok) {
        // Para qué ubicación contestó. Un servidor viejo no manda `localId`: ahí
        // queda `null` y la comparación nunca dice "ya está", así que el peor caso
        // es volver a pedir una vez —el comportamiento anterior— y no mostrar el
        // catálogo de otro local.
        pedidoRef.current = {
          clave: claveDeEstePedido,
          localIdPedido: localId || null,
          localIdRespondido: Number(data.localId) || null,
        };
        setRows(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total);
        // Un servidor viejo no manda estos campos: `=== true` los deja en false,
        // que es el comportamiento anterior, en vez de dejarlos en `undefined`.
        setVendeConListaAlCosto(data.vendeConListaAlCosto === true);
        setListaAlCostoRedondea100(data.listaAlCostoRedondea100 === true);
        // El filtro por control clasifica en memoria con un techo. Si lo alcanzó,
        // el total es parcial y hay que decirlo: si no, la lista se ve completa.
        setListadoTruncado(data.truncadoPorControl === true);
      }
    } catch (err) {
      // Se borra la anotación: si el pedido no llegó, el próximo cambio de
      // dependencia tiene que poder volver a intentarlo. Dejarla puesta
      // convertiría un error de red en un listado que no se recupera nunca.
      pedidoRef.current = null;
      console.error("Error cargando productos:", err);
    }
    setLoading(false);
  };

  // ── LOS CONTADORES DE "PARA REVISAR" ────────────────────────────────────
  //
  // Pedido aparte del listado y no colgado de él, por dos motivos:
  //
  //   · el listado está PAGINADO y filtrado; el conteo es del catálogo entero de
  //     la ubicación. Sacarlo de `items` daría "los que faltan revisar entre
  //     estos 25", que no es lo que la card promete;
  //   · el conteo no cambia al pasar de página, así que atarlo al listado lo
  //     recalcularía en cada toque de paginador para dar el mismo número.
  //
  // Los dos comparten la MISMA clasificación en el servidor, así que el número de
  // la card y el total de la lista filtrada no se pueden separar.
  // El conteo no depende de la página ni de los filtros, así que su clave es
  // constante: lo único que lo invalida es cambiar de ubicación.
  const CLAVE_CONTROLES = "controles";

  const fetchControles = async () => {
    setCargandoControles(true);
    controlesRef.current = { clave: CLAVE_CONTROLES, localIdPedido: localId || null };
    try {
      // Igual que el listado: sin `localId` mientras no se conozca, y el servidor
      // lo resuelve de la cookie. Antes iba `?localId=0` mientras el contexto no
      // había llegado — y por eso este pedido no salía hasta que llegara.
      const res = await fetch(
        localId ? `/api/productos/controles?localId=${localId}` : "/api/productos/controles",
        { credentials: "include" }
      );
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      // ── UN ERROR NO SE DESCARTA EN SILENCIO ─────────────────────────────
      //
      // Si el servidor falla, las cards se quedan sin conteo Y se dice por qué.
      // Mostrar cuatro ceros sería peor que no mostrar nada: cuatro ceros
      // afirman que el catálogo está sano.
      if (data.ok) {
        controlesRef.current = {
          clave: CLAVE_CONTROLES,
          localIdPedido: localId || null,
          localIdRespondido: Number(data.localId) || null,
        };
        setControles(data.controles || []);
        // ── EL CONTEO PARCIAL SE PROPAGA, NO SE DESCARTA ────────────────
        //
        // El servidor ya mandaba `truncado` y esta pantalla lo tiraba. Con un
        // catálogo por encima del techo, las cards mostraban conteos parciales
        // —incluido un 0— con la misma cara que un resultado completo, o sea la
        // pantalla afirmando "está todo bien" sobre datos que no tiene.
        setControlesTruncado(data.truncado === true);
        setTechoControles(Number(data.techo) || null);
      } else {
        controlesRef.current = null;
        setControles([]);
        setControlesTruncado(false);
        console.error("productos/controles:", data.error);
      }
    } catch (err) {
      controlesRef.current = null;
      setControles([]);
      setControlesTruncado(false);
      console.error("Error cargando controles:", err);
    }
    setCargandoControles(false);
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  // La configuración de la tarjeta, después del primer render — ver el comentario
  // del `useState`. Se relee al cambiar de ubicación porque la clave es por local.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(claveDeConfiguracion(localId));
      setConfigTarjeta(normalizarConfiguracion(guardado ? JSON.parse(guardado) : null));
    } catch {
      setConfigTarjeta(configuracionPorDefecto());
    }
  }, [localId]);

  const guardarConfigTarjeta = (siguiente) => {
    setConfigTarjeta(siguiente);
    try {
      localStorage.setItem(claveDeConfiguracion(localId), JSON.stringify(siguiente));
    } catch {}
  };

  // ── SE PIDE DE ENTRADA, Y SE REPITE SOLO SI HACE FALTA ──────────────────
  //
  // Antes estos dos efectos arrancaban con `if (!localId) return;`, así que el
  // primer render no pedía nada y había que esperar la vuelta del contexto. Ver
  // el comentario largo arriba de `fetchProductos`.
  //
  // El guardia de ahora no es "todavía no sé la ubicación" sino "esto ya lo
  // contestó el servidor para esta ubicación". Con el contexto sin llegar
  // —`localId` en 0— no se salta nada y el pedido sale.
  useEffect(() => {
    if (yaSalio(pedidoRef, claveDelPedido, localId)) return;
    fetchProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDelPedido, localId]);

  useEffect(() => {
    if (yaSalio(controlesRef, CLAVE_CONTROLES, localId)) return;
    fetchControles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  useEffect(() => {
    if (nuevo === "1") {
      setEditing(null);
      setEditFlags({ puedeEditarCosto: true, puedeEditarBase: true }); // alta → ficha completa
      setModalOpen(true);
      return;
    }

    if (editarId) {
      const idNum = Number(editarId);
      if (!idNum || !localId) return;

      const cargar = async () => {
        try {
          setLoadingEditar(true);
          const r = await fetch(
            `/api/productos/obtener?id=${idNum}&localId=${localId}`,
            { credentials: "include" }
          );

          if (r.status === 401) {
            router.replace("/login");
            return;
          }

          const data = await r.json();

          if (data.ok) {
            setEditing(data.item);
            // Flags de propiedad resueltos por el backend (dueño del producto).
            setEditFlags({
              puedeEditarCosto: data.puedeEditarCosto !== false,
              puedeEditarBase: data.puedeEditarBase !== false,
            });
            setModalOpen(true);
          } else {
            // Producto de otro local (404) u otro error → no abrir el modal.
            alert(data.error || "No se pudo abrir el producto");
            router.push(buildListingUrl());
          }
        } catch (err) {
          console.error("Error al editar:", err);
        } finally {
          setLoadingEditar(false);
        }
      };

      cargar();
      return;
    }

    setModalOpen(false);
    setEditing(null);
  }, [nuevo, editarId, localId]);

  // Al volver de editar (hay scroll guardado): restaurar la posición de scroll y
  // CONSERVAR la selección. En una entrada fresca: limpiar la selección residual.
  // Se ejecuta una sola vez, cuando terminó el loading y la lista ya está en el DOM.
  useEffect(() => {
    if (loading || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    let savedY = null;
    try { savedY = sessionStorage.getItem("productos:scrollY"); } catch {}
    if (savedY != null) {
      const y = Number(savedY) || 0;
      // Doble rAF: esperar layout/paint para que la altura de la lista ya exista.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const sc = getProductosScrollEl();
          if (sc) sc.scrollTop = y;
        })
      );
      try { sessionStorage.removeItem("productos:scrollY"); } catch {}
    } else {
      // Entrada fresca al módulo: no conservar selección de sesiones previas.
      try { sessionStorage.removeItem("productos:selectedProductId"); } catch {}
    }
  }, [loading]);

  const cerrarModal = () => {
    setModalOpen(false);
    setEditing(null);
    router.push(buildListingUrl());
  };

  const handleSubmit = async (form) => {
    try {
      const isEdit = Boolean(editing);

      const url = isEdit
        ? `/api/productos/editar/${editing.id}?localId=${localId}`
        : `/api/productos/crear?localId=${localId}`;

      const res = await fetch(url, {
        credentials: "include",
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error guardando producto");
        return;
      }

      cerrarModal();
      fetchProductos();
    } catch (err) {
      console.error("Error guardando producto:", err);
    }
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar producto?")) return;

    try {
      const r = await fetch(`/api/productos/eliminar/${id}`, {
        credentials: "include",
        method: "DELETE",
      });

      if (r.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await r.json();

      if (data.ok) fetchProductos();
      else alert(data.error || "Error eliminando producto");
    } catch (err) {
      console.error("Error eliminando:", err);
    }
  };

  // Regla A: subir un producto propio del local al catálogo del depósito.
  const subirADeposito = async (baseId) => {
    if (
      !confirm(
        "¿Subir este producto al catálogo del depósito? Pasa a ser un producto del depósito y baja a todos los locales."
      )
    )
      return;
    try {
      const r = await fetch(`/api/productos/promover-a-deposito?localId=${localId}`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseId }),
      });
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await r.json();
      if (data.ok) fetchProductos();
      else alert(data.error || "No se pudo subir al depósito");
    } catch (err) {
      console.error("Error subiendo al depósito:", err);
    }
  };

  const abrirNuevo = () => {
    router.push("/modulos/productos/nuevo");
  };

  const abrirNuevoCombo = () => {
    router.push("/modulos/productos/nuevo-combo");
  };

  const abrirEditarCombo = (productoLocalId) => {
    if (!productoLocalId) return;
    router.push(`/modulos/productos/editar-combo/${productoLocalId}`);
  };

  const abrirVerComposicion = (row) => {
    if (row?.localProductoId) setVerCombo({ productoLocalId: row.localProductoId });
  };

  // Acción rápida: activar/desactivar un combo (solo ProductoLocal.activo).
  const toggleEstadoCombo = async (row) => {
    if (!row?.localProductoId) return;
    const activar = !row.activo;
    const verbo = activar ? "Activar" : "Desactivar";
    if (!confirm(`¿${verbo} el combo "${row.nombre}"?`)) return;
    try {
      const r = await fetch(`/api/combos/${row.localProductoId}/estado?localId=${localId}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: activar }),
      });
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await r.json();
      if (!data.ok) {
        alert(data.error || `No se pudo ${verbo.toLowerCase()} el combo`);
        return;
      }
      fetchProductos();
    } catch (err) {
      console.error("Error cambiando estado del combo:", err);
      alert(`No se pudo ${verbo.toLowerCase()} el combo`);
    }
  };

  const abrirActualizacionPrecios = () => {
    router.push("/modulos/productos/actualizacion-precios");
  };

  // ── TOCAR UNA CARD DE CONTROL FILTRA; TOCARLA DE NUEVO SACA EL FILTRO ────
  //
  // El mismo toque para las dos cosas, porque es el mismo botón: si apagar el
  // filtro estuviera en otro lado, el que lo prendió sin querer no sabría cómo
  // volver. La página vuelve a 1 porque el universo cambió — quedarse en la 7 de
  // un listado que ahora tiene 2 páginas muestra una lista vacía.
  //
  // ── Y LOS DEMÁS FILTROS SE LIMPIAN, QUE ES EL PUNTO ─────────────────────
  //
  // El criterio aprobado es literal: **el número de la card y el total del
  // listado filtrado tienen que coincidir**.
  //
  // La primera versión dejaba los filtros puestos y mostraba los dos números al
  // lado, confiando en que la diferencia se leyera. No alcanza: la card dice 47,
  // se toca, y el listado abre con 8 porque había un proveedor elegido de antes.
  // Los dos números pueden estar bien y aun así la pantalla queda mintiendo sobre
  // lo que esa card significa.
  //
  // Así que al activar un control se limpia todo lo que reduce el universo —la
  // búsqueda, categoría, proveedor, área, y estado y tipo vuelven a su valor por
  // defecto—, y la lista que se abre es EXACTAMENTE la población de la card.
  //
  // `estado` y `tipo` no son un detalle: el contador cuenta activos de las dos
  // clases, así que con "inactivos" elegido el total tampoco cerraría.
  //
  // ── Y SE DEVUELVEN AL APAGARLO ──────────────────────────────────────────
  //
  // Limpiar sin devolver convertiría el toque en algo que hay que pensar antes:
  // quien filtró por un proveedor y toca una card por curiosidad perdería el
  // trabajo. Se guardan y se reponen.
  //
  // Al apagarlo se devuelven, para que el toque no cueste el trabajo de quien
  // venía filtrando por un proveedor y tocó una card por curiosidad.
  const alternarControl = (id) => {
    const apagando = control === id;
    setPage(1);

    if (apagando) {
      setControl(null);
      const guardados = filtrosAntesDelControlRef.current;
      filtrosAntesDelControlRef.current = null;
      // Con el invariante, mientras el control estuvo activo los filtros no
      // pudieron cambiar, así que reponer es siempre correcto. La comprobación
      // queda igual: si algún día aparece un cuarto camino que los mueva, esto
      // no pisa lo que la persona haya elegido.
      if (guardados && mismosFiltros(filtros, filtrosNeutros())) {
        setFiltros(guardados);
      }
      return;
    }

    // Cambiar de una card a otra no vuelve a guardar: lo guardado es lo que había
    // ANTES de entrar a los controles, y sobrescribirlo con los filtros neutros
    // perdería los originales.
    if (filtrosAntesDelControlRef.current === null) {
      filtrosAntesDelControlRef.current = filtros;
    }
    setControl(id);
    if (hayFiltrosPuestos(filtros)) setFiltros(filtrosNeutros());
  };

  // ── TOCAR UN FILTRO CON UN CONTROL ACTIVO LO APAGA ──────────────────────
  //
  // El tercer camino, y el que faltaba. Limpiar al ENTRAR cubría el toque de la
  // card y nada más: el buscador y la hoja de filtros seguían editables con el
  // control puesto, y ahí la card volvía a contar el catálogo entero mientras el
  // listado pasaba a ser un subconjunto. El criterio del issue se rompía sin que
  // nada avisara.
  //
  // Las dos salidas posibles eran bloquear los filtros mientras hay un control, o
  // que el filtro gane y apague el control. Se eligió la segunda: bloquear
  // controles deja a la persona atrapada —tiene que darse cuenta de que primero
  // hay que apagar la card— y en un celular eso se lee como una pantalla trabada.
  // Así, escribir en el buscador simplemente vuelve al catálogo completo, que es
  // lo que esa persona está pidiendo al escribir.
  //
  // Lo guardado se DESCARTA: la persona eligió otro camino, y devolverle después
  // unos filtros viejos encima de los que acaba de poner sería la sorpresa al
  // revés.
  const aplicarFiltros = (nuevos) => {
    setPage(1);
    if (control !== null) {
      setControl(null);
      filtrosAntesDelControlRef.current = null;
    }
    setFiltros(nuevos);
  };

  // El buscador del celular, en un solo lugar: lo usan la ranura de teclear y
  // la de dictar, que acá tienen que hacer exactamente lo mismo. Pasar dos
  // funciones "iguales" escritas al lado es cómo empiezan a no serlo.
  const alBuscarEnElCelular = (texto) => aplicarFiltros({ ...filtros, search: texto });

  // ── MARCAR COMO REVISADOS LOS DE ESTA PÁGINA ─────────────────────────────
  //
  // Confirma un precio SIN cambiarlo. Es la contraparte del control de los 30
  // días: la conclusión más común al mirar un precio viejo es que sigue estando
  // bien, y sin esto la única forma de sacarlo de la lista sería cambiarle el
  // importe — o sea, tocar un precio para que deje de avisar.
  //
  // Actúa sobre LO QUE SE ESTÁ VIENDO y no sobre todo el catálogo. "Revisado" es
  // una afirmación de una persona sobre unos precios que miró; un botón que
  // marcara los 2.600 de una vez la convertiría en una firma en blanco, y el
  // control quedaría decorativo desde el primer toque.
  const marcarRevisados = async () => {
    const ids = rows.map((p) => p.id ?? p.productoLocalId).filter(Boolean);
    if (ids.length === 0) return;
    setMarcandoRevisado(true);
    try {
      const res = await fetch("/api/productos/precio-revisado", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoBaseIds: ids, localId: localId || null }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "No se pudieron marcar los precios como revisados");
        return;
      }
      // Los dos números se rehacen: el listado —porque estas filas dejan de
      // estar marcadas— y el conteo de las cards. Si solo se rehiciera uno, la
      // card diría 47 sobre una lista de 22.
      await Promise.all([fetchProductos(), fetchControles()]);
    } catch (err) {
      console.error("Error marcando precios revisados:", err);
      alert("No se pudieron marcar los precios como revisados");
    } finally {
      setMarcandoRevisado(false);
    }
  };

  // ── "VER" YA TIENE SU PANTALLA ──────────────────────────────────────────
  //
  // Hasta este commit "Ver" y "Editar" llevaban al MISMO lado, porque no existía
  // ninguna pantalla de ver producto en todo el ERP. Ahora existe:
  // `app/modulos/productos/[id]/page.jsx`, de sólo lectura.
  //
  // EL ID SE VALIDA IGUAL QUE EN EDITAR. El que espera la pantalla es el de
  // `ProductoBase`, y `p.productoLocalId` es otro número: si se colara, la ficha
  // pediría un producto que no es, o ninguno.
  const abrirVer = (id) => {
    if (!id || Number.isNaN(Number(id))) {
      alert("Error: ID de producto inválido");
      return;
    }
    const qs = buildListingUrl().split("?")[1] || "";
    router.push(`/modulos/productos/${Number(id)}${qs ? `?${qs}` : ""}`);
  };

  const abrirEditar = (id) => {
    if (!id || id === 0 || id === "0" || Number.isNaN(Number(id))) {
      alert("Error: ID de producto inválido");
      return;
    }
    // Marcar el producto abierto y guardar la posición de scroll (del <main>),
    // para restaurar el contexto al volver del editor. La página viaja en la URL.
    setSelectedProductId(Number(id));
    try {
      const sc = getProductosScrollEl();
      sessionStorage.setItem("productos:scrollY", String(sc ? sc.scrollTop : 0));
      sessionStorage.setItem("productos:selectedProductId", String(Number(id)));
    } catch {}
    // Pasar query del listado para poder volver al mismo contexto
    const listingUrl = buildListingUrl();
    const qs = listingUrl.includes("?") ? listingUrl.split("?")[1] : "";
    const editUrl = `/modulos/productos/${Number(id)}/editar${qs ? `?${qs}` : ""}`;
    router.push(editUrl);
  };

  // =========================================================
  // EXPORT: Descargar Excel
  // =========================================================
  const handleExport = async () => {
    setExpLoading(true);
    try {
      const res = await fetch("/api/productos/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: localId || null,
          proveedorId: expProveedorId ? Number(expProveedorId) : null,
          categoriaId: expCategoriaId ? Number(expCategoriaId) : null,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al exportar");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const hoy = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `productos_${hoy}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exportando:", err);
      alert("Error al exportar productos");
    }
    setExpLoading(false);
  };

  // =========================================================
  // IMPORT: Leer archivo Excel y hacer preview
  // =========================================================
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImpFile(file);
    setImpPreview(null);
    setImpResumen(null);
    setImpResultado(null);
    setImpError("");

    if (!localId) {
      setImpError("No hay contexto operativo activo");
      return;
    }

    setImpLoading(true);
    try {
      // Leer Excel
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (jsonData.length === 0) {
        setImpError("El archivo está vacío");
        setImpLoading(false);
        return;
      }

      // Validar columnas mínimas
      const cols = Object.keys(jsonData[0]);
      const requeridas = ["codigo_barra", "nombre", "precio_costo", "precio_venta"];
      const faltantes = requeridas.filter((r) => !cols.includes(r));
      if (faltantes.length > 0) {
        setImpError(`Columnas faltantes: ${faltantes.join(", ")}`);
        setImpLoading(false);
        return;
      }

      // Enviar al preview
      const res = await fetch("/api/productos/import/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: Number(localId),
          modo: impModo,
          productos: jsonData,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        setImpError(data.error || "Error en preview");
      } else {
        setImpPreview(data.items);
        setImpResumen(data.resumen);
      }
    } catch (err) {
      console.error("Error parseando archivo:", err);
      setImpError("Error al leer el archivo Excel");
    }
    setImpLoading(false);
  };

  // =========================================================
  // IMPORT: Confirmar importación
  // =========================================================
  const handleImportConfirm = async () => {
    if (!impPreview || !localId) return;

    // Filtrar solo crear y actualizar
    const productosValidos = impPreview.filter(
      (p) => p.accion === "crear" || p.accion === "actualizar"
    );

    if (productosValidos.length === 0) {
      setImpError("No hay productos válidos para importar");
      return;
    }

    setImpLoading(true);
    setImpResultado(null);
    try {
      const res = await fetch("/api/productos/import/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: Number(localId),
          modo: impModo,
          productos: productosValidos,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        setImpError(data.error || "Error al importar");
      } else {
        setImpResultado(data);
        setImpPreview(null);
        setImpResumen(null);
        setImpFile(null);
        // Refrescar productos
        fetchProductos();
      }
    } catch (err) {
      console.error("Error importando:", err);
      setImpError("Error al importar productos");
    }
    setImpLoading(false);
  };

  // Reset import
  const resetImport = () => {
    setImpFile(null);
    setImpPreview(null);
    setImpResumen(null);
    setImpResultado(null);
    setImpError("");
  };

  // Preview: separar errores y correctos, paginar client-side
  const impErrorRows = useMemo(() => {
    if (!impPreview) return [];
    return impPreview.filter((r) => r.accion === "error");
  }, [impPreview]);

  const impOkRows = useMemo(() => {
    if (!impPreview) return [];
    return impPreview.filter((r) => r.accion === "crear" || r.accion === "actualizar");
  }, [impPreview]);

  const impActiveList = impTab === "errores" ? impErrorRows : impOkRows;
  const impTotalPages = Math.max(1, Math.ceil(impActiveList.length / IMP_PAGE_SIZE));
  const impPagedRows = impActiveList.slice(
    (impPage - 1) * IMP_PAGE_SIZE,
    impPage * IMP_PAGE_SIZE
  );

  // Reset page when tab changes
  useEffect(() => {
    setImpPage(1);
  }, [impTab]);

  // Descargar errores como Excel
  const descargarErroresExcel = () => {
    if (impErrorRows.length === 0) return;
    const data = [];
    for (const row of impErrorRows) {
      if (row.erroresDetalle && row.erroresDetalle.length > 0) {
        for (const err of row.erroresDetalle) {
          data.push({
            fila: row.fila,
            codigo_barra: row.codigo_barra || "",
            nombre: row.nombre || "",
            campo: err.field,
            error: err.message,
          });
        }
      } else {
        data.push({
          fila: row.fila,
          codigo_barra: row.codigo_barra || "",
          nombre: row.nombre || "",
          campo: "",
          error: row.motivoError || "",
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errores");
    XLSX.writeFile(wb, `errores_importacion_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Descargar errores en formato reparable (misma plantilla para re-subir)
  const descargarErroresReparable = () => {
    if (impErrorRows.length === 0) return;
    const PLANTILLA_COLS = [
      "codigo_barra", "nombre", "unidad_medida", "factor_pack",
      "precio_costo", "precio_venta", "margen",
      "categoria", "proveedor", "area_fisica",
      "stock_inicial", "activo",
    ];
    const data = impErrorRows.map((row) => {
      const obj = {};
      for (const col of PLANTILLA_COLS) {
        const v = row[col];
        obj[col] = v != null && v !== "" ? String(v) : "";
      }
      // Columna activo: convertir boolean a texto
      if (typeof row.activo === "boolean") {
        obj.activo = row.activo ? "SI" : "NO";
      }
      // Columnas extra de error al final
      const errores = row.erroresDetalle || [];
      obj.error_campos = [...new Set(errores.map((e) => e.field))].join(" | ");
      obj.error_mensajes = errores.map((e) => `${e.field}: ${e.message}`).join("; ");
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = PLANTILLA_COLS.map(() => ({ wch: 16 })).concat([{ wch: 20 }, { wch: 50 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errores");
    XLSX.writeFile(wb, `errores_corregir_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ── LO QUE LA TARJETA MUESTRA, RESUELTO UNA VEZ POR RENDER ──────────────
  //
  // Y no adentro del `map`: son las mismas cinco respuestas para las 25 filas.
  // Resolverlas por fila sería normalizar la configuración veinticinco veces
  // para obtener veinticinco veces lo mismo.
  // Cinco preguntas booleanas y ninguna de orden: "Personalizar card" prende y
  // apaga, y la posición de cada dato la define el diseño.
  const muestraProveedor = campoVisible(configTarjeta, CAMPO.PROVEEDOR);
  const muestraCosto = campoVisible(configTarjeta, CAMPO.COSTO);
  const muestraMargen = campoVisible(configTarjeta, CAMPO.MARGEN);
  const muestraCodigoBarra = campoVisible(configTarjeta, CAMPO.CODIGO_BARRA);
  const muestraCodigoInterno = campoVisible(configTarjeta, CAMPO.CODIGO_INTERNO);

  // El control que está filtrando, ya con su título — para el chip de contexto.
  // Sale de la lista que mandó el servidor y no de una copia local: si el
  // servidor agrega un quinto control, el chip lo nombra bien sin tocar esto.
  const controlActivo = controles.find((c) => c.id === control) ?? null;

  // Cuántos filtros hay puestos, sin contar la búsqueda —que se ve escrita en su
  // propio campo— ni el estado en su valor de siempre.
  // Cuántos filtros hay puestos, para el globito del botón. La búsqueda no
  // cuenta: se ve escrita en su propio campo, al lado.
  //
  // Los valores por defecto salen de `filtrosNeutros`, la MISMA función que usa
  // `alternarControl` para limpiar. Estaban escritos a mano acá —"activos",
  // "todos"— y eso es un default definido en dos lugares: el día que cambie uno,
  // el globito contaría un filtro que no está puesto.
  const neutros = filtrosNeutros();
  const filtrosActivos = CLAVES_DE_FILTRO.filter(
    (k) => k !== "search" && (filtros[k] ?? "") !== neutros[k]
  ).length;

  // =========================================================
  // RENDER
  // =========================================================
  if (cargandoProd || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }
  if (!puedeProd) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      {/* ── EN EL CELULAR EL MÓDULO NO VA ADENTRO DE UNA TARJETA ────────────
          `contents` es `display: contents`: el elemento NO genera caja, así que
          su fondo, su borde, su sombra, su relleno y su `backdrop-blur` no se
          dibujan, y los hijos pasan a ser hijos del contenedor de la página. De
          `md` para arriba vuelve a `block`, que es lo que un `div` es por
          defecto — o sea que de 768 px para arriba no cambia UN PÍXEL.

          ── POR QUÉ ASÍ Y NO MOVIENDO EL ÁRBOL ──────────────────────────────

          Las dos alternativas eran peores y se descartaron con su motivo:

          · dibujar el árbol dos veces —uno `md:hidden` y otro `hidden md:block`—
            duplica el DOM entero, y con él los `id`, los campos del formulario y
            el foco. Dos copias del mismo filtro escribiendo el mismo estado es
            la clase de cosa que anda hasta que una se desincroniza.

          · pasarle clases a `SunmiCard` para que "apague" su fondo en el celular
            no funciona: la pieza filtra su token de fondo en cuanto la pantalla
            declara uno, así que apagarlo abajo lo apagaría también arriba, y
            reponerlo con `md:bg-...` obligaría a escribir a mano el color del
            tema — catorce veces mal.

          De regalo se va el problema del `backdrop-filter`, que crea bloque
          contenedor para los `position: fixed` de adentro: sin caja no hay
          filtro, así que en el celular ninguna capa se puede desalinear por eso. */}
      <SunmiCard className="contents md:block">
        <div className="flex flex-col gap-2">

          {/* =========================================================
              TABS
              =========================================================
              ── EN EL CELULAR NO SE VEN MIENTRAS SE ESTÁ EN EL LISTADO ──
              La decisión aprobada para el celular deja tres acciones a la vista
              —+ Producto, Filtros, Más— y manda Import / Export adentro de
              "Más". Con la fila de tabs también visible, ese acceso quedaba
              DUPLICADO y en dos lugares distintos de la pantalla.

              Por qué no se esconde siempre: sin las tabs, quien entra a
              Import / Export desde "Más" no tiene forma de volver al listado.
              Así que aparecen justamente ahí, que es donde hacen falta y donde
              ya no duplican nada.

              De `md` para arriba no cambia nada: `md:flex` es lo que la fila
              tenía. */}
          <div
            className={`${
              activeTab === "listado" ? "hidden md:flex" : "flex"
            } gap-1 border-b sunmi-divider pb-1`}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  px-4 py-1.5 rounded-t-md text-[13px] font-medium transition-all
                  ${activeTab === tab.key
                    ? "sunmi-badge-accent"
                    : "sunmi-control"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* =========================================================
              TAB: LISTADO (existente)
              ========================================================= */}
          {activeTab === "listado" && (
            <>
              {/* ── 2 · PARA REVISAR ─────────────────────────────────────────
                  Va ARRIBA DE TODO lo operativo y no al final: es lo único de
                  esta pantalla que dice qué HAY QUE HACER. Debajo del buscador
                  quedaría después de la acción que la mayoría hace por reflejo
                  —escribir un nombre— y nadie lo vería nunca. */}
              <div className="md:hidden">
                <CarruselControles
                  controles={controles}
                  activo={control}
                  onSelect={alternarControl}
                  cargando={cargandoControles}
                  truncado={controlesTruncado}
                  techo={techoControles}
                />
              </div>

              {/* ── 3 · EL BUSCADOR, SUELTO ──────────────────────────────────
                  En el celular el buscador sale del bloque de filtros y queda a
                  la vista: de los seis filtros que hay, es el único que se usa
                  en casi todas las visitas. Los otros cinco viven en la hoja de
                  "Filtros", que es el botón de al lado.

                  Escribe el MISMO estado `filtros.search` que el buscador de
                  escritorio, así que no hay dos búsquedas que puedan discrepar:
                  es el mismo dato con dos entradas.

                  ── Y ES EL MISMO CAMPO QUE EL DEL POS ─────────────────────
                  La pieza es `SunmiCampoBusquedaVoz`, la que ya usaba el POS:
                  mismo alto, mismo borde de acento, mismo ícono, mismo
                  micrófono y mismo "Escuchando...". No es un campo parecido
                  escrito al lado — es el mismo, y por eso no pueden divergir.

                  DICTAR ES EXACTAMENTE ESCRIBIR ACÁ, y por eso las dos ranuras
                  reciben la MISMA función. En el POS no es así —allá la voz
                  viaja con `fromVoice` para que el servidor devuelva cómo
                  interpretó lo dictado—, y esa diferencia queda a la vista en
                  el llamado en vez de escondida adentro de la pieza. */}
              <div className="md:hidden">
                <SunmiCampoBusquedaVoz
                  value={filtros.search}
                  // Por `aplicarFiltros`, que apaga el control si había uno:
                  // buscar con una card activa rompía el criterio del issue.
                  onChange={alBuscarEnElCelular}
                  onVoz={alBuscarEnElCelular}
                  placeholder="Buscar por nombre o código"
                  ariaLabel="Buscar productos"
                />
              </div>

              {/* ── 4 · LAS TRES ACCIONES DEL CELULAR ────────────────────────
                  A 390 px entran tres botones legibles en una fila. Antes había
                  CUATRO apilados en columna —`flex-col md:flex-row`—, o sea
                  cuatro renglones de botón antes del primer producto.

                  Las tres que quedan son las que se usan todos los días. El
                  resto está en "Más", con su hoja. */}
              <div className="md:hidden grid grid-cols-3 gap-1.5">
                <SunmiButton color="amber" onClick={abrirNuevo} className="w-full">
                  + Producto
                </SunmiButton>
                <SunmiButton
                  color="slate"
                  onClick={() => setHojaFiltros(true)}
                  className="w-full"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                    Filtros
                    {/* CUÁNTOS FILTROS HAY PUESTOS, en el botón. Sin esto, un
                        filtro olvidado adentro de la hoja explica una lista corta
                        sin que nada lo diga desde afuera. */}
                    {filtrosActivos > 0 && (
                      <span
                        className="min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-center"
                        style={{
                          background: "var(--pos-accent)",
                          color: "var(--pos-panel-bg)",
                        }}
                      >
                        {filtrosActivos}
                      </span>
                    )}
                  </span>
                </SunmiButton>
                <SunmiButton
                  color="slate"
                  onClick={() => setHojaMas(true)}
                  className="w-full"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                    Más
                  </span>
                </SunmiButton>
              </div>

              {/* ── 5 · LA LÍNEA DE CONTEXTO ────────────────────────────────
                  Cuántos productos se están viendo y por qué. Cuando hay un
                  control filtrando, lo dice CON SU NOMBRE y con la forma de
                  sacarlo: un listado filtrado que no explica por qué está
                  filtrado se lee como un catálogo que perdió productos.

                  Y con el control puesto este número tiene que ser EL MISMO que
                  el de la card. Lo garantiza `alternarControl`, que limpia los
                  demás filtros al activarlo: sin eso los dos números podían
                  diferir y la card quedaba prometiendo una población que la
                  lista no muestra. */}
              <div className="md:hidden flex items-center gap-2 flex-wrap min-h-[24px]">
                <span className="text-[11px] sunmi-text-muted [font-variant-numeric:tabular-nums]">
                  {loading
                    ? "Cargando…"
                    : /* Con el filtro truncado el total tampoco es el total: lleva
                         "+" por lo mismo que las cards. */
                      `${listadoTruncado ? "+" : ""}${totalItems} producto${
                        totalItems === 1 ? "" : "s"
                      }`}
                </span>
                {/* ── EL CHIP SE RETIRÓ, Y ESTO ES LO QUE QUEDÓ ────────────
                    Acá había un chip con borde de acento, una ✕ y el nombre del
                    control, y era LA señal de que el listado estaba filtrado: la
                    card que se había tocado casi no cambiaba, así que el estado
                    vivía a un bloque de distancia del elemento que lo había
                    producido.

                    Ahora la señal es la CARD: se tiñe, se le enciende el anillo y
                    su renglón de abajo pasa a decir cómo se sale. Lo que queda
                    acá es texto y no un control: dice POR QUÉ el número es ése
                    —"2.361 productos · Precios +30 días"— sin competir con la
                    card por ser el botón de quitar.

                    Ese "por qué" no sobra: sin él, un catálogo de 2.600 que
                    muestra 3 se lee como un catálogo que perdió productos. */}
                {controlActivo && (
                  <span className="text-[11px] sunmi-text-muted">
                    · {controlActivo.titulo} {controlActivo.detalle}
                  </span>
                )}
                {/* MARCAR REVISADOS: solo con el control de los 30 días puesto.
                    Fuera de ese contexto no significa nada —"revisado" contesta
                    a "hace más de 30 días que nadie lo mira"— y sería un botón
                    escribiendo una fecha sin motivo. */}
                {control === CONTROL.PRECIO_VENCIDO && rows.length > 0 && (
                  <SunmiButton
                    color="slate"
                    onClick={marcarRevisados}
                    disabled={marcandoRevisado}
                    className="ml-auto text-[11px] disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      {marcandoRevisado ? "Marcando…" : `Marcar ${rows.length} revisados`}
                    </span>
                  </SunmiButton>
                )}
              </div>

              {/* FILTROS — de escritorio. En el celular viven en la hoja, y son
                  EL MISMO componente con el mismo `onChange`: no hay dos bloques
                  de filtros que puedan interpretar distinto lo mismo. */}
              <div className="hidden md:block">
                <SunmiSeparator label="Filtros" className="my-1" />
              </div>

              <div className="hidden md:block">
              <FiltrosProductos
                initial={filtros}
                catalogos={catalogos}
                // `aplicarFiltros` resuelve las dos cosas: vuelve a la página 1 y
                // apaga el control si había uno. `mismosFiltros` reemplaza a la
                // comparación campo por campo que estaba escrita acá —y otra vez
                // más abajo, en la hoja del celular—, que es un default de
                // "cambió" definido en dos lugares.
                onChange={(f) => {
                  if (!mismosFiltros(f, filtros)) aplicarFiltros(f);
                }}
              />
              </div>

              {/* ACCIONES — de escritorio. En el celular son las tres de arriba
                  más la hoja de "Más". "Edición rápida" se fue del sistema: la
                  pantalla y su componente se borraron en esta misma tanda. */}
              <div className="hidden md:flex flex-row items-center justify-between gap-2 w-full mt-1">
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <SunmiButton color="amber" onClick={abrirNuevo}>
                    + Producto
                  </SunmiButton>
                  <SunmiButton color="amber" onClick={abrirNuevoCombo}>
                    + Combo
                  </SunmiButton>
                  <SunmiButton color="cyan" onClick={abrirActualizacionPrecios}>
                    Actualización de precios
                  </SunmiButton>
                </div>

                <ColumnManager
                  allColumns={allColumns}
                  visibleKeys={visibleCols}
                  onChange={handleVisibleColsChange}
                  lockedKeys={LOCKED_COLS}
                />
              </div>

              {/* LISTADO — el separador es de escritorio. En el celular la línea
                  de contexto de arriba ya dice qué se está viendo, y un
                  separador más sería un renglón que empuja las tarjetas. */}
              <div className="hidden md:block">
                <SunmiSeparator label="Listado" className="my-1" />
              </div>

              {/* ── ANGOSTO: TARJETAS. ANCHO: LA TABLA DE SIEMPRE ──────────
                  El corte es `md` (768 px), y no es un número elegido acá: es el
                  que este repo YA usa para exactamente este problema en reportes
                  de ventas y en transferencias —`md:hidden` para las tarjetas,
                  `hidden md:block` para la tabla—. Inventar otro haría que la
                  misma aplicación cambiara de forma a anchos distintos según la
                  pantalla en la que uno esté.

                  De escritorio para arriba NO CAMBIA NADA: la tabla es la misma
                  y su huella de la línea de base, tomada a 1366, tiene que seguir
                  dando cero. */}
              {/* ── POR QUÉ GRID Y NO UNA COLUMNA FLEX ────────────────────
                  `auto-rows-fr` le da a TODAS las filas el alto de la más alta,
                  así que las tarjetas quedan todas iguales sin recortar ningún
                  nombre —que es una decisión ya tomada: los nombres reales son
                  largos y recortarlos esconde justo lo que distingue un producto
                  de otro—. El sobrante de las más cortas se va entre la
                  equivalencia y el pie, porque el pie lleva `mt-auto`, así que
                  los pies quedan alineados de tarjeta a tarjeta.

                  Medido antes de esto: dos alturas conviviendo, 191,9 y 211,4 —
                  exactamente una línea de nombre de diferencia. */}
              <div className="md:hidden mt-1">
                <div className="grid grid-cols-1 auto-rows-fr gap-[9px]">
                {rows.map((p) => {
                  // ── LA ESCALA EN LA QUE SE VENDE, NO EN LA QUE SE GUARDA ──
                  //
                  // Una sola pregunta por fila, y la contesta la misma pieza que
                  // usa el POS. De acá salen las TRES cosas que antes se decidían
                  // por separado y podían contradecirse: el número grande, su
                  // rótulo y si la equivalencia repite el unitario.
                  const escalaVenta = escalaDeVentaDe(p, esDepositoProd);

                  // ── EL COSTO EN LA ESCALA YA NO SE CALCULA ACÁ ──────────
                  //
                  // Había un `enEscala` local y un `costoEnEscala`: UN costo, el
                  // de la escala de venta. Con dos caras eso no alcanza —el dorso
                  // necesita el suyo, en la escala de referencia— y tener uno solo
                  // habría puesto un costo por bulto al lado de un precio
                  // unitario, que es una comparación al revés.
                  //
                  // Los dos los arma `carasDeTarjeta`, con la misma función y sin
                  // redondeo comercial: el costo no se cobra, se paga.

                  // ── EL NÚMERO GRANDE ES LO QUE COBRA EL POS ─────────────
                  //
                  // Y en el depósito el POS cobra el COSTO, porque la lista de
                  // esa ubicación es al costo. Hasta esta tanda la tarjeta
                  // mostraba `precio_venta` igual: 2.021 de 2.047 filas con un
                  // número que el mostrador no cobra, y con un porcentaje de
                  // ganancia al lado que ahí no existe.
                  //
                  // Quién contesta la pregunta: el servidor, con el mismo
                  // resolver del POS. La tarjeta no la deduce de `esDeposito`,
                  // porque lo que decide es la lista configurada — un depósito
                  // sin lista al costo cobraría su precio de venta, y este
                  // bloque lo mostraría bien sin tocar una línea.
                  //
                  // El REDONDEO sigue a quien manda en cada caso: la venta lleva
                  // el del producto, y el costo bajo lista lleva el de la LISTA,
                  // que es lo que el POS aplica. Hoy esa lista no redondea.
                  //
                  // ── UN SOLO PRECIO EFECTIVO, Y DE ACÁ SALEN LOS DOS ──────
                  //
                  // El número grande y la línea de equivalencia tienen que salir
                  // de la MISMA fuente. Hasta acá no lo hacían: el número grande
                  // ya elegía entre costo y venta, y la equivalencia recibía
                  // siempre `p.precioVenta`.
                  //
                  // En el depósito —que vende con lista al costo— eso ponía dos
                  // números incompatibles en la misma tarjeta. Medido sobre
                  // `361 LATA X24`: arriba "$24.500,00 por bulto", que es el
                  // COSTO, y abajo "1 pack = 24 un · $1.400,00 por unidad", que
                  // sale de la VENTA de 31.900 redondeada por unidad. 24 × 1.400
                  // da 33.600, y el de arriba dice 24.500. Los dos números están
                  // bien por separado y juntos no cierran, que es la peor forma:
                  // el que mira la tarjeta para controlar un precio no tiene cómo
                  // saber cuál de los dos mirar.
                  //
                  // Por eso `precioBaseDelPos` y `redondeoDelPos` se deciden UNA
                  // vez y los consume todo lo que muestre ese precio. La rama
                  // desaparece: con `vendeConListaAlCosto` en false esto da
                  // exactamente lo que daba antes.
                  const precioBaseDelPos = vendeConListaAlCosto ? p.precioCosto : p.precioVenta;
                  const redondeoDelPos = vendeConListaAlCosto
                    ? listaAlCostoRedondea100
                    : p.redondeo100;

                  // ── LAS DOS CARAS, DE UNA SOLA PASADA POR FILA ──────────
                  //
                  // `carasDeTarjeta` no consulta nada ni decide precios: le pide
                  // a `valorEnLaEscalaDeVenta` —la misma que ya usaba esta
                  // pantalla— el importe de cada escala y arma las dos caras.
                  // Dar vuelta una tarjeta después no cuesta ni un pedido.
                  const caras = carasDeTarjeta({
                    escala: escalaVenta,
                    precio: precioBaseDelPos,
                    // ── EL COSTO TAMBIÉN VIAJA, Y POR CARA ────────────────
                    //
                    // Cada cara muestra el costo EN SU ESCALA: el frente en la de
                    // venta, el dorso en la de referencia. Si el dorso se quedara
                    // con el costo del frente, pondría un costo por bulto al lado
                    // de un precio unitario — una comparación al revés, que hace
                    // parecer sano lo que está mal.
                    //
                    // La conversión la hace `carasDeTarjeta` con la misma función
                    // de siempre; acá solo se le pasa el valor guardado.
                    costo: p.precioCosto,
                    redondeo100: redondeoDelPos,
                    factor: p.factorPack,
                    unidad: p.unidadMedida,
                    pesoReferenciaKg: p.pesoReferenciaKg,
                    esCombo: p.esCombo,
                  });
                  return (
                  <TarjetaProductoMovil
                    key={p.id ?? p.productoLocalId}
                    nombre={p.nombre}
                    // `false` es "esta pantalla no lo muestra" y `null` es "no
                    // hay dato": la tarjeta los dibuja al revés —el segundo deja
                    // el renglón diciendo qué falta— así que la distinción no se
                    // puede perder acá.
                    empresa={muestraProveedor ? p.proveedorNombre ?? null : false}
                    caras={caras}
                    codigoBarra={muestraCodigoBarra ? p.codigoBarra ?? p.sku ?? null : false}
                    // ── ACÁ IBA EL ID DEL PRODUCTO, Y ERA UN DEFECTO ────────
                    //
                    // Decía `p.id ?? p.productoLocalId`, o sea la clave primaria
                    // de la tabla, rotulada "Cod. int.". En la captura de
                    // revisión se ve: `361 LATA X24` mostraba "Cod. int. 2023",
                    // que es su id y no un código de nadie.
                    //
                    // No era un dato "aproximado": era un número técnico
                    // presentado como un código comercial, en las 2.600 filas.
                    // Quien lo cotejara contra una lista del proveedor no iba a
                    // encontrar nada, y no tenía cómo saber por qué.
                    //
                    // El dato correcto ya venía en la respuesta del listado:
                    // `p.codigoInterno`, que el servidor saca de
                    // `ProductoCodigoProveedor` prefiriendo el del proveedor
                    // principal. No hace falta ninguna consulta nueva.
                    //
                    // Y no se cae a nada: sin código del proveedor, la tarjeta
                    // dice "Sin cód. prov.". El SKU no sirve de reemplazo —es
                    // otro concepto, del negocio propio— y el id menos.
                    codigoInterno={muestraCodigoInterno ? p.codigoInterno ?? null : false}
                    // ── EL COSTO VA EN LAS DOS CARAS, CADA UNO EN SU ESCALA ─
                    //
                    // La pantalla ya no arma el bloque: pasa el DATO —si el costo
                    // se muestra— y el envoltorio lo dibuja con el valor que
                    // corresponde a la cara. El costo por cara sale de
                    // `carasDeTarjeta`, arriba.
                    //
                    // Antes se armaba acá con `costoEnEscala`, que era UNO SOLO:
                    // el de la escala de venta. En el dorso ese número quedaría al
                    // lado de un precio de otra escala — un costo por bulto contra
                    // un precio unitario, que es una comparación al revés.
                    //
                    // ── DONDE SE VENDE AL COSTO NO VA NINGUNO DE LOS DOS ────
                    //
                    // Y esa regla NO cambió, en ninguna de las caras:
                    //
                    // · el PORCENTAJE, porque no hay margen que mostrar. Vender al
                    //   costo es no tener ganancia, y un "30 %" al lado del precio
                    //   afirma una que no existe. Es propiedad del LUGAR, no del
                    //   permiso de quien mira.
                    //
                    // · la línea "Costo", porque el número grande YA es el costo.
                    //   Dejarla sería escribir el mismo número dos veces.
                    muestraCosto={
                      muestraCosto && !esProductoServicio(p) && !vendeConListaAlCosto
                    }
                    // ── LA REGLA DE GANANCIA, LA MISMA EN LAS DOS CARAS ─────
                    //
                    // El renglón NO avisa: el que no tiene porcentaje ya no se
                    // pinta de ámbar. Ese aviso se fue de la tarjeta junto con
                    // "Se vende sin ganancia" — las dos cosas son ahora controles
                    // de "Para revisar", donde se cuentan y se pueden filtrar. En
                    // la tarjeta informaban de a uno y no llevaban a ningún lado.
                    //
                    // Y el orden ya no es configurable: Personalizar card prende y
                    // apaga, y la posición la define el diseño. Va el costo y
                    // después la regla, siempre.
                    regla={
                      muestraMargen && !esProductoServicio(p) && !vendeConListaAlCosto ? (
                        <span
                          className={`${GANANCIA_CLASE} sunmi-text-muted`}
                          title="Regla de ganancia configurada"
                        >
                          {textoDeGanancia(reglaDeGananciaDe(p))}
                        </span>
                      ) : null
                    }
                    // ── EL PRECIO Y SU PRESENTACIÓN LOS DIBUJA EL ENVOLTORIO ─
                    //
                    // Acá se armaba el número grande con su rótulo. Ahora eso
                    // depende de qué cara se esté mirando, así que lo resuelve
                    // `TarjetaProductoMovil` a partir de `caras` — que ya trae
                    // los dos importes calculados por los helpers del POS.
                    //
                    // Lo que NO se movió es la decisión de QUÉ precio se muestra:
                    // eso sigue arriba, en `precioBaseDelPos` y `redondeoDelPos`,
                    // que es donde vive el hecho de que el depósito vende con
                    // lista al costo. El envoltorio no elige precios, los dibuja.
                    //
                    // Un servicio de importe variable tampoco se decide acá:
                    // `escalaDeVentaDe` lo devuelve como "importe variable" y
                    // `carasDeTarjeta` le deja el importe en null, que es lo que
                    // hace que la tarjeta diga "Importe variable" en vez de
                    // "$0,00". La columna es obligatoria y el formulario les
                    // guarda 0 a propósito; cero no es gratis. Son 4 en
                    // producción, medidos.
                    //
                    // EL ID, NO LA FILA: `abrirEditar` valida con `Number(id)`,
                    // así que pasarle el objeto daba NaN y saltaba "ID de
                    // producto inválido" sin entrar nunca.
                    onEditar={() => abrirEditar(p.id ?? p.productoLocalId)}
                  />
                  );
                })}
                </div>

                {/* EL MISMO PIE QUE LA TABLA, no uno parecido. Sin esto la lista
                    del celular mostraba los primeros 25 de 2.600 productos y no
                    había forma de llegar al 26. Va FUERA de la grilla: adentro
                    sería una fila más y `auto-rows-fr` le daría el alto de una
                    tarjeta. */}
                <SunmiPaginador {...propsPaginacion} />
              </div>

              <div className="hidden md:block w-full mt-1">
                  <SunmiTablaProductos
                    rows={rows}
                    columns={allColumns.filter((c) =>
                      c.key === "nombre" ? true : visibleCols.includes(c.key)
                    )}
                    {...propsPaginacion}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(key) => {
                      if (key === sortKey) {
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      } else {
                        setSortKey(key);
                        setSortDir("asc");
                      }
                      setPage(1);
                    }}
                    onEditar={abrirEditar}
                    onEliminar={handleEliminar}
                    onSubirDeposito={subirADeposito}
                    onEditarCombo={abrirEditarCombo}
                    onVerComposicion={abrirVerComposicion}
                    onToggleEstadoCombo={toggleEstadoCombo}
                    localId={localId}
                    esDeposito={contexto?.esDeposito}
                    catalogos={catalogos}
                    loading={loading || loadingEditar}
                    selectedProductId={selectedProductId}
                    onSelectProducto={handleSelectProducto}
                  />
              </div>

              {(loading || loadingEditar) && (
                <SunmiLoader />
              )}
            </>
          )}

          {/* =========================================================
              TAB: IMPORT / EXPORT
              ========================================================= */}
          {activeTab === "importexport" && (
            <>
              {/* =====================================================
                  EXPORTAR
                  ===================================================== */}
              {!puedeExportar && (
                <p className="text-sm sunmi-text-muted px-1 py-2">
                  Tu rol no incluye exportar el catálogo, porque el archivo lleva
                  los costos y los márgenes.
                </p>
              )}

              {puedeExportar && (
              <>
              <SunmiSeparator label="Exportar productos" className="my-1" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-1">
                <div>
                  <label className="text-[11px] sunmi-text-muted mb-1 block">Proveedor</label>
                  <SunmiSelectAdv
                    value={expProveedorId}
                    onChange={(val) => setExpProveedorId(val)}
                  >
                    <option value="">Todos</option>
                    {catalogos.PROVEEDORES.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </SunmiSelectAdv>
                </div>

                <div>
                  <label className="text-[11px] sunmi-text-muted mb-1 block">Categoría</label>
                  <SunmiSelectAdv
                    value={expCategoriaId}
                    onChange={(val) => setExpCategoriaId(val)}
                  >
                    <option value="">Todas</option>
                    {catalogos.CATEGORIAS.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </SunmiSelectAdv>
                </div>
              </div>

              <div className="flex px-1 mt-2">
                <SunmiButton
                  color="cyan"
                  onClick={handleExport}
                  disabled={expLoading}
                >
                  {expLoading ? "Exportando..." : "Descargar Excel"}
                </SunmiButton>
              </div>
              </>
              )}

              {/* =====================================================
                  IMPORTAR
                  ===================================================== */}
              <SunmiSeparator label="Importar productos" className="my-2" />

              {/* Plantilla + Instructivo */}
              <div className="px-1 mt-1 mb-2">
                <a
                  href="/templates/import_productos.xlsx"
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg sunmi-btn-accent-soft text-[13px] font-semibold transition"
                >
                  Descargar plantilla Excel
                </a>

                <details className="mt-3 rounded-lg border sunmi-border sunmi-surface overflow-hidden">
                  <summary className="px-3 py-2 cursor-pointer text-[13px] font-semibold sunmi-link select-none">
                    Como preparar el Excel para importar productos
                  </summary>
                  <div className="px-3 pb-3 text-[12px] sunmi-text-strong leading-relaxed">
                    <p className="mt-2 mb-2 sunmi-text-muted font-medium">Columnas del archivo:</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="text-left sunmi-text-muted border-b sunmi-divider">
                            <th className="py-1 pr-3">Columna</th>
                            <th className="py-1 pr-3">Requerido</th>
                            <th className="py-1">Valores / Notas</th>
                          </tr>
                        </thead>
                        <tbody className="sunmi-text-strong">
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-accent">codigo_barra</td><td className="py-1 pr-3 sunmi-text-danger">Obligatorio</td><td className="py-1">Unico por grupo</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-accent">nombre</td><td className="py-1 pr-3 sunmi-text-danger">Obligatorio</td><td className="py-1">Nombre del producto</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-muted">unidad_medida</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">unidad | pack | cajon | kg (defecto: unidad)</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-muted">factor_pack</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">Cantidad de unidades por bulto (para pack/cajon)</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-accent">precio_costo</td><td className="py-1 pr-3 sunmi-text-danger">Obligatorio</td><td className="py-1">Mayor a 0</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-accent">precio_venta</td><td className="py-1 pr-3 sunmi-text-danger">Obligatorio</td><td className="py-1">Mayor a 0</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-muted">margen</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">Porcentaje (ej: 50)</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-muted">categoria</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">Nombre exacto del catalogo</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-muted">proveedor</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">Nombre exacto del catalogo</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-muted">area_fisica</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">Nombre exacto del catalogo</td></tr>
                          <tr className="border-b sunmi-border"><td className="py-1 pr-3 font-mono sunmi-text-muted">stock_inicial</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">Cantidad inicial de stock</td></tr>
                          <tr><td className="py-1 pr-3 font-mono sunmi-text-muted">activo</td><td className="py-1 pr-3 sunmi-text-muted">Opcional</td><td className="py-1">SI / NO / true / false (defecto: SI)</td></tr>
                        </tbody>
                      </table>
                    </div>

                    <p className="mt-3 mb-1 sunmi-text-muted font-medium">Reglas:</p>
                    <ul className="list-disc list-inside space-y-0.5 sunmi-text-muted">
                      <li>El <span className="sunmi-text-accent">codigo_barra</span> no puede repetirse dentro del archivo</li>
                      <li>Si el codigo ya existe en el sistema, se clasifica como <span className="sunmi-text-link">actualizar</span></li>
                      <li>Si no existe, se clasifica como <span className="sunmi-text-success">crear</span></li>
                      <li>Categoria, proveedor y area_fisica deben coincidir exactamente con los nombres del catalogo (sin importar mayusculas)</li>
                      <li>La primera fila del Excel debe ser los headers (nombres de columna)</li>
                    </ul>
                  </div>
                </details>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-1">
                <div>
                  <label className="text-[11px] sunmi-text-muted mb-1 block">
                    Modo de importación
                  </label>
                  <SunmiSelectAdv
                    value={impModo}
                    onChange={(val) => {
                      setImpModo(val);
                      resetImport();
                    }}
                  >
                    <option value="crear">Solo crear nuevos</option>
                    <option value="actualizar">Solo actualizar existentes</option>
                    <option value="crear_actualizar">Crear + Actualizar</option>
                  </SunmiSelectAdv>
                </div>
              </div>

              {/* Input archivo */}
              <div className="px-1 mt-2">
                <label className="text-[11px] sunmi-text-muted mb-1 block">
                  Archivo Excel (.xlsx, .xls)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={!localId || impLoading}
                  className="text-[12px] sunmi-text-strong file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:font-medium file:bg-[var(--pos-control-bg)] file:text-[var(--pos-muted-strong)] hover:file:bg-[var(--pos-control-hover)] disabled:opacity-50"
                />
              </div>

              {/* Loading */}
              {impLoading && (
                <div className="text-center sunmi-text-accent text-[12px] py-3 animate-pulse">
                  Procesando...
                </div>
              )}

              {/* Error */}
              {impError && (
                <div className="mx-1 mt-2 px-3 py-2 rounded-md sunmi-state-danger sunmi-text-danger text-[12px]">
                  {impError}
                </div>
              )}

              {/* Resultado final de importación */}
              {impResultado && (
                <div className="mx-1 mt-2 px-3 py-2 rounded-md sunmi-state-success sunmi-text-success text-[12px]">
                  <p className="font-semibold">{impResultado.message}</p>
                  <p className="mt-1">
                    Creados: {impResultado.creados} | Actualizados: {impResultado.actualizados} | Errores: {impResultado.errores}
                  </p>
                  {impResultado.detalles?.length > 0 && (
                    <div className="mt-2 sunmi-text-danger">
                      {impResultado.detalles.map((d, i) => (
                        <p key={i}>Fila {d.fila} ({d.nombre}): {d.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview de importación */}
              {impResumen && impPreview && (
                <>
                  {/* Resumen badges */}
                  <div className="flex flex-wrap gap-3 px-1 mt-3">
                    <span className="px-2 py-1 rounded sunmi-surface text-[12px] font-medium">
                      Total: {impResumen.total}
                    </span>
                    <span className="px-2 py-1 rounded sunmi-state-success sunmi-text-success text-[12px] font-medium">
                      Crear: {impResumen.crear}
                    </span>
                    <span className="px-2 py-1 rounded sunmi-badge-link text-[12px] font-medium">
                      Actualizar: {impResumen.actualizar}
                    </span>
                    <span className="px-2 py-1 rounded sunmi-state-danger sunmi-text-danger text-[12px] font-medium">
                      Errores: {impResumen.errores}
                    </span>
                    {impResumen.ignorados > 0 && (
                      <span className="px-2 py-1 rounded sunmi-surface sunmi-text-muted text-[12px] font-medium">
                        Ignorados: {impResumen.ignorados}
                      </span>
                    )}
                  </div>

                  {/* Tabs errores / correctos */}
                  <div className="flex gap-2 px-1 mt-3">
                    <button
                      className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${
                        impTab === "errores"
                          ? "sunmi-state-danger sunmi-text-danger"
                          : "sunmi-surface sunmi-text-muted hover:opacity-80"
                      }`}
                      onClick={() => { setImpTab("errores"); setImpPage(1); }}
                    >
                      Errores ({impErrorRows.length})
                    </button>
                    <button
                      className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${
                        impTab === "correctos"
                          ? "sunmi-state-success sunmi-text-success"
                          : "sunmi-surface sunmi-text-muted hover:opacity-80"
                      }`}
                      onClick={() => { setImpTab("correctos"); setImpPage(1); }}
                    >
                      Correctos ({impOkRows.length})
                    </button>
                    {impTab === "errores" && impErrorRows.length > 0 && (
                      <>
                        <SunmiButton size="sm" color="red" onClick={descargarErroresExcel}>
                          Descargar errores (Excel)
                        </SunmiButton>
                        <SunmiButton size="sm" color="amber" onClick={descargarErroresReparable}>
                          Descargar errores (para corregir)
                        </SunmiButton>
                      </>
                    )}
                  </div>

                  {/* Tabla paginada */}
                  <div className="overflow-x-auto mt-2">
                    <div className="rounded-lg border sunmi-border overflow-hidden">
                      {impTab === "errores" ? (
                        <SunmiTable headers={["Fila", "Código", "Nombre", "Campo", "Error"]}>
                          {impPagedRows.length === 0 ? (
                            <SunmiTableEmpty message="Sin errores" />
                          ) : (
                            impPagedRows.map((row, i) =>
                              (row.erroresDetalle || [{ field: "-", message: row.motivoError || "-" }]).map((err, j) => (
                                <SunmiTableRow key={`${i}-${j}`}>
                                  {j === 0 && (
                                    <>
                                      <td className="px-2 py-1.5 text-[11px]" rowSpan={row.erroresDetalle?.length || 1}>{row.fila}</td>
                                      <td className="px-2 py-1.5 text-[11px]" rowSpan={row.erroresDetalle?.length || 1}>{row.codigo_barra || "-"}</td>
                                      <td className="px-2 py-1.5 text-[11px]" rowSpan={row.erroresDetalle?.length || 1}>{row.nombre || "-"}</td>
                                    </>
                                  )}
                                  <td className="px-2 py-1.5 text-[11px] sunmi-text-danger font-medium">{err.field}</td>
                                  <td className="px-2 py-1.5 text-[11px] sunmi-text-danger">{err.message}</td>
                                </SunmiTableRow>
                              ))
                            )
                          )}
                        </SunmiTable>
                      ) : (
                        <SunmiTable headers={["Fila", "Acción", "Código", "Nombre", "Unidad", "Costo", "Venta"]}>
                          {impPagedRows.length === 0 ? (
                            <SunmiTableEmpty message="Sin productos válidos" />
                          ) : (
                            impPagedRows.map((row, i) => (
                              <SunmiTableRow key={i}>
                                <td className="px-2 py-1.5 text-[11px]">{row.fila}</td>
                                <td className="px-2 py-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    row.accion === "crear" ? "sunmi-state-success sunmi-text-success" : "sunmi-badge-link"
                                  }`}>
                                    {row.accion}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5 text-[11px]">{row.codigo_barra || "-"}</td>
                                <td className="px-2 py-1.5 text-[11px]">{row.nombre}</td>
                                <td className="px-2 py-1.5 text-[11px]">{row.unidad_medida}</td>
                                <td className="px-2 py-1.5 text-[11px] text-right">
                                  {!isNaN(row.precio_costo) ? `$ ${Number(row.precio_costo).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                                </td>
                                <td className="px-2 py-1.5 text-[11px] text-right">
                                  {!isNaN(row.precio_venta) ? `$ ${Number(row.precio_venta).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                                </td>
                              </SunmiTableRow>
                            ))
                          )}
                        </SunmiTable>
                      )}
                    </div>
                  </div>

                  {/* Paginación */}
                  {impTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 px-1 mt-2">
                      <SunmiButton
                        size="sm"
                        disabled={impPage <= 1}
                        onClick={() => setImpPage((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </SunmiButton>
                      <span className="text-[12px] sunmi-text-muted">
                        Página {impPage} de {impTotalPages}
                      </span>
                      <SunmiButton
                        size="sm"
                        disabled={impPage >= impTotalPages}
                        onClick={() => setImpPage((p) => Math.min(impTotalPages, p + 1))}
                      >
                        Siguiente
                      </SunmiButton>
                    </div>
                  )}

                  {/* Botón confirmar */}
                  {(impResumen.crear > 0 || impResumen.actualizar > 0) && (
                    <div className="flex gap-3 px-1 mt-3">
                      <SunmiButton
                        color="amber"
                        onClick={handleImportConfirm}
                        disabled={impLoading}
                      >
                        {impLoading ? "Importando..." : "Confirmar importación"}
                      </SunmiButton>
                      <SunmiButton color="red" onClick={resetImport}>
                        Cancelar
                      </SunmiButton>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

      </SunmiCard>

      {/* ── LOS MODALES VAN AFUERA DEL `SunmiCard`, Y NO ES ORDEN ─────────────
          `SunmiCard` trae `backdrop-blur-sm`, o sea `backdrop-filter`, y esa
          propiedad **crea un bloque contenedor para los descendientes
          `position: fixed`**. Con los modales adentro, la capa dejaba de
          resolverse contra el viewport y pasaba a resolverse contra la tarjeta.
          Medido a 360x640 antes de moverlos: la capa medía 1095,5 de alto en vez
          de 640, y la tarjeta del modal quedaba en y=398,8 con el borde de abajo
          en 943,8 — **304 px fuera de la pantalla**. A 1366x900 el mismo efecto
          la cortaba 3 px. */}
      {/* ── LAS TRES HOJAS DEL CELULAR ──────────────────────────────────────
          Van acá, con los modales, por el mismo motivo que ellos. Y no llevan
          `md:hidden`: se abren solo desde botones que ya lo tienen, así que en
          escritorio nunca se montan — un `hidden` encima sería una capa abierta
          e invisible, que es peor que una cerrada. */}
      <HojaMasAcciones
        open={hojaMas}
        onClose={() => setHojaMas(false)}
        onNuevoCombo={abrirNuevoCombo}
        onActualizacionPrecios={abrirActualizacionPrecios}
        onImportExport={() => setActiveTab("importexport")}
        onPersonalizarCard={() => setHojaPersonalizar(true)}
        puedeExportar={puedeExportar}
      />

      <HojaPersonalizarTarjeta
        open={hojaPersonalizar}
        onClose={() => setHojaPersonalizar(false)}
        config={configTarjeta}
        onChange={guardarConfigTarjeta}
      />

      {/* LOS FILTROS DEL CELULAR: el MISMO `FiltrosProductos` de escritorio, con
          el mismo `onChange`. No es una copia — si lo fuera, el día que se agregue
          un filtro habría que acordarse de los dos lados. */}
      <SunmiModalLayout
        open={hojaFiltros}
        onClose={() => setHojaFiltros(false)}
        title="Filtros"
        forma="hoja"
        z={9999}
        espacioCuerpo="mt-2"
        maxWidth="max-w-xl"
      >
        <FiltrosProductos
          initial={filtros}
          catalogos={catalogos}
          onChange={(f) => {
            if (!mismosFiltros(f, filtros)) aplicarFiltros(f);
          }}
        />
      </SunmiModalLayout>

      <ModalProducto
        open={modalOpen}
        onClose={cerrarModal}
        onSubmit={handleSubmit}
        catalogos={catalogos}
        initialData={editing}
        localId={localId}
        editandoOverrideLocal={!!editing && localId > 0 && !contexto?.esDeposito}
        puedeEditarCosto={editFlags.puedeEditarCosto}
        puedeEditarBase={editFlags.puedeEditarBase}
      />

      <ModalVerComposicion
        open={!!verCombo}
        productoLocalId={verCombo?.productoLocalId}
        localId={localId}
        onClose={() => setVerCombo(null)}
        onEditar={(plId) => {
          setVerCombo(null);
          abrirEditarCombo(plId);
        }}
      />
    </div>
  );
}
