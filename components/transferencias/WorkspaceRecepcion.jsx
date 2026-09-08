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
import FichaProductoRecepcion, { TEXTO_ESTADO, presentacionDelEnvio } from "./FichaProductoRecepcion";
import AgregarProductoRecibido from "./AgregarProductoRecibido";
import { SectionHead, fmtCantidad } from "./detallePresentacion";
import {
  ESTADO_PRODUCTO,
  FILTRO,
  buscarPorCodigoExacto,
  categoriasDelRemito,
  estadoDeProducto,
  productosVisibles,
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
function FilaProducto({ d, activa, onElegir }) {
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
   * Lo que hace un código leído o tecleado con Enter.
   *
   * Primero adentro del remito, con coincidencia EXACTA: un código identifica un
   * producto o no lo identifica, y una coincidencia parcial abriría la ficha del
   * producto equivocado con la mercadería en la mano.
   *
   * Si el producto YA está —incluido uno agregado antes— se abre su ficha. No se
   * vuelve a agregar.
   */
  const resolverCodigo = (codigo) => {
    const encontrado = buscarPorCodigoExacto(items, codigo);
    if (encontrado) {
      elegir(encontrado);
      // Se limpia el campo para que el siguiente escaneo entre en un campo
      // vacío: el operador va a escanear muchos seguidos.
      setTexto("");
      return true;
    }
    setAviso(MENSAJE_NO_FIGURA);
    setTexto(codigo);
    return false;
  };

  const alEscanear = (codigo) => {
    setEscaneando(false);
    resolverCodigo(codigo);
  };

  const alTeclear = (e) => {
    // Un lector físico escribe el código y manda Enter: mismo camino que la
    // cámara, sin una segunda definición de qué es un escaneo.
    if (e.key === "Enter" && texto.trim()) {
      e.preventDefault();
      resolverCodigo(texto.trim());
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
          {puedeRecibir && (
            <SunmiButton color="slate" onClick={() => setAgregarAbierto(true)}>
              Buscar en catálogo del origen
            </SunmiButton>
          )}
        </div>

        {aviso && (
          <SunmiAviso tono="warning">
            {aviso}
            {aviso === MENSAJE_NO_FIGURA && puedeRecibir && (
              <>
                {" "}
                Si igual llegó, buscalo en el catálogo del origen y agregalo como producto no
                declarado.
              </>
            )}
          </SunmiAviso>
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

      <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-start">
        <div>{listado}</div>
        <div className="lg:sticky lg:top-3">{ficha}</div>
      </div>

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
