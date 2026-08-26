"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileUp,
  Image as ImageIcon,
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
import { naturalezaLinea, permiteToggleUnidad } from "@/lib/compras-proveedor/calculoPedido";
import { baseDeProducto } from "@/lib/compras-proveedor/importacion/merge";
import { consolidarLineasImportadas } from "@/lib/compras-proveedor/importacion/payload";
import {
  prepararLineasImportadas,
  recalcularLineaConProducto,
} from "@/lib/compras-proveedor/importacion/prepararLineas";
import { ORIGEN_PRECIO, preciosComparables } from "@/lib/compras-proveedor/importacion/precios";

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

function lineaLista(linea) {
  const cantidad = Number(linea.cantidadPedido);
  return Boolean(
    linea.productoLocalId &&
      Number.isInteger(cantidad) &&
      cantidad >= 1 &&
      ["BULTO", "UNIDAD"].includes(linea.unidadPedido) &&
      linea.confirmada &&
      linea.precioConfirmado
  );
}

function textoOrigenVinculo(origen) {
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
        const [respuestaProductos, respuestaReceta] = await Promise.all([
          fetch(`/api/compras-proveedor/productos?proveedorId=${proveedorId}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/compras-proveedor/recetas/obtener?proveedorId=${proveedorId}`, {
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
        if (!vigente) return;
        setProductos(dataProductos.items || []);
        if (dataReceta?.ok) {
          setFacturaPor(dataReceta.respuestas?.facturaPor === "BULTO" ? "BULTO" : "UNIDAD");
          setTieneReceta(Boolean(dataReceta.tieneReceta));
        } else {
          setFacturaPor("UNIDAD");
          setTieneReceta(false);
        }
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
  const incluidas = lineas.filter((linea) => linea.incluida !== false);
  const listas = incluidas.filter(lineaLista);
  const pendientes = incluidas.length - listas.length;
  const diferencias = incluidas.filter((linea) => linea.diferentes && !linea.precioConfirmado).length;
  const sinVinculo = incluidas.filter((linea) => !linea.productoLocalId).length;
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
        facturaPor,
      }).map((linea) => ({ ...linea, incluida: true }))
    );
    setFiltro("todas");
    setEstado("revisar");
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
          ? recalcularLineaConProducto(linea, producto, { facturaPor })
          : linea
      )
    );
  };

  const cambiarLinea = (idLinea, patch, { recalcularPrecio = false } = {}) => {
    setLineas((previas) =>
      previas.map((linea) => {
        if (linea.id !== idLinea) return linea;
        const siguiente = { ...linea, ...patch };
        if (!recalcularPrecio) return siguiente;
        const producto = productosPorId.get(String(siguiente.productoLocalId));
        const precios = preciosComparables({
          precioPapel: siguiente.precioUnitario,
          facturaPor,
          unidadPedido: siguiente.unidadPedido,
          producto,
        });
        return {
          ...siguiente,
          ...precios,
          precioConfirmado: !precios.diferentes,
        };
      })
    );
  };

  const confirmarProducto = (idLinea) => {
    setLineas((previas) =>
      previas.map((linea) => (linea.id === idLinea ? { ...linea, confirmada: true } : linea))
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
    if (pendientes || !incluidas.length || guardando) return;
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
            </SunmiPanel>

            <div className="space-y-3">
              {visibles.map((linea, indiceVisible) => {
                const producto = productosPorId.get(String(linea.productoLocalId));
                const incluida = linea.incluida !== false;
                const sugeridos = new Set(linea.candidatos || []);
                const opciones = [...productos].sort(
                  (a, b) => Number(sugeridos.has(b.productoLocalId)) - Number(sugeridos.has(a.productoLocalId))
                );
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
                                  {opciones.map((opcion) => (
                                    <SunmiSelectOption key={opcion.productoLocalId} value={String(opcion.productoLocalId)}>
                                      {`${sugeridos.has(opcion.productoLocalId) ? "Sugerido · " : ""}${opcion.codigoInterno ? `${opcion.codigoInterno} · ` : ""}${opcion.nombre}`}
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
                                        onChange={(e) => cambiarLinea(linea.id, { unidadPedido: e.target.value }, { recalcularPrecio: true })}
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

                              <label className="block mt-3">
                                <span className="block text-sm2 font-semibold sunmi-text-muted mb-1">
                                  Precio leído del archivo por {facturaPor === "BULTO" ? "bulto" : "unidad"}
                                </span>
                                <SunmiInput
                                  type="text"
                                  inputMode="decimal"
                                  value={linea.precioUnitario ?? ""}
                                  onChange={(e) => cambiarLinea(
                                    linea.id,
                                    { precioUnitario: normalizarDecimal(e.target.value) },
                                    { recalcularPrecio: true }
                                  )}
                                  placeholder="Sin precio impreso"
                                  className="tabular-nums"
                                />
                              </label>

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
                  </p>
                  <p className="text-lg font-bold sunmi-text-strong">Total del borrador: {dinero(total)}</p>
                </div>
                <SunmiButton color="slate" type="button" onClick={() => router.back()} disabled={guardando}>
                  Cancelar
                </SunmiButton>
                <SunmiButton type="button" onClick={guardar} disabled={guardando || pendientes > 0 || !incluidas.length}>
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
