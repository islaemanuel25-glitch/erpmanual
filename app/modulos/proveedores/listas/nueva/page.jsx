"use client";

// 2 · SUBIR UNA LISTA — y, si hace falta, 3 · ¿LEÍ BIEN LA LISTA?
//
// ── POR QUÉ LAS DOS PANTALLAS SON UNA SOLA PÁGINA ───────────────────────────
//
// Porque entre una y otra está el archivo. Confirmar las columnas es contestar
// una pregunta SOBRE ESE archivo, y si fueran dos direcciones habría que volver a
// subirlo: son 10 MB por un teléfono, y son dos toques más justo cuando el
// usuario ya contestó lo que se le preguntó.
//
// Acá el archivo se queda en memoria y la pantalla cambia de paso. La pregunta se
// hace una vez por proveedor, así que la segunda lista de M Y F no la ve nunca.
//
// ── TRES TARJETAS NUMERADAS, NO UN FORMULARIO ───────────────────────────────
//
// Antes era un formulario largo con el proveedor, la configuración y el archivo
// mezclados, y el botón al final. Numerarlas es lo que permite contestar "dónde
// estoy" sin leerlo entero, que en un teléfono es la diferencia entre avanzar y
// abandonar.
//
// ── LO QUE ESTA PANTALLA NO HACE ────────────────────────────────────────────
//
// No cambia ningún precio, y lo dice abajo del botón. Leer una lista deja una
// propuesta revisable; aplicar es otra pantalla y otra confirmación.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import { Aviso } from "@/components/proveedores/listas/PiezasPantallas";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import ConfirmarColumnas from "@/components/proveedores/listas/ConfirmarColumnas";
import {
  proveedorAdmiteImportacion,
  validarArchivoEnCliente,
  mensajeDeError,
  tamanoArchivo,
  fechaHora,
} from "@/lib/proveedores/listas/presentacion";
import { LIMITES } from "@/lib/proveedores/listas/persistencia";
// Qué le falta a un proveedor para poder importar. Se le pregunta a la MISMA
// función que usa el endpoint para rechazar: dos copias de esa regla terminarían
// ofreciendo un botón que el servidor después no acepta.
import {
  faltantesDeConfiguracion,
  TEXTO_FALTA_CONFIGURACION,
} from "@/lib/proveedores/listas/configuracionProveedor";
// Y CUÁLES DE LOS "NO PUDE ELEGIR LA COLUMNA" SON PREGUNTAS Y NO ERRORES. La
// lista estaba escrita acá y le faltaban dos de los cuatro motivos; ahora la
// contesta el módulo que define el enum.
import { seContestaEligiendoColumna } from "@/lib/proveedores/listas/decisionDeLista";
// PARA QUÉ SE SUBE LA LISTA. Los textos de los dos botones salen de acá y no
// escritos en el JSX: los muestra también el resultado del control y la lista de
// importaciones, y tres copias de una frase se separan el día que alguien
// corrige una.
import { MODO_LISTA, TEXTO_MODO } from "@/lib/proveedores/listas/modoDeLaLista";

/** Los dos pasos de esta página. */
const PASO = { SUBIR: "SUBIR", COLUMNAS: "COLUMNAS" };

export default function SubirListaPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const inputArchivo = useRef(null);

  const [paso, setPaso] = useState(PASO.SUBIR);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [proveedores, setProveedores] = useState([]);
  // Dónde está parado. Solo se usa para explicar una lista vacía, y por eso
  // viene del servidor junto con los proveedores: es el mismo alcance con el que
  // se los buscó, no otro que la pantalla deduzca por su cuenta.
  const [ubicacion, setUbicacion] = useState(null);
  const [proveedorId, setProveedorId] = useState("");
  const [abierta, setAbierta] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  // Lo que contestó el servidor cuando hace falta confirmar las columnas.
  const [pregunta, setPregunta] = useState(null);
  // PARA QUÉ SE SUBE. Arranca en actualizar porque es lo que se hace casi
  // siempre; controlar es la pregunta que uno se hace de vez en cuando.
  const [modo, setModo] = useState(MODO_LISTA.ACTUALIZAR);
  const controlando = modo === MODO_LISTA.CONTROLAR;

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  // El título y la salida van a la fila del shell, igual que en las otras cinco
  // pantallas del módulo. Acá el título cambia con el paso: el de columnas es
  // otra pregunta y merece su propio nombre arriba.
  useTituloDePagina(paso === PASO.COLUMNAS ? "¿Leí bien la lista?" : "Subir una lista");
  useAccionDePagina(
    () => <SunmiBackButton href="/modulos/proveedores/listas" texto="Listas" className="min-h-toque" />,
    []
  );

  const cargarProveedores = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const r = await fetch("/api/proveedores/listas/proveedores", {
        credentials: "include",
        cache: "no-store",
      });
      // ── UN 500 NO SE PUEDE LEER COMO UNA LISTA VACÍA ────────────────────
      //
      // `r.json()` explota cuando el servidor contesta una página de error en
      // vez de JSON, y ese throw caía en el `catch` de abajo diciendo "no se
      // pudo conectar": justo lo contrario de lo que pasó —se conectó y falló—.
      // Peor todavía era el caso sin throw: sin proveedores el selector dibuja
      // "Sin resultados", que es lo que dice una búsqueda que anduvo bien.
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorCarga(
          json?.error ||
            `No se pudo leer la lista de proveedores (error ${r.status}). Probá de nuevo.`
        );
        return;
      }
      setProveedores(json.items ?? []);
      setUbicacion(json.ubicacion ?? null);
    } catch {
      setErrorCarga("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargarProveedores();
  }, [cargarProveedores, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  const proveedor = useMemo(
    () => proveedores.find((p) => String(p.id) === String(proveedorId)) ?? null,
    [proveedores, proveedorId]
  );
  const compat = proveedorAdmiteImportacion(proveedor);
  const extensiones = proveedor?.extensiones?.length ? proveedor.extensiones : LIMITES.extensiones;

  useEffect(() => {
    if (!proveedorId) {
      setAbierta(null);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(
          `/api/proveedores/listas?proveedorId=${proveedorId}&pageSize=10`,
          { credentials: "include", cache: "no-store" }
        );
        const j = await r.json();
        if (!vivo || !j?.ok) return;
        const viva = (j.items ?? []).find(
          (i) => i.estado === "CONCILIADA" || i.estado === "PARCIALMENTE_APLICADA"
        );
        setAbierta(viva ?? null);
      } catch {
        // El aviso es de cortesía: si no se puede consultar, no se traba nada.
      }
    })();
    return () => { vivo = false; };
  }, [proveedorId]);

  // ── LOS VALORES COMERCIALES DE ESTA LISTA ────────────────────────────────
  //
  // Viven como TEXTO mientras se editan. Un campo numérico controlado con un
  // número no deja escribir "0," ni borrar el contenido para escribir otra cosa.
  const [minPct, setMinPct] = useState("");
  const [maxPct, setMaxPct] = useState("");
  const [recargoPct, setRecargoPct] = useState("");
  // `null` es "todavía no contestó", que NO es lo mismo que "no tiene".
  const [tieneImpuestos, setTieneImpuestos] = useState(null);
  const [impuestoPct, setImpuestoPct] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState("");

  // DEPENDE DEL ID, NO DEL OBJETO. Dependía de `proveedor`, que sale de un
  // `useMemo` sobre la lista; guardar la configuración reemplaza ese objeto y
  // este efecto borraba el aviso de "Guardado." en el mismo instante en que
  // aparecía.
  useEffect(() => {
    const c = proveedor?.configuracion ?? null;
    const txt = (v) => (v === null || v === undefined ? "" : String(v));
    setMinPct(txt(c?.minPct));
    setMaxPct(txt(c?.maxPct));
    setRecargoPct(txt(c?.recargoPct));
    setTieneImpuestos(c?.impuestosDefinidos ? Number(c?.impuestoAdicionalPct) > 0 : null);
    setImpuestoPct(txt(c?.impuestoAdicionalPct));
    setAvisoGuardado("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId]);

  const configEditada = useMemo(() => ({
    minPct: minPct === "" ? null : Number(minPct),
    maxPct: maxPct === "" ? null : Number(maxPct),
    recargoPct: recargoPct === "" ? null : Number(recargoPct),
    impuestoAdicionalPct: tieneImpuestos === false ? 0 : (impuestoPct === "" ? null : Number(impuestoPct)),
    impuestosDefinidos: tieneImpuestos !== null,
  }), [minPct, maxPct, recargoPct, tieneImpuestos, impuestoPct]);

  // EL MODO ENTRA EN LA VALIDACIÓN DE LA PANTALLA, porque si no el botón
  // quedaría apagado pidiendo un rango que el servidor no va a exigir. Es la
  // misma función que usa el endpoint, con el mismo argumento: dos copias de
  // esta regla terminarían ofreciendo un botón que el servidor después rechaza.
  const faltan = useMemo(
    () => faltantesDeConfiguracion(configEditada, { modo }),
    [configEditada, modo]
  );
  const configCompleta = faltan.length === 0;
  const yaGuardado = (proveedor?.faltaConfigurar ?? []).length === 0 && !!proveedor?.configuracion;

  const guardarParaLasProximas = async () => {
    if (!proveedor || !configCompleta || guardando) return;
    setGuardando(true);
    setAvisoGuardado("");
    setErrorEnvio(null);
    try {
      const r = await fetch(
        `/api/proveedores/listas/proveedores/${proveedor.id}/configuracion`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aumentoEsperadoMinPct: configEditada.minPct,
            aumentoEsperadoMaxPct: configEditada.maxPct,
            recargoPct: configEditada.recargoPct,
            impuestosDefinidos: true,
            impuestoAdicionalPct: configEditada.impuestoAdicionalPct,
          }),
        }
      );
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAvisoGuardado(j?.error || "No se pudo guardar.");
        return;
      }
      setProveedores((ant) =>
        ant.map((p) => (p.id === proveedor.id ? { ...p, configuracion: j.configuracion, faltaConfigurar: [] } : p))
      );
      setAvisoGuardado(`Guardado. Las próximas listas de ${proveedor.nombre} arrancan con estos valores.`);
    } catch {
      setAvisoGuardado("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const elegirArchivo = (e) => {
    const f = e.target.files?.[0] ?? null;
    setErrorEnvio(null);
    if (!f) {
      setArchivo(null);
      setErrorArchivo("");
      return;
    }
    const v = validarArchivoEnCliente(f, {
      tamanoMaxBytes: LIMITES.tamanoMaxBytes,
      extensiones,
    });
    setArchivo(v.ok ? f : null);
    setErrorArchivo(v.ok ? "" : v.error);
    if (!v.ok && inputArchivo.current) inputArchivo.current.value = "";
  };

  const puedeEnviar =
    !!proveedor && compat.admite && !!archivo && !errorArchivo && !enviando && configCompleta;

  /**
   * Manda el archivo a leer.
   *
   * `extra` lleva lo que el usuario contestó en el paso de columnas: cuál es la
   * columna de precio y si lleva descuento. Va por la misma puerta y no por una
   * aparte, así que el camino que corre es el mismo que el de siempre.
   */
  const leerLista = async (extra = {}) => {
    if (!proveedor || !archivo) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo, archivo.name);
      fd.append("proveedorId", String(proveedor.id));
      fd.append("modo", modo);
      // CONTROLANDO NO SE MANDA RANGO, y va vacío en vez de ir en cero: un 0 a 0
      // es lo que el servidor interpreta como "quiso controlar sin saberlo" y
      // le pone su aviso. Mandarlo desde acá, donde el modo YA está elegido,
      // haría que el aviso apareciera sobre una elección explícita.
      fd.append("aumentoEsperadoMinPct", controlando ? "" : String(configEditada.minPct));
      fd.append("aumentoEsperadoMaxPct", controlando ? "" : String(configEditada.maxPct));
      fd.append("recargoPct", String(configEditada.recargoPct));
      fd.append("impuestosDefinidos", "true");
      fd.append("impuestoAdicionalPct", String(configEditada.impuestoAdicionalPct));
      if (extra.columnaPrecio !== undefined && extra.columnaPrecio !== null) {
        fd.append("columnaPrecio", String(extra.columnaPrecio));
        fd.append("conDescuento", extra.conDescuento ? "true" : "false");
        // ── Y SI LA ELIGIÓ LA PERSONA O SOLO ACEPTÓ LA PROPUESTA ───────────
        //
        // Sin esto el servidor no puede distinguirlas, y la propuesta —hecha por
        // el nombre de la columna— le gana al motor y se traga la pregunta que
        // el motor quería hacer. Ver el encabezado de `precioElegidoPorUsuario`
        // en `ConfirmarColumnas`.
        fd.append("precioElegidoPorUsuario", extra.precioElegidoPorUsuario === true ? "true" : "false");
      }

      const r = await fetch("/api/proveedores/listas/importar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await r.json().catch(() => null);

      // ── LAS DOS PREGUNTAS QUE NO SON ERRORES ────────────────────────────
      //
      // "Falta confirmar las columnas" y "no pude elegir la columna de precio"
      // llegan como 409 porque el pedido no se pudo completar, pero para el
      // usuario no son fallas: son preguntas. Mostrarlas como error rojo mandaría
      // a buscar qué se hizo mal cuando lo único que hay que hacer es contestar.
      if (r.status === 409 && json?.codigo === "FALTA_CONFIRMAR_COLUMNAS") {
        setPregunta({ ...json, empate: false });
        setPaso(PASO.COLUMNAS);
        return;
      }
      if (r.status === 409 && seContestaEligiendoColumna(json?.codigo)) {
        setPregunta({ ...json, empate: true });
        setPaso(PASO.COLUMNAS);
        return;
      }

      if (!r.ok || !json?.ok) {
        setErrorEnvio(mensajeDeError(json, r.status));
        return;
      }
      router.replace(`/modulos/proveedores/listas/${json.importacionId}`);
    } catch {
      setErrorEnvio({ mensaje: "No se pudo conectar con el servidor. Probá de nuevo.", duplicada: false });
    } finally {
      setEnviando(false);
    }
  };

  /**
   * Lo que pasa cuando el usuario contesta la pregunta de las columnas.
   *
   * Dos cosas, y en este orden: se GUARDA el mapa para el proveedor —así la lista
   * del mes que viene no vuelve a preguntar— y recién después se lee el archivo.
   * Al revés, una lectura que fallara por cualquier motivo dejaría la respuesta
   * perdida y habría que contestarla otra vez.
   *
   * El guardado NO es obligatorio para seguir: si falla, se lee igual con lo que
   * el usuario contestó y se avisa que no quedó guardado. Trabar la lectura por
   * no poder guardar una preferencia sería cambiar el problema por uno peor.
   */
  const confirmarYLeer = async (extra) => {
    const hayQueGuardar = pregunta?.codigo === "FALTA_CONFIRMAR_COLUMNAS";
    if (hayQueGuardar && extra?.mapeo && extra?.huella) {
      try {
        const r = await fetch("/api/proveedores/listas/lectura/confirmar", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proveedorId: proveedor.id,
            titulos: extra.titulos,
            huella: extra.huella,
            mapeo: extra.mapeo,
            columnaPrecioElegida: extra.columnaPrecio,
            descuentoAplicado: extra.conDescuento === true,
            // Lo que hace que esa columna guardada valga como respuesta el mes
            // que viene, en vez de ser un dato de color. Una propuesta guardada
            // se lee después como si alguien hubiera decidido, y es justamente
            // lo que dejaba al motor sin poder preguntar.
            precioLoEligioUnaPersona: extra.precioElegidoPorUsuario === true,
          }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          setAvisoGuardado(
            (j?.error || "No se pudo guardar el mapa de columnas.") +
              " La lista se va a leer igual, pero la próxima te lo va a volver a preguntar."
          );
        }
      } catch {
        setAvisoGuardado(
          "No se pudo guardar el mapa de columnas. La lista se va a leer igual, pero la próxima te lo va a volver a preguntar."
        );
      }
    }
    setPaso(PASO.SUBIR);
    setPregunta(null);
    await leerLista({
      columnaPrecio: extra?.columnaPrecio,
      conDescuento: extra?.conDescuento,
      precioElegidoPorUsuario: extra?.precioElegidoPorUsuario === true,
    });
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">
            Seleccioná un contexto operativo para subir una lista.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  // ── 3 · ¿LEÍ BIEN LA LISTA? ──────────────────────────────────────────────
  if (paso === PASO.COLUMNAS && pregunta) {
    return (
      <Marco>
        <ConfirmarColumnas
          proveedor={proveedor}
          pregunta={pregunta}
          trabajando={enviando}
          onVolver={() => { setPaso(PASO.SUBIR); setPregunta(null); }}
          onConfirmado={confirmarYLeer}
        />
      </Marco>
    );
  }

  return (
    <Marco>
      {cargando && (
        <SunmiCard className="p-6">
          <SunmiLoader />
        </SunmiCard>
      )}

      {!cargando && errorCarga && (
        <ErrorRecuperable mensaje={errorCarga} onReintentar={cargarProveedores} />
      )}

      {!cargando && !errorCarga && (
        <>
          {/* ── 0. PARA QUÉ SE SUBE ────────────────────────────────────
              VA PRIMERO, ANTES DEL PROVEEDOR, y no es un capricho de orden: es
              lo que decide qué preguntas siguen. Con "Solo controlar" no se
              pide el rango ni el recargo, así que ponerlo después obligaría a
              contestar campos que después desaparecen. */}
          <SunmiCard className="p-4 space-y-3">
            <h2 className="text-base font-semibold sunmi-text-strong">¿Para qué subís esta lista?</h2>
            <div className="grid gap-2">
              {[MODO_LISTA.ACTUALIZAR, MODO_LISTA.CONTROLAR].map((m) => (
                <SunmiButton
                  key={m}
                  color={modo === m ? "primary" : "ghost"}
                  onClick={() => { setModo(m); setErrorEnvio(null); }}
                  aria-pressed={modo === m}
                  className="w-full min-h-toque text-left flex-col items-start gap-0.5 py-3"
                >
                  <span className="text-base font-semibold">{TEXTO_MODO[m].titulo}</span>
                  <span className="text-sm2 font-normal opacity-90">{TEXTO_MODO[m].detalle}</span>
                </SunmiButton>
              ))}
            </div>
            {controlando && (
              <p className="text-sm2 sunmi-text-muted leading-snug">
                Con «Solo controlar» no se pide cuánto suele aumentar: no se cambia ningún costo,
                solo se compara la lista con los que ya tenés.
              </p>
            )}
          </SunmiCard>

          {/* ── 1 ─────────────────────────────────────────────────────── */}
          <SunmiCard className="p-4 space-y-3">
            <h2 className="text-base font-semibold sunmi-text-strong">1. ¿De qué proveedor es?</h2>
            <div className="space-y-1">
              <label htmlFor="proveedor" className="text-sm2 sunmi-text-muted block">
                Proveedor
              </label>
              <SunmiSelectAdv
                id="proveedor"
                value={proveedorId}
                onChange={(v) => { setProveedorId(v); setErrorEnvio(null); }}
                placeholder="Elegí un proveedor"
                searchable
                className="min-h-toque"
              >
                {proveedores.map((prov) => (
                  <SunmiSelectOption key={prov.id} value={String(prov.id)}>
                    {prov.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
              {proveedor && !compat.admite && (
                <p className="text-sm2 sunmi-text-danger leading-snug">{compat.motivo}</p>
              )}
              {/* ── UNA LISTA VACÍA TIENE DOS MOTIVOS Y UNO TIENE ARREGLO ──
                  Los proveedores se ven desde donde se cargaron los productos, y
                  los productos se cargan en el depósito. Parado en un local la
                  consulta contesta bien y contesta VACÍO, y "No hay proveedores
                  en este contexto" no decía ni qué contexto ni qué hacer: la
                  pantalla quedaba sin salida sobre algo que se resuelve en dos
                  toques. Desde un depósito, en cambio, vacío sí quiere decir que
                  no hay ninguno cargado. */}
              {proveedores.length === 0 && ubicacion?.esDeposito === false && (
                <p className="text-sm2 sunmi-text-warning leading-snug">
                  Los proveedores se manejan desde el depósito. Cambiá a un depósito para subir una
                  lista.
                </p>
              )}
              {proveedores.length === 0 && ubicacion?.esDeposito !== false && (
                <p className="text-sm2 sunmi-text-muted leading-snug">
                  Todavía no hay ningún proveedor cargado acá.
                </p>
              )}
            </div>

            {/* AVISA, NO BLOQUEA: importar teniendo otra abierta es legítimo. */}
            {abierta && (
              <Aviso tono="warning">
                Este proveedor ya tiene una lista sin terminar: {abierta.archivoNombre} ·{" "}
                {fechaHora(abierta.createdAt)}.{" "}
                <SunmiButton
                  color="ghost"
                  onClick={() => router.push(`/modulos/proveedores/listas/${abierta.id}`)}
                  className="sunmi-text-link underline px-0 min-h-toque"
                >
                  Ver la que está abierta
                </SunmiButton>
              </Aviso>
            )}
          </SunmiCard>

          {/* ── 2 ─────────────────────────────────────────────────────── */}
          <SunmiCard className="p-4 space-y-3">
            <h2 className="text-base font-semibold sunmi-text-strong">2. El archivo</h2>

            {/* LA ZONA ES LA ETIQUETA DEL INPUT. Un `<input type=file>` estilado
                nunca queda igual en los navegadores y su botón nativo mide menos
                de 44 px; envolviéndolo en un `<label>` de alto completo, tocar
                cualquier parte de la zona abre el selector. */}
            <label
              htmlFor="archivo"
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed sunmi-border p-5 text-center cursor-pointer min-h-toque"
            >
              <span className="text-base font-semibold sunmi-text-strong">
                {archivo ? `📄 ${archivo.name}` : "Tocá para elegir el archivo"}
              </span>
              <span className="text-sm2 sunmi-text-muted">
                {archivo
                  ? `${tipoDeArchivo(archivo.name)} · ${tamanoArchivo(archivo.size)} · Tocá para cambiar`
                  : `Hasta ${Math.round(LIMITES.tamanoMaxBytes / 1024 / 1024)} MB`}
              </span>
            </label>
            <input
              ref={inputArchivo}
              id="archivo"
              name="archivo"
              type="file"
              accept={extensiones.join(",")}
              onChange={elegirArchivo}
              disabled={enviando}
              className="sr-only"
            />
            {errorArchivo && <p className="text-sm2 sunmi-text-danger">{errorArchivo}</p>}
            <p className="text-sm2 sunmi-text-muted leading-snug">
              {proveedor?.parserListaId
                ? `Este proveedor tiene un formato propio configurado: sirve ${extensiones.join(", ")}.`
                : "Sirve PDF, Excel o CSV, tal como te lo manda el proveedor."}
            </p>
          </SunmiCard>

          {/* ── 3 ─────────────────────────────────────────────────────── */}
          {proveedor && compat.admite && (
            <SunmiCard className="p-4 space-y-4">
              <h2 className="text-base font-semibold sunmi-text-strong">
                {controlando ? "3. Cómo leo los precios" : "3. Cómo controlo los precios"}
              </h2>

              {/* ── TRES ESTADOS, NO DOS ───────────────────────────────────
                  El diseño pide dos renglones: el verde de "ya guardado" y el
                  ámbar de "falta completar", este último con el botón principal
                  apagado. Faltaba el tercero, que es el que se ve mientras se
                  completa: apenas alguien escribe el rango, el botón se
                  enciende y el renglón ámbar seguía diciendo que faltaba algo.
                  Un aviso que no se apaga cuando el problema se resuelve deja de
                  ser un aviso. */}
              {yaGuardado ? (
                <p className="text-sm2 sunmi-text-success leading-snug">
                  Ya guardado para {proveedor.nombre}. Podés cambiarlo solo para esta lista.
                </p>
              ) : configCompleta ? (
                <p className="text-sm2 sunmi-text-success leading-snug">
                  Listo para esta lista. Si querés que valga para las próximas de{" "}
                  {proveedor.nombre}, guardalo con el botón de abajo.
                </p>
              ) : (
                // Y DICE QUÉ FALTA, no que falta algo. Con el rango y el
                // impuesto contestados pero el recargo vacío, "Falta completar
                // esto" dejaba un botón apagado y ninguna pista de cuál de los
                // tres campos lo apagaba — y el recargo es justamente el que se
                // deja en blanco, porque su ayuda dice "poné 0 si no le sumás
                // nada" y el 0 que se ve es el de la marca de agua.
                <div className="text-sm2 sunmi-text-warning leading-snug space-y-1">
                  <p>Falta completar esto para poder leer la lista:</p>
                  <ul className="list-disc pl-5">
                    {faltan.map((f) => (
                      <li key={f}>{TEXTO_FALTA_CONFIGURACION[f] ?? f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* CONTROLANDO NO SE PREGUNTA, porque no se usa para nada. Y
                  desaparece entero en vez de quedar apagado: un campo gris que
                  no se puede tocar invita a preguntarse qué hay que hacer para
                  habilitarlo, y acá la respuesta es "nada". */}
              {!controlando && (
              <Campo
                etiqueta="¿Cuánto suele aumentar?"
                ayuda="Si un producto aumenta menos o más que esto, no se cambia: te lo muestro para que lo mires."
              >
                <div className="grid grid-cols-2 gap-3">
                  <ConPorciento rotulo="Desde">
                    <SunmiInput
                      id="minPct"
                      type="number"
                      inputMode="decimal"
                      value={minPct}
                      onChange={(e) => setMinPct(e.target.value)}
                      placeholder="5"
                      aria-label="Aumento mínimo esperado, en por ciento"
                      className="min-h-toque text-base w-full"
                    />
                  </ConPorciento>
                  <ConPorciento rotulo="Hasta">
                    <SunmiInput
                      id="maxPct"
                      type="number"
                      inputMode="decimal"
                      value={maxPct}
                      onChange={(e) => setMaxPct(e.target.value)}
                      placeholder="8"
                      aria-label="Aumento máximo esperado, en por ciento"
                      className="min-h-toque text-base w-full"
                    />
                  </ConPorciento>
                </div>
              </Campo>
              )}

              <Campo
                etiqueta="¿Le sumás algo al precio de la lista?"
                ayuda="Por ejemplo, el flete. Poné 0 si no le sumás nada."
              >
                <ConPorciento>
                  <SunmiInput
                    id="recargoPct"
                    type="number"
                    inputMode="decimal"
                    value={recargoPct}
                    onChange={(e) => setRecargoPct(e.target.value)}
                    placeholder="0"
                    aria-label="Recargo, en por ciento"
                    className="min-h-toque text-base w-full"
                  />
                </ConPorciento>
              </Campo>

              {/* SÍ O NO CON DOS BOTONES GRANDES, no con una casilla: las dos
                  casillas que había en el módulo medían 14 × 14 px, que en un
                  Sunmi es un blanco que se falla. Y arranca en NINGUNO elegido:
                  "no contestó" y "no tiene" son hechos distintos. */}
              <Campo etiqueta="¿Tiene algún impuesto aparte de la lista?">
                <div className="grid grid-cols-2 gap-3">
                  <SunmiButton
                    color={tieneImpuestos === false ? "cyan" : "slate"}
                    onClick={() => { setTieneImpuestos(false); setImpuestoPct("0"); }}
                    aria-pressed={tieneImpuestos === false}
                    className="min-h-toque text-base font-semibold"
                  >
                    No
                  </SunmiButton>
                  <SunmiButton
                    color={tieneImpuestos === true ? "cyan" : "slate"}
                    onClick={() => setTieneImpuestos(true)}
                    aria-pressed={tieneImpuestos === true}
                    className="min-h-toque text-base font-semibold"
                  >
                    Sí
                  </SunmiButton>
                </div>
                {tieneImpuestos === true && (
                  <div className="mt-3">
                    <ConPorciento>
                      <SunmiInput
                        id="impuestoPct"
                        type="number"
                        inputMode="decimal"
                        value={impuestoPct}
                        onChange={(e) => setImpuestoPct(e.target.value)}
                        placeholder="0"
                        aria-label="Impuesto adicional, en por ciento"
                        className="min-h-toque text-base w-full"
                      />
                    </ConPorciento>
                  </div>
                )}
              </Campo>

              {/* CONTROLANDO NO SE OFRECE GUARDAR PARA LAS PRÓXIMAS. El
                  guardado escribe el rango en la ficha del proveedor, y
                  controlando el rango está vacío: el botón habría guardado dos
                  nulos encima de lo que el proveedor ya tenía cargado.

                  Se esconde en vez de apagarse, por lo mismo que el campo del
                  rango: un botón gris pide que alguien averigüe cómo
                  encenderlo, y acá no hay forma porque no corresponde. */}
              {!controlando && (
              <div>
                <SunmiButton
                  color="slate"
                  onClick={guardarParaLasProximas}
                  disabled={!configCompleta || guardando}
                  className="w-full min-h-toque text-sm3"
                >
                  {guardando ? "Guardando…" : `Guardar para las próximas de ${nombreCorto(proveedor.nombre)}`}
                </SunmiButton>
                {avisoGuardado && (
                  <p className="text-sm2 sunmi-text-muted leading-snug mt-2">{avisoGuardado}</p>
                )}
              </div>
              )}
            </SunmiCard>
          )}

          {errorEnvio && (
            <Aviso tono="danger">
              <p className="leading-snug">{errorEnvio.mensaje}</p>
              {errorEnvio.detalle && <p className="mt-1 sunmi-text-muted">{errorEnvio.detalle}</p>}
              {errorEnvio.duplicada && errorEnvio.importacionId && (
                <SunmiButton
                  color="slate"
                  onClick={() => router.push(`/modulos/proveedores/listas/${errorEnvio.importacionId}`)}
                  className="mt-2 min-h-toque text-sm2"
                >
                  Abrir la que ya está
                </SunmiButton>
              )}
            </Aviso>
          )}

          <div className="space-y-2">
            <SunmiButton
              color="cyan"
              onClick={() => leerLista()}
              disabled={!puedeEnviar}
              className="w-full min-h-toque text-base font-bold"
            >
              {enviando ? "Leyendo…" : "Leer la lista"}
            </SunmiButton>
            <p className="text-sm2 sunmi-text-muted text-center leading-snug">
              {controlando
                ? "Controlar no cambia ningún precio: solo compara la lista con tus costos de hoy."
                : "Leer no cambia ningún precio. Vas a ver el resultado antes de aplicar."}
            </p>
          </div>
        </>
      )}
    </Marco>
  );
}

/** "PDF", "Excel" o "CSV", que es como lo nombra el que lo manda. */
function tipoDeArchivo(nombre) {
  const n = String(nombre ?? "").toLowerCase();
  if (n.endsWith(".pdf")) return "PDF";
  if (n.endsWith(".csv") || n.endsWith(".txt")) return "CSV";
  return "Excel";
}

/** El nombre del proveedor sin la forma societaria, para que entre en un botón. */
function nombreCorto(nombre) {
  return String(nombre ?? "").replace(/\s+(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?i\.?c\.?)\.?$/i, "").trim();
}

function Campo({ etiqueta, ayuda, children }) {
  return (
    <div className="space-y-2">
      <p className="text-sm3 font-semibold sunmi-text-strong leading-tight">{etiqueta}</p>
      {children}
      {ayuda && <p className="text-sm2 sunmi-text-muted leading-snug">{ayuda}</p>}
    </div>
  );
}

/** Un campo con su rótulo arriba y el signo de porciento al lado. */
function ConPorciento({ rotulo, children }) {
  return (
    <div>
      {rotulo && <div className="text-xs2 sunmi-text-muted mb-1">{rotulo}</div>}
      <div className="flex items-center gap-2">
        {children}
        <span className="text-base sunmi-text-muted shrink-0">%</span>
      </div>
    </div>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
