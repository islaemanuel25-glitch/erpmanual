"use client";

// PENDIENTES DE DECISIÓN.
//
// ── LA TABLA MUESTRA EXCEPCIONES ────────────────────────────────────────────
//
// Acá están las filas que necesitan que alguien decida algo. Las sanas —costo
// nuevo, una sola lectura creíble— NO aparecen: se cuentan en la cabecera y se
// aplican en lote. Si fuera al revés, las veinte que importan quedarían
// enterradas entre doscientas que no.
//
// Se pueden ver igual filtrando por "Listos", y ahí se abren y se puede cambiar
// la interpretación. Abrir es para revisar; el camino normal es el botón de
// arriba.
//
// ── LA TABLA NO SE ESCRIBE A MANO ───────────────────────────────────────────
//
// `columnas` declara qué va en cada una y cómo se alinea; SunmiTable arma el
// encabezado, las celdas, el tono de la fila y el panel que cuelga debajo. Antes
// esto eran doscientas líneas de `<th>` y `<td>` repetidos, con una versión
// aparte para móvil.
//
// ── QUÉ SE DECIDE SIN ABRIR ─────────────────────────────────────────────────
//
// El tono de la fila y la columna Decisión adelantan qué pasa: si es un
// problema de producto, de interpretación, o que no hay nada que hacer. Con eso
// se elige qué abrir.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import SunmiTable from "@/components/sunmi/SunmiTable";
import PanelDecision, { analisisDeFila } from "@/components/proveedores/listas/PanelDecision";
import { money, presentarEstado } from "@/lib/proveedores/listas/presentacion";
import { TONO_ESTADO_VARIACION } from "@/lib/proveedores/listas/rangoAumento";
import { formaDelPanel, tonoDeFila, PREGUNTA } from "@/lib/proveedores/listas/panelDecision";

const pct = (n) =>
  n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)} %`;

/** El código que el proveedor le asigna al producto, si el ERP lo tiene guardado. */
const codigoGuardado = (erp) => (erp?.codigosArcor?.length ? erp.codigosArcor.join(" / ") : null);

/**
 * Lo que la fila necesita mostrar, resuelto una vez por render.
 *
 * `analizarFila` es el mismo módulo que valida el servidor: la pantalla no
 * recalcula, solo muestra.
 */
function resumir(fila, importacion) {
  const analisis = fila.erp ? analisisDeFila(fila, fila.erp, importacion) : null;
  const forma = formaDelPanel({
    estado: fila.estado,
    tieneProducto: !!fila.erp,
    resultado: analisis?.resultado ?? null,
    aplicada: !!fila.aplicada,
  });
  const elegida = analisis?.evaluadas?.find((h) => h.clave === analisis.recomendada) ?? null;

  return {
    forma,
    analisis,
    costoPropuesto: elegida?.costoNuevo ?? fila.costoMaestroPropuesto ?? null,
    variacionPct:
      elegida?.variacionPct ??
      (fila.diferenciaPct === null || fila.diferenciaPct === undefined ? null : Number(fila.diferenciaPct)),
    estadoVariacion: elegida?.estado ?? null,
  };
}

/** Qué decisión pide la fila, en dos palabras. */
function textoDecision(forma, analisis) {
  if (forma.pregunta === PREGUNTA.PRODUCTO) return { titulo: "Elegir producto", detalle: "no se sabe cuál es" };
  if (forma.pregunta === PREGUNTA.INTERPRETACION) {
    if (forma.error) return { titulo: "Revisar el dato", detalle: "el cálculo no cierra" };
    if (analisis?.resultado === "AMBIGUA") return { titulo: "Elegir lectura", detalle: "más de una posible" };
    if (analisis?.resultado === "REVISAR") return { titulo: "Revisar", detalle: "ninguna da un costo creíble" };
    return { titulo: "Confirmar lectura", detalle: "hay una sugerida" };
  }
  return { titulo: "Sin acción", detalle: null };
}

export default function GrillaConciliacion({
  filas,
  importacion,
  editable,
  seleccionDe,
  onMarcar,
  onConfirmada,
  onVincular,
  /** Trae los candidatos de la pregunta de producto. (filaId) => Promise<[]> */
  buscarCandidatos,
}) {
  const [abierta, setAbierta] = useState(null);
  const [eleccion, setEleccion] = useState(null);
  const [productoElegido, setProductoElegido] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [cargandoCandidatos, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const resumenes = useMemo(
    () => new Map(filas.map((f) => [f.id, resumir(f, importacion)])),
    [filas, importacion]
  );

  // Al cambiar de fila se limpia la decisión a medio hacer: dejar marcada la
  // elección de la fila anterior invitaría a confirmar lo que no se miró.
  const alternar = useCallback((f) => {
    setAbierta((x) => {
      const cierra = x === f.id;
      setEleccion(null);
      setProductoElegido(null);
      setCandidatos([]);
      return cierra ? null : f.id;
    });
  }, []);

  // Los candidatos no están persistidos en la fila: hay que pedirlos. Solo
  // cuando la fila abierta pregunta por el producto.
  useEffect(() => {
    if (!abierta || !buscarCandidatos) return;
    const fila = filas.find((f) => f.id === abierta);
    if (!fila) return;
    const forma = resumenes.get(fila.id)?.forma;
    if (forma?.pregunta !== PREGUNTA.PRODUCTO || productoElegido) return;

    let vivo = true;
    setCargando(true);
    Promise.resolve(buscarCandidatos(fila))
      .then((lista) => { if (vivo) setCandidatos(Array.isArray(lista) ? lista : []); })
      .catch(() => { if (vivo) setCandidatos([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [abierta, buscarCandidatos, filas, resumenes, productoElegido]);

  /**
   * Elegir producto NO cierra la decisión: se vuelve a evaluar contra ESE
   * producto y el panel avanza al paso 2 ahí mismo. Si no encadenara, quedaría
   * una interpretación que nadie eligió, que es el error que esta pantalla
   * existe para evitar.
   */
  const elegir = useCallback((clave) => {
    if (!clave?.startsWith?.("PRODUCTO_")) { setEleccion(clave); return; }
    const id = Number(clave.slice("PRODUCTO_".length));
    const elegido = candidatos.find((c) => c.productoBaseId === id) ?? null;
    setProductoElegido(elegido);
    // La lectura del paso 2 arranca en la sugerida, si el motor recomienda una.
    const fila = filas.find((f) => f.id === abierta);
    const a = elegido && fila ? analisisDeFila(fila, elegido, importacion) : null;
    setEleccion(a?.recomendada ?? null);
  }, [candidatos, filas, abierta, importacion]);

  const columnas = useMemo(
    () => [
      // Los checkboxes siguen acá a propósito. El camino que los reemplaza —
      // "aplicar a los N con el mismo caso" desde el panel— todavía no existe, y
      // sacarlos antes dejaría la pantalla con un solo modo de aplicar.
      // Se van cuando ese camino ande.
      {
        clave: "sel",
        titulo: "",
        thClassName: "w-6",
        render: (f) => {
          const sel = seleccionDe?.(f) ?? null;
          if (!(sel?.puede === true && editable)) return null;
          return (
            <input
              type="checkbox"
              checked={!!sel.marcada}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onMarcar?.(f, e.target.checked)}
              aria-label={`Seleccionar la fila ${f.filaExcel} para aplicar`}
              className="h-3.5 w-3.5"
            />
          );
        },
      },
      {
        clave: "abrir",
        titulo: "",
        thClassName: "w-6",
        render: (f) => (
          <ChevronRight
            size={12}
            aria-hidden="true"
            className={`transition-transform ${abierta === f.id ? "rotate-90 sunmi-text-accent" : "sunmi-text-muted"}`}
          />
        ),
      },
      {
        clave: "fila",
        titulo: "Fila",
        align: "der",
        tdClassName: "tabular-nums sunmi-text-muted",
        ordenable: true,
        render: (f) => f.filaExcel,
      },
      {
        clave: "producto",
        titulo: "Producto",
        render: (f) => (
          <>
            <div className="truncate max-w-[16rem] sunmi-text-strong font-medium" title={f.erp?.nombre ?? ""}>
              {f.erp?.nombre ?? <span className="sunmi-text-warning">Sin vincular</span>}
            </div>
            <div className="text-[9.5px] sunmi-text-muted truncate max-w-[16rem]" title={f.descripcionProveedor}>
              {f.descripcionProveedor}
            </div>
          </>
        ),
      },
      {
        clave: "codigo",
        titulo: "Código",
        tdClassName: "tabular-nums",
        render: (f) => (
          <>
            <div className="sunmi-text-strong">{f.codigoCrudo ?? "—"}</div>
            {codigoGuardado(f.erp) ? (
              <div className="text-[9.5px] sunmi-text-muted">ERP {codigoGuardado(f.erp)}</div>
            ) : null}
          </>
        ),
      },
      {
        clave: "costoActual",
        titulo: "Costo actual",
        align: "der",
        tdClassName: "tabular-nums",
        render: (f) => money(f.erp?.costoActual),
      },
      {
        clave: "costoPropuesto",
        titulo: "Propuesto",
        align: "der",
        tdClassName: "tabular-nums font-semibold",
        render: (f) => money(resumenes.get(f.id)?.costoPropuesto),
      },
      {
        clave: "variacion",
        titulo: "Var.",
        align: "der",
        tdClassName: "tabular-nums whitespace-nowrap",
        ordenable: true,
        render: (f) => {
          const r = resumenes.get(f.id);
          return (
            <span className={r?.estadoVariacion ? TONO_ESTADO_VARIACION[r.estadoVariacion] : "sunmi-text-muted"}>
              {pct(r?.variacionPct)}
            </span>
          );
        },
      },
      {
        clave: "estado",
        titulo: "Estado",
        render: (f) => {
          const p = presentarEstado(f.estado);
          return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border sunmi-border ${p.tono}`}>{p.etiqueta}</span>
          );
        },
      },
      {
        clave: "decision",
        titulo: "Decisión",
        render: (f) => {
          const r = resumenes.get(f.id);
          const d = textoDecision(r.forma, r.analisis);
          return (
            <>
              <div className="sunmi-text-strong truncate max-w-[10rem]">{d.titulo}</div>
              {d.detalle ? (
                <div className="text-[9.5px] sunmi-text-muted truncate max-w-[10rem]">{d.detalle}</div>
              ) : null}
            </>
          );
        },
      },
    ],
    [abierta, resumenes, seleccionDe, onMarcar, editable]
  );

  const confirmar = useCallback(async () => {
    const fila = filas.find((f) => f.id === abierta);
    if (!fila || !eleccion) return;
    setConfirmando(true);
    try {
      await onConfirmada?.({ fila, clave: eleccion, producto: productoElegido });
      setAbierta(null);
      setEleccion(null);
      setProductoElegido(null);
    } finally {
      setConfirmando(false);
    }
  }, [filas, abierta, eleccion, productoElegido, onConfirmada]);

  return (
    <div className="sunmi-border border rounded-lg overflow-hidden">
      <SunmiTable
        densidad="compacta"
        stickyHeader
        columnas={columnas}
        filas={filas}
        claveFila={(f) => f.id}
        ordenClave="fila"
        ordenDir="asc"
        vacio="No quedan decisiones pendientes en esta vista."
        tonoFila={(f) => tonoDeFila({ estado: f.estado, aplicada: f.aplicada })}
        onClickFila={editable ? alternar : undefined}
        filaSeleccionada={(f) => abierta === f.id}
        // Devolver null es "esta fila está cerrada": el estado de apertura vive
        // acá, que es donde vive el dato.
        filaExpandible={(f) => {
          if (abierta !== f.id) return null;
          const r = resumenes.get(f.id);
          const forma = productoElegido
            ? formaDelPanel({
                estado: f.estado,
                tieneProducto: true,
                resultado: analisisDeFila(f, productoElegido, importacion)?.resultado ?? null,
                productoElegido: true,
              })
            : r.forma;
          return (
            <PanelDecision
              fila={f}
              importacion={importacion}
              forma={forma}
              candidatos={candidatos}
              cargandoCandidatos={cargandoCandidatos}
              productoElegido={productoElegido}
              eleccion={eleccion}
              onElegir={elegir}
              onConfirmar={confirmar}
              onVincularOtro={onVincular ? () => onVincular(f) : undefined}
              confirmando={confirmando}
            />
          );
        }}
      />
    </div>
  );
}
