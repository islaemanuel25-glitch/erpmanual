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

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

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
import FichaProductoRecepcion, { TEXTO_ESTADO } from "./FichaProductoRecepcion";
import {
  descriptorDeEnvio,
  firmaDeEdicion,
  rotuloConSueltas,
  rotuloDeEnvio,
} from "@/lib/transferencias/presentacionEnvio";
import AgregarProductoRecibido, { ACCION_AGREGAR } from "./AgregarProductoRecibido";
import { SectionHead } from "./detallePresentacion";
import {
  ESTADO_PRODUCTO,
  FILTRO,
  RESOLUCION,
  categoriasDelRemito,
  estadoDeProducto,
  faltaEnLaTransferencia,
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
  const envio = descriptorDeEnvio(d);

  // ── REVISADO Y RESULTADO SON DOS DIMENSIONES ────────────────────────────
  //
  // "Revisado" dice que ALGUIEN TERMINÓ DE CONTAR este producto. No dice que
  // esté correcto: un faltante revisado sigue siendo un faltante. Por eso van
  // en dos renglones y no en uno — "✓ Revisado" arriba, "Faltante" abajo—, y
  // por eso el verde es del CHECK y no de la tarjeta.
  //
  // Pintar la tarjeta entera diría "esto está bien", que es otra cosa.
  const revisado = d.revisadoEnRecepcion === true && !d.agregadoEnRecepcion;

  return (
    <SunmiActionCard
      onClick={() => onElegir(d)}
      aria-pressed={activa}
      // El id en el DOM: es lo que deja llevar la vista hasta la línea recién
      // agregada sin tener que reenviar un ref por el kit. `SunmiActionCard`
      // vuelca sus props sobre el `<button>`, así que no hace falta tocarlo.
      data-detalle-id={d.id}
      className={activa ? "sunmi-state-success" : ""}
    >
      <span className="flex items-start justify-between gap-2 w-full">
        <span className="min-w-0 font-semibold sunmi-text-strong break-words">{d.nombre}</span>
        {revisado ? (
          // El verde sale del token semántico del tema —`sunmi-text-success`—,
          // el mismo que ya usan los estados. Nada de hex ni de `green-500`.
          <span className="text-sm2 font-semibold sunmi-text-success shrink-0 inline-flex items-center gap-1">
            <Check size={14} aria-hidden="true" />
            Revisado
          </span>
        ) : (
          // ── "NO DECLARADO" NO ES "PENDIENTE" ────────────────────────────
          //
          // Esta rama pintaba TODO lo no revisado con el mismo gris apagado, y
          // con eso un producto que llegó sin estar en el remito se veía igual
          // que uno que todavía nadie contó. Son dos cosas distintas: una es un
          // paso que falta, la otra es una inconsistencia física que alguien
          // informó.
          //
          // El tono sale del MISMO mapa que usa el resultado de un producto
          // revisado —`TONO_ESTADO_FILA`, con los tokens semánticos del tema— y
          // el pendiente cae en el `muted` de siempre por el fallback. Nada de
          // hex ni de la paleta cruda de Tailwind.
          <span className={`text-sm2 shrink-0 ${TONO_ESTADO_FILA[estado] || "sunmi-text-muted"}`}>
            {TEXTO_ESTADO[estado]}
          </span>
        )}
      </span>
      <span className="text-sm2 sunmi-text-muted">
        {/* La presentación con la que salió del origen, no las unidades
            físicas: "6 CAJÓN x8" y no "48 UNIDAD". */}
        {d.agregadoEnRecepcion
          ? // Un no declarado se cuenta igual que cualquier otro, bultos
            // completos y sueltas incluidas: "Recibido 2 PACK x6 + 1 unidad
            // suelta". Decir solo "2 PACK x6" perdería la suelta en la única
            // línea que no tiene un remito contra el cual contrastarla.
            `Recibido ${rotuloConSueltas({
              ...envio,
              cantidad: d.cantidadRecibida ?? 0,
              sueltas: d.recibidoUnidadesSueltas ?? 0,
            })}`
          : `Enviado ${rotuloDeEnvio(envio)}`}
        {d.categoria?.nombre ? ` · ${d.categoria.nombre}` : ""}
      </span>
      {/* El RESULTADO, en su propio renglón y solo cuando ya se revisó: es la
          otra dimensión, y mezclarla con "Revisado" borraría la diferencia. */}
      {revisado && (
        <span className={`text-sm2 ${TONO_ESTADO_FILA[estado] || "sunmi-text-muted"}`}>
          {TEXTO_ESTADO[estado]}
        </span>
      )}
    </SunmiActionCard>
  );
}

/** El tono del RESULTADO. El verde de "Revisado" es otra cosa y va aparte. */
const TONO_ESTADO_FILA = Object.freeze({
  [ESTADO_PRODUCTO.CORRECTO]: "sunmi-text-success",
  [ESTADO_PRODUCTO.FALTANTE]: "sunmi-text-danger",
  [ESTADO_PRODUCTO.SOBRANTE]: "sunmi-text-warning",
  // ── "NO DECLARADO" ES UNA ADVERTENCIA, NO UN ENLACE ──────────────────
  //
  // Estaba en `sunmi-text-link`, el azul de los enlaces. Semanticamente es lo
  // que no es: nadie navega a ningun lado desde ahi, y visualmente competia con
  // los links de verdad de la pantalla.
  //
  // Un producto que llego sin estar en el remito es una INCONSISTENCIA FISICA
  // que alguien informo, y esa es la misma familia que el sobrante — por eso
  // comparte su token. `sunmi-text-warning` sale de `var(--pos-warning)` y lo
  // resuelve el tema: aca no hay hex.
  [ESTADO_PRODUCTO.NO_DECLARADO]: "sunmi-text-warning",
});

export default function WorkspaceRecepcion({
  item,
  puedeRecibir,
  onRevisar,
  onAgregar,
  onQuitarLinea,
  /** Adoptar la presentación actual sobre una línea histórica. Ver la ficha. */
  onAdoptarPresentacion,
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

  // ── "NO FIGURA" SE DECIDE MIENTRAS SE ESCRIBE, Y CONTRA TODO EL REMITO ──
  //
  // Antes esto dependía de tocar Enter: hasta entonces la pantalla decía "No hay
  // productos que coincidan con este filtro" y el camino para informar lo que
  // llegó de más quedaba escondido detrás de una tecla que nadie sabía que había
  // que apretar.
  //
  // Y la pregunta se le hace a `items` ENTERO, nunca a `visibles`. Un producto
  // que está en la transferencia pero tapado por el filtro de estado o por un
  // chip de categoría NO es un producto ausente: ofrecer informarlo como no
  // declarado ahí es el camino directo a una segunda línea del mismo producto.
  // La distinción vive en `faltaEnLaTransferencia`, con su nombre de parámetro
  // diciendo qué lista espera.
  //
  // `items.length > 0` guarda el caso de la pantalla todavía sin cargar: sin
  // líneas, todo texto "no figura" y el CTA aparecería sobre una transferencia
  // que ni siquiera llegó.
  const noFigura = useMemo(
    () => items.length > 0 && faltaEnLaTransferencia(items, texto),
    [items, texto]
  );

  /** Deja el producto a la vista y limpia lo que estorbaría para verlo. */
  const elegir = (d) => {
    setSeleccionadoId(d.id);
    setAviso("");
  };

  // ── AGREGAR ALGO Y VERLO DESAPARECER ES EL PEOR FINAL POSIBLE ───────────
  //
  // El operador informa un producto que llegó de más y la pantalla lo manda a
  // una lista que no está mirando. Antes ni siquiera existía una: "Todos" dejaba
  // los agregados afuera.
  //
  // Ahora "Todos" los incluye, y además la vista se acomoda para que se vea: se
  // pasa a "Todos", se sueltan los dos filtros que podrían taparlo —el chip de
  // categoría, porque la categoría de un agregado no es un chip del remito; y el
  // texto buscado, que es justamente el que no encontró nada— y se lleva el
  // scroll hasta la card.
  //
  // Lo que NO se hace es abrirle la ficha: en el teléfono la ficha REEMPLAZA al
  // listado, así que "dejarlo visible" terminaría escondiendo la lista entera.
  // Se lo muestra en su lugar, entre los demás.
  const [porMostrarId, setPorMostrarId] = useState(null);

  const agregarYMostrar = async (cuerpo) => {
    const json = await onAgregar?.(cuerpo);
    if (json?.ok && !json.yaExistia && json.detalleId != null) {
      setFiltro(FILTRO.TODOS);
      setCategoriaId(null);
      setTexto("");
      setAviso("");
      setPorMostrarId(json.detalleId);
    }
    return json;
  };

  // El scroll va en un efecto y no adentro del handler porque la línea todavía
  // no existe en el DOM cuando el POST vuelve: la trae la recarga del padre.
  useEffect(() => {
    if (porMostrarId == null) return;
    if (!items.some((d) => d.id === porMostrarId)) return;
    const el = document.querySelector(`[data-detalle-id="${porMostrarId}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    setPorMostrarId(null);
  }, [porMostrarId, items]);

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
   *   NO_FIGURA  → deja el texto puesto. El aviso y el catálogo YA NO salen de
   *                acá: los deriva `noFigura` mientras se escribe. Esto sigue
   *                existiendo para la CÁMARA, que necesita dejar el código leído
   *                en el campo para que la derivación tenga qué mirar.
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
      setTexto(String(entrada || "").trim());
      setAviso("");
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
      {/* ── DOS VACÍOS QUE SIGNIFICAN COSAS DISTINTAS ─────────────────
          Una lista vacía porque el FILTRO tapó lo que hay no es lo mismo que
          una lista vacía porque el producto NO ESTÁ. Cuando `noFigura` ya lo
          dijo arriba —y ofreció el camino de salida— repetir "no coincide con
          este filtro" manda a mirar el filtro, que es justo la confusión que
          esta tanda vino a sacar. */}
      {visibles.length === 0 && !noFigura && (
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
      // ── LA IDENTIDAD INCLUYE LA ESCALA, NO SOLO EL ID ──────────────
      // Adoptar la presentación actual cambia en qué se cuenta esta línea
      // SIN cambiarle el id. Con `key={seleccionado.id}` React conservaba el
      // estado: el rótulo pasaba a "5 CAJÓN x8" y el campo seguía diciendo
      // 40. Ver `firmaDeEdicion`.
      key={firmaDeEdicion(seleccionado)}
      producto={seleccionado}
      puedeRecibir={puedeRecibir}
      guardando={guardando}
      onRevisar={onRevisar}
      onAdoptarPresentacion={onAdoptarPresentacion}
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
          noFigura={noFigura}
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
          onAdoptarPresentacion={onAdoptarPresentacion}
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

      {/* ── EL CATÁLOGO DEL ORIGEN ES UN CAMINO DE EXCEPCIÓN ─────────────
          Antes este botón estaba SIEMPRE, y eso contradice el flujo: lo normal
          es que el producto esté en el remito, y ofrecer permanentemente el
          atajo para "informar algo que no figura" invita a usarlo antes de
          haber buscado — con el resultado de una línea agregada al lado de la
          del remito, para el mismo producto.

          Aparece solo cuando la búsqueda YA falló, que es cuando significa
          algo. Y aparece pegado al mensaje que explica por qué.

          ── Y DESPUÉS DE LOS FILTROS, NO PEGADO AL BUSCADOR ─────────────
          Estaba adentro de la card de búsqueda, así que empujaba los filtros
          hacia abajo cada vez que una búsqueda no encontraba algo. El orden
          aprobado pone primero las herramientas de siempre y el camino de
          excepción al final: es lo que pasa poco. */}
      {(noFigura || aviso) && (
        <SunmiAviso tono="warning">
          {noFigura ? MENSAJE_NO_FIGURA : aviso}
          {noFigura && puedeRecibir && (
            <>
              {" "}
              Si igual llegó, informalo como producto no declarado.
            </>
          )}
        </SunmiAviso>
      )}

      {noFigura && puedeRecibir && (
        <SunmiButton color="slate" onClick={() => setAgregarAbierto(true)}>
          {ACCION_AGREGAR}
        </SunmiButton>
      )}

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
          onAgregar={agregarYMostrar}
        />
      )}
    </section>
  );
}
