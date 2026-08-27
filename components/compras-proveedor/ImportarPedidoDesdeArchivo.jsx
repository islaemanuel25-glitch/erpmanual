"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileUp,
  Image as ImageIcon,
  MessageSquareText,
  RefreshCw,
  SearchCheck,
  X,
} from "lucide-react";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import { naturalezaLinea, permiteToggleUnidad } from "@/lib/compras-proveedor/calculoPedido";
import { baseDeProducto } from "@/lib/compras-proveedor/importacion/merge";
import { consolidarLineasImportadas } from "@/lib/compras-proveedor/importacion/payload";
import {
  TEXTO_ORIGEN_PAPEL,
  verificarSumaDeSubtotales,
} from "@/lib/compras-proveedor/importacion/precioDelPapel";
import {
  cambiarUnidadDelPapel,
  cambiarUnidadDeLinea,
  prepararLineasImportadas,
  recalcularLineaConProducto,
  recalcularPrecioDeLinea,
} from "@/lib/compras-proveedor/importacion/prepararLineas";
import { ORIGEN_PRECIO } from "@/lib/compras-proveedor/importacion/precios";
import { lineasQueNoCierran } from "@/lib/compras-proveedor/importacion/coherenciaDeLinea";
import {
  LARGO_MAXIMO_EXPLICACION,
  parametrosDeLectura,
} from "@/lib/compras-proveedor/importacion/recetaDeLectura";
import { TEXTO_MOTIVO_CANDIDATO } from "@/lib/proveedores/identidad/motorCandidatos";

const NF_MONEDA = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NF_PORCENTAJE = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dinero = (valor) =>
  valor === null || valor === undefined || !Number.isFinite(Number(valor))
    ? "Sin precio"
    : `$${NF_MONEDA.format(Number(valor))}`;

const normalizarDecimal = (valor) => String(valor ?? "").replace(",", ".").replace(/[^\d.]/g, "");

const porcentaje = (valor) =>
  valor === null || valor === undefined || !Number.isFinite(Number(valor))
    ? null
    : `${NF_PORCENTAJE.format(Number(valor))}%`;

function lineaLista(linea) {
  const cantidad = Number(linea.cantidadPedido);
  return Boolean(
    linea.productoLocalId &&
      Number.isInteger(cantidad) &&
      cantidad >= 1 &&
      ["BULTO", "UNIDAD"].includes(linea.unidadPedido) &&
      linea.confirmada &&
      linea.precioConfirmado &&
      // Un renglón cuyo precio del papel no se pudo resolver —hay subtotal y la
      // cantidad no sirve para dividir, o hay bonificación sin precio— no puede
      // guardarse en silencio. No se inventa cero ni se cae al precio de lista:
      // se pide que alguien lo mire.
      !linea.papelRequiereRevision &&
      // Y una conversión de unidad a medio hacer tampoco: la línea está en la
      // unidad vieja con una conversión pendiente, así que guardarla escribiría
      // la cantidad de una escala con el precio de la otra.
      !linea.requiereConfirmacionDeUnidad &&
      // ── Y EL CANDADO DE MAGNITUD, QUE ES EL ÚNICO QUE NO SE NEGOCIA ──────
      //
      // Los de arriba dicen que falta decidir algo. Éste dice que lo decidido
      // cobra otra cosa que el papel, y eso no se arregla mirándolo: se arregla
      // corrigiendo la interpretación. Por eso no hay forma de confirmarlo
      // desde la pantalla, como sí la hay para una diferencia de precio.
      !linea.coherencia?.bloquea
  );
}

/**
 * Por qué se propuso este producto.
 *
 * Los cuatro primeros son los del motor compartido; los tres de abajo son los
 * del macheador de código del módulo de comprobante, que sigue resolviendo la
 * escalera por terminación. Los dos vocabularios conviven porque son dos
 * preguntas distintas —texto y código— y unificarlos borraría la diferencia.
 */
function textoOrigenVinculo(origen) {
  const compartido = TEXTO_MOTIVO_CANDIDATO[origen];
  if (compartido) return compartido;
  if (origen === "CODIGO_PROVEEDOR") return "Código exacto";
  if (origen === "CODIGO_APROXIMADO") return "Código aproximado";
  if (origen === "ALIAS_DESCRIPCION") return "Aprendido para este proveedor";
  return null;
}

export default function ImportarPedidoDesdeArchivo() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef(null);
  const pedidoId = searchParams.get("pedidoId") || "";
  const proveedorInicial = searchParams.get("proveedorId") || "";

  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState(proveedorInicial);
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [productos, setProductos] = useState([]);
  const [facturaPor, setFacturaPor] = useState("UNIDAD");
  const [tieneReceta, setTieneReceta] = useState(false);
  // ── LA RECETA DE LECTURA, QUE ES OTRA COSA QUE LA DE IMPUESTOS ──────────
  //
  // `facturaPor` y `tieneReceta` de arriba salen de la receta de impuestos, que
  // es UNA por proveedor. Éstas son las de LECTURA: varias por proveedor, una
  // por formato, y dicen cómo está armada la tabla del papel.
  const [recetasLectura, setRecetasLectura] = useState([]);
  const [recetaElegidaId, setRecetaElegidaId] = useState("");
  // La receta que se está usando AHORA. Puede venir de una guardada o de una
  // explicación de "usar solo esta vez", que no se guarda en ningún lado.
  const [recetaEnUso, setRecetaEnUso] = useState(null);
  const [recetaSoloEstaVez, setRecetaSoloEstaVez] = useState(false);
  const [explicando, setExplicando] = useState(false);
  const [explicacion, setExplicacion] = useState("");
  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [interpretando, setInterpretando] = useState(false);
  const [errorReceta, setErrorReceta] = useState("");
  const [nombreVariante, setNombreVariante] = useState("");
  const [guardandoReceta, setGuardandoReceta] = useState(false);
  const [estado, setEstado] = useState("elegir");
  const [archivo, setArchivo] = useState(null);
  const [documento, setDocumento] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [filtro, setFiltro] = useState("todas");
  const [error, setError] = useState("");
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const respuesta = await fetch("/api/proveedores/listar?estado=activos&pageSize=200", {
          credentials: "include",
        });
        const data = await respuesta.json();
        if (vigente && data.ok) setProveedores(data.items || []);
      } catch {
        if (vigente) setError("No se pudieron cargar los proveedores.");
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (!pedidoId) return;
    let vigente = true;
    (async () => {
      try {
        const respuesta = await fetch(`/api/compras-proveedor/obtener?id=${pedidoId}`, {
          credentials: "include",
        });
        const data = await respuesta.json();
        if (!vigente) return;
        if (!data.ok || !data.item) throw new Error(data.error || "No se pudo abrir el borrador.");
        if (data.item.estado !== "BORRADOR") throw new Error("Solo se puede importar sobre un borrador.");
        setProveedorId(String(data.item.proveedor?.id || ""));
        setProveedorNombre(data.item.proveedor?.nombre || "");
      } catch (e) {
        if (vigente) setError(e?.message || "No se pudo abrir el borrador.");
      }
    })();
    return () => {
      vigente = false;
    };
  }, [pedidoId]);

  useEffect(() => {
    if (!proveedorId) {
      setProductos([]);
      return;
    }
    let vigente = true;
    setCargandoCatalogo(true);
    setError("");
    (async () => {
      try {
        const [respuestaProductos, respuestaReceta, respuestaLectura] = await Promise.all([
          fetch(`/api/compras-proveedor/productos?proveedorId=${proveedorId}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/compras-proveedor/recetas/obtener?proveedorId=${proveedorId}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/compras-proveedor/recetas-lectura/listar?proveedorId=${proveedorId}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        const dataProductos = await respuestaProductos.json();
        if (!dataProductos.ok) throw new Error(dataProductos.error || "No se pudo cargar el catálogo.");

        let dataReceta = null;
        try {
          dataReceta = await respuestaReceta.json();
        } catch {
          // La receta ayuda a interpretar el precio, pero no bloquea la carga.
        }
        let dataLectura = null;
        try {
          dataLectura = await respuestaLectura.json();
        } catch {
          // Las recetas de lectura ayudan, pero no bloquean la carga: sin
          // ninguna el importador funciona como funcionaba antes.
        }
        if (!vigente) return;
        setProductos(dataProductos.items || []);
        if (dataReceta?.ok) {
          setFacturaPor(dataReceta.respuestas?.facturaPor === "BULTO" ? "BULTO" : "UNIDAD");
          setTieneReceta(Boolean(dataReceta.tieneReceta));
        } else {
          setFacturaPor("UNIDAD");
          setTieneReceta(false);
        }
        const variantes = dataLectura?.ok ? dataLectura.items || [] : [];
        setRecetasLectura(variantes);
        // Con UNA sola variante se elige sola: no hay ambigüedad que resolver.
        // Con varias NO se elige ninguna, y esa ausencia es deliberada — adivinar
        // el formato significa leer las columnas cambiadas de lugar, y el error
        // se ve como un producto mal machado, no como un formato equivocado.
        const unica = variantes.length === 1 ? variantes[0] : null;
        setRecetaElegidaId(unica ? String(unica.id) : "");
        setRecetaEnUso(unica ? unica.receta : null);
        setRecetaSoloEstaVez(false);
      } catch (e) {
        if (vigente) {
          setProductos([]);
          setError(e?.message || "No se pudo cargar el catálogo del proveedor.");
        }
      } finally {
        if (vigente) setCargandoCatalogo(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [proveedorId]);

  const productosPorId = useMemo(
    () => new Map(productos.map((producto) => [String(producto.productoLocalId), producto])),
    [productos]
  );
  // ── LOS PARÁMETROS QUE APORTA LA RECETA DE LECTURA ─────────────────────
  //
  // Antes de esta tanda, `cantidadEn` y `presentacionesConfirmadas` no se
  // pasaban NUNCA desde acá, así que los escalones 1 y 2 de la prioridad de
  // `resolverUnidadDelPapel` —la receta y la presentación confirmada— estaban
  // escritos y no corrían jamás en producción. Es la tercera defensa de este
  // módulo escrita y sin alcanzar; las otras dos están anotadas en CLAUDE.md.
  const lectura = useMemo(() => parametrosDeLectura(recetaEnUso), [recetaEnUso]);
  const nombreDeLaReceta =
    recetasLectura.find((r) => String(r.id) === String(recetaElegidaId))?.nombre ?? "sin nombre";

  // `!== false` y no `Boolean(...)`: el lector puede no haber contestado, y
  // "no sé" se trata como "no hay columna" a propósito. Ver `prepararLineas`.
  //
  // La receta MANDA sobre lo que contestó el lector cuando opina: quien la
  // escribió tenía el papel en la mano. Pero un `null` de la receta significa
  // que no opina, y entonces sigue mandando el lector — por eso es `?? ` y no
  // `||`, que convertiría un `false` de la receta en "preguntale al lector".
  const hayColumnaSubtotal =
    (lectura.hayColumnaSubtotal ?? documento?.hayColumnaSubtotal) === true;
  const incluidas = lineas.filter((linea) => linea.incluida !== false);
  const listas = incluidas.filter(lineaLista);
  const pendientes = incluidas.length - listas.length;
  const diferencias = incluidas.filter((linea) => linea.diferentes && !linea.precioConfirmado).length;
  const sinVinculo = incluidas.filter((linea) => !linea.productoLocalId).length;
  const sinPrecioResuelto = incluidas.filter((linea) => linea.papelRequiereRevision).length;
  // Se cuenta con la MISMA función que usa la ruta al guardar. Si la pantalla
  // tuviera su propio criterio, un cambio en uno dejaría al otro con el viejo.
  const incoherentes = lineasQueNoCierran(incluidas).length;

  // La suma de los subtotales impresos contra el total del documento. Informa,
  // no bloquea: una diferencia de centavos no puede frenar a quien está
  // revisando renglón por renglón.
  const cuadre = useMemo(
    () =>
      verificarSumaDeSubtotales({
        subtotales: (documento?.lineas || []).map((linea) => linea.subtotal),
        totalDocumento: documento?.totalDocumento,
        hayTotalImpreso: documento?.hayTotalImpreso,
      }),
    [documento]
  );
  const total = incluidas.reduce((suma, linea) => {
    const costo = linea.origenPrecio === ORIGEN_PRECIO.PAPEL ? linea.precioPapel : linea.precioSistema;
    return suma + (Number(linea.cantidadPedido) || 0) * (Number(costo) || 0);
  }, 0);

  const visibles = lineas.filter((linea) => {
    if (filtro === "sin-vinculo") return linea.incluida !== false && !linea.productoLocalId;
    if (filtro === "precios") return linea.incluida !== false && linea.diferentes;
    if (filtro === "listas") return linea.incluida !== false && lineaLista(linea);
    return true;
  });

  const cambiarProveedor = (valor) => {
    setProveedorId(valor);
    setProveedorNombre("");
    setArchivo(null);
    setDocumento(null);
    setLineas([]);
    setEstado("elegir");
    setError("");
  };

  const analizar = async (seleccionado) => {
    if (!seleccionado || !proveedorId || !productos.length) return;
    setEstado("analizando");
    setError("");
    const form = new FormData();
    form.append("archivo", seleccionado);

    let respuesta;
    try {
      respuesta = await fetch("/api/compras-proveedor/importar/analizar", {
        method: "POST",
        credentials: "include",
        body: form,
      });
    } catch {
      setError("Se cortó la conexión mientras se analizaba. Mantené esta pantalla abierta y tocá Reintentar.");
      setEstado("elegir");
      return;
    }

    let data;
    try {
      data = await respuesta.json();
    } catch {
      setError("El servidor devolvió una respuesta inválida. Reintentá.");
      setEstado("elegir");
      return;
    }
    if (!data.ok) {
      setError(data.error || "No se pudo leer el archivo.");
      setEstado("elegir");
      return;
    }

    setDocumento(data.documento);
    setLineas(
      prepararLineasImportadas({
        lineas: data.documento.lineas,
        productos,
        // La receta de LECTURA le gana a la de impuestos en la escala del
        // precio: aquélla contesta por el proveedor entero y ésta por el formato
        // que se tiene delante, que es más específico.
        facturaPor: recetaEnUso?.facturaPor ?? facturaPor,
        hayColumnaSubtotal:
          (lectura.hayColumnaSubtotal ?? data.documento.hayColumnaSubtotal) === true,
        // Los dos escalones que hasta ahora no se pasaban nunca.
        cantidadEn: lectura.cantidadEn,
        toleranciaEscalaPct: lectura.toleranciaEscalaPct,
      }).map((linea) => ({ ...linea, incluida: true }))
    );
    setFiltro("todas");
    setEstado("revisar");
  };

  /**
   * VUELVE A ARMAR LAS LÍNEAS CON OTRA RECETA, SIN VOLVER A LEER EL ARCHIVO.
   *
   * ── POR QUÉ NO SE REANALIZA DE VERDAD ─────────────────────────────────
   *
   * Lo que la receta cambia es cómo se INTERPRETA lo leído —qué significa la
   * cantidad, en qué escala está el precio, si hay columna de importe—, no qué
   * dice el papel. Volver a subir el archivo gastaría otra lectura del modelo
   * para obtener exactamente los mismos renglones, y encima tardaría treinta
   * segundos cada vez que alguien prueba una explicación.
   *
   * `documento` conserva lo leído tal cual, así que probar una receta es
   * instantáneo y gratis. Es lo que hace usable el paso de "corregir la
   * explicación": si cada intento costara una lectura, nadie iteraría.
   *
   * La receta llega por parámetro y no del estado porque React todavía no lo
   * actualizó cuando esto se llama: leerlo daría la receta anterior.
   */
  const repreparar = (receta) => {
    if (!documento?.lineas?.length) return;
    const params = parametrosDeLectura(receta);
    setLineas(
      prepararLineasImportadas({
        lineas: documento.lineas,
        productos,
        facturaPor: receta?.facturaPor ?? facturaPor,
        hayColumnaSubtotal:
          (params.hayColumnaSubtotal ?? documento.hayColumnaSubtotal) === true,
        cantidadEn: params.cantidadEn,
        toleranciaEscalaPct: params.toleranciaEscalaPct,
      }).map((linea) => ({ ...linea, incluida: true }))
    );
    setFiltro("todas");
  };

  // ── EL FLUJO DE "EXPLICAR CÓMO LEER ESTE DOCUMENTO" ────────────────────
  //
  //   1. escribir  →  2. interpretar (sin escribir nada)  →  3. vista previa
  //   4. corregir la explicación   5. usar solo esta vez   6. confirmar y recordar
  //
  // Los pasos 4 y 5 son los que hacen que valga la pena: probar una explicación
  // sin comprometerse. Por eso interpretar y guardar son dos rutas distintas, y
  // la de interpretar no tiene ninguna escritura.

  const interpretar = async () => {
    if (!explicacion.trim() || interpretando) return;
    setInterpretando(true);
    setErrorReceta("");
    try {
      const respuesta = await fetch("/api/compras-proveedor/recetas-lectura/interpretar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explicacion, proveedorNombre }),
      });
      const data = await respuesta.json();
      if (!data.ok) throw new Error(data.error || "No se pudo interpretar la explicación.");
      if (!data.aporta) {
        throw new Error(
          "No se entendió ninguna columna ni ninguna regla. Probá diciendo qué columna es cada una."
        );
      }
      setVistaPrevia(data);
    } catch (e) {
      setVistaPrevia(null);
      setErrorReceta(e?.message || "No se pudo interpretar la explicación.");
    } finally {
      setInterpretando(false);
    }
  };

  /**
   * USAR SOLO ESTA VEZ: se aplica y NO se guarda en ningún lado.
   *
   * Si ya había un documento analizado, se vuelve a analizar con la receta
   * puesta. No alcanza con recalcular las líneas: la receta puede cambiar qué
   * significa la cantidad, y eso se resuelve al preparar, no después.
   */
  const usarSoloEstaVez = async () => {
    if (!vistaPrevia?.receta) return;
    setRecetaEnUso(vistaPrevia.receta);
    setRecetaSoloEstaVez(true);
    setRecetaElegidaId("");
    setExplicando(false);
    repreparar(vistaPrevia.receta);
  };

  const confirmarYRecordar = async () => {
    if (!vistaPrevia?.receta || guardandoReceta) return;
    const nombre = nombreVariante.trim();
    if (!nombre) {
      setErrorReceta(
        "Poné un nombre para este formato, por ejemplo Consumidor Final. Es lo que después " +
          "distingue una variante de la otra."
      );
      return;
    }
    setGuardandoReceta(true);
    setErrorReceta("");
    try {
      const respuesta = await fetch("/api/compras-proveedor/recetas-lectura/guardar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: Number(proveedorId),
          nombre,
          receta: vistaPrevia.receta,
          explicacion,
        }),
      });
      const data = await respuesta.json();
      if (!data.ok) throw new Error(data.error || "No se pudo guardar la receta.");

      const guardada = {
        id: data.receta.id,
        nombre: data.receta.nombre,
        receta: vistaPrevia.receta,
        enCastellano: vistaPrevia.enCastellano,
        explicacion,
        version: data.receta.version,
      };
      setRecetasLectura((previas) => [
        ...previas.filter((r) => r.id !== guardada.id),
        guardada,
      ]);
      setRecetaElegidaId(String(guardada.id));
      setRecetaEnUso(guardada.receta);
      setRecetaSoloEstaVez(false);
      setExplicando(false);
      setVistaPrevia(null);
      repreparar(guardada.receta);
    } catch (e) {
      setErrorReceta(e?.message || "No se pudo guardar la receta.");
    } finally {
      setGuardandoReceta(false);
    }
  };

  /** Elegir una variante ya guardada, y releer el documento con ella. */
  const elegirVariante = (id) => {
    setRecetaElegidaId(id);
    setRecetaSoloEstaVez(false);
    const elegida = recetasLectura.find((r) => String(r.id) === String(id)) || null;
    setRecetaEnUso(elegida?.receta ?? null);
    repreparar(elegida?.receta ?? null);
  };

  const seleccionarArchivo = async (seleccionado) => {
    if (!seleccionado) return;
    setArchivo(seleccionado);
    await analizar(seleccionado);
  };

  const reintentar = async () => {
    if (!archivo || estado === "analizando") return;
    await analizar(archivo);
  };

  const cambiarProducto = (idLinea, productoLocalId) => {
    const producto = productosPorId.get(String(productoLocalId));
    setLineas((previas) =>
      previas.map((linea) =>
        linea.id === idLinea
          ? // `productoElegidoAMano` es lo que después distingue, en la memoria
            // del proveedor, una decisión de una deducción. Se marca acá porque
            // acá es donde una persona eligió, y en ningún otro lado consta.
            {
              ...recalcularLineaConProducto(linea, producto, { facturaPor, hayColumnaSubtotal }),
              productoElegidoAMano: true,
            }
          : linea
      )
    );
  };

  const cambiarLinea = (idLinea, patch, { recalcularPrecio = false, papelManual = null } = {}) => {
    setLineas((previas) =>
      previas.map((linea) => {
        if (linea.id !== idLinea) return linea;
        const siguiente = { ...linea, ...patch };
        if (!recalcularPrecio) return siguiente;
        const producto = productosPorId.get(String(siguiente.productoLocalId));
        // El recálculo NO se hace acá: lo hace la misma pieza que preparó las
        // líneas. Si la pantalla armara su propia versión, el día que la regla
        // de prioridad cambie mostraría un precio y guardaría otro.
        return recalcularPrecioDeLinea(siguiente, producto, {
          facturaPor,
          hayColumnaSubtotal,
          papelManual,
        });
      })
    );
  };

  /**
   * CAMBIAR DE UNIDAD CONVIERTE CANTIDAD Y PRECIO JUNTOS.
   *
   * Antes esto era `cambiarLinea(..., { unidadPedido }, { recalcularPrecio })`,
   * que convertía el PRECIO y dejaba la cantidad donde estaba. Con el renglón
   * real de 50 unidades a $3.360 eso daba 50 bultos a $33.600 — diez veces el
   * subtotal del papel. La conversión es una sola operación y por eso vive en
   * una sola función.
   */
  const cambiarUnidad = (idLinea, unidadDestino) => {
    setLineas((previas) =>
      previas.map((linea) => {
        if (linea.id !== idLinea) return linea;
        const producto = productosPorId.get(String(linea.productoLocalId));
        return cambiarUnidadDeLinea(linea, producto, {
          unidadDestino,
          facturaPor,
          hayColumnaSubtotal,
        });
      })
    );
  };

  /**
   * Confirma una conversión que no da entera, redondeando hacia arriba.
   *
   * No se hace sola: 47 unidades no son ni 4 ni 5 bultos, y elegir por el
   * usuario cambia lo que se le pide al proveedor.
   */
  const confirmarConversion = (idLinea) => {
    setLineas((previas) =>
      previas.map((linea) => {
        if (linea.id !== idLinea || !linea.conversionPendiente) return linea;
        const producto = productosPorId.get(String(linea.productoLocalId));
        return cambiarUnidadDeLinea(linea, producto, {
          unidadDestino: linea.conversionPendiente.hacia,
          facturaPor,
          hayColumnaSubtotal,
          redondear: true,
        });
      })
    );
  };

  /**
   * CORREGIR QUÉ SIGNIFICA LA CANTIDAD DEL PAPEL.
   *
   * Es la corrección de la LECTURA, no de cómo se guarda, y por eso recalcula la
   * base: es el único punto donde la cantidad en unidades puede cambiar después
   * del análisis. Todo lo demás deriva de ahí.
   *
   * Cada opción ofrecida trae SU lectura y SU unidad de pedido, calculadas por
   * la misma pieza que decidió que cierran. La pantalla no vuelve a deducir
   * nada: si dedujera, podría elegir una lectura distinta de la que se verificó.
   */
  const corregirLectura = (idLinea, opcion) => {
    setLineas((previas) =>
      previas.map((linea) => {
        if (linea.id !== idLinea) return linea;
        const producto = productosPorId.get(String(linea.productoLocalId));
        const conLectura = cambiarUnidadDelPapel(linea, producto, {
          unidadPapel: opcion.lectura,
          facturaPor,
          hayColumnaSubtotal,
        });
        return cambiarUnidadDeLinea(conLectura, producto, {
          unidadDestino: opcion.unidad,
          facturaPor,
          hayColumnaSubtotal,
        });
      })
    );
  };

  /**
   * El precio final escrito a mano gana sobre el calculado, y queda marcado.
   *
   * Se pasa la cadena vacía —y no `null`— cuando el campo se borra: `null`
   * significa "no opino, conservá lo que había" y dejaría el valor viejo pegado
   * para siempre. La cadena vacía significa "volvé a calcularlo del papel".
   */
  const escribirPrecioPapel = (idLinea, crudo) => {
    cambiarLinea(idLinea, {}, { recalcularPrecio: true, papelManual: normalizarDecimal(crudo) });
  };

  const confirmarProducto = (idLinea) => {
    setLineas((previas) =>
      previas.map((linea) =>
        linea.id === idLinea
          ? { ...linea, confirmada: true, productoElegidoAMano: true }
          : linea
      )
    );
  };

  const elegirPrecio = (idLinea, origenPrecio) => {
    setLineas((previas) =>
      previas.map((linea) =>
        linea.id === idLinea ? { ...linea, origenPrecio, precioConfirmado: true } : linea
      )
    );
  };

  const guardar = async () => {
    if (pendientes || incoherentes || !incluidas.length || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const items = consolidarLineasImportadas({ lineas: incluidas, productosPorId });
      const url = pedidoId
        ? `/api/compras-proveedor/importar/aplicar/${pedidoId}`
        : "/api/compras-proveedor/crear";
      const respuesta = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedorId: Number(proveedorId), items }),
      });
      const data = await respuesta.json();
      if (!data.ok) throw new Error(data.error || "No se pudo crear el borrador.");
      const idCreado = pedidoId || data.pedidoId || data.item?.id;
      router.push(`/modulos/compras-proveedor/nueva?pedidoId=${idCreado}&importado=1`);
    } catch (e) {
      setError(e?.message || "No se pudo crear el borrador.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <main className="min-h-screen p-3 sm:p-5 pb-28">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SunmiBackButton href={pedidoId ? `/modulos/compras-proveedor/nueva?pedidoId=${pedidoId}` : "/modulos/compras-proveedor/nueva"} />
          {pedidoId && <SunmiPill color="cyan">Continúa borrador #{pedidoId}</SunmiPill>}
        </div>
        <SunmiHeader
          title="Crear borrador desde archivo"
          color="cyan"
          subtitle="Foto, PDF o Excel. Primero revisás productos y precios; recién después se guarda."
        />
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.xlsx,.xls"
          onChange={(e) => seleccionarArchivo(e.target.files?.[0])}
        />

        {estado !== "revisar" && (
          <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
            <SunmiPanel className="p-4">
              <p className="text-base font-semibold sunmi-text-strong mb-1">1. Proveedor</p>
              <p className="text-sm2 sunmi-text-muted mb-3">
                La memoria de códigos y nombres queda separada por proveedor.
              </p>
              {pedidoId ? (
                <div className="rounded-lg sunmi-control px-3 py-2 text-base font-semibold">
                  {proveedorNombre || "Cargando proveedor..."}
                </div>
              ) : (
                <SunmiSelect value={proveedorId} onChange={(e) => cambiarProveedor(e.target.value)}>
                  <option value="">Elegir proveedor...</option>
                  {proveedores.map((proveedor) => (
                    <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                  ))}
                </SunmiSelect>
              )}
              {proveedorId && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <SunmiPill color="slate">{productos.length} productos disponibles</SunmiPill>
                  <SunmiPill color={tieneReceta ? "cyan" : "slate"}>
                    Precio del papel por {facturaPor === "BULTO" ? "bulto" : "unidad"}
                  </SunmiPill>
                  {recetaEnUso && (
                    <SunmiPill color="cyan">
                      {recetaSoloEstaVez ? "Formato: solo esta vez" : `Formato: ${nombreDeLaReceta}`}
                    </SunmiPill>
                  )}
                </div>
              )}

              {/*
                EXPLICAR CÓMO SE LEE ESTE DOCUMENTO.
                Vive acá y no en una pantalla de configuración aparte porque el
                momento en que alguien se da cuenta de que el formato se lee mal
                es MIRANDO el resultado, con el papel en la mano. Mandarlo a otra
                pantalla es pedirle que se acuerde después.
              */}
              {proveedorId && (
                <div className="mt-4 pt-3 border-t sunmi-divider">
                  {recetasLectura.length > 0 && (
                    <label className="block mb-3">
                      <span className="block text-sm2 font-semibold sunmi-text-muted mb-1">
                        Formato del documento
                      </span>
                      <SunmiSelect
                        value={recetaElegidaId}
                        onChange={(e) => elegirVariante(e.target.value)}
                      >
                        {/*
                          Sin opción elegida por defecto cuando hay varias: el
                          sistema no puede saber cuál papel tenés en la mano, y
                          adivinar significa leer las columnas cambiadas de lugar.
                        */}
                        <option value="">Sin receta: se lee como venga</option>
                        {recetasLectura.map((variante) => (
                          <option key={variante.id} value={variante.id}>
                            {variante.nombre}
                          </option>
                        ))}
                      </SunmiSelect>
                    </label>
                  )}

                  {!explicando ? (
                    <SunmiButton color="slate" type="button" onClick={() => setExplicando(true)}>
                      <MessageSquareText size={15} />
                      Explicar cómo leer este documento
                    </SunmiButton>
                  ) : (
                    <div>
                      <label className="block">
                        <span className="block text-sm2 font-semibold sunmi-text-muted mb-1">
                          Contá cómo está armada la tabla
                        </span>
                        <SunmiTextarea
                          value={explicacion}
                          onChange={(e) => setExplicacion(e.target.value)}
                          rows={4}
                          maxLength={LARGO_MAXIMO_EXPLICACION}
                          placeholder="Ej: la primera columna es la cantidad enviada en unidades. Si está vacía, el producto no fue enviado. Después viene el nombre, el precio unitario y el total del renglón."
                          className="text-sm2"
                        />
                      </label>
                      <p className="text-xs sunmi-text-muted mt-1">
                        Se traduce a reglas de lectura. Cantidades, importes y descuentos se
                        vuelven a leer de cada archivo: no se guarda ningún número de esta factura.
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <SunmiButton
                          type="button"
                          onClick={interpretar}
                          disabled={interpretando || !explicacion.trim()}
                        >
                          {interpretando ? "Interpretando..." : vistaPrevia ? "Corregir explicación" : "Ver cómo quedaría"}
                        </SunmiButton>
                        <SunmiButton
                          color="slate"
                          type="button"
                          onClick={() => {
                            setExplicando(false);
                            setVistaPrevia(null);
                            setErrorReceta("");
                          }}
                        >
                          Cancelar
                        </SunmiButton>
                      </div>

                      {errorReceta && (
                        <p className="mt-2 text-sm2 sunmi-text-danger">{errorReceta}</p>
                      )}

                      {/* LA VISTA PREVIA: lo que se ENTENDIÓ, antes de aplicar nada. */}
                      {vistaPrevia && (
                        <div className="mt-3 rounded-lg border sunmi-divider sunmi-control px-3 py-2">
                          <p className="text-sm2 font-semibold sunmi-text-strong mb-1">
                            Así se va a leer
                          </p>
                          <ul className="text-sm2 sunmi-text-muted space-y-1">
                            {vistaPrevia.enCastellano.map((linea) => (
                              <li key={linea}>· {linea}</li>
                            ))}
                          </ul>

                          {/*
                            Lo que NO entró se muestra SIEMPRE que haya algo. Sin
                            esto, alguien confirmaría una receta creyendo que dice
                            algo que no dice.
                          */}
                          {Boolean(vistaPrevia.descartados?.length) && (
                            <div className="mt-2 pt-2 border-t sunmi-divider">
                              <p className="text-sm2 font-semibold sunmi-text-warning">
                                Esto no se pudo usar
                              </p>
                              <ul className="text-sm2 sunmi-text-muted space-y-1 mt-1">
                                {vistaPrevia.descartados.map((item) => (
                                  <li key={item}>· {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-end gap-2">
                            <SunmiButton color="slate" type="button" onClick={usarSoloEstaVez}>
                              Usar solo esta vez
                            </SunmiButton>
                            <label className="min-w-0">
                              <span className="block text-xs sunmi-text-muted mb-1">
                                Nombre del formato
                              </span>
                              <SunmiInput
                                value={nombreVariante}
                                onChange={(e) => setNombreVariante(e.target.value)}
                                placeholder="Consumidor Final"
                                className="w-44"
                              />
                            </label>
                            <SunmiButton
                              type="button"
                              onClick={confirmarYRecordar}
                              disabled={guardandoReceta}
                            >
                              {guardandoReceta ? "Guardando..." : "Confirmar y recordar"}
                            </SunmiButton>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SunmiPanel>

            <SunmiPanel className="p-4">
              <p className="text-base font-semibold sunmi-text-strong mb-1">2. Archivo</p>
              <p className="text-sm2 sunmi-text-muted mb-3">
                El análisis no crea pedidos ni modifica costos del catálogo.
              </p>
              {estado === "analizando" ? (
                <div className="min-h-44 rounded-xl border-2 border-dashed sunmi-divider flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin sunmi-text-accent" />
                  <p className="text-base font-semibold sunmi-text-strong">Leyendo {archivo?.name}</p>
                  <p className="text-sm2 sunmi-text-muted">
                    Puede tardar cerca de un minuto. Mantené esta pantalla abierta.
                  </p>
                </div>
              ) : (
                <div className="min-h-44 rounded-xl border-2 border-dashed sunmi-divider sunmi-control flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <FileUp size={30} className="sunmi-text-accent" />
                  <SunmiButton
                    type="button"
                    disabled={!proveedorId || cargandoCatalogo || !productos.length}
                    onClick={() => inputRef.current?.click()}
                  >
                    Elegir archivo
                  </SunmiButton>
                  <span className="text-sm2 sunmi-text-muted">
                    <ImageIcon size={14} className="inline mr-1" /> Foto o PDF
                    <span className="mx-2">·</span>
                    <FileSpreadsheet size={14} className="inline mr-1" /> Excel
                  </span>
                  {!proveedorId && <span className="text-sm2 sunmi-text-warning">Elegí primero el proveedor.</span>}
                  {cargandoCatalogo && <span className="text-sm2 sunmi-text-muted">Cargando catálogo...</span>}
                </div>
              )}
              {error && estado === "elegir" && (
                <div className="mt-3 rounded-lg border sunmi-divider sunmi-control px-3 py-2">
                  <p className="text-sm2 sunmi-text-danger">{error}</p>
                  {archivo && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm2 sunmi-text-muted truncate min-w-0 flex-1">{archivo.name}</span>
                      <SunmiButton type="button" onClick={reintentar}>
                        <RefreshCw size={14} /> Reintentar análisis
                      </SunmiButton>
                    </div>
                  )}
                </div>
              )}
            </SunmiPanel>
          </div>
        )}

        {estado === "revisar" && (
          <>
            <SunmiPanel className="p-3 mb-3 sticky top-2 z-20 shadow-lg">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 mr-auto">
                  <p className="text-base font-semibold sunmi-text-strong truncate">{archivo?.name}</p>
                  <p className="text-sm2 sunmi-text-muted">
                    {incluidas.length} incluidas · {listas.length} listas · {pendientes} pendientes
                    {documento?.numeroPedido ? ` · documento ${documento.numeroPedido}` : ""}
                  </p>
                </div>
                <SunmiButton color="slate" type="button" onClick={() => inputRef.current?.click()} disabled={guardando}>
                  Cambiar archivo
                </SunmiButton>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {[
                  ["todas", `Todas (${lineas.length})`],
                  ["sin-vinculo", `Sin producto (${sinVinculo})`],
                  ["precios", `Precio distinto (${incluidas.filter((linea) => linea.diferentes).length})`],
                  ["listas", `Listas (${listas.length})`],
                ].map(([valor, etiqueta]) => (
                  <SunmiButton
                    key={valor}
                    type="button"
                    color={filtro === valor ? "primary" : "slate"}
                    className="whitespace-nowrap"
                    onClick={() => setFiltro(valor)}
                  >
                    {etiqueta}
                  </SunmiButton>
                ))}
              </div>
              {/*
                EL CUADRE DEL DOCUMENTO. Informa y no bloquea: el botón de
                guardar no lo mira. `cierra === null` es un tercer estado y se
                dice distinto — "no se pudo comparar" no es "cierra".
              */}
              {cuadre.cierra !== null && (
                <p className={`mt-2 text-sm2 ${cuadre.cierra ? "sunmi-text-muted" : "sunmi-text-warning"}`}>
                  {cuadre.cierra
                    ? `Los subtotales suman ${dinero(cuadre.suma)} y cierran con el total del documento.`
                    : `Los subtotales suman ${dinero(cuadre.suma)} contra un total de ${dinero(cuadre.total)}: ${dinero(Math.abs(cuadre.diferencia))} de diferencia. Revisá los renglones antes de guardar.`}
                </p>
              )}
            </SunmiPanel>

            <div className="space-y-3">
              {visibles.map((linea, indiceVisible) => {
                const producto = productosPorId.get(String(linea.productoLocalId));
                const incluida = linea.incluida !== false;
                // ── EL ORDEN DEL MOTOR SE RESPETA, NO SE RECALCULA ─────────
                //
                // Acá estaba el defecto. Se armaba un `Set` con
                // `linea.candidatos` y se ordenaba el catálogo por PERTENENCIA a
                // ese conjunto. Pero `candidatos` trae el catálogo ENTERO
                // puntuado —hace falta puntuarlo todo para poder ordenarlo—, así
                // que la pertenencia daba `true` para los 2.600 productos y el
                // `sort` era un no-op. Quedaba el orden en que venían de la API,
                // que es alfabético.
                //
                // Medido con "PHILIPS MORRIS CONV 10": el motor devolvía Philips
                // 10 con 124 puntos y Agua Oxigenada con −188, y el selector
                // mostraba Agua Oxigenada, Alcohol, Alfajor, y recién cuarto el
                // Philips. El ranking se calculaba entero y se tiraba.
                //
                // Ahora `sugeridos` es una lista CORTA y ORDENADA, y el resto va
                // abajo en su propio grupo.
                const sugeridosOrdenados = (linea.sugeridos || [])
                  .map((id) => productosPorId.get(String(id)))
                  .filter(Boolean);
                const idsSugeridos = new Set(sugeridosOrdenados.map((p) => p.productoLocalId));
                const resto = productos.filter((p) => !idsSugeridos.has(p.productoLocalId));
                const origenTexto = textoOrigenVinculo(linea.origenVinculo);
                const numeroReal = lineas.indexOf(linea) + 1;
                return (
                  <SunmiPanel
                    key={linea.id}
                    className={`p-3 sm:p-4 ${incluida ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="h-7 w-7 rounded-full sunmi-control flex items-center justify-center text-xs2 font-bold shrink-0">
                        {numeroReal || indiceVisible + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-semibold sunmi-text-strong">{linea.descripcion}</p>
                            <p className="text-sm2 sunmi-text-muted mt-1">
                              {linea.codigo ? `Código del papel: ${linea.codigo} · ` : "Sin código en el papel · "}
                              {linea.cantidad ?? "?"} {linea.unidad || "sin unidad"}
                            </p>
                            {origenTexto && <SunmiPill color="cyan">{origenTexto}</SunmiPill>}
                          </div>
                          <SunmiButton
                            type="button"
                            color="slate"
                            className="shrink-0"
                            onClick={() => cambiarLinea(linea.id, { incluida: !incluida })}
                            aria-label={incluida ? "No incluir línea" : "Volver a incluir línea"}
                          >
                            {incluida ? <X size={15} /> : <Check size={15} />}
                          </SunmiButton>
                        </div>

                        {incluida && (
                          <div className="mt-3 grid lg:grid-cols-2 gap-3">
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm2 font-semibold sunmi-text-muted mb-1">Producto del sistema</label>
                                <SunmiSelectAdv value={linea.productoLocalId} onChange={(valor) => cambiarProducto(linea.id, valor)} searchable>
                                  <SunmiSelectOption value="">Elegir producto...</SunmiSelectOption>
                                  {sugeridosOrdenados.length > 0 && (
                                    <SunmiSelectOption value="" encabezado>Sugeridos para esta línea</SunmiSelectOption>
                                  )}
                                  {sugeridosOrdenados.map((opcion) => (
                                    <SunmiSelectOption key={`sug-${opcion.productoLocalId}`} value={String(opcion.productoLocalId)}>
                                      {`${opcion.codigoInterno ? `${opcion.codigoInterno} · ` : ""}${opcion.nombre}`}
                                    </SunmiSelectOption>
                                  ))}
                                  <SunmiSelectOption value="" encabezado>Todos los productos</SunmiSelectOption>
                                  {resto.map((opcion) => (
                                    <SunmiSelectOption key={opcion.productoLocalId} value={String(opcion.productoLocalId)}>
                                      {`${opcion.codigoInterno ? `${opcion.codigoInterno} · ` : ""}${opcion.nombre}`}
                                    </SunmiSelectOption>
                                  ))}
                                </SunmiSelectAdv>
                              </div>

                              {producto && (
                                <div className="flex flex-wrap items-end gap-2">
                                  <label className="block">
                                    <span className="block text-sm2 font-semibold sunmi-text-muted mb-1">Cantidad</span>
                                    <SunmiInput
                                      type="text"
                                      inputMode="numeric"
                                      value={linea.cantidadPedido}
                                      onChange={(e) => cambiarLinea(linea.id, { cantidadPedido: e.target.value.replace(/[^\d]/g, "") })}
                                      className="w-24 text-center tabular-nums"
                                    />
                                  </label>
                                  {permiteToggleUnidad(baseDeProducto(producto)) ? (
                                    <label className="block w-36">
                                      <span className="block text-sm2 font-semibold sunmi-text-muted mb-1">Unidad de pedido</span>
                                      <SunmiSelect
                                        value={linea.unidadPedido}
                                        onChange={(e) => cambiarUnidad(linea.id, e.target.value)}
                                      >
                                        <option value="BULTO">Bulto</option>
                                        <option value="UNIDAD">Unidad</option>
                                      </SunmiSelect>
                                    </label>
                                  ) : (
                                    <div className="min-w-24">
                                      <span className="block text-sm2 font-semibold sunmi-text-muted mb-1">Unidad</span>
                                      <span className="block rounded-md sunmi-control px-3 py-2 text-sm2">
                                        {naturalezaLinea(baseDeProducto(producto)) === "FIAMBRE"
                                          ? "Pieza"
                                          : naturalezaLinea(baseDeProducto(producto)) === "KG"
                                          ? "Kg"
                                          : "Unidad"}
                                      </span>
                                    </div>
                                  )}
                                  {linea.equivalencia && <span className="text-sm2 sunmi-text-accent">{linea.equivalencia}</span>}
                                  {linea.requiereConfirmacionDeUnidad && linea.conversionPendiente && (
                                    <div className="w-full rounded-lg border sunmi-divider sunmi-control px-3 py-2 flex items-start gap-2">
                                      <AlertTriangle size={15} className="sunmi-text-warning shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm2 sunmi-text-warning">
                                          {linea.conversionPendiente.unidades} unidades no dan bultos enteros de{" "}
                                          {linea.conversionPendiente.factor}. Serían {linea.conversionPendiente.bultos} bultos,
                                          o sea más de lo que dice el papel.
                                        </p>
                                        <SunmiButton className="mt-2" type="button" onClick={() => confirmarConversion(linea.id)}>
                                          Pedir {linea.conversionPendiente.bultos} bultos
                                        </SunmiButton>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {linea.requiereRevision && !linea.confirmada && (
                                <div className="rounded-lg border sunmi-divider sunmi-control px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle size={15} className="sunmi-text-warning shrink-0 mt-0.5" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm2 sunmi-text-warning">{linea.motivoRevision}</p>
                                    {producto && Number(linea.cantidadPedido) >= 1 && (
                                      <SunmiButton className="mt-2" type="button" onClick={() => confirmarProducto(linea.id)}>
                                        <SearchCheck size={14} /> Confirmar producto
                                      </SunmiButton>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl sunmi-control p-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div className={`rounded-lg p-3 border sunmi-divider ${linea.origenPrecio === ORIGEN_PRECIO.SISTEMA ? "sunmi-surface" : ""}`}>
                                  <p className="text-sm2 sunmi-text-muted">Precio del sistema</p>
                                  <p className="text-lg font-bold sunmi-text-strong mt-1">{dinero(linea.precioSistema)}</p>
                                  <p className="text-xs sunmi-text-muted">por {linea.unidadPedido === "BULTO" ? "bulto" : "unidad"}</p>
                                </div>
                                <div className={`rounded-lg p-3 border sunmi-divider ${linea.origenPrecio === ORIGEN_PRECIO.PAPEL ? "sunmi-surface" : ""}`}>
                                  <p className="text-sm2 sunmi-text-muted">Precio del papel</p>
                                  <p className="text-lg font-bold sunmi-text-strong mt-1">{dinero(linea.precioPapel)}</p>
                                  <p className="text-xs sunmi-text-muted">por {linea.unidadPedido === "BULTO" ? "bulto" : "unidad"}</p>
                                </div>
                              </div>

                              {/*
                                EL DESGLOSE DE DÓNDE SALIÓ EL PRECIO DEL PAPEL.
                                No es decoración: con bonificación, la columna de
                                precio es la de LISTA y lo que se paga sale del
                                importe del renglón. Sin ver los tres números,
                                un precio final más bajo que el impreso parece un
                                error de lectura.
                              */}
                              <div className="mt-3 rounded-lg border sunmi-divider px-3 py-2">
                                <p className="text-sm2 font-semibold sunmi-text-muted mb-1">Cómo se calculó el precio del papel</p>
                                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm2">
                                  <dt className="sunmi-text-muted min-w-0">Precio impreso</dt>
                                  <dd className="text-right tabular-nums sunmi-text-strong">{dinero(linea.precioUnitario)}</dd>
                                  <dt className="sunmi-text-muted min-w-0">Bonificación</dt>
                                  <dd className="text-right tabular-nums sunmi-text-strong">{porcentaje(linea.bonificacionPct) ?? "Sin bonificación"}</dd>
                                  <dt className="sunmi-text-muted min-w-0">Subtotal del renglón</dt>
                                  <dd className="text-right tabular-nums sunmi-text-strong">{dinero(linea.subtotal)}</dd>
                                  <dt className="sunmi-text-muted min-w-0">Cantidad del papel</dt>
                                  <dd className="text-right tabular-nums sunmi-text-strong">
                                    {linea.cantidad ?? "?"} {linea.unidad || ""}
                                  </dd>
                                </dl>
                                {linea.origenPrecioPapel && (
                                  <p className="mt-2 text-xs sunmi-text-accent">
                                    {TEXTO_ORIGEN_PAPEL[linea.origenPrecioPapel]}
                                  </p>
                                )}
                                {linea.precioPapelEditado && (
                                  <p className="mt-2 text-xs sunmi-text-accent">Precio escrito a mano</p>
                                )}
                              </div>

                              <label className="block mt-3">
                                <span className="block text-sm2 font-semibold sunmi-text-muted mb-1">
                                  Precio final del papel por {facturaPor === "BULTO" ? "bulto" : "unidad"}
                                </span>
                                <SunmiInput
                                  type="text"
                                  inputMode="decimal"
                                  value={linea.precioFinalPapelCrudo ?? ""}
                                  onChange={(e) => escribirPrecioPapel(linea.id, e.target.value)}
                                  placeholder="Sin precio en el papel"
                                  className="tabular-nums"
                                />
                              </label>

                              {linea.papelRequiereRevision && (
                                <div className="mt-3 rounded-lg border sunmi-divider sunmi-control px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle size={15} className="sunmi-text-warning shrink-0 mt-0.5" />
                                  <p className="text-sm2 sunmi-text-warning min-w-0 flex-1">{linea.papelMotivoRevision}</p>
                                </div>
                              )}

                              {/*
                                EL CANDADO DE MAGNITUD.
                                Cambiar de unidad reexpresa la misma compra: si
                                `cantidad × precio` deja de dar el importe del
                                renglón, hay un factor de más metido en la
                                interpretación. Se dice cuál fue, con los dos
                                números a la vista, y se ofrecen las maneras de
                                escribirlo que sí cierran. El importe NUNCA se
                                corrige solo: ajustarlo escondería la lectura
                                equivocada dejándola adentro del pedido.
                              */}
                              {linea.coherencia?.bloquea && (
                                <div className="mt-3 rounded-lg border sunmi-divider sunmi-control px-3 py-2">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle size={15} className="sunmi-text-danger shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm2 font-semibold sunmi-text-danger">
                                        El renglón no cierra contra el importe del papel
                                      </p>
                                      <p className="text-sm2 sunmi-text-muted mt-1">
                                        {linea.explicacionCoherencia?.comoSeLeyo}.
                                      </p>
                                      <p className="text-sm2 sunmi-text-strong mt-1">
                                        {linea.explicacionCoherencia?.cuenta}
                                      </p>
                                      <p className="text-xs sunmi-text-muted mt-1">
                                        Diferencia: {dinero(linea.coherencia.diferencia)}
                                      </p>
                                    </div>
                                  </div>

                                  {Boolean(linea.representacionesValidas?.length) && (
                                    <div className="mt-2 pt-2 border-t sunmi-divider">
                                      <p className="text-sm2 font-semibold sunmi-text-muted mb-1">
                                        Así sí cierra
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {linea.representacionesValidas.map((opcion) => (
                                          <SunmiButton
                                            key={`${opcion.lectura}-${opcion.unidad}`}
                                            color="slate"
                                            type="button"
                                            onClick={() => corregirLectura(linea.id, opcion)}
                                          >
                                            {opcion.cantidad} {opcion.unidad === "BULTO" ? "bulto" : "unidad"}
                                            {opcion.cantidad === 1 ? "" : opcion.unidad === "BULTO" ? "s" : "es"}
                                            {" × "}
                                            {dinero(opcion.precio)}
                                          </SunmiButton>
                                        ))}
                                      </div>
                                      <p className="text-xs sunmi-text-muted mt-2">
                                        También podés corregir el precio final más arriba, o elegir otro producto
                                        si el bulto del sistema no es el de este proveedor.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/*
                                Otra cosa distinta, y por eso otro cartel: se está
                                pidiendo una cantidad que no es la del papel. Es
                                una decisión —faltaban tres, se piden tres menos—
                                y no una lectura equivocada, así que avisa y no
                                frena.
                              */}
                              {linea.cantidadDifiereDelPapel && !linea.coherencia?.bloquea && (
                                <div className="mt-3 rounded-lg border sunmi-divider sunmi-control px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle size={15} className="sunmi-text-warning shrink-0 mt-0.5" />
                                  <p className="text-sm2 sunmi-text-warning min-w-0 flex-1">
                                    El papel trae {linea.cantidadSegunElPapel} y se va a pedir {linea.cantidadPedido}.
                                  </p>
                                </div>
                              )}

                              {linea.diferentes && (
                                <div className="mt-3 rounded-lg border sunmi-divider sunmi-control px-3 py-2">
                                  <p className="text-sm2 font-semibold sunmi-text-warning">
                                    Diferencia: {linea.diferencia >= 0 ? "+" : ""}{dinero(linea.diferencia)}
                                    {linea.diferenciaPct !== null ? ` (${linea.diferenciaPct >= 0 ? "+" : ""}${NF_PORCENTAJE.format(linea.diferenciaPct)}%)` : ""}
                                  </p>
                                  <p className="text-xs sunmi-text-muted mt-1">Elegí qué precio tendrá esta línea del borrador.</p>
                                </div>
                              )}

                              <div className="mt-3 grid sm:grid-cols-2 gap-2">
                                <SunmiButton
                                  type="button"
                                  color={linea.origenPrecio === ORIGEN_PRECIO.SISTEMA && linea.precioConfirmado ? "primary" : "slate"}
                                  disabled={linea.precioSistema === null}
                                  onClick={() => elegirPrecio(linea.id, ORIGEN_PRECIO.SISTEMA)}
                                >
                                  Mantener sistema
                                </SunmiButton>
                                <SunmiButton
                                  type="button"
                                  color={linea.origenPrecio === ORIGEN_PRECIO.PAPEL && linea.precioConfirmado ? "primary" : "slate"}
                                  disabled={linea.precioPapel === null}
                                  onClick={() => elegirPrecio(linea.id, ORIGEN_PRECIO.PAPEL)}
                                >
                                  Usar precio del papel
                                </SunmiButton>
                              </div>
                              <p className="mt-3 text-right text-base font-semibold sunmi-text-strong">
                                Subtotal: {dinero((Number(linea.cantidadPedido) || 0) * (Number(linea.origenPrecio === ORIGEN_PRECIO.PAPEL ? linea.precioPapel : linea.precioSistema) || 0))}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </SunmiPanel>
                );
              })}
              {!visibles.length && (
                <SunmiPanel className="p-6 text-center sunmi-text-muted">No hay líneas para este filtro.</SunmiPanel>
              )}
            </div>

            {/*
              z-40, el MISMO que usa el pie de "Nuevo pedido". No es un número
              elegido: con `z-30` la BottomNav del modo topbar —`fixed bottom-0
              z-40`, 56 px de alto— quedaba ENCIMA, y a 390 px los tres puntos
              del botón "Crear borrador" devolvían el enlace de la barra. O sea
              que en ese modo el borrador no se podía crear desde el teléfono:
              cada toque navegaba a otra pantalla.
            */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t sunmi-divider sunmi-surface shadow-lg">
              <div className="max-w-6xl mx-auto p-3 flex flex-wrap items-center gap-3">
                <div className="mr-auto min-w-0">
                  <p className="text-sm2 sunmi-text-muted">
                    {pendientes ? `${pendientes} por revisar` : `${listas.length} líneas listas`}
                    {diferencias ? ` · ${diferencias} precios sin decidir` : ""}
                    {sinPrecioResuelto ? ` · ${sinPrecioResuelto} sin precio del papel` : ""}
                    {incoherentes ? ` · ${incoherentes} no cierran contra el papel` : ""}
                  </p>
                  <p className="text-lg font-bold sunmi-text-strong">Total del borrador: {dinero(total)}</p>
                </div>
                <SunmiButton color="slate" type="button" onClick={() => router.back()} disabled={guardando}>
                  Cancelar
                </SunmiButton>
                {/*
                  `incoherentes` va explícito además de `pendientes`, que hoy ya
                  lo contiene: son dos motivos distintos para no poder guardar y
                  el día que alguien afloje `lineaLista` —para poder confirmar un
                  precio, por ejemplo— este candado tiene que seguir en pie solo.
                */}
                <SunmiButton
                  type="button"
                  onClick={guardar}
                  disabled={guardando || pendientes > 0 || incoherentes > 0 || !incluidas.length}
                >
                  {guardando ? "Creando..." : pedidoId ? "Agregar al borrador" : "Crear borrador"}
                </SunmiButton>
              </div>
              {error && <p className="max-w-6xl mx-auto px-3 pb-2 text-sm2 sunmi-text-danger">{error}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
