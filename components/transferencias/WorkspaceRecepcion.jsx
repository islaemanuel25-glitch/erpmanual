"use client";

// EL PUESTO DE TRABAJO DE LA RECEPCIÓN.
//
// ── QUÉ RESUELVE ─────────────────────────────────────────────────────────
//
// Con 150 productos, recorrer el remito en su orden no es una forma de trabajar.
// El operador tiene la mercadería en la mano: escanea o busca, cuenta, marca
// revisado, y sigue. Que "9 de Oro" sea el producto 20 o el 140 del remito no le
// importa a nadie.
//
// ── UNA SOLA LÓGICA, DOS COMPOSICIONES ────────────────────────────────────
//
// Móvil y escritorio comparten TODO lo que decide: el resumen, los filtros, la
// búsqueda, el estado por producto, la ficha y los endpoints. Lo único distinto
// es cómo se acomodan: en el teléfono la ficha reemplaza al listado —no hay
// espacio para los dos—, en escritorio van lado a lado.
//
// No hay una tabla de 150 filas como herramienta principal en ninguno de los
// dos: la herramienta es el buscador.
//
// ── UN SOLO BUSCADOR VISIBLE ──────────────────────────────────────────────
//
// Busca PRIMERO adentro de esta transferencia, que es donde está el 99% de lo
// que va a aparecer. Recién cuando el producto no figura se ofrece el catálogo
// del origen, y ese es un camino de excepción con su propio panel. Dos
// buscadores a la vez obligarían a elegir en cuál escribir antes de saber cuál
// corresponde.
//
// Y como son ~150 productos ya cargados, la búsqueda no consulta al servidor por
// cada tecla: se resuelve local.

import { useMemo, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiChipsFiltro from "@/components/sunmi/SunmiChipsFiltro";
import SunmiSelectorUnidad from "@/components/sunmi/SunmiSelectorUnidad";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiEscanerCodigoBarra, {
  MENSAJES_SIN_CAMARA,
  hayEscanerDisponible,
} from "@/components/sunmi/SunmiEscanerCodigoBarra";

import ResumenControlFisico from "./ResumenControlFisico";
import RecepcionMovil from "./RecepcionMovil";
import FichaProductoRecepcion, { TEXTO_ESTADO, presentacionDelEnvio } from "./FichaProductoRecepcion";
import AgregarProductoRecibido, { ACCION_AGREGAR } from "./AgregarProductoRecibido";
import { SectionHead, fmtCantidad } from "./detallePresentacion";
import {
  ESTADO_PRODUCTO,
  FILTRO,
  RESOLUCION,
  categoriasDelRemito,
  estadoDeProducto,
  productosVisibles,
  resolverEntrada,
  resumenDeRecepcion,
} from "@/lib/transferencias/controlFisico";

/** Los tabs del remito. "No declarados" se llega por su card, no por acá. */
const TABS = [
  { clave: FILTRO.PENDIENTES, texto: "Pendientes" },
  { clave: FILTRO.DIFERENCIAS, texto: "Diferencias" },
  { clave: FILTRO.REVISADOS, texto: "Revisados" },
  { clave: FILTRO.TODOS, texto: "Todos" },
];

export const MENSAJE_NO_FIGURA = "Este producto no figura en esta transferencia.";

/** Una fila del listado. Se toca entera para abrir la ficha. */
export function FilaProducto({ d, activa, onElegir }) {
  const estado = estadoDeProducto(d);
  return (
    <SunmiActionCard
      onClick={() => onElegir(d)}
      aria-pressed={activa}
      className={activa ? "sunmi-state-success" : ""}
    >
      <span className="flex items-start justify-between gap-2 w-full">
        <span className="min-w-0 font-semibold sunmi-text-strong break-words">{d.nombre}</span>
        {/* El estado con TEXTO. No se depende del color. */}
        <span className="text-sm2 sunmi-text-muted shrink-0">{TEXTO_ESTADO[estado]}</span>
      </span>
      <span className="text-sm2 sunmi-text-muted">
        {d.agregadoEnRecepcion
          ? `Recibido ${fmtCantidad(d.cantidadRecibida ?? 0)} ${presentacionDelEnvio(d)}`
          : `Enviado ${fmtCantidad(d.cantidadEnviada)} ${presentacionDelEnvio(d)}`}
        {d.categoria?.nombre ? ` · ${d.categoria.nombre}` : ""}
      </span>
    </SunmiActionCard>
  );
}

export default function WorkspaceRecepcion({
  item,
  puedeRecibir,
  onRevisar,
  onAgregar,
  onQuitarLinea,
  guardando = false,
  quitandoId = null,
  // ── LO ADMINISTRATIVO, QUE EN EL TELÉFONO VIVE ADENTRO DE ESTA PANTALLA ──
  //
  // En escritorio, confirmar, los PDF y la cancelación los dibuja
  // `AccionesRecepcion` arriba de todo y esta pieza ni se entera. En el teléfono
  // esa card desaparece del flujo físico —ver `RecepcionMovil`— así que las
  // acciones tienen que llegar hasta acá para poder acomodarse: confirmar como
  // CTA al pie, el resto detrás de "⋯".
  //
  // Son las MISMAS funciones que recibe `AccionesRecepcion`, pasadas por la
  // página. No hay una segunda versión de ninguna: si las hubiera, el botón del
  // teléfono y el de la computadora podrían dejar de hacer lo mismo.
  confirmarRecepcion = null,
  confirmando = false,
  puedeCancelar = false,
  abrirPanelCancelar = null,
  panelCancelar = null,
  imprimirTicket = null,
}) {
  const items = item?.items || [];

  const [filtro, setFiltro] = useState(FILTRO.PENDIENTES);
  const [categoriaId, setCategoriaId] = useState(null);
  const [texto, setTexto] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [escaneando, setEscaneando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [agregarAbierto, setAgregarAbierto] = useState(false);
  const dictado = useRef(false);

  const resumen = useMemo(() => resumenDeRecepcion(items), [items]);
  const categorias = useMemo(() => categoriasDelRemito(items), [items]);
  const visibles = useMemo(
    () => productosVisibles(items, { filtro, categoriaId, texto }),
    [items, filtro, categoriaId, texto]
  );

  const seleccionado = items.find((d) => d.id === seleccionadoId) || null;

  /** Deja el producto a la vista y limpia lo que estorbaría para verlo. */
  const elegir = (d) => {
    setSeleccionadoId(d.id);
    setAviso("");
  };

  /**
   * Lo que hace un código leído o un texto tecleado con Enter.
   *
   * Qué corresponde en cada caso lo decide `resolverEntrada`, que está en el
   * módulo puro con su cascada escrita y sus candados. Acá solo se aplica:
   *
   *   ABRIR      → se abre la ficha. Si el producto YA estaba —incluido uno
   *                agregado antes— se abre el suyo, no se agrega otro.
   *   LISTA      → hay varios y **no se elige por el operador**. El texto queda
   *                puesto, así que el listado ya los está mostrando filtrados.
   *   NO_FIGURA  → recién acá el aviso, que es lo que habilita el catálogo.
   */
  const resolver = (entrada, opciones) => {
    const r = resolverEntrada(items, entrada, opciones);

    if (r.tipo === RESOLUCION.ABRIR) {
      elegir(r.producto);
      // El campo se limpia solo cuando lo que entró era un CÓDIGO: el operador
      // va a escanear muchos seguidos y el siguiente tiene que caer en un campo
      // vacío. Si escribió "Fanta", el texto queda: es el contexto de lo que
      // buscó, y borrárselo le devuelve la lista entera sin haberlo pedido.
      if (r.porCodigo) setTexto("");
      return r;
    }

    if (r.tipo === RESOLUCION.NO_FIGURA) {
      setAviso(MENSAJE_NO_FIGURA);
      setTexto(String(entrada || "").trim());
      return r;
    }

    // Varios resultados: el texto ya filtra el listado y no hay nada que avisar.
    // Decir "no figura" acá sería falso y ofrecería informar como no declarado un
    // producto que está en pantalla.
    setAviso("");
    return r;
  };

  const alEscanear = (codigo) => {
    setEscaneando(false);
    // La cámara devuelve un CÓDIGO. Sin fallback por nombre: un código que no
    // está en el remito es "no figura", y buscarlo como texto abriría cualquier
    // producto cuyo nombre contenga esos dígitos.
    resolver(codigo, { soloCodigo: true });
  };

  const alTeclear = (e) => {
    // Un lector físico escribe el código y manda Enter, y una persona escribe un
    // nombre y manda Enter. Los dos entran por acá: la cascada distingue cuál fue
    // sin obligar a nadie a declararlo.
    if (e.key === "Enter" && texto.trim()) {
      e.preventDefault();
      resolver(texto.trim());
    }
  };

  const listado = (
    <div className="space-y-1.5">
      {visibles.length === 0 && (
        <p className="text-center py-6 sunmi-text-muted text-sm2">
          No hay productos que coincidan con este filtro.
        </p>
      )}
      {visibles.map((d) => (
        <FilaProducto key={d.id} d={d} activa={d.id === seleccionadoId} onElegir={elegir} />
      ))}
    </div>
  );

  const ficha = seleccionado ? (
    <FichaProductoRecepcion
      // `key` con el id: cambiar de producto REMONTA la ficha, y su estado nace
      // del producto nuevo. Sin esto haría falta un efecto que sincronice, y ese
      // efecto deja el primer pintado con los campos vacíos.
      key={seleccionado.id}
      producto={seleccionado}
      puedeRecibir={puedeRecibir}
      guardando={guardando}
      onRevisar={onRevisar}
      onQuitar={onQuitarLinea}
      quitando={quitandoId === seleccionado.id}
    />
  ) : (
    <SunmiCard className="p-3">
      <p className="text-sm2 sunmi-text-muted">
        Escaneá o buscá el producto que tenés en la mano, o elegí uno de la lista.
      </p>
    </SunmiCard>
  );

  return (
    <section className="space-y-3">
      {/* ══ TELÉFONO ═══════════════════════════════════════════════════════
          La composición V2. Recibe el estado y los handlers de acá: no tiene
          filtro propio, ni búsqueda propia, ni "revisar" propio. El corte es
          `md`, el MISMO que usa el shell para su fila de título con acción —ver
          `LayoutBase`—, así que o manda el encabezado del shell o manda el de la
          página, nunca los dos ni ninguno. */}
      <div className="md:hidden">
        <RecepcionMovil
          item={item}
          resumen={resumen}
          categorias={categorias}
          visibles={visibles}
          seleccionado={seleccionado}
          filtro={filtro}
          categoriaId={categoriaId}
          texto={texto}
          aviso={aviso}
          puedeRecibir={puedeRecibir}
          guardando={guardando}
          quitandoId={quitandoId}
          onFiltrar={setFiltro}
          onCategoria={setCategoriaId}
          onTexto={(v) => {
            setTexto(v);
            setAviso("");
          }}
          onTeclear={alTeclear}
          onVoz={(t) => {
            dictado.current = true;
            setTexto(t);
          }}
          onElegir={elegir}
          onCerrarProducto={() => setSeleccionadoId(null)}
          onRevisar={onRevisar}
          onQuitarLinea={onQuitarLinea}
          onAbrirEscaner={() => setEscaneando(true)}
          onAbrirAgregar={() => setAgregarAbierto(true)}
          accionAgregar={ACCION_AGREGAR}
          mensajeNoFigura={MENSAJE_NO_FIGURA}
          FilaProducto={FilaProducto}
          confirmarRecepcion={confirmarRecepcion}
          confirmando={confirmando}
          puedeCancelar={puedeCancelar}
          abrirPanelCancelar={abrirPanelCancelar}
          panelCancelar={panelCancelar}
          imprimirTicket={imprimirTicket}
        />
      </div>

      {/* ══ ESCRITORIO ═════════════════════════════════════════════════════
          Lo que había, sin tocar. El corte `md` deja todo lo de 768 px para
          arriba exactamente como estaba, incluido su propio corte interno en
          `lg` entre la lista apilada y las dos columnas. */}
      <div className="hidden md:block space-y-3">
      <SectionHead
        title="Control de recepción"
        subtitle={`${resumen.revisados} de ${resumen.totalRemito} productos revisados`}
      />

      <ResumenControlFisico resumen={resumen} filtro={filtro} onFiltrar={setFiltro} />

      {/* ── EL BUSCADOR, UNO SOLO ────────────────────────────────────────── */}
      <SunmiCard className="p-3 space-y-2">
        <SunmiCampoBusquedaVoz
          value={texto}
          onChange={(v) => {
            setTexto(v);
            setAviso("");
          }}
          onVoz={(t) => {
            dictado.current = true;
            setTexto(t);
          }}
          onKeyDown={alTeclear}
          placeholder="Escaneá, o buscá por nombre o código…"
          ariaLabel="Buscar producto de esta transferencia"
        />

        <div className="flex flex-wrap gap-2">
          {hayEscanerDisponible() && (
            <SunmiButton color="amber" onClick={() => setEscaneando(true)}>
              Escanear código
            </SunmiButton>
          )}
        </div>

        {/* ── EL CATÁLOGO DEL ORIGEN ES UN CAMINO DE EXCEPCIÓN ─────────────
            Antes este botón estaba SIEMPRE, y eso contradice el flujo: lo normal
            es que el producto esté en el remito, y ofrecer permanentemente el
            atajo para "informar algo que no figura" invita a usarlo antes de
            haber buscado — con el resultado de una línea agregada al lado de la
            del remito, para el mismo producto.

            Aparece solo cuando la búsqueda YA falló, que es cuando significa
            algo. Y aparece pegado al mensaje que explica por qué. */}
        {aviso && (
          <SunmiAviso tono="warning">
            {aviso}
            {aviso === MENSAJE_NO_FIGURA && puedeRecibir && (
              <>
                {" "}
                Si igual llegó, informalo como producto no declarado.
              </>
            )}
          </SunmiAviso>
        )}

        {aviso === MENSAJE_NO_FIGURA && puedeRecibir && (
          <SunmiButton color="slate" onClick={() => setAgregarAbierto(true)}>
            {ACCION_AGREGAR}
          </SunmiButton>
        )}
      </SunmiCard>

      {/* ── FILTROS ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <SunmiSelectorUnidad
          rotulo="Ver"
          valor={TABS.some((t) => t.clave === filtro) ? filtro : null}
          opciones={TABS}
          onCambiar={setFiltro}
          nota={null}
        />
        <SunmiChipsFiltro
          rotulo="Categoría"
          opciones={categorias.map((c) => ({ clave: c.id, texto: c.nombre, cantidad: c.cantidad }))}
          valor={categoriaId}
          onCambiar={setCategoriaId}
        />
      </div>

      {/* ── LISTADO Y FICHA ──────────────────────────────────────────────────
          Teléfono: la ficha REEMPLAZA al listado mientras hay un producto
          elegido. No hay lugar para los dos, y partir la pantalla dejaría los
          dos inutilizables.
          Escritorio: lado a lado, que es lo que el ancho permite. */}
      <div className="lg:hidden space-y-2">
        {seleccionado ? (
          <>
            <SunmiButton color="slate" onClick={() => setSeleccionadoId(null)}>
              ← Volver al listado
            </SunmiButton>
            {ficha}
          </>
        ) : (
          listado
        )}
      </div>

      {/* `lg:grid-cols-2`, no un valor arbitrario. Decía
          `lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]` para que las dos columnas
          pudieran ENCOGERSE —sin el `minmax(0,…)` una columna con contenido
          largo desborda la grilla—, sin saber que la primitiva de Tailwind ya
          hace exactamente eso: `grid-cols-2` genera
          `repeat(2, minmax(0, 1fr))`, comprobado contra la escala del proyecto,
          que no la redefine. Misma CSS, cero píxeles de diferencia, y un valor
          arbitrario menos. */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-3 items-start">
        <div>{listado}</div>
        <div className="lg:sticky lg:top-3">{ficha}</div>
      </div>
      </div>
      {/* ══ FIN DEL ESCRITORIO ═════════════════════════════════════════════ */}

      {/* Los dos modales son COMPARTIDOS: el escáner y el alta de un producto no
          declarado se abren desde cualquiera de las dos composiciones y no hay
          motivo para tener dos. Se montan por portal, así que dónde estén
          escritos no cambia dónde se dibujan. */}
      <SunmiEscanerCodigoBarra
        abierto={escaneando}
        onCerrar={() => setEscaneando(false)}
        onCodigo={alEscanear}
        onSinCamara={(motivo) => {
          setEscaneando(false);
          setAviso(MENSAJES_SIN_CAMARA[motivo]);
        }}
        ayuda="Apuntá al código de barras del producto que tenés en la mano."
      />

      {puedeRecibir && (
        <AgregarProductoRecibido
          abierto={agregarAbierto}
          transferenciaId={item.id}
          onCerrar={() => setAgregarAbierto(false)}
          onAgregar={onAgregar}
        />
      )}
    </section>
  );
}
