"use client";

// LA COMPOSICIÓN MÓVIL DEL CONTROL FÍSICO — V2.
//
// ── QUÉ ES ESTO Y QUÉ NO ES ──────────────────────────────────────────────
//
// Es PRESENTACIÓN. No tiene estado de negocio, no llama a ningún endpoint y no
// decide nada: recibe de `WorkspaceRecepcion` el mismo estado y los mismos
// handlers que usa el escritorio, y los acomoda distinto. Un solo cerebro, dos
// composiciones — si esta pieza tuviera su propio filtro o su propio "revisar",
// el día que una regla cambie el teléfono y la computadora dirían cosas
// distintas, y el que se entera es el que está contando cajas.
//
// Lo único suyo son tres booleanos de "qué hoja está abierta", que no son
// negocio: son qué se ve.
//
// ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────
//
// La pantalla anterior era una página administrativa: encabezado del shell,
// otro encabezado adentro con su propio "Volver", cinco tarjetas de métricas,
// la información general completa, cinco botones de PDF y cancelación, y recién
// después el buscador. Con 150 productos en la mano eso es scrollear un
// documento antes de poder trabajar.
//
// Acá el orden es el del trabajo: dónde estoy → buscar → contar → marcar →
// siguiente. Todo lo administrativo sigue existiendo y se llega por "⋯".
//
// ── POR QUÉ EL PRODUCTO ES UNA HOJA Y NO UN REEMPLAZO ────────────────────
//
// Antes el producto REEMPLAZABA al listado y aparecía un segundo "Volver".
// Con una hoja inferior la lista queda atrás, visible, y cerrar es un gesto —
// no una decisión de navegación. Y el modal es el del kit: la capa, el velo, el
// `Escape`, la pila de modales y el portal ya están resueltos ahí.

import { useEffect, useState } from "react";
import { ArrowRight, MoreHorizontal } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import { hayEscanerDisponible } from "@/components/sunmi/SunmiEscanerCodigoBarra";

import EstadoTransferenciaBadge from "./EstadoTransferenciaBadge";
import TransferenciaHeader from "./TransferenciaHeader";
import FichaProductoRecepcion from "./FichaProductoRecepcion";
import TarjetaRecepcionMovil from "./TarjetaRecepcionMovil";
import FilaCatalogoRecepcion, { ROTULO_CATALOGO } from "./FilaCatalogoRecepcion";
import { fmtCantidad } from "./detallePresentacion";
// ── UN SOLO FORMATEADOR DE PLATA EN ESTA PANTALLA ────────────────────────
//
// `formatearMoneda` y no el `fmtMoneda` local: es el del ERP, y el diseño lo
// pide explícito. Los dos dan es-AR con punto de miles y coma decimal; difieren
// en un espacio —`$1.234,00` contra `$ 1.234,00`—, así que NO se puede cambiar
// el de `detallePresentacion` sin mover la tabla de escritorio, que esta tanda
// mide en cero. Por eso el móvil migra y aquél queda donde está.
import { formatearMoneda } from "@/lib/moneda";
import { FILTRO, pasaFiltro } from "@/lib/transferencias/controlFisico";
// La escala canónica de una línea, compartida con la tarjeta. Ver el encabezado
// de `escalaFisicaDeLinea`: leer `unidadEnviada` crudo devuelve null en las
// líneas con snapshot, y null se lee como "no hay diferencia".
import {
  contarCorregidas,
  fisicasEnviadasDe,
  fisicasRecibidasDe,
} from "@/lib/transferencias/recepcionUI";
import { firmaDeEdicion } from "@/lib/transferencias/presentacionEnvio";

/** El texto del buscador, el mismo patrón que Productos y el POS. */
export const PLACEHOLDER_BUSCADOR = "Buscar producto, código o categoría...";

export const TITULO_MAS_ACCIONES = "Más acciones";
export const TITULO_INFO_GENERAL = "Información general";

/**
 * El aviso de "no figura", en UNA línea.
 *
 * Decía la frase larga más "informalo como producto no declarado", que mandaba
 * a buscar un botón. Ahora los resultados del catálogo están justo abajo, así
 * que el aviso solo tiene que decir qué pasó y qué hacer.
 */
export const MENSAJE_NO_FIGURA_CORTO =
  "No figura en esta transferencia. Si llegó igual, tocalo y se agrega.";

/** Los cuatro estados del trabajo. Fijos, y todos a la vista. */
const TABS = [
  { clave: FILTRO.PENDIENTES, texto: "Pendientes" },
  { clave: FILTRO.DIFERENCIAS, texto: "Diferencias" },
  { clave: FILTRO.REVISADOS, texto: "Revisados" },
  { clave: FILTRO.TODOS, texto: "Todos" },
];

/** De dónde sale el número de cada tab. Del MISMO resumen que las cards. */
const CONTEO = {
  [FILTRO.PENDIENTES]: (r) => r.pendientes,
  [FILTRO.DIFERENCIAS]: (r) => r.diferencias,
  [FILTRO.REVISADOS]: (r) => r.revisados,
  // "Todos" cuenta la mercadería que hay sobre la mesa —agregados incluidos—,
  // que es lo que ese tab muestra. Los otros tres cuentan el remito. Ver
  // `resumenDeRecepcion`: son dos totales con dos nombres a propósito.
  [FILTRO.TODOS]: (r) => r.totalFisico ?? r.totalRemito,
};

export default function RecepcionMovil({
  item,
  resumen,
  categorias,
  visibles,
  seleccionado,
  filtro,
  categoriaId,
  texto,
  aviso,
  /** Decidido arriba contra la transferencia COMPLETA. Ver `faltaEnLaTransferencia`. */
  noFigura = false,
  puedeRecibir,
  guardando,
  quitandoId,
  onFiltrar,
  onCategoria,
  onTexto,
  onTeclear,
  onVoz,
  onElegir,
  onCerrarProducto,
  onRevisar,
  onQuitarLinea,
  onAbrirEscaner,
  // ── EL CATÁLOGO DEL ORIGEN, YA BUSCADO POR EL CEREBRO ──────────────────
  //
  // Llegan hechos. Esta pieza no consulta ningún endpoint ni filtra nada: hay
  // candados que lo exigen, y con razón — si buscara por su cuenta, el teléfono
  // y el escritorio podrían ofrecer productos distintos para el mismo texto.
  catalogo = [],
  buscandoCatalogo = false,
  onAgregarDesdeCatalogo,
  FilaProducto,
  // Lo administrativo, que ya vive en la página y acá solo se acomoda.
  confirmarRecepcion,
  confirmando = false,
  puedeCancelar = false,
  abrirPanelCancelar,
  panelCancelar = null,
  imprimirTicket,
}) {
  const [masAcciones, setMasAcciones] = useState(false);
  const [infoGeneral, setInfoGeneral] = useState(false);

  // ── EL AVISO DE LO QUE SE ACABA DE GUARDAR ──────────────────────────────
  //
  // Guardar CIERRA la hoja y devuelve al buscador —eso no cambia, es lo que
  // hace que 77 líneas sean 77 toques y no 154—. Lo que faltaba era ver QUÉ
  // quedó guardado: la hoja se iba y con ella el número que uno acababa de
  // escribir, sin confirmación de ningún tipo.
  //
  // Se va solo a los seis segundos, o antes si se guarda la siguiente. El timer
  // se limpia al desmontar y en cada aviso nuevo: sin eso, guardar cinco líneas
  // seguidas deja cinco temporizadores vivos y el último apaga un aviso que ya
  // no es el suyo.
  const [guardado, setGuardado] = useState(null);
  useEffect(() => {
    if (!guardado) return undefined;
    const id = setTimeout(() => setGuardado(null), 6000);
    return () => clearTimeout(id);
  }, [guardado]);

  const pendientes = resumen?.pendientes ?? 0;
  const todoRevisado = pendientes === 0 && (resumen?.totalRemito ?? 0) > 0;

  // ── LOS TRES IMPORTES ─────────────────────────────────────────────────────
  //
  // Los calcula el servidor —`app/api/transferencias/detalle`— y acá NO se
  // recalcula nada: sumar las cards en el navegador es cómo el mismo documento
  // termina mostrando dos totales distintos.
  //
  // `importeCorregido` llega en null mientras nadie contó, y ahí el único
  // importe que existe es el enviado. Se compara contra null y no por
  // truthiness: un remito corregido a 0 —no llegó nada— es un caso real y tiene
  // que mostrar su diferencia, no desaparecer.
  const importeOriginal = item?.resumen?.importeOriginal ?? null;
  const importeCorregido = item?.resumen?.importeCorregido ?? null;
  const diferenciaImporte = item?.resumen?.diferenciaImporte ?? null;
  const hayDiferenciaDeImporte =
    importeCorregido != null && diferenciaImporte != null && diferenciaImporte !== 0;
  const importeSinDiferencia = importeCorregido ?? importeOriginal;

  // Cuánto pesa lo que NO venía en el remito. Es la diferencia entre los dos
  // importes que el servidor ya calculó — no una suma de las cards, que es cómo
  // el mismo documento termina mostrando dos totales. Se muestra solo mientras
  // se está por agregar algo, con signo, para saber contra qué se suma.
  const importeNoDeclarados =
    importeCorregido != null && importeOriginal != null
      ? Math.max(0, importeCorregido - importeOriginal)
      : 0;

  const opcionesEstado = TABS.map((t) => ({ ...t, cantidad: CONTEO[t.clave](resumen || {}) }));


  // ── QUIÉN TIENE DIFERENCIA LO DECIDE EL MISMO PREDICADO QUE EL FILTRO ───
  //
  // `pasaFiltro(d, DIFERENCIAS)` es lo que alimenta el tab y las cards. Si acá
  // se preguntara de otra forma, esta lista y el número del tab podrían decir
  // cosas distintas sobre los mismos productos. El DTO además NO trae un campo
  // `diferencia`: derivarlo a mano habría dado `0` para todos, en silencio.
  const diferencias = (item?.items || []).filter((d) => pasaFiltro(d, FILTRO.DIFERENCIAS));

  // ── LOS DOS MOTIVOS POR LOS QUE NO SE PUEDE CONFIRMAR ───────────────────
  //
  // Falta contar, o hay una diferencia que nadie explicó. Son dos impedimentos
  // distintos con dos arreglos distintos, así que se cuentan por separado y el
  // aviso dice CUÁL es y cuántas son. Un botón gris sin explicación manda a
  // tocarlo hasta que alguien se rinde.
  //
  // Una línea AGREGADA no entra: su procedencia ya está registrada con autor y
  // fecha, y pedirle además un motivo es pedir dos veces lo mismo. Es la misma
  // regla que `exigeMotivo` aplica en el servidor — acá no se inventa otra.
  //
  // ── Y NO SALE DE `diferencias`, AUNQUE PAREZCA LO OBVIO ─────────────────
  //
  // Se escribió primero filtrando esa lista y quedaba SIEMPRE en cero, sin que
  // nada avisara. El motivo es que `estadoDeProducto` devuelve PENDIENTE para
  // toda línea no revisada, así que el filtro DIFERENCIAS solo ve las YA
  // revisadas — y el servidor no deja revisar con diferencia y sin motivo. La
  // condición era inalcanzable: una defensa que se lee como puesta y no cubre
  // nada, que es el caso que CLAUDE.md tiene anotado dos veces.
  //
  // Lo que SÍ ocurre, y es lo que el diseño quiere frenar: alguien contó, dejó
  // una diferencia cargada y se fue sin explicarla. Esa línea tiene recepción
  // persistida, no está revisada y no tiene motivo. Se deriva de la línea, con
  // la misma función que el renglón de abajo, y en FÍSICO — que es donde la
  // diferencia cuenta.
  const sinMotivo = (item?.items || []).filter((d) => {
    if (d.agregadoEnRecepcion || d.motivoPrincipal) return false;
    if (d.cantidadRecibida == null) return false;
    const env = fisicasEnviadasDe(d);
    const rec = fisicasRecibidasDe(d);
    return env != null && rec != null && rec !== env;
  }).length;
  // ── Y LA TERCERA, QUE EL V16 TRAJO CON EL ALTA EN LÍNEA ─────────────────
  //
  // Tocar un producto del catálogo crea la línea EN CERO, para cargarla en la
  // tarjeta. Ese cero es "todavía no lo conté", no "llegaron cero" —la regla que
  // lo impedía sigue en pie para el panel de escritorio, ver `permitirCero` en
  // `validarLineaNueva`—, y por eso no puede quedar suelto: un borrador olvidado
  // se confirmaría como una línea que informa nada.
  //
  // Una agregada no es "pendiente" ni pide motivo, así que ninguna de las otras
  // dos causas la ve. Ésta sí.
  const sinCargar = (item?.items || []).filter(
    (d) => d.agregadoEnRecepcion && !(Number(d.cantidadRecibida) > 0)
  ).length;

  // Las tres causas juntas en UNA condición, para que el botón tenga una sola y
  // no puedan decir cosas distintas. El V16 sacó el renglón que las anunciaba
  // —el avance ya está arriba y los tabs ya traen su número— pero las reglas son
  // las mismas, y el servidor las vuelve a exigir de todas formas.
  const trabado = !todoRevisado || sinMotivo > 0 || sinCargar > 0;

  /** Cuántas quedaron corregidas. Lo dice la barra y lo marca la lista. */
  const corregidas = contarCorregidas(item?.items);

  /**
   * "35 de 36 unidades · faltó 1". En FÍSICO, que es lo que mueve stock.
   *
   * ── LEÍA LA ESCALA CRUDA, Y DABA UN NÚMERO FALSO ──────────────────────
   *
   * Usaba `d.unidadEnviada` y `d.factorPack` directo. En una línea con snapshot
   * —"6 PACK x24" persistido como UNIDAD, que es lo que escribe el POS— eso
   * ignora el factor: con 4 packs contados sobre 6 enviados decía "4 de 144
   * unidades · faltó 140" en vez de "96 de 144 · faltó 48". Se vio corriendo el
   * arnés del V16, en el resumen de cierre.
   *
   * Ahora sale de la misma fuente que la tarjeta y que la barra:
   * `escalaFisicaDeLinea` lee el snapshot cuando está y reconstruye cuando no.
   */
  const detalleDiferencia = (d) => {
    const env = fisicasEnviadasDe(d);
    const rec = fisicasRecibidasDe(d);
    if (env == null || rec == null) return null;
    const delta = rec - env;
    const cuantas = Math.abs(delta);
    return `${fmtCantidad(rec)} de ${fmtCantidad(env)} unidades · ${
      delta < 0 ? "faltó" : "sobró"
    } ${fmtCantidad(cuantas)}`;
  };

  return (
    <section className="space-y-3">
      {/* ── 1 · DÓNDE ESTOY ───────────────────────────────────────────────
          Compacto a propósito. El título "Transferencias" y el "Volver" los
          dibuja el shell —ver `useAccionDePagina` en la página—, así que acá no
          se repiten. Lo que falta para saber dónde estamos es el número, el
          estado, las dos puntas y el avance. Nada más. */}
      <SunmiCard className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold sunmi-text-strong truncate">
              Transferencia #{item?.id}
            </span>
            <EstadoTransferenciaBadge estado={item?.estado} />
          </div>
          <SunmiButton
            color="slate"
            onClick={() => setMasAcciones(true)}
            aria-label={TITULO_MAS_ACCIONES}
            aria-haspopup="dialog"
            className="shrink-0"
          >
            {/* ── ICONO Y NO EL CARÁCTER "⋯" ────────────────────────────
                El carácter salió como un cuadrito vacío en la captura de 390 px:
                el botón quedaba gris y sin nada adentro. No es un problema del
                arnés —el "←" de Volver sí se ve, porque es un icono— sino de
                depender de un glifo que la fuente puede no tener. `lucide-react`
                ya es del kit y lo usa `SunmiBackButton`. */}
            <MoreHorizontal size={18} aria-hidden="true" />
          </SunmiButton>
        </div>

        {/* La flecha también era un carácter y también salió como un cuadrito.
            Mismo arreglo: un icono, que además se anuncia solo. */}
        <p className="text-sm2 sunmi-text-muted truncate flex items-center gap-1">
          <span className="truncate">{item?.origen?.nombre}</span>
          <ArrowRight size={14} aria-label="hacia" className="shrink-0" />
          <span className="truncate">{item?.destino?.nombre}</span>
        </p>

        <div className="flex items-baseline justify-between gap-2">
          {/* ── LAS DOS CUENTAS SALEN DEL MISMO UNIVERSO ──────────────────
              Decía `revisados / totalRemito` —4 / 77— mientras el tab de al
              lado decía "Todos 78". Los dos números eran correctos y contaban
              cosas distintas: el remito por un lado, la mercadería sobre la
              mesa por el otro. A cinco centímetros de distancia, eso no se lee
              como dos preguntas: se lee como una cuenta que no cierra, y fue lo
              primero que saltó al usarlo con la #195.

              Se unifica contra el universo FÍSICO, que es el que el operador
              tiene delante: el denominador es `totalFisico` —el mismo del tab—
              y el numerador suma los no declarados, que están resueltos por
              definición. Ninguno de los dos se inventa: los dos salen de
              `resumenDeRecepcion`.

              `todoRevisado` NO se toca y sigue mirando `totalRemito`: contesta
              otra pregunta —si queda alguna línea DEL REMITO sin contar— y
              moverlo trabaría el cierre de cualquier transferencia que tenga un
              no declarado. */}
          <span className="text-sm2 sunmi-text-muted">
            <span className="tabular-nums sunmi-text-strong font-semibold">
              {(resumen?.revisados ?? 0) + (resumen?.noDeclarados ?? 0)} /{" "}
              {resumen?.totalFisico ?? resumen?.totalRemito ?? 0}
            </span>{" "}
            revisados
          </span>
          <span className={`text-sm2 ${pendientes > 0 ? "sunmi-text-accent" : "sunmi-text-success"}`}>
            {pendientes > 0
              ? `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`
              : "Sin pendientes"}
          </span>
        </div>
      </SunmiCard>

      {/* ── 2 · BUSCAR ────────────────────────────────────────────────────
          El MISMO componente que Productos y el POS: lupa, campo y micrófono.
          No hay un botón de "Escanear" al lado — un lector físico escribe el
          código y manda Enter, que entra por `onKeyDown` igual que un nombre
          tecleado, y la cámara vive en "⋯" mientras no haya una composición
          aprobada para ella. */}
      <SunmiCampoBusquedaVoz
        value={texto}
        onChange={onTexto}
        onVoz={onVoz}
        onKeyDown={onTeclear}
        placeholder={PLACEHOLDER_BUSCADOR}
        ariaLabel="Buscar producto de esta transferencia"
      />

      {/* ── 3 · FILTROS ───────────────────────────────────────────────────
          El estado del trabajo primero, en grilla para que entren los cuatro
          con su número. La categoría abajo y en un desplegable: es un filtro
          secundario y no tiene que competir con el principal. */}
      <SunmiFiltroEstado
        opciones={opcionesEstado}
        valor={filtro}
        onCambiar={onFiltrar}
        ariaLabel="Filtrar productos por estado"
      />

      <div>
        <label className="text-sm2 sunmi-text-muted mb-1 block" htmlFor="categoria-recepcion">
          Categoría
        </label>
        <SunmiSelectAdv
          id="categoria-recepcion"
          value={categoriaId == null ? "" : String(categoriaId)}
          onChange={(v) => onCategoria(v === "" ? null : v)}
        >
          {/* ── "TODAS" ES EL UNIVERSO QUE ESTA VISTA PUEDE MOSTRAR ──────
              Decía `totalRemito` mientras el tab de al lado ya decía
              `totalFisico`: con 52 originales y 1 agregado la pantalla mostraba
              "Todos 53" y "Todas · 52" a cinco píxeles de distancia. Dos
              números para lo mismo, y ninguno explicaba al otro.

              El avance del remito —3 / 52 revisados, 49 pendientes— sigue
              contando el DOCUMENTO y no se toca. Son dos preguntas distintas y
              cada una conserva la suya. */}
          <option value="">Todas · {resumen?.totalFisico ?? resumen?.totalRemito ?? 0}</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {c.cantidad}
            </option>
          ))}
        </SunmiSelectAdv>
      </div>

      {/* ── 4 · EL CAMINO DE EXCEPCIÓN, DESPUÉS DE LOS FILTROS ─────────────
          Acá se comparaba `aviso === mensajeNoFigura`, y ese aviso solo existía
          después de tocar Enter. El operador escribía "9 de oro", no encontraba
          nada, y la pantalla le contestaba "No hay productos que coincidan con
          este filtro" mientras el botón para informarlo quedaba detrás de una
          tecla que nadie sabía que había que apretar.

          Ahora llega decidido de arriba, en `noFigura`, derivado del texto
          contra la transferencia COMPLETA. Un booleano y no una comparación de
          strings: dos textos que se parecen no pueden volver a decidir esto.

          ── Y VA ACÁ ABAJO, NO PEGADO AL BUSCADOR ───────────────────────
          Estaba entre el buscador y los filtros, y eso empujaba el trabajo
          normal —elegir estado, elegir categoría— más abajo cada vez que una
          búsqueda no encontraba algo. El orden del diseño aprobado pone primero
          las herramientas de siempre y el camino de excepción al final, que es
          donde corresponde a algo que pasa poco. */}
      {(noFigura || aviso) && (
        <SunmiAviso tono="warning">
          {noFigura ? MENSAJE_NO_FIGURA_CORTO : aviso}
        </SunmiAviso>
      )}

      {/* ── EL CATÁLOGO DEL ORIGEN, COMO FILAS DE ESTA MISMA LISTA ─────────
          Antes acá había un botón que abría un modal, y adentro del modal había
          que VOLVER A ESCRIBIR lo mismo que ya se había escrito arriba. Dos
          búsquedas para informar una caja.

          Ahora el mismo texto busca en los dos lados: primero en la
          transferencia —que es donde está el 99 %— y, solo si no figura, en el
          catálogo del origen. Tocar una fila agrega la línea con cantidad CERO
          y la deja al tope para cargarla. Cero modales.

          La búsqueda NO se hace acá: los resultados llegan hechos de
          `WorkspaceRecepcion`, igual que todo lo demás. */}
      {noFigura && puedeRecibir && (
        <div className="space-y-1.5">
          <p className="text-sm2 font-semibold sunmi-text-muted">{ROTULO_CATALOGO}</p>

          {buscandoCatalogo && catalogo.length === 0 && (
            <p className="text-sm2 sunmi-text-muted">Buscando en el catálogo…</p>
          )}
          {!buscandoCatalogo && catalogo.length === 0 && (
            <p className="text-sm2 sunmi-text-muted">
              Tampoco está en el catálogo del origen.
            </p>
          )}

          {catalogo.map((p) => (
            <FilaCatalogoRecepcion
              key={p.productoLocalId}
              p={p}
              onElegir={onAgregarDesdeCatalogo}
              agregando={guardando}
            />
          ))}

          {/* ── QUÉ IMPACTO TIENE LO QUE SE ESTÁ POR AGREGAR ──────────────
              Los tres números del resumen, acá abajo, para no tener que
              scrollear hasta el cierre para saber contra qué se está sumando.
              Salen del servidor, como el resto: acá no se suma nada. */}
          {importeOriginal != null && (
            <div className="pt-1 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">Importe enviado</span>
                <span className="tabular-nums text-sm2 sunmi-text-muted">
                  {formatearMoneda(importeOriginal)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">No declarados</span>
                <span className="tabular-nums text-sm2 sunmi-text-danger">
                  +{formatearMoneda(importeNoDeclarados)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">Importe corregido</span>
                <span className="tabular-nums text-sm2 font-semibold sunmi-text-strong">
                  {formatearMoneda(importeCorregido ?? importeOriginal)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}


      {/* ── 4 · CUANDO YA ESTÁ TODO ───────────────────────────────────────
          Recién acá aparece el resumen, y compacto. Durante el conteo esas
          cinco cifras son ruido; al terminar son lo único que importa. */}
      {todoRevisado && (
        <SunmiCard className="p-3 space-y-2">
          <p className="font-semibold sunmi-text-success">✓ Todo revisado</p>
          <p className="text-sm2 sunmi-text-muted">
            Revisá las diferencias y confirmá para mover el stock.
          </p>
          <div className="grid grid-cols-2 gap-1 text-sm2">
            <span className="sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong">{resumen.correctos}</span> correctos
            </span>
            <span className="sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong">{resumen.faltantes}</span>{" "}
              {resumen.faltantes === 1 ? "faltante" : "faltantes"}
            </span>
            <span className="sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong">{resumen.sobrantes}</span>{" "}
              {resumen.sobrantes === 1 ? "sobrante" : "sobrantes"}
            </span>
            <span className="sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong">{resumen.noDeclarados}</span> no
              {" "}declarados
            </span>
          </div>

          {diferencias.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-sm2 sunmi-text-muted">Diferencias</p>
              {diferencias.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm2 sunmi-text-strong">{d.nombre}</span>
                    <span className="block text-sm2 sunmi-text-muted">{detalleDiferencia(d)}</span>
                  </span>
                  <SunmiButton color="slate" onClick={() => onElegir(d)} className="shrink-0">
                    Revisar
                  </SunmiButton>
                </div>
              ))}
            </div>
          )}
        </SunmiCard>
      )}

      {/* ── 5 · LOS PRODUCTOS ─────────────────────────────────────────────
          La misma fila que el escritorio: se toca la tarjeta entera y no hay
          botones adentro. */}
      <div className="space-y-3.5">
        {/* ── LO QUE SE ACABA DE GUARDAR ────────────────────────────────
            Cantidad Y plata, las dos. Con una sola no alcanza: "4 → 10" no dice
            cuánto se movió el documento, y "$38.000 → $95.000" no dice de dónde
            salió ese número. Es lo único que queda en pantalla después de que la
            hoja se cierra sola. */}
        {guardado && (
          <div className="rounded-lg p-2 sunmi-state-success" aria-live="polite">
            <p className="text-sm2 font-semibold sunmi-text-success break-words">
              {guardado.nombre} · guardado
            </p>
            <p className="text-sm2 sunmi-text-muted break-words tabular-nums">
              {guardado.huboCorreccion && guardado.de != null
                ? `${fmtCantidad(guardado.de)} → ${fmtCantidad(guardado.a)} ${guardado.unidad}`
                : `${fmtCantidad(guardado.a)} ${guardado.unidad}`}
              {guardado.importeA != null && (
                <>
                  {"   ·   "}
                  {guardado.huboCorreccion && guardado.importeDe != null
                    ? `${formatearMoneda(guardado.importeDe)} → ${formatearMoneda(guardado.importeA)}`
                    : formatearMoneda(guardado.importeA)}
                </>
              )}
            </p>
          </div>
        )}

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
        {/* ── LA TARJETA DE TRABAJO, V21 ────────────────────────────────
            Ya no es `FilaProducto`. Esa fila la comparten el teléfono y la
            lista de escritorio, y ésta tiene dos acciones propias adentro:
            metérselas allá movería escritorio, que esta tanda no toca.

            Desde el V21 la tarjeta NO edita cantidades: "Corregir" abre la
            misma ficha que el escritorio —`onElegir`, la hoja de abajo— y ahí
            se cargan cantidad, sueltas y motivo. Por eso ya no se le pasa
            `onDesmarcar`: la tarjeta revisada dejó de tener botón propio y
            nadie más usaba esa prop.

            El `key` incluye la firma de la edición y no solo el id: adoptar la
            presentación cambia EN QUÉ se cuenta la línea sin cambiarle el id, y
            con `key={d.id}` React conservaría un estado que ya no significa lo
            mismo. Es el defecto que la ficha ya tiene tapado. */}
        {visibles.map((d) => (
          <TarjetaRecepcionMovil
            key={firmaDeEdicion(d)}
            d={d}
            puedeRecibir={puedeRecibir}
            guardando={guardando}
            onRevisar={onRevisar}
            onAbrirFicha={onElegir}
          />
        ))}
      </div>

      {/* ── 6 · CONFIRMAR ─────────────────────────────────────────────────
          El estado del botón NO se decide acá: sale de `pendientes`, que sale
          del mismo resumen que las cards. Y el servidor lo vuelve a comprobar
          —`PRODUCTOS_SIN_REVISAR`—: esto evita el viaje, no reemplaza la regla. */}
      {puedeRecibir && (
        <SunmiCard className="p-3 space-y-2">
          {/* ── EL VALOR DEL REMITO, ANTES DE CONFIRMAR ──────────────────
              El celular mostraba el importe de cada línea y ningún total: para
              saber cuánto vale lo que se está recibiendo había que sumar de
              cabeza. Va acá, en el bloque de cierre, porque es la pregunta del
              momento en que se firma.

              Es `importeEnviado`: lo que salió del depósito y quedó valorizado
              al enviar. NO cambia mientras se cuenta —un importe que se mueve
              durante el control no sirve para controlar—. Lo que falte o sobre
              lo informa el flujo de diferencias, no este número.

              Y se llama así y no `totalRemito` porque el `resumen` del control
              físico, que esta misma pantalla recibe, ya tiene un `totalRemito`
              que es un CONTEO DE LÍNEAS. Dos campos con el mismo nombre y
              distinta unidad en la misma composición es cómo alguien termina
              sumando pesos con productos.

              El importe NO se suma acá: viene resuelto del endpoint, con la
              misma valorización canónica que el tile de escritorio y los PDF.
              Sumar las cards en el navegador es cómo el mismo documento termina
              mostrando dos totales. */}
          {/* ── EL IMPORTE, Y CUÁL DE LOS TRES ES EL PRINCIPAL ────────────────
              Mientras no hay diferencia hay UN importe y se muestra solo: poner
              tres renglones iguales sería ruido en el momento de firmar.
              Apenas aparece diferencia, el número grande pasa a ser el CORREGIDO
              —es lo que entró y lo que se va a facturar— y el original baja a
              antecedente. Nunca se borra: es con lo que se reclama. */}
          {hayDiferenciaDeImporte ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">Importe corregido</span>
                <span className="tabular-nums font-semibold sunmi-text-strong">
                  {formatearMoneda(item.resumen.importeCorregido)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">Importe enviado</span>
                <span className="tabular-nums text-sm2 sunmi-text-muted">
                  {formatearMoneda(item.resumen.importeOriginal)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">Diferencia</span>
                {/* El signo lo lleva el NÚMERO, no un color: un más o un menos se
                    lee igual en cualquier pantalla y con cualquier tema. */}
                <span className="tabular-nums text-sm2 sunmi-text-strong">
                  {item.resumen.diferenciaImporte > 0 ? "+" : ""}
                  {formatearMoneda(item.resumen.diferenciaImporte)}
                </span>
              </div>
            </>
          ) : (
            importeSinDiferencia != null && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm2 sunmi-text-muted">Importe</span>
                <span className="tabular-nums font-semibold sunmi-text-strong">
                  {formatearMoneda(importeSinDiferencia)}
                </span>
              </div>
            )
          )}
        </SunmiCard>
      )}

      {/* ── 7 · LA BARRA DE CIERRE, PEGADA ABAJO ───────────────────────────
          Con 77 líneas, el botón de confirmar quedaba al final de un scroll
          largo: para saber si ya se podía confirmar había que llegar hasta
          abajo. Pegada, la respuesta está siempre a la vista.

          `sticky` y no `fixed`: se queda dentro del flujo de la página, así que
          no tapa el último producto ni hay que compensar con un relleno al
          final. Y el nivel de apilado es el de la escala —no un número escrito
          a mano—, porque esto no es un modal: tiene que quedar POR DEBAJO de
          las hojas del kit, no por encima.

          ── QUÉ DICE LA BARRA, Y QUÉ DEJÓ DE DECIR ─────────────────────────
          El total y el botón. Nada más.

          Anunciaba además cuánto faltaba revisar, y el V16 lo sacó porque era
          ruido: el avance ya está arriba —"5 / 78 revisados"— y los tabs de
          filtro ya traen su número, a un toque. Tres lugares contando lo mismo.

          EL BLOQUEO NO CAMBIÓ. `trabado` sigue siendo `!todoRevisado ||
          sinMotivo > 0` y sigue deshabilitando el botón por las dos causas: que
          falte contar, o que haya una diferencia que nadie explicó. Lo que se
          sacó es el ANUNCIO, no la regla.

          Y esto EVITA EL VIAJE, no reemplaza nada: el servidor vuelve a exigir
          las dos —`PRODUCTOS_SIN_REVISAR` y el motivo obligatorio— y es él
          quien manda. */}
      {puedeRecibir && (
        <div className="sticky bottom-0 z-10 -mx-4 px-4 pt-2 pb-2 border-t sunmi-divider sunmi-surface">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              {/* ── EL RÓTULO DICE CUÁNTAS SE CORRIGIERON ──────────────────
                  Con 77 líneas, terminado el conteo, "Total" a secas no dice si
                  hay algo que repasar antes de confirmar. El número sale de
                  `contarCorregidas`, la MISMA función que decide qué línea de la
                  lista se marca en warning: con dos criterios distintos la lista
                  podría marcar tres y el pie decir dos. */}
              <span
                className={`block text-sm2 ${corregidas > 0 ? "sunmi-text-warning" : "sunmi-text-muted"}`}
              >
                Total
                {corregidas > 0
                  ? ` · ${corregidas} ${corregidas === 1 ? "corregido" : "corregidos"}`
                  : ""}
              </span>
              <span className="block tabular-nums text-lg2 font-semibold sunmi-text-strong">
                {formatearMoneda(importeSinDiferencia)}
              </span>
            </span>
            <SunmiButton
              color="amber"
              onClick={confirmarRecepcion}
              disabled={trabado || confirmando}
              className="shrink-0 justify-center"
            >
              {confirmando ? "Confirmando..." : "✓ Confirmar"}
            </SunmiButton>
          </div>
        </div>
      )}

      {/* ── LA HOJA DEL PRODUCTO ──────────────────────────────────────────
          `forma="hoja"` del kit: pegada abajo, con su velo y su `Escape`. La
          ficha va sin su tarjeta —`enHoja`— porque el modal ya pone una. */}
      <SunmiModalLayout
        open={!!seleccionado}
        title={seleccionado?.nombre || ""}
        onClose={onCerrarProducto}
        z={NIVEL_MODAL_GLOBAL}
        forma="hoja"
        // Es carga: hay una cantidad escrita que un toque al costado tiraría.
        //
        // Se probó condicionarlo —mientras la hoja es la vista de DECISIÓN de
        // una histórica no hay ningún campo que perder— y NO va: el candado del
        // kit acepta solo literales acá, a propósito, para que una expresión
        // cualquiera no pase como decisión tomada. Hacerlo condicional es una
        // decisión de criterio que se registra allá, y no era el pedido de esta
        // tanda.
        destructivo
        espacioCuerpo="gap-2"
      >
        {seleccionado && (
          <FichaProductoRecepcion
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
            onQuitar={onQuitarLinea}
            quitando={quitandoId === seleccionado.id}
            enHoja
            onGuardado={(loGuardado) => {
              // El aviso se arma ACÁ y no adentro de la ficha: la ficha se
              // desmonta al cerrarse la hoja, así que un aviso dibujado allá se
              // iría justo cuando hay que leerlo.
              setGuardado(loGuardado || null);
              onCerrarProducto?.();
            }}
          />
        )}
      </SunmiModalLayout>

      {/* ── LA HOJA DE "MÁS ACCIONES" ─────────────────────────────────────
          Todo lo administrativo, fuera del flujo físico pero a un toque. */}
      <SunmiModalLayout
        open={masAcciones}
        title={TITULO_MAS_ACCIONES}
        subtitle={`Transferencia #${item?.id} · ${item?.origen?.nombre} a ${item?.destino?.nombre}`}
        onClose={() => setMasAcciones(false)}
        z={NIVEL_MODAL_GLOBAL}
        forma="hoja"
        espacioCuerpo="gap-2"
      >
        <SunmiButton
          color="slate"
          className="w-full justify-center"
          onClick={() => {
            setMasAcciones(false);
            setInfoGeneral(true);
          }}
        >
          {TITULO_INFO_GENERAL}
        </SunmiButton>

        <a href={`/api/transferencias/pdf?id=${item?.id}`} target="_blank" rel="noreferrer">
          <SunmiButton color="slate" className="w-full justify-center">
            📄 PDF de envío
          </SunmiButton>
        </a>
        <a href={`/api/transferencias/pdf-recepcion?id=${item?.id}`} target="_blank" rel="noreferrer">
          <SunmiButton color="slate" className="w-full justify-center">
            📄 PDF de recepción
          </SunmiButton>
        </a>
        <SunmiButton color="slate" className="w-full justify-center" onClick={imprimirTicket}>
          🖨 Imprimir ticket POS
        </SunmiButton>

        {/* ── LA CÁMARA, MIENTRAS NO HAYA UNA COMPOSICIÓN APROBADA ────────
            El V2 no dibuja un botón de escanear al lado del buscador: eso se
            descartó. Pero la cámara sigue existiendo y sacarla sería perder una
            función. Queda acá, que es la superficie aprobada menos invasiva, y
            no se inventa un lugar nuevo en el flujo principal. Solo aparece si
            el navegador sabe leer códigos. */}
        {puedeRecibir && hayEscanerDisponible() && (
          <SunmiButton
            color="slate"
            className="w-full justify-center"
            onClick={() => {
              setMasAcciones(false);
              onAbrirEscaner();
            }}
          >
            📷 Escanear con la cámara
          </SunmiButton>
        )}

        {puedeCancelar && (
          <>
            {/* Separado, porque no es una acción más de la lista.

                Con `sunmi-border border-t` se dibujaba una CAJA VACÍA: esa
                clase del kit pone los cuatro bordes, así que `border-t` solo le
                agregaba grosor arriba y el resto ya estaba puesto. En la captura
                de 390 px se veía un rectángulo blanco entre los botones.
                `SunmiSeparator` es la pieza del kit para esto y no hay que
                adivinarle el color. */}
            <SunmiSeparator />
            <SunmiButton
              color="red"
              className="w-full justify-center"
              onClick={() => {
                setMasAcciones(false);
                abrirPanelCancelar?.();
              }}
            >
              ⛔ Cancelar transferencia
            </SunmiButton>
          </>
        )}
      </SunmiModalLayout>

      {/* ── LA HOJA DE INFORMACIÓN GENERAL ────────────────────────────────
          El MISMO bloque del escritorio, sin una segunda versión. Deja de estar
          desplegado durante el conteo; no deja de existir. */}
      <SunmiModalLayout
        open={infoGeneral}
        title={TITULO_INFO_GENERAL}
        onClose={() => setInfoGeneral(false)}
        z={NIVEL_MODAL_GLOBAL}
        forma="hoja"
        espacioCuerpo="gap-2"
      >
        <TransferenciaHeader item={item} />
      </SunmiModalLayout>

      {/* El panel de cancelación lo dibuja la página, con su preview y su
          motivo. Acá solo se lo deja aparecer cuando está abierto. */}
      {panelCancelar}
    </section>
  );
}
