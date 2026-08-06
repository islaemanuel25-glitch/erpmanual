"use client";

// LA GRILLA DE CONCILIACIÓN.
//
// ── CÓMO SE COMPARA ─────────────────────────────────────────────────────────
//
// La fila principal es el PRODUCTO DEL ERP. Al tocarla se abre debajo UNA fila
// más, la del archivo del proveedor, usando LAS MISMAS COLUMNAS. Así el nombre
// queda arriba del nombre, el código arriba del código y el costo arriba del
// precio: la comparación la hace la tabla y el ojo la lee de corrido.
//
// Debajo de esa fila van las interpretaciones y el cierre de la decisión, que
// es lo único que la tabla no puede mostrar.
//
// ── POR QUÉ SE ABRE TOCANDO LA FILA ─────────────────────────────────────────
//
// Ver el detalle de una fila no es una acción con consecuencias: es mirar. Un
// botón "Ver opciones" en la columna de acciones lo disfrazaba de decisión,
// competía con la única acción que sí decide y obligaba a apuntar a un blanco
// de dos centímetros. Ahora el blanco es la fila entera y el galón indica que
// hay algo abajo. Las acciones quedan para lo que cambia datos.
//
// ── LO QUE SE DECIDE SIN ABRIR NADA ─────────────────────────────────────────
//
// La columna Recomendación adelanta qué propone el motor y el chip de estado
// dice si esa propuesta es sana. Con eso se decide si vale la pena abrir.
//
// No calcula nada propio: `analizarFila` es el mismo módulo que valida el
// servidor.

import { Fragment, useState } from "react";
import { ChevronRight, Info } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import InterpretacionesFila from "@/components/proveedores/listas/InterpretacionesFila";
import { money, presentarEstado } from "@/lib/proveedores/listas/presentacion";
import { LEYENDA_UXBU, analizarFila } from "@/lib/proveedores/listas/confirmarPresentacion";
import { TONO_ESTADO_VARIACION, TEXTO_ESTADO_VARIACION } from "@/lib/proveedores/listas/rangoAumento";

/** El acento del tema, para marcar lo que cuelga de la fila abierta. */
const BARRA_ACENTO = { boxShadow: "inset 3px 0 0 var(--pos-accent)" };

const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`);
const fechaCorta = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};

/**
 * El código que el proveedor le asigna al producto, guardado en
 * `ProductoCodigoProveedor.codigoInterno`. Cuando no lo tiene se dice así: NO se
 * reemplaza por el sku ni por el id, que son otra cosa.
 */
const codigoArcorGuardado = (erp) =>
  erp && erp.codigosArcor?.length ? erp.codigosArcor.join(" / ") : null;

/**
 * Cómo se relacionan el código del archivo y el guardado en el ERP.
 *
 * Puestos uno debajo del otro delatan por qué macheó cada fila: 11905 contra
 * 11905 es exacta; 14429 contra 1014429 es por terminación, que es un fallback
 * tolerante y conviene mirar con más cuidado.
 */
function relacionDeCodigos(codigoArchivo, guardado) {
  const a = String(codigoArchivo ?? "").trim();
  const b = String(guardado ?? "").trim();
  if (!a || !b) return null;
  if (a === b) return { texto: "coincide exacto", tono: "sunmi-text-success" };
  if (b.endsWith(a) || a.endsWith(b)) return { texto: "coincide por terminación", tono: "sunmi-text-warning" };
  return { texto: "no se parecen", tono: "sunmi-text-muted" };
}

/**
 * Todo lo que la fila necesita mostrar, resuelto una sola vez.
 *
 * Las filas que el motor ya resolvió muestran lo que el motor calculó. Las que
 * quedaron por revisar se analizan con el módulo puro, que es lo que permite
 * adelantar la recomendación sin abrir nada.
 */
function resumirFila(fila, importacion) {
  const erp = fila.erp;
  const porRevisar = fila.estado === "FACTOR_DUDOSO" && erp && !fila.aplicada;

  if (!porRevisar) {
    return {
      porRevisar: false,
      costoPropuesto: fila.costoNuevo ?? fila.costoMaestroPropuesto ?? null,
      variacionPct: fila.diferenciaPct === null || fila.diferenciaPct === undefined ? null : Number(fila.diferenciaPct),
      multiplicador: fila.multiplicadorConfirmado ?? null,
      recomendacion: null,
      resultado: null,
      presentacion: null,
      estadoVariacion: null,
    };
  }

  const a = analizarFila({
    fila,
    base: {
      unidad_medida: erp.unidadMedida,
      factor_pack: erp.factorPack,
      modoCompraProveedor: erp.modoCompraProveedor ?? null,
      precio_costo: erp.costoActual,
    },
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
    recomendacion:
      a.resultado === "RECOMENDADA"
        ? {
            titulo: elegida?.multiplicador === 1 ? "Sin multiplicar" : `Precio unitario × ${elegida?.multiplicador}`,
            detalle: elegida?.origenCantidad ?? `U.M. = ${fila.unidadProveedor}`,
          }
        : a.resultado === "AMBIGUA"
          ? { titulo: `Ambiguo (${a.evaluadas.filter((h) => !h.absurda).length} opciones)`, detalle: "Tocá la fila para elegir" }
          : { titulo: "Sin opción válida", detalle: "Revisar el producto" },
  };
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

/** Una celda con su valor y una nota chica debajo. */
function Celda({ children, nota, notaTono, alineado, titulo, estilo }) {
  return (
    <td className={`px-1.5 py-1 ${alineado === "der" ? "text-right" : ""}`} title={titulo} style={estilo}>
      <div className="sunmi-text-strong">{children}</div>
      {nota ? (
        <div className={`text-[9.5px] leading-tight ${notaTono ?? "sunmi-text-muted"}`}>{nota}</div>
      ) : null}
    </td>
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

  const filasConResumen = filas.map((f) => ({
    f,
    r: resumirFila(f, importacion),
    // Solo se abre lo que tiene algo abajo: sin producto vinculado no hay nada
    // que comparar ni que interpretar.
    expandible: f.estado === "FACTOR_DUDOSO" && !!f.erp && !f.aplicada,
  }));

  /** Teclado: la fila se comporta como el botón que ahora es. */
  const teclaAbre = (e, id) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    alternar(id);
  };

  return (
    <div className="space-y-1">
      {/* ── DESKTOP: tabla comparable ─────────────────────────────────────
          Las columnas son las mismas para el ERP y para el archivo. El scroll
          horizontal vive en este contenedor, nunca en el body. */}
      <div className="hidden lg:block overflow-x-auto sunmi-border border rounded-lg">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sunmi-surface-soft">
            <tr className="sunmi-text-muted text-left">
              <th className="font-medium px-1.5 py-1.5 w-8" />
              <th className="font-medium px-1.5 py-1.5 w-16">Origen</th>
              <th className="font-medium px-1.5 py-1.5">Nombre</th>
              <th className="font-medium px-1.5 py-1.5">Código</th>
              <th className="font-medium px-1.5 py-1.5 w-14">U.M.</th>
              <th className="font-medium px-1.5 py-1.5">Presentación</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Costo / Precio</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Costo propuesto</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Var.</th>
              <th className="font-medium px-1.5 py-1.5">Estado</th>
              <th className="font-medium px-1.5 py-1.5">Recomendación</th>
              <th className="font-medium px-1.5 py-1.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filasConResumen.map(({ f, r, expandible }) => {
              const sel = seleccionDe?.(f) ?? null;
              const puedeMarcar = sel?.puede === true && editable;
              const abierto = abierta === f.id;
              const tono = r.estadoVariacion ? TONO_ESTADO_VARIACION[r.estadoVariacion] : "sunmi-text-muted";
              const guardado = codigoArcorGuardado(f.erp);
              const rel = relacionDeCodigos(f.codigoCrudo, guardado);
              const abre = expandible && editable;
              return (
                <Fragment key={f.id}>
                  {/* ── EL PRODUCTO DEL ERP. La fila entera abre. ───────── */}
                  <tr
                    data-fila={f.filaExcel}
                    data-origen="erp"
                    data-expandible={abre ? "si" : "no"}
                    role={abre ? "button" : undefined}
                    tabIndex={abre ? 0 : undefined}
                    aria-expanded={abre ? abierto : undefined}
                    onClick={abre ? () => alternar(f.id) : undefined}
                    onKeyDown={abre ? (e) => teclaAbre(e, f.id) : undefined}
                    className={`border-t sunmi-border align-middle ${abre ? "cursor-pointer" : ""} ${
                      abierto ? "sunmi-surface-soft" : ""
                    }`}
                  >
                    {/* La misma barra de acento que llevan la fila del archivo y
                        las interpretaciones: abierta, la fila y lo que cuelga de
                        ella se leen como un solo bloque. */}
                    <td
                      className="px-1.5 py-1.5"
                      style={abierto ? BARRA_ACENTO : undefined}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {puedeMarcar ? (
                        <input
                          type="checkbox"
                          checked={sel.marcada}
                          onChange={(e) => onMarcar?.(f, e.target.checked)}
                          aria-label={`Seleccionar la fila ${f.filaExcel} para aplicar`}
                          className="h-3.5 w-3.5"
                        />
                      ) : null}
                    </td>
                    <td className="px-1.5 py-1.5">
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold sunmi-text-muted uppercase">
                        {abre && (
                          <ChevronRight
                            size={12}
                            aria-hidden="true"
                            className={`transition-transform ${abierto ? "rotate-90 sunmi-text-accent" : ""}`}
                          />
                        )}
                        ERP
                      </span>
                    </td>
                    <td className="px-1.5 py-1.5 max-w-[18rem]">
                      {f.erp ? (
                        <div className="truncate sunmi-text-strong font-medium" title={f.erp.nombre}>
                          {f.erp.nombre}
                        </div>
                      ) : (
                        <span className="sunmi-text-warning">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5 tabular-nums">
                      {guardado ? (
                        <span className="sunmi-text-strong">{guardado}</span>
                      ) : (
                        <span className="text-[10px] sunmi-text-warning">Sin código Arcor</span>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5 sunmi-text-strong">{f.erp?.unidadMedida ?? "—"}</td>
                    <td className="px-1.5 py-1.5 tabular-nums sunmi-text-strong">
                      {f.erp?.factorPack ? `${f.erp.factorPack} u.` : (f.erp?.presentacion ?? "—")}
                    </td>
                    <Celda
                      alineado="der"
                      nota={fechaCorta(f.erp?.actualizadoEn) ? `act. ${fechaCorta(f.erp.actualizadoEn)}` : null}
                    >
                      <span className="tabular-nums">{money(f.erp?.costoActual)}</span>
                    </Celda>
                    <Celda alineado="der" nota={r.multiplicador ? `× ${r.multiplicador}` : null}>
                      <span className="tabular-nums font-semibold">{money(r.costoPropuesto)}</span>
                    </Celda>
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
                    <td className="px-1.5 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {editable ? (
                        <SunmiButton
                          color="slate"
                          onClick={() => onVincular?.(f)}
                          className="py-1 px-2 !text-[10.5px]"
                        >
                          Cambiar
                        </SunmiButton>
                      ) : (
                        <span className="text-[10px] sunmi-text-muted">solo lectura</span>
                      )}
                    </td>
                  </tr>

                  {/* ── EL PRODUCTO DEL ARCHIVO, en las mismas columnas ─── */}
                  {abierto && (
                    <tr data-fila={f.filaExcel} data-origen="archivo" className="sunmi-surface-soft align-middle">
                      <td className="px-1.5 py-1" style={BARRA_ACENTO} />
                      <td className="px-1.5 py-1 text-[10px] font-semibold sunmi-text-accent uppercase whitespace-nowrap">
                        Fila {f.filaExcel}
                      </td>
                      <td className="px-1.5 py-1 max-w-[18rem]">
                        <div className="truncate sunmi-text-strong" title={f.descripcionProveedor}>
                          {f.descripcionProveedor}
                        </div>
                      </td>
                      <Celda nota={rel?.texto} notaTono={rel?.tono}>
                        <span className="tabular-nums">{f.codigoCrudo ?? "—"}</span>
                      </Celda>
                      <td className="px-1.5 py-1 sunmi-text-strong">{f.unidadProveedor ?? "—"}</td>
                      <Celda
                        nota={f.unidadesPorBulto ? `UxBU ${f.unidadesPorBulto} · dato logístico` : null}
                        titulo={f.unidadesPorBulto ? LEYENDA_UXBU : undefined}
                      >
                        <span className="tabular-nums">
                          {r.presentacion?.cantidadDescripcion ? `${r.presentacion.cantidadDescripcion} u.` : "—"}
                          {r.presentacion?.pesoTexto ? ` · ${r.presentacion.pesoTexto}` : ""}
                        </span>
                      </Celda>
                      <Celda alineado="der" nota={`+${Number(f.recargoPct ?? 0)} % de recargo`}>
                        <span className="tabular-nums">{money(f.precioConIva)}</span>
                      </Celda>
                      <td className="px-1.5 py-1 text-right sunmi-text-muted">—</td>
                      <td className="px-1.5 py-1 text-right sunmi-text-muted">—</td>
                      <td className="px-1.5 py-1 text-[10px] sunmi-text-muted">informado</td>
                      <td className="px-1.5 py-1 text-[10px] sunmi-text-muted">
                        {r.presentacion?.compatibilidad === "COINCIDEN"
                          ? "Presentación coincide"
                          : r.presentacion?.compatibilidad === "DIFIEREN"
                            ? "Presentación distinta"
                            : "—"}
                      </td>
                      <td className="px-1.5 py-1" />
                    </tr>
                  )}

                  {/* ── Las interpretaciones y el cierre ────────────────── */}
                  {abierto && (
                    <tr className="sunmi-surface-soft">
                      <td colSpan={12} className="pl-3 pr-2 pt-0.5 pb-1.5" style={BARRA_ACENTO}>
                        <InterpretacionesFila
                          fila={f}
                          importacion={importacion}
                          onConfirmada={(json) => { setAbierta(null); onConfirmada?.(json); }}
                          onVincularOtro={() => { setAbierta(null); onVincular?.(f); }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── MÓVIL: tarjetas compactas, sin scroll horizontal ─────────────── */}
      <div className="lg:hidden space-y-1.5">
        {filasConResumen.map(({ f, r, expandible }) => {
          const sel = seleccionDe?.(f) ?? null;
          const puedeMarcar = sel?.puede === true && editable;
          const abierto = abierta === f.id;
          const tono = r.estadoVariacion ? TONO_ESTADO_VARIACION[r.estadoVariacion] : "sunmi-text-muted";
          const guardado = codigoArcorGuardado(f.erp);
          const rel = relacionDeCodigos(f.codigoCrudo, guardado);
          const abre = expandible && editable;
          return (
            <div key={f.id} data-fila={f.filaExcel} className="sunmi-border border rounded-lg overflow-hidden">
              <div
                data-origen="erp"
                data-expandible={abre ? "si" : "no"}
                role={abre ? "button" : undefined}
                tabIndex={abre ? 0 : undefined}
                aria-expanded={abre ? abierto : undefined}
                onClick={abre ? () => alternar(f.id) : undefined}
                onKeyDown={abre ? (e) => teclaAbre(e, f.id) : undefined}
                className="p-2 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  {puedeMarcar && (
                    <input
                      type="checkbox"
                      checked={sel.marcada}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onMarcar?.(f, e.target.checked)}
                      aria-label={`Seleccionar la fila ${f.filaExcel} para aplicar`}
                      className="h-4 w-4 mt-0.5 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold sunmi-text-muted uppercase">
                      {abre && (
                        <ChevronRight
                          size={11}
                          aria-hidden="true"
                          className={`transition-transform ${abierto ? "rotate-90 sunmi-text-accent" : ""}`}
                        />
                      )}
                      ERP
                    </span>
                    <div className="text-[12px] font-semibold sunmi-text-strong leading-tight break-words">
                      {f.erp?.nombre ?? <span className="sunmi-text-warning">Sin vincular</span>}
                    </div>
                    <div className="text-[10px] sunmi-text-muted tabular-nums">
                      {guardado ?? "sin código Arcor"} · {f.erp?.unidadMedida ?? "—"}
                      {f.erp?.factorPack ? ` · ${f.erp.factorPack} u.` : ""}
                    </div>
                  </div>
                  <ChipEstado fila={f} resumen={r} />
                </div>

                <div className="grid grid-cols-3 gap-1 text-[11px] tabular-nums">
                  <div>
                    <div className="text-[9.5px] sunmi-text-muted">Costo actual</div>
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
                  <div onClick={(e) => e.stopPropagation()}>
                    <SunmiButton
                      color="slate"
                      onClick={() => onVincular?.(f)}
                      className="py-1.5 px-2.5 !text-[11px]"
                    >
                      Cambiar
                    </SunmiButton>
                  </div>
                )}
              </div>

              {/* La misma comparación, apilada: el archivo con las mismas
                  etiquetas que el ERP de arriba, y después la decisión. */}
              {abierto && (
                <div className="sunmi-surface-soft border-t sunmi-border p-2 space-y-2" style={BARRA_ACENTO}>
                  <div data-origen="archivo" className="space-y-1">
                    <div className="text-[9.5px] font-semibold sunmi-text-accent uppercase">
                      Archivo · fila {f.filaExcel}
                    </div>
                    <div className="text-[12px] font-semibold sunmi-text-strong leading-tight break-words">
                      {f.descripcionProveedor}
                    </div>
                    <div className="text-[10px] sunmi-text-muted tabular-nums">
                      {f.codigoCrudo ?? "—"}
                      {rel ? ` · ${rel.texto}` : ""} · {f.unidadProveedor}
                      {r.presentacion?.cantidadDescripcion ? ` · ${r.presentacion.cantidadDescripcion} u.` : ""}
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[11px] tabular-nums">
                      <div>
                        <div className="text-[9.5px] sunmi-text-muted">Precio informado</div>
                        <div className="sunmi-text-strong">{money(f.precioConIva)}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] sunmi-text-muted">Recargo</div>
                        <div className="sunmi-text-strong">+{Number(f.recargoPct ?? 0)} %</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] sunmi-text-muted">UxBU</div>
                        <div className="sunmi-text-muted inline-flex items-center gap-0.5" title={LEYENDA_UXBU}>
                          {f.unidadesPorBulto ?? "—"}
                          <Info size={9} aria-hidden="true" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <InterpretacionesFila
                    fila={f}
                    importacion={importacion}
                    onConfirmada={(json) => { setAbierta(null); onConfirmada?.(json); }}
                    onVincularOtro={() => { setAbierta(null); onVincular?.(f); }}
                  />
                </div>
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
