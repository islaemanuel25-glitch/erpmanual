"use client";

// components/transferencias/RecepcionEscritorio.jsx
//
// LA COMPOSICIÓN DE COMPUTADORA DE "RECIBIR UNA TRANSFERENCIA", desde `lg`
// (Figma EVJ2KvVCrY0oVSowfboymQ, 384:483, "Escritorio · Recibir transferencia
// · 1366"). Entre 768 y 1023 px se ve la del teléfono.
//
// ── QUÉ ES ESTO Y QUÉ NO ES ──────────────────────────────────────────────
//
// Es PRESENTACIÓN, igual que `RecepcionMovil`. Recibe de `WorkspaceRecepcion`
// el mismo estado y los mismos handlers —filtro, categoría, búsqueda, catálogo,
// revisar, confirmar— y los acomoda para un mouse y una pantalla ancha. No
// llama a ningún endpoint y no decide ninguna regla:
//
//   · si se puede confirmar ......... `cierreDeRecepcion`, la misma del teléfono;
//   · qué dice cada línea ........... `lecturaDeLaLinea`, la misma de la tarjeta;
//   · qué manda "✓ Coincide" ........ `cuerpoDeCoincide`, el mismo de la tarjeta;
//   · el producto elegido ........... `FichaProductoRecepcion` con `enHoja`, la
//                                     MISMA hoja que el teléfono abre desde abajo:
//                                     la presentación la dicta la ficha del
//                                     depósito, el motivo es obligatorio si se
//                                     toca la cantidad, la diferencia en plata;
//   · el "⋯" ........................ `MasAccionesRecepcion`, la misma lista.
//
// Lo único suyo es qué se ve: dónde va cada cosa.
//
// ── TRES FRANJAS ──────────────────────────────────────────────────────────
//
//   1. La transferencia: número, estado, puntas, avance, importe y las
//      acciones —⋯, Volver y Confirmar—, en una tarjeta.
//   2. Las herramientas en una fila: buscar o escanear, los cuatro filtros de
//      siempre y la categoría.
//   3. El cuerpo: la lista como tabla a la izquierda y, a la derecha, el panel
//      del producto elegido, pegado arriba mientras la lista scrollea.

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiBarraDeAvance from "@/components/sunmi/SunmiBarraDeAvance";
import { hayEscanerDisponible } from "@/components/sunmi/SunmiEscanerCodigoBarra";

import EstadoTransferenciaBadge from "./EstadoTransferenciaBadge";
import FichaProductoRecepcion from "./FichaProductoRecepcion";
import FilaCatalogoRecepcion, { ROTULO_CATALOGO } from "./FilaCatalogoRecepcion";
import MasAccionesRecepcion, { TITULO_MAS_ACCIONES } from "./MasAccionesRecepcion";
import { AVISO_FALTA_CANTIDAD, MENSAJE_NO_FIGURA_CORTO, PLACEHOLDER_BUSCADOR } from "./RecepcionMovil";
import {
  CLASE_COINCIDE,
  TEXTO_COINCIDE,
  TEXTO_CORREGIR,
  cuerpoDeCoincide,
  lecturaDeLaLinea,
} from "./TarjetaRecepcionMovil";
import { fmtCantidad, fmtFechaHoraAR } from "./detallePresentacion";

import { formatearMoneda } from "@/lib/moneda";
import { FILTRO, pasaFiltro } from "@/lib/transferencias/controlFisico";
import { MOTIVOS_FALTANTE, MOTIVOS_SOBRANTE, cierreDeRecepcion } from "@/lib/transferencias/recepcionUI";
import {
  agrupa,
  firmaDeEdicion,
  nombreDePresentacion,
  rotuloConSueltasCorto,
  unidadDeDiferencia,
} from "@/lib/transferencias/presentacionEnvio";

/** Los cuatro estados del trabajo, los mismos del teléfono y en el mismo orden. */
const TABS = [
  { clave: FILTRO.PENDIENTES, texto: "Pendientes" },
  { clave: FILTRO.DIFERENCIAS, texto: "Diferencias" },
  { clave: FILTRO.REVISADOS, texto: "Revisados" },
  { clave: FILTRO.TODOS, texto: "Todos" },
];

/** De dónde sale el número de cada filtro: del MISMO resumen que el teléfono. */
const CONTEO = {
  [FILTRO.PENDIENTES]: (r) => r.pendientes,
  [FILTRO.DIFERENCIAS]: (r) => r.diferencias,
  [FILTRO.REVISADOS]: (r) => r.revisados,
  [FILTRO.TODOS]: (r) => r.totalFisico ?? r.totalRemito,
};

export const TEXTO_TODO_REVISADO = "Está todo revisado. Revisá las diferencias y confirmá la recepción.";

const plural = (n, uno, varios) => `${fmtCantidad(n)} ${n === 1 ? uno : varios}`;

/** El rótulo de un motivo guardado, el mismo que muestra la ficha al elegirlo. */
function rotuloDeMotivo(valor) {
  if (!valor) return null;
  const m = [...MOTIVOS_FALTANTE, ...MOTIVOS_SOBRANTE].find((o) => o.value === valor);
  return m ? m.label : valor;
}

/**
 * Por qué no se puede confirmar, en una línea, para debajo del botón. La regla
 * es la de `cierreDeRecepcion`; esto solo la dice en palabras.
 */
function motivoDelBloqueo({ pendientes, sinMotivo, sinCargar }) {
  if (pendientes > 0) return `Falta revisar ${plural(pendientes, "producto", "productos")}`;
  if (sinMotivo > 0) return `Falta el motivo de ${plural(sinMotivo, "diferencia", "diferencias")}`;
  if (sinCargar > 0) return AVISO_FALTA_CANTIDAD;
  return null;
}

/** "Faltó 1 unidad" / "Sobró 4 unidades", en FÍSICO. */
function textoDeLaDiferencia(delta, unidad) {
  const n = Math.abs(delta);
  const palabra = unidad === "unidades" ? (n === 1 ? "unidad" : "unidades") : unidad;
  return `${delta < 0 ? "Faltó" : "Sobró"} ${fmtCantidad(n)} ${palabra}`;
}

// ── LAS CELDAS ────────────────────────────────────────────────────────────

function CeldaProducto({ d }) {
  return (
    <>
      <span className="block font-semibold sunmi-text-strong break-words">{d.nombre}</span>
      {d.categoria?.nombre ? <span className="block text-sm2 sunmi-text-muted">{d.categoria.nombre}</span> : null}
    </>
  );
}

function CeldaEnviado({ l }) {
  if (l.esAgregada) return <span className="sunmi-text-muted">—</span>;
  // Las unidades físicas debajo solo cuando la presentación agrupa —pack,
  // cartón, cajón—: "6 PACK x6 · 36 unidades". En una que se cuenta por unidad
  // serían el mismo número dos veces.
  const conFisicas = !l.porUnidad && agrupa(l.envio.presentacion) && l.fisicasEnviadas != null;
  return (
    <>
      <span className="block whitespace-nowrap tabular-nums font-medium">{rotuloConSueltasCorto(l.mostrado)}</span>
      {conFisicas ? (
        <span className="block text-xs2 tabular-nums sunmi-text-muted">
          {fmtCantidad(l.fisicasEnviadas)} {unidadDeDiferencia(l.envio)}
        </span>
      ) : null}
    </>
  );
}

function CeldaRecibido({ l }) {
  if (l.fisicasContadas == null && !l.revisado) return <span className="sunmi-text-muted">—</span>;
  const rotulo = rotuloConSueltasCorto({
    ...l.mostrado,
    cantidad: l.recibidasMostradas ?? 0,
    sueltas: l.sueltasMostradas,
  });
  if (l.esAgregada) {
    return <span className="block whitespace-nowrap tabular-nums font-medium sunmi-text-warning">{rotulo}</span>;
  }
  const coincide = l.delta === 0;
  return (
    <>
      <span
        className={`block whitespace-nowrap tabular-nums font-medium ${coincide ? "sunmi-text-success" : "sunmi-text-danger"}`}
      >
        {rotulo}
      </span>
      {coincide ? (
        agrupa(l.envio.presentacion) && !l.porUnidad && l.fisicasContadas != null ? (
          <span className="block text-xs2 tabular-nums sunmi-text-muted">
            {fmtCantidad(l.fisicasContadas)} {unidadDeDiferencia(l.envio)}
          </span>
        ) : null
      ) : l.fisicasContadas != null && l.fisicasEnviadas != null ? (
        <span className="block text-xs2 tabular-nums sunmi-text-danger">
          {fmtCantidad(l.fisicasContadas)} de {fmtCantidad(l.fisicasEnviadas)}
        </span>
      ) : null}
    </>
  );
}

function CeldaImporte({ l }) {
  // Los dos importes del endpoint, como en la tarjeta: el del remito tachado
  // arriba cuando la corrección lo cambió, y el que vale lo que llegó.
  return (
    <span className="whitespace-nowrap tabular-nums">
      {l.hayCorreccionDeImporte ? (
        <span className="block text-xs2 line-through sunmi-text-muted">{formatearMoneda(l.importeRemito)}</span>
      ) : null}
      <span className={`block ${l.hayCorreccionDeImporte ? "font-semibold sunmi-text-warning" : "sunmi-text-strong"}`}>
        {formatearMoneda(l.importeRecibido)}
      </span>
    </span>
  );
}

/** Una marca chica: "✓ Coincide", "Faltó 1 unidad · Faltante", "No declarado". */
function Marca({ tono, children }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs2 font-semibold ${tono}`}>
      {children}
    </span>
  );
}

function CeldaAcciones({ d, l, puedeRecibir, guardando, onCoincide, onCorregir }) {
  if (!puedeRecibir) return null;
  // Las mismas puertas que la tarjeta del teléfono: "Coincide" solo donde no
  // hay ninguna diferencia declarada ni es un no declarado; ahí el único
  // camino es "Corregir".
  const corregir = (
    <SunmiLinkButton
      onClick={(e) => {
        e.stopPropagation();
        onCorregir(d);
      }}
      disabled={guardando}
      aria-label={`${TEXTO_CORREGIR} ${d.nombre}`}
      className="text-sm2"
    >
      {TEXTO_CORREGIR}
    </SunmiLinkButton>
  );

  if (l.esAgregada) {
    return (
      <span className="inline-flex items-center gap-2">
        <Marca tono="sunmi-state-warning sunmi-text-warning">No declarado</Marca>
        {corregir}
      </span>
    );
  }
  if (l.hayDiferencia && l.delta != null) {
    const motivo = rotuloDeMotivo(d.motivoPrincipal);
    return (
      <span className="inline-flex items-center gap-2">
        <Marca tono="sunmi-state-danger sunmi-text-danger">
          {textoDeLaDiferencia(l.delta, unidadDeDiferencia(l.envio))}
          {motivo ? ` · ${motivo}` : " · sin motivo"}
        </Marca>
        {!l.revisado ? corregir : null}
      </span>
    );
  }
  if (l.revisado) {
    // Revisado y coincide: la marca, y "Corregir" apagado. Para cambiarlo se
    // toca la fila, que lo carga en el panel con su conteo.
    return (
      <span className="inline-flex items-center gap-2">
        <Marca tono="sunmi-state-success sunmi-text-success">{TEXTO_COINCIDE}</Marca>
        <span className="text-sm2 sunmi-text-muted opacity-50">{TEXTO_CORREGIR}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      {corregir}
      <SunmiButton
        onClick={(e) => {
          e.stopPropagation();
          onCoincide(d);
        }}
        disabled={guardando}
        className={`shrink-0 min-h-0 px-3 py-1.5 text-sm2 ${CLASE_COINCIDE}`}
      >
        {TEXTO_COINCIDE}
      </SunmiButton>
    </span>
  );
}

// ── EL PANEL DEL PRODUCTO ─────────────────────────────────────────────────

function PanelDelProducto({ producto, puedeRecibir, guardando, quitandoId, onRevisar, onQuitarLinea, onGuardado, anterior, siguiente, onElegir, todoRevisado }) {
  if (!producto) {
    return (
      <SunmiCard className="p-4">
        <p className="text-sm2 sunmi-text-muted">
          {todoRevisado ? TEXTO_TODO_REVISADO : "Escaneá, buscá o elegí un producto de la lista."}
        </p>
      </SunmiCard>
    );
  }
  const l = lecturaDeLaLinea(producto);
  return (
    <SunmiCard className="p-5 space-y-3" data-panel-producto={producto.nombre}>
      <div>
        <h2 className="text-lg2 font-semibold sunmi-text-strong break-words">{producto.nombre}</h2>
        <p className="text-sm2 sunmi-text-muted">
          {producto.categoria?.nombre ? `${producto.categoria.nombre} · ` : ""}
          se cuenta por {nombreDePresentacion(l.mostrado)}
        </p>
      </div>

      {/* La MISMA hoja que el teléfono abre desde abajo, con `enHoja`: sin
          tarjeta propia —el panel ya es una— y con "y seguir" en el botón. */}
      <FichaProductoRecepcion
        key={firmaDeEdicion(producto)}
        producto={producto}
        puedeRecibir={puedeRecibir}
        guardando={guardando}
        onRevisar={onRevisar}
        onQuitar={onQuitarLinea}
        quitando={quitandoId === producto.id}
        enHoja
        onGuardado={onGuardado}
      />

      <div className="flex items-center justify-between gap-3 text-sm2">
        {anterior ? (
          <SunmiLinkButton onClick={() => onElegir(anterior)} className="text-sm2 no-underline">
            ‹ Anterior
          </SunmiLinkButton>
        ) : (
          <span />
        )}
        {siguiente ? (
          <SunmiLinkButton onClick={() => onElegir(siguiente)} className="min-w-0 truncate text-sm2 no-underline">
            Siguiente: {siguiente.nombre} ›
          </SunmiLinkButton>
        ) : null}
      </div>
    </SunmiCard>
  );
}

// ── LA COMPOSICIÓN ────────────────────────────────────────────────────────

export default function RecepcionEscritorio({
  item,
  resumen,
  categorias,
  visibles,
  /** El producto del panel: el elegido, o el primer pendiente. Lo decide el cerebro. */
  producto,
  filtro,
  categoriaId,
  texto,
  aviso,
  noFigura = false,
  puedeRecibir,
  guardando,
  quitandoId,
  catalogo = [],
  buscandoCatalogo = false,
  onAgregarDesdeCatalogo,
  onAbrirAgregar,
  accionAgregar,
  onFiltrar,
  onCategoria,
  onTexto,
  onTeclear,
  onVoz,
  onElegir,
  onSiguientePendiente,
  onRevisar,
  onQuitarLinea,
  onAbrirEscaner,
  confirmarRecepcion,
  confirmando = false,
  puedeCancelar = false,
  abrirPanelCancelar,
  panelCancelar = null,
  imprimirTicket,
  volver = null,
}) {
  const [masAcciones, setMasAcciones] = useState(false);
  const [errorDeFila, setErrorDeFila] = useState("");

  // Si se puede confirmar, y por qué no: la MISMA función que el teléfono.
  const cierre = cierreDeRecepcion({ items: item?.items, resumen });
  const { trabado, todoRevisado } = cierre;
  const bloqueo = motivoDelBloqueo(cierre);

  // El avance, contra el universo FÍSICO, igual que el teléfono: los no
  // declarados están resueltos por definición. Ver `RecepcionMovil`.
  const hechos = (resumen?.revisados ?? 0) + (resumen?.noDeclarados ?? 0);
  const total = resumen?.totalFisico ?? resumen?.totalRemito ?? 0;
  const pct = total > 0 ? Math.floor((hechos * 100) / total) : null;
  const pendientes = cierre.pendientes;

  const importeOriginal = item?.resumen?.importeOriginal ?? null;
  const importeCorregido = item?.resumen?.importeCorregido ?? null;
  const hayDiferenciaDeImporte =
    importeCorregido != null && item?.resumen?.diferenciaImporte != null && item.resumen.diferenciaImporte !== 0;

  const opcionesEstado = TABS.map((t) => ({ ...t, cantidad: CONTEO[t.clave](resumen || {}) }));

  // Anterior y siguiente, sobre lo que la tabla muestra.
  const i = producto ? visibles.findIndex((d) => d.id === producto.id) : -1;
  const anterior = i > 0 ? visibles[i - 1] : null;
  const siguiente = i >= 0 ? visibles[i + 1] || null : visibles.find((d) => d.id !== producto?.id) || null;

  const coincidir = async (d) => {
    setErrorDeFila("");
    const r = await onRevisar?.(cuerpoDeCoincide(d));
    if (r && r.ok === false) setErrorDeFila(r.error || "No se pudo guardar la revisión.");
  };

  const columnas = [
    { clave: "producto", titulo: "Producto", render: (d) => <CeldaProducto d={d} /> },
    { clave: "enviado", titulo: "Enviado", render: (d) => <CeldaEnviado l={lecturaDeLaLinea(d)} /> },
    { clave: "recibido", titulo: "Recibido", render: (d) => <CeldaRecibido l={lecturaDeLaLinea(d)} /> },
    { clave: "importe", titulo: "Importe", align: "der", render: (d) => <CeldaImporte l={lecturaDeLaLinea(d)} /> },
    {
      clave: "acciones",
      titulo: "",
      align: "der",
      render: (d) => (
        <CeldaAcciones
          d={d}
          l={lecturaDeLaLinea(d)}
          puedeRecibir={puedeRecibir}
          guardando={guardando}
          onCoincide={coincidir}
          onCorregir={onElegir}
        />
      ),
    },
  ].map((c) => ({ ...c, thClassName: "text-xs2 uppercase tracking-wider sunmi-text-muted" }));

  return (
    <div className="space-y-3" data-recepcion-escritorio>
      {/* ── 1 · LA TRANSFERENCIA ─────────────────────────────────────────── */}
      <SunmiCard className="px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg2 font-bold sunmi-text-strong">Transferencia #{item?.id}</h1>
            <EstadoTransferenciaBadge estado={item?.estado} />
          </div>
          <p className="text-sm2 sunmi-text-muted">
            {item?.origen?.nombre} → {item?.destino?.nombre}
            {item?.fechaEnvio ? ` · enviada ${fmtFechaHoraAR(item.fechaEnvio)}` : ""}
            {item?.creadaPor?.nombre ? ` por ${item.creadaPor.nombre}` : ""}
          </p>
        </div>

        <div className="w-72 space-y-1.5" data-avance-recepcion>
          <div className="flex items-baseline gap-3">
            <span className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums font-semibold sunmi-text-strong">
                {hechos} / {total}
              </span>{" "}
              revisados
            </span>
            <span className={`text-sm2 ${pendientes > 0 ? "sunmi-text-accent" : "sunmi-text-success"}`}>
              {pendientes > 0 ? plural(pendientes, "pendiente", "pendientes") : "Sin pendientes"}
            </span>
          </div>
          <SunmiBarraDeAvance pct={pct} />
        </div>

        {importeOriginal != null && (
          <div>
            <div className="text-sm2 sunmi-text-muted">Importe enviado</div>
            <div className="text-xl2 font-bold tabular-nums sunmi-text-strong">{formatearMoneda(importeOriginal)}</div>
            {hayDiferenciaDeImporte ? (
              <div className="text-xs2 tabular-nums sunmi-text-warning">
                Corregido {formatearMoneda(importeCorregido)}
              </div>
            ) : null}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <SunmiButton
            color="slate"
            onClick={() => setMasAcciones(true)}
            aria-label={TITULO_MAS_ACCIONES}
            aria-haspopup="dialog"
            className="shrink-0"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </SunmiButton>
          {volver}
          {puedeRecibir && (
            <div className="flex flex-col items-center gap-1">
              <SunmiButton
                color="amber"
                onClick={confirmarRecepcion}
                disabled={trabado || confirmando}
                className="shrink-0 justify-center"
              >
                {confirmando ? "Confirmando..." : "Confirmar recepción"}
              </SunmiButton>
              {bloqueo ? <span className="text-xs2 sunmi-text-muted">{bloqueo}</span> : null}
            </div>
          )}
        </div>
      </SunmiCard>

      {/* El panel de cancelación lo dibuja la página; acá solo aparece. */}
      {panelCancelar}

      {/* ── 2 · LAS HERRAMIENTAS ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <SunmiCampoBusquedaVoz
              value={texto}
              onChange={onTexto}
              onVoz={onVoz}
              onKeyDown={onTeclear}
              placeholder={PLACEHOLDER_BUSCADOR}
              ariaLabel="Buscar producto de esta transferencia"
            />
          </div>
          {puedeRecibir && hayEscanerDisponible() && (
            <SunmiButton color="slate" onClick={onAbrirEscaner} className="shrink-0">
              Escanear
            </SunmiButton>
          )}
        </div>
        {/* Los cuatro filtros de siempre, con su número y su comportamiento:
            la misma pieza que el teléfono, en fila en vez de 2×2. */}
        <SunmiFiltroEstado
          opciones={opcionesEstado}
          valor={filtro}
          onCambiar={onFiltrar}
          ariaLabel="Filtrar productos por estado"
          tamano="compacto"
        />
        <SunmiSelectAdv
          value={categoriaId == null ? "" : String(categoriaId)}
          onChange={(v) => onCategoria(v === "" ? null : v)}
          aria-label="Categoría"
          className="w-56 shrink-0"
        >
          {/* Los mismos textos y números que el desplegable del teléfono. */}
          <SunmiSelectOption value="">{`Todas · ${resumen?.totalFisico ?? resumen?.totalRemito ?? 0}`}</SunmiSelectOption>
          {categorias.map((c) => (
            <SunmiSelectOption key={c.id} value={String(c.id)}>
              {`${c.nombre} · ${c.cantidad}`}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </div>

      {/* ── EL CAMINO DE EXCEPCIÓN: NO FIGURA ───────────────────────────────
          Como en el teléfono: el aviso en una línea y, debajo, el catálogo del
          origen para tocarlo y agregarlo. Y el alta a mano, para lo que tampoco
          está en el catálogo. */}
      {(noFigura || aviso) && <SunmiAviso tono="warning">{noFigura ? MENSAJE_NO_FIGURA_CORTO : aviso}</SunmiAviso>}
      {noFigura && puedeRecibir && (
        <div className="space-y-1.5">
          <p className="text-sm2 font-semibold sunmi-text-muted">{ROTULO_CATALOGO}</p>
          {buscandoCatalogo && catalogo.length === 0 && (
            <p className="text-sm2 sunmi-text-muted">Buscando en el catálogo…</p>
          )}
          {!buscandoCatalogo && catalogo.length === 0 && (
            <p className="text-sm2 sunmi-text-muted">Tampoco está en el catálogo del origen.</p>
          )}
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {catalogo.map((p) => (
              <FilaCatalogoRecepcion key={p.productoLocalId} p={p} onElegir={onAgregarDesdeCatalogo} agregando={guardando} />
            ))}
          </div>
          <SunmiButton color="slate" onClick={onAbrirAgregar}>
            {accionAgregar}
          </SunmiButton>
        </div>
      )}

      {errorDeFila && <SunmiAviso tono="danger">{errorDeFila}</SunmiAviso>}

      {/* ── 3 · LA LISTA Y EL PRODUCTO ───────────────────────────────────── */}
      <div className="grid grid-cols-recepcionEscritorio items-start gap-4">
        <div className="min-w-0 overflow-hidden rounded-xl2 border sunmi-border sunmi-bg-card">
          <SunmiTable
            columnas={columnas}
            filas={visibles}
            claveFila={(d) => firmaDeEdicion(d)}
            densidad="comoda"
            vacio={noFigura ? "" : "No hay productos que coincidan con este filtro."}
            onClickFila={(d) => onElegir(d)}
            filaSeleccionada={(d) => d.id === producto?.id}
            // La elegida: fondo suave (el `selected` de la fila del kit) y el
            // borde izquierdo en el color de acción. Las demás llevan el mismo
            // ancho de borde en el color de siempre, para que elegir una fila no
            // corra su contenido.
            claseFila={(d) =>
              d.id === producto?.id ? "text-sm3 border-l-2 sunmi-border-accent" : "text-sm3 border-l-2 sunmi-border"
            }
            className="text-sm3"
          />
        </div>
        <div className="sticky top-3">
          <PanelDelProducto
            producto={producto}
            puedeRecibir={puedeRecibir}
            guardando={guardando}
            quitandoId={quitandoId}
            onRevisar={onRevisar}
            onQuitarLinea={onQuitarLinea}
            onGuardado={() => onSiguientePendiente?.(producto)}
            anterior={anterior}
            siguiente={siguiente}
            onElegir={onElegir}
            todoRevisado={todoRevisado}
          />
        </div>
      </div>

      <MasAccionesRecepcion
        abierto={masAcciones}
        onCerrar={() => setMasAcciones(false)}
        item={item}
        puedeRecibir={puedeRecibir}
        puedeCancelar={puedeCancelar}
        abrirPanelCancelar={abrirPanelCancelar}
        imprimirTicket={imprimirTicket}
        onAbrirEscaner={onAbrirEscaner}
        forma="centrado"
      />
    </div>
  );
}

/**
 * El siguiente pendiente DESPUÉS de `actual` en la lista que se ve, o el
 * primero si no hay ninguno después. Lo usa el cerebro al guardar.
 */
export function siguientePendiente(visibles = [], actual = null) {
  const pendientes = visibles.filter((d) => pasaFiltro(d, FILTRO.PENDIENTES) && d.id !== actual?.id);
  if (!actual) return pendientes[0] || null;
  const i = visibles.findIndex((d) => d.id === actual.id);
  return pendientes.find((d) => visibles.indexOf(d) > i) || pendientes[0] || null;
}
