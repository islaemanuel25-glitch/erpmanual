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
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import FiltrosProductos from "@/components/productos/FiltrosProductos";
import ColumnManager from "@/components/productos/ColumnManager";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import ModalVerComposicion from "@/components/productos/ModalVerComposicion";
import SunmiTablaProductos from "@/components/productos/SunmiTablaProductos";
import SunmiProductoCard, { AccionTarjeta } from "@/components/sunmi/SunmiProductoCard";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import { Eye, Pencil } from "lucide-react";
import { formatearMoneda, lineaDeEquivalencia } from "@/lib/moneda";
import { escalaDeVentaDe, valorEnLaEscalaDeVenta } from "@/lib/precios/escalaDeVenta";
import { precioEnEscalaQueSeCobra, precioUnitarioQueSeCobra } from "@/lib/precios/redondeo";
import { seVendeSinGanancia } from "@/lib/precios/precioDesdeMargen";
import {
  reglaDeGananciaDe,
  textoDeGanancia,
  GANANCIA_FALTA,
} from "@/lib/precios/reglaDeGanancia";
// LA MARCA DEL SERVICIO ES LA DEL POS, no una nueva. `esProductoServicio` mira
// `modalidad`, que es el mismo campo con el que el POS decide abrir el modal de
// importe en vez de cobrar un precio fijo.
import { esProductoServicio } from "@/lib/pos-ventas/servicios";
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
// El texto es el MISMO que ya muestra el buscador del POS —"Importe variable"—,
// copiado de `components/pos-ventas/BuscadorProductos.jsx`. Dos pantallas
// diciendo lo mismo con dos redacciones distintas es cómo empieza a divergir un
// concepto, y acá el concepto es "este producto no tiene precio: se carga al
// vender".
const TEXTO_IMPORTE_VARIABLE = "Importe variable";

// ── EL AVISO DE LOS QUE NO DEJAN NADA ─────────────────────────────────────
//
// Corto, y dice el hecho: la venta no le saca nada al costo. No dice "¡atención!"
// ni "error" — no es un error del sistema, es una situación del negocio, y un
// cartel alarmista sobre 429 filas enseña a ignorar los carteles.
//
// Se eligió "sin ganancia" y no "sin margen" porque margen es la palabra del
// campo configurado, que es OTRA cosa: hay 1.691 filas sin margen asignado que
// igual venden con ganancia.
const AVISO_SIN_GANANCIA = "Se vende sin ganancia";

// ── EL PORCENTAJE DE GANANCIA, Y EL QUE FALTA ─────────────────────────────
//
// La idea es que se sepa de un vistazo cuál tiene porcentaje asignado y cuál no,
// y por eso el que falta se ve MÁS que el que está: los 8.613 que tienen uno van
// en el gris tenue de la tarjeta, y los 1.677 que no van en `--pos-warning`, el
// mismo ámbar medido del aviso de abajo. Un blanco o un cero no servirían — el
// blanco no se lee como "falta" y el cero es un valor cargado que significa otra
// cosa: "vendé al costo".
//
// Las 231 filas de RECARGO FIJO no son "sin porcentaje": tienen regla, la suya no
// se expresa en porcentaje. Van en gris con su valor en pesos —"+$100/un"—, así
// que se distinguen de las tres cosas a la vez: no son un porcentaje, no son un
// faltante, y dicen cuál es su regla.
//
// Los servicios de importe variable quedan AFUERA, igual que del aviso: no
// tienen precio fijo, así que no les falta un porcentaje — no les corresponde.
// Son 12 filas que si no dirían "falta %" mintiendo.
// `text-xs` y no una medida escrita: está en la escala y no sube el contador de
// hardcodeo. Son 10,5 px reales —1 rem son 14 acá—, el mismo tamaño que el aviso
// de abajo, que es el otro elemento de "mirá esto" de la tarjeta.
const GANANCIA_CLASE = "text-xs [font-variant-numeric:tabular-nums] whitespace-nowrap";
// Y la línea de abajo explica de dónde sale el importe. Va con texto y no vacía
// porque todas las tarjetas llevan su línea: un hueco haría que estas cuatro
// quedaran más bajas que las demás.
const EQUIVALENCIA_IMPORTE_VARIABLE = "El importe se carga al vender";

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
  const tarjetaSinEquivalencia = perfilProd?.tarjetaOcultarEquivalencia === true;

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

  const [filtros, setFiltros] = useState({
    search: searchParams.get("q") || "",
    categoria: searchParams.get("categoria") || "",
    proveedor: searchParams.get("proveedor") || "",
    area: searchParams.get("area") || "",
    // estado: activos (default) | inactivos | todos. Soporta URL vieja con
    // ?activo=true/false para no romper bookmarks de operadores.
    estado:
      searchParams.get("estado") ||
      (searchParams.get("activo") === "false"
        ? "inactivos"
        : searchParams.get("activo") === "true"
        ? "activos"
        : "activos"),
    // tipo: todos (default) | productos | combos.
    tipo: searchParams.get("tipo") || "todos",
  });

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
    const qs = params.toString();
    return qs ? `/modulos/productos?${qs}` : "/modulos/productos";
  }, [page, sortKey, sortDir, filtros]);

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
    { key: "codigoInterno", label: "Código interno" },
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

  const fetchProductos = async () => {
    setLoading(true);
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
        localId: String(localId),
      });

      const res = await fetch(`/api/productos/listar?${params.toString()}`, {
        credentials: "include",
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (data.ok) {
        setRows(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total);
        // Un servidor viejo no manda estos campos: `=== true` los deja en false,
        // que es el comportamiento anterior, en vez de dejarlos en `undefined`.
        setVendeConListaAlCosto(data.vendeConListaAlCosto === true);
        setListaAlCostoRedondea100(data.listaAlCostoRedondea100 === true);
      }
    } catch (err) {
      console.error("Error cargando productos:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  useEffect(() => {
    if (!localId) return;
    fetchProductos();
  }, [page, pageSize, sortKey, sortDir, filtros, localId]);

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

  const abrirEdicionRapida = () => {
    router.push("/modulos/productos/edicion-rapida");
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

  // =========================================================
  // RENDER
  // =========================================================
  if (cargandoProd || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }
  if (!puedeProd) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-2">

          {/* =========================================================
              TABS
              ========================================================= */}
          <div className="flex gap-1 border-b sunmi-divider pb-1">
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
              {/* FILTROS */}
              <SunmiSeparator label="Filtros" className="my-1" />

              <FiltrosProductos
                initial={filtros}
                catalogos={catalogos}
                onChange={(f) => {
                  // Solo resetear página si los filtros realmente cambiaron
                  const changed = f.search !== filtros.search ||
                    f.categoria !== filtros.categoria ||
                    f.proveedor !== filtros.proveedor ||
                    f.area !== filtros.area ||
                    f.estado !== filtros.estado ||
                    f.tipo !== filtros.tipo;
                  if (changed) {
                    setPage(1);
                    setFiltros(f);
                  }
                }}
              />

              {/* ACCIONES */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-2 w-full mt-1">
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
                  <SunmiButton color="cyan" onClick={abrirEdicionRapida}>
                    Edición rápida
                  </SunmiButton>
                </div>

                <ColumnManager
                  allColumns={allColumns}
                  visibleKeys={visibleCols}
                  onChange={handleVisibleColsChange}
                  lockedKeys={LOCKED_COLS}
                />
              </div>

              {/* LISTADO */}
              <SunmiSeparator label="Listado" className="my-1" />

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

                  // ── LOS DOS NÚMEROS, EN LA MISMA ESCALA ─────────────────
                  //
                  // Es la regla dura de este bloque. Un costo por bulto al lado
                  // de una venta por unidad no es una comparación difícil: es una
                  // comparación AL REVÉS, que hace parecer sano lo que está mal.
                  // Por eso los dos salen de la misma función con la misma
                  // escala, y lo único que difiere es el redondeo: la venta lo
                  // lleva porque es lo que se cobra, el costo no porque se paga.
                  const enEscala = (valor, redondeo) =>
                    valorEnLaEscalaDeVenta({
                      escala: escalaVenta,
                      valor,
                      factor: p.factorPack,
                      unidad: p.unidadMedida,
                      redondeo100: redondeo,
                      pesoReferenciaKg: p.pesoReferenciaKg,
                    });
                  const ventaEnEscala = enEscala(p.precioVenta, p.redondeo100);
                  // Ya no lo gatea ningún permiso: el costo se ve para todos.
                  const costoEnEscala = enEscala(p.precioCosto, false);

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
                  const precioQueCobraElPos = vendeConListaAlCosto
                    ? enEscala(p.precioCosto, listaAlCostoRedondea100)
                    : ventaEnEscala;
                  return (
                  <SunmiProductoCard
                    key={p.id ?? p.productoLocalId}
                    nombre={p.nombre}
                    empresa={p.proveedorNombre ?? null}
                    equivalencia={
                      esProductoServicio(p)
                        ? EQUIVALENCIA_IMPORTE_VARIABLE
                        : lineaDeEquivalencia({
                            precio: p.precioVenta,
                            factor: p.factorPack,
                            unidad: p.unidadMedida,
                            redondeo100: p.redondeo100,
                            // Los 142 combos no se distinguían de un producto
                            // común en ninguna parte de la tarjeta. Lo dice la
                            // franja de escala, con palabra y no con un dibujo.
                            esCombo: p.esCombo,
                            ocultarEquivalencia: tarjetaSinEquivalencia,
                            // La escala de VENTA decide qué conversión hace
                            // falta, y si hace falta alguna: en un suelto la
                            // franja desaparece porque no hay nada que convertir.
                            escala: escalaVenta,
                            pesoReferenciaKg: p.pesoReferenciaKg,
                          })
                    }
                    codigoBarra={p.codigoBarra ?? p.sku ?? null}
                    codigoInterno={p.id ?? p.productoLocalId ?? null}
                    // EL COSTO Y LA GANANCIA, en el hueco que ya existía a la
                    // izquierda del precio. No agrega renglón: van APILADOS
                    // dentro de la fila del valor, que tiene 30 px de alto
                    // mínimo y le sobran para dos líneas de 10,5.
                    //
                    // Por qué apilados y no en una línea: el peor caso real
                    // —"Costo $112.450,00 · falta %" al lado de "$142.000,00 por
                    // bulto"— son 48 caracteres y NO entra a 390 px. Medido antes
                    // de escribirlo, sobre las 10.509 filas activas.
                    //
                    // El costo ya no lo gatea ningún permiso: se ve para todos.
                    //
                    // ── Y DONDE SE VENDE AL COSTO, ESTE BLOQUE NO VA ────────
                    //
                    // Las dos cosas que muestra sobran exactamente ahí, y por
                    // motivos distintos:
                    //
                    // · el PORCENTAJE, porque no hay margen que mostrar. No es
                    //   que no se sepa: es que vender al costo es no tener
                    //   ganancia, y un "30 %" al lado del precio afirma una que
                    //   no existe. Es propiedad del LUGAR, no del permiso de
                    //   quien mira, así que se va para todos.
                    //
                    // · la línea "Costo", porque el número grande YA es el
                    //   costo. Dejarla sería escribir el mismo número dos veces
                    //   en la misma fila, una vez grande y otra chiquita.
                    marca={
                      esProductoServicio(p) || vendeConListaAlCosto
                        ? null
                        : (() => {
                            const regla = reglaDeGananciaDe(p);
                            const falta = regla.tipo === GANANCIA_FALTA;
                            return (
                              <span className="flex flex-col items-start leading-tight">
                                {costoEnEscala !== null && (
                                  <span
                                    className={`${GANANCIA_CLASE} sunmi-text-muted`}
                                    title="Costo, en la misma escala que el precio de venta"
                                  >
                                    Costo {formatearMoneda(costoEnEscala)}
                                  </span>
                                )}
                              <span
                                className={[
                                  GANANCIA_CLASE,
                                  falta
                                    ? "font-medium [color:var(--pos-warning)]"
                                    : "sunmi-text-muted",
                                ].join(" ")}
                                // El texto ya lo dice; el título explica de qué
                                // porcentaje se trata, que en una tarjeta con un
                                // precio al lado no es obvio.
                                title={
                                  falta
                                    ? "Este producto no tiene porcentaje de ganancia asignado"
                                    : "Porcentaje de ganancia configurado"
                                }
                              >
                                {textoDeGanancia(regla)}
                              </span>
                              </span>
                            );
                          })()
                    }
                    // EL AVISO SOBRE LO QUE YA PASÓ, no sobre lo que podría
                    // pasar. Son 429 filas en producción que se venden al costo
                    // o por debajo. Los 1.691 SIN REGLA DE PRECIO no se marcan
                    // acá: su problema es otro —no se mueven cuando sube el
                    // costo— y marcaría el 16 % del catálogo por algo que
                    // todavía no ocurrió. Queda anotado como tanda propia.
                    aviso={
                      !esProductoServicio(p) &&
                      seVendeSinGanancia({ costo: p.precioCosto, venta: p.precioVenta })
                        ? AVISO_SIN_GANANCIA
                        : null
                    }
                    valor={
                      esProductoServicio(p) ? (
                        // UN SERVICIO NO TIENE PRECIO, Y CERO NO ES "GRATIS".
                        // La columna es obligatoria, así que el formulario les
                        // guarda 0 a propósito; la tarjeta mostraba "$0,00 por
                        // unidad" y eso no se distingue de un producto mal
                        // cargado. Son 4 en producción, medidos.
                        // Sin tamaño propio: hereda el de la tarjeta. Ponerle uno
                        // sería una medida mágica más para decir "no hay precio".
                        <span className="font-semibold sunmi-text-muted whitespace-nowrap">
                          {TEXTO_IMPORTE_VARIABLE}
                        </span>
                      ) : (
                        <>
                          <span className="text-[22px] font-bold sunmi-text-strong whitespace-nowrap [font-variant-numeric:tabular-nums] tracking-[-.01em]">
                            {/* EL PRECIO QUE SE COBRA, no el guardado. El POS
                                redondea a 100 y el catálogo no lo hacía: 1.130
                                productos mostraban un número y el mostrador
                                cobraba otro. La regla vive en
                                `lib/precios/redondeo.js`, no acá. */}
                            {/* EL LOCAL PUEDE PEDIR SIEMPRE EL UNITARIO. Cambia
                                el número en 6.430 de 10.616 filas —las de pack—,
                                y por eso la etiqueta de abajo TIENE que cambiar
                                con él: dejarla en "por bulto" sobre un número
                                unitario es la misma contradicción del "/ un",
                                dada vuelta. */}
                            {/* EL NÚMERO SIGUE A LA ESCALA DE VENTA. Cambiar
                                solo el rótulo habría sido peor que no tocar
                                nada: diría "$31.900,00 por unidad" sobre un
                                precio de bulto. */}
                            {/* EL NÚMERO ES EL QUE COBRA EL POS EN ESTA
                                UBICACIÓN. En un local es el precio de venta; en
                                el depósito, que vende con lista al costo, es el
                                costo. La decisión está arriba, en
                                `precioQueCobraElPos`. */}
                            {formatearMoneda(precioQueCobraElPos)}
                          </span>
                          {/* EL RÓTULO ES LA ESCALA DE VENTA, tal cual. Antes
                              salía de `unidad_medida`, que dice cómo se COMPRA:
                              5.450 de 10.521 filas activas nombraban una escala
                              distinta de la que el POS usa para vender. */}
                          <span className="text-[11.5px] sunmi-text-muted">
                            {escalaVenta}
                          </span>
                        </>
                      )
                    }
                    // LOS DOS BOTONES, A LA VISTA. Ya no hay capa que abrir.
                    //
                    // EL ID, NO LA FILA: `abrirEditar` valida con `Number(id)`,
                    // así que pasarle el objeto daba NaN y saltaba "ID de
                    // producto inválido" sin entrar nunca.
                    acciones={
                      <>
                        <AccionTarjeta
                          icono={Eye}
                          onClick={() => abrirVer(p.id ?? p.productoLocalId)}
                        >
                          Ver
                        </AccionTarjeta>
                        <AccionTarjeta
                          icono={Pencil}
                          onClick={() => abrirEditar(p.id ?? p.productoLocalId)}
                        >
                          Editar
                        </AccionTarjeta>
                      </>
                    }
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
