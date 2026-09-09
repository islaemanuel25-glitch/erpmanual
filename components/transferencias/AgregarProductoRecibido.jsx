"use client";

// AGREGAR UN PRODUCTO QUE LLEGÓ Y EL REMITO NO MENCIONA.
//
// ── UNA SOLA PIEZA PARA EL TELÉFONO Y PARA EL ESCRITORIO ──────────────────
//
// No hay dos componentes ni dos lógicas. Es `SunmiModalLayout` con
// `forma="hoja-o-centrado"`: hoja pegada al borde de abajo en el teléfono,
// tarjeta centrada de `sm` para arriba. Esa forma ya existía en el kit —la usan
// los dos modales de caja— así que no se inventa una capa nueva.
//
// Lo que cambia entre las dos presentaciones es el envoltorio; lo que se decide
// —qué se busca, qué unidad se eligió, qué cuerpo se manda— vive en
// `lib/transferencias/recepcionUI.js` y es el mismo código en las dos.
//
// ── LOS TRES PASOS, Y POR QUÉ SON TRES ────────────────────────────────────
//
//   1. buscar el producto en el catálogo del ORIGEN;
//   2. decir CÓMO se contó —UNIDAD o BULTO—;
//   3. decir CUÁNTOS.
//
// El paso 2 no se puede saltear y no viene contestado. Es el candado de negocio
// de esta pantalla: una línea agregada DESCUENTA del origen y no hay ningún
// envío contra el cual contrastar la diferencia, así que una unidad supuesta no
// se detecta nunca más. Con factor 20, suponer son 57 unidades que no aparecen
// en ningún lado.
//
// ── EL ORIGEN NO SE PIDE ──────────────────────────────────────────────────
//
// Se manda `transferenciaId` y nada más: el local de origen lo resuelve el
// servidor leyendo la transferencia persistida. Si la pantalla mandara un
// `origenId`, cualquiera podría pedir el catálogo de otro local.
//
// ── SIN MEDIDAS NI ELEMENTOS CRUDOS ───────────────────────────────────────
//
// Las filas de resultado son `SunmiButton` y no `<button>`; los tamaños de letra
// son `text-sm2` y `text-xs2`, que son los tokens de 11px y 10px que ya define
// `tailwind.config.js`; y el alto del modal es el del kit, sin un `vh` elegido a
// ojo. El trinquete de hardcodeo cierra en cero para esta tanda.

import { useEffect, useMemo, useRef, useState } from "react";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiSelectorUnidad from "@/components/sunmi/SunmiSelectorUnidad";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";

import { Campo, fmtCantidad } from "./detallePresentacion";
import {
  MENSAJE_YA_EXISTIA,
  opcionesDeUnidad,
  previsualizarIngresoFisico,
  validarLineaNueva,
} from "@/lib/transferencias/recepcionUI";

// ── EL LENGUAJE: SE INFORMA UNA INCONSISTENCIA, NO SE PIDE MERCADERÍA ─────
//
// Antes decía "Agregar producto recibido" y "Agregar a recepción". Suena a que
// el operador se suma algo, y no es lo que está pasando: llegó mercadería que el
// remito no menciona y él lo está INFORMANDO. La diferencia importa porque de
// esto sale un descuento en el stock del origen y una auditoría con su nombre.
//
// Los nombres internos —el componente, la ruta `linea-recepcion`, el campo
// `agregadoEnRecepcion`— no se tocan: renombrarlos sería mover media base y un
// endpoint desplegado por una cuestión de redacción.
export const TITULO_AGREGAR = "Producto no declarado";
export const ACCION_AGREGAR = "Informar producto no declarado";
export const ROTULO_UNIDAD = "¿Cómo lo contaste?";
export const ROTULO_CANTIDAD = "Cantidad recibida";

/** Espera entre la última tecla y el pedido. Mismo patrón que el resto del ERP. */
const ESPERA_BUSQUEDA = 300;

/**
 * Una fila de resultado del catálogo del origen.
 *
 * Es un `SunmiButton` y no un `<button>` crudo: el trinquete tiene razón en que
 * un elemento nativo suelto se sale del kit y del tema. Se le pide alineación a
 * la izquierda y ancho completo, que es lo único que una fila necesita que un
 * botón no traiga.
 */
function FilaResultado({ p, onElegir }) {
  const factor = Number(p.factorPack || 1);
  return (
    <SunmiButton
      color="slate"
      onClick={() => onElegir(p)}
      className="w-full !justify-start text-left"
    >
      <span className="block min-w-0">
        <span className="block font-semibold sunmi-text-strong break-words">{p.nombre}</span>
        {/* ── NI STOCK NI COSTO ────────────────────────────────────────────
            Acá decía "Stock origen N". Se sacó por dos motivos y el segundo es
            peor que el primero.

            El de fondo: quien informa mercadería que llegó de más no necesita
            saber cuánto hay en el origen, y `transferencias.recibir` no es el
            permiso de ver stock ni costos. El endpoint ya dejó de mandarlos.

            El inmediato: como el endpoint dejó de mandarlos, esto venía
            dibujando "Stock origen 0" para TODOS los productos — un dato falso,
            que es peor que un dato que no está.

            Lo que sí hace falta para identificar lo que se tiene en la mano: el
            nombre, el código y en qué presentación viene. */}
        <span className="block text-sm2 sunmi-text-muted">
          <span className="font-mono">{p.codigoBarra || "Sin código"}</span>
          {" · "}
          {factor > 1 ? `PACK x${factor}` : "Unidad"}
          {p.categoriaNombre ? ` · ${p.categoriaNombre}` : ""}
        </span>
      </span>
    </SunmiButton>
  );
}

export default function AgregarProductoRecibido({
  abierto,
  transferenciaId,
  onCerrar,
  /** Hace el POST y devuelve el JSON del servidor. La pantalla es la dueña del fetch. */
  onAgregar,
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [producto, setProducto] = useState(null);
  // SIN ELEGIR. No es `"UNIDAD"` ni `"BULTO"`: es null, y el usuario tiene que
  // tocar. Ver el encabezado.
  const [unidad, setUnidad] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const dictado = useRef(false);

  const limpiar = () => {
    setQuery("");
    setResultados([]);
    setProducto(null);
    setUnidad(null);
    setCantidad("");
    setMensaje("");
  };

  // Cada apertura empieza de cero: si el modal recordara la unidad de la vez
  // anterior, el "sin elegir" duraría un solo uso.
  useEffect(() => {
    if (abierto) limpiar();
  }, [abierto]);

  // Búsqueda con espera, el mismo patrón inline que usan las otras búsquedas del
  // repo. No se agrega un sistema de fuzzy: el ranking lo hace el servidor con
  // `buscarCatalogoLocal`, el mismo que usa el POS.
  useEffect(() => {
    if (!abierto) return;
    const q = query.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const fueVoz = dictado.current;
    dictado.current = false;
    const t = setTimeout(async () => {
      try {
        const url = new URL("/api/transferencias/buscar-productos-origen", window.location.origin);
        url.searchParams.set("transferenciaId", String(transferenciaId));
        url.searchParams.set("q", q);
        // "true" y no "1": el endpoint compara `=== "true"` literal, igual que
        // los otros tres buscadores por voz del repo. Con "1" el ranking de voz
        // no se activaba nunca y nada avisaba — la búsqueda contestaba, solo que
        // ordenada como si se hubiera tecleado. Se corrige el llamador, no el
        // servidor: cuatro rutas ya usan ese contrato.
        if (fueVoz) url.searchParams.set("fromVoice", "true");
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();
        setResultados(json.ok ? json.items || [] : []);
        if (!json.ok) setMensaje(json.error || "No se pudo buscar en el catálogo del origen.");
      } catch {
        setResultados([]);
        setMensaje("No se pudo buscar en el catálogo del origen.");
      } finally {
        setBuscando(false);
      }
    }, ESPERA_BUSQUEDA);
    return () => clearTimeout(t);
  }, [query, abierto, transferenciaId]);

  const opciones = useMemo(() => (producto ? opcionesDeUnidad(producto) : []), [producto]);

  // Cuántas unidades físicas entran. INFORMATIVO: este número no viaja.
  const ingresoFisico = previsualizarIngresoFisico({
    cantidad,
    unidad,
    factorPack: producto?.factorPack,
  });

  const elegir = (p) => {
    setProducto(p);
    // Cambiar de producto reinicia la unidad Y la cantidad. Las dos son
    // decisiones que se tomaron mirando OTRO producto: "2" contado en bultos de
    // 6 no significa lo mismo que "2" en bultos de 24, y dejar el número puesto
    // invita a confirmar sin volver a pensarlo. Es el mismo motivo por el que la
    // unidad no tiene default — arrastrarla del producto anterior sería
    // exactamente eso, un default con otro nombre.
    //
    // El texto buscado SÍ se conserva: sirve para elegir otro resultado de la
    // misma búsqueda, y no es una decisión sobre el producto.
    setUnidad(null);
    setCantidad("");
    setMensaje("");
  };

  const agregar = async () => {
    const plan = validarLineaNueva({ transferenciaId, producto, unidadEnviada: unidad, recibido: cantidad });
    if (!plan.ok) {
      // NO se llama al POST. El servidor lo rechazaría igual, pero un pedido que
      // ya se sabe que va a fallar solo sirve para que el error llegue más tarde
      // y peor explicado.
      setMensaje(plan.mensaje);
      return;
    }
    try {
      setEnviando(true);
      setMensaje("");
      const json = await onAgregar(plan.cuerpo);
      if (!json?.ok) {
        setMensaje(json?.error || "No se pudo agregar la línea.");
        return;
      }
      if (json.yaExistia) {
        // El servidor NO creó una segunda fila y contesta cuál es la que ya
        // existe. La pantalla no suma la cantidad sola: dice dónde corregirla.
        setMensaje(json.mensaje || MENSAJE_YA_EXISTIA);
        return;
      }
      onCerrar?.();
    } catch (e) {
      setMensaje(e?.message || "No se pudo agregar la línea.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SunmiModalLayout
      open={abierto}
      title={TITULO_AGREGAR}
      subtitle="Llegó algo que el remito no menciona. Buscalo en el catálogo del origen."
      onClose={onCerrar}
      // El mismo nivel que el escáner, y por la misma puerta: los dos conviven
      // en este flujo y el número vive una sola vez, en el dueño de la capa.
      z={NIVEL_MODAL_GLOBAL}
      // Es carga: la cantidad y la unidad ya elegidas se perderían con un toque
      // al costado, y en el teléfono ese toque pasa solo.
      destructivo
      forma="hoja-o-centrado"
      // El alto lo pone el kit. No se elige un `vh` a ojo para imitar una
      // maqueta: la lista de resultados crece contra el cuerpo con `flex-1
      // min-h-0`, que es lo que hace aparecer el scroll donde corresponde.
      // Sin `maxWidth`, por lo mismo que el escáner: el default del kit alcanza
      // y `sm:max-w-lg` era una medida responsive elegida en la pantalla.
      espacioCuerpo="px-4 space-y-3"
      footer={
        // Apilados en el teléfono y en fila de `sm` para arriba, con Cancelar en
        // su ancho natural y la acción ocupando lo que sobra.
        //
        // Decía `grid grid-cols-1 sm:grid-cols-[auto_1fr]`, que es un valor
        // arbitrario. Con flex sale con primitivas y da lo mismo: en columna los
        // hijos se estiran solos, y en fila `sm:flex-1` es el `1fr`. `SunmiButton`
        // negocia alto, display, padding, radio y letra — no el ancho ni el flex—
        // así que la clase llega tal cual.
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <SunmiButton color="slate" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </SunmiButton>
          <SunmiButton color="amber" onClick={agregar} disabled={enviando} className="sm:flex-1">
            {enviando ? "Informando…" : ACCION_AGREGAR}
          </SunmiButton>
        </div>
      }
    >
      {/* 1 · BUSCAR */}
      <SunmiCampoBusquedaVoz
        value={query}
        onChange={(v) => setQuery(v)}
        onVoz={(t) => {
          dictado.current = true;
          setQuery(t);
        }}
        placeholder="Buscar producto del origen…"
        ariaLabel="Buscar producto del origen"
        autoFocus
        avisoDeEstado={
          buscando ? <div className="text-sm2 sunmi-text-muted mt-2">Buscando…</div> : null
        }
      />

      {!producto && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
          {buscando && resultados.length === 0 && (
            <div className="py-4 text-center">
              <SunmiLoader />
            </div>
          )}
          {!buscando && query.trim().length >= 2 && resultados.length === 0 && (
            <div className="text-center py-4 sunmi-text-muted text-sm2">
              No hay productos del origen que coincidan.
            </div>
          )}
          {resultados.map((p) => (
            <FilaResultado key={p.productoLocalId} p={p} onElegir={elegir} />
          ))}
        </div>
      )}

      {/* 2 · QUÉ SE ELIGIÓ, Y CÓMO SE CONTÓ */}
      {producto && (
        <>
          <div className="sunmi-surface-soft sunmi-border rounded-lg p-2.5 flex items-start justify-between gap-3">
            {/* `Campo` es el par rótulo/valor que ya usa la información general
                del detalle: mismo tamaño, mismo tono, y ningún px nuevo. */}
            <Campo label="Producto elegido">
              {producto.nombre}
              <span className="block text-sm2 sunmi-text-muted font-mono">
                {producto.codigoBarra || "Sin código"}
              </span>
            </Campo>
            <SunmiButton color="slate" onClick={() => elegir(null)} className="shrink-0">
              Cambiar
            </SunmiButton>
          </div>

          {/* SIN PRESELECCIÓN. `valor` arranca en null y los dos botones salen
              sin presionar: el kit ya sabe representar "todavía nada elegido". */}
          <SunmiSelectorUnidad
            rotulo={ROTULO_UNIDAD}
            valor={unidad}
            opciones={opciones}
            onCambiar={(v) => {
              setUnidad(v);
              setMensaje("");
            }}
            nota={
              opciones.length === 1
                ? "Este producto no se maneja por bulto."
                : "Elegí en qué contaste lo que llegó."
            }
          />

          {/* 3 · CUÁNTOS */}
          <div>
            <div className="text-sm2 sunmi-text-muted mb-1">{ROTULO_CANTIDAD}</div>
            <SunmiInput
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
            />
            {/* La preview. Este número NO se manda: el servidor aplica el factor
                una sola vez. Ver `previsualizarIngresoFisico`. */}
            {ingresoFisico != null && (
              <div className="text-sm2 sunmi-text-muted mt-1">
                Ingreso físico: {fmtCantidad(ingresoFisico)} unidades
              </div>
            )}
          </div>
        </>
      )}

      {mensaje && <SunmiAviso tono="warning">{mensaje}</SunmiAviso>}
    </SunmiModalLayout>
  );
}
