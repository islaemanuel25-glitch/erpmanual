"use client";

// components/comprobantes/PanelComprobantes.jsx
//
// El panel de comprobantes de una recepción: subir, ver, agrupar y leer.
//
// Se monta DENTRO de la pantalla de recepción que ya existe, no es una pantalla
// nueva. La conciliación contra el pedido —vincular cada línea a un producto—
// viene después y va en la tabla de arriba.
//
// ── ACÁ YA NO SE VEN LAS LÍNEAS ────────────────────────────────────────────
//
// Este panel administra los comprobantes: subir, leer, unir y borrar. Las líneas
// leídas y su conciliación contra el pedido viven en la LISTA ÚNICA de abajo,
// que es una sola y agrupada por comprobante.
//
// Antes se desplegaban acá, y el detalle del pedido estaba en otra tabla más
// abajo: había que ir de una a la otra y cruzarlas de memoria.
//
// ── LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO ─────────────────────────────
//
// Que "no se pudo leer bien" y "el papel no cierra" son cosas distintas, CON
// PALABRAS distintas y no solo con colores distintos. Quien mira apurado lee la
// palabra, no el tono. Los textos están en lib/.../pantalla.js con su candado.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import {
  debePreguntarPorAgrupar,
  comprobantesQuePuedenRecibirHojas,
  comoSeDice,
  resumenDeLista,
} from "@/lib/compras-proveedor/comprobante/pantalla";
import { sePuedeBorrar, textoDeBorrado } from "@/lib/compras-proveedor/comprobante/borrado";
import { ORIGEN_DE_LECTURA } from "@/lib/compras-proveedor/comprobante/origenDeLectura";
import {
  OPERACION,
  queHacerHttp,
  SIN_RESPUESTA,
  SIN_RESPUESTA_LECTURA,
} from "@/lib/compras-proveedor/comprobante/subida";

/**
 * VOLVER A LEER UN PAPEL QUE YA SE LEYÓ.
 *
 * Decía "Releer", que es una palabra de sistema. Dice lo que hace.
 *
 * ── CUÁNDO APARECE, QUE ES LO QUE IMPORTA ─────────────────────────────────
 *
 * Solo con `puedeRecibir`, que en la recepción es el estado ENVIADO. En un
 * pedido RECIBIDO no está, y no puede estar: recibir ya movió stock y escribió
 * costos, así que releer el papel cambiaría las líneas de abajo de números que
 * ya se aplicaron.
 *
 * Existe para esto: con la explicación del proveedor recién guardada, el mismo
 * papel se vuelve a leer y ahora cierra.
 */
export const TEXTO_LEER_DE_NUEVO = "Leer de nuevo";

const TONOS = {
  ok: "sunmi-text-success",
  info: "sunmi-text-accent",
  aviso: "sunmi-text-warning",
  peligro: "sunmi-text-danger",
  neutro: "sunmi-text-muted",
};

function tamano(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function identidad(c) {
  if (!c.numero) return "Sin número todavía";
  return `${c.tipo ?? ""} ${c.puntoVenta ?? ""}-${c.numero}`.trim();
}

/** La tira de aviso: barra de color, frase corta en negrita, detalle chico. */
function Aviso({ estado }) {
  const v = comoSeDice(estado);
  // ── EL CARTEL ROJO DE "NO SE PUDO LEER BIEN" YA NO VA ────────────────
  //
  // Decía que la lectura no es confiable y que hay que sacar otra foto o
  // cargarlo a mano, y arriba de la lista ahora está el bloque que señala QUÉ
  // renglón no da su cuenta y ofrece los dos números. Un cartel que manda a
  // repetir todo, dibujado encima de la herramienta que arregla el renglón
  // suelto, empuja al camino caro.
  //
  // El estado sigue estando —la tarjeta lo dice en su título— y los otros
  // avisos quedan como estaban.
  if (estado === "MAL_LEIDO") return null;
  return (
    // La barra usa `bg-current`, o sea el MISMO color que el texto del título.
    // No hay una segunda tabla de colores que pueda quedar desfasada del tono.
    <div className={`flex gap-2 ${TONOS[v.tono] || TONOS.neutro}`}>
      <div className="w-1 rounded shrink-0 bg-current" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-bold">{v.titulo}</p>
        <p className="text-sm2 sunmi-text-muted leading-snug">{v.detalle}</p>
      </div>
    </div>
  );
}

/**
 * De una respuesta del servidor a un mensaje que dice QUÉ PASÓ.
 *
 * NINGÚN texto se escribe a mano acá: todos salen del catálogo. El 2026-08-11
 * los tres mensajes de esta pantalla estaban escritos inline —"No se pudo
 * subir. Probá de nuevo."— y no decían nada; el candado no los atajó porque
 * miraba el catálogo, que es donde no estaban.
 *
 * EL ESTADO SE MIRA ANTES DE LEER EL JSON. Un 413 lo contesta el proxy con una
 * página HTML, así que `r.json()` revienta y todo el mensaje del servidor se
 * pierde en un `catch` genérico. Eso fue justamente lo que pasó.
 */
async function mensajeDeRespuesta(r, operacion = OPERACION.SUBIDA) {
  if (!r.ok) {
    // ── QUÉ SE ESTABA HACIENDO, NO SOLO QUÉ CONTESTÓ EL SERVIDOR ────────
    //
    // El mismo 502 significa cosas distintas subiendo y leyendo, y el texto de
    // la subida AFIRMA "No se subió nada". Usado para una lectura fallida, eso
    // es falso: la foto ya está guardada, y la pantalla la está mostrando dos
    // centímetros más abajo. Pasó en producción con el pedido 240.
    const { texto } = queHacerHttp(r.status, { operacion });
    // Si el servidor mandó JSON con su propio motivo, ese gana: sabe más que la
    // tabla por estado. Si no se puede leer —página de error del proxy—, queda
    // el texto del estado, que igual dice qué pasó.
    try {
      const d = await r.json();
      if (d?.queHacer || d?.error) return { tipo: "error", texto: d.queHacer || d.error };
    } catch {}
    return { tipo: "error", texto };
  }
  return null;
}

export default function PanelComprobantes({
  pedidoId,
  /**
   * ── LEER APENAS SE SUBE ─────────────────────────────────────────────────
   *
   * Para un pedido que NACE de la factura el camino acordado es uno solo: foto
   * → se lee → se arma el pedido. Sin esto queda en "Sin leer" esperando un
   * toque más, y el pedido queda vacío: no hay nada que recibir hasta que
   * alguien toque «Leer». Pasó en producción con el pedido 240.
   *
   * En un pedido NORMAL sigue apagado, y a propósito: ahí el pedido ya tiene
   * sus líneas, la foto es para conciliar, y leer sola gastaría una consulta de
   * IA que nadie pidió —la cuota son veinte por día—.
   */
  leerAlSubir = false,
  proveedorId,
  puedeRecibir = true,
  /**
   * ── LA PRESENTACIÓN DEL ESTADO VACÍO, PUESTA DESDE AFUERA ───────────────
   *
   * Cuando todavía no hay ningún comprobante, la pantalla de recibir un pedido
   * no quiere una tabla vacía que diga "Todavía no hay comprobantes": quiere el
   * bloque de la factura, que es la única acción que hay para hacer ahí.
   *
   * Se pasa como función y no como nodo para que reciba los DOS disparadores y
   * el estado de subida. Así el bloque de afuera no tiene que conocer el
   * endpoint, la validación de tamaño, la detección de duplicados ni el modal
   * de "¿es una factura nueva o una hoja?": sigue habiendo UN solo circuito de
   * subida y lo que cambia es la cara.
   *
   * Sin esta prop el panel se dibuja exactamente como antes.
   */
  vacio = null,
  /**
   * Cuántos comprobantes hay, avisado hacia afuera.
   *
   * La pantalla de recibir necesita saberlo para decidir qué muestra debajo: sin
   * ningún comprobante no tiene sentido dibujar las 197 líneas del pedido.
   * Avisa el panel, que es el que ya los carga, en vez de que la pantalla pida
   * la misma lista por su cuenta — dos consultas de lo mismo se separan el día
   * que una se filtra distinto.
   */
  onCantidad = null,
  /**
   * Cuáles comprobantes no cerraron, avisado hacia afuera.
   *
   * La pantalla de recibir dibuja arriba de la conciliación el bloque para
   * corregirlos, y lo hace con la lista que este panel YA cargó. Pedirla por
   * segunda vez desde afuera sería dos consultas de lo mismo, que se separan el
   * día que una se filtre distinto.
   */
  onMalLeidos = null,
}) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [cobertura, setCobertura] = useState(null);
  const [cuota, setCuota] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [pregunta, setPregunta] = useState(null); // { archivos, opciones, candidatos }
  const [seleccion, setSeleccion] = useState([]);
  const [borrando, setBorrando] = useState(null); // el comprobante que se está por borrar
  const [trabajandoBorrar, setTrabajandoBorrar] = useState(false);
  const inputRef = useRef(null);

  const resumen = useMemo(() => resumenDeLista(items), [items]);
  const abiertos = useMemo(
    () => comprobantesQuePuedenRecibirHojas(items, proveedorId),
    [items, proveedorId]
  );

  async function recargar() {
    setCargando(true);
    try {
      const q = pedidoId ? `pedidoId=${pedidoId}` : `proveedorId=${proveedorId}`;
      const r = await fetch(`/api/compras-proveedor/comprobantes/listar?${q}`);
      const d = await r.json();
      if (d.ok) {
        setItems(d.items || []);
        onCantidad?.((d.items || []).length);
        onMalLeidos?.((d.items || []).filter((c) => c.estado === "MAL_LEIDO").map((c) => c.id));
        setCobertura(d.cobertura ?? null);
        setCuota(d.cuota ?? null);
      } else setMensaje({ tipo: "error", texto: d.error });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId, proveedorId]);

  // ── Elegir archivos: acá se decide si hace falta preguntar ─────────────
  // ── LA CÁMARA ES OTRO CAMPO, NO OTRO CIRCUITO ──────────────────────────
  //
  // `capture` no se puede prender y apagar sobre el mismo `input`: el navegador
  // lo lee al abrir el selector, y cambiarlo por estado deja una carrera entre
  // el render y el toque. Dos campos ocultos, el mismo `onChange`, la misma
  // subida.
  const inputCamaraRef = useRef(null);

  function alElegirArchivos(e) {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;

    const decision = debePreguntarPorAgrupar({
      cantidadFotos: archivos.length,
      comprobantesAbiertos: abiertos,
    });

    // Si no hace falta preguntar, se sube directo. Es la recepción normal, que
    // es la mayoría: un toque de más ahí se paga en todas.
    if (!decision.preguntar) {
      subir(archivos, { agruparEnUno: false });
      return;
    }
    setPregunta({ archivos, ...decision });
  }

  async function subir(archivos, { agruparEnUno = false, comprobanteId = null } = {}) {
    setPregunta(null);
    setSubiendo(true);
    setMensaje(null);
    try {
      const fd = new FormData();
      fd.append("proveedorId", String(proveedorId));
      if (pedidoId) fd.append("pedidoId", String(pedidoId));
      if (agruparEnUno) fd.append("agruparEnUno", "true");
      if (comprobanteId) fd.append("comprobanteId", String(comprobanteId));
      for (const a of archivos) fd.append("archivos", a);

      const r = await fetch("/api/compras-proveedor/comprobantes/subir", { method: "POST", body: fd });
      const fallo = await mensajeDeRespuesta(r);
      if (fallo) {
        setMensaje(fallo);
        await recargar();
        return;
      }
      const d = await r.json();

      if (!d.ok && d.error) {
        setMensaje({ tipo: "error", texto: d.queHacer || d.error });
      } else {
        // Los fallos POR ARCHIVO se muestran todos juntos: quien subió cinco
        // fotos tiene que ver de una cuáles entraron y qué pasó con las otras.
        const fallados = (d.resultados || []).filter((x) => !x.ok);
        setMensaje({
          tipo: fallados.length ? "aviso" : "ok",
          texto: `${d.subidos} subida(s).`,
          detalles: fallados.map((f) => `${f.nombre}: ${f.queHacer || f.error}`),
        });

        // ── Y SE LEE SOLA, CUANDO EL PEDIDO NACE DE ESTA FACTURA ────────
        //
        // Solo si entró UN comprobante: con dos, cuál leer primero es una
        // decisión y la toma la persona. `leer` se encarga del resto, incluido
        // el mensaje de lo que pasó, que reemplaza al "1 subida(s)" de arriba
        // porque es lo último que ocurrió.
        const nuevos = [
          ...new Set((d.resultados || []).filter((x) => x.ok && x.comprobanteId).map((x) => x.comprobanteId)),
        ];
        if (leerAlSubir && nuevos.length === 1) {
          setSubiendo(false);
          await leer(nuevos[0], ORIGEN_DE_LECTURA.AL_SUBIR);
          return;
        }
      }
      await recargar();
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA.texto });
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /**
   * ── ANTES DE LEER: ¿ALGUIEN EXPLICÓ CÓMO SE LEE ESTE PAPEL? ─────────────
   *
   * Sin explicación, el modelo adivina qué columna es la cantidad, si hay
   * descuento y si el precio es por kilo. Medido sobre el papel de Paty: sin
   * explicación no cerraba, con explicación cierra. Leer igual gasta una
   * consulta de IA de las que hay contadas por día para conseguir un MAL_LEIDO
   * casi seguro, y encima deja al que recibe con un cartel rojo y nada que
   * hacer.
   *
   * Así que la primera vez se va a la receta, CON ESTA FOTO como papel de
   * prueba: se explica una vez, se prueba ahí mismo, y al guardar se vuelve.
   *
   * No es un bloqueo escondido: la receta muestra la misma foto y termina en
   * «Leer de nuevo». Y es una sola vez por proveedor — con la explicación
   * guardada, este camino no se vuelve a tomar.
   */
  async function faltaLaExplicacion() {
    if (!proveedorId) return false;
    try {
      const r = await fetch(
        `/api/compras-proveedor/recetas/explicacion?proveedorId=${proveedorId}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      // Si no se pudo preguntar, se lee igual. Un problema para consultar la
      // receta no puede convertirse en "no se puede leer la factura".
      if (!d?.ok) return false;
      return !String(d.explicacion || "").trim();
    } catch {
      return false;
    }
  }

  // `origen` no es decoración: una lectura reescribe los renglones del
  // comprobante, así que la tabla tiene que poder decir quién la pidió. Sin
  // esto hubo que deducirlo cruzando dos números para contestar por qué el
  // comprobante del pedido 242 tenía diez lecturas.
  async function leer(id, origen = ORIGEN_DE_LECTURA.BOTON) {
    setLeyendo(id);
    setMensaje(null);
    try {
      if (await faltaLaExplicacion()) {
        const volverA = typeof window !== "undefined" ? window.location.pathname : "";
        router.push(
          `/modulos/proveedores/recetas/${proveedorId}?comprobante=${id}` +
            `&volverA=${encodeURIComponent(volverA)}`
        );
        return;
      }
      const r = await fetch(`/api/compras-proveedor/comprobantes/leer/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origen }),
      });
      const fallo = await mensajeDeRespuesta(r, OPERACION.LECTURA);
      if (fallo) {
        setMensaje(fallo);
        await recargar();
        return;
      }
      const d = await r.json();
      if (!d.ok) {
        setMensaje({ tipo: "error", texto: d.error || d.queHacer });
      } else {
        // ── ACÁ SALÍA EL CARTEL NARANJA LARGO ───────────────────────────
        //
        // Mostraba `d.porque`, que nombraba el renglón por su número —"la 5"—,
        // escribía los importes en formato de máquina y rehacía una cuenta que
        // no es la del control. Todo eso lo dice mejor el bloque de arriba de la
        // conciliación, con el nombre del producto, los dos números y la foto.
        //
        // Acá queda el resultado en una línea, que es lo que hace falta saber
        // justo después de tocar «Leer».
        setMensaje({
          tipo: d.cierra ? "ok" : "aviso",
          texto: d.cierra
            ? `Leído y verificado: ${d.lineas} ${d.lineas === 1 ? "producto" : "productos"}.`
            : "Leído, pero la cuenta no cierra. Está señalado abajo, con la foto al lado.",
          detalles: d.usoRespaldo ? ["Lo leyó el lector de respaldo."] : [],
        });
      }
      await recargar();
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA_LECTURA.texto });
    } finally {
      setLeyendo(null);
    }
  }

  async function unir() {
    if (seleccion.length < 2) return;
    setMensaje(null);
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/unir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: seleccion }),
      });
      const fallo = await mensajeDeRespuesta(r);
      if (fallo) { setMensaje(fallo); await recargar(); return; }
      const d = await r.json();
      setMensaje({ tipo: d.ok ? "ok" : "error", texto: d.ok ? d.queHacer : d.error });
      setSeleccion([]);
      await recargar();
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA.texto });
    }
  }

  async function borrar(c) {
    setTrabajandoBorrar(true);
    setMensaje(null);
    try {
      const r = await fetch(`/api/compras-proveedor/comprobantes/borrar/${c.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      setMensaje({ tipo: d?.ok ? "ok" : "error", texto: d?.queHacer || d?.error });
      setBorrando(null);
      setSeleccion((s) => s.filter((x) => x !== c.id));
      await recargar();
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA.texto });
    } finally {
      setTrabajandoBorrar(false);
    }
  }

  const alternar = (id) =>
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <SunmiCard className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold sunmi-text-strong">Comprobantes</h3>
          <p className="text-sm2 sunmi-text-muted">
            {resumen.total === 0
              ? "Sacá una foto de la factura. Si es larga, sacá una por hoja."
              : `${resumen.total} en total · ${resumen.sinLeer} sin leer` +
                (resumen.malLeidos ? ` · ${resumen.malLeidos} sin poder leer` : "")}
          </p>
        </div>
        {/* ── EL BOTÓN PROPIO DEL PANEL SE CALLA CUANDO LA PANTALLA PONE
            EL SUYO ────────────────────────────────────────────────────────
            Con la pantalla de recibir dibujando su bloque de "Sacar foto",
            este quedaba justo encima: dos botones pegados que hacen lo mismo,
            y el de arriba naranja y de ancho completo. Mientras no haya ningún
            comprobante y la pantalla haya puesto su cara, manda la de ella. */}
        {puedeRecibir && !vacio && (
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {seleccion.length >= 2 && (
              <SunmiButton color="slate" type="button" onClick={unir}>
                Unir {seleccion.length} en uno
              </SunmiButton>
            )}
            {/* LA ACCIÓN PRINCIPAL DE LA PANTALLA, y se toca con el dedo en el
                Sunmi. Los 36px del botón del kit alcanzan para el mouse y no
                para el pulgar: `py-3` lo lleva a 44, que es la medida a la que
                se apunta sin errarle. Y a lo ancho en el celular, donde no hay
                nada que compita por ese espacio: el blanco alrededor de un
                botón chico es lo que lo hacía parecer una etiqueta. */}
            <SunmiButton
              color="primary"
              type="button"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
              className="py-3 px-5 text-sm font-bold w-full sm:w-auto justify-center"
            >
              {subiendo ? "Subiendo…" : "Subir fotos"}
            </SunmiButton>
          </div>
        )}
        <SunmiInput
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.xlsx,.xls"
          className="hidden"
          onChange={alElegirArchivos}
        />
        {/* El de la cámara. Mismo `onChange` y misma subida: lo único que
            cambia es de dónde sale el archivo. */}
        <SunmiInput
          ref={inputCamaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={alElegirArchivos}
        />
      </div>

      {/* ── LA COBERTURA DEL PEDIDO ─────────────────────────────────────
          Contra TODOS los comprobantes, no contra cada uno: un pedido se cubre
          con varias facturas. Y NO se dibuja como aviso mientras falten
          comprobantes por leer — un cartel que siempre dice que falta algo deja
          de significar que falta algo. */}
            {/* LA COBERTURA SE DICE UNA SOLA VEZ, y va en la lista única: es donde
          están las líneas que faltan, así que el texto y lo que describe se leen
          juntos. Acá quedaba repetida palabra por palabra, dos paneles más
          arriba de lo que nombra. */}

      {/* CUÁNTAS LECTURAS QUEDAN HOY.
          Solo cuando quedan pocas: un aviso permanente deja de leerse, y el
          umbral no se decide acá sino en cuota.js, que es donde está el motivo.
          Va SIEMPRE con la hora del corte: un "quedan 3" sin decir hasta cuándo
          obliga a adivinar, y la medianoche que importa no es la de acá. */}
      {cuota?.mostrar && (
        <p className={`mb-3 text-sm2 ${cuota.quedan === 0 ? "sunmi-text-danger" : "sunmi-text-warning"}`}>
          {cuota.quedan === 0
            ? "No quedan lecturas automáticas por hoy."
            : `Quedan ${cuota.quedan} ${cuota.quedan === 1 ? "lectura automática" : "lecturas automáticas"} por hoy.`}{" "}
          <span className="sunmi-text-muted">
            Se reponen a las {cuota.reponeALas}. Los comprobantes se pueden subir igual y leerlos
            después, o cargarlos a mano.
          </span>
        </p>
      )}

      {mensaje && (
        <div
          className={`mb-3 rounded border p-2 text-xs sunmi-border ${
            mensaje.tipo === "error"
              ? "sunmi-text-danger"
              : mensaje.tipo === "aviso"
              ? "sunmi-text-warning"
              : "sunmi-text-success"
          }`}
        >
          <p className="font-bold">{mensaje.texto}</p>
          {(mensaje.detalles || []).map((d, i) => (
            <p key={i} className="sunmi-text-muted mt-0.5">
              {d}
            </p>
          ))}
        </div>
      )}

      {cargando ? (
        <SunmiLoader />
      ) : vacio && items.length === 0 ? (
        // ── SIN COMPROBANTES: LA CARA QUE PONE LA PANTALLA ────────────────
        //
        // En vez de una tabla vacía que dice "Todavía no hay comprobantes", la
        // pantalla de recibir un pedido pone acá el bloque de la factura, que
        // es la única acción que hay para hacer en ese estado. Los dos
        // disparadores salen de este panel: el circuito de subida sigue siendo
        // uno solo.
        vacio({
          sacarFoto: () => inputCamaraRef.current?.click(),
          subir: () => inputRef.current?.click(),
          subiendo,
        })
      ) : (
        <>
          {/* ── Escritorio: tabla ────────────────────────────────────── */}
          <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
            <SunmiTable headers={["", "Comprobante", "Estado", "Fotos", "Líneas", "Último intento", ""]}>
              {items.length === 0 ? (
                <SunmiTableEmpty message="Todavía no hay comprobantes" />
              ) : (
                items.map((c) => (
                  <SunmiTableRow key={c.id}>
                    <td className="px-2 py-1.5 align-top">
                      <SunmiInput
                        type="checkbox"
                        className="w-4"
                        checked={seleccion.includes(c.id)}
                        onChange={() => alternar(c.id)}
                        aria-label={`Elegir comprobante ${c.id}`}
                      />
                    </td>
                    <td className="px-3 py-1.5 align-top">
                      <p className="text-xs font-bold sunmi-text-strong">{identidad(c)}</p>
                      <p className="text-sm2 sunmi-text-muted">
                        {c.proveedor?.nombre} · {new Date(c.createdAt).toLocaleString("es-AR")}
                      </p>
                    </td>
                    <td className="px-3 py-1.5 align-top max-w-[22rem]">
                      <Aviso estado={c.estado} />
                    </td>
                    <td className="px-3 py-1.5 align-top text-xs">
                      {c.fotos === 0 ? (
                        <span className="sunmi-text-muted">vencidas</span>
                      ) : (
                        <>
                          {c.fotos}
                          {c.fotos > 1 && (
                            <span className="sunmi-text-muted"> hojas</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-1.5 align-top text-xs">{c._count?.lineas ?? 0}</td>
                    <td className="px-3 py-1.5 align-top text-sm2 sunmi-text-muted">
                      {/* El campo guarda el ÚLTIMO QUE INTENTÓ, no el que leyó:
                          la ruta lo escribe también cuando la lectura falla. El
                          encabezado decía "Leyó" y afirmaba algo que no pasó. */}
                      {c.modeloLectura || "—"}
                      {c.modeloLectura && !c.leidoEn && (
                        <span className="block sunmi-text-warning">intentó, no leyó</span>
                      )}
                      {c.usoRespaldo && <span className="block">(respaldo)</span>}
                      {c.intentosLectura > 1 && (
                        <span className="block">{c.intentosLectura} intentos</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 align-top text-right whitespace-nowrap">
                      {puedeRecibir && c.fotos > 0 && (
                        <SunmiButton
                          color="primary"
                          type="button"
                          disabled={leyendo === c.id}
                          onClick={() => leer(c.id)}
                        >
                          {leyendo === c.id ? "Leyendo…" : c.leidoEn ? TEXTO_LEER_DE_NUEVO : "Leer"}
                        </SunmiButton>
                      )}
                      {puedeRecibir && sePuedeBorrar(c).ok && (
                        <SunmiButton color="slate" type="button" onClick={() => setBorrando(c)}>
                          Borrar
                        </SunmiButton>
                      )}
                    </td>
                  </SunmiTableRow>
                ))
              )}
            </SunmiTable>
          </div>

          {/* ── Móvil: tarjetas ──────────────────────────────────────── */}
          <div className="md:hidden flex flex-col gap-2">
            {items.length === 0 && (
              <p className="text-xs sunmi-text-muted py-4 text-center">
                Todavía no hay comprobantes
              </p>
            )}
            {items.map((c) => (
              <div key={c.id} className="rounded border sunmi-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold sunmi-text-strong truncate">{identidad(c)}</p>
                    <p className="text-sm2 sunmi-text-muted truncate">{c.proveedor?.nombre}</p>
                  </div>
                  <SunmiInput
                    type="checkbox"
                    className="w-4"
                    checked={seleccion.includes(c.id)}
                    onChange={() => alternar(c.id)}
                    aria-label={`Elegir comprobante ${c.id}`}
                  />
                </div>
                <div className="mt-2">
                  <Aviso estado={c.estado} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {/* ── ACÁ DECÍA "1 foto(s) · 11 líneas · gemini-3.6-flash" ──
                      Tres cosas que no son del mostrador: el paréntesis de
                      plural, la palabra "líneas" —son PRODUCTOS— y el nombre
                      del modelo, que no le dice nada a quien recibe la
                      mercadería y ocupa el lugar de algo que sí. El modelo se
                      sigue guardando: se mira en la base cuando hay que medir
                      cuál lee mejor, que es para lo que existe. */}
                  <p className="text-sm2 sunmi-text-muted">
                    {c.fotos === 0
                      ? "fotos vencidas"
                      : `${c.fotos} ${c.fotos === 1 ? "foto" : "fotos"}`}
                    {c._count?.lineas
                      ? ` · ${c._count.lineas} ${c._count.lineas === 1 ? "producto" : "productos"}`
                      : ""}
                  </p>
                  <div className="flex gap-1">
                    {puedeRecibir && c.fotos > 0 && (
                      <SunmiButton
                        color="primary"
                        type="button"
                        disabled={leyendo === c.id}
                        onClick={() => leer(c.id)}
                      >
                        {leyendo === c.id ? "Leyendo…" : c.leidoEn ? TEXTO_LEER_DE_NUEVO : "Leer"}
                      </SunmiButton>
                    )}
                    {puedeRecibir && sePuedeBorrar(c).ok && (
                      <SunmiButton color="slate" type="button" onClick={() => setBorrando(c)}>
                        Borrar
                      </SunmiButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Confirmar el borrado ─────────────────────────────────────────
          Un comprobante con veinte líneas leídas y ocho vinculadas a mano es
          media hora de trabajo. Se dice CON NÚMEROS qué se lleva puesto: un
          "esta acción no se puede deshacer" genérico no lo lee nadie.
          El botón que borra va en rojo y NO es el primero: el que cancela está
          antes, porque el dedo cae en el de arriba. */}
      {borrando && (
        <SunmiModalLayout
          open
          title="¿Borrar este comprobante?"
          subtitle={identidad(borrando)}
          color="red"
          onClose={() => (trabajandoBorrar ? null : setBorrando(null))}
          // El valor que este modal ya tenía: era el default del kit y ahora se
          // declara, porque el kit dejó de tener uno. No cambia un píxel.
          espacioCuerpo="mt-2 gap-3"
          // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
          // default de `z`.
          z={9999}
        >
          {(() => {
            const d = textoDeBorrado({
              lineas: borrando._count?.lineas ?? 0,
              vinculadas: borrando.lineasVinculadas ?? 0,
              fotos: borrando.fotos ?? 0,
              identidad: borrando.numero ? identidad(borrando) : null,
            });
            return (
              <>
                <p className="text-xs sunmi-text-strong leading-snug">{d.texto}</p>
                {d.aviso && (
                  <p className="text-xs sunmi-text-warning leading-snug mt-2 font-bold">{d.aviso}</p>
                )}
                <div className="flex flex-col gap-2 mt-4">
                  <SunmiButton
                    color="slate"
                    type="button"
                    disabled={trabajandoBorrar}
                    className="py-3 justify-center"
                    onClick={() => setBorrando(null)}
                  >
                    No, dejarlo
                  </SunmiButton>
                  <SunmiButton
                    color="red"
                    type="button"
                    disabled={trabajandoBorrar}
                    className="py-3 justify-center"
                    onClick={() => borrar(borrando)}
                  >
                    {trabajandoBorrar ? "Borrando…" : "Sí, borrarlo"}
                  </SunmiButton>
                </div>
              </>
            );
          })()}
        </SunmiModalLayout>
      )}

      {/* ── La pregunta al subir ──────────────────────────────────────── */}
      {pregunta && (
        <SunmiModalLayout
          open
          title="¿Es una factura nueva o otra hoja?"
          subtitle="Contestá ahora, con el papel en la mano"
          color="cyan"
          onClose={() => setPregunta(null)}
          espacioCuerpo="mt-2 gap-3"
          // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
          // default de `z`.
          z={9999}
        >
          <p className="text-xs sunmi-text-muted mb-3">{pregunta.porque}</p>

          <div className="flex flex-col gap-2">
            {pregunta.opciones.includes("UNA_POR_FOTO") && (
              <SunmiButton
                color="slate"
                type="button"
                onClick={() => subir(pregunta.archivos, { agruparEnUno: false })}
              >
                Son {pregunta.archivos.length} facturas distintas
              </SunmiButton>
            )}
            {pregunta.opciones.includes("TODAS_UNA_SOLA") && (
              <SunmiButton
                color="primary"
                type="button"
                onClick={() => subir(pregunta.archivos, { agruparEnUno: true })}
              >
                Son {pregunta.archivos.length} hojas de UNA factura
              </SunmiButton>
            )}
            {pregunta.opciones.includes("NUEVO") && (
              <SunmiButton
                color="slate"
                type="button"
                onClick={() => subir(pregunta.archivos, { agruparEnUno: false })}
              >
                Es una factura nueva
              </SunmiButton>
            )}
            {pregunta.opciones.includes("SUMAR_A_EXISTENTE") &&
              (pregunta.candidatos || []).map((c) => (
                <SunmiButton
                  key={c.id}
                  color="primary"
                  type="button"
                  onClick={() => subir(pregunta.archivos, { comprobanteId: c.id })}
                >
                  Es otra hoja de {identidad(c)}
                </SunmiButton>
              ))}
          </div>

          <p className="text-sm2 sunmi-text-muted mt-3">
            Si te equivocás, después se pueden unir con el botón «Unir».
          </p>
        </SunmiModalLayout>
      )}
    </SunmiCard>
  );
}
