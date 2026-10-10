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
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import VisorDeFoto from "@/components/compras-proveedor/VisorDeFoto";

import {
  chipDeFactura,
  comoSeDice,
  resumenDeLista,
} from "@/lib/compras-proveedor/comprobante/pantalla";
import { sePuedeBorrar, textoDeBorrado } from "@/lib/compras-proveedor/comprobante/borrado";
import { pedirLaLectura, esperarLaLectura } from "@/lib/compras-proveedor/comprobante/leerConTurno";
import { ORIGEN_DE_LECTURA } from "@/lib/compras-proveedor/comprobante/origenDeLectura";
import {
  LIMITES_COMPROBANTE,
  OPERACION,
  demasiadasFotos,
  queHacerHttp,
  tandasParaSubir,
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
async function mensajeDeRespuesta(r, operacion = OPERACION.SUBIDA, cuerpoYaLeido = undefined) {
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
      const d = cuerpoYaLeido !== undefined ? cuerpoYaLeido : await r.json();
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
  // Qué factura está abierta en la hoja de detalle. Es el id y no el objeto:
  // después de leer o borrar, la lista se recarga y el objeto viejo quedaría
  // congelado mostrando el estado de antes.
  const [abierta, setAbierta] = useState(null);
  // Qué hoja se está mirando: `{ comprobanteId, orden }`. El visor ya existe y
  // se le pide una hoja por vez, que es como se mira un papel.
  const [mirandoFoto, setMirandoFoto] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [borrando, setBorrando] = useState(null); // el comprobante que se está por borrar
  const [trabajandoBorrar, setTrabajandoBorrar] = useState(false);
  const inputRef = useRef(null);

  const resumen = useMemo(() => resumenDeLista(items), [items]);

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

  // ── SI UNA FACTURA SE ESTÁ LEYENDO, LA PANTALLA SE ENGANCHA ────────────
  //
  // La lectura vive en el servidor con su estado en la base: cerrar la
  // pantalla o perder el dato móvil no la corta. Al volver, la lista dice que
  // está leyendo y esto vuelve a esperar su resultado. Engancharse NO lanza
  // otra lectura: `seguirLeyendo` solo pregunta, nunca hace el POST.
  useEffect(() => {
    if (leyendo !== null) return;
    const enCurso = items.find((c) => c.leyendo === true);
    if (enCurso) seguirLeyendo(enCurso.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, leyendo]);

  // ── Elegir archivos: acá se decide si hace falta preguntar ─────────────
  // ── LA CÁMARA ES OTRO CAMPO, NO OTRO CIRCUITO ──────────────────────────
  //
  // `capture` no se puede prender y apagar sobre el mismo `input`: el navegador
  // lo lee al abrir el selector, y cambiarlo por estado deja una carrera entre
  // el render y el toque. Dos campos ocultos, el mismo `onChange`, la misma
  // subida.
  const inputCamaraRef = useRef(null);

  // ── ACÁ SE PREGUNTABA «¿ES UNA FACTURA NUEVA O UNA HOJA?» ──────────────
  //
  // Ya no. Lo contesta el papel: una foto con total impreso cierra su factura y
  // una sin total es una hoja intermedia. La agrupación corre en el servidor,
  // después de leer cada foto, y está en `agruparHojas.js` con sus candados.
  //
  // Lo único que se le pide a quien saca las fotos es el ORDEN, que es lo que
  // hace naturalmente: hoja 1, hoja 2, hoja 3.
  function alElegirArchivos(e) {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;
    const aviso = demasiadasFotos(archivos.length);
    if (aviso) setMensaje({ tipo: "aviso", texto: aviso });
    subir(archivos.slice(0, LIMITES_COMPROBANTE.fotosPorEleccion));
  }

  async function subir(archivos) {
    setSubiendo(true);
    setMensaje(null);
    try {
      // ── LAS DIEZ FOTOS NO VIAJAN EN UN SOLO PEDIDO ───────────────────
      //
      // El proxy corta en 60 MB y diez fotos de celular los pasan. Van en
      // envíos de tres, EN SERIE y en orden: el orden de subida es el orden de
      // las hojas, y en paralelo dos envíos pueden escribirse al revés en la
      // base, que le daría vuelta las páginas a una factura.
      //
      // Los resultados se juntan y se informan una sola vez al final: tres
      // mensajes seguidos por una sola elección de fotos no se leen.
      const resultados = [];
      let subidos = 0;
      for (const tanda of tandasParaSubir(archivos)) {
        const fd = new FormData();
        fd.append("proveedorId", String(proveedorId));
        if (pedidoId) fd.append("pedidoId", String(pedidoId));
        for (const a of tanda) fd.append("archivos", a);

        const r = await fetch("/api/compras-proveedor/comprobantes/subir", { method: "POST", body: fd });
        const fallo = await mensajeDeRespuesta(r);
        if (fallo) {
          setMensaje(fallo);
          await recargar();
          return;
        }
        const parcial = await r.json();
        if (!parcial.ok && parcial.error) {
          setMensaje({ tipo: "error", texto: parcial.queHacer || parcial.error });
          await recargar();
          return;
        }
        resultados.push(...(parcial.resultados || []));
        subidos += parcial.subidos || 0;
      }
      const d = { ok: true, resultados, subidos };

      {
        // Los fallos POR ARCHIVO se muestran todos juntos: quien subió cinco
        // fotos tiene que ver de una cuáles entraron y qué pasó con las otras.
        const fallados = (d.resultados || []).filter((x) => !x.ok);
        setMensaje({
          tipo: fallados.length ? "aviso" : "ok",
          texto:
            `${d.subidos} ${d.subidos === 1 ? "foto subida" : "fotos subidas"}. ` +
            "Se agrupan en facturas al leerlas: cada una cierra donde está su total impreso.",
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
   *
   * ── CON EL MODELO GRANDE, LA EXPLICACIÓN ES OPCIONAL ───────────────────
   *
   * Desde el 2026-10-09, un proveedor sin receta confirmada hace entrar al
   * modelo grande, que interpreta el papel sin explicación y propone la
   * receta. Mandar a escribirla antes sería pedirle a la persona lo que el
   * sistema ya sabe hacer solo. El servidor dice si el modelo grande está
   * disponible —`interpretaSinExplicacion`—, y solo cuando NO lo está se sigue
   * yendo a la receta como antes.
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
      if (d.interpretaSinExplicacion === true) return false;
      // Sin ninguna explicación de ningún tipo de papel (`explicacionPorTipo.js`).
      return !(Array.isArray(d.explicaciones) && d.explicaciones.length > 0);
    } catch {
      return false;
    }
  }

  // `origen` no es decoración: una lectura reescribe los renglones del
  // comprobante, así que la tabla tiene que poder decir quién la pidió. Sin
  // esto hubo que deducirlo cruzando dos números para contestar por qué el
  // comprobante del pedido 242 tenía diez lecturas.
  async function leer(id, origen = ORIGEN_DE_LECTURA.BOTON) {
    if (await faltaLaExplicacion()) {
      const volverA = typeof window !== "undefined" ? window.location.pathname : "";
      router.push(
        `/modulos/proveedores/recetas/${proveedorId}?comprobante=${id}` +
          `&volverA=${encodeURIComponent(volverA)}`
      );
      return false;
    }
    // ── LA LECTURA YA NO SE ESPERA ADENTRO DEL PEDIDO ───────────────
    //
    // El POST contesta enseguida y `pedirLaLectura` pregunta hasta que
    // termina. La espera vive en el lib y no acá porque hay DOS pantallas que
    // piden lecturas —ésta y la relectura de la receta—, y dos copias se
    // separan.
    return esperarYMostrar(id, (alAvisar) =>
      pedirLaLectura({ comprobanteId: id, origen, fetchImpl: fetch, alAvisar })
    );
  }

  /**
   * ENGANCHARSE A UNA LECTURA QUE YA ESTÁ CORRIENDO. SOLO PREGUNTA: NO LEE.
   *
   * Es lo que hace la pantalla al volver cuando la lista dice que una factura
   * se está leyendo. No hace el POST —una lectura reescribe renglones y solo
   * la lanza una persona—: pregunta por la que ya existe hasta que termina.
   */
  function seguirLeyendo(id) {
    return esperarYMostrar(id, (alAvisar) =>
      esperarLaLectura({ comprobanteId: id, fetchImpl: fetch, alAvisar })
    );
  }

  /** Esperar una lectura —lanzada o en curso— y decir cómo terminó. */
  async function esperarYMostrar(id, esperar) {
    setLeyendo(id);
    setMensaje(null);
    try {
      const { respuesta: r, cuerpo: d } = await esperar((texto) => setMensaje({ tipo: "ok", texto }));
      // El cuerpo ya lo leyó `pedirLaLectura`: se pasa, porque una `Response`
      // se lee una sola vez. Sin esto el segundo `r.json()` revienta y queda
      // el texto por estado HTTP, sin el motivo que mandó el servidor — que
      // es lo que Emanuel vio el 2026-10-09 con el pedido 255.
      const fallo = await mensajeDeRespuesta(r, OPERACION.LECTURA, d);
      if (fallo) {
        setMensaje(fallo);
        await recargar();
        return false;
      }
      if (!d.ok) {
        // «Esta factura ya está cargada» viene por acá, con su número y con qué
        // hacer. Es un 409 y no un error del sistema: no se reintenta.
        setMensaje({ tipo: "error", texto: [d.error, d.queHacer].filter(Boolean).join(" ") });
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
        // Si la foto resultó ser una hoja de la factura anterior, hay que
        // decirlo: la fila que se tocó desaparece de la lista, y sin una
        // palabra eso se lee como que se borró algo.
        const juntadas = (d.agrupacion || []).reduce((n, f) => n + (f.absorbidos?.length || 0), 0);
        setMensaje({
          tipo: d.cierra ? "ok" : "aviso",
          texto: d.cierra
            ? `Leído y verificado: ${d.lineas} ${d.lineas === 1 ? "producto" : "productos"}.`
            : "Leído, pero la cuenta no cierra. Está señalado abajo, con la foto al lado.",
          detalles: [
            ...(juntadas
              ? [
                  `Esta foto no traía total: se juntó con ${juntadas === 1 ? "la hoja" : "las hojas"} ` +
                    "anterior" + (juntadas === 1 ? "" : "es") + " como una sola factura.",
                ]
              : []),
            ...(d.usoRespaldo ? ["Lo leyó el lector de respaldo."] : []),
            // Si entró el modelo grande, qué pasó: cerró, no cerró, o no se
            // pudo. La frase la arma el servidor, una por desenlace.
            ...(d.escalada?.texto ? [d.escalada.texto] : []),
          ],
        });
      }
      await recargar();
      return d.ok === true;
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA_LECTURA.texto });
      return false;
    } finally {
      setLeyendo(null);
    }
  }

  /**
   * LEER LAS QUE TODAVÍA NO SE LEYERON, EN ORDEN Y DE A UNA.
   *
   * ── EN SERIE, Y NO ES POR PRUDENCIA ────────────────────────────────────
   *
   * Cada lectura corre en su propio turno del lado del servidor, y la
   * agrupación en facturas depende de que las hojas se hayan leído: una hoja
   * sin leer en el medio corta la corrida. En paralelo, tres lecturas terminan
   * en cualquier orden y la agrupación se completa a saltos; en serie, cada
   * lectura encuentra decidido todo lo que vino antes.
   *
   * Y se corta al primer fallo. Si la cuota se agotó en la cuarta, insistir con
   * las seis que quedan gasta seis llamadas para conseguir seis veces el mismo
   * error.
   */
  async function leerLasQueFaltan() {
    const pendientes = items.filter((c) => !c.leidoEn && c.fotos > 0).map((c) => c.id);
    for (const id of pendientes) {
      const r = await leer(id);
      if (r === false) break;
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
          {/* ── QUÉ CUENTA ESTE RENGLÓN, Y POR QUÉ CAMBIÓ ──────────────────
              Decía "3 en total · 1 sin leer", que cuenta FOTOS y las llama
              comprobantes. Con una factura por pedido daba lo mismo; con cuatro
              facturas de tres hojas diría "12 en total" sobre cuatro papeles.
              Ahora cuenta facturas —una factura es un comprobante, sus hojas
              viven adentro— y al lado el tamaño del pedido, que es contra lo
              que se están comparando. */}
          <p className="text-sm2 sunmi-text-muted">
            {resumen.total === 0
              ? "Sacá una foto de la factura. Si es larga, sacá una por hoja, en orden."
              : `${resumen.total} ${resumen.total === 1 ? "factura" : "facturas"}` +
                (cobertura?.totalPedido
                  ? ` · ${cobertura.totalPedido} productos del pedido`
                  : "") +
                (resumen.sinLeer ? ` · ${resumen.sinLeer} sin leer` : "")}
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
            {/* ── LEER LAS QUE FALTAN, DE UN TOQUE ─────────────────────
                Cada foto se lee por separado, así que diez fotos son diez
                lecturas. Tocarlas de a una es el trabajo que esta tanda vino a
                sacar. No se leen SOLAS al subir a propósito: son diez consultas
                de IA de las veinte que hay por día, y gastarlas es una decisión
                de quien recibe, no un efecto de haber elegido fotos. */}
            {resumen.sinLeer > 0 && (
              <SunmiButton
                color="slate"
                type="button"
                disabled={leyendo != null || subiendo}
                onClick={leerLasQueFaltan}
                className="py-3 justify-center"
              >
                {leyendo != null ? "Leyendo…" : `Leer las ${resumen.sinLeer} sin leer`}
              </SunmiButton>
            )}
            {/* LA ACCIÓN PRINCIPAL. Dice FACTURA y no "fotos": lo que se agrega
                es una factura, y que sean una o tres fotos es un detalle de
                cómo se saca. */}
            <SunmiButton
              color="amber"
              type="button"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
              className="py-3 px-5 text-sm font-bold w-full sm:w-auto justify-center"
            >
              {subiendo ? "Subiendo…" : "+ Agregar factura"}
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

          {/* ── UNA FILA POR FACTURA ─────────────────────────────────
              Antes era una tarjeta por COMPROBANTE con su estado explicado en
              tres renglones, su modelo de lectura y sus botones. Con una
              factura por pedido entraba; con cuatro o cinco, la tarjeta de
              comprobantes pasaba a ser la pantalla entera y había que bajar
              para llegar a los productos.

              Ahora cada factura es un renglón que dice lo único que se mira de
              un vistazo —cuántas hojas, cuántos productos, si cierra— y todo lo
              demás vive un toque más adentro. */}
          <div className="md:hidden flex flex-col gap-1">
            {items.length === 0 && (
              <p className="text-xs sunmi-text-muted py-4 text-center">
                Todavía no hay facturas
              </p>
            )}
            {items.map((c, i) => {
              const chip = chipDeFactura(c.estado, { leyendo: leyendo === c.id || c.leyendo === true });
              return (
                // La tarjeta entera es la acción, y para eso está la pieza del
                // kit: un `<button>` de ancho completo con la superficie del
                // tema. Escrito a mano acá sería un elemento crudo con
                // reemplazo, que es lo que cuenta el trinquete.
                //
                // Apila en columna, así que el renglón va adentro: pedirle
                // `flex-row` por `className` pondría dos clases de la misma
                // familia y ganaría cualquiera — la pieza concatena.
                <SunmiActionCard key={c.id} onClick={() => setAbierta(c.id)} className="min-h-toque">
                  <span className="flex items-center justify-between gap-2 w-full">
                  <span className="min-w-0">
                    <span className="block text-xs font-bold sunmi-text-strong truncate">
                      {`Factura ${i + 1}`}
                    </span>
                    {/* ── HOJAS Y PRODUCTOS, QUE ES LO QUE SE CONTROLA ──
                        No dice el modelo que la leyó ni la hora: eso no le
                        sirve a quien tiene la mercadería adelante, y ocupa el
                        lugar de lo que sí. Sigue guardado y se mira en la base
                        cuando hay que medir qué lector lee mejor. */}
                    <span className="block text-sm2 sunmi-text-muted truncate">
                      {c.fotos === 0
                        ? "fotos vencidas"
                        : `${c.fotos} ${c.fotos === 1 ? "hoja" : "hojas"}`}
                      {c._count?.lineas
                        ? ` · ${c._count.lineas} ${c._count.lineas === 1 ? "producto" : "productos"}`
                        : ""}
                    </span>
                  </span>
                  <span className={`text-xs font-bold shrink-0 ${TONOS[chip.tono] || TONOS.neutro}`}>
                    {chip.texto}
                  </span>
                  </span>
                </SunmiActionCard>
              );
            })}
          </div>

          {/* ── EL PEDIDO CONTRA TODAS LAS FACTURAS ──────────────────────
              Es la última línea de la tarjeta a propósito: se lee después de
              las facturas, que es el orden en que se piensa —«tengo estas
              cuatro, ¿alcanzan?»—. El número sale de `coberturaDelPedido`, que
              ya cruzaba el pedido contra TODOS los comprobantes; lo que
              faltaba era decirlo acá. */}
          {cobertura?.totalPedido > 0 && (
            <div className="md:hidden mt-2 pt-2 border-t sunmi-border flex items-center justify-between gap-2">
              <span className="text-xs sunmi-text-strong">Pedido contra facturas</span>
              <span
                className={`text-xs font-bold shrink-0 ${
                  cobertura.sinCubrir === 0 ? TONOS.ok : TONOS.neutro
                }`}
              >
                {`${cobertura.cubiertas} de ${cobertura.totalPedido} llegaron`}
              </span>
            </div>
          )}
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

      {/* ── LO QUE HOY MUESTRA UN COMPROBANTE, UN TOQUE MÁS ADENTRO ────
          Nada de esto es nuevo: es lo que la tarjeta de cada comprobante ya
          decía y ofrecía —el estado explicado, leer de nuevo, borrar— más la
          foto, que hasta ahora solo se podía ver desde la explicación del
          papel. Lo que cambió es dónde vive: en la lista quedan las cuatro
          facturas, y el detalle se abre cuando se lo pide.

          Se busca por id en `items` y no se guarda el objeto: después de leer
          o de borrar, la lista se recarga y un objeto congelado seguiría
          mostrando el estado de antes. */}
      {abierta != null && (() => {
        const c = items.find((x) => x.id === abierta);
        if (!c) return null;
        const i = items.findIndex((x) => x.id === abierta);
        return (
          <SunmiModalLayout
            open
            forma="hoja"
            title={`Factura ${i + 1}`}
            subtitle={c.numero ? identidad(c) : "Todavía sin número: se lee del papel"}
            color="cyan"
            onClose={() => setAbierta(null)}
            espacioCuerpo="mt-2 gap-3"
            z={9999}
          >
            <p className="text-sm2 sunmi-text-muted">
              {c.fotos === 0
                ? "Las fotos ya vencieron."
                : `${c.fotos} ${c.fotos === 1 ? "hoja" : "hojas"}`}
              {c._count?.lineas
                ? ` · ${c._count.lineas} ${c._count.lineas === 1 ? "producto" : "productos"}`
                : ""}
              {c.proveedor?.nombre ? ` · ${c.proveedor.nombre}` : ""}
            </p>

            {/* El estado dicho entero, que en la fila entra en dos palabras. */}
            <div className="mt-2">
              <Aviso estado={c.estado} />
            </div>

            <div className="flex flex-col gap-2 mt-4">
              {c.fotos > 0 && (
                <SunmiButton
                  color="slate"
                  type="button"
                  className="py-3 justify-center"
                  onClick={() => setMirandoFoto({ comprobanteId: c.id, orden: 1 })}
                >
                  {c.fotos === 1 ? "Ver la foto" : `Ver las ${c.fotos} hojas`}
                </SunmiButton>
              )}
              {puedeRecibir && c.fotos > 0 && (
                <SunmiButton
                  color="primary"
                  type="button"
                  disabled={leyendo === c.id}
                  className="py-3 justify-center"
                  onClick={async () => {
                    await leer(c.id);
                    setAbierta(null);
                  }}
                >
                  {leyendo === c.id ? "Leyendo…" : c.leidoEn ? TEXTO_LEER_DE_NUEVO : "Leer"}
                </SunmiButton>
              )}
              {puedeRecibir && sePuedeBorrar(c).ok && (
                <SunmiButton
                  color="red"
                  type="button"
                  className="py-3 justify-center"
                  onClick={() => {
                    setAbierta(null);
                    setBorrando(c);
                  }}
                >
                  Borrar esta factura
                </SunmiButton>
              )}
            </div>
          </SunmiModalLayout>
        );
      })()}

      {/* Una hoja por vez, con el visor que ya existe. */}
      {mirandoFoto && (
        <VisorDeFoto
          comprobanteId={mirandoFoto.comprobanteId}
          orden={mirandoFoto.orden}
          abierto
          onCerrar={() => setMirandoFoto(null)}
        />
      )}
    </SunmiCard>
  );
}
