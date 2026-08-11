"use client";

// components/comprobantes/LineasComprobante.jsx
//
// Las líneas leídas de un comprobante, cada una al lado del producto al que
// corresponde.
//
// ── LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO ─────────────────────────────
//
// QUE SE VEA A SIMPLE VISTA QUÉ VINCULÓ SOLO Y QUÉ ESPERA CONFIRMACIÓN.
//
// Si las dos cosas se vieran igual, alguien va a confirmar en masa sin mirar y
// se pierde toda la cautela del motor — que a propósito solo vincula solo por
// código o por alias exacto, porque un vínculo equivocado no se ve: la línea
// queda al lado de un producto plausible y el costo entra en el que no era.
//
// Por eso la diferencia va en TRES cosas a la vez y no solo en el color: la
// palabra ("Vinculado" contra "¿Es este?"), la forma (el sugerido viene con
// botones y el vinculado no) y el tono. Quien mira apurado lee la palabra.
//
// ── VINCULAR A MANO SIN SALIR DE ACÁ ───────────────────────────────────────
//
// Va a pasar seguido las primeras veces, hasta que los alias se acumulen. Si
// hubiera que ir a otra pantalla, nadie lo haría y las líneas quedarían sin
// vincular para siempre.

import { useEffect, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const money = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);

/**
 * El estado del vínculo, con PALABRA propia.
 *
 * Los textos largos viven en el servidor (`textoOrigen`); acá va la etiqueta
 * corta, que es lo que se lee de un vistazo.
 */
function estadoDeVinculo(l) {
  if (l.productoLocalId) return { etiqueta: "Vinculado", tono: "sunmi-text-success", pideAccion: false };
  if (l.vinculadaSola) return { etiqueta: "Vinculado solo", tono: "sunmi-text-success", pideAccion: false };
  if (l.origen === "SIN_CANDIDATOS") return { etiqueta: "Sin encontrar", tono: "sunmi-text-danger", pideAccion: true };
  return { etiqueta: "¿Es este?", tono: "sunmi-text-warning", pideAccion: true };
}

/** La tira de aviso de la columna Revisar: barra, palabra corta, detalle chico. */
function Revisar({ linea, children }) {
  const e = estadoDeVinculo(linea);
  return (
    <div className={`flex gap-2 ${e.tono}`}>
      <div className="w-1 rounded shrink-0 bg-current" aria-hidden />
      <div className="min-w-0 w-full">
        <p className="text-xs font-bold">{e.etiqueta}</p>
        {(linea.problema || linea.textoOrigen) && (
          <p className="text-sm2 sunmi-text-muted leading-snug">{linea.problema || linea.textoOrigen}</p>
        )}
        {linea.textoMotivoPedido && (
          <p className="text-sm2 sunmi-text-warning leading-snug">{linea.textoMotivoPedido}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/** Buscar un producto a mano, sin salir de la pantalla. */
function BuscadorProducto({ onElegir, onCancelar }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const texto = q.trim();
      if (texto.length < 3) { setItems([]); return; }
      setBuscando(true);
      try {
        const r = await fetch(`/api/productos/listar?q=${encodeURIComponent(texto)}&pageSize=8`);
        const d = await r.json();
        setItems(d?.items || d?.productos || []);
      } catch { setItems([]); } finally { setBuscando(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-2 rounded border sunmi-border p-2">
      <div className="flex gap-2 items-center">
        <SunmiInput
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto por nombre…"
          className="flex-1"
        />
        <SunmiButton color="slate" type="button" onClick={onCancelar}>Cancelar</SunmiButton>
      </div>
      {buscando && <p className="text-sm2 sunmi-text-muted mt-1">Buscando…</p>}
      {!buscando && q.trim().length >= 3 && items.length === 0 && (
        <p className="text-sm2 sunmi-text-muted mt-1">Ninguno con ese nombre.</p>
      )}
      <div className="flex flex-col gap-1 mt-1">
        {items.map((p) => (
          <SunmiButton
            key={p.baseId ?? p.id}
            color="slate"
            type="button"
            className="justify-start text-left"
            onClick={() => onElegir({ productoBaseId: p.baseId ?? p.base?.id ?? p.id, nombre: p.nombre })}
          >
            {p.nombre}
          </SunmiButton>
        ))}
      </div>
    </div>
  );
}

export default function LineasComprobante({ comprobanteId, puedeVincular = true, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [buscandoEn, setBuscandoEn] = useState(null); // lineaId

  async function recargar() {
    setCargando(true);
    try {
      const r = await fetch(`/api/compras-proveedor/comprobantes/lineas/${comprobanteId}`);
      const d = await r.json();
      if (d.ok) setDatos(d);
      else setMensaje({ tipo: "error", texto: d.error });
    } finally { setCargando(false); }
  }

  useEffect(() => { recargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [comprobanteId]);

  async function vincular(lineaId, productoBaseId, pedidoDetalleId = null) {
    setMensaje(null);
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineaId, productoBaseId, pedidoDetalleId }),
      });
      const d = await r.json();
      setMensaje({ tipo: d.ok ? "ok" : "error", texto: d.ok ? d.queHacer : d.queHacer || d.error });
      setBuscandoEn(null);
      await recargar();
      onCambio?.();
    } catch {
      setMensaje({ tipo: "error", texto: "Se cortó la conexión al vincular. No se guardó nada: probá de nuevo." });
    }
  }

  if (cargando) return <SunmiLoader />;
  if (!datos) return <p className="text-xs sunmi-text-muted">{mensaje?.texto ?? "Sin datos."}</p>;

  const { lineas, resumen } = datos;

  return (
    <div className="mt-2">
      <p className="text-sm2 sunmi-text-muted mb-2">
        {resumen.total} líneas · {resumen.vinculadasSolas} vinculadas solas ·{" "}
        <span className={resumen.esperandoDecision ? "sunmi-text-warning font-bold" : ""}>
          {resumen.esperandoDecision} esperan que las mires
        </span>
      </p>

      {mensaje && (
        <p className={`text-xs mb-2 ${mensaje.tipo === "error" ? "sunmi-text-danger" : "sunmi-text-success"}`}>
          {mensaje.texto}
        </p>
      )}

      {/* ── Escritorio: tabla, con Revisar entre Producto y SKU ─────────── */}
      <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
        <SunmiTable headers={["Producto", "Revisar", "Cant.", "Precio unit.", "Subtotal", "En el pedido"]}>
          {lineas.length === 0 ? (
            <SunmiTableEmpty label="El comprobante no tiene líneas leídas" />
          ) : (
            lineas.map((l) => {
              const e = estadoDeVinculo(l);
              const nombre = l.sugerido?.nombre ?? l.candidatos?.[0]?.nombre ?? null;
              return (
                <SunmiTableRow key={l.id}>
                  <td className="px-3 py-1.5 align-top max-w-[18rem]">
                    <p className="text-xs font-bold sunmi-text-strong">{nombre ?? "—"}</p>
                    {/* El texto crudo de la factura, debajo del nombre. */}
                    <p className="text-sm2 sunmi-text-muted break-words">{l.textoCrudo}</p>
                  </td>
                  <td className="px-3 py-1.5 align-top max-w-[24rem]">
                    <Revisar linea={l}>
                      {puedeVincular && e.pideAccion && (
                        <div className="mt-1 flex flex-col gap-1">
                          {(l.candidatos || []).map((c) => (
                            <div key={c.productoBaseId} className="flex items-center gap-2">
                              <SunmiButton color="cyan" type="button" onClick={() => vincular(l.id, c.productoBaseId)}>
                                Es este
                              </SunmiButton>
                              <span className="text-sm2 sunmi-text-muted truncate">{c.nombre}</span>
                            </div>
                          ))}
                          {buscandoEn === l.id ? (
                            <BuscadorProducto
                              onElegir={(p) => vincular(l.id, p.productoBaseId)}
                              onCancelar={() => setBuscandoEn(null)}
                            />
                          ) : (
                            <SunmiButton color="slate" type="button" onClick={() => setBuscandoEn(l.id)}>
                              Buscar otro…
                            </SunmiButton>
                          )}
                        </div>
                      )}
                    </Revisar>
                  </td>
                  <td className="px-3 py-1.5 align-top text-xs">{Number(l.cantidad)}</td>
                  <td className="px-3 py-1.5 align-top text-xs">{money(l.netoUnitario)}</td>
                  <td className="px-3 py-1.5 align-top text-xs">{money(l.subtotalImpreso)}</td>
                  <td className="px-3 py-1.5 align-top text-sm2 sunmi-text-muted">
                    {l.pedidoDetalle
                      ? `${Number(l.pedidoDetalle.cantidad)} × ${money(l.pedidoDetalle.precioCosto)}`
                      : "—"}
                  </td>
                </SunmiTableRow>
              );
            })
          )}
        </SunmiTable>
      </div>

      {/* ── Móvil: tarjetas ──────────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-2">
        {lineas.map((l) => {
          const e = estadoDeVinculo(l);
          const nombre = l.sugerido?.nombre ?? l.candidatos?.[0]?.nombre ?? null;
          return (
            <div key={l.id} className="rounded border sunmi-border p-2">
              <p className="text-xs font-bold sunmi-text-strong">{nombre ?? "—"}</p>
              <p className="text-sm2 sunmi-text-muted break-words">{l.textoCrudo}</p>
              <p className="text-sm2 sunmi-text-muted mt-1">
                {Number(l.cantidad)} × {money(l.netoUnitario)} = {money(l.subtotalImpreso)}
              </p>
              <div className="mt-2">
                <Revisar linea={l}>
                  {puedeVincular && e.pideAccion && (
                    <div className="mt-1 flex flex-col gap-1">
                      {(l.candidatos || []).map((c) => (
                        <SunmiButton
                          key={c.productoBaseId}
                          color="cyan"
                          type="button"
                          className="justify-start text-left"
                          onClick={() => vincular(l.id, c.productoBaseId)}
                        >
                          Es este: {c.nombre}
                        </SunmiButton>
                      ))}
                      {buscandoEn === l.id ? (
                        <BuscadorProducto
                          onElegir={(p) => vincular(l.id, p.productoBaseId)}
                          onCancelar={() => setBuscandoEn(null)}
                        />
                      ) : (
                        <SunmiButton color="slate" type="button" onClick={() => setBuscandoEn(l.id)}>
                          Buscar otro…
                        </SunmiButton>
                      )}
                    </div>
                  )}
                </Revisar>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
