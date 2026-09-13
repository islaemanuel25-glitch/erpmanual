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
  escalaFisicaDeLinea,
  estadoDeLinea,
  fisicasEnviadasDe,
  fisicasRecibidasDe,
  motivoSigueSiendoValido,
  motivosParaDiferencia,
  sePuedeQuitarLinea,
} from "@/lib/transferencias/recepcionUI";
// `unidadesFisicasDe` se importaba acá y se llamaba con las columnas CRUDAS. Ver
// el bloque de la diferencia: eso era el defecto, no un detalle de estilo.
import { descriptorDeEnvio, nombreDePresentacion } from "@/lib/transferencias/presentacionEnvio";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * EL IMPORTE QUE ESTA TABLA MUESTRA POR LÍNEA.
 *
 * El endpoint manda dos: `subtotal` es el del REMITO —lo que salió del
 * depósito, inmutable mientras alguien cuenta— y `subtotalRecibido` es lo que
 * vale lo que llegó, que sigue a la corrección y es el mismo número que el
 * servidor suma para el total corregido del documento.
 *
 * Esta tabla leía `subtotal` pelado en sus dos vistas, sin ninguna de las dos
 * ramas que el teléfono ya tenía. Eso dejaba vivos los dos defectos:
 *
 *   · la #195 — un producto agregado se dibujaba en $0,00, porque no venía en
 *     el remito y su `subtotal` vale cero por definición;
 *   · la #191 — una línea corregida de 4 a 10 se quedaba en el importe del
 *     documento mientras el total de abajo ya mostraba el corregido.
 *
 * Se lee siempre lo recibido cuando existe. `subtotalRecibido` llega en `null`
 * solo si nadie contó todavía, y ahí lo enviado ES lo que vale la línea.
 */
function importeDeLinea(d) {
  return d?.subtotalRecibido == null ? d?.subtotal : d.subtotalRecibido;
}

/**
 * "5 PACK x6 + 5 sueltas". El desglose, no el total.
 *
 * El total solo dice 35; el desglose dice de dónde sale, que es lo que el
 * operador contó y lo que permite verificarlo sin rehacer la cuenta.
 */
function desgloseFisico(d, recibido) {
  // ── LA PRESENTACIÓN SE DERIVA, NO SE ESCRIBE ──────────────────────────
  //
  // Decía `PACK x${d.factorPack}`, con la palabra a mano y el factor del catálogo
  // de HOY. Con eso una línea que salió en cajones se leía "4 PACK x8", y si
  // alguien editaba el producto después del envío el factor del papel cambiaba.
  //
  // `nombreDePresentacion` sobre el descriptor contesta las dos cosas —"CAJÓN x8"—
  // leyendo el snapshot de cómo salió. Es la misma función que rotula en el
  // teléfono, así que los dos documentos dicen lo mismo de la misma línea.
  const bultos = `${fmtCantidad(recibido)} ${nombreDePresentacion(descriptorDeEnvio(d))}`;
  const sueltas = num(d.recibidoUnidadesSueltas);
  if (!sueltas) return bultos;
  return `${bultos} + ${fmtCantidad(sueltas)} ${sueltas === 1 ? "suelta" : "sueltas"}`;
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

    // ── LA DIFERENCIA SE MIDE EN FÍSICO, TAMBIÉN EN EL HISTÓRICO ──────────
    //
    // Restar las cantidades en la PRESENTACIÓN mentía desde que existe el pack
    // incompleto: 6 packs enviados contra "6 packs + 1 suelta" recibidos daba
    // `6 − 6 = 0`, o sea "exacto", cuando físicamente son 37 contra 36. Y al
    // revés: 5 packs + 6 sueltas daba "falta 1" cuando son 36 contra 36.
    //
    // El stock ya se movía bien —confirmar sí pasa las sueltas—, así que lo que
    // quedaba mal era SOLO el documento. Es el peor de los dos casos: nadie
    // sospecha del papel cuando el inventario cuadra.
    //
    // Se mide con `milesimasFisicas`, la misma del servidor. No hay una fórmula
    // acá.
    //
    // ── Y LA ESCALA SALE DEL SNAPSHOT, QUE ES EL DEFECTO QUE ESTO CIERRA ──
    //
    // Acá se llamaba a `unidadesFisicasDe` pasándole las columnas CRUDAS
    // `d.unidadEnviada` y `d.factorPack`. Y `unidadEnviada` dice `UNIDAD` en casi
    // todas estas líneas, porque la venta interna del POS consolida a físicas
    // antes de guardar: con eso el factor es 1, y los 4 CAJÓN x8 que la recepción
    // persistió en `recibido` se leían como 4 unidades contra 32 enviadas.
    //
    // Producción, transferencia #204: "Enviada 32 · Recibida 4 · Diferencia −28"
    // sobre una línea que llegó COMPLETA. Y en la #198, con sueltas de por medio,
    // `milesimasFisicas` devolvía null y la diferencia salía "—" sobre un
    // excedente real de 12 unidades que el servidor ya había movido.
    //
    // `fisicasEnviadasDe` y `fisicasRecibidasDe` son las funciones de este mismo
    // módulo que leen el descriptor, o sea el snapshot cuando la línea lo tiene y
    // la reconstrucción del catálogo cuando es anterior. Las usaba el teléfono y
    // no esta tabla: el defecto no era la falta de una función, era entrar por la
    // puerta equivocada. Ver `INC-0009`.
    const envFis = fisicasEnviadasDe(d);
    const recFis =
      recibido == null
        ? null
        : fisicasRecibidasDe(d, {
            cantidad: recibido,
            // Mientras se edita, las sueltas persistidas son las que hay: esta
            // tabla ya no es el editor de la recepción.
            sueltas: d.recibidoUnidadesSueltas,
          });
    const diff = envFis == null || recFis == null ? null : recFis - envFis;
    // `estadoLinea` y no `estado`: el `estado` de arriba es el de la
    // TRANSFERENCIA. Con el mismo nombre uno sombrea al otro adentro de este
    // callback.
    //
    // Y compara las FÍSICAS por el mismo motivo que `diff`: en la presentación,
    // "6 packs + 1 suelta" contra 6 enviados se leería como exacto.
    const estadoLinea = estadoDeLinea({
      enviada: envFis,
      recibida: recibidoCrudo == null ? null : recFis,
    });
    // El tono de la FILA. El excedente no usa el rojo del faltante: llegar de más
    // no es un error de validación, es una diferencia real que hay que explicar.
    let tono = "";
    if (estadoLinea === ESTADO_LINEA.EXACTO) tono = "sunmi-state-success";
    else if (estadoLinea === ESTADO_LINEA.FALTANTE) tono = "sunmi-state-danger-soft";
    else if (estadoLinea === ESTADO_LINEA.EXCEDENTE) tono = "sunmi-state-warning-soft";
    // Cuántas unidades físicas representa lo recibido, cuando la línea va en
    // BULTO y el factor lo hace distinto del número escrito. Informativo.
    // Sale del mismo número físico que ya se calculó, con las sueltas adentro:
    // `previsualizarIngresoFisico` no las conocía y por eso mostraba 30 donde
    // había 35. Se muestra solo cuando aporta —en BULTO con factor > 1—, que es
    // el criterio que tenía.
    //
    // Y esta pregunta también salía de las columnas crudas, con el mismo efecto
    // dado vuelta: `unidadEnviada` en `UNIDAD` daba falso, así que el renglón que
    // EXPLICA la escala —"4 CAJÓN x8 = 32 unidades"— desaparecía justo en las
    // líneas donde los dos números no coinciden. El criterio no cambia: agrupa y
    // con factor mayor que uno. Lo que cambia es de dónde sale la respuesta.
    const escalaDeLaLinea = escalaFisicaDeLinea(d);
    const agrupa = escalaDeLaLinea.agrupa && Number(escalaDeLaLinea.factorPack || 1) > 1;
    const fisico = agrupa && recFis != null && recFis > 0 ? recFis : null;
    const sePuedeQuitar = sePuedeQuitarLinea({ linea: d, puedeRecibir: inputsHabilitados });
    // Qué motivos ofrece ESTA línea. Lista vacía = no se le pide ninguno, y hay
    // dos razones: no hay diferencia, o la línea se agregó en recepción y su
    // procedencia ya está registrada con autor y fecha. La decisión no se toma
    // acá: sale de `exigeMotivo`, la misma que aplica el servidor.
    //
    // Y se preguntan con las FÍSICAS, que es la tercera vez que aparece la misma
    // mezcla en este archivo: `enviada` es física y `edit.recibido` está en la
    // presentación, así que sobre una línea agrupada la lista se elegía comparando
    // dos escalas. El signo decide QUÉ motivos se ofrecen —Faltante o Sobrante—,
    // y con la mezcla ofrecía "Faltante" sobre una línea completa.
    const motivos = motivosParaDiferencia({
      enviada: envFis,
      recibida: recibidoCrudo == null ? null : recFis,
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
                    {fmtMoneda(importeDeLinea(d))}
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
                {/* El DESGLOSE, no solo el total. "35 unidades" a secas pierde
                    de dónde salieron; "5 PACK x6 + 5 sueltas" es lo que el
                    operador contó y lo que hace verificable el 35. */}
                {fisico != null && (
                  <div className="text-sm2 sunmi-text-muted">
                    Ingreso físico: {desgloseFisico(d, recibido)} = {fmtCantidad(fisico)} unidades
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
                    {fmtMoneda(importeDeLinea(d))}
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
