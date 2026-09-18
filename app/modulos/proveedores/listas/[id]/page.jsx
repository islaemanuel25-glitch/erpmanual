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

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import {
  TarjetaGrande,
  TarjetaChica,
  TarjetaAncha,
  FilaDeCambio,
  Aviso,
  pct,
} from "@/components/proveedores/listas/PiezasPantallas";
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
import { MOTIVO_REVISION } from "@/lib/proveedores/listas/resultadoDeLaLista";
// PARA QUÉ SE SUBIÓ LA LISTA. Decide si esta pantalla muestra el resultado de
// siempre o el del control, que son dos cuerpos distintos y no dos textos.
import { CONTROL, MODO_LISTA } from "@/lib/proveedores/listas/modoDeLaLista";
import { esImportacionAbierta, ESTADOS_A_MEDIAS } from "@/lib/proveedores/listas/persistencia";

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

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

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

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/resultado`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo cargar el resultado de esta lista.");
        return;
      }
      setDatos(json);
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto || !Number.isInteger(id)) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto, id]);

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
      setAviso({
        tono: "success",
        texto: `Listo. Se actualizaron ${j.aplicadas ?? 0} ${(j.aplicadas ?? 0) === 1 ? "producto" : "productos"}.`,
      });
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
  if (!esAdmin) return <SinPermisos />;

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

  const { cabecera, conteo, variacion, muestra, lectura, control } = datos;
  const controlando = cabecera.modo === MODO_LISTA.CONTROLAR;
  const abierta = esImportacionAbierta(cabecera.estado);
  const aMedias = ESTADOS_A_MEDIAS.includes(cabecera.estado);
  const listos = conteo.listos;
  const puedeDeshacer = cabecera.productosActualizados > 0;

  const irA = (sub) => router.push(`/modulos/proveedores/listas/${id}${sub}`);
  // Los tres grupos que esta lista NO va a corregir, juntos. Es el número de la
  // tarjeta ancha y el total de la pantalla 7: sale de sumar acá y no de una
  // consulta aparte para que las dos no puedan decir cosas distintas.
  const noCambian = conteo.paraRevisar + conteo.dejadas + (cabecera.tuyosQueNoAparecen ?? 0);

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
      <p className="text-sm2 sunmi-text-muted leading-snug">
        {cabecera.archivoNombre} ·{" "}
        {controlando
          ? "no se cambió ningún precio"
          : `leída ${fechaHora(cabecera.leidaEn)} · ${estadoEnCastellano(cabecera)}`}
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

      {controlando ? (
        <>
          {/* ── LOS TRES GRUPOS DEL CONTROL ────────────────────────────────
              El verde arriba y solo, porque es la respuesta a la pregunta que
              trajo a alguien acá: "¿la lista coincide con lo que tengo?". Los
              dos desacuerdos van abajo y en pareja, porque son la misma
              pregunta mirada de los dos lados. */}
          <TarjetaGrande
            numero={control?.coinciden ?? 0}
            titulo="coinciden con tu costo"
            detalle={
              (control?.coinciden ?? 0) > 0
                ? "El precio de la lista es el que ya tenías, salvo redondeo."
                : "Ningún producto de la lista coincide con tu costo de hoy."
            }
            ariaLabel={
              (control?.coinciden ?? 0) > 0
                ? `Ver los ${control.coinciden} que coinciden con tu costo`
                : undefined
            }
            onClick={
              (control?.coinciden ?? 0) > 0
                ? () => irA(`/actualizan?control=${CONTROL.COINCIDE}`)
                : undefined
            }
          />

          <div className="grid grid-cols-2 gap-3">
            <TarjetaChica
              numero={control?.tuCostoMasBajo ?? 0}
              titulo="tu costo es más bajo"
              detalle="La lista dice más"
              tono="warning"
              ariaLabel={
                (control?.tuCostoMasBajo ?? 0) > 0
                  ? `Ver los ${control.tuCostoMasBajo} donde la lista dice más que tu costo`
                  : undefined
              }
              onClick={
                (control?.tuCostoMasBajo ?? 0) > 0
                  ? () => irA(`/actualizan?control=${CONTROL.TU_COSTO_MAS_BAJO}`)
                  : undefined
              }
            />
            <TarjetaChica
              numero={control?.tuCostoMasAlto ?? 0}
              titulo="tu costo es más alto"
              detalle="La lista dice menos"
              tono="warning"
              ariaLabel={
                (control?.tuCostoMasAlto ?? 0) > 0
                  ? `Ver los ${control.tuCostoMasAlto} donde la lista dice menos que tu costo`
                  : undefined
              }
              onClick={
                (control?.tuCostoMasAlto ?? 0) > 0
                  ? () => irA(`/actualizan?control=${CONTROL.TU_COSTO_MAS_ALTO}`)
                  : undefined
              }
            />
          </div>

          {/* Los dos que no son una diferencia de precio sino una diferencia de
              catálogo. Son los MISMOS dos que muestra el modo de actualizar, con
              las mismas pantallas detrás: controlar no inventa grupos nuevos
              para lo que ya tenía nombre. */}
          <div className="grid grid-cols-2 gap-3">
            <TarjetaChica
              numero={cabecera.tuyosQueNoAparecen ?? 0}
              titulo={cabecera.tuyosQueNoAparecen === 1 ? "tuyo que no vino" : "tuyos que no vinieron"}
              detalle="No están en esta lista"
              ariaLabel={
                (cabecera.tuyosQueNoAparecen ?? 0) > 0
                  ? `Ver los ${cabecera.tuyosQueNoAparecen} tuyos que no vinieron en esta lista`
                  : undefined
              }
              onClick={
                (cabecera.tuyosQueNoAparecen ?? 0) > 0
                  ? () => irA("/no-cambian?filtro=NO_VINO")
                  : undefined
              }
            />
            <TarjetaChica
              numero={conteo.sinProducto}
              titulo={conteo.sinProducto === 1 ? "de la lista que no tenés" : "de la lista que no tenés"}
              detalle={abierta ? "Ver y vincular" : "Sin vincular"}
              ariaLabel={
                abierta && conteo.sinProducto > 0
                  ? `Ver y vincular los ${conteo.sinProducto} de la lista que no tenés`
                  : undefined
              }
              onClick={
                abierta && conteo.sinProducto > 0
                  ? () => irA(`/revisar?solo=${MOTIVO_REVISION.SIN_PRODUCTO}`)
                  : undefined
              }
            />
          </div>
        </>
      ) : aMedias ? (
        <TarjetaGrande
          numero={listos}
          titulo={listos === 1 ? "se actualiza" : "se actualizan"}
          detalle={textoDeVariacion(
            variacion,
            cabecera.rango,
            conteo.listosElegidosFueraDeRango ?? 0,
            conteo.rangoDeLosElegidos ?? null
          )}
          // LA TARJETA VERDE TAMBIÉN SE TOCA, y es la que más falta hacía: es el
          // número que Emanuel viene a mirar, y era la única de la pantalla que
          // no llevaba a ningún lado. El "Ver los N" que hacía ese trabajo era
          // un texto suelto quince centímetros más abajo.
          ariaLabel={listos > 0 ? `Ver los ${listos} que se actualizan` : undefined}
          onClick={listos > 0 ? () => irA("/actualizan") : undefined}
        />
      ) : (
        <TarjetaGrande
          tono="warning"
          numero={cabecera.productosActualizados}
          titulo={
            cabecera.estado === "CANCELADA"
              ? "Cancelada: no se actualizó nada"
              : cabecera.productosActualizados === 1
                ? "producto actualizado"
                : "productos actualizados"
          }
          detalle={cabecera.estado === "TERMINADA" ? "Esta lista está terminada." : null}
        />
      )}

      {/* ── LAS TARJETAS DEL MODO DE ACTUALIZAR NO SE DIBUJAN CONTROLANDO ──
          No es cosmética: "para revisar" y "los dejaste igual" ofrecen trabajo
          que en un control no existe —confirmar una lectura para poder aplicar,
          excluir una fila de una aplicación que no va a pasar—. Y "se actualizan"
          sería directamente falso. Los cuatro se reemplazan por los tres grupos
          del control, que son la pregunta que este modo vino a contestar. */}
      {!controlando && (
      <div className="grid grid-cols-2 gap-3">
        <TarjetaChica
          numero={conteo.paraRevisar}
          titulo="para revisar"
          // UNA LISTA CERRADA NO INVITA A TRABAJAR. "De a uno" sobre una
          // terminada ofrece un trabajo que ya no se puede hacer: confirmar o
          // excluir una fila necesita la importación abierta y el servidor lo
          // rechaza. El número sigue estando —es información de lo que quedó—
          // pero sin la invitación y sin el toque.
          detalle={aMedias ? "De a uno" : "Quedaron sin resolver"}
          tono="warning"
          ariaLabel={aMedias ? `Revisar los ${conteo.paraRevisar} de a uno` : undefined}
          onClick={aMedias && conteo.paraRevisar > 0 ? () => irA("/revisar") : undefined}
        />
        {/* ── "LOS DEJASTE IGUAL" YA NO SE MEZCLA CON "YA VALÍAN LO MISMO" ──
            Eran un solo número —"que no se tocan"— y son dos cosas distintas:
            una es una decisión de Emanuel, que se puede deshacer y que él quiere
            poder revisar; la otra es que el proveedor mandó el mismo precio, que
            no es trabajo de nadie. Sumarlas daba una tarjeta que no llevaba a
            ningún lado porque no se podía: la mitad de su número no tenía
            pantalla. Separadas, ésta lleva a la 7 filtrada en "Los dejaste", y
            las que ya valían igual dejan de ocupar una tarjeta. */}
        <TarjetaChica
          numero={conteo.dejadas}
          titulo={conteo.dejadas === 1 ? "lo dejaste igual" : "los dejaste igual"}
          detalle={aMedias ? "Ver cuáles" : "No se tocaron"}
          ariaLabel={
            conteo.dejadas > 0 ? `Ver los ${conteo.dejadas} que dejaste igual` : undefined
          }
          onClick={conteo.dejadas > 0 ? () => irA("/no-cambian?filtro=DEJADO") : undefined}
        />
      </div>
      )}

      {!controlando && (
      <div className="grid grid-cols-2 gap-3">
        {/* Los dos que no son trabajo de esta lista y sí hay que poder mirar. */}
        <TarjetaChica
          numero={conteo.sinProducto}
          titulo={conteo.sinProducto === 1 ? "no lo tenés" : "no los tenés"}
          detalle={abierta ? "De la lista. Ver y vincular" : "De la lista, sin vincular"}
          ariaLabel={
            abierta && conteo.sinProducto > 0
              ? `Ver y vincular los ${conteo.sinProducto} de la lista que no tenés`
              : undefined
          }
          onClick={
            abierta && conteo.sinProducto > 0
              ? () => irA(`/revisar?solo=${MOTIVO_REVISION.SIN_PRODUCTO}`)
              : undefined
          }
        />
        <TarjetaChica
          numero={cabecera.tuyosQueNoAparecen ?? 0}
          titulo={cabecera.tuyosQueNoAparecen === 1 ? "tuyo sin precio" : "tuyos sin precio"}
          detalle="No vinieron. Ver cuáles"
          ariaLabel={
            (cabecera.tuyosQueNoAparecen ?? 0) > 0
              ? `Ver los ${cabecera.tuyosQueNoAparecen} tuyos que no vinieron en esta lista`
              : undefined
          }
          onClick={
            (cabecera.tuyosQueNoAparecen ?? 0) > 0
              ? () => irA("/no-cambian?filtro=NO_VINO")
              : undefined
          }
        />
      </div>
      )}

      {/* LOS TRES GRUPOS JUNTOS, que es como los mira Emanuel: lo suyo de este
          proveedor que después de aplicar va a seguir con el costo viejo.
          Controlando no corresponde: NINGÚN producto cambia, así que "los que no
          cambian" sería la lista entera y no distinguiría nada. */}
      {!controlando && noCambian > 0 && (
        <TarjetaAncha
          titulo={`Tus productos de ${cabecera.proveedor?.nombre ?? "este proveedor"} que no cambian · ${noCambian}`}
          detalle={renglonDeLosQueNoCambian(conteo, cabecera.tuyosQueNoAparecen ?? 0)}
          ariaLabel={`Ver los ${noCambian} productos tuyos que esta lista no va a corregir`}
          onClick={() => irA("/no-cambian")}
        />
      )}

      {/* ── LA MUESTRA SE CALLA CUANDO NO HAY NADA QUE MOSTRAR ──────────────
          `muestra` son filas en LISTO_PARA_ACTUALIZAR, o sea las que se
          aplicarían. En una lista cerrada SIN nada aplicado —terminada sin
          aplicar, o aplicada y después deshecha— esas filas siguen existiendo y
          el título decía "Algunos de los que se actualizaron" arriba de
          `$1.342,90 → $1.430,19`. Los costos habían vuelto a los de antes: la
          pantalla afirmaba un cambio que no ocurrió. */}
      {/* ── Y CONTROLANDO NO SE MUESTRA NINGUNA, porque no se actualiza nada.
          `muestra` son filas en LISTO_PARA_ACTUALIZAR, que es un estado que
          controlando también se escribe —el motor clasifica igual— así que la
          sección aparecía igual, encabezada "Algunos de los que se actualizan",
          debajo del renglón que acababa de decir que no se cambió ningún precio.
          Se vio en la captura a 360; leyendo el código no se notaba, porque la
          condición `aMedias` es verdadera en los dos modos. */}
      {!controlando && muestra.length > 0 && (aMedias || cabecera.productosActualizados > 0) && (
        <section className="space-y-1">
          <h2 className="text-sm3 font-semibold sunmi-text-strong">
            {aMedias ? "Algunos de los que se actualizan" : "Algunos de los que se actualizaron"}
          </h2>
          <SunmiCard className="p-3 divide-y sunmi-divide">
            {muestra.map((m) => (
              <FilaDeCambio
                key={m.id}
                nombre={m.nombre}
                costoAnterior={m.costoAnterior}
                costoNuevo={m.costoNuevo}
                variacionPct={m.variacionPct}
              />
            ))}
          </SunmiCard>
          {/* ── SE FUE EL "Ver los N" ───────────────────────────────────────
              Era un texto suelto que funcionaba como botón, y era la ÚNICA
              forma de llegar a la lista de los que se actualizan: la tarjeta
              verde de arriba, que es el número que se viene a mirar, no llevaba
              a ningún lado. Emanuel la tocó y no pasó nada.
              Ahora lleva la tarjeta, que es lo que se toca primero, y acá no
              queda nada: tres ejemplos para mirar y se terminó. */}
        </section>
      )}

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

      {/* LAS ACCIONES POSIBLES, Y SOLO ESAS. */}
      {!controlando && abierta && listos > 0 && (
        <div className="space-y-2">
          <SunmiButton
            color="cyan"
            onClick={() => setConfirmando(true)}
            disabled={aplicando}
            className="w-full min-h-toque text-base font-bold"
          >
            Aplicar los {listos} precios
          </SunmiButton>
          {conteo.paraRevisar > 0 && (
            <SunmiButton
              color="slate"
              onClick={() => irA("/revisar")}
              className="w-full min-h-toque text-sm3"
            >
              Revisar los {conteo.paraRevisar} de a uno
            </SunmiButton>
          )}
          <p className="text-sm2 sunmi-text-muted text-center leading-snug">
            {conteo.paraRevisar > 0
              ? `Los ${conteo.paraRevisar} para revisar no se tocan al aplicar. Todo se puede deshacer.`
              : "Todo se puede deshacer."}
          </p>
        </div>
      )}

      {!controlando && abierta && listos === 0 && conteo.paraRevisar > 0 && (
        <SunmiButton
          color="cyan"
          onClick={() => irA("/revisar")}
          className="w-full min-h-toque text-base font-bold"
        >
          Revisar los {conteo.paraRevisar} de a uno
        </SunmiButton>
      )}

      {puedeDeshacer && (
        <SunmiButton
          color="slate"
          onClick={() => setDeshaciendo(true)}
          disabled={aplicando}
          className="w-full min-h-toque text-sm3"
        >
          Deshacer los {cabecera.productosActualizados} que se actualizaron
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
      <div className="grid grid-cols-2 gap-2">
        {abierta ? (
          <SunmiButton
            color="slate"
            onClick={() => setTerminando(true)}
            disabled={aplicando}
            className="min-h-toque text-sm3"
          >
            Terminar lista
          </SunmiButton>
        ) : (
          <span />
        )}
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
    return `${cabecera.productosActualizados} productos ya actualizados`;
  }
  return "todavía no cambió ningún precio";
}

/**
 * "Todos aumentan entre 5 % y 8 %, como esperabas."
 *
 * Los dos extremos salen del servidor, medidos sobre las filas que SE VAN A
 * aplicar. Decir el rango configurado en vez del real sería prometer algo que no
 * se miró: son los mismos números solo cuando todo salió bien.
 */
/**
 * El renglón de la tarjeta ancha: de qué está hecho ese número.
 *
 * Se arma nombrando los grupos que EXISTEN y no los tres siempre: con cero
 * dejados, "y el que dejaste" habla de algo que no está, y ese es el tipo de
 * frase que hace dudar del número de al lado.
 */
function renglonDeLosQueNoCambian(conteo, noVinieron) {
  const partes = [];
  if (conteo.paraRevisar > 0) partes.push(`los ${conteo.paraRevisar} para revisar`);
  if (conteo.dejadas === 1) partes.push("el que dejaste");
  else if (conteo.dejadas > 1) partes.push(`los ${conteo.dejadas} que dejaste`);
  if (noVinieron > 0) partes.push(`los ${noVinieron} que no vinieron`);
  if (partes.length === 0) return null;
  if (partes.length === 1) return `${partes[0].charAt(0).toUpperCase()}${partes[0].slice(1)}.`;
  const ultimo = partes.pop();
  const frase = `${partes.join(", ")} y ${ultimo}, juntos`;
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}

// ── EL RENGLÓN QUE MENTÍA, Y CÓMO DEJA DE MENTIR ──────────────────────────
//
// Decía "Todos aumentan entre +2,6 % y +1.008,5 %" sobre un proveedor que
// aumenta entre 2 y 15. Eso ya está arreglado de raíz —una fila fuera de rango
// que nadie eligió no se cuenta entre los listos— pero queda un caso legítimo
// que lo volvería a sacar del rango: una fila que Emanuel eligió A PROPÓSITO
// sabiendo que estaba afuera. Ésa sí se va a escribir.
//
// Mezclarla en el mismo rango daría "entre +5,0 % y +99,5 %", que es otra vez
// una frase que se sale de lo configurado y que no dice por qué. Así que se
// cuenta aparte y se nombra: el rango anunciado nunca se sale del configurado,
// y lo que se sale tiene nombre, número y autor.
function textoDeVariacion(variacion, rango, elegidos = 0, rangoElegidos = null) {
  const cola = (() => {
    if (!elegidos) return "";
    const min = rangoElegidos?.minPct;
    const max = rangoElegidos?.maxPct;
    if (min === null || min === undefined) return ` Más ${elegidos} que elegiste vos.`;
    const iguales = Math.round(min * 10) === Math.round(max * 10);
    const cuanto = iguales ? pct(min) : `entre ${pct(min)} y ${pct(max)}`;
    return elegidos === 1
      ? ` Más uno que elegiste vos, de ${cuanto}.`
      : ` Más ${elegidos} que elegiste vos, ${iguales ? `de ${cuanto}` : cuanto}.`;
  })();

  if (variacion?.minPct === null || variacion?.maxPct === null) {
    return cola ? cola.trim() : null;
  }
  const min = pct(variacion.minPct);
  const max = pct(variacion.maxPct);
  const iguales = Math.round(variacion.minPct * 10) === Math.round(variacion.maxPct * 10);
  const dentro =
    rango?.minPct !== null &&
    rango?.maxPct !== null &&
    variacion.minPct >= rango.minPct - 0.05 &&
    variacion.maxPct <= rango.maxPct + 0.05;
  const remate = dentro ? ", como esperabas." : ".";
  const cuerpo = iguales
    ? `Todos aumentan ${min}${remate}`
    : `Todos aumentan entre ${min} y ${max}${remate}`;
  return `${cuerpo}${cola}`;
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
