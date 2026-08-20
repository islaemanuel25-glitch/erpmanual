// app/modulos/transferencias/[id]/page.jsx
//
// Página "Ver transferencia". Copia la composición de
// app/modulos/reportes-ventas/[ventaId]/page.jsx: mismo contenedor a ancho
// completo, misma franja de encabezado, misma card de acciones arriba y las
// mismas secciones hermanas debajo (Información general → Productos → Totales).
//
//   contenedor  sunmi-bg w-full min-h-full p-2 lg:p-3
//   interior    w-full space-y-3
//   franja      flex items-start justify-between gap-3 flex-wrap
//   acciones    SunmiCard p-3 con flex flex-wrap gap-2
//   secciones   section space-y-2 → SectionHead + SunmiCard
//
// Lo que se eliminó a propósito: `max-w-6xl mx-auto` (Ventas lo quitó porque
// recortaba la página y la centraba dejando el ancho vacío), la SunmiCard única
// que envolvía todo, y los `mx-1` internos. La lógica de recepción,
// confirmación, cancelación y permisos no se tocó.
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import useContextoActivo from "@/hooks/useContextoActivo";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import SinPermisos from "@/components/auth/SinPermisos";
import EstadoTransferenciaBadge, { DiferenciasBadge } from "@/components/transferencias/EstadoTransferenciaBadge";
import TransferenciaHeader from "@/components/transferencias/TransferenciaHeader";
import TablaDetalleTransferencia from "@/components/transferencias/TablaDetalleTransferencia";
import AccionesRecepcion from "@/components/transferencias/AccionesRecepcion";
import { SectionHead, TotalTile, fmtCantidad, fmtMoneda } from "@/components/transferencias/detallePresentacion";

const LISTADO = "/modulos/transferencias";
const TZ_AR = "America/Argentina/Cordoba";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtFechaHoraAR(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  // Ya declaraba la zona; le faltaba `hour12: false`. Del helper único.
  return fechaHoraAR(d);
}

export default function TransferenciaDetallePage() {
  const { id } = useParams();
  const router = useRouter();
  const { contexto } = useContextoActivo();

  const [item, setItem] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const [me, setMe] = useState(null);

  // Detecta cambios sin guardar
  const [dirty, setDirty] = useState(false);

  // Wrapper para marcar cambios como dirty
  const setEditItemsDirty = (fn) => {
    setDirty(true);
    setEditItems(fn);
  };

  // ===============================
  // Usuario
  // ===============================
  const cargarUsuario = async () => {
    const res = await fetch("/api/me");
    const json = await res.json();
    if (json.ok) setMe(json.user);
  };

  // ===============================
  // Cargar transferencia
  // ===============================
  const cargar = async () => {
    try {
      setLoading(true);
      setError("");

      const url = new URL(
        "/api/transferencias/detalle",
        window.location.origin
      );
      url.searchParams.set("id", String(id));

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error || "Error al cargar");
        setItem(null);
        return;
      }

      setItem(json.item);

      setEditItems(
        json.item.items.map((d) => ({
          id: d.id,
          enviado: d.cantidadEnviada,
          // null = todavía no se cargó recepción → se propone lo enviado.
          // 0 = no llegó ninguna unidad → se muestra 0. Son cosas distintas, y
          // usar truthiness acá hacía que un 0 guardado reapareciera como el
          // total enviado y se pudiera sobrescribir sin querer.
          recibido:
            d.cantidadRecibida == null ? d.cantidadEnviada : d.cantidadRecibida,
          motivoPrincipal: d.motivoPrincipal || "",
          motivoDetalle: d.motivoDetalle || "",
        }))
      );

      // Al cargar, no hay cambios pendientes
      setDirty(false);

    } catch (e) {
      console.error("Error cargando transferencia:", e);
      setError("Error al cargar transferencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarUsuario(); }, []);
  useEffect(() => { if (id) cargar(); }, [id]);

  // "Volver a transferencias": navegación al listado, que reconstruye el reporte
  // solo. El contexto —reporte generado, fechas, estado, tab, orden, página y
  // scroll— lo dejó guardado el listado en sessionStorage al abrir el detalle;
  // acá no hace falta reenviarlo. Por eso NO se usa un href fijo suelto: se
  // navega con el router para que el listado se monte y lo hidrate.
  const volver = () => {
    router.push(LISTADO);
  };

  if (!me) return <div className="p-4 sunmi-text-muted">Cargando usuario...</div>;

  // ===============================
  // Guard de acceso a pantalla
  // ===============================
  const permisos = me?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("transferencias.ver")) return <SinPermisos />;

  // ===============================
  // Permisos — solo el local destino puede editar/recibir
  // ===============================
  const localIdActivo = contexto?.localId || me.localId || null;

  let puedeRecibir = false;

  if (item && localIdActivo) {
    const esDestino = item.destino?.id === localIdActivo;
    const estadoValido =
      item.estado === "Enviada" || item.estado === "Recibiendo";
    puedeRecibir = estadoValido && esDestino;
  }

  const inputsHabilitados = puedeRecibir;

  // Cancelar: solo estado "Enviada" + permiso transferencias.cancelar
  const puedeCancelar =
    item?.estado === "Enviada" &&
    (esAdmin || permisos.includes("transferencias.cancelar"));

  // ===============================
  // Guardar cambios
  // ===============================
  const guardarCambios = async () => {
    try {
      setGuardando(true);

      for (const it of editItems) {
        const enviado = num(it.enviado);
        const recibido = num(it.recibido);

        if (recibido !== enviado) {
          if (!it.motivoPrincipal) {
            alert("Falta motivo.");
            setGuardando(false);
            return;
          }

          if (
            it.motivoPrincipal === "Otro" &&
            (!it.motivoDetalle || it.motivoDetalle.trim() === "")
          ) {
            alert("Debés detallar motivo (Otro).");
            setGuardando(false);
            return;
          }
        }
      }

      const res = await fetch("/api/transferencias/guardar-recepcion", {
        method: "POST",
        body: JSON.stringify({
          transferenciaId: item.id,
          items: editItems,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      await cargar();

      // Cambios guardados → dirty false
      setDirty(false);

    } catch (err) {
      alert("Error guardando: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // ===============================
  // Confirmar recepción
  // ===============================
  const confirmarRecepcion = async () => {

    // BLOQUEAR si hay cambios sin guardar
    if (dirty) {
      alert("Tenés cambios sin guardar. Guardalos antes de confirmar.");
      return;
    }

    try {
      setConfirmando(true);

      const res = await fetch("/api/transferencias/confirmar-recepcion", {
        method: "POST",
        body: JSON.stringify({ transferenciaId: item.id }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      await cargar();

    } catch (err) {
      alert("Error confirmando: " + err.message);
    } finally {
      setConfirmando(false);
    }
  };

  // ===============================
  // Cancelar transferencia
  // ===============================
  const cancelarTransferencia = async () => {
    if (!confirm("¿Estás seguro de cancelar esta transferencia? Se revertirá el stock en tránsito al origen.")) {
      return;
    }

    try {
      setCancelando(true);

      const res = await fetch("/api/transferencias/cancelar", {
        method: "POST",
        body: JSON.stringify({ transferenciaId: item.id }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      await cargar();

    } catch (err) {
      alert("Error cancelando: " + err.message);
    } finally {
      setCancelando(false);
    }
  };

  // ===============================
  // Totales
  //
  // Se cuentan LÍNEAS, no cantidades. Sumar las cantidades de todas las líneas
  // daría un número sin significado físico: un remito puede tener una línea en
  // BULTO, otra en unidades y otra en kg, y "58" no sería ni bultos ni unidades
  // ni kilos. Las cantidades siguen estando, por línea, en la tabla.
  // El importe sí es homogéneo —pesos— y se muestra tal cual.
  // ===============================
  const lineas = item?.items || [];
  const lineasRecibidas = lineas.filter((d) => d.cantidadRecibida != null).length;
  const lineasConDiferencia = lineas.filter(
    (d) => d.cantidadRecibida != null && num(d.cantidadRecibida) !== num(d.cantidadEnviada)
  ).length;
  const lineasDevueltas = lineas.filter((d) => d.devolucionOrigen != null && num(d.devolucionOrigen) > 0).length;
  const importeTotal = item ? num(item.resumen?.costoTotal) : 0;

  const titulo = item ? `Transferencia #${item.id}` : "Ver transferencia";
  const fechaCabecera = item ? (item.fechaEnvio ?? item.fechaCreada) : null;

  // ===============================
  // Render
  // ===============================
  return (
    // Mismo contenedor que "Ver venta": ancho útil completo, sin `max-w` y sin
    // centrado. Antes era `p-2 sm:p-4 max-w-6xl mx-auto`, que recortaba la
    // página a ~1120 px y dejaba el resto vacío.
    <div className="sunmi-bg w-full min-h-full p-2 lg:p-3">
      <div className="w-full space-y-3">
        {/* Franja de encabezado: Volver + título + badges a la izquierda, fecha
            a la derecha. Una sola fila en desktop, con wrap en pantallas chicas. */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <SunmiButton color="slate" onClick={volver} className="text-sm shrink-0">
              ← Volver a transferencias
            </SunmiButton>
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {titulo}
            </h1>
            {item && <EstadoTransferenciaBadge estado={item.estado} />}
            {item && (
              <DiferenciasBadge estado={item.estado} tieneDiferencias={item.tieneDiferencias} />
            )}
            {loading && item && (
              <span className="text-[11px] sunmi-text-muted">Actualizando…</span>
            )}
          </div>
          {item && (
            <div className="text-right shrink-0">
              <div className="text-[11px] sunmi-text-muted leading-tight">Fecha y hora</div>
              <div className="text-sm font-medium tabular-nums leading-tight">
                {fmtFechaHoraAR(fechaCabecera)}
              </div>
            </div>
          )}
        </div>

        {/* Primera carga */}
        {loading && !item && (
          <div className="text-center py-10">
            <SunmiLoader />
          </div>
        )}

        {/* Errores de carga (solo cuando no hay datos que mostrar) */}
        {!item && error && (
          <div className="space-y-3">
            <div className="sunmi-state-danger sunmi-text-danger rounded-lg p-4 text-sm">
              {error}
            </div>
            <div className="flex gap-2">
              <SunmiButton color="amber" onClick={cargar} className="text-sm">
                Reintentar
              </SunmiButton>
              <SunmiButton color="slate" onClick={volver} className="text-sm">
                ← Volver a transferencias
              </SunmiButton>
            </div>
          </div>
        )}

        {item && (
          <>
            {/* Acciones ARRIBA, en su propia card — mismo lugar y misma
                composición que AccionesTicket en "Ver venta". */}
            <AccionesRecepcion
              id={id}
              item={item}
              me={me}
              puedeRecibir={puedeRecibir}
              guardando={guardando}
              guardarCambios={guardarCambios}
              confirmando={confirmando}
              confirmarRecepcion={confirmarRecepcion}
              puedeCancelar={puedeCancelar}
              cancelando={cancelando}
              cancelarTransferencia={cancelarTransferencia}
            />

            {/* 1 · Información general */}
            <TransferenciaHeader item={item} />

            {/* 2 · Productos transferidos */}
            <TablaDetalleTransferencia
              item={item}
              editItems={editItems}
              setEditItems={setEditItemsDirty}
              inputsHabilitados={inputsHabilitados}
            />

            {/* 3 · Totales — métricas por LÍNEA (ver comentario arriba) */}
            <section className="space-y-2">
              <SectionHead title="Totales" />
              <SunmiCard>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
                  <TotalTile label="Líneas" value={fmtCantidad(lineas.length)} />
                  <TotalTile
                    label="Líneas recibidas"
                    value={lineasRecibidas === 0 ? "—" : fmtCantidad(lineasRecibidas)}
                    tone={lineasRecibidas === 0 ? "muted" : "neutral"}
                  />
                  <TotalTile
                    label="Líneas con diferencia"
                    value={lineasRecibidas === 0 ? "—" : fmtCantidad(lineasConDiferencia)}
                    tone={lineasConDiferencia > 0 ? "accent" : "muted"}
                  />
                  <TotalTile
                    label="Líneas devueltas al origen"
                    value={lineasDevueltas === 0 ? "—" : fmtCantidad(lineasDevueltas)}
                    tone={lineasDevueltas > 0 ? "accent" : "muted"}
                  />
                  <TotalTile
                    label="Importe total"
                    value={fmtMoneda(importeTotal)}
                    tone="success"
                    highlight
                  />
                </div>
              </SunmiCard>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
