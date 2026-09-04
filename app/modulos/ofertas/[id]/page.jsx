"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPill from "@/components/sunmi/SunmiPill";

import EstadoOfertaPill from "@/components/ofertas/EstadoOfertaPill";
import EditorProductosOferta from "@/components/ofertas/EditorProductosOferta";
import FormularioOferta from "@/components/ofertas/FormularioOferta";
import { fechaHora, pesos, porcentaje, paraInputFechaHora, desdeInputFechaHora } from "@/lib/ofertas/formato";

// DETALLE DE UNA OFERTA: lo que rige, lo que hay que revisar, y qué se puede
// hacer con ella.
//
// Los botones NO deciden por su cuenta cuándo mostrarse: se dibujan según
// `oferta.acciones`, que lo resuelve el servidor con una tabla por estado. Si
// cada botón tuviera su propio `if`, terminarían habilitando cosas distintas y
// la pantalla ofrecería algo que la ruta después rechaza.

export default function DetalleOfertaPage() {
  const router = useRouter();
  const params = useParams();
  const ofertaId = Number(params?.id);
  const { perfil, cargando } = useUser();

  const permisos = useMemo(() => perfil?.permisos || [], [perfil]);
  const esAdmin = permisos.includes("*");
  const puedeVer = esAdmin || permisos.includes("ofertas.ver");
  const puedeEditar = esAdmin || permisos.includes("ofertas.editar");
  const puedeFinalizar = esAdmin || permisos.includes("ofertas.finalizar");
  const puedeEliminar = esAdmin || permisos.includes("ofertas.eliminar");
  const puedeCrear = esAdmin || permisos.includes("ofertas.crear");

  const [oferta, setOferta] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [editandoProductos, setEditandoProductos] = useState(false);
  const [lineasEditadas, setLineasEditadas] = useState([]);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [datos, setDatos] = useState(null);

  const cargar = useCallback(async () => {
    setCargandoDetalle(true);
    setError(null);
    try {
      const res = await fetch(`/api/ofertas/${ofertaId}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setOferta(null);
        setError(json?.error || `No se pudo abrir la oferta (HTTP ${res.status}).`);
        return;
      }
      setOferta(json.oferta);
      setDatos({
        nombre: json.oferta.nombre,
        inicioEn: paraInputFechaHora(json.oferta.inicioEn),
        finEn: paraInputFechaHora(json.oferta.finEn),
        condicionPago: json.oferta.condicionPago,
        observaciones: json.oferta.observaciones || "",
      });
      setLineasEditadas(
        (json.oferta.lineas || []).map((l) => ({
          productoLocalId: l.productoLocalId,
          nombre: l.nombre,
          precioNormal: l.precioNormalActual ?? l.precioNormalReferencia,
          costo: l.costoActual,
          precioOferta: l.precioOferta,
        }))
      );
    } catch (e) {
      setOferta(null);
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setCargandoDetalle(false);
    }
  }, [ofertaId]);

  useEffect(() => {
    if (puedeVer && Number.isInteger(ofertaId)) cargar();
  }, [puedeVer, ofertaId, cargar]);

  const llamar = async (url, opciones, mensajeOk) => {
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(url, { credentials: "include", ...opciones });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || `No se pudo completar la acción (HTTP ${res.status}).`);
        return null;
      }
      if (mensajeOk) setAviso(mensajeOk);
      return json;
    } catch (e) {
      setError(`No se pudo hablar con el servidor: ${e.message}`);
      return null;
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) return null;
  if (!puedeVer) return <SinPermisos />;
  if (cargandoDetalle) return <SunmiLoader />;

  if (error && !oferta) {
    return (
      <div className="w-full min-h-full">
        <SunmiCard>
          <div className="flex items-center gap-2">
            <SunmiBackButton onClick={() => router.push("/modulos/ofertas")} />
            <SunmiCardHeader title="Oferta" />
          </div>
          <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-danger">{error}</div>
        </SunmiCard>
      </div>
    );
  }

  const acciones = oferta.acciones || {};
  const porRevisar = (oferta.lineas || []).filter((l) => l.necesitaRevision);

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <div className="flex items-center gap-2 mb-1">
          <SunmiBackButton onClick={() => router.push("/modulos/ofertas")} />
          <SunmiCardHeader title={oferta.nombre} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <EstadoOfertaPill estado={oferta.estado} />
          <SunmiPill color="slate">{oferta.condicionPagoLabel}</SunmiPill>
          <span className="text-xs sunmi-text-muted">
            {fechaHora(oferta.inicioEn)} → {fechaHora(oferta.finEn)}
          </span>
          {oferta.localNombre && <span className="text-xs sunmi-text-muted">· {oferta.localNombre}</span>}
        </div>

        {aviso && <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-success mb-2">{aviso}</div>}
        {error && <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-danger mb-2">{error}</div>}

        {/* ── Lo que hay que revisar, primero de todo ────────────────────── */}
        {porRevisar.length > 0 && (
          <>
            <SunmiSeparator label="Hay que revisar" />
            <div className="flex flex-col gap-2">
              {porRevisar.map((l) => (
                <div key={l.id} className="sunmi-panel rounded-lg p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 sunmi-text-warning text-sm">
                    <AlertTriangle size={15} aria-hidden="true" />
                    <span className="font-medium">Cambió el costo de {l.nombre}</span>
                  </div>
                  <div className="text-sm sunmi-text-strong">
                    {pesos(l.cambioDeCosto.costoAnterior)} → {pesos(l.cambioDeCosto.costoActual)} (
                    {porcentaje(l.cambioDeCosto.variacionPct, { conSigno: true })})
                  </div>
                  <div className="text-xs sunmi-text-muted">
                    Precio oferta: {pesos(l.precioOferta)} · Margen antes {pesos(l.cambioDeCosto.margenAnterior)} ·
                    Margen ahora{" "}
                    <span className={l.cambioDeCosto.margenNegativo ? "sunmi-text-danger" : ""}>
                      {pesos(l.cambioDeCosto.margenActual)}
                    </span>
                  </div>
                  <div className="text-sm2 sunmi-text-muted">
                    La oferta se sigue aplicando como está. Cambiarla es una decisión tuya.
                  </div>
                </div>
              ))}
            </div>
            {puedeEditar && (
              <div className="mt-2">
                <SunmiButton
                  disabled={trabajando}
                  onClick={async () => {
                    const r = await llamar(
                      `/api/ofertas/${ofertaId}/revisar`,
                      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
                      "Revisión confirmada: el costo de referencia quedó actualizado."
                    );
                    if (r) cargar();
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    <Check size={14} aria-hidden="true" /> Lo vi, dejarla así
                  </span>
                </SunmiButton>
              </div>
            )}
          </>
        )}

        {/* ── Datos ──────────────────────────────────────────────────────── */}
        {editandoDatos && datos ? (
          <>
            <FormularioOferta valor={datos} onChange={setDatos} localNombre={oferta.localNombre} />
            <div className="flex gap-2 mt-2">
              <SunmiButton
                disabled={trabajando}
                onClick={async () => {
                  const r = await llamar(
                    `/api/ofertas/${ofertaId}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        nombre: datos.nombre,
                        inicioEn: desdeInputFechaHora(datos.inicioEn),
                        finEn: desdeInputFechaHora(datos.finEn),
                        condicionPago: datos.condicionPago,
                        observaciones: datos.observaciones,
                      }),
                    },
                    "Datos guardados."
                  );
                  if (r) {
                    setEditandoDatos(false);
                    cargar();
                  }
                }}
              >
                Guardar
              </SunmiButton>
              <SunmiButton color="slate" onClick={() => setEditandoDatos(false)} disabled={trabajando}>
                Cancelar
              </SunmiButton>
            </div>
          </>
        ) : (
          oferta.observaciones && (
            <>
              <SunmiSeparator label="Observaciones" />
              <div className="text-sm sunmi-text-muted">{oferta.observaciones}</div>
            </>
          )
        )}

        {/* ── Productos ──────────────────────────────────────────────────── */}
        {editandoProductos ? (
          <>
            <EditorProductosOferta lineas={lineasEditadas} onChange={setLineasEditadas} />
            <div className="flex gap-2 mt-2">
              <SunmiButton
                disabled={trabajando}
                onClick={async () => {
                  const r = await llamar(
                    `/api/ofertas/${ofertaId}/lineas`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        lineas: lineasEditadas.map((l) => ({
                          productoLocalId: l.productoLocalId,
                          precioOferta: Number(l.precioOferta),
                        })),
                      }),
                    },
                    "Productos guardados. Las ventas anteriores conservan el precio con el que se cobraron."
                  );
                  if (r) {
                    setEditandoProductos(false);
                    cargar();
                  }
                }}
              >
                Guardar productos
              </SunmiButton>
              <SunmiButton
                color="slate"
                disabled={trabajando}
                onClick={() => {
                  setEditandoProductos(false);
                  cargar();
                }}
              >
                Cancelar
              </SunmiButton>
            </div>
          </>
        ) : (
          <>
            <SunmiSeparator label={`Productos (${oferta.cantidadProductos})`} />
            <div className="flex flex-col gap-1.5">
              {(oferta.lineas || []).length === 0 && (
                <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-muted text-center">
                  Esta oferta no tiene productos: no cambia ningún precio.
                </div>
              )}
              {(oferta.lineas || []).map((l) => (
                <div key={l.id} className="sunmi-panel rounded-lg p-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm sunmi-text-strong truncate">{l.nombre}</div>
                    <div className="text-sm2 sunmi-text-muted">
                      Normal {pesos(l.precioNormalActual ?? l.precioNormalReferencia)} · Costo {pesos(l.costoActual)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold sunmi-text-accent">{pesos(l.precioOferta)}</div>
                    <div className="text-sm2 sunmi-text-muted">
                      {porcentaje(l.descuentoPct)} · margen{" "}
                      <span className={l.margenNegativo ? "sunmi-text-danger" : ""}>{pesos(l.margen)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Acciones ───────────────────────────────────────────────────── */}
        <SunmiSeparator label="Acciones" />
        <div className="flex flex-wrap gap-2">
          {acciones.editar && puedeEditar && !editandoProductos && (
            <SunmiButton color="slate" onClick={() => setEditandoProductos(true)} disabled={trabajando}>
              Editar productos
            </SunmiButton>
          )}
          {acciones.editar && puedeEditar && !editandoDatos && (
            <SunmiButton color="slate" onClick={() => setEditandoDatos(true)} disabled={trabajando}>
              Editar datos
            </SunmiButton>
          )}
          {acciones.publicar && puedeEditar && (
            <SunmiButton
              disabled={trabajando}
              onClick={async () => {
                const r = await llamar(
                  `/api/ofertas/${ofertaId}/publicar`,
                  { method: "POST" },
                  "Oferta publicada."
                );
                if (r) cargar();
              }}
            >
              Publicar
            </SunmiButton>
          )}
          {acciones.renovar && puedeCrear && (
            <SunmiButton
              color="slate"
              disabled={trabajando}
              onClick={async () => {
                const ahora = new Date();
                const enUnaSemana = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);
                const r = await llamar(`/api/ofertas/${ofertaId}/renovar`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ inicioEn: ahora.toISOString(), finEn: enUnaSemana.toISOString() }),
                });
                if (r) router.push(`/modulos/ofertas/${r.ofertaId}`);
              }}
            >
              Renovar (duplicar)
            </SunmiButton>
          )}
          {acciones.finalizar && puedeFinalizar && (
            <SunmiButton
              color="amber"
              disabled={trabajando}
              onClick={async () => {
                if (!confirm(`¿Finalizar "${oferta.nombre}"? Deja de aplicarse y pasa al archivo.`)) return;
                const r = await llamar(
                  `/api/ofertas/${ofertaId}/finalizar`,
                  { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
                  "Oferta finalizada."
                );
                if (r) cargar();
              }}
            >
              Finalizar
            </SunmiButton>
          )}
          {acciones.eliminar && puedeEliminar && (
            <SunmiButton
              color="red"
              disabled={trabajando}
              onClick={async () => {
                if (!confirm(`¿Eliminar "${oferta.nombre}" definitivamente?`)) return;
                const r = await llamar(`/api/ofertas/${ofertaId}`, { method: "DELETE" });
                if (r) router.push("/modulos/ofertas");
              }}
            >
              Eliminar
            </SunmiButton>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
