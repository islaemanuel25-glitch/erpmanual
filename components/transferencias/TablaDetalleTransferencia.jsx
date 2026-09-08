"use client";

// Sección "Productos transferidos" del detalle.
//
// Calca el bloque de Ítems de components/reportes-ventas/VentaDetalleAdmin.jsx:
// `section space-y-2` con SectionHead + subtítulo "N líneas", cards en
// `md:hidden` y tabla en `hidden md:block`, celdas `px-2.5 py-3` y filas
// `align-middle sunmi-row-hover transition-colors`.
//
// Cambios respecto de la versión anterior: el breakpoint pasó de `lg` a `md`
// (el de Ventas), se quitaron los `mx-1` y el borde `rounded-2xl` que envolvía
// la tabla, y las columnas ahora dependen del ESTADO — una transferencia
// "Enviada" no tiene recepción, así que mostrar Recibida / Diferencia /
// Devuelto / Motivo vacías solo agrega ruido.
//
// La columna "Devuelto a origen" sigue siendo INFORMATIVA y de solo lectura:
// refleja lo que la recepción registró según `(enviada − recibida) × factor`,
// calculado por el servidor con el mismo helper que usa confirmar-recepcion.
// Esta pantalla no mueve stock. La lógica de edición, los motivos y la
// paginación quedaron intactos.

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";
import {
  SectionHead,
  BadgePresentacion,
  BadgeAgregado,
  fmtCantidad,
  fmtDiferencia,
  fmtMoneda,
  cantidadOGuion,
} from "./detallePresentacion";
import {
  ESTADO_LINEA,
  estadoDeLinea,
  motivoSigueSiendoValido,
  motivosParaDiferencia,
  previsualizarIngresoFisico,
  sePuedeQuitarLinea,
} from "@/lib/transferencias/recepcionUI";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// ── LOS MOTIVOS YA NO SON UNA LISTA FIJA ───────────────────────────────────
//
// Estaban acá, con tres opciones —Faltante, Producto dañado, Otro— porque
// recibir de más no se podía. Ahora se piden por línea a `motivosParaDiferencia`,
// que los elige según el SIGNO de la diferencia: ofrecer "Faltante" para
// explicar que llegaron 5 de más es pedirle a alguien que clasifique un sobrante
// como una falta, y ese dato después se lee en un reporte.
//
// La lista vive en `lib/transferencias/recepcionUI.js` y no acá porque la card
// del teléfono y la fila del escritorio tienen que ofrecer lo mismo.

export default function TablaDetalleTransferencia({
  item,
  editItems,
  setEditItems,
  inputsHabilitados,
  /** Abre el selector de producto. Sin handler, el botón no se dibuja. */
  onAgregarProducto = null,
  /** Quita una línea agregada en recepción. Recibe el detalleId. */
  onQuitarLinea = null,
  /** Qué línea se está borrando ahora mismo, para deshabilitar su botón. */
  quitandoId = null,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const v = Number(sessionStorage.getItem("trans-detalle-pageSize"));
      return [25, 50, 100].includes(v) ? v : 25;
    } catch { return 25; }
  });

  if (!item) return null;

  const allItems = item.items;
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const pagedItems = allItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  // Los índices de editItems siguen a allItems: se conserva el offset global.
  const offset = (safePage - 1) * pageSize;

  // ── Qué columnas tienen sentido en este estado ─────────────────────────────
  //
  // Enviada    → todavía nadie recibió: solo lo despachado.
  // Recibiendo → hay carga de recepción en curso: aparecen los controles.
  // Recibida   → recepción cerrada: se suma "Devuelto al origen".
  // Cancelada  → histórico, sin controles operativos.
  const estado = item.estado;
  const esCancelada = estado === "Cancelada";
  const hayRecepcion = allItems.some((d) => d.cantidadRecibida != null);

  const verRecibida = inputsHabilitados || hayRecepcion;
  const verDiferencia = verRecibida;
  const verDevuelto = allItems.some((d) => d.devolucionOrigen != null);
  // Motivo y detalle: editables mientras se recibe; si no, solo si hay algo
  // cargado que mostrar. Una columna entera de guiones no aporta.
  //
  // Y desde el 2026-09-08 la columna tampoco aparece si NINGUNA línea puede pedir
  // motivo. Pasa de verdad: una transferencia cuyas líneas son todas agregadas en
  // recepción no tiene a quién pedirle uno —su procedencia ya está registrada— y
  // la columna quedaría entera de guiones.
  const hayLineasDelRemito = allItems.some((d) => !d.agregadoEnRecepcion);
  const verMotivo =
    !esCancelada &&
    ((inputsHabilitados && hayLineasDelRemito) || allItems.some((d) => d.motivoPrincipal));
  const verDetalle =
    !esCancelada &&
    ((inputsHabilitados && hayLineasDelRemito) || allItems.some((d) => d.motivoDetalle));

  const filasVisibles = pagedItems.map((d, localIdx) => {
    const idx = offset + localIdx;
    const enviada = num(d.cantidadEnviada);
    const edit = editItems[idx];
    // Sin recepción cargada y sin edición habilitada, no hay "recibido" que
    // mostrar: null se distingue de 0.
    const recibidoCrudo = inputsHabilitados
      ? (edit?.recibido ?? enviada)
      : d.cantidadRecibida;
    const recibido = recibidoCrudo == null ? null : num(recibidoCrudo);
    const diff = recibido == null ? null : recibido - enviada;
    // `estadoLinea` y no `estado`: el `estado` de arriba es el de la
    // TRANSFERENCIA. Con el mismo nombre uno sombrea al otro adentro de este
    // callback.
    const estadoLinea = estadoDeLinea({ enviada, recibida: recibidoCrudo });
    // El tono de la FILA. El excedente no usa el rojo del faltante: llegar de más
    // no es un error de validación, es una diferencia real que hay que explicar.
    let tono = "";
    if (estadoLinea === ESTADO_LINEA.EXACTO) tono = "sunmi-state-success";
    else if (estadoLinea === ESTADO_LINEA.FALTANTE) tono = "sunmi-state-danger-soft";
    else if (estadoLinea === ESTADO_LINEA.EXCEDENTE) tono = "sunmi-state-warning-soft";
    // Cuántas unidades físicas representa lo recibido, cuando la línea va en
    // BULTO y el factor lo hace distinto del número escrito. Informativo.
    const fisico = previsualizarIngresoFisico({
      cantidad: recibido,
      unidad: d.unidadEnviada,
      factorPack: d.factorPack,
    });
    const sePuedeQuitar = sePuedeQuitarLinea({ linea: d, puedeRecibir: inputsHabilitados });
    // Qué motivos ofrece ESTA línea. Lista vacía = no se le pide ninguno, y hay
    // dos razones: no hay diferencia, o la línea se agregó en recepción y su
    // procedencia ya está registrada con autor y fecha. La decisión no se toma
    // acá: sale de `exigeMotivo`, la misma que aplica el servidor.
    const motivos = motivosParaDiferencia({
      enviada,
      recibida: edit?.recibido,
      agregadoEnRecepcion: d.agregadoEnRecepcion,
    });
    return {
      d, idx, edit, enviada, recibido, diff, estadoLinea, tono, fisico, sePuedeQuitar, motivos,
    };
  });

  const cambiar = (idx, campo, valor, extra) => {
    const copia = [...editItems];
    copia[idx] = { ...copia[idx], [campo]: valor, ...(extra || {}) };
    setEditItems(copia);
  };

  // ── LO QUE ESCRIBE EL OPERADOR NO SE TOCA ─────────────────────────────────
  //
  // `valor` entra y sale igual. NO se topea contra lo enviado, no se redondea y
  // no se convierte: recibir más de lo que dice el remito es un caso real y el
  // backend lo acepta desde el 2026-09-08. Recortarlo acá borraría justamente la
  // evidencia del desvío.
  const onRecibidoChange = (idx, enviada, valor) => {
    // Dos limpiezas del MOTIVO, y la segunda es nueva:
    //
    //   · igualar lo enviado lo limpia, porque deja de haber diferencia que
    //     explicar (esto ya estaba);
    //   · cambiar el SIGNO también. Alguien que cargó 8 sobre 10 y eligió
    //     "Faltante" y después corrige a 15 quedaría con un motivo que dice lo
    //     contrario de lo que pasó, y el desplegable ya ni siquiera lo ofrece.
    const motivoActual = editItems[idx]?.motivoPrincipal || "";
    const sigueValido = motivoSigueSiendoValido({
      enviada,
      recibida: valor,
      motivoPrincipal: motivoActual,
      agregadoEnRecepcion: editItems[idx]?.agregadoEnRecepcion,
    });
    const limpiar = sigueValido ? null : { motivoPrincipal: "", motivoDetalle: "" };
    cambiar(idx, "recibido", valor, limpiar);
  };

  const onMotivoChange = (idx, valor) => {
    cambiar(idx, "motivoPrincipal", valor, valor !== "Otro" ? { motivoDetalle: "" } : null);
  };

  // El color del NÚMERO, con la misma separación que el tono de la fila.
  const claseDiff = (estadoLinea) => {
    if (estadoLinea === ESTADO_LINEA.EXACTO) return "sunmi-text-success";
    if (estadoLinea === ESTADO_LINEA.FALTANTE) return "sunmi-text-danger";
    if (estadoLinea === ESTADO_LINEA.EXCEDENTE) return "sunmi-text-warning";
    return "sunmi-text-muted";
  };

  const headers = [
    "Producto",
    "Código",
    "Presentación",
    { label: "Enviada", className: "text-right" },
    ...(verRecibida ? [{ label: "Recibida", className: "text-right" }] : []),
    ...(verDiferencia ? [{ label: "Diferencia", className: "text-right" }] : []),
    ...(verDevuelto ? [{ label: "Devuelto al origen", className: "text-right" }] : []),
    ...(verMotivo ? ["Motivo"] : []),
    ...(verDetalle ? ["Detalle"] : []),
    { label: "Costo", className: "text-right" },
    { label: "Subtotal", className: "text-right" },
  ];

  return (
    <section className="space-y-2">
      {/* El botón vive en la cabecera de la sección OPERATIVA de productos, que
          es donde el operador está mirando cuando abre los bultos y encuentra
          algo que el remito no menciona.

          Sin `onAgregarProducto` no se dibuja, y la página solo lo pasa cuando
          `puedeRecibir` es verdadero. O sea que en "Recibida", en "Cancelada" y
          para quien no es el destino no aparece — y no porque acá se repita la
          regla, sino porque la pantalla no entrega el handler. */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <SectionHead
          title="Productos transferidos"
          subtitle={`${allItems.length} línea${allItems.length === 1 ? "" : "s"}`}
        />
        {onAgregarProducto && (
          <SunmiButton color="amber" onClick={onAgregarProducto} className="shrink-0">
            + Agregar producto recibido
          </SunmiButton>
        )}
      </div>
      <SunmiCard>
        {allItems.length === 0 && (
          <div className="text-center py-8 sunmi-text-muted text-sm">Sin productos</div>
        )}

        {/* ══════════ Móvil: una card por línea ══════════ */}
        {allItems.length > 0 && (
          <div className="md:hidden space-y-2">
            {filasVisibles.map(({ d, idx, edit, enviada, recibido, diff, estadoLinea, fisico, sePuedeQuitar, motivos }) => (
              <div key={d.id} className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-semibold sunmi-text-strong text-[14px] leading-tight break-words">
                    {d.nombre}
                  </div>
                  <div className="font-mono font-bold text-[15px] sunmi-text-strong whitespace-nowrap tabular-nums">
                    {fmtMoneda(d.subtotal)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <BadgePresentacion d={d} />
                  <BadgeAgregado d={d} />
                  <span className="text-[11px] sunmi-text-muted">
                    {d.codigoBarra || "Sin código"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] sunmi-text-muted">
                  <span>
                    Enviada{" "}
                    <span className="tabular-nums sunmi-text-link">{fmtCantidad(enviada)}</span>
                  </span>
                  {verRecibida && !inputsHabilitados && (
                    <span>
                      Recibida{" "}
                      <span className="tabular-nums sunmi-text-strong">
                        {cantidadOGuion(recibido)}
                      </span>
                    </span>
                  )}
                  {verDiferencia && (
                    <span>
                      Diferencia{" "}
                      <span className={`tabular-nums font-semibold ${claseDiff(estadoLinea)}`}>
                        {fmtDiferencia(diff)}
                      </span>
                    </span>
                  )}
                  {verDevuelto && (
                    <span>
                      Devuelto{" "}
                      <span className="tabular-nums sunmi-text-strong">
                        {cantidadOGuion(d.devolucionOrigen)}
                      </span>
                    </span>
                  )}
                  <span>
                    Costo <span className="tabular-nums">{fmtMoneda(d.precioCosto)}</span>
                  </span>
                </div>

                {/* Input de recepción: se mantiene utilizable en móvil */}
                {inputsHabilitados && (
                  <div>
                    <div className="text-[11px] sunmi-text-muted mb-1">Recibida</div>
                    <SunmiInput
                      type="number"
                      value={edit?.recibido ?? ""}
                      onChange={(e) => onRecibidoChange(idx, enviada, e.target.value)}
                    />
                  </div>
                )}

                {/* Cuántas unidades entran de verdad. En una línea en BULTO el
                    número escrito no es el que mueve stock, y esa distancia es
                    justo la que hay que ver antes de confirmar. */}
                {fisico != null && (
                  <div className="text-sm2 sunmi-text-muted">
                    Ingreso físico: {fmtCantidad(fisico)} unidades
                  </div>
                )}

                {/* El selector aparece si esta línea DEBE explicar su diferencia.
                    Una agregada en recepción no: el badge de arriba ya dice de
                    dónde salió, con autor y fecha detrás. Pedirle además un
                    motivo sería pedir dos veces la misma explicación. */}
                {inputsHabilitados && motivos.length > 0 && (
                  <div className="space-y-2">
                    <div>
                      <div className="text-[11px] sunmi-text-muted mb-1">Motivo</div>
                      <SunmiSelectAdv
                        value={edit?.motivoPrincipal || ""}
                        onChange={(val) => onMotivoChange(idx, val)}
                      >
                        <option value="">Seleccionar…</option>
                        {motivos.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </SunmiSelectAdv>
                    </div>
                    {edit?.motivoPrincipal === "Otro" && (
                      <SunmiInput
                        type="text"
                        value={edit?.motivoDetalle || ""}
                        onChange={(e) => cambiar(idx, "motivoDetalle", e.target.value)}
                        placeholder="Detalle..."
                      />
                    )}
                  </div>
                )}

                {!inputsHabilitados && (d.motivoPrincipal || d.motivoDetalle) && (
                  <div className="text-[12px] sunmi-text-muted">
                    Motivo: {d.motivoPrincipal || "—"}
                    {d.motivoDetalle ? ` · ${d.motivoDetalle}` : ""}
                  </div>
                )}

                {/* Quitar. SOLO en una línea agregada durante la recepción: una
                    del remito no se borra nunca desde acá, y por eso el botón ni
                    siquiera se dibuja en vez de aparecer y fallar. */}
                {sePuedeQuitar && onQuitarLinea && (
                  <SunmiButton
                    color="red"
                    onClick={() => onQuitarLinea(d.id)}
                    disabled={quitandoId === d.id}
                  >
                    {quitandoId === d.id ? "Quitando…" : "Quitar producto agregado"}
                  </SunmiButton>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══════════ Desktop: tabla a todo el ancho ══════════ */}
        {allItems.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <SunmiTable headers={headers}>
              {filasVisibles.map(({ d, idx, edit, enviada, recibido, diff, estadoLinea, tono, fisico, sePuedeQuitar, motivos }) => (
                <tr
                  key={d.id}
                  className={`align-middle sunmi-row-hover transition-colors ${tono}`}
                >
                  <td className="px-2.5 py-3">
                    <div className="font-semibold sunmi-text-strong text-[13px] leading-snug">
                      {d.nombre}
                    </div>
                    <BadgeAgregado d={d} />
                    {/* Quitar va ACÁ, en la celda del producto, y no en una
                        columna propia. Dos motivos: una columna que aparece y
                        desaparece según haya líneas agregadas mueve la tabla
                        entera, y la acción queda al lado de lo que borra.
                        SOLO en una línea agregada: una del remito no se borra
                        nunca desde acá, y por eso el botón no existe en vez de
                        aparecer apagado. */}
                    {sePuedeQuitar && onQuitarLinea && (
                      <SunmiButton
                        color="red"
                        onClick={() => onQuitarLinea(d.id)}
                        disabled={quitandoId === d.id}
                      >
                        {quitandoId === d.id ? "Quitando…" : "Quitar"}
                      </SunmiButton>
                    )}
                  </td>
                  <td className="px-2.5 py-3 font-mono text-[12px] sunmi-text-muted whitespace-nowrap">
                    {d.codigoBarra || "—"}
                  </td>
                  <td className="px-2.5 py-3">
                    <BadgePresentacion d={d} />
                  </td>

                  <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {fmtCantidad(enviada)}
                  </td>

                  {verRecibida && (
                    <td className="px-2.5 py-3 text-right">
                      {inputsHabilitados ? (
                        <SunmiInput
                          type="number"
                          value={edit?.recibido ?? ""}
                          onChange={(e) => onRecibidoChange(idx, enviada, e.target.value)}
                        />
                      ) : (
                        <span className="font-mono tabular-nums">{cantidadOGuion(recibido)}</span>
                      )}
                      {/* Mismo dato que en la card del teléfono: el número escrito
                          no es el que mueve stock cuando la línea va en BULTO. */}
                      {fisico != null && (
                        <div className="text-xs2 sunmi-text-muted leading-tight">
                          {fmtCantidad(fisico)} unidades
                        </div>
                      )}
                    </td>
                  )}

                  {verDiferencia && (
                    <td
                      className={`px-2.5 py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${claseDiff(estadoLinea)}`}
                    >
                      {fmtDiferencia(diff)}
                    </td>
                  )}

                  {verDevuelto && (
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {cantidadOGuion(d.devolucionOrigen)}
                    </td>
                  )}

                  {verMotivo && (
                    <td className="px-2.5 py-3">
                      {/* Misma condición que en la card del teléfono, y por el
                          mismo motivo: una línea agregada no explica dos veces. */}
                      {inputsHabilitados ? (
                        motivos.length > 0 ? (
                          <SunmiSelectAdv
                            value={edit?.motivoPrincipal || ""}
                            onChange={(val) => onMotivoChange(idx, val)}
                          >
                            <option value="">Seleccionar…</option>
                            {motivos.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </SunmiSelectAdv>
                        ) : (
                          "—"
                        )
                      ) : (
                        d.motivoPrincipal || "—"
                      )}
                    </td>
                  )}

                  {verDetalle && (
                    <td className="px-2.5 py-3">
                      {inputsHabilitados &&
                      edit?.motivoPrincipal === "Otro" &&
                      motivos.length > 0 ? (
                        <SunmiInput
                          type="text"
                          value={edit?.motivoDetalle || ""}
                          onChange={(e) => cambiar(idx, "motivoDetalle", e.target.value)}
                          placeholder="Detalle..."
                        />
                      ) : (
                        d.motivoDetalle || "—"
                      )}
                    </td>
                  )}

                  <td className="px-2.5 py-3 text-right font-mono tabular-nums sunmi-text-muted whitespace-nowrap">
                    {fmtMoneda(d.precioCosto)}
                  </td>

                  <td className="px-2.5 py-3 text-right font-mono font-bold tabular-nums sunmi-text-strong whitespace-nowrap">
                    {fmtMoneda(d.subtotal)}
                  </td>

                </tr>
              ))}
            </SunmiTable>
          </div>
        )}

        {/* NO va acá un total de devolución al origen.
            `resumen.devolucionOrigenTotal` suma las devoluciones de todas las
            líneas, y esas líneas pueden estar en unidades, bultos, kilos o
            piezas: el número resultante no es ninguna de esas magnitudes y
            engaña más de lo que informa.
            La cantidad exacta vive donde SÍ se conoce la presentación: en la
            columna "Devuelto al origen" de cada producto. Que hubo devolución
            ya lo dicen el badge "Con diferencias" del encabezado y el tile
            "Líneas devueltas al origen" de la sección Totales. */}

        {/* Paginación — mismo lugar que en el listado: dentro de la card,
            separada por una línea. */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t sunmi-divider">
            <div className="flex items-center gap-2">
              <SunmiButton color="slate" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </SunmiButton>
              <span className="sunmi-text-muted text-[11px]">
                Página {safePage} de {totalPages} ({allItems.length} líneas)
              </span>
              <SunmiButton color="slate" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Siguiente
              </SunmiButton>
            </div>
            <SunmiPageSizer
              value={pageSize}
              options={[25, 50, 100]}
              onChange={(size) => {
                setPageSize(size);
                setPage(1);
                try { sessionStorage.setItem("trans-detalle-pageSize", String(size)); } catch {}
              }}
            />
          </div>
        )}
      </SunmiCard>
    </section>
  );
}
