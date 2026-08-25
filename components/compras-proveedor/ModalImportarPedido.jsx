"use client";

import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Image as ImageIcon, Upload, Check, AlertTriangle, X } from "lucide-react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import {
  prepararLineasImportadas,
  recalcularLineaConProducto,
} from "@/lib/compras-proveedor/importacion/prepararLineas";
import { costoParaUnidad, baseDeProducto } from "@/lib/compras-proveedor/importacion/merge";
import { naturalezaLinea, permiteToggleUnidad } from "@/lib/compras-proveedor/calculoPedido";

// ── LOS `text-[12px]` QUE QUEDAN NO SON UN OLVIDO ──────────────────────────
//
// El resto de las medidas escritas a mano de este modal se cambiaron por el
// token del kit que vale EXACTAMENTE lo mismo, medido contra la hoja
// construida: 11px es `text-sm2`, 10px es `text-xs2`, 14px es `text-base` y
// 10,5px es `text-xs` —esa última sorprende, pero `text-xs` es `0.75rem` sobre
// una raíz de 14px, así que da 10,5 y no 12—.
//
// Para 12px NO hay token. El candidato obvio, `text-sm`, es `0.875rem` = 12,25px
// sobre esa misma raíz: no vale lo mismo, y `lib/hardcodeo/contador.js` no lo
// ofrece justamente por eso —solo ofrece las que están definidas en px—.
// Ponerlo sería cambiar el tamaño y encima decir que no cambió.
//
// Los cinco que quedan acá rotulan texto secundario denso: el subtítulo de la
// zona de carga, el error de lectura, el nombre del archivo en la cabecera de
// revisión, la descripción de cada línea y el error del pie. Son 12px porque en
// el repo eso es lo normal —304 usos en `main`—, no porque este modal lo haya
// inventado. El día que el kit tenga un token de 12px se cambian los 304 juntos.

export default function ModalImportarPedido({ open, onClose, productos = [], onAplicar }) {
  const inputRef = useRef(null);
  const [estado, setEstado] = useState("elegir");
  const [archivo, setArchivo] = useState(null);
  const [documento, setDocumento] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [error, setError] = useState("");
  const [aplicando, setAplicando] = useState(false);

  const productosPorId = useMemo(
    () => new Map(productos.map((p) => [String(p.productoLocalId), p])),
    [productos]
  );
  const incluidas = lineas.filter((l) => l.incluida !== false);
  const listas = incluidas.filter(lineaLista);
  const pendientes = incluidas.length - listas.length;

  const cerrar = () => {
    if (estado === "analizando" || aplicando) return;
    setEstado("elegir");
    setArchivo(null);
    setDocumento(null);
    setLineas([]);
    setError("");
    onClose?.();
  };

  const seleccionarArchivo = async (seleccionado) => {
    if (!seleccionado) return;
    setArchivo(seleccionado);
    setEstado("analizando");
    setError("");
    try {
      const form = new FormData();
      form.append("archivo", seleccionado);
      const respuesta = await fetch("/api/compras-proveedor/importar/analizar", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await respuesta.json();
      if (!data.ok) {
        setError(data.error || "No se pudo leer el archivo.");
        setEstado("elegir");
        return;
      }
      setDocumento(data.documento);
      setLineas(
        prepararLineasImportadas({ lineas: data.documento.lineas, productos }).map((l) => ({
          ...l,
          incluida: true,
        }))
      );
      setEstado("revisar");
    } catch {
      setError("No se pudo conectar para analizar el archivo.");
      setEstado("elegir");
    }
  };

  const cambiarProducto = (idLinea, productoLocalId) => {
    const producto = productosPorId.get(String(productoLocalId));
    setLineas((prev) =>
      prev.map((l) => (l.id === idLinea ? recalcularLineaConProducto(l, producto) : l))
    );
  };

  const cambiar = (idLinea, patch) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.id === idLinea
          ? { ...l, ...patch, requiereRevision: true, confirmada: false }
          : l
      )
    );
  };

  const aplicar = async () => {
    if (pendientes || !incluidas.length) return;
    setAplicando(true);
    setError("");
    try {
      const consolidadas = consolidarLineas(incluidas, productosPorId);
      await onAplicar?.(consolidadas, { archivo, documento });
      setEstado("elegir");
      setArchivo(null);
      setDocumento(null);
      setLineas([]);
      onClose?.();
    } catch (e) {
      setError(e?.message || "No se pudo crear el borrador.");
    } finally {
      setAplicando(false);
    }
  };

  return (
    <SunmiModalLayout
      open={open}
      title="Crear borrador desde archivo"
      subtitle="Foto, PDF o Excel · nada se guarda hasta confirmar"
      color="cyan"
      onClose={cerrar}
      destructivo={estado === "revisar"}
      forma="hoja-o-centrado"
      maxWidth="max-w-4xl"
      z={9999}
      espacioCuerpo=""
      espacioPie="mt-2"
      footer={
        estado === "revisar" ? (
          <div className="w-full flex items-center gap-2">
            <span className="text-sm2 sunmi-text-muted mr-auto">
              {pendientes ? `${pendientes} línea${pendientes === 1 ? "" : "s"} por revisar` : `${listas.length} listas`}
            </span>
            <SunmiButton color="slate" type="button" onClick={cerrar} disabled={aplicando}>
              Cancelar
            </SunmiButton>
            <SunmiButton type="button" onClick={aplicar} disabled={aplicando || pendientes > 0 || !incluidas.length}>
              {aplicando ? "Creando..." : "Crear borrador"}
            </SunmiButton>
          </div>
        ) : null
      }
    >
      <div className="min-h-0 overflow-y-auto">
        {estado === "elegir" && (
          <div className="py-5 px-1">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.xlsx,.xls"
              onChange={(e) => seleccionarArchivo(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full min-h-44 rounded-xl border-2 border-dashed sunmi-divider sunmi-control flex flex-col items-center justify-center gap-3 px-5"
            >
              <Upload size={30} style={{ color: "var(--pos-link)" }} />
              <span className="text-base font-semibold sunmi-text-strong">Elegir archivo</span>
              <span className="text-[12px] sunmi-text-muted text-center">
                Foto del pedido, PDF, Excel XLSX o XLS · máximo 15 MB
              </span>
              <span className="flex items-center gap-3 text-sm2 sunmi-text-muted">
                <span className="flex items-center gap-1"><ImageIcon size={14} /> Foto / PDF</span>
                <span className="flex items-center gap-1"><FileSpreadsheet size={14} /> Excel</span>
              </span>
            </button>
            {error && <p className="mt-3 text-[12px] sunmi-text-danger text-center">{error}</p>}
          </div>
        )}

        {estado === "analizando" && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin sunmi-text-accent" />
            <p className="text-base font-semibold sunmi-text-strong">Leyendo {archivo?.name}</p>
            <p className="text-sm2 sunmi-text-muted mt-1">En una foto puede tardar hasta 45 segundos.</p>
          </div>
        )}

        {estado === "revisar" && (
          <div>
            <div className="sticky top-0 z-10 sunmi-surface border-b sunmi-divider pb-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold sunmi-text-strong truncate">{archivo?.name}</span>
                {documento?.numeroPedido && <SunmiPill color="slate">Pedido {documento.numeroPedido}</SunmiPill>}
                <span className="text-sm2 sunmi-text-muted ml-auto">{incluidas.length} líneas incluidas</span>
              </div>
              <p className="text-sm2 sunmi-text-muted mt-1">
                Se usan productos y costos actuales del catálogo. El precio del papel no modifica el costo maestro.
              </p>
            </div>

            <div className="flex flex-col gap-2 pb-1">
              {lineas.map((linea, indice) => {
                const producto = productosPorId.get(String(linea.productoLocalId));
                const incluida = linea.incluida !== false;
                const sugeridos = new Set(linea.candidatos || []);
                const opcionesProducto = [...productos].sort(
                  (a, b) =>
                    Number(sugeridos.has(b.productoLocalId)) -
                    Number(sugeridos.has(a.productoLocalId))
                );
                return (
                  <div key={linea.id} className={`rounded-lg border sunmi-divider p-2.5 ${incluida ? "sunmi-surface" : "opacity-60 sunmi-control"}`}>
                    <div className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-full sunmi-control flex items-center justify-center text-xs2 font-bold shrink-0">{indice + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold sunmi-text-strong leading-tight">{linea.descripcion}</p>
                            <p className="text-xs sunmi-text-muted mt-0.5">
                              {linea.codigo ? `Cód. ${linea.codigo} · ` : ""}{linea.cantidad ?? "?"} {linea.unidad || "sin unidad"}
                              {linea.precioUnitario != null ? ` · precio impreso $${linea.precioUnitario}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => cambiar(linea.id, { incluida: !incluida, confirmada: !incluida ? linea.confirmada : false })}
                            className="shrink-0 p-1 rounded sunmi-control"
                            aria-label={incluida ? "No incluir línea" : "Volver a incluir línea"}
                            title={incluida ? "No incluir" : "Volver a incluir"}
                          >
                            {incluida ? <X size={14} /> : <Check size={14} />}
                          </button>
                        </div>

                        {incluida && (
                          <>
                            <div className="mt-2">
                              <SunmiSelectAdv
                                value={linea.productoLocalId}
                                onChange={(v) => cambiarProducto(linea.id, v)}
                                searchable
                              >
                                <SunmiSelectOption value="">Elegir producto...</SunmiSelectOption>
                                {opcionesProducto.map((p) => {
                                  const prefijo = sugeridos.has(p.productoLocalId) ? "Sugerido · " : "";
                                  const etiqueta = `${prefijo}${p.codigoInterno ? `${p.codigoInterno} · ` : ""}${p.nombre}`;
                                  return (
                                    <SunmiSelectOption key={p.productoLocalId} value={String(p.productoLocalId)}>
                                      {etiqueta}
                                    </SunmiSelectOption>
                                  );
                                })}
                              </SunmiSelectAdv>
                            </div>

                            {producto && (
                              <div className="mt-2 flex items-center gap-2">
                                <SunmiInput
                                  type="text"
                                  inputMode="numeric"
                                  value={linea.cantidadPedido}
                                  onChange={(e) => cambiar(linea.id, { cantidadPedido: e.target.value.replace(/[^\d]/g, "") })}
                                  className="w-24 !py-1 text-center tabular-nums"
                                />
                                {/* SOLO EL PACK ALTERNA. Un fiambre se pide por
                                    pieza y un producto por kilo se pide en kilos:
                                    ofrecerles "Bulto / Unidad" era ofrecer una
                                    elección que no existe. La decisión sale de
                                    `permiteToggleUnidad`, la misma que usa la
                                    pantalla de Compras. */}
                                {permiteToggleUnidad(baseDeProducto(producto)) ? (
                                  <div className="w-36">
                                    <SunmiSelectAdv
                                      value={linea.unidadPedido}
                                      onChange={(v) => cambiar(linea.id, { unidadPedido: v })}
                                    >
                                      <SunmiSelectOption value="BULTO">Bulto</SunmiSelectOption>
                                      <SunmiSelectOption value="UNIDAD">Unidad</SunmiSelectOption>
                                    </SunmiSelectAdv>
                                  </div>
                                ) : (
                                  <span className="w-36 text-xs sunmi-text-muted">
                                    {naturalezaLinea(baseDeProducto(producto)) === "FIAMBRE"
                                      ? "Pieza"
                                      : naturalezaLinea(baseDeProducto(producto)) === "KG"
                                      ? "Kg"
                                      : "Unidad"}
                                  </span>
                                )}
                                {linea.equivalencia && <span className="text-xs sunmi-text-accent">{linea.equivalencia}</span>}
                              </div>
                            )}

                            {linea.requiereRevision && !linea.confirmada && (
                              <div className="mt-2 rounded-md px-2 py-1.5 bg-amber-500/10 flex items-start gap-1.5">
                                <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                                <span className="text-xs sunmi-text-warning flex-1">{linea.motivoRevision}</span>
                                {producto && Number(linea.cantidadPedido) >= 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setLineas((prev) => prev.map((l) => l.id === linea.id ? { ...l, confirmada: true } : l))}
                                    className="text-xs font-bold sunmi-text-accent shrink-0"
                                  >
                                    Confirmar
                                  </button>
                                )}
                              </div>
                            )}
                            {linea.confirmada && linea.requiereRevision && (
                              <p className="mt-1.5 text-xs sunmi-text-accent flex items-center gap-1"><Check size={12} /> Revisada</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {error && <p className="mt-2 text-[12px] sunmi-text-danger">{error}</p>}
          </div>
        )}
      </div>
    </SunmiModalLayout>
  );
}

function lineaLista(linea) {
  const cantidad = Number(linea.cantidadPedido);
  return Boolean(
    linea.productoLocalId &&
      Number.isInteger(cantidad) &&
      cantidad >= 1 &&
      ["BULTO", "UNIDAD"].includes(linea.unidadPedido) &&
      linea.confirmada
  );
}

// EL COSTO SIGUE A LA UNIDAD, TAMBIÉN ACÁ.
//
// Este consolidado arma el cuerpo que se manda a crear o a aplicar, así que si
// deja el costo del bulto en una línea que quedó en UNIDAD, el borrador nace mal
// aunque el servidor esté bien. Se usa `costoParaUnidad`, la misma pieza que usa
// la ruta, para que las dos superficies no puedan divergir.
function consolidarLineas(lineas, productosPorId) {
  const salida = new Map();
  for (const linea of lineas) {
    const producto = productosPorId.get(String(linea.productoLocalId));
    const item = {
      productoLocalId: Number(linea.productoLocalId),
      cantidad: Number(linea.cantidadPedido),
      unidad: linea.unidadPedido,
      precioCosto: costoParaUnidad({
        costoMaestro: producto?.precio_costo ?? null,
        unidad: linea.unidadPedido,
        producto,
      }),
    };
    const anterior = salida.get(item.productoLocalId);
    if (!anterior) {
      salida.set(item.productoLocalId, item);
      continue;
    }
    const factor = Math.max(1, Math.floor(Number(producto?.factor_pack) || 1));
    if (anterior.unidad === item.unidad) anterior.cantidad += item.cantidad;
    else {
      anterior.cantidad =
        (anterior.unidad === "BULTO" ? anterior.cantidad * factor : anterior.cantidad) +
        (item.unidad === "BULTO" ? item.cantidad * factor : item.cantidad);
      anterior.unidad = "UNIDAD";
      // Al fusionar dos líneas del mismo producto la unidad cae a UNIDAD, así que
      // el costo tiene que bajar con ella.
      anterior.precioCosto = costoParaUnidad({
        costoMaestro: producto?.precio_costo ?? null,
        unidad: "UNIDAD",
        producto,
      });
    }
  }
  return [...salida.values()];
}
