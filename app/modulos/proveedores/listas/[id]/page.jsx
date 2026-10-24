"use client";

// 4 · RESULTADO DE LA LISTA — y 6 · CONFIRMAR APLICAR, que es su hoja inferior.
//
// ── LA PANTALLA CONTESTA UNA PREGUNTA ───────────────────────────────────────
//
// "¿Qué va a pasar si aplico esto?". Todo lo demás es secundario: el número
// grande de lo que está listo, entre qué porcentajes aumenta, tres ejemplos para
// mirarlos, y cuántos quedan para revisar.
//
// La versión anterior de esta pantalla era una tabla de novecientas filas con
// filtros, selección múltiple y ocho paneles. Eso sigue existiendo y se llega
// desde acá —"Ver los 850"—, pero dejó de ser lo primero: con novecientas filas
// adelante, la pregunta de arriba no se contesta.
//
// ── UNA LISTA TERMINADA NO INVITA A TRABAJAR ────────────────────────────────
//
// Cuando ya se aplicó y se terminó, esta pantalla muestra lo que pasó y ofrece
// SOLO lo que se puede hacer. Un botón "Aplicar los 0 precios" apagado, en una
// lista cerrada, es una pantalla que pide algo que no existe.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import {
  useAccionDePagina,
  useTituloDePagina,
} from "@/app/context/AccionDePaginaContext";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiChipsFiltro from "@/components/sunmi/SunmiChipsFiltro";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import {
  Aviso,
  pct,
  // El peso con el formato de siempre. Se reusa el del kit y no se escribe otro
  // `toLocaleString` acá: dos formatos de moneda en la misma pantalla se separan
  // el día que uno cambie de decimales.
  money,
} from "@/components/proveedores/listas/PiezasPantallas";
// ── LA REVISIÓN ARRANCA DE TUS PRODUCTOS (diseño de Emanuel, 2026-10-23) ──
//
// Las seis tarjetas de números y las tres pantallas sueltas —"Para revisar" de
// a uno, "Vincular" recorriendo el archivo de a uno, "No cambian"— se fueron:
// esta pantalla es la revisión entera, y su lista son tus productos del
// proveedor, cada uno con lo que le pasa. Lo que decide cada estado vive en
// `tusProductos.js`; vincular y revisar son hojas que no sacan de acá.
import TarjetaDeTuProducto from "@/components/proveedores/listas/TarjetaDeTuProducto";
import HojaVincularConLaLista from "@/components/proveedores/listas/HojaVincularConLaLista";
import HojaRevisarPrecio from "@/components/proveedores/listas/HojaRevisarPrecio";
import {
  FILTRO,
  ORDEN_FILTROS,
  TEXTO_FILTRO,
  cantidadDelFiltro,
  filtroInicial,
  seVe,
} from "@/lib/proveedores/listas/tusProductos";
import HojaConfirmarAplicar from "@/components/proveedores/listas/HojaConfirmarAplicar";
// Pasar un control a actualizar precios: pide el rango, que controlar no
// pregunta y actualizar no puede resolver sin él.
import HojaPasarAActualizar from "@/components/proveedores/listas/HojaPasarAActualizar";
import HojaCambiarColumna from "@/components/proveedores/listas/HojaCambiarColumna";
// El mismo predicado que usa el servidor para decidir si una columna explica
// poco. Escribir acá una comparación parecida es lo que CLAUDE.md prohíbe.
import { explicaPoco } from "@/lib/proveedores/listas/importacionGenerica";
// Cancelar una importación que quedó inservible. Con su propia palabra: no es
// lo mismo que terminarla.
import ModalCancelarImportacion from "@/components/proveedores/listas/ModalCancelarImportacion";
// Deshacer y terminar YA tenían su modal, con su previa y su candado contra la
// previa vieja. Se reusan: escribir otro botón al lado sería tener dos caminos
// para escribir costos, y uno de los dos sin el candado.
import ModalRevertir from "@/components/proveedores/listas/ModalRevertir";
import ModalTerminar from "@/components/proveedores/listas/ModalTerminar";
import BotonReporte from "@/components/proveedores/listas/BotonReporte";
import { fechaHora } from "@/lib/proveedores/listas/presentacion";
// PARA QUÉ SE SUBIÓ LA LISTA. Controlando no se ofrece aplicar: se ofrecen las
// dos acciones del control.
import { MODO_LISTA } from "@/lib/proveedores/listas/modoDeLaLista";
import { esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";

export default function ResultadoDeListaPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState(null);
  // Pasar un control a actualizar precios. Dos estados y no uno: `abierta` es la
  // hoja que pide el rango, `pasando` es el pedido en vuelo. Con uno solo, el
  // botón de la hoja no podría decir "Pasando…" sin cerrarla.
  const [pasandoAActualizar, setPasandoAActualizar] = useState(false);
  const [cambiandoColumna, setCambiandoColumna] = useState(false);
  const [pasando, setPasando] = useState(false);
  const [errorAlPasar, setErrorAlPasar] = useState(null);
  // La confirmación de cancelar. Cancelar no escribe ningún costo, pero cierra
  // la lista y eso no se deshace desde acá: se pregunta.
  const [cancelando, setCancelando] = useState(false);
  /** Mientras se vuelven a leer las propuestas que quedaron viejas. */
  const [releyendo, setReleyendo] = useState(false);
  // ── LA LISTA DE TUS PRODUCTOS ──────────────────────────────────────────
  //
  // `filtro` arranca en null y se elige con el primer resultado: el primer
  // chip que tenga algo. `fijados` son los productos que se tocaron con este
  // chip puesto: siguen a la vista aunque su estado nuevo ya no sea el del chip,
  // para que la tarjeta cambie EN EL LUGAR y no desaparezca debajo del dedo.
  const [filtro, setFiltro] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [fijados, setFijados] = useState(() => new Set());
  /** El producto que se está vinculando: `{ productoBaseId, nombre }` o null. */
  const [vinculando, setVinculando] = useState(null);
  /** «No es este producto», desde la hoja de revisar: `{ fila, productoBaseId }`. */
  const [eligiendoOtra, setEligiendoOtra] = useState(null);
  /** El producto que se está revisando: `{ filaId, productoBaseId }` o null. */
  const [revisando, setRevisando] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  // El permiso, como las rutas que esta pantalla llama; era solo admin escrito
  // a mano. Una lista de otro local la frena el servidor.
  const puedeListas = permisos.includes("*") || permisos.includes("proveedores.listas");

  // ── LA BARRA DE LA APP DICE DÓNDE ESTÁS ─────────────────────────────────
  //
  // Decía "Listas de proveedores" en las seis pantallas del módulo, que es el
  // nombre del ítem del menú. Adentro de una lista eso no informa nada: Emanuel
  // ya sabe que está en listas, lo que necesita saber es DE CUÁL.
  //
  // El mecanismo ya existía y lo usan las pantallas de cobros y de medios de
  // pago: `useTituloDePagina` registra un título que gana sobre el de la ruta.
  // El nombre del proveedor es un dato que ninguna tabla de rutas puede
  // contener, que es exactamente para lo que se hizo ese slot.
  useTituloDePagina(datos?.cabecera?.proveedor?.nombre || "Lista de proveedor");

  // ── Y EL VOLVER VA EN LA FILA DEL SHELL, NO ADENTRO DEL CONTENIDO ───────
  //
  // Estaba dibujado como primer hijo del `<main>`, y `<main>` es el que
  // scrollea: en el resultado, que es largo, el volver se iba de pantalla
  // apenas se bajaba un poco. No es z-index ni sticky, es en qué caja está.
  // La fila del shell vive AFUERA del scroll, así que ahí no se puede ir.
  //
  // Es la misma llamada que hacen las 32 pantallas que ya usan el slot.
  useAccionDePagina(
    () => <SunmiBackButton href="/modulos/proveedores/listas" texto="Listas" className="min-h-toque" />,
    []
  );

  // `silencioso`: después de vincular o revisar, la pantalla NO pasa por el
  // cargador. Con él, el contenido se reemplazaba por la rueda y al volver se
  // perdía el lugar de la lista: la tarjeta que se acaba de tocar quedaba
  // pantallas más arriba. Si la recarga silenciosa falla, se dice en el aviso
  // y lo que había queda a la vista.
  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    if (!silencioso) setError("");
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/resultado`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        const texto = json?.error || "No se pudo cargar el resultado de esta lista.";
        if (silencioso) setAviso({ tono: "danger", texto });
        else setError(texto);
        return;
      }
      setDatos(json);
      // El chip con el que arranca: el primero que tenga algo. Solo la primera
      // vez —después manda el que eligió la persona—.
      setFiltro((f) => f ?? filtroInicial(json?.tusProductos?.conteo));
    } catch {
      const texto = "No se pudo conectar con el servidor. Probá de nuevo.";
      if (silencioso) setAviso({ tono: "danger", texto });
      else setError(texto);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [id]);

  /** Cambiar de chip suelta las tarjetas fijadas: ya no hay "en el lugar". */
  const elegirFiltro = (f) => {
    setFiltro(f);
    setFijados(new Set());
  };

  /** Lo que se tocó en una hoja se queda a la vista, y la lista se relee. */
  const despuesDeTocar = async (productoBaseId) => {
    setFijados((prev) => new Set(prev).add(productoBaseId));
    await cargar({ silencioso: true });
  };

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeListas || needsContexto || !Number.isInteger(id)) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, puedeListas, needsContexto, id]);

  /**
   * Pasa este control a actualizar precios, con el rango que se acaba de pedir.
   *
   * No escribe ningún costo: vuelve a conciliar la misma importación y la deja
   * en el resultado de siempre, con su botón de aplicar y su confirmación.
   */
  const pasarAActualizar = async ({ minPct, maxPct }) => {
    setPasando(true);
    setErrorAlPasar(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/pasar-a-actualizar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minPct, maxPct }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        // EL ERROR SE QUEDA EN LA HOJA, con el rango escrito a la vista. Sacarlo
        // afuera cerraría la hoja y habría que volver a escribir los dos
        // números para leer qué estuvo mal con ellos.
        setErrorAlPasar(j?.error || `No se pudo pasar a actualizar precios (error ${r.status}).`);
        return;
      }
      setPasandoAActualizar(false);
      setAviso({
        tono: "success",
        texto:
          `Listo: se volvió a leer con un aumento esperado de ${j.rango.minPct} % a ${j.rango.maxPct} %. ` +
          "Todavía no se cambió ningún costo.",
      });
      await cargar();
    } catch {
      setErrorAlPasar("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setPasando(false);
    }
  };

  /**
   * VUELVE A CALCULAR LA PROPUESTA DE LAS FILAS QUE QUEDARON VIEJAS.
   *
   * No manda ids: el servidor decide cuáles son con la misma función que decide
   * qué escribe aplicar. Mandarlos desde acá haría que una pantalla que quedó
   * abierta un rato pidiera releer filas que hoy ya se pueden aplicar.
   *
   * Y el aviso dice DÓNDE quedaron. "Listo" sin más dejaría a la persona
   * buscando: algunas vuelven a quedar listas con el número nuevo y otras caen en
   * la cola de revisión, y son dos próximos pasos distintos.
   */
  const releerPropuestas = async () => {
    setReleyendo(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/releer-propuestas`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({
          tono: "danger",
          texto: j?.error || `No se pudieron volver a leer esos precios (error ${r.status}).`,
        });
        return;
      }
      const partes = [];
      if (j.quedaronListas > 0) {
        partes.push(
          j.quedaronListas === 1
            ? "1 quedó lista con el precio de hoy"
            : `${j.quedaronListas} quedaron listas con los precios de hoy`
        );
      }
      if (j.quedaronParaRevisar > 0) {
        partes.push(
          j.quedaronParaRevisar === 1
            ? "1 pasó a la cola para que la mires"
            : `${j.quedaronParaRevisar} pasaron a la cola para que las mires`
        );
      }
      setAviso({
        tono: j.releidas === 0 ? "warning" : "success",
        texto:
          j.releidas === 0
            ? "No quedaba ninguna con la propuesta vieja: ya estaban al día."
            : `Se volvieron a leer ${j.releidas}. ${partes.join(" y ")}. Todavía no se cambió ningún costo.`,
      });
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setReleyendo(false);
    }
  };

  /**
   * VUELVE A LEER LA LISTA CON OTRA COLUMNA DE PRECIO.
   *
   * No pide el archivo: cada fila guarda lo que decía cada columna. Y no toca el
   * modo ni el rango — lo único que cambia es de qué número se parte—, porque si
   * cambiaran dos cosas a la vez, mirando el resultado nadie podría decir cuál
   * de las dos lo movió.
   */
  const cambiarColumna = async ({ columna, conDescuento }) => {
    setPasando(true);
    setErrorAlPasar(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/columna-de-precio`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columna, conDescuento }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErrorAlPasar(j?.error || `No se pudo volver a leer con esa columna (error ${r.status}).`);
        return;
      }
      setCambiandoColumna(false);
      setAviso({
        tono: "success",
        texto: `Listo: se volvió a leer con la columna «${j.titulo}». Todavía no se cambió ningún costo.`,
      });
      await cargar();
    } catch {
      setErrorAlPasar("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setPasando(false);
    }
  };

  /**
   * Rescata una lista que quedó leída con el rango en 0 a 0.
   *
   * No pide nada: el rango se conserva tal cual —es lo que distingue este
   * control de uno elegido a propósito— y lo único que cambia es con qué
   * pregunta se vuelve a conciliar.
   */
  const pasarAControlar = async () => {
    setPasando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/pasar-a-controlar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || `No se pudo pasar a control (error ${r.status}).` });
        return;
      }
      setAviso({
        tono: "success",
        texto: "Listo: ahora es un control. No se cambió ningún costo.",
      });
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setPasando(false);
    }
  };

  /** Cancela la importación. No toca ningún costo: solo la cierra. */
  const cancelarLista = async () => {
    setPasando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/cancelar`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || `No se pudo cancelar (error ${r.status}).` });
        return;
      }
      setCancelando(false);
      setAviso({ tono: "success", texto: "Lista cancelada. No se cambió ningún costo." });
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setPasando(false);
    }
  };

  /**
   * Baja el control entero como CSV.
   *
   * ── POR QUÉ UNA RUTA Y NO UN BLOB ARMADO ACÁ ────────────────────────────
   *
   * Porque acá NO están los datos. La pantalla tiene `muestra`, que son TRES
   * filas de ejemplo, y los contadores — no las novecientas líneas con su
   * diferencia. Armar el archivo con lo que hay a mano habría bajado un CSV de
   * tres renglones titulado "el control": un archivo que se abre, se ve
   * perfecto, y miente por omisión sobre el 99 % de la lista.
   *
   * Es una navegación y no un `fetch`: el navegador maneja la descarga y el
   * `Content-Disposition` de la ruta pone el nombre del archivo.
   */
  const descargarElControl = () => {
    window.location.href = `/api/proveedores/listas/${id}/control.csv`;
  };

  /**
   * LOS MOTIVOS DE OMISIÓN, EN UNA FRASE.
   *
   * El servidor ya manda cada motivo con su texto en criollo —`textoOmision`— y
   * su cantidad, ordenados por cantidad. Acá NO se traduce nada: escribir los
   * textos de nuevo sería una segunda tabla de motivos, y el día que el servidor
   * agregue uno la pantalla lo mostraría como un código en mayúsculas.
   *
   * Se nombran los dos más grandes y el resto se resume. Con catorce motivos
   * distintos, listarlos todos sería un párrafo que nadie lee.
   */
  const textoDeMotivos = (motivos) => {
    if (!Array.isArray(motivos) || motivos.length === 0) return "";
    const conTexto = motivos.filter((m) => m?.texto);
    if (conTexto.length === 0) return "";
    const partes = conTexto.slice(0, 2).map((m) => `${m.cantidad}, ${m.texto}`);
    const resto = conTexto.length - partes.length;
    return partes.join(" ") + (resto > 0 ? ` Y ${resto} por otros motivos.` : "");
  };

  const aplicar = async () => {
    setAplicando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/aplicar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alcance: "SELECCIONADAS" }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudieron aplicar los precios." });
        return;
      }
      setConfirmando(false);
      // ── EL NÚMERO SALE DE DONDE EL SERVIDOR LO MANDA ────────────────────
      //
      // Acá decía `j.aplicadas`, y el endpoint NUNCA mandó ese campo: manda
      // `resumen.aplicadas`. O sea que el cartel decía "Se actualizaron 0
      // productos" SIEMPRE, hubiera escrito cero o trescientos. Es el texto que
      // Emanuel vio, y lo peor es que en su caso además era cierto — así que el
      // cartel tapaba el otro defecto en vez de delatarlo.
      const escritos = Number(j?.resumen?.aplicadas ?? 0);
      const omitidas = Number(j?.resumen?.omitidas ?? 0);
      const motivos = Array.isArray(j?.resumen?.motivos) ? j.resumen.motivos : [];

      if (escritos > 0) {
        setAviso({
          tono: "success",
          texto:
            `Listo. Se ${escritos === 1 ? "actualizó" : "actualizaron"} ${escritos} ` +
            `${escritos === 1 ? "producto" : "productos"}.` +
            (omitidas > 0 ? ` Quedaron ${omitidas} sin aplicar: ${textoDeMotivos(motivos)}` : ""),
        });
      } else {
        // ── CERO NO ES UN ÉXITO ───────────────────────────────────────────
        //
        // Un cartel verde que dice "Listo" sobre una operación que no escribió
        // nada es la pantalla afirmando que el trabajo está hecho. Emanuel tocó
        // el botón tres veces seguidas creyendo que algo había pasado.
        //
        // El motivo viene del servidor y se dice tal cual: es el que sabe por
        // qué omitió cada fila. Sin motivos —que no debería pasar— se dice eso
        // mismo, que es más honesto que inventar una explicación.
        setAviso({
          tono: "warning",
          texto:
            motivos.length > 0
              ? `No se actualizó ningún costo. ${textoDeMotivos(motivos)}`
              : "No se actualizó ningún costo, y el servidor no dijo por qué. " +
                "Abrí «se actualizan» y fijate si las filas siguen tildadas.",
        });
      }
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setAplicando(false);
    }
  };

  const terminar = async () => {
    setAplicando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/finalizar`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo terminar la lista." });
        return;
      }
      setTerminando(false);
      setAviso({ tono: "success", texto: "Lista terminada." });
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setAplicando(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!puedeListas) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">
            Seleccioná un contexto operativo para ver esta lista.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando) {
    return (
      <Marco>
        <SunmiCard className="p-6"><SunmiLoader /></SunmiCard>
      </Marco>
    );
  }

  if (error) {
    return (
      <Marco>
        <ErrorRecuperable mensaje={error} onReintentar={cargar} />
      </Marco>
    );
  }

  const { cabecera, conteo, lectura } = datos;
  // Lo que el recálculo de HOY va a omitir, con el motivo y los dos números. El
  // default no es `{}` pelado: la tarjeta lee dos listas y con `{}` habría que
  // preguntar por cada una en tres lugares. Una importación vieja de un cliente
  // con la pantalla en caché puede no traer el campo, y ahí no hay omisiones que
  // mostrar, no una pantalla rota.
  const omitidas = datos.omitidasAlAplicar ?? { total: 0, porMotivo: [], propuestaDiferente: [] };
  const controlando = cabecera.modo === MODO_LISTA.CONTROLAR;
  const abierta = esImportacionAbierta(cabecera.estado);
  const listos = conteo.listos;
  const puedeDeshacer = cabecera.productosActualizados > 0;

  const irA = (sub) => router.push(`/modulos/proveedores/listas/${id}${sub}`);

  // ── TUS PRODUCTOS, FILTRADOS ─────────────────────────────────────────────
  //
  // Una respuesta de un servidor viejo puede no traer la lista: se dibuja vacía
  // en vez de romper la pantalla.
  const tusProductos = datos.tusProductos ?? { items: [], conteo: { total: 0, traeLaLista: 0, porEstado: {} } };
  const nombreProveedor = cabecera.proveedor?.nombre ?? "este proveedor";
  const sinVincular = tusProductos.conteo.porEstado?.SIN_VINCULAR ?? 0;
  const filtroActivo = filtro ?? FILTRO.TODOS;
  const visibles = tusProductos.items.filter((it) => seVe(it, { filtro: filtroActivo, buscar, fijados }));

  return (
    <Marco>
      {/* El volver y el título ya no se dibujan acá: van al slot del shell, que
          es una fila que vive AFUERA de `<main>`. Ver el comentario del registro,
          arriba. */}
      {/* ── EL NOMBRE DEL PROVEEDOR VA UNA SOLA VEZ, Y ESTÁ ARRIBA ──────────
          Acá había un `<h1>` con el nombre del proveedor. Ahora la barra del
          shell dice ese mismo nombre, dos centímetros más arriba: en la captura
          a 360 se leía "M Y F SRL" y justo debajo "M Y F SRL" otra vez. Es el
          mismo título duplicado que el listado ya tuvo, con el agravante de que
          acá las dos copias quedan pegadas.

          Lo que el shell NO puede decir es de qué archivo se trata, cuándo se
          leyó y en qué estado está — y eso es lo que queda. */}
      {/* ── CONTROLANDO, EL RENGLÓN DICE QUE NO SE CAMBIÓ NADA ─────────────
          Y lo dice acá arriba, junto al nombre del archivo, no al pie: es la
          primera pregunta que se hace alguien que abre esta pantalla —"¿esto ya
          me tocó los costos?"— y la respuesta tiene que estar antes que los
          números, no después de recorrerlos. */}
      {/* Archivo · fecha y hora de lectura · qué pasó con los precios. El
          nombre del proveedor lo dice la barra del shell, en grande, con
          «← Listas» a la derecha. */}
      <p className="text-sm2 sunmi-text-muted leading-snug">
        {cabecera.archivoNombre} · {fechaHora(cabecera.leidaEn)} ·{" "}
        {controlando ? "no se cambió ningún precio" : estadoEnCastellano(cabecera)}
      </p>

      {/* EL AVISO DEL 0 A 0. Se deduce de lo guardado, así que sigue estando la
          semana que viene: quien puso 0 % tiene que poder entender por qué esta
          lista terminó siendo un control, y no descubrirlo por descarte. */}
      {cabecera.avisoDeModo && <Aviso tono="warning">{cabecera.avisoDeModo}</Aviso>}

      {/* ── LA QUE QUEDÓ ATRAPADA EN EL DEFECTO VIEJO ──────────────────────
          Una lista leída antes de esta tanda con el rango en 0 a 0: el motor no
          pudo elegir la columna de precio y dejó todo para revisar. No se
          arregla sola, así que se avisa al abrirla y se ofrecen las dos
          salidas. Sin esto, la pantalla se ve como una lista normal que
          simplemente no pudo con nada, y no hay forma de saber por qué. */}
      {cabecera.quedoAtrapada && (
        <Aviso tono="warning">
          <p className="leading-snug">{cabecera.avisoAtrapada}</p>
          <div className="mt-2 space-y-2">
            <SunmiButton
              color="cyan"
              onClick={pasarAControlar}
              disabled={pasando}
              className="w-full min-h-toque text-sm3"
            >
              {pasando ? "Pasando…" : "Pasarla a control"}
            </SunmiButton>
            <SunmiButton
              color="slate"
              onClick={() => setCancelando(true)}
              disabled={pasando}
              className="w-full min-h-toque text-sm3"
            >
              Cancelar esta lista
            </SunmiButton>
          </div>
        </Aviso>
      )}

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      {/* ── FILAS QUE QUEDARON AFUERA POR UNA BAJA POSTERIOR ───────────────
          El archivo trae N renglones y la pantalla muestra menos. Sin este
          cartel la diferencia no se explica y parece que se perdieron filas:
          lo que pasó es que su producto se dio de baja DESPUÉS de conciliar,
          así que no hay nada que aplicarles. Se dice el número, porque "algunas"
          no deja comprobar nada. */}
      {datos?.filasConProductoDeBaja > 0 && (
        <Aviso tono="warning">
          {datos.filasConProductoDeBaja === 1
            ? "Una fila quedó afuera: el producto que tenía vinculado se dio de baja después de conciliar. No se le escribe costo."
            : `${datos.filasConProductoDeBaja} filas quedaron afuera: los productos que tenían vinculados se dieron de baja después de conciliar. No se les escribe costo.`}
        </Aviso>
      )}

      {/* ── LA COLUMNA QUE EXPLICA POCO, ARRIBA Y CON SU SALIDA ────────────
          Cuando la columna con la que se leyó explica menos de la MITAD de los
          productos comparables, hay motivo para dudar de ella — y el caso que
          originó esto demuestra que dudar tarde sale caro: la columna
          equivocada no da un disparate visible, da un aumento plausible que se
          aplica solo.
          Va arriba de todo y con el botón al lado, porque un aviso que dice que
          algo puede estar mal sin decir qué hacer es peor que no avisar. */}
      {explicaPoco(lectura) && abierta && (
        <Aviso tono="warning">
          <p className="leading-snug">
            Los precios salieron de la columna «{lectura.titulo}», que coincide con tus costos en{" "}
            {lectura.explicadas} de cada {lectura.comparables} productos. Puede no ser la columna
            del precio que te factura este proveedor.
          </p>
          <div className="mt-2">
            <SunmiButton
              color="cyan"
              onClick={() => setCambiandoColumna(true)}
              disabled={pasando}
              className="w-full min-h-toque text-sm3"
            >
              Leer con otra columna
            </SunmiButton>
          </div>
        </Aviso>
      )}

      {/* CON QUÉ COLUMNA SE LEYÓ. Es la decisión de la que cuelga todo lo demás,
          así que se dice, y se dice con su respaldo.
          NO se muestra cuando arriba está el aviso: los dos dicen lo mismo, y
          además lo dicen con denominadores distintos —"0 de cada 9" y "0 de cada
          100"— así que juntos se leen como dos mediciones que no coinciden. */}
      {lectura?.titulo && !(explicaPoco(lectura) && abierta) && (
        <p className="text-sm2 sunmi-text-muted leading-snug">
          Los precios salieron de la columna «{lectura.titulo}»
          {lectura.conDescuento ? ", con el descuento aplicado" : ""}
          {lectura.comparables
            ? `, que coincide con tus costos en ${Math.round((lectura.explicadas / lectura.comparables) * 100)} de cada 100 productos.`
            : "."}
          {/* QUIÉN LA ELIGIÓ, y las tres respuestas son distintas para quien
              audita: no es lo mismo una decisión tomada hoy mirando esta lista
              que una tomada hace un mes mirando otra, ni que ninguna. */}
          {lectura.origenDeLaEleccion === "LA_ELEGISTE_AHORA" || (lectura.aMano && !lectura.origenDeLaEleccion)
            ? " La elegiste vos."
            : lectura.origenDeLaEleccion === "LA_ELEGISTE_ANTES"
              ? " La elegiste vos en una lista anterior de este proveedor."
              : " La eligió el sistema."}
        </p>
      )}

      {/* ── LAS SEIS TARJETAS DE NÚMEROS SE FUERON ─────────────────────────
          Las del control y las del resultado: cada una llevaba a otra pantalla
          con otro pedazo de la misma pregunta. Ahora la pregunta se contesta
          producto por producto, más abajo. */}
      {/* ── LAS QUE ESTÁN LISTAS Y NO SE VAN A ESCRIBIR ──────────────────
          Hasta esta tanda estas filas se contaban entre las que "se actualizan",
          y aplicar las salteaba porque consulta por `seleccionada`. Sacarlas del
          número grande era la mitad del arreglo; la otra mitad es decirlas. Si
          no, el número baja de 8 a 0 sin que nadie entienda a dónde se fueron —
          que es la misma clase de mentira, al revés.

          Solo se dibuja cuando hay alguna: una tarjeta en cero acá sería un
          problema que no existe ocupando lugar. */}
      {!controlando && (conteo.listosSinTildar ?? 0) > 0 && (
        <SunmiCard className="p-3">
          <p className="text-sm2 sunmi-text-warning leading-snug">
            <span className="font-bold sunmi-text-strong">{conteo.listosSinTildar}</span>{" "}
            {conteo.listosSinTildar === 1 ? "está listo" : "están listos"} pero sin tildar, así que
            aplicar no {conteo.listosSinTildar === 1 ? "lo" : "los"} va a tocar.
          </p>
          {abierta && (
            <SunmiButton
              color="ghost"
              onClick={() => irA("/actualizan")}
              className="mt-2 w-full min-h-toque text-sm3"
            >
              Abrirlos para tildarlos
            </SunmiButton>
          )}
        </SunmiCard>
      )}

      {/* ── LAS QUE APLICAR VA A OMITIR PORQUE EL PRECIO CAMBIÓ ──────────
          De la importación #12 de producción: la pantalla decía "11 se
          actualizan · Aplicar los 11 precios", Emanuel aplicó, y se escribieron
          3. Las otras 8 salieron omitidas por propuesta diferente y NADIE SE
          ENTERÓ: ni antes —el número las contaba— ni después, porque el aviso de
          la corrida daba el total y no decía qué les había pasado ni a cuáles.

          Ahora las cuenta `conteo.omitidasAlAplicar`, salen del número grande, y
          acá se dicen con nombre y con los DOS números. Los dos son el punto:
          "el costo da distinto" sin decir distinto de qué obliga a abrir cada
          fila para enterarse, y son justamente las filas que ya se miraron una
          vez. */}
      {!controlando && (conteo.omitidasAlAplicar ?? 0) > 0 && (
        <SunmiCard className="p-3">
          {/* ── EL CARTEL NO AFIRMA QUE EL PRECIO CAMBIÓ ──────────────────
              Acá decía "sus precios cambiaron desde que se leyó la lista", y en
              la #12 eso era FALSO en las siete filas que nombraba: lo que
              difería eran siete centavos sobre $31.428 por dónde caía un
              redondeo. El precio no se había movido.

              El sistema no sabe por qué difieren los dos números —puede ser un
              precio nuevo, o el armado del producto, o la cuenta—. Lo que SÍ
              sabe es cuánto difieren, así que eso es lo que dice. La causa la
              ve la persona mirando los dos importes. */}
          <p className="text-sm2 sunmi-text-warning leading-snug">
            <span className="font-bold sunmi-text-strong">{conteo.omitidasAlAplicar}</span>{" "}
            {conteo.omitidasAlAplicar === 1 ? "no se va a actualizar" : "no se van a actualizar"}:
            con los datos de hoy {conteo.omitidasAlAplicar === 1 ? "el costo da" : "los costos dan"}{" "}
            distinto del que se había propuesto, y la diferencia es grande como para
            escribirla sin que la mires.
          </p>

          {/* Los dos valores, fila por fila: el que se había propuesto y el de
              hoy. Se muestran hasta cinco —en un teléfono más no se lee— y si
              hay más se dice cuántas quedan, en vez de cortar en silencio. */}
          {(omitidas.propuestaDiferente ?? []).length > 0 && (
            <div className="mt-2 divide-y sunmi-divide">
              {(omitidas.propuestaDiferente ?? []).slice(0, 5).map((o) => (
                <div key={o.filaId} className="py-2">
                  <div className="text-sm2 sunmi-text-strong truncate" title={o.nombre ?? ""}>
                    {o.nombre ?? `Fila ${o.filaExcel ?? o.filaId}`}
                  </div>
                  <div className="text-sm2 sunmi-text-muted tabular-nums">
                    Antes se iba a poner {money(o.costoGuardado)} y ahora daría{" "}
                    <span className="sunmi-text-strong">{money(o.costoRecalculado)}</span>
                  </div>
                  {/* EN CUÁNTO DIFIERE, que es el dato que decide. Los dos
                      importes solos obligan a restarlos de cabeza, y con
                      números de cinco cifras eso no se hace en un teléfono.
                      Sale del servidor, calculado por la misma función que
                      decidió frenar: si se restara acá podrían decir cosas
                      distintas. */}
                  {o.diferencia?.pesos !== null && o.diferencia?.pesos !== undefined && (
                    <div className="text-xs2 sunmi-text-warning tabular-nums">
                      Son {money(Math.abs(o.diferencia.pesos))} de diferencia
                      {o.diferencia?.pct === null || o.diferencia?.pct === undefined
                        ? ""
                        : ` (${pct(o.diferencia.pct)})`}
                      .
                    </div>
                  )}
                </div>
              ))}
              {(omitidas.propuestaDiferente ?? []).length > 5 && (
                <p className="pt-2 text-xs2 sunmi-text-muted">
                  Y {(omitidas.propuestaDiferente ?? []).length - 5} más.
                </p>
              )}
            </div>
          )}

          {/* LA SALIDA. Volver a leerlas recalcula la propuesta con los datos de
              hoy y las deja para mirar de nuevo: no escribe ningún costo. Solo
              se ofrece con la lista abierta y cuando hay alguna de este motivo —
              las demás omisiones se arreglan en otro lado y cada una dice dónde. */}
          {abierta && (omitidas.propuestaDiferente ?? []).length > 0 && (
            <SunmiButton
              color="ghost"
              onClick={releerPropuestas}
              disabled={releyendo}
              className="mt-2 w-full min-h-toque text-sm3"
            >
              {releyendo
                ? "Volviendo a leer…"
                : (omitidas.propuestaDiferente ?? []).length === 1
                  ? "Volver a leer ese precio"
                  : `Volver a leer esos ${(omitidas.propuestaDiferente ?? []).length} precios`}
            </SunmiButton>
          )}

          {/* Las omisiones que NO son de propuesta diferente también se nombran:
              cada motivo ya tiene su texto con el qué pasó y el qué hacer, y
              callarlas dejaría el número sin explicación. */}
          {(omitidas.porMotivo ?? [])
            .filter((m) => m.motivo !== "PROPUESTA_DIFERENTE")
            .map((m) => (
              <p key={m.motivo} className="mt-2 text-xs2 sunmi-text-muted leading-snug">
                {m.cantidad === 1 ? "Una más" : `${m.cantidad} más`}: {m.texto}
              </p>
            ))}
        </SunmiCard>
      )}

      {/* ── EL RESUMEN: DE LO TUYO, CUÁNTO TRAE LA LISTA ───────────────────
          "De tus 158 productos de Dab, la lista trae 14." Es la única cuenta
          que importa antes de empezar: cuánto de lo tuyo vino. Los números
          salen del mismo arreglo que se dibuja abajo. */}
      <SunmiCard className="p-3 space-y-0.5">
        <p className="text-sm2 sunmi-text-muted">
          De tus {tusProductos.conteo.total} productos de {nombreProveedor}
        </p>
        <p className="text-xl2 font-bold sunmi-text-strong leading-tight">
          la lista trae {tusProductos.conteo.traeLaLista}
        </p>
        {sinVincular > 0 && abierta && (
          <p className="text-sm2 sunmi-text-muted leading-snug pt-1">
            Vinculá los que faltan una sola vez: después {nombreProveedor} los trae solos.
          </p>
        )}
      </SunmiCard>

      {/* Los chips, en el orden del diseño y con su número. "Todos" va último:
          se arma como un chip más y no con el "Todas" de la pieza, que va
          primero. Arranca en el primero que tenga algo. */}
      <SunmiChipsFiltro
        rotulo={null}
        textoTodas={null}
        valor={filtroActivo}
        onCambiar={(f) => elegirFiltro(f ?? FILTRO.TODOS)}
        opciones={ORDEN_FILTROS.map((f) => ({
          clave: f,
          texto: TEXTO_FILTRO[f],
          cantidad: cantidadDelFiltro(f, tusProductos.conteo),
        }))}
      />

      <SunmiInput
        type="search"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar en tus productos"
        aria-label="Buscar en tus productos"
        className="min-h-toque text-sm3"
      />

      {/* ── UNA TARJETA POR PRODUCTO TUYO ─────────────────────────────────
          Los renglones de la lista que no son tuyos no se listan: solo
          aparecen en el buscador de la hoja de vincular. */}
      <div className="space-y-2">
        {visibles.map((item) => (
          <TarjetaDeTuProducto
            key={item.productoBaseId}
            item={item}
            proveedor={nombreProveedor}
            abierta={abierta}
            controlando={controlando}
            onVincular={(it) => setVinculando({ productoBaseId: it.productoBaseId, nombre: it.nombre })}
            onRevisar={(it) => setRevisando({ filaId: it.filaId, productoBaseId: it.productoBaseId })}
          />
        ))}
        {visibles.length === 0 && (
          <p className="text-sm2 sunmi-text-muted text-center py-4">
            {buscar.trim()
              ? "Ninguno de tus productos se llama así."
              : "No hay ninguno en este grupo."}
          </p>
        )}
      </div>

      {/* ── LAS DOS ACCIONES DE UN CONTROL ─────────────────────────────────
          Ninguna de las dos escribe un costo. "Pasar a actualizar precios"
          convierte ESTA importación sin volver a subir el archivo —que es lo que
          uno quiere después de mirar el control y decidir que sí— y el que
          escribe sigue siendo el botón de aplicar de la pantalla de después,
          con su confirmación. */}
      {controlando && abierta && (
        <div className="space-y-2">
          <SunmiButton
            color="cyan"
            onClick={() => setPasandoAActualizar(true)}
            disabled={pasando}
            className="w-full min-h-toque text-base font-bold"
          >
            {pasando ? "Pasando…" : "Pasar a actualizar precios"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={descargarElControl}
            className="w-full min-h-toque text-sm3"
          >
            Descargar el control
          </SunmiButton>
          <p className="text-sm2 sunmi-text-muted text-center leading-snug">
            Pasar a actualizar no cambia nada todavía: vuelve a leer esta misma lista con el
            aumento que esperás y te muestra el resultado antes de aplicar.
          </p>
        </div>
      )}

      {/* ── APLICAR, AL FINAL DE LA LISTA Y NO PEGADO AL PIE ────────────────
          Va después de la última tarjeta, como un elemento más: un botón
          pegado abajo tapa la tarjeta que pasa por debajo (Emanuel, recepción,
          2026-10-22). El número es `conteo.listos`, el mismo que consulta
          aplicar y que decide qué tarjetas dicen «Cambia». La confirmación y
          las reglas de rango son las de siempre. */}
      {!controlando && abierta && listos > 0 && (
        <div className="space-y-2">
          <SunmiButton
            color="primary"
            onClick={() => setConfirmando(true)}
            disabled={aplicando}
            className="w-full min-h-toque text-base font-bold"
          >
            Aplicar los {listos} precios
          </SunmiButton>
          <p className="text-sm2 sunmi-text-muted text-center leading-snug">
            Solo cambian los que dicen «Cambia». Los demás quedan como están.
          </p>
        </div>
      )}

      {puedeDeshacer && (
        <SunmiButton
          color="slate"
          onClick={() => setDeshaciendo(true)}
          disabled={aplicando}
          className="w-full min-h-toque text-sm3"
        >
          {cabecera.productosActualizados === 1
            ? "Deshacer el que se actualizó"
            : `Deshacer los ${cabecera.productosActualizados} que se actualizaron`}
        </SunmiButton>
      )}

      {/* ── TERMINAR SE OFRECE MIENTRAS LA LISTA ESTÉ ABIERTA ───────────────
          La primera versión lo mostraba solo con `listos === 0 && paraRevisar
          === 0`, y esa condición no se cumple casi nunca: la lista real de M Y F
          quedó con 560 filas para revisar —la mayoría productos que este cliente
          no vende— y ninguna se va a resolver jamás. Con la regla vieja esa lista
          se quedaba "a medias" para siempre, ocupando la sección de arriba del
          historial, sin ninguna forma de cerrarla desde acá.
          Terminar es justamente decir "con esta lista ya está", y el servidor lo
          acepta sobre cualquier importación abierta: la pantalla no tiene por qué
          ser más estricta que él. Va último y en gris, detrás de su modal, que
          explica qué se pierde y que se puede volver atrás. */}
      {/* ── LOS DOS SECUNDARIOS, EN UNA FILA ────────────────────────────────
          Terminar y el reporte ocupaban un renglón cada uno, a ancho completo y
          en gris, abajo de todo: dos bloques del mismo peso visual que el botón
          de aplicar, para dos cosas que casi nunca se hacen. En una fila de dos
          ocupan la mitad y se siguen tocando igual, que es lo que importa. */}
      {/* ── TERMINAR Y CANCELAR, JUNTOS Y MIENTRAS LA LISTA ESTÉ ABIERTA ──
          Cancelar existía en UN solo lugar de esta pantalla: adentro del aviso de
          la lista atrapada en el rango 0 a 0, que es un caso puntual y viejo.
          Sobre una lista normal no había ninguna salida que no fuera aplicar o
          terminar, así que subir el archivo equivocado terminaba en «Terminar» —y
          en el historial quedaba como trabajo terminado.
          Van en la misma fila porque son la misma decisión mirada de los dos
          lados: cerrar esto porque ya está, o cerrarlo porque no servía. */}
      <div className="grid grid-cols-2 gap-2">
        {abierta ? (
          <>
            <SunmiButton
              color="slate"
              onClick={() => setTerminando(true)}
              disabled={aplicando || pasando}
              className="min-h-toque text-sm3"
            >
              Terminar lista
            </SunmiButton>
            <SunmiButton
              color="slate"
              onClick={() => setCancelando(true)}
              disabled={aplicando || pasando}
              className="min-h-toque text-sm3"
            >
              Cancelar esta lista
            </SunmiButton>
          </>
        ) : null}
        <BotonReporte
          importacionId={id}
          cabecera={cabecera}
          proveedor={cabecera.proveedor}
          usuario={perfil}
        />
      </div>

      <ModalRevertir
        abierto={deshaciendo}
        importacionId={id}
        onCerrar={() => setDeshaciendo(false)}
        onRevertido={async (r) => {
          setDeshaciendo(false);
          // EL AVISO DICE LO QUE QUEDÓ, y los números se releen de la base:
          // escribir "se deshizo todo" sin volver a preguntar dejaría la pantalla
          // mostrando el estado de antes con un cartel diciendo lo contrario.
          const cuantos = r?.resumen?.revierten ?? 0;
          // ── SI LA LISTA NO SE PUDO REABRIR, SE DICE ─────────────────────
          //
          // Deshacer devuelve los costos y además reabre la lista. Lo segundo
          // no se puede cuando ya hay otra importación abierta del MISMO
          // archivo —el índice único no deja dos— y eso pasa de verdad: es lo
          // que queda después de subir la misma lista dos veces. Antes el
          // servidor explotaba con un P2002 y la pantalla decía "Error
          // interno"; ahora los costos vuelven igual y acá se explica por qué
          // la lista quedó cerrada, nombrando a la que ocupa el lugar.
          const otra = r?.noSePudoReabrir ?? null;
          setAviso({
            tono: otra ? "warning" : "success",
            texto: otra
              ? `Se deshizo: ${cuantos} ${cuantos === 1 ? "producto volvió" : "productos volvieron"} a su costo anterior. ` +
                `La lista queda cerrada porque ya tenés abierta otra importación del mismo archivo (#${otra.id}).`
              : `Se deshizo. ${cuantos} ${cuantos === 1 ? "producto volvió" : "productos volvieron"} a su costo anterior.`,
          });
          await cargar();
        }}
      />

      <ModalTerminar
        abierto={terminando}
        sinAplicar={conteo.paraRevisar}
        actualizados={cabecera.productosActualizados}
        trabajando={aplicando}
        onCerrar={() => setTerminando(false)}
        onTerminar={terminar}
      />

      {/* ── CANCELAR SE PREGUNTA, Y CON SU PROPIA PALABRA ───────────────
          No se reusa `ModalTerminar`: dice "Sí, terminar" y enumera cuántos
          productos quedan sin aplicar, que es el balance de un trabajo hecho.
          Sobre una lista que se está descartando, ese texto cuenta una historia
          que no ocurrió. */}
      <ModalCancelarImportacion
        abierto={cancelando}
        archivo={cabecera.archivoNombre}
        // Cuántos costos ya escribió esta lista. Con una PARCIALMENTE_APLICADA
        // —que sigue abierta, así que se puede cancelar— el modal tiene que decir
        // que lo aplicado NO se deshace: sin este dato decía "no se cambia ningún
        // costo" sobre una lista que ya había cambiado varios.
        aplicados={cabecera.productosActualizados ?? 0}
        trabajando={pasando}
        onCerrar={() => setCancelando(false)}
        onCancelar={cancelarLista}
      />

      {pasandoAActualizar && (
        <HojaPasarAActualizar
          proveedor={cabecera.proveedor?.nombre ?? ""}
          // El rango del proveedor, si tiene, para no arrancar con dos campos en
          // blanco. Controlando la cabecera lo guarda en null, así que esto sale
          // de la ficha y no de la importación.
          minSugerido={cabecera.rango?.minPct ?? null}
          maxSugerido={cabecera.rango?.maxPct ?? null}
          trabajando={pasando}
          error={errorAlPasar}
          onPasar={pasarAActualizar}
          onVolver={() => {
            setPasandoAActualizar(false);
            setErrorAlPasar(null);
          }}
        />
      )}

      {cambiandoColumna && (
        <HojaCambiarColumna
          lectura={lectura}
          trabajando={pasando}
          error={errorAlPasar}
          onCambiar={cambiarColumna}
          onVolver={() => {
            setCambiandoColumna(false);
            setErrorAlPasar(null);
          }}
        />
      )}

      {/* ── VINCULAR CON LA LISTA ─────────────────────────────────────────
          Al guardar, la hoja se cierra y la tarjeta cambia en el lugar: se
          relee sin el cargador y queda fijada aunque su estado nuevo ya no sea
          el del chip puesto. */}
      {vinculando && (
        <HojaVincularConLaLista
          endpoint={`/api/proveedores/listas/${id}/productos/${vinculando.productoBaseId}/en-la-lista`}
          nombre={vinculando.nombre}
          proveedor={nombreProveedor}
          cuerpoNoViene={{ noViene: true }}
          onCerrar={() => setVinculando(null)}
          onListo={async () => {
            const productoBaseId = vinculando.productoBaseId;
            setVinculando(null);
            await despuesDeTocar(productoBaseId);
          }}
        />
      )}

      {/* ── «NO ES ESTE PRODUCTO», DESDE LA HOJA DE REVISAR ─────────────────
          La misma hoja, por la puerta de la fila: mueve el vínculo a otro
          renglón, o con «No viene en esta lista» lo saca de la lista. */}
      {eligiendoOtra && (
        <HojaVincularConLaLista
          endpoint={`/api/proveedores/listas/${id}/filas/${eligiendoOtra.fila.id}/otra-fila`}
          nombre={eligiendoOtra.fila.nombre}
          proveedor={nombreProveedor}
          cuerpoNoViene={{ noEstaEnLaLista: true }}
          onCerrar={() => setEligiendoOtra(null)}
          onListo={async () => {
            const productoBaseId = eligiendoOtra.productoBaseId;
            setEligiendoOtra(null);
            await despuesDeTocar(productoBaseId);
          }}
        />
      )}

      {/* ── REVISAR: LA DECISIÓN DE SIEMPRE, EN UNA HOJA ────────────────────
          Caja entera, una unidad, o No lo cambio. */}
      {revisando && (
        <HojaRevisarPrecio
          importacionId={id}
          filaId={revisando.filaId}
          onCerrar={() => setRevisando(null)}
          onNoEsEste={(fila) => {
            const productoBaseId = revisando.productoBaseId;
            setRevisando(null);
            setEligiendoOtra({ fila, productoBaseId });
          }}
          onListo={async () => {
            const productoBaseId = revisando.productoBaseId;
            setRevisando(null);
            await despuesDeTocar(productoBaseId);
          }}
        />
      )}

      {confirmando && (
        <HojaConfirmarAplicar
          cantidad={listos}
          proveedor={cabecera.proveedor?.nombre ?? ""}
          paraRevisar={conteo.paraRevisar}
          trabajando={aplicando}
          onAplicar={aplicar}
          onVolver={() => setConfirmando(false)}
        />
      )}
    </Marco>
  );
}

/** En qué situación está la lista, dicho como lo diría una persona. */
function estadoEnCastellano(cabecera) {
  if (cabecera.estado === "CANCELADA") return "cancelada";
  if (cabecera.estado === "TERMINADA") {
    return `terminada: se actualizaron ${cabecera.productosActualizados} productos`;
  }
  if (cabecera.productosActualizados > 0) {
    // Los tres números que tienen que cerrar entre sí —éste, el del botón y el
    // de deshacer— son los que Emanuel mira para saber si algo pasó. "1
    // productos ya actualizados" al lado de "Deshacer los 1" los hace ver como
    // texto generado y no como una cuenta.
    return cabecera.productosActualizados === 1
      ? "1 producto ya actualizado"
      : `${cabecera.productosActualizados} productos ya actualizados`;
  }
  return "todavía no cambió ningún precio";
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
