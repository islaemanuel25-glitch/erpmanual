"use client";

// Acciones sobre un ticket ya emitido (panel del detalle de venta admin):
//   · Reimprimir (térmica)  · PDF  · Compartir (con fallback a descarga)
//   · Corrección simple (cliente / observaciones / referencia interna)
//   · Corregir venta completa → DESHABILITADO hasta Fase B.
//
// Reimpresión/PDF/Compartir usan datos HISTÓRICOS de la venta, marcan
// "REIMPRESIÓN — COPIA" y conservan el número original (opts.copia).

import { useState, useEffect } from "react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiCard from "@/components/sunmi/SunmiCard";
import EditorVentaCorreccion from "@/components/reportes-ventas/EditorVentaCorreccion";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Construye el objeto `venta` que consumen los generadores de ticket, desde el
// detalle histórico. copia=true agrega la marca de reimpresión.
function construirTicket(venta) {
  return {
    localNombre: venta.local?.nombre || "POS Ventas",
    numero: venta.numero,
    fecha: venta.fecha, // fecha ORIGINAL (histórica)
    vendedor: venta.vendedor?.nombre || "-",
    cliente: venta.cliente
      ? {
          nombre: venta.cliente.nombre,
          documento: venta.cliente.documento || null,
          telefono: venta.cliente.telefono || null,
          direccion: venta.cliente.direccion || null,
        }
      : null,
    items: (venta.detalles || []).map((d) => ({
      nombre: d.nombre,
      cantidad: num(d.cantidad),
      precio: num(d.precio),
      esServicio: !!d.esServicio,
      importeBaseServicio: d.importeBaseServicio != null ? num(d.importeBaseServicio) : null,
      recargoServicioPct: d.recargoServicioPct != null ? num(d.recargoServicioPct) : null,
      recargoServicioImporte: d.recargoServicioImporte != null ? num(d.recargoServicioImporte) : null,
    })),
    subtotal: num(venta.totales?.subtotal),
    descuento: num(venta.totales?.descuento),
    total: num(venta.totales?.total),
    comisionBancaria: num(venta.totales?.comisionBancaria),
    netoRecibido: num(venta.totales?.netoRecibido),
    formaPago: venta.formaPago,
    esFiado: venta.esFiado,
    // Snapshot de tenders para el desglose de pagos del ticket.
    pagos: (venta.pagos || []).map((p) => ({ medio: p.medio, monto: num(p.monto) })),
  };
}

export default function AccionesTicket({ venta, onCorregido }) {
  const c = venta?.correccion || {};
  const [msg, setMsg] = useState(null); // { tipo: "ok"|"error"|"info", texto }
  const [panel, setPanel] = useState(null); // "simple" | "historial" | null
  const [busy, setBusy] = useState(false);
  const [editorAbierto, setEditorAbierto] = useState(false);

  const flash = (tipo, texto) => setMsg({ tipo, texto });

  async function reimprimir() {
    try {
      const { default: imprimirTicketTermico } = await import("@/lib/pos-ventas/imprimirTicketTermico");
      imprimirTicketTermico(construirTicket(venta), 58, { copia: true });
    } catch (e) {
      console.error(e);
      flash("error", "No se pudo reimprimir el ticket.");
    }
  }

  async function generarPDF() {
    try {
      const { default: generarTicketPDF } = await import("@/lib/pos-ventas/generarTicketPDF");
      generarTicketPDF(construirTicket(venta), { copia: true });
    } catch (e) {
      console.error(e);
      flash("error", "No se pudo generar el PDF.");
    }
  }

  async function compartir() {
    let blob = null, nombreArchivo = `ticket-${venta.numero}-copia.pdf`;
    try {
      const { default: generarTicketPDF } = await import("@/lib/pos-ventas/generarTicketPDF");
      const out = generarTicketPDF(construirTicket(venta), { copia: true, output: "blob" });
      blob = out?.blob || null;
      nombreArchivo = out?.nombreArchivo || nombreArchivo;
    } catch (e) {
      console.error(e);
    }

    // 1) Intentar compartir el archivo PDF (Web Share API nivel 2).
    try {
      if (blob && typeof navigator !== "undefined" && navigator.canShare) {
        const file = new File([blob], nombreArchivo, { type: "application/pdf" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Ticket #${venta.numero}` });
          return;
        }
      }
      // 2) Compartir texto (Web Share API nivel 1).
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `Ticket #${venta.numero}`,
          text: `Ticket #${venta.numero} — ${venta.local?.nombre || ""} — Total $${num(venta.totales?.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
        });
        return;
      }
      throw new Error("share_no_soportado");
    } catch (e) {
      if (e?.name === "AbortError") return; // el usuario canceló
      // 3) Fallback obligatorio: descargar el PDF.
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        flash("info", "Compartir no disponible en este dispositivo: se descargó el PDF.");
      } else {
        flash("error", "No se pudo compartir ni descargar el ticket.");
      }
    }
  }

  return (
    <SunmiCard className="p-3">
      {/* Estado de corrección */}
      {c.corregida && (
        <div className="mb-2 flex items-center gap-2 text-[12px]">
          <span className="px-2 py-0.5 rounded-full sunmi-state-warning sunmi-text-accent font-medium">
            ✎ Venta corregida
          </span>
          <span className="sunmi-text-muted">versión {c.version}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <SunmiButton color="slate" onClick={reimprimir} className="text-sm">
          🖨 Reimprimir
        </SunmiButton>
        <SunmiButton color="slate" onClick={generarPDF} className="text-sm">
          📄 PDF
        </SunmiButton>
        <SunmiButton color="slate" onClick={compartir} className="text-sm">
          📤 Compartir
        </SunmiButton>

        {c.puedeCorregirSimple && (
          <SunmiButton
            color="amber"
            onClick={() => { setPanel(panel === "simple" ? null : "simple"); setMsg(null); }}
            className="text-sm"
          >
            ✎ Corrección simple
          </SunmiButton>
        )}

        {/* Corregir venta (completa) — solo con turno original abierto */}
        {c.puedeCorregirCompleta ? (
          <SunmiButton
            color="amber"
            onClick={() => { setEditorAbierto(true); setMsg(null); }}
            className="text-sm"
          >
            🧾 Corregir venta
          </SunmiButton>
        ) : (
          <SunmiButton
            color="slate"
            disabled
            title={
              c.motivoCompletaDeshabilitada === "turno_cerrado_no_corregible"
                ? "El turno original ya está cerrado"
                : c.motivoCompletaDeshabilitada === "fuera_de_ventana"
                  ? "Pasó la ventana de 30 días"
                  : c.motivoCompletaDeshabilitada === "sin_permiso"
                    ? "No tenés permiso"
                    : c.motivoCompletaDeshabilitada === "flag_no_habilitado"
                      ? "Función en beta: no habilitada para tu usuario"
                      : "No disponible"
            }
            className="text-sm opacity-50 cursor-not-allowed"
          >
            🧾 Corregir venta
          </SunmiButton>
        )}

        <SunmiButton
          color="slate"
          onClick={() => setPanel(panel === "historial" ? null : "historial")}
          className="text-sm"
        >
          🕑 Historial
        </SunmiButton>
      </div>

      {/* Aviso de ventana vencida (solo si tiene permiso pero está fuera de plazo) */}
      {!c.puedeCorregirSimple && !c.dentroDeVentana && c.diasTranscurridos != null && (
        <div className="mt-2 text-[11px] sunmi-text-muted">
          Corrección no disponible: pasaron {c.diasTranscurridos} días (límite 30).
        </div>
      )}

      {msg && (
        <div
          className={`mt-2 text-[12px] rounded px-2 py-1.5 ${
            msg.tipo === "error"
              ? "sunmi-state-danger sunmi-text-danger"
              : msg.tipo === "ok"
                ? "sunmi-state-success sunmi-text-success"
                : "sunmi-surface sunmi-text-muted"
          }`}
        >
          {msg.texto}
        </div>
      )}

      {panel === "simple" && (
        <FormularioCorreccionSimple
          venta={venta}
          busy={busy}
          setBusy={setBusy}
          onCancel={() => setPanel(null)}
          onSaved={(info) => {
            setPanel(null);
            flash("ok", "Corrección aplicada.");
            onCorregido && onCorregido(info);
          }}
          onError={(texto) => flash("error", texto)}
        />
      )}

      {panel === "historial" && <HistorialCorrecciones ventaId={venta.id} />}

      {editorAbierto && (
        <EditorVentaCorreccion
          ventaId={venta.id}
          onClose={() => setEditorAbierto(false)}
          onCorregido={(info) => {
            setEditorAbierto(false);
            flash("ok", "Venta corregida.");
            onCorregido && onCorregido(info);
          }}
        />
      )}
    </SunmiCard>
  );
}

// ---------------------------------------------------------------------------
// Formulario de corrección SIMPLE (inline). Cliente / observaciones / referencia.
// ---------------------------------------------------------------------------
function FormularioCorreccionSimple({ venta, busy, setBusy, onCancel, onSaved, onError }) {
  const c = venta.correccion || {};
  const fiado = venta.esFiado;
  const [clienteSel, setClienteSel] = useState(
    venta.cliente ? { id: venta.cliente.id, nombre: venta.cliente.nombre } : null
  );
  const [buscando, setBuscando] = useState("");
  const [resultados, setResultados] = useState([]);
  const [observaciones, setObservaciones] = useState(c.observaciones || "");
  const [referencia, setReferencia] = useState(c.referenciaInterna || "");
  const [motivo, setMotivo] = useState("");

  async function buscarCliente(q) {
    setBuscando(q);
    if (!q || q.length < 2) { setResultados([]); return; }
    try {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const data = await res.json();
      setResultados(data.ok ? (data.items || []).slice(0, 8) : []);
    } catch {
      setResultados([]);
    }
  }

  async function guardar() {
    if (!motivo.trim()) { onError("El motivo es obligatorio."); return; }
    setBusy(true);
    try {
      const body = {
        motivo: motivo.trim(),
        version: c.version,
        clienteId: clienteSel ? clienteSel.id : null,
        observaciones: observaciones.trim() || null,
        referenciaInterna: referencia.trim() || null,
      };
      const res = await fetch(`/api/pos-ventas/corregir-simple/${venta.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        onSaved({ version: data.version, correccionId: data.correccionId });
      } else {
        onError(data.error || "No se pudo aplicar la corrección.");
      }
    } catch (e) {
      console.error(e);
      onError("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t sunmi-divider pt-3 space-y-3">
      <div className="text-[13px] font-semibold">Corrección simple</div>

      {/* Cliente */}
      <div>
        <div className="text-[11px] sunmi-text-muted mb-1">Cliente</div>
        {fiado ? (
          <div className="text-[11px] sunmi-state-warning sunmi-text-accent rounded px-2 py-1.5">
            Venta fiada: el cliente no se puede cambiar desde la corrección simple.
            <div className="mt-0.5 sunmi-text-muted">Cliente: {venta.cliente?.nombre || "—"}</div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-medium">
                {clienteSel ? clienteSel.nombre : "Consumidor final"}
              </span>
              {clienteSel && (
                <button
                  type="button"
                  className="text-[11px] sunmi-text-link underline"
                  onClick={() => setClienteSel(null)}
                >
                  quitar
                </button>
              )}
            </div>
            <SunmiInput
              value={buscando}
              onChange={(e) => buscarCliente(e.target.value)}
              placeholder="Buscar cliente por nombre/documento…"
              className="text-sm"
            />
            {resultados.length > 0 && (
              <div className="mt-1 sunmi-surface rounded max-h-40 overflow-auto">
                {resultados.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="block w-full text-left px-2 py-1.5 text-[12px] hover:sunmi-surface-hover"
                    onClick={() => { setClienteSel({ id: r.id, nombre: r.nombre }); setResultados([]); setBuscando(""); }}
                  >
                    {r.nombre}
                    {r.documento ? <span className="sunmi-text-muted ml-1">({r.documento})</span> : null}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Observaciones */}
      <div>
        <div className="text-[11px] sunmi-text-muted mb-1">Observaciones</div>
        <SunmiInput
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Notas internas del ticket…"
          className="text-sm"
          maxLength={1000}
        />
      </div>

      {/* Referencia interna */}
      <div>
        <div className="text-[11px] sunmi-text-muted mb-1">Referencia interna</div>
        <SunmiInput
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="Ej: N° de remito, comprobante…"
          className="text-sm"
          maxLength={120}
        />
      </div>

      {/* Motivo (obligatorio) */}
      <div>
        <div className="text-[11px] sunmi-text-muted mb-1">Motivo de la corrección *</div>
        <SunmiInput
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por qué se corrige (obligatorio)"
          className="text-sm"
          maxLength={300}
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <SunmiButton color="slate" onClick={onCancel} disabled={busy} className="text-sm">
          Cancelar
        </SunmiButton>
        <SunmiButton color="amber" onClick={guardar} disabled={busy || !motivo.trim()} className="text-sm">
          {busy ? "Guardando…" : "Aplicar corrección"}
        </SunmiButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historial de correcciones (fuente: VentaCorreccion).
// ---------------------------------------------------------------------------
function HistorialCorrecciones({ ventaId }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    // loading arranca en true (estado inicial); el componente se monta de nuevo
    // cada vez que se abre el panel, así que no hace falta resetearlo acá.
    let vivo = true;
    fetch(`/api/pos-ventas/correcciones/${ventaId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d.ok) setItems(d.items || []);
        else setError(d.error || "No se pudo cargar el historial.");
      })
      .catch(() => { if (vivo) setError("Error de conexión."); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [ventaId]);

  return (
    <div className="mt-3 border-t sunmi-divider pt-3">
      <div className="text-[13px] font-semibold mb-2">Historial de correcciones</div>
      {loading && <div className="text-[12px] sunmi-text-muted">Cargando…</div>}
      {error && <div className="text-[12px] sunmi-text-danger">{error}</div>}
      {!loading && !error && (items?.length ?? 0) === 0 && (
        <div className="text-[12px] sunmi-text-muted">Sin correcciones registradas.</div>
      )}
      <div className="space-y-2">
        {(items || []).map((it) => (
          <div key={it.id} className="sunmi-surface rounded p-2 text-[12px] space-y-0.5">
            <div className="flex justify-between">
              <span className="font-medium capitalize">{String(it.tipo).toLowerCase()}</span>
              <span className="sunmi-text-muted">{new Date(it.fecha).toLocaleString("es-AR")}</span>
            </div>
            <div className="sunmi-text-muted">Por: {it.autor}</div>
            <div>Motivo: {it.motivo}</div>
            {Number(it.diferencia) !== 0 && (
              <div>Diferencia: ${Number(it.diferencia).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
