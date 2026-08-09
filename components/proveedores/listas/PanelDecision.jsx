"use client";

// EL PANEL DE DECISIÓN de una fila de conciliación.
//
// ── LA FORMA NO CAMBIA, EL CONTENIDO SÍ ─────────────────────────────────────
//
// Siempre las mismas dos partes: arriba la comparación por origen, abajo las
// tarjetas elegibles. Lo único que cambia es QUÉ se elige, y eso lo decide
// `formaDelPanel`, no este componente.
//
//   pregunta = PRODUCTO        → las tarjetas son productos candidatos
//   pregunta = INTERPRETACION  → las tarjetas son lecturas del precio
//   pregunta = null            → una sola tarjeta que explica por qué no hay nada
//
// Que la forma sea siempre la misma es lo que permite mirar cuatro filas
// distintas sin volver a aprender dónde está cada cosa.
//
// ── LA CUENTA NO SE REIMPLEMENTA ────────────────────────────────────────────
//
// Todo lo que se muestra sale de `analizarFila`, que es el mismo módulo que
// valida el servidor: `evaluadas` son las tarjetas, `recomendada` dice cuál
// lleva el chip, y cada hipótesis ya trae su multiplicador, su costo y su
// detalle en castellano. Acá no se multiplica ni se redondea nada.

import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { money } from "@/lib/proveedores/listas/presentacion";
import { analizarFila, LEYENDA_UXBU } from "@/lib/proveedores/listas/confirmarPresentacion";
import {
  TONO_ESTADO_VARIACION,
  TEXTO_ESTADO_VARIACION,
  textoRecomendacion,
} from "@/lib/proveedores/listas/rangoAumento";
import { PREGUNTA } from "@/lib/proveedores/listas/panelDecision";
import {
  rangoDeLaFila,
  confirmacionDeInterpretacionVigente,
} from "@/lib/proveedores/listas/vigenciaConfirmacion";

const pct = (n) =>
  n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)} %`;

/**
 * Lo que pasa con la confirmación si se vincula otro producto.
 *
 * Dice VENCE y no "se borra" porque eso es lo que ocurre: la fila conserva quién
 * confirmó y qué confirmó, y esa decisión deja de contar porque fue tomada sobre
 * un producto que ya no es el suyo. La diferencia importa para decidir: nadie
 * evita revincular por miedo a perder un dato que no se pierde.
 */
const AVISO_REVINCULAR =
  "Vincular otro producto deja sin efecto la interpretación confirmada: la fila vuelve a pedir que se elija cómo leer el precio. Queda registrado quién la confirmó y cuándo.";

/** La base que `analizarFila` espera, armada desde el producto del ERP. */
export function baseDesdeErp(erp) {
  if (!erp) return null;
  return {
    unidad_medida: erp.unidadMedida,
    factor_pack: erp.factorPack,
    modoCompraProveedor: erp.modoCompraProveedor ?? null,
    precio_costo: erp.costoActual,
  };
}

/** El análisis de una fila contra un producto. Uno solo por render. */
export function analisisDeFila(fila, erp, importacion) {
  const base = baseDesdeErp(erp);
  if (!base) return null;
  return analizarFila({
    fila,
    base,
    recargoPct: fila.recargoPct,
    // El rango DE ESTA FILA. Antes era el de la cabecera con un `?? 10` y un
    // `?? 20` escritos acá: una fila confirmada se evaluaba con el criterio de la
    // cabecera y no con el que quedó congelado cuando alguien la decidió, que es
    // exactamente lo que ese congelado existe para impedir.
    rango: rangoDeLaFila(fila, importacion),
  });
}

// ── ARRIBA: la comparación ──────────────────────────────────────────────────

const COLUMNAS_COMPARACION = [
  {
    clave: "origen",
    titulo: "Origen",
    render: (o) => (
      <span
        className={`text-[10px] font-semibold uppercase whitespace-nowrap ${
          o.destacado ? "sunmi-text-accent" : "sunmi-text-muted"
        }`}
      >
        {o.origen}
      </span>
    ),
  },
  {
    clave: "producto",
    titulo: "Producto",
    render: (o) => (
      <div className="truncate max-w-[20rem] sunmi-text-strong" title={o.producto ?? ""}>
        {o.producto ?? <span className="sunmi-text-warning">Sin vincular</span>}
      </div>
    ),
  },
  {
    clave: "codigo",
    titulo: "Código",
    tdClassName: "tabular-nums",
    render: (o) => (
      <>
        <div className="sunmi-text-strong">{o.codigo ?? "—"}</div>
        {o.notaCodigo ? (
          <div className="text-[9.5px] leading-tight sunmi-text-muted">{o.notaCodigo}</div>
        ) : null}
      </>
    ),
  },
  {
    clave: "precio",
    titulo: "Precio",
    align: "der",
    tdClassName: "tabular-nums",
    render: (o) => (
      <>
        <div className="sunmi-text-strong">{money(o.precio)}</div>
        {o.notaPrecio ? (
          <div className="text-[9.5px] leading-tight sunmi-text-muted">{o.notaPrecio}</div>
        ) : null}
      </>
    ),
  },
  {
    clave: "presentacion",
    titulo: "Presentación",
    title: (o) => (o.tituloPresentacion ? o.tituloPresentacion : undefined),
    render: (o) => (
      <>
        <div className="sunmi-text-strong">{o.presentacion ?? "—"}</div>
        {o.notaPresentacion ? (
          <div className="text-[9.5px] leading-tight sunmi-text-muted">{o.notaPresentacion}</div>
        ) : null}
      </>
    ),
  },
  {
    clave: "variacion",
    titulo: "Variación",
    align: "der",
    tdClassName: "tabular-nums whitespace-nowrap",
    render: (o) =>
      o.variacionPct === undefined ? (
        <span className="sunmi-text-muted">—</span>
      ) : (
        <span className={o.estadoVariacion ? TONO_ESTADO_VARIACION[o.estadoVariacion] : "sunmi-text-muted"}>
          {pct(o.variacionPct)}
        </span>
      ),
  },
];

/**
 * Las filas de la comparación.
 *
 * En la pregunta de PRODUCTO hay una fila por candidato, porque lo que se está
 * comparando son productos entre sí. En la de INTERPRETACIÓN hay una sola fila
 * ERP: el producto ya está decidido y lo que se compara es contra el archivo.
 */
function origenesDeComparacion({ fila, candidatos, analisis, presentacionArchivo, presentacionErp }) {
  const filas = [];

  for (const c of candidatos) {
    filas.push({
      id: `erp-${c.productoBaseId ?? c.id ?? filas.length}`,
      origen: c.etiqueta ?? "ERP",
      destacado: false,
      producto: c.nombre,
      // PLURAL: acá hay una LISTA, no un valor. Cuando la persistencia del
      // macheo guarde el código del archivo, un producto va a tener el viejo con
      // prefijo —1006139— y el del proveedor —6139—, y los dos tienen que verse.
      //
      // Antes decía `codigoProveedor`, singular, y NADIE en el repo escribía ese
      // campo: los tres productores mandaban una lista con otro nombre. La celda
      // mostraba una raya en los 317 productos que sí tienen código guardado.
      codigo: c.codigosProveedor?.length ? c.codigosProveedor.join(" / ") : null,
      // `notaCodigo` y `tonoNotaCodigo` se leían de `c` y ningún productor los
      // escribía: la celda de nota estaba siempre vacía. El código de barras SÍ
      // lo escriben los tres, y es lo que sirve para distinguir dos candidatos
      // de nombre parecido.
      notaCodigo: c.codigoBarra ? `CB ${c.codigoBarra}` : null,
      precio: c.costoActual,
      notaPrecio: "costo actual",
      presentacion: c.factorPack ? `${c.factorPack} u.` : (c.presentacion ?? "—"),
      // Sin variación: el ERP es la referencia, no varía contra sí mismo.
      variacionPct: undefined,
    });
  }

  // La fila del archivo va SIEMPRE última: es lo que llegó y hay que interpretar.
  filas.push({
    id: "archivo",
    origen: `Archivo · fila ${fila.filaExcel}`,
    destacado: true,
    producto: fila.descripcionProveedor,
    codigo: fila.codigoCrudo ?? null,
    precio: fila.precioConIva,
    notaPrecio: `+${Number(fila.recargoPct ?? 0)} % de recargo`,
    presentacion: presentacionArchivo?.cantidadDescripcion
      ? `${presentacionArchivo.cantidadDescripcion} u.`
      : (fila.unidadProveedor ?? "—"),
    // La presentación DEL ERP viaja como nota de esta celda y no como una fila
    // propia. Es el único dato del producto que no está en la grilla, y su lugar
    // natural es al lado de la presentación contra la que se compara: repetir el
    // producto entero en una fila aparte lo mostraba dos veces, porque la fila de
    // la grilla justo arriba YA es el producto del sistema.
    notaPresentacion: [
      presentacionErp ? `el ERP lo guarda como ${presentacionErp}` : null,
      fila.unidadesPorBulto ? `UxBU ${fila.unidadesPorBulto} · dato logístico` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    tituloPresentacion: fila.unidadesPorBulto ? LEYENDA_UXBU : null,
    // La variación que daría el precio tomado tal cual, sin multiplicar.
    variacionPct: analisis?.evaluadas?.find((h) => h.multiplicador === 1)?.variacionPct ?? null,
    estadoVariacion: analisis?.evaluadas?.find((h) => h.multiplicador === 1)?.estado ?? null,
  });

  return filas;
}

// ── ABAJO: las tarjetas ─────────────────────────────────────────────────────

function Tarjeta({ tarjeta, elegida, sugerida, onElegir, deshabilitada }) {
  const seleccionable = !deshabilitada && !!onElegir;
  return (
    <label
      // El acento va por estilo y no por clase: `--pos-accent` es la variable
      // del tema y no existe una clase de borde acentuado en sunmi.css.
      style={elegida ? { borderColor: "var(--pos-accent)" } : undefined}
      className={`
        block rounded-lg border p-2.5 transition-colors sunmi-border
        ${elegida ? "sunmi-surface-soft" : ""}
        ${seleccionable ? "cursor-pointer" : "opacity-70"}
      `}
    >
      <div className="flex items-start gap-2">
        <input
          type="radio"
          checked={!!elegida}
          onChange={() => onElegir?.(tarjeta.clave)}
          disabled={!seleccionable}
          aria-label={tarjeta.titulo}
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold sunmi-text-strong">{tarjeta.titulo}</span>
            {sugerida ? (
              <span className="text-[9.5px] px-1.5 py-0.5 rounded border sunmi-border sunmi-text-success inline-flex items-center gap-0.5">
                <Check size={9} aria-hidden="true" />
                Sugerida
              </span>
            ) : null}
            {tarjeta.absurda ? (
              <span className="text-[9.5px] px-1.5 py-0.5 rounded border sunmi-border sunmi-text-danger">
                Imposible
              </span>
            ) : null}
          </div>

          {/* La cuenta en UNA línea: es lo que permite verificar el número de un
              vistazo sin abrir una calculadora. */}
          {tarjeta.cuenta ? (
            <div className="text-[10.5px] sunmi-text-muted tabular-nums mt-0.5">{tarjeta.cuenta}</div>
          ) : null}
          {tarjeta.detalle ? (
            <div className="text-[10.5px] sunmi-text-muted mt-0.5">{tarjeta.detalle}</div>
          ) : null}

          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-[16px] font-semibold sunmi-text-strong tabular-nums">
              {money(tarjeta.costoNuevo)}
            </span>
            {tarjeta.variacionPct !== undefined && tarjeta.variacionPct !== null ? (
              <span
                className={`text-[11px] tabular-nums ${
                  tarjeta.estadoVariacion ? TONO_ESTADO_VARIACION[tarjeta.estadoVariacion] : "sunmi-text-muted"
                }`}
              >
                {pct(tarjeta.variacionPct)}
                {tarjeta.estadoVariacion ? ` · ${TEXTO_ESTADO_VARIACION[tarjeta.estadoVariacion]}` : ""}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </label>
  );
}

/** Las hipótesis de `analizarFila`, como tarjetas. Hasta tres. */
function tarjetasDeInterpretacion(analisis, fila) {
  if (!analisis) return [];
  return analisis.evaluadas.slice(0, 3).map((h) => {
    const precio = Number(fila.precioConIva);
    const recargo = Number(fila.recargoPct ?? 0);
    const cuenta =
      h.multiplicador === 1
        ? `${money(precio)}${recargo ? ` + ${recargo} % recargo` : ""}`
        : `${money(precio)} × ${h.multiplicador} = ${money(precio * h.multiplicador)}${
            recargo ? ` + ${recargo} % recargo` : ""
          }`;
    return {
      clave: h.clave,
      titulo: h.multiplicador === 1 ? "Sin multiplicar" : `Precio unitario × ${h.multiplicador}`,
      cuenta,
      detalle: h.origenCantidad ? `Cantidad tomada de ${h.origenCantidad}.` : h.detalle,
      costoNuevo: h.costoNuevo,
      variacionPct: h.variacionPct,
      estadoVariacion: h.estado,
      absurda: h.absurda,
    };
  });
}

/** Los productos candidatos, como tarjetas, cada uno con el costo que daría. */
function tarjetasDeProducto(candidatos, fila, importacion) {
  return candidatos.slice(0, 3).map((c) => {
    const a = analisisDeFila(fila, c, importacion);
    const elegida = a?.evaluadas?.find((h) => h.clave === a.recomendada) ?? a?.evaluadas?.[0] ?? null;
    return {
      clave: `PRODUCTO_${c.productoBaseId}`,
      titulo: c.nombre,
      cuenta: c.codigosProveedor?.length ? `Código ${c.codigosProveedor.join(" / ")}` : null,
      // `parecido`, que es como lo escribe quien arma los candidatos. Antes decía
      // `c.puntaje` —y `c.detalle` de respaldo—: dos campos que nadie escribía,
      // así que la tarjeta nunca mostró el parecido por nombre.
      detalle:
        c.parecido !== undefined && c.parecido !== null
          ? `Parecido por nombre: ${Math.round(Number(c.parecido) * 100)} %`
          : null,
      costoNuevo: elegida?.costoNuevo ?? null,
      variacionPct: elegida?.variacionPct ?? null,
      estadoVariacion: elegida?.estado ?? null,
      absurda: false,
    };
  });
}

// ── El panel ────────────────────────────────────────────────────────────────

export default function PanelDecision({
  fila,
  importacion,
  forma,
  /** Candidatos para la pregunta de PRODUCTO. Los trae quien monta el panel. */
  candidatos = [],
  cargandoCandidatos = false,
  /** El producto ya elegido en el paso 1, si la fila encadenó. */
  productoElegido = null,
  eleccion,
  onElegir,
  onConfirmar,
  onVincularOtro,
  onCorregirOrigen,
  confirmando = false,
}) {
  const erp = productoElegido ?? fila.erp ?? null;
  const analisis = useMemo(() => analisisDeFila(fila, erp, importacion), [fila, erp, importacion]);

  // ¿Hay una decisión de una persona que esta fila todavía está usando? Es lo
  // que decide si vincular otro producto tiene una consecuencia que avisar.
  const confirmadaVigente = confirmacionDeInterpretacionVigente(fila);

  const esPreguntaProducto = forma.pregunta === PREGUNTA.PRODUCTO && !productoElegido;

  const tarjetas = useMemo(() => {
    if (esPreguntaProducto) return tarjetasDeProducto(candidatos, fila, importacion);
    if (forma.pregunta === PREGUNTA.INTERPRETACION || productoElegido) {
      return tarjetasDeInterpretacion(analisis, fila);
    }
    return [];
  }, [esPreguntaProducto, candidatos, fila, importacion, forma.pregunta, productoElegido, analisis]);

  const origenes = useMemo(
    () =>
      origenesDeComparacion({
        fila,
        // EN LA PREGUNTA DE PRODUCTO hay una fila por candidato: lo que se compara
        // son productos entre sí y hay que verlos.
        //
        // EN LA DE INTERPRETACIÓN, NINGUNA. El producto ya está decidido, y la
        // fila de la grilla que se acaba de abrir ES ese producto: volver a
        // dibujarlo acá lo mostraba dos veces, una arriba de la otra. Al abrir
        // solo se despliega lo nuevo — la fila del archivo y las opciones.
        candidatos: esPreguntaProducto
          ? candidatos.map((c, i) => ({ ...c, etiqueta: `Candidato ${String.fromCharCode(65 + i)}` }))
          : [],
        analisis,
        presentacionArchivo: analisis?.presentacion,
        // Lo único del ERP que no está en la grilla. Viaja como nota, no como fila.
        presentacionErp: esPreguntaProducto
          ? null
          : erp?.factorPack
            ? `${erp.factorPack} u.`
            : (erp?.unidadMedida ?? null),
      }),
    [fila, candidatos, esPreguntaProducto, erp, analisis]
  );

  const sugerida = esPreguntaProducto ? null : analisis?.recomendada ?? null;

  // UNA SOLA HIPÓTESIS NO ES UNA ELECCIÓN.
  //
  // Cuando el archivo habilita una única forma de leer el precio no hay nada que
  // decidir: hay un resultado. Dibujarlo como tarjeta sin marcar, con el botón
  // apagado hasta tocarla, aparentaba una elección que no existe y además
  // trababa el avance.
  //
  // La regla de no preseleccionar sigue viva para dos o más tarjetas, que es
  // para lo que se puso: ahí sí hay caminos distintos y el sistema no elige por
  // la persona.
  const unica =
    !esPreguntaProducto && tarjetas.length === 1 && !tarjetas[0].absurda ? tarjetas[0] : null;
  const eleccionEfectiva = eleccion ?? unica?.clave ?? null;
  const puedeConfirmar = !!eleccionEfectiva && !confirmando;

  return (
    // El ancho se ata al de la PANTALLA y no al de la tabla. El panel vive en una
    // celda con `colspan` adentro de un contenedor que scrollea de costado: sin
    // esto hereda el ancho de las seis columnas, y en la Sunmi el veredicto y su
    // explicación quedaban cortados a la derecha, ilegibles sin scrollear.
    <div className="p-2.5 space-y-2.5 sunmi-surface-soft max-w-[calc(100vw-4rem)] sticky left-0">
      {/* ── Paso, cuando la decisión encadena ─────────────────────────────── */}
      {forma.paso ? (
        <div className="text-[10px] font-semibold sunmi-text-accent uppercase tracking-wide">
          Paso {forma.paso.actual} de {forma.paso.total} ·{" "}
          {forma.paso.actual === 1 ? "a qué producto corresponde" : "cómo se interpreta el precio"}
        </div>
      ) : null}

      {/* ── ARRIBA: la comparación ────────────────────────────────────────── */}
      <div className="sunmi-border border rounded-lg overflow-hidden">
        <SunmiTable
          densidad="compacta"
          columnas={COLUMNAS_COMPARACION}
          filas={origenes}
          claveFila={(o) => o.id}
          cargando={cargandoCandidatos && esPreguntaProducto}
          vacio="Sin orígenes que comparar."
        />
      </div>

      {/* ── El cartel de error, encima de las tarjetas ────────────────────── */}
      {forma.error ? (
        <div className="rounded-lg border sunmi-border p-2 flex items-start gap-2 sunmi-text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold">El sistema no pudo resolver esta fila</div>
            <div className="text-[10.5px] sunmi-text-muted mt-0.5">
              {fila.motivo || "Un dato de origen no permite calcular el costo."}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── El cartel de por qué no eligió ────────────────────────────────── */}
      {!esPreguntaProducto && analisis && analisis.resultado !== "RECOMENDADA" ? (
        <div className="rounded-lg border sunmi-border p-2 text-[10.5px] sunmi-text-muted">
          {textoRecomendacion({
            evaluadas: analisis.evaluadas,
            recomendada: analisis.recomendada,
            resultado: analisis.resultado,
            baseTexto: fila.unidadProveedor,
            money,
            pct,
          })}
        </div>
      ) : null}

      {/* ── ABAJO: las tarjetas elegibles ─────────────────────────────────── */}
      {forma.pregunta === null ? (
        <div className="rounded-lg border sunmi-border p-2.5">
          <div className="text-[12px] font-semibold sunmi-text-strong">Nada que elegir</div>
          <div className="text-[10.5px] sunmi-text-muted mt-0.5">{fila.motivo || textoSinPregunta(fila)}</div>
        </div>
      ) : unica ? (
        /* ── Una sola lectura: el RESULTADO, no una elección ──────────────── */
        <div className="rounded-lg border sunmi-border p-2.5 sunmi-surface-soft">
          <div className="text-[10px] font-semibold sunmi-text-muted uppercase tracking-wide">
            Costo que resulta
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-[20px] font-semibold sunmi-text-strong tabular-nums">
              {money(unica.costoNuevo)}
            </span>
            {unica.variacionPct !== undefined && unica.variacionPct !== null ? (
              <span
                className={`text-[11px] tabular-nums ${
                  unica.estadoVariacion ? TONO_ESTADO_VARIACION[unica.estadoVariacion] : "sunmi-text-muted"
                }`}
              >
                {pct(unica.variacionPct)}
                {unica.estadoVariacion ? ` · ${TEXTO_ESTADO_VARIACION[unica.estadoVariacion]}` : ""}
              </span>
            ) : null}
          </div>
          {/* El porqué: el título de la lectura y la cuenta en una línea, que es
              lo que permite verificar el número sin calculadora. */}
          <div className="text-[10.5px] sunmi-text-muted tabular-nums mt-1">
            {unica.titulo}
            {unica.cuenta ? ` · ${unica.cuenta}` : ""}
          </div>
          {unica.detalle ? (
            <div className="text-[10.5px] sunmi-text-muted mt-0.5">{unica.detalle}</div>
          ) : null}
          <div className="text-[10.5px] sunmi-text-muted mt-1">
            Es la única forma de leer el precio de esta fila: no hay nada que elegir.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tarjetas.map((t) => (
            <Tarjeta
              key={t.clave}
              tarjeta={t}
              elegida={eleccion === t.clave}
              sugerida={sugerida === t.clave}
              deshabilitada={t.absurda}
              onElegir={onElegir}
            />
          ))}
          {tarjetas.length === 0 && !cargandoCandidatos ? (
            <div className="rounded-lg border sunmi-border p-2.5 text-[10.5px] sunmi-text-muted">
              {esPreguntaProducto
                ? "No se encontró ningún producto candidato. Buscá uno a mano."
                : "El archivo no habilita ninguna interpretación para esta fila."}
            </div>
          ) : null}
        </div>
      )}

      {/* ── El pie ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
        <div className="flex items-center gap-3 text-[10.5px]">
          {onVincularOtro ? (
            <button
              type="button"
              onClick={onVincularOtro}
              className="sunmi-text-accent hover:underline"
              // La advertencia solo aparece cuando hay algo que perder. Y dice
              // VENCER, no borrar, porque es lo que pasa: la confirmación queda
              // guardada con quién la hizo y cuándo, y deja de contar porque fue
              // sobre un producto que ya no es el de la fila. Decir "se borra"
              // haría dudar de deshacer algo que en realidad no se pierde.
              title={confirmadaVigente ? AVISO_REVINCULAR : undefined}
            >
              Buscar otro producto
            </button>
          ) : null}
          {onVincularOtro && confirmadaVigente ? (
            <span className="sunmi-text-warning">{AVISO_REVINCULAR}</span>
          ) : null}
          {forma.error && onCorregirOrigen ? (
            <button type="button" onClick={onCorregirOrigen} className="sunmi-text-accent hover:underline">
              Corregir el dato de origen
            </button>
          ) : null}
        </div>
        {forma.pregunta !== null ? (
          <SunmiButton
            color="amber"
            // La clave viaja en el click. Cuando hay una sola lectura, quien
            // monta el panel no tiene ninguna elección guardada —no hubo nada
            // que tocar— y sin esto confirmaría con `null`.
            onClick={() => onConfirmar?.(eleccionEfectiva)}
            disabled={!puedeConfirmar}
            className="py-1.5 px-3 !text-[11px]"
          >
            {confirmando ? "Confirmando…" : "Confirmar y seguir"}
          </SunmiButton>
        ) : null}
      </div>
    </div>
  );
}

/** Por qué esta fila no pide nada. El motivo del motor manda si existe. */
function textoSinPregunta(fila) {
  switch (fila.estado) {
    case "SIN_CAMBIOS":
      return "El costo que propone la lista es el que el producto ya tiene.";
    case "EXCLUIDO":
      return "Esta fila quedó excluida de la actualización.";
    case "BLOQUEADO":
      return "El costo de este producto no se puede escribir desde esta ubicación.";
    default:
      return "No hay ninguna decisión pendiente en esta fila.";
  }
}
