"use client";

// LA GRILLA DE CONCILIACIÓN.
//
// ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
//
// Antes cada producto era una ficha de 350 px en desktop y 605 px en móvil: dos
// filas y media por pantalla, con el botón principal abajo de todo. Revisar 190
// productos así son 190 scrolls. Esto es una herramienta de operación masiva, no
// un formulario de alta.
//
// Ahora cada producto es UNA LÍNEA con todo lo que hace falta para decidir sin
// abrirla: qué dice el archivo, contra qué producto quedó, cómo se comparan las
// presentaciones, cuánto costaba, cuánto costaría, cuánto varía, en qué estado
// queda y qué se recomienda. El detalle se expande DEBAJO de la propia fila y
// solo cuando hace falta.
//
// ── LO QUE SE DECIDE SIN ABRIR NADA ─────────────────────────────────────────
//
// Cuando hay una única interpretación coherente, la fila trae el botón
// Confirmar habilitado y resuelve de un clic. Cuando hay más de una, el botón
// dice "Ver opciones" y obliga a mirar. Cuando ninguna cierra, no hay confirmar:
// hay que cambiar el producto.
//
// No calcula nada propio: `analizarFila` es el mismo módulo que valida el
// servidor.

import { useState } from "react";
import { AlertTriangle, Check, Link2, MoreVertical, Lock } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import DetalleConciliacion from "@/components/proveedores/listas/DetalleConciliacion";
import { money, presentarEstado } from "@/lib/proveedores/listas/presentacion";
import { basePrecioDeFila, analizarFila } from "@/lib/proveedores/listas/confirmarPresentacion";
import { TONO_ESTADO_VARIACION, TEXTO_ESTADO_VARIACION, esAlertaFuerte } from "@/lib/proveedores/listas/rangoAumento";

const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`);

/**
 * El código que el proveedor le asigna al producto, guardado en
 * `ProductoCodigoProveedor.codigoInterno`.
 *
 * Es lo que permite comparar de un vistazo contra el código que vino en el
 * archivo. Cuando el producto no lo tiene cargado se dice así, con todas las
 * letras: NO se reemplaza por el sku ni por el id, que son otra cosa y darían a
 * entender que hay un código de Arcor donde no lo hay.
 */
const codigoArcorGuardado = (erp) => {
  if (!erp) return null;
  return erp.codigosArcor?.length ? erp.codigosArcor.join(" / ") : null;
};
const fechaCorta = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};

/**
 * Todo lo que la fila necesita mostrar, resuelto una sola vez.
 *
 * Las filas que el motor ya resolvió —listas, sin cambios, aplicadas— muestran
 * lo que el motor calculó. Las que quedaron por revisar se analizan acá con el
 * módulo puro, que es lo que permite recomendar sin abrir el detalle.
 */
function resumirFila(fila, importacion) {
  const erp = fila.erp;
  const porRevisar = fila.estado === "FACTOR_DUDOSO" && erp && !fila.aplicada;

  if (!porRevisar) {
    return {
      porRevisar: false,
      costoPropuesto: fila.costoNuevo ?? fila.costoMaestroPropuesto ?? null,
      variacionPct: fila.diferenciaPct === null || fila.diferenciaPct === undefined ? null : Number(fila.diferenciaPct),
      recomendacion: null,
      resultado: null,
      multiplicador: fila.multiplicadorConfirmado ?? null,
      presentacion: null,
      estadoVariacion: null,
    };
  }

  const base = {
    unidad_medida: erp.unidadMedida,
    factor_pack: erp.factorPack,
    modoCompraProveedor: erp.modoCompraProveedor ?? null,
    precio_costo: erp.costoActual,
  };
  const a = analizarFila({
    fila,
    base,
    recargoPct: fila.recargoPct,
    rango: {
      minPct: importacion?.aumentoEsperadoMinPct ?? 10,
      maxPct: importacion?.aumentoEsperadoMaxPct ?? 20,
    },
  });
  const elegida = a.evaluadas.find((h) => h.clave === a.recomendada) ?? null;

  return {
    porRevisar: true,
    costoPropuesto: elegida?.costoNuevo ?? null,
    variacionPct: elegida?.variacionPct ?? null,
    estadoVariacion: elegida?.estado ?? null,
    multiplicador: elegida?.multiplicador ?? null,
    resultado: a.resultado,
    presentacion: a.presentacion,
    cantidadHipotesis: a.evaluadas.length,
    recomendacion:
      a.resultado === "RECOMENDADA"
        ? {
            titulo: elegida?.multiplicador === 1 ? "Sin multiplicar" : `Precio unitario × ${elegida?.multiplicador}`,
            detalle: elegida?.origenCantidad ?? `U.M. = ${fila.unidadProveedor}`,
          }
        : a.resultado === "AMBIGUA"
          ? { titulo: `Ambiguo (${a.evaluadas.filter((h) => !h.absurda).length} opciones)`, detalle: "Ver detalle" }
          : { titulo: "Sin opción válida", detalle: "Revisar el producto" },
  };
}

/** La comparación de presentaciones, en una celda: "30u / 30u ✓". */
function Presentacion({ resumen, fila }) {
  if (!resumen.presentacion) {
    return <span className="sunmi-text-muted">{fila.erp?.presentacion ?? "—"}</span>;
  }
  const { cantidadDescripcion, factorPackErp, compatibilidad } = resumen.presentacion;
  const tono =
    compatibilidad === "COINCIDEN" ? "sunmi-text-success" : compatibilidad === "DIFIEREN" ? "sunmi-text-warning" : "sunmi-text-muted";
  return (
    <span className="tabular-nums whitespace-nowrap">
      {cantidadDescripcion ?? "—"} <span className="sunmi-text-muted">/</span> {factorPackErp ?? "—"}{" "}
      <span className={tono} aria-hidden="true">
        {compatibilidad === "COINCIDEN" ? "✓" : compatibilidad === "DIFIEREN" ? "!" : "·"}
      </span>
    </span>
  );
}

function ChipEstado({ fila, resumen }) {
  if (fila.aplicada) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded sunmi-border border sunmi-text-success">Aplicada</span>;
  }
  if (resumen.estadoVariacion) {
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded sunmi-border border ${TONO_ESTADO_VARIACION[resumen.estadoVariacion]}`}>
        {TEXTO_ESTADO_VARIACION[resumen.estadoVariacion]}
      </span>
    );
  }
  if (resumen.resultado === "REVISAR") {
    return <span className="text-[10px] px-1.5 py-0.5 rounded sunmi-border border sunmi-text-danger">Sin interpretación</span>;
  }
  const p = presentarEstado(fila.estado);
  return <span className={`text-[10px] px-1.5 py-0.5 rounded sunmi-border border ${p.tono}`}>{p.etiqueta}</span>;
}

/** Las acciones de la fila. La principal siempre a la vista, nunca abajo. */
function Acciones({ fila, resumen, abierto, onAbrir, onVincular, compacto }) {
  const puedeConfirmarDirecto = resumen.porRevisar && resumen.resultado === "RECOMENDADA";
  const riesgoso = resumen.estadoVariacion ? esAlertaFuerte(resumen.estadoVariacion) : false;
  const clase = compacto ? "py-1.5 px-2.5 !text-[11px]" : "py-1 px-2 !text-[10.5px]";

  return (
    <div className={`flex items-center gap-1 ${compacto ? "" : "justify-end"}`}>
      {resumen.porRevisar && resumen.resultado !== "REVISAR" && (
        <SunmiButton
          color="cyan"
          onClick={onAbrir}
          disabled={riesgoso && !abierto ? false : false}
          className={`${clase} inline-flex items-center gap-1`}
        >
          {riesgoso && <Lock size={11} aria-hidden="true" />}
          {puedeConfirmarDirecto && !riesgoso ? "Confirmar" : "Ver opciones"}
        </SunmiButton>
      )}
      <SunmiButton color="slate" onClick={onVincular} className={clase}>
        Cambiar
      </SunmiButton>
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver detalle de la fila ${fila.filaExcel}`}
        aria-expanded={abierto}
        className="sunmi-text-muted p-1"
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function GrillaConciliacion({
  filas,
  importacion,
  seleccionDe,
  onMarcar,
  onVincular,
  onConfirmada,
  editable,
}) {
  const [abierta, setAbierta] = useState(null);
  const alternar = (id) => setAbierta((x) => (x === id ? null : id));

  const filasConResumen = filas.map((f) => ({ f, r: resumirFila(f, importacion) }));

  return (
    <div className="space-y-1">
      {/* ── DESKTOP: tabla densa ──────────────────────────────────────────
          Una línea por producto. El scroll horizontal vive en este contenedor
          y nunca en el body de la página. */}
      <div className="hidden lg:block overflow-x-auto sunmi-border border rounded-lg">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sunmi-surface-soft">
            <tr className="sunmi-text-muted text-left">
              <th className="font-medium px-1.5 py-1.5 w-8" />
              <th className="font-medium px-1.5 py-1.5 w-12">Fila</th>
              <th className="font-medium px-1.5 py-1.5">Producto archivo</th>
              <th className="font-medium px-1.5 py-1.5">Código archivo</th>
              <th className="font-medium px-1.5 py-1.5">Producto ERP</th>
              <th className="font-medium px-1.5 py-1.5">Código Arcor guardado</th>
              <th className="font-medium px-1.5 py-1.5">U.M.</th>
              <th className="font-medium px-1.5 py-1.5">Present.</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Costo actual</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Costo propuesto</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Var.</th>
              <th className="font-medium px-1.5 py-1.5">Estado</th>
              <th className="font-medium px-1.5 py-1.5">Recomendación</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filasConResumen.map(({ f, r }) => {
              const sel = seleccionDe?.(f) ?? { marcada: false, habilitada: false };
              const abierto = abierta === f.id;
              const tono = r.estadoVariacion ? TONO_ESTADO_VARIACION[r.estadoVariacion] : "sunmi-text-muted";
              return (
                <>
                  <tr
                    key={f.id}
                    data-fila={f.filaExcel}
                    className={`border-t sunmi-border align-middle ${abierto ? "sunmi-surface-soft" : ""}`}
                  >
                    <td className="px-1.5 py-1.5">
                      <input
                        type="checkbox"
                        checked={sel.marcada}
                        disabled={!sel.habilitada || !editable}
                        onChange={(e) => onMarcar?.(f, e.target.checked)}
                        aria-label={
                          sel.habilitada ? `Seleccionar la fila ${f.filaExcel}` : `La fila ${f.filaExcel} no se puede aplicar`
                        }
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    <td className="px-1.5 py-1.5 tabular-nums sunmi-text-muted">{f.filaExcel}</td>
                    <td className="px-1.5 py-1.5 max-w-[15rem]">
                      <div className="truncate sunmi-text-strong font-medium" title={f.descripcionProveedor}>
                        {f.descripcionProveedor}
                      </div>
                    </td>
                    <td className="px-1.5 py-1.5 tabular-nums sunmi-text-muted">{f.codigoCrudo ?? "—"}</td>
                    <td className="px-1.5 py-1.5 max-w-[14rem]">
                      {f.erp ? (
                        <div className="truncate sunmi-text-strong" title={f.erp.nombre}>{f.erp.nombre}</div>
                      ) : (
                        <span className="sunmi-text-warning">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5 tabular-nums">
                      {codigoArcorGuardado(f.erp) ? (
                        <span className="sunmi-text-strong">{codigoArcorGuardado(f.erp)}</span>
                      ) : (
                        <span className="text-[10px] sunmi-text-warning">Sin código Arcor</span>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5">{f.unidadProveedor}</td>
                    <td className="px-1.5 py-1.5"><Presentacion resumen={r} fila={f} /></td>
                    <td className="px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                      <div className="sunmi-text-strong">{money(f.erp?.costoActual)}</div>
                      {fechaCorta(f.erp?.actualizadoEn) && (
                        <div className="text-[9.5px] sunmi-text-muted">act. {fechaCorta(f.erp.actualizadoEn)}</div>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                      <div className="font-semibold sunmi-text-strong">{money(r.costoPropuesto)}</div>
                      {r.multiplicador ? (
                        <div className="text-[9.5px] sunmi-text-muted">× {r.multiplicador}</div>
                      ) : null}
                    </td>
                    <td className={`px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap ${tono}`}>
                      {pct(r.variacionPct)}
                    </td>
                    <td className="px-1.5 py-1.5"><ChipEstado fila={f} resumen={r} /></td>
                    <td className="px-1.5 py-1.5 max-w-[11rem]">
                      {r.recomendacion ? (
                        <>
                          <div className="truncate sunmi-text-strong">{r.recomendacion.titulo}</div>
                          <div className="text-[9.5px] sunmi-text-muted truncate">{r.recomendacion.detalle}</div>
                        </>
                      ) : (
                        <span className="sunmi-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5">
                      {editable ? (
                        <Acciones
                          fila={f}
                          resumen={r}
                          abierto={abierto}
                          onAbrir={() => alternar(f.id)}
                          onVincular={() => onVincular?.(f)}
                        />
                      ) : (
                        <span className="text-[10px] sunmi-text-muted">solo lectura</span>
                      )}
                    </td>
                  </tr>
                  {abierto && (
                    <tr key={`${f.id}-detalle`} className="sunmi-border border-t">
                      <td colSpan={14} className="p-0">
                        <DetalleConciliacion
                          fila={f}
                          importacion={importacion}
                          onConfirmada={(json) => { setAbierta(null); onConfirmada?.(json); }}
                          onVincularOtro={() => { setAbierta(null); onVincular?.(f); }}
                          onCerrar={() => setAbierta(null)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── MÓVIL: tarjetas compactas, sin scroll horizontal ─────────────── */}
      <div className="lg:hidden space-y-1.5">
        {filasConResumen.map(({ f, r }) => {
          const sel = seleccionDe?.(f) ?? { marcada: false, habilitada: false };
          const abierto = abierta === f.id;
          const tono = r.estadoVariacion ? TONO_ESTADO_VARIACION[r.estadoVariacion] : "sunmi-text-muted";
          return (
            <div key={f.id} data-fila={f.filaExcel} className="sunmi-border border rounded-lg overflow-hidden">
              <div className="p-2 space-y-1.5">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={sel.marcada}
                    disabled={!sel.habilitada || !editable}
                    onChange={(e) => onMarcar?.(f, e.target.checked)}
                    aria-label={
                      sel.habilitada ? `Seleccionar la fila ${f.filaExcel}` : `La fila ${f.filaExcel} no se puede aplicar`
                    }
                    className="h-4 w-4 mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold sunmi-text-strong leading-tight break-words">
                      <span className="sunmi-text-muted tabular-nums">{f.filaExcel}</span>{" "}
                      {f.descripcionProveedor}
                    </div>
                    <div className="text-[10px] sunmi-text-muted tabular-nums truncate">
                      {f.unidadProveedor} · archivo {f.codigoCrudo ?? "—"} · Arcor{" "}
                      {codigoArcorGuardado(f.erp) ?? "sin código"}
                      {f.erp ? ` · ${f.erp.nombre}` : " · sin vincular"}
                    </div>
                  </div>
                  <ChipEstado fila={f} resumen={r} />
                </div>

                <div className="grid grid-cols-3 gap-1 text-[11px] tabular-nums">
                  <div>
                    <div className="text-[9.5px] sunmi-text-muted">Actual</div>
                    <div className="sunmi-text-strong">{money(f.erp?.costoActual)}</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] sunmi-text-muted">Propuesto</div>
                    <div className="font-semibold sunmi-text-strong">{money(r.costoPropuesto)}</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] sunmi-text-muted">Variación</div>
                    <div className={tono}>{pct(r.variacionPct)}</div>
                  </div>
                </div>

                {editable && (
                  <Acciones
                    fila={f}
                    resumen={r}
                    abierto={abierto}
                    onAbrir={() => alternar(f.id)}
                    onVincular={() => onVincular?.(f)}
                    compacto
                  />
                )}
              </div>
              {abierto && (
                <DetalleConciliacion
                  fila={f}
                  importacion={importacion}
                  onConfirmada={(json) => { setAbierta(null); onConfirmada?.(json); }}
                  onVincularOtro={() => { setAbierta(null); onVincular?.(f); }}
                  onCerrar={() => setAbierta(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {filas.length === 0 && (
        <div className="sunmi-border border rounded-lg p-6 text-center text-[12px] sunmi-text-muted">
          No hay filas en esta vista.
        </div>
      )}
    </div>
  );
}
