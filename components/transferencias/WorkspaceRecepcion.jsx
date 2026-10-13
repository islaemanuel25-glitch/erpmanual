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

import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiEscanerCodigoBarra, { MENSAJES_SIN_CAMARA } from "@/components/sunmi/SunmiEscanerCodigoBarra";

import RecepcionMovil from "./RecepcionMovil";
import RecepcionEscritorio, { siguientePendiente } from "./RecepcionEscritorio";
import { TEXTO_ESTADO } from "./FichaProductoRecepcion";
import { descriptorDeEnvio, rotuloConSueltas, rotuloDeEnvio } from "@/lib/transferencias/presentacionEnvio";
import AgregarProductoRecibido, { ACCION_AGREGAR } from "./AgregarProductoRecibido";
// Las MISMAS funciones que usa el modal para decidir la unidad y armar el
// cuerpo. Con dos armadores, el día que el contrato cambie uno de los dos manda
// un pedido que el servidor rechaza.
import { unidadDeProductoNuevo, validarLineaNueva } from "@/lib/transferencias/recepcionUI";
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

/**
 * Quién abrió la cámara. El escáner es un modal compartido: lo que lee va a la
 * composición que lo pidió —la hoja del teléfono o el panel de la computadora—.
 * El teléfono lo abre con `true`, como siempre.
 */
const ESCANER_ESCRITORIO = "escritorio";

export const MENSAJE_NO_FIGURA = "Este producto no figura en esta transferencia.";

/**
 * Una fila del listado. Se toca entera para abrir la ficha.
 *
 * ── ESTA FILA YA NO LA DIBUJA EL TELÉFONO ────────────────────────────────
 *
 * Hasta el V15 la compartían las dos superficies y tenía una prop `conImporte`
 * para que el móvil mostrara la fila de dinero y escritorio no. El V15 le dio al
 * teléfono una tarjeta propia —`TarjetaRecepcionMovil`, con contador, botón y
 * chips adentro—, así que nadie pedía ya ese importe: la prop quedó en código
 * muerto, con doce candados defendiendo una rama que no se renderizaba en
 * ninguna pantalla.
 *
 * Se sacó en vez de dejarla. Una defensa inalcanzable es peor que no tenerla:
 * se lee como cubierta y no cubre nada, que es el caso que CLAUDE.md ya tiene
 * anotado dos veces. Escritorio queda idéntico —esa rama nunca se dibujaba acá—
 * y la fila de dinero vive ahora donde se ve, en la tarjeta del teléfono.
 */
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
  /** El Volver de la página: en la computadora va en la franja de arriba. */
  volver = null,
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

  // ── EN EL TELÉFONO, LO NO DECLARADO VA AL TOPE ──────────────────────────
  //
  // `productosVisibles` ordena los revisados primero y después por id, así que
  // una línea recién informada —no revisada y con el id más alto— cae ÚLTIMA.
  // En escritorio eso no molesta: la lista y la ficha están lado a lado. En el
  // teléfono, con 77 líneas, el operador informa un producto que llegó de más y
  // lo ve desaparecer al fondo del scroll.
  //
  // El reordenamiento vive ACÁ y no en `productosVisibles` porque esa función
  // la comparten las dos superficies y moverla cambiaría el orden de escritorio,
  // que esta tanda no toca. Es una copia ESTABLE —`sort` sobre una copia, sin
  // tocar el array de arriba— y solo cambia el orden, nunca el contenido: los
  // dos listados muestran exactamente los mismos productos.
  const visiblesMovil = useMemo(() => {
    const agregada = (d) => (d.agregadoEnRecepcion === true ? 0 : 1);
    return [...visibles].sort((a, b) => agregada(a) - agregada(b));
  }, [visibles]);

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

  // ══════════════════════════════════════════════════════════════════════
  // EL CATÁLOGO DEL ORIGEN, SIN MODAL (V16)
  //
  // ── QUÉ RESUELVE ────────────────────────────────────────────────────
  //
  // Informar un producto que llegó sin estar en el remito eran DOS búsquedas
  // para lo mismo: se escribía acá, la pantalla avisaba que no figuraba, se
  // tocaba un botón, se abría un modal, y HABÍA QUE VOLVER A ESCRIBIR lo
  // mismo. Con la mercadería en la mano eso es tipear dos veces para informar
  // una caja.
  //
  // Ahora el mismo texto que ya se escribió busca también en el catálogo del
  // origen, y los resultados bajan a la composición móvil como filas de la
  // misma lista.
  //
  // ── Y VIVE ACÁ, NO EN `RecepcionMovil` ──────────────────────────────
  //
  // Porque esa pieza es presentación: no tiene estado de negocio, no llama a
  // ningún endpoint y hay candados que lo exigen —cero `fetch(`, cero
  // `useMemo(` y exactamente dos `useState`—. El cerebro es este archivo, que
  // ya es el único que habla con el servidor.
  //
  // El modal sigue existiendo para ESCRITORIO: allá la lista y la ficha van
  // lado a lado y el panel no estorba. Una sola fila para los dos —
  // `FilaCatalogoRecepcion`— para que no puedan decir cosas distintas.
  const [catalogo, setCatalogo] = useState([]);
  const [buscandoCatalogo, setBuscandoCatalogo] = useState(false);

  // Solo se consulta cuando el producto NO figura en la transferencia. Buscar
  // el catálogo en cada tecla sería pedirle al servidor 150 veces algo que el
  // 99 % de las veces ya está en la lista de arriba.
  useEffect(() => {
    if (!noFigura || !puedeRecibir || !item?.id) {
      setCatalogo([]);
      return undefined;
    }
    const q = String(texto || "").trim();
    if (q.length < 2) {
      setCatalogo([]);
      return undefined;
    }

    // El mismo respiro que tenía el modal. Sin él, cada tecla es un viaje.
    let vigente = true;
    setBuscandoCatalogo(true);
    const t = setTimeout(async () => {
      try {
        const url = `/api/transferencias/buscar-productos-origen?transferenciaId=${item.id}&q=${encodeURIComponent(q)}`;
        const json = await (await fetch(url)).json();
        if (vigente) setCatalogo(json?.ok ? json.items || [] : []);
      } catch {
        if (vigente) setCatalogo([]);
      } finally {
        if (vigente) setBuscandoCatalogo(false);
      }
    }, 300);

    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [noFigura, puedeRecibir, item?.id, texto]);

  /**
   * Agrega el producto elegido con cantidad CERO y lo deja a la vista.
   *
   * Cero y no uno: el operador tiene que cargar cuánto llegó, y proponer un 1
   * es proponer un dato que nadie contó. La tarjeta nace con el contador en 0 y
   * la leyenda "Cargá la cantidad que llegó".
   *
   * El cuerpo lo arma `validarLineaNueva`, la misma función que usa el modal:
   * con dos armadores, el día que el contrato cambie uno de los dos manda un
   * pedido que el servidor rechaza.
   */
  const agregarDesdeCatalogo = async (producto) => {
    const plan = validarLineaNueva({
      transferenciaId: item.id,
      producto,
      unidadEnviada: unidadDeProductoNuevo(producto),
      recibido: 0,
      // El cero acá es "todavía no lo conté", no "llegaron cero". La tarjeta lo
      // pide y la barra de abajo no deja confirmar hasta que se cargue.
      permitirCero: true,
    });
    if (!plan.ok) {
      setAviso(plan.mensaje || "No se pudo agregar el producto.");
      return plan;
    }
    return agregarYMostrar(plan.cuerpo);
  };

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
      // En la computadora el agregado va derecho al panel, para cargarle la
      // cantidad: ahí la lista y el panel conviven y no se tapa nada.
      setElegidoEscritorioId(json.detalleId);
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
  //
  // `alElegir` dice QUÉ composición abre el producto: el teléfono lo abre en
  // su hoja (`elegir`) y la computadora en su panel (`elegirEnEscritorio`). La
  // cascada es una sola; lo que cambia es dónde se muestra lo encontrado.
  const resolver = (entrada, opciones, alElegir = elegir) => {
    const r = resolverEntrada(items, entrada, opciones);

    if (r.tipo === RESOLUCION.ABRIR) {
      alElegir(r.producto);
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
    const desdeEscritorio = escaneando === ESCANER_ESCRITORIO;
    setEscaneando(false);
    // La cámara devuelve un CÓDIGO. Sin fallback por nombre: un código que no
    // está en el remito es "no figura", y buscarlo como texto abriría cualquier
    // producto cuyo nombre contenga esos dígitos.
    resolver(codigo, { soloCodigo: true }, desdeEscritorio ? elegirEnEscritorio : elegir);
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

  // ── LA COMPUTADORA ELIGE APARTE ───────────────────────────────────────────
  //
  // El producto que muestra el panel de escritorio NO es `seleccionadoId`.
  // Ese abre la hoja del teléfono, y la hoja es un modal del kit que se monta
  // por portal: aunque la composición del teléfono esté oculta con `lg:hidden`,
  // su hoja se abriría encima de la computadora. Por eso cada composición
  // tiene su elegido, y lo encontrado por la cascada va a la que buscó.
  //
  // Sin nada elegido, el panel muestra el primer pendiente: es lo que el
  // operador va a contar después. Con todo revisado, ninguno.
  const [elegidoEscritorioId, setElegidoEscritorioId] = useState(null);
  const elegirEnEscritorio = (d) => {
    setElegidoEscritorioId(d?.id ?? null);
    setAviso("");
  };
  const productoEscritorio =
    items.find((d) => d.id === elegidoEscritorioId) ||
    productosVisibles(items, { filtro: FILTRO.PENDIENTES })[0] ||
    null;

  const alTeclearEnEscritorio = (e) => {
    if (e.key === "Enter" && texto.trim()) {
      e.preventDefault();
      resolver(texto.trim(), undefined, elegirEnEscritorio);
    }
  };

  return (
    <section className="space-y-3">
      {/* ══ TELÉFONO ═══════════════════════════════════════════════════════
          La composición V2. Recibe el estado y los handlers de acá: no tiene
          filtro propio, ni búsqueda propia, ni "revisar" propio.

          Se ve hasta `lg` (1024 px): entre 768 y 1023 también, porque la
          composición de la computadora necesita el ancho de la tabla y el
          panel juntos. Debajo de `md` el encabezado lo pone el shell; entre
          `md` y `lg`, la franja de la página —ver `page.jsx`—. */}
      <div className="lg:hidden">
        <RecepcionMovil
          item={item}
          resumen={resumen}
          categorias={categorias}
          // Los MISMOS productos que escritorio, con lo no declarado al tope.
          // Ver `visiblesMovil`: solo cambia el orden, nunca el contenido.
          visibles={visiblesMovil}
          // El catálogo del origen, ya buscado acá. La composición móvil los
          // dibuja; no los pide ni los filtra.
          catalogo={catalogo}
          buscandoCatalogo={buscandoCatalogo}
          onAgregarDesdeCatalogo={agregarDesdeCatalogo}
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

      {/* ══ COMPUTADORA, DESDE `lg` ═════════════════════════════════════════
          La composición aprobada (Figma EVJ2KvVCrY0oVSowfboymQ, 384:483). Igual
          que la del teléfono, recibe el estado y los handlers de acá: no tiene
          filtro propio, ni búsqueda propia, ni "revisar" propio. Lo único que
          tiene aparte es QUÉ producto muestra su panel —ver
          `elegidoEscritorioId`— porque el elegido del teléfono abre su hoja.

          Reemplazó a la pantalla de antes —el resumen en tarjetas, el buscador
          en su caja, el selector de tabs, los chips de categoría y la lista con
          la ficha al lado—, que se veía de 768 px para arriba. */}
      <div className="hidden lg:block">
        <RecepcionEscritorio
          item={item}
          resumen={resumen}
          categorias={categorias}
          visibles={visibles}
          producto={productoEscritorio}
          filtro={filtro}
          categoriaId={categoriaId}
          texto={texto}
          aviso={aviso}
          noFigura={noFigura}
          puedeRecibir={puedeRecibir}
          guardando={guardando}
          quitandoId={quitandoId}
          catalogo={catalogo}
          buscandoCatalogo={buscandoCatalogo}
          onAgregarDesdeCatalogo={agregarDesdeCatalogo}
          onAbrirAgregar={() => setAgregarAbierto(true)}
          accionAgregar={ACCION_AGREGAR}
          onFiltrar={setFiltro}
          onCategoria={setCategoriaId}
          onTexto={(v) => {
            setTexto(v);
            setAviso("");
          }}
          onTeclear={alTeclearEnEscritorio}
          onVoz={(t) => {
            dictado.current = true;
            setTexto(t);
          }}
          onElegir={elegirEnEscritorio}
          // "Guardar y seguir" pasa al pendiente que sigue en la lista.
          onSiguientePendiente={(actual) => elegirEnEscritorio(siguientePendiente(visibles, actual))}
          onRevisar={onRevisar}
          onQuitarLinea={onQuitarLinea}
          onAbrirEscaner={() => setEscaneando(ESCANER_ESCRITORIO)}
          confirmarRecepcion={confirmarRecepcion}
          confirmando={confirmando}
          puedeCancelar={puedeCancelar}
          abrirPanelCancelar={abrirPanelCancelar}
          panelCancelar={panelCancelar}
          imprimirTicket={imprimirTicket}
          volver={volver}
        />
      </div>
      {/* ══ FIN DE LA COMPUTADORA ══════════════════════════════════════════ */}

      {/* Los dos modales son COMPARTIDOS: el escáner y el alta de un producto no
          declarado se abren desde cualquiera de las dos composiciones y no hay
          motivo para tener dos. Se montan por portal, así que dónde estén
          escritos no cambia dónde se dibujan. */}
      <SunmiEscanerCodigoBarra
        abierto={Boolean(escaneando)}
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
