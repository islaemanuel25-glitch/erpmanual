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

import { useEffect, useRef, useState } from "react";
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
import AgregarProductoRecibido from "@/components/transferencias/AgregarProductoRecibido";
import PanelCancelarTransferencia from "@/components/transferencias/PanelCancelarTransferencia";
import { SectionHead, TotalTile, fmtCantidad, fmtMoneda } from "@/components/transferencias/detallePresentacion";
import {
  construirEditItems,
  cuerpoQuitarLinea,
  hayEdicionPendiente,
  reconciliarEditItems,
} from "@/lib/transferencias/recepcionUI";

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

  // ── ESTE HOOK ESTABA 130 LÍNEAS MÁS ABAJO Y ROMPÍA LA PANTALLA ────────────
  //
  // Abre el panel de cancelación. Vivía después de `if (!me) return ...`, y ahí
  // está el defecto: en el PRIMER render `me` es null, el componente retorna
  // antes y React cuenta ocho `useState`; en el segundo `me` ya existe, la
  // ejecución llega hasta acá y React cuenta nueve. Cambiar la cantidad de hooks
  // entre renders es exactamente lo que las Rules of Hooks prohíben, y el
  // resultado fue "Application error: a client-side exception has occurred" al
  // abrir CUALQUIER transferencia.
  //
  // Lo introduje al reemplazar el handler `cancelarTransferencia` por este
  // estado: un handler puede vivir en cualquier lado, un hook no. Que el
  // reemplazo fuera línea por línea en el mismo lugar es lo que lo hizo
  // invisible al leer el diff.
  //
  // Todo hook de este componente va acá arriba, antes de cualquier return.
  const [panelCancelar, setPanelCancelar] = useState(false);

  // Selector de "producto que llegó y no estaba en el remito", y qué línea se
  // está quitando. Los dos hooks van acá arriba, antes de cualquier return, por
  // el mismo motivo que el de arriba: cambiar la cantidad de hooks entre renders
  // rompe la pantalla entera.
  const [agregarAbierto, setAgregarAbierto] = useState(false);
  const [quitandoId, setQuitandoId] = useState(null);

  const [me, setMe] = useState(null);

  // Detecta cambios sin guardar
  const [dirty, setDirty] = useState(false);

  // ── UN ESPEJO DE `editItems`, Y NO ES UNA COMODIDAD ───────────────────────
  //
  // Agregar una línea recarga del servidor y tiene que RECONCILIAR lo fresco con
  // lo que el operador tenía escrito. Ese "lo que tenía escrito" hay que leerlo
  // en el momento de recargar, y leerlo del estado significaría leer la clausura
  // del render en el que se creó el handler: si entre medio hubo otro
  // `setEditItems`, el valor sería viejo y la edición que se pretende conservar
  // se perdería igual — el mismo defecto con otra causa.
  //
  // El ref se escribe en el MISMO lugar donde se escribe el estado, así que los
  // dos dicen siempre lo mismo.
  const editItemsRef = useRef([]);
  const aplicarEditItems = (valor) => {
    editItemsRef.current = valor;
    setEditItems(valor);
  };

  // Wrapper para marcar cambios como dirty
  const setEditItemsDirty = (valor) => {
    setDirty(true);
    aplicarEditItems(valor);
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
  /**
   * ── LOS DOS MODOS DE RECARGAR, Y CUÁNDO VA CADA UNO ─────────────────────
   *
   * Por defecto `cargar()` REEMPLAZA todo y deja `dirty` en false. Es lo que
   * corresponde después de la carga inicial, de Guardar y de Confirmar: en esos
   * tres momentos lo que hay en el servidor ES lo último que quiso el operador,
   * así que no hay nada pendiente que conservar.
   *
   * `cargar({ preservarEdicion: true })` es solo para las recargas que provoca
   * AGREGAR o QUITAR una línea. Ahí el operador no guardó nada: pidió otra cosa,
   * y pisarle lo escrito sería cobrarle esa otra cosa con su trabajo.
   *
   * En ese modo `dirty` no se fuerza: se RECALCULA comparando lo reconciliado
   * contra lo que el servidor propone. Si ya no queda ninguna edición —por
   * ejemplo porque la única que había estaba en la línea que se acaba de
   * quitar— vuelve a false solo, sin dejar el aviso encendido de gusto.
   */
  const cargar = async ({ preservarEdicion = false } = {}) => {
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

      // La construcción de `editItems` se mudó a `recepcionUI`: la hacen dos
      // caminos —reemplazar y reconciliar— y con dos copias, el día que una
      // cambie la otra queda atrás. El distingo entre `null` y `0` sigue vivo
      // allá, en `filaDeServidor`, con su motivo escrito.
      const frescos = json.item.items;
      const reconciliados = preservarEdicion
        ? reconciliarEditItems({ items: frescos, previos: editItemsRef.current })
        : construirEditItems(frescos);

      aplicarEditItems(reconciliados);

      // Reemplazar no deja nada pendiente. Preservar sí puede, y se pregunta en
      // vez de suponerse.
      setDirty(
        preservarEdicion
          ? hayEdicionPendiente({ items: frescos, editItems: reconciliados })
          : false
      );

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

  // ── QUIÉN VE EL BOTÓN DE CANCELAR ──────────────────────────────────────────
  //
  // Estado "Enviada" + permiso, y además PARTICIPAR de la transferencia: ser el
  // origen o el destino. Ese último pedazo faltaba y creaba una contradicción —
  // la pantalla ofrecía el botón a cualquiera con el permiso y el backend
  // rechazaba con un 403 al que no fuera el origen.
  //
  // Ahora el backend acepta a las dos puntas (el destino es quien descubre que
  // el remito no le corresponde) y la pantalla pregunta lo mismo, así que botón
  // visible y backend dicen una sola cosa.
  const localActual = Number(contexto?.localId || me?.localId || 0);
  const participa =
    esAdmin ||
    (localActual > 0 &&
      (Number(item?.origen?.id) === localActual || Number(item?.destino?.id) === localActual));
  const puedeCancelar =
    item?.estado === "Enviada" &&
    participa &&
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
  // Agregar y quitar una línea de recepción
  //
  // ── EL SERVIDOR ES EL AUTORITATIVO, Y POR ESO SE RECARGA ──────────────────
  //
  // Después de agregar o de quitar NO se toca `editItems` a mano: se vuelve a
  // pedir `/api/transferencias/detalle` y se reconstruye todo desde la respuesta
  // real, con el mismo `cargar()` de siempre.
  //
  // Inventar la línea en el estado local y confiar en que coincida con lo que
  // quedó guardado es exactamente la clase de suposición que después aparece
  // como una diferencia que nadie sabe explicar: el servidor le pone el id, la
  // marca de agregada, el autor, la fecha y el costo, y cualquiera de esos cinco
  // puede salir distinto de lo que la pantalla imaginó.
  //
  // Y `cargar()` deja `dirty` en false, que también es correcto: lo que había sin
  // guardar se pierde al recargar, y el aviso de la card lo dice antes.
  // ===============================
  const agregarLinea = async (cuerpo) => {
    const res = await fetch("/api/transferencias/linea-recepcion", {
      method: "POST",
      body: JSON.stringify(cuerpo),
    });
    const json = await res.json();
    // `yaExistia` NO recarga ni cierra: el modal muestra el mensaje y el
    // operador corrige la cantidad en la línea que ya está.
    //
    // Y la recarga PRESERVA la edición pendiente. El caso que esto arregla es el
    // más común de todos: alguien escribió 15 sobre 10, no guardó, y agrega el
    // producto que apareció al abrir los bultos. Sin preservar, el 15 volvía a 10
    // y el operador perdía su trabajo por haber usado otra función de la misma
    // pantalla.
    if (json?.ok && !json.yaExistia) await cargar({ preservarEdicion: true });
    return json;
  };

  const quitarLinea = async (detalleId) => {
    try {
      setQuitandoId(detalleId);
      const res = await fetch("/api/transferencias/linea-recepcion", {
        method: "DELETE",
        body: JSON.stringify(cuerpoQuitarLinea({ transferenciaId: item.id, detalleId })),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      // Mismo motivo que al agregar. La línea borrada desaparece sola —no viene
      // en la respuesta— y las ediciones pendientes de las OTRAS sobreviven.
      await cargar({ preservarEdicion: true });
    } catch (err) {
      alert("No se pudo quitar la línea: " + err.message);
    } finally {
      setQuitandoId(null);
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
              dirty={dirty}
              puedeCancelar={puedeCancelar}
              panelCancelarAbierto={panelCancelar}
              abrirPanelCancelar={() => setPanelCancelar((v) => !v)}
              panelCancelar={
                panelCancelar ? (
                  <PanelCancelarTransferencia
                    id={id}
                    onCerrar={() => setPanelCancelar(false)}
                    onCancelada={async () => {
                      setPanelCancelar(false);
                      await cargar();
                    }}
                  />
                ) : null
              }
            />

            {/* 1 · Información general */}
            <TransferenciaHeader item={item} />

            {/* 2 · Productos transferidos */}
            {/* El botón "+ Agregar producto recibido" y la acción de quitar solo
                existen si esta persona puede recibir. No se le pasa un booleano
                a la tabla para que ella decida: se le pasa —o no— el handler.
                Sin handler no hay nada que dibujar, y así la regla vive en un
                solo lugar. En "Recibida" y en "Cancelada", `puedeRecibir` ya es
                falso. */}
            <TablaDetalleTransferencia
              item={item}
              editItems={editItems}
              setEditItems={setEditItemsDirty}
              inputsHabilitados={inputsHabilitados}
              onAgregarProducto={puedeRecibir ? () => setAgregarAbierto(true) : null}
              onQuitarLinea={puedeRecibir ? quitarLinea : null}
              quitandoId={quitandoId}
            />

            {puedeRecibir && (
              <AgregarProductoRecibido
                abierto={agregarAbierto}
                transferenciaId={item.id}
                onCerrar={() => setAgregarAbierto(false)}
                onAgregar={agregarLinea}
              />
            )}

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
