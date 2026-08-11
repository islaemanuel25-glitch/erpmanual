"use client";

// components/comprobantes/PanelComprobantes.jsx
//
// El panel de comprobantes de una recepción: subir, ver, agrupar y leer.
//
// Se monta DENTRO de la pantalla de recepción que ya existe, no es una pantalla
// nueva. La conciliación contra el pedido —vincular cada línea a un producto—
// viene después y va en la tabla de arriba.
//
// ── LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO ─────────────────────────────
//
// Que "no se pudo leer bien" y "el papel no cierra" son cosas distintas, CON
// PALABRAS distintas y no solo con colores distintos. Quien mira apurado lee la
// palabra, no el tono. Los textos están en lib/.../pantalla.js con su candado.

import { useEffect, useMemo, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import {
  debePreguntarPorAgrupar,
  comprobantesQuePuedenRecibirHojas,
  comoSeDice,
  resumenDeLista,
} from "@/lib/compras-proveedor/comprobante/pantalla";

const TONOS = {
  ok: "sunmi-text-success",
  info: "sunmi-text-accent",
  aviso: "sunmi-text-warning",
  peligro: "sunmi-text-danger",
  neutro: "sunmi-text-muted",
};

function tamano(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function identidad(c) {
  if (!c.numero) return "Sin número todavía";
  return `${c.tipo ?? ""} ${c.puntoVenta ?? ""}-${c.numero}`.trim();
}

/** La tira de aviso: barra de color, frase corta en negrita, detalle chico. */
function Aviso({ estado }) {
  const v = comoSeDice(estado);
  return (
    // La barra usa `bg-current`, o sea el MISMO color que el texto del título.
    // No hay una segunda tabla de colores que pueda quedar desfasada del tono.
    <div className={`flex gap-2 ${TONOS[v.tono] || TONOS.neutro}`}>
      <div className="w-1 rounded shrink-0 bg-current" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-bold">{v.titulo}</p>
        <p className="text-sm2 sunmi-text-muted leading-snug">{v.detalle}</p>
      </div>
    </div>
  );
}

/**
 * De una respuesta del servidor a un mensaje que dice QUÉ PASÓ.
 *
 * NINGÚN texto se escribe a mano acá: todos salen del catálogo. El 2026-08-11
 * los tres mensajes de esta pantalla estaban escritos inline —"No se pudo
 * subir. Probá de nuevo."— y no decían nada; el candado no los atajó porque
 * miraba el catálogo, que es donde no estaban.
 *
 * EL ESTADO SE MIRA ANTES DE LEER EL JSON. Un 413 lo contesta el proxy con una
 * página HTML, así que `r.json()` revienta y todo el mensaje del servidor se
 * pierde en un `catch` genérico. Eso fue justamente lo que pasó.
 */
async function mensajeDeRespuesta(r) {
  if (!r.ok) {
    const { texto } = queHacerHttp(r.status);
    // Si el servidor mandó JSON con su propio motivo, ese gana: sabe más que la
    // tabla por estado. Si no se puede leer —página de error del proxy—, queda
    // el texto del estado, que igual dice qué pasó.
    try {
      const d = await r.json();
      if (d?.queHacer || d?.error) return { tipo: "error", texto: d.queHacer || d.error };
    } catch {}
    return { tipo: "error", texto };
  }
  return null;
}

export default function PanelComprobantes({ pedidoId, proveedorId, puedeRecibir = true }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [pregunta, setPregunta] = useState(null); // { archivos, opciones, candidatos }
  const [seleccion, setSeleccion] = useState([]);
  const inputRef = useRef(null);

  const resumen = useMemo(() => resumenDeLista(items), [items]);
  const abiertos = useMemo(
    () => comprobantesQuePuedenRecibirHojas(items, proveedorId),
    [items, proveedorId]
  );

  async function recargar() {
    setCargando(true);
    try {
      const q = pedidoId ? `pedidoId=${pedidoId}` : `proveedorId=${proveedorId}`;
      const r = await fetch(`/api/compras-proveedor/comprobantes/listar?${q}`);
      const d = await r.json();
      if (d.ok) setItems(d.items || []);
      else setMensaje({ tipo: "error", texto: d.error });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId, proveedorId]);

  // ── Elegir archivos: acá se decide si hace falta preguntar ─────────────
  function alElegirArchivos(e) {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;

    const decision = debePreguntarPorAgrupar({
      cantidadFotos: archivos.length,
      comprobantesAbiertos: abiertos,
    });

    // Si no hace falta preguntar, se sube directo. Es la recepción normal, que
    // es la mayoría: un toque de más ahí se paga en todas.
    if (!decision.preguntar) {
      subir(archivos, { agruparEnUno: false });
      return;
    }
    setPregunta({ archivos, ...decision });
  }

  async function subir(archivos, { agruparEnUno = false, comprobanteId = null } = {}) {
    setPregunta(null);
    setSubiendo(true);
    setMensaje(null);
    try {
      const fd = new FormData();
      fd.append("proveedorId", String(proveedorId));
      if (pedidoId) fd.append("pedidoId", String(pedidoId));
      if (agruparEnUno) fd.append("agruparEnUno", "true");
      if (comprobanteId) fd.append("comprobanteId", String(comprobanteId));
      for (const a of archivos) fd.append("archivos", a);

      const r = await fetch("/api/compras-proveedor/comprobantes/subir", { method: "POST", body: fd });
      const fallo = await mensajeDeRespuesta(r);
      if (fallo) {
        setMensaje(fallo);
        await recargar();
        return;
      }
      const d = await r.json();

      if (!d.ok && d.error) {
        setMensaje({ tipo: "error", texto: d.queHacer || d.error });
      } else {
        // Los fallos POR ARCHIVO se muestran todos juntos: quien subió cinco
        // fotos tiene que ver de una cuáles entraron y qué pasó con las otras.
        const fallados = (d.resultados || []).filter((x) => !x.ok);
        setMensaje({
          tipo: fallados.length ? "aviso" : "ok",
          texto: `${d.subidos} subida(s).`,
          detalles: fallados.map((f) => `${f.nombre}: ${f.queHacer || f.error}`),
        });
      }
      await recargar();
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA.texto });
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function leer(id) {
    setLeyendo(id);
    setMensaje(null);
    try {
      const r = await fetch(`/api/compras-proveedor/comprobantes/leer/${id}`, { method: "POST" });
      const fallo = await mensajeDeRespuesta(r);
      if (fallo) {
        setMensaje(fallo);
        await recargar();
        return;
      }
      const d = await r.json();
      if (!d.ok) {
        setMensaje({ tipo: "error", texto: d.error || d.queHacer });
      } else {
        setMensaje({
          tipo: d.cierra ? "ok" : "aviso",
          texto: d.cierra
            ? `Leído y verificado: ${d.lineas} líneas.`
            : d.porque,
          detalles: d.usoRespaldo ? ["Lo leyó el lector de respaldo."] : [],
        });
      }
      await recargar();
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA.texto });
    } finally {
      setLeyendo(null);
    }
  }

  async function unir() {
    if (seleccion.length < 2) return;
    setMensaje(null);
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/unir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: seleccion }),
      });
      const fallo = await mensajeDeRespuesta(r);
      if (fallo) { setMensaje(fallo); await recargar(); return; }
      const d = await r.json();
      setMensaje({ tipo: d.ok ? "ok" : "error", texto: d.ok ? d.queHacer : d.error });
      setSeleccion([]);
      await recargar();
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA.texto });
    }
  }

  const alternar = (id) =>
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <SunmiCard className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold sunmi-text-strong">Comprobantes</h3>
          <p className="text-sm2 sunmi-text-muted">
            {resumen.total === 0
              ? "Sacá una foto de la factura. Si es larga, sacá una por hoja."
              : `${resumen.total} en total · ${resumen.sinLeer} sin leer` +
                (resumen.malLeidos ? ` · ${resumen.malLeidos} sin poder leer` : "")}
          </p>
        </div>
        {puedeRecibir && (
          <div className="flex gap-2">
            {seleccion.length >= 2 && (
              <SunmiButton color="slate" type="button" onClick={unir}>
                Unir {seleccion.length} en uno
              </SunmiButton>
            )}
            <SunmiButton
              color="accent"
              type="button"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
            >
              {subiendo ? "Subiendo…" : "Subir fotos"}
            </SunmiButton>
          </div>
        )}
        <SunmiInput
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.xlsx,.xls"
          className="hidden"
          onChange={alElegirArchivos}
        />
      </div>

      {mensaje && (
        <div
          className={`mb-3 rounded border p-2 text-xs sunmi-border ${
            mensaje.tipo === "error"
              ? "sunmi-text-danger"
              : mensaje.tipo === "aviso"
              ? "sunmi-text-warning"
              : "sunmi-text-success"
          }`}
        >
          <p className="font-bold">{mensaje.texto}</p>
          {(mensaje.detalles || []).map((d, i) => (
            <p key={i} className="sunmi-text-muted mt-0.5">
              {d}
            </p>
          ))}
        </div>
      )}

      {cargando ? (
        <SunmiLoader />
      ) : (
        <>
          {/* ── Escritorio: tabla ────────────────────────────────────── */}
          <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
            <SunmiTable headers={["", "Comprobante", "Estado", "Fotos", "Líneas", "Leyó", ""]}>
              {items.length === 0 ? (
                <SunmiTableEmpty label="Todavía no hay comprobantes" />
              ) : (
                items.map((c) => (
                  <SunmiTableRow key={c.id}>
                    <td className="px-2 py-1.5 align-top">
                      <SunmiInput
                        type="checkbox"
                        className="w-4"
                        checked={seleccion.includes(c.id)}
                        onChange={() => alternar(c.id)}
                        aria-label={`Elegir comprobante ${c.id}`}
                      />
                    </td>
                    <td className="px-3 py-1.5 align-top">
                      <p className="text-xs font-bold sunmi-text-strong">{identidad(c)}</p>
                      <p className="text-sm2 sunmi-text-muted">
                        {c.proveedor?.nombre} · {new Date(c.createdAt).toLocaleString("es-AR")}
                      </p>
                    </td>
                    <td className="px-3 py-1.5 align-top max-w-[22rem]">
                      <Aviso estado={c.estado} />
                    </td>
                    <td className="px-3 py-1.5 align-top text-xs">
                      {c.fotos === 0 ? (
                        <span className="sunmi-text-muted">vencidas</span>
                      ) : (
                        <>
                          {c.fotos}
                          {c.fotos > 1 && (
                            <span className="sunmi-text-muted"> hojas</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-1.5 align-top text-xs">{c._count?.lineas ?? 0}</td>
                    <td className="px-3 py-1.5 align-top text-sm2 sunmi-text-muted">
                      {c.modeloLectura || "—"}
                      {c.usoRespaldo && <span className="block">(respaldo)</span>}
                      {c.intentosLectura > 1 && (
                        <span className="block">{c.intentosLectura} intentos</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 align-top text-right">
                      {puedeRecibir && c.fotos > 0 && (
                        <SunmiButton
                          color="accent"
                          type="button"
                          disabled={leyendo === c.id}
                          onClick={() => leer(c.id)}
                        >
                          {leyendo === c.id ? "Leyendo…" : c.leidoEn ? "Releer" : "Leer"}
                        </SunmiButton>
                      )}
                    </td>
                  </SunmiTableRow>
                ))
              )}
            </SunmiTable>
          </div>

          {/* ── Móvil: tarjetas ──────────────────────────────────────── */}
          <div className="md:hidden flex flex-col gap-2">
            {items.length === 0 && (
              <p className="text-xs sunmi-text-muted py-4 text-center">
                Todavía no hay comprobantes
              </p>
            )}
            {items.map((c) => (
              <div key={c.id} className="rounded border sunmi-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold sunmi-text-strong truncate">{identidad(c)}</p>
                    <p className="text-sm2 sunmi-text-muted truncate">{c.proveedor?.nombre}</p>
                  </div>
                  <SunmiInput
                    type="checkbox"
                    className="w-4"
                    checked={seleccion.includes(c.id)}
                    onChange={() => alternar(c.id)}
                    aria-label={`Elegir comprobante ${c.id}`}
                  />
                </div>
                <div className="mt-2">
                  <Aviso estado={c.estado} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-sm2 sunmi-text-muted">
                    {c.fotos === 0 ? "fotos vencidas" : `${c.fotos} foto(s)`}
                    {c._count?.lineas ? ` · ${c._count.lineas} líneas` : ""}
                    {c.modeloLectura ? ` · ${c.modeloLectura}` : ""}
                  </p>
                  {puedeRecibir && c.fotos > 0 && (
                    <SunmiButton
                      color="accent"
                      type="button"
                      disabled={leyendo === c.id}
                      onClick={() => leer(c.id)}
                    >
                      {leyendo === c.id ? "Leyendo…" : c.leidoEn ? "Releer" : "Leer"}
                    </SunmiButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── La pregunta al subir ──────────────────────────────────────── */}
      {pregunta && (
        <SunmiModalLayout
          open
          title="¿Es una factura nueva o otra hoja?"
          subtitle="Contestá ahora, con el papel en la mano"
          color="cyan"
          onClose={() => setPregunta(null)}
        >
          <p className="text-xs sunmi-text-muted mb-3">{pregunta.porque}</p>

          <div className="flex flex-col gap-2">
            {pregunta.opciones.includes("UNA_POR_FOTO") && (
              <SunmiButton
                color="slate"
                type="button"
                onClick={() => subir(pregunta.archivos, { agruparEnUno: false })}
              >
                Son {pregunta.archivos.length} facturas distintas
              </SunmiButton>
            )}
            {pregunta.opciones.includes("TODAS_UNA_SOLA") && (
              <SunmiButton
                color="accent"
                type="button"
                onClick={() => subir(pregunta.archivos, { agruparEnUno: true })}
              >
                Son {pregunta.archivos.length} hojas de UNA factura
              </SunmiButton>
            )}
            {pregunta.opciones.includes("NUEVO") && (
              <SunmiButton
                color="slate"
                type="button"
                onClick={() => subir(pregunta.archivos, { agruparEnUno: false })}
              >
                Es una factura nueva
              </SunmiButton>
            )}
            {pregunta.opciones.includes("SUMAR_A_EXISTENTE") &&
              (pregunta.candidatos || []).map((c) => (
                <SunmiButton
                  key={c.id}
                  color="accent"
                  type="button"
                  onClick={() => subir(pregunta.archivos, { comprobanteId: c.id })}
                >
                  Es otra hoja de {identidad(c)}
                </SunmiButton>
              ))}
          </div>

          <p className="text-sm2 sunmi-text-muted mt-3">
            Si te equivocás, después se pueden unir con el botón «Unir».
          </p>
        </SunmiModalLayout>
      )}
    </SunmiCard>
  );
}
