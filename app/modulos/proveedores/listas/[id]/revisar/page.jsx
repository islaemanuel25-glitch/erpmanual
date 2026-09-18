"use client";

// 5 · REVISAR DE A UNO — un producto por pantalla.
//
// ── POR QUÉ SE FUE LA LISTA CON TODOS JUNTOS ────────────────────────────────
//
// La pantalla anterior mostraba los motivos como filas y debajo todas las
// tarjetas del motivo elegido. Se veía ordenada y no servía: en un teléfono hay
// que decidir mirando UN producto, y lo que había adelante eran cuarenta y ocho
// tarjetas con dos botones cada una que decían solo un precio.
//
// Ahí está el origen del defecto más caro de este módulo: el botón "Usar
// $ 11.083,72" no decía que ese costo era once veces el que el producto tenía, y
// la importación #5 terminó con productos listos a +1.008 % sobre un proveedor
// que aumenta entre 2 y 15. Con un producto por pantalla entra todo lo que hace
// falta para decidir: qué significaría cada lectura, cuánto daría, y la cuenta
// escrita.
//
// ── SALIR A LA MITAD Y VOLVER ───────────────────────────────────────────────
//
// No se guarda ningún progreso, y es a propósito. La cola ES lo que queda
// pendiente: una fila resuelta sale sola, así que al volver el primero de la
// lista es justo donde se había quedado. Un cursor guardado sería un tercer dato
// que se puede desincronizar de los otros dos.
//
// ── LOS TRES BOTONES, Y QUÉ RECUERDA CADA UNO ───────────────────────────────
//
//   Usar $X y seguir   confirma la lectura. Se guarda para las próximas listas
//                      de este proveedor, y desde la siguiente se aplica sola.
//   No lo cambio       excluye la fila. Vale para ESTA lista y nada más.
//   Saltear            lo deja para después. No recuerda nada: al recargar la
//                      pantalla vuelve a aparecer.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import { Aviso, AvisoCostoRedondo, money, pct } from "@/components/proveedores/listas/PiezasPantallas";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import PanelVincular from "@/components/proveedores/listas/PanelVincular";
// EL RANGO DICHO EN PALABRAS, y vacío cuando no hay ninguno. Vive con el modo
// porque lo que decide es qué significa un 0 a 0.
import { textoDelRango } from "@/lib/proveedores/listas/modoDeLaLista";

/**
 * Qué acción rechazó el servidor, cuando no fue una lectura.
 *
 * Las lecturas se identifican por su `clave` —`MISMA_PRESENTACION`, `PACK_12`—
 * así que hace falta un valor que ninguna pueda tener. Con un `true` suelto no se
 * podría saber cuál de los botones fue.
 */
const ACCION_NO_LO_CAMBIO = "__NO_LO_CAMBIO__";

export default function RevisarDeAUnoPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);
  // `?solo=SIN_PRODUCTO` es la cola de los que la lista trae y no están en el
  // catálogo. Viaja en la URL y no en un estado para que el botón de atrás del
  // teléfono devuelva a la misma cola y no a la otra.
  const parametros = useSearchParams();
  const solo = parametros.get("solo") || null;
  // ── DE DÓNDE VINO, Y A QUÉ PRODUCTO ─────────────────────────────────────
  //
  // `?filaId=` lo mandan la lista de los que se actualizan y la de los que no
  // cambian: ahí se toca UN producto y hay que abrir ESE, no la cola desde el
  // principio. `?desde=` dice a qué pantalla volver, que ya no es siempre el
  // resultado.
  const filaPedida = Number(parametros.get("filaId")) || null;
  const desde = parametros.get("desde") || null;

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState(null);
  // ── UN MENSAJE QUE SE VA SOLO, Y POR QUÉ ES OTRO ESTADO ────────────────
  //
  // `aviso` se dibuja arriba del producto y se queda hasta que algo lo limpia.
  // Para "listo, seguí" eso está mal: la pantalla ya avanzó al producto
  // siguiente, así que el cartel queda encima de OTRO producto y parece hablar
  // de ése. Emanuel lo vio con el "Queda con el costo de ahora".
  //
  // Éste vive aparte, se dibuja abajo de todo y desaparece a los tres segundos.
  const [avisoPasajero, setAvisoPasajero] = useState("");
  // ── EL RECHAZO DEL SERVIDOR VA DONDE SE TOCÓ, Y NO ARRIBA DE TODO ────────
  //
  // `aviso` se dibuja arriba del nombre del producto: antes de la tarjeta del
  // costo, de las lecturas y de los botones. A 360 eso queda FUERA DE LA
  // PANTALLA cuando el pulgar está en «Usar $X y seguir», que es el borde de
  // abajo. El cartel rojo existía y estaba bien escrito, y Emanuel tocó el
  // botón, no pasó nada, y se quedó mirando una pantalla que parecía intacta.
  //
  // Un rechazo tiene DOS partes y las dos hacen falta: qué contestó el servidor,
  // y CUÁL de las acciones fue la rechazada. Con la segunda el botón que se tocó
  // puede dejar de verse como si no hubiera pasado nada, que es lo que lo hacía
  // indistinguible de un toque que no registró.
  const [rechazo, setRechazo] = useState(null);
  const [vinculando, setVinculando] = useState(null);
  // La lectura fuera de rango que se está por confirmar. Mientras vale algo, la
  // pantalla pregunta; el `aceptarFueraDeRango` sale solo de contestar que sí.
  const [confirmandoFuera, setConfirmandoFuera] = useState(null);
  // Los salteados de esta vuelta. NO se guardan: al recargar vuelven, que es lo
  // que "dejalo para después" quiere decir.
  const [salteados, setSalteados] = useState([]);

  // Se borra solo. El `clearTimeout` de la vuelta no es decorativo: dos "no lo
  // cambio" seguidos dejarían dos relojes corriendo y el primero en vencer
  // apagaría el mensaje del segundo antes de tiempo.
  useEffect(() => {
    if (!avisoPasajero) return undefined;
    const t = setTimeout(() => setAvisoPasajero(""), 3000);
    return () => clearTimeout(t);
  }, [avisoPasajero]);
  // Cuál se está mirando. `null` es "el primero de la cola", que es lo que hace
  // que salir y volver retome donde quedó sin guardar nada. Se siembra con el
  // `?filaId=` de la URL cuando se vino a ver un producto concreto.
  const [filaId, setFilaId] = useState(filaPedida);
  // ── POR QUÉ HACE FALTA UN CONTADOR DE VUELTAS ───────────────────────────
  //
  // ENCONTRADO ABRIENDO LA PANTALLA, no por un candado: después de confirmar un
  // producto, la pantalla NO SE MOVÍA. Se tocaba "Usar $X y seguir", el
  // servidor guardaba bien, y adelante seguía el mismo producto con los mismos
  // botones. Tocarlos de nuevo escribía otra decisión sobre la fila que ya
  // estaba resuelta — así quedó una fila confirmada Y excluida a la vez.
  //
  // El motivo: avanzar hacía `setFilaId(null)` y `filaId` YA valía `null`
  // —nunca se había pedido una fila concreta—, así que React no veía un cambio
  // de estado, el efecto no volvía a correr y no se pedía nada. El defecto
  // aparecía solo en el PRIMER producto de cada visita, que es el que se toca
  // siempre.
  //
  // Esto no se arregla con `cargar()` suelto adentro de `avanzar`: habría dos
  // caminos para traer los datos y el de arriba seguiría sin enterarse. Un
  // contador que sube siempre es un cambio de estado de verdad, y deja un solo
  // camino.
  const [vuelta, setVuelta] = useState(0);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  // La barra dice en qué cola estás, que son dos distintas: la de decidir
  // precios y la de vincular lo que no tenés.
  useTituloDePagina(solo ? "Vincular" : "Para revisar");
  // ── EL VOLVER VUELVE DE DONDE SE VINO ───────────────────────────────────
  //
  // Se llega acá desde tres lados: el resultado, la lista de los que se
  // actualizan y la de los que no cambian. Volver siempre al resultado dejaba a
  // Emanuel un toque más lejos de la lista que estaba recorriendo, y encima
  // perdía el filtro y la posición.
  const destinoDeVuelta =
    desde === "actualizan"
      ? { href: `/modulos/proveedores/listas/${id}/actualizan`, texto: "Se actualizan" }
      : desde === "no-cambian"
        ? { href: `/modulos/proveedores/listas/${id}/no-cambian`, texto: "No cambian" }
        : { href: `/modulos/proveedores/listas/${id}`, texto: "Resultado" };
  useAccionDePagina(
    () => <SunmiBackButton href={destinoDeVuelta.href} texto={destinoDeVuelta.texto} className="min-h-toque" />,
    [destinoDeVuelta.href, destinoDeVuelta.texto]
  );

  const cargar = useCallback(async ({ pedir = null, saltados = [] } = {}) => {
    setCargando(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (pedir) qs.set("filaId", String(pedir));
      if (saltados.length) qs.set("salteados", saltados.join(","));
      if (solo) qs.set("solo", solo);
      const r = await fetch(`/api/proveedores/listas/${id}/revisar?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo cargar la cola de revisión.");
        return;
      }
      setDatos(json);
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, [id, solo]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto || !Number.isInteger(id)) return;
    cargar({ pedir: filaId, saltados: salteados });
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto, id, filaId, salteados, vuelta]);

  const fila = datos?.fila ?? null;
  const proveedor = datos?.cabecera?.proveedor?.nombre ?? "";

  // ── UN RECHAZO NO SOBREVIVE AL PRODUCTO SOBRE EL QUE OCURRIÓ ─────────────
  //
  // Es el mismo defecto que ya se arregló con el aviso de "no lo cambio": un
  // cartel que queda dibujado sobre el producto SIGUIENTE parece hablar de ése.
  // Acá sería peor, porque además marcaría como rechazado un botón que nadie
  // tocó todavía.
  useEffect(() => {
    setRechazo(null);
  }, [fila?.id]);

  /** El siguiente de la cola, salteando el que se acaba de resolver. */
  const avanzar = useCallback(() => {
    // Se vuelve a pedir desde el principio: la fila resuelta ya no está en la
    // cola, así que el primero es el siguiente. Pedir un id concreto obligaría a
    // saber cuál era, y ese cálculo se puede equivocar cuando el servidor
    // reordena.
    //
    // La vuelta sube SIEMPRE: `filaId` casi siempre ya vale `null`, y volver a
    // ponerlo en `null` no es un cambio de estado. Ver el comentario largo de
    // `vuelta`, arriba.
    setFilaId(null);
    setVuelta((v) => v + 1);
  }, []);

  const usarLectura = async (lectura, { aceptarFueraDeRango = false } = {}) => {
    if (!fila) return;
    setTrabajando(true);
    setAviso(null);
    setRechazo(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/confirmar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: lectura.clave, aceptarFueraDeRango }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        // El texto del servidor tal cual: es el que sabe QUÉ pasó. Acá se agrega
        // lo único que el servidor no puede saber, que es dónde estaba el dedo.
        setRechazo({
          accion: lectura.clave,
          texto: j?.error || "El servidor no pudo guardar esta lectura y no dijo por qué.",
        });
        return;
      }
      setAviso({
        tono: "success",
        texto: `Listo. Me acuerdo: en las próximas listas de ${proveedor} este producto se lee así solo.`,
      });
      avanzar();
    } catch {
      setRechazo({
        accion: lectura.clave,
        texto: "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo.",
      });
    } finally {
      setTrabajando(false);
    }
  };

  const noLoCambio = async () => {
    if (!fila) return;
    setTrabajando(true);
    setAviso(null);
    setRechazo(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "EXCLUIR", ids: [fila.id] }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setRechazo({
          accion: ACCION_NO_LO_CAMBIO,
          texto: j?.error || "El servidor no pudo dejarlo como está y no dijo por qué.",
        });
        return;
      }
      // ── EL AVISO NO SE PEGA AL PRODUCTO SIGUIENTE ─────────────────────
      //
      // Decía "Queda con el costo de ahora, solo en esta lista" y quedaba
      // dibujado ARRIBA DEL PRODUCTO SIGUIENTE, así que parecía hablar de ése:
      // el cartel afirmaba algo sobre un producto que nadie había tocado
      // todavía. Ahora es un mensaje que se va solo, y el texto dice la regla
      // nueva: la decisión vale para las próximas listas, no para ésta sola.
      setAvisoPasajero(
        `Listo. ${proveedor} puede mandarlo en las próximas listas y lo voy a dejar igual.`
      );
      avanzar();
    } catch {
      setRechazo({
        accion: ACCION_NO_LO_CAMBIO,
        texto: "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo.",
      });
    } finally {
      setTrabajando(false);
    }
  };

  const saltear = () => {
    if (!fila) return;
    setAviso(null);
    setRechazo(null);
    setSalteados((prev) => (prev.includes(fila.id) ? prev : [...prev, fila.id]));
    // Acá el cambio de `salteados` ya dispara el efecto, pero se sube la vuelta
    // igual: saltear el ÚLTIMO que quedaba sin saltear no cambia la lista —ya
    // estaba adentro— y sin esto la pantalla se quedaría quieta en ese caso.
    setFilaId(null);
    setVuelta((v) => v + 1);
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">Seleccioná un contexto operativo.</p>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando && !datos) {
    return <Marco><SunmiCard className="p-6"><SunmiLoader /></SunmiCard></Marco>;
  }
  if (error) {
    return <Marco><ErrorRecuperable mensaje={error} onReintentar={() => cargar({ pedir: filaId, saltados: salteados })} /></Marco>;
  }

  const volverAlResultado = () => router.push(`/modulos/proveedores/listas/${id}`);

  // ── NO QUEDA NADA ─────────────────────────────────────────────────────────
  if (!fila) {
    return (
      <Marco>
        <SunmiCard className="p-5 text-center space-y-3">
          <p className="text-base font-semibold sunmi-text-success">
            {solo ? "No queda ninguno sin vincular." : "No queda nada para revisar."}
          </p>
          <SunmiButton color="cyan" onClick={volverAlResultado} className="w-full min-h-toque text-base font-bold">
            Volver al resultado
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  const total = datos.total ?? 0;
  const indice = datos.indice ?? 0;
  // La única lectura que el motor da por creíble, si hay alguna. NO hay caída a
  // "la primera": ver el comentario del botón principal, más abajo.
  const recomendada = fila.lecturas?.find((l) => l.recomendada) ?? null;
  // ── EL RANGO, Y VACÍO CUANDO NO HAY NINGUNO QUE DECIR ─────────────────
  //
  // La condición estaba escrita acá y solo miraba que `minPct` no fuera null,
  // así que un 0 a 0 —que es lo que guarda una lista de control salida de un 0
  // escrito a mano— pasaba y la pantalla decía "un aumento como los de este
  // proveedor (entre 0,0 % y 0,0 %)". Es exactamente la frase que Emanuel vio
  // 213 veces, y apareció en la captura de esta tanda sobre la lista nueva.
  //
  // Ahora la contesta `textoDelRango`, que vive donde ya se sabe qué significa
  // un 0 a 0. Con el texto vacío, las frases de abajo se leen igual de bien: son
  // todas de la forma "...como los de este proveedor{ (rango)}".
  const rangoTexto = textoDelRango(datos.cabecera?.rango, pct);

  return (
    <Marco>
      {/* El volver se fue a la fila del shell, con el resto del módulo. Acá
          queda el progreso, que ahora ocupa el renglón entero y se lee de un
          vistazo en vez de compartirlo con un botón.
          Y NO SE DIBUJA cuando se vino a ver un producto suelto desde otra
          pantalla: ahí no hay cola que recorrer, así que un "0 de 41" sería un
          número sobre algo que no está pasando. */}
      {!datos.suelta && (
        <p className="text-sm2 sunmi-text-muted tabular-nums">
          {indice} de {total}
        </p>
      )}

      {!datos.suelta && <BarraDeProgreso hechos={indice - 1} total={total} />}

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <div>
        <h1 className="text-lg font-bold sunmi-text-strong leading-tight break-words">{fila.nombre}</h1>
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {proveedor}
          {fila.codigo ? ` · código ${fila.codigo}` : ""}
          {fila.factorPack ? ` · lo tenés cargado por caja de ${fila.factorPack}` : ""}
        </p>
        {/* El aviso va debajo del nombre y no al lado del costo: lo que pone en
            duda es el costo de hoy, que es contra lo que se calculan TODOS los
            porcentajes de abajo. */}
        {fila.costoRedondo && <AvisoCostoRedondo costo={fila.costoAnterior} />}
      </div>

      {fila.sinProducto ? (
        <SinProductoDelCatalogo fila={fila} />
      ) : (
        <>
          {/* ── CON QUÉ RENGLÓN DE LA LISTA SE LO EMPAREJÓ ─────────────────
              Va ARRIBA de las lecturas y no abajo, porque es la pregunta
              anterior: de nada sirve elegir cómo leer un precio si el precio es
              de otro producto.

              El caso que lo trae: "MOGUL CONITOS" tiene guardado el código
              13113, la lista trae un 13113 que es "MOGUL GOMITAS 30G X 12", y el
              que corresponde es el 3113. Sin este bloque el emparejamiento
              equivocado era invisible —la pantalla mostraba el nombre del
              producto del catálogo, que es el correcto— y lo único raro era que
              ninguna lectura del precio cerraba. Emanuel lo encontró mirando el
              papel, no la pantalla. */}
          {fila.enLaLista && (
            <SunmiCard className="p-3 space-y-2">
              <p className="text-sm2 sunmi-text-muted">Lo encontré en la lista como:</p>
              <div className="space-y-0.5">
                <p className="text-sm3 font-semibold sunmi-text-strong leading-snug break-words">
                  {fila.enLaLista.codigo} · {fila.enLaLista.descripcion}
                </p>
                <p className="text-sm2 sunmi-text-muted leading-snug tabular-nums">
                  {money(fila.enLaLista.precio)}
                  {fila.enLaLista.unidad ? ` · ${fila.enLaLista.unidad}` : ""}
                  {fila.enLaLista.cantidad > 1 ? ` · por ${fila.enLaLista.cantidad}` : ""}
                </p>
              </div>
              <SunmiButton
                color="slate"
                onClick={() => router.push(
                  `/modulos/proveedores/listas/${id}/elegir-fila?fila=${fila.id}`
                )}
                disabled={trabajando}
                className="w-full min-h-toque text-sm2"
              >
                No es este producto → elegir otro de la lista
              </SunmiButton>
            </SunmiCard>
          )}

          <SunmiCard className="p-3 flex items-center justify-between gap-2">
            <span className="text-sm3 sunmi-text-muted">Costo de hoy</span>
            <span className="text-base font-bold sunmi-text-strong tabular-nums">
              {money(fila.costoAnterior)}
            </span>
          </SunmiCard>

          <p className="text-sm3 sunmi-text-strong leading-snug">
            La lista dice {money(fila.precioLista)}. ¿Cómo hay que leerlo?
          </p>

          <div className="space-y-2">
            {fila.lecturas.map((l) => (
              <TarjetaDeLectura
                key={l.clave}
                lectura={l}
                trabajando={trabajando}
                // UNA LECTURA FUERA DE RANGO NO SE ELIGE DE UN TOQUE. Se
                // pregunta con el número adelante, y recién la respuesta manda
                // `aceptarFueraDeRango`. Sin este paso, "explícitamente" sería
                // haber tocado un botón que dice un precio.
                onElegir={() =>
                  l.fueraDeRango ? setConfirmandoFuera(l) : usarLectura(l, { aceptarFueraDeRango: false })
                }
                // LA TARJETA QUE SE TOCÓ DEJA DE VERSE INTACTA. Es un botón, y
                // un botón que se ve igual después de tocarlo es indistinguible
                // de uno que no registró el toque.
                rechazada={rechazo?.accion === l.clave}
              />
            ))}
          </div>

          {fila.lecturas.length === 0 && (
            <Aviso tono="warning">
              El archivo no dice de qué presentación es este precio, así que no hay forma de saber a
              qué corresponde. Podés dejarlo como está y mirarlo en el archivo.
            </Aviso>
          )}
        </>
      )}

      <div className="space-y-2">
        {/* ── EL RECHAZO DEL SERVIDOR, PEGADO A LOS BOTONES ──────────────────
            Acá y no arriba de todo. El cartel rojo ya existía y decía lo
            correcto, pero se dibujaba antes del nombre del producto: a 360, con
            la tarjeta del costo y las lecturas en el medio, queda fuera de la
            pantalla justo cuando el pulgar está en el botón de abajo. Tocar y no
            ver nada es lo que hace pensar que el toque no registró. */}
        {rechazo && (
          <Aviso tono="danger">
            {rechazo.texto}
            <span className="block mt-1 font-semibold">No se guardó nada.</span>
          </Aviso>
        )}
        {fila.sinProducto && (
          <SunmiButton
            color="cyan"
            onClick={() => setVinculando(fila)}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            Vincular con uno de los míos
          </SunmiButton>
        )}
        {/* ── EL BOTÓN GRANDE SOLO EXISTE SI HAY UNA LECTURA CREÍBLE ────────
            Y ÉSTE ES EL DEFECTO DE LA #5, ENCONTRADO OTRA VEZ USANDO LA
            PANTALLA. Acá decía `find(recomendada) ?? lecturas[0]`: cuando
            NINGUNA lectura cae en el rango —que es exactamente el caso por el
            que la fila está en esta cola— el `??` agarraba la primera y la
            ofrecía en el botón principal, en cian, a ancho completo y en
            negrita, diciendo "Usar $ 1.320,09 y seguir" sobre un producto de
            $ 661,70. Un +99,5 % presentado como la opción obvia.

            Es la misma forma del botón viejo que dejó 112 productos a +1.008 %,
            con más información alrededor. El veto de aplicar lo atajaba —no se
            escribe sin elección informada— pero un toque en ese botón CONTABA
            como la elección informada, así que el veto no llegaba a actuar.

            Sin lectura creíble no hay acción principal: la decisión se toma
            tocando la tarjeta de la lectura, que muestra el porcentaje y la
            cuenta, y contesta la pregunta de al lado. */}
        {!fila.sinProducto && recomendada && (
          <SunmiButton
            color="cyan"
            onClick={() => usarLectura(recomendada, { aceptarFueraDeRango: false })}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            {/* SI EL SERVIDOR LO RECHAZÓ, EL BOTÓN LO DICE. Volver a mostrar
                "Usar $31.636,08 y seguir", idéntico, es lo que hacía que la
                pantalla se viera como si el toque nunca hubiera ocurrido. */}
            {trabajando
              ? "Guardando…"
              : rechazo?.accion === recomendada.clave
                ? "No se pudo. Probá de nuevo"
                : recomendada.textoBoton}
          </SunmiButton>
        )}
        {!fila.sinProducto && !recomendada && fila.lecturas.length > 0 && (
          <p className="text-sm2 sunmi-text-warning leading-snug text-center">
            Ninguna forma de leerlo da un aumento como los de este proveedor
            {rangoTexto ? ` (${rangoTexto})` : ""}. Si igual querés usar una, tocala arriba.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <SunmiButton
            color="slate"
            onClick={noLoCambio}
            disabled={trabajando}
            className="min-h-toque text-sm3"
          >
            {/* Es el mismo botón y la misma acción —la fila se deja afuera de
                esta lista— pero sobre un producto que ni siquiera es tuyo "No lo
                cambio" no quiere decir nada: no hay nada que cambiar. */}
            {rechazo?.accion === ACCION_NO_LO_CAMBIO
              ? "No se pudo"
              : fila.sinProducto
                ? "No lo tengo"
                : "No lo cambio"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={saltear}
            disabled={trabajando}
            className="min-h-toque text-sm3"
          >
            Saltear
          </SunmiButton>
        </div>
      </div>

      {/* LO QUE SE VA A RECORDAR, DICHO ANTES DE ELEGIR. Cambia según lo que se
          esté decidiendo: una lectura se recuerda como lectura, y un vínculo
          como vínculo. Prometer "se lee así solo" sobre una pantalla donde lo
          único que se puede hacer es vincular sería prometer de más. */}
      {/* ── Y AHORA NOMBRA LAS TRES COSAS QUE SE RECUERDAN ────────────────
          Antes decía solo la lectura. Desde esta tanda se recuerdan tres, y las
          tres son decisiones que Emanuel no quiere volver a tomar: qué producto
          de la lista corresponde, cómo se lee su precio, y si lo deja igual.
          Nombrar una sola prometía menos de lo que el sistema hace, y de las
          otras dos nadie se enteraba. */}
      <SunmiCard className="p-3">
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {fila.sinProducto
            ? `Me acuerdo: una vez que lo vinculás, las próximas listas de ${proveedor} lo reconocen solas.`
            : `Todo lo que decidas acá lo recuerdo para las próximas listas de ${proveedor}: el producto que corresponde, cómo se lee y si lo dejás igual.`}
        </p>
      </SunmiCard>

      {/* EL MENSAJE QUE SE VA SOLO. Va ABAJO DE TODO, no arriba: lo que se dice
          es sobre el producto ANTERIOR, y la pantalla ya está mostrando el
          siguiente. Arriba se leía como un cartel sobre el que está a la vista. */}
      {avisoPasajero && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm2 sunmi-text-success leading-snug text-center"
        >
          {avisoPasajero}
        </p>
      )}

      {confirmandoFuera && (
        <ConfirmarFueraDeRango
          lectura={confirmandoFuera}
          costoDeHoy={fila.costoAnterior}
          rangoTexto={rangoTexto}
          trabajando={trabajando}
          onCerrar={() => setConfirmandoFuera(null)}
          onConfirmar={async () => {
            const l = confirmandoFuera;
            setConfirmandoFuera(null);
            await usarLectura(l, { aceptarFueraDeRango: true });
          }}
        />
      )}

      {vinculando && (
        <PanelVincular
          abierto
          importacionId={id}
          fila={{
            id: vinculando.id,
            codigoCrudo: vinculando.codigo,
            descripcionProveedor: vinculando.nombreEnElArchivo,
            sugerenciaProductoBaseId: null,
            sugerenciaNombre: null,
          }}
          onCerrar={() => setVinculando(null)}
          onVinculado={async () => {
            setVinculando(null);
            setAviso({
              tono: "success",
              texto: "Vinculado. Las próximas listas de este proveedor lo van a reconocer solo.",
            });
            avanzar();
          }}
        />
      )}
    </Marco>
  );
}

/**
 * Una lectura posible, con todo lo que hace falta para elegirla.
 *
 * El número grande es el COSTO QUE QUEDARÍA, no el precio de la lista: es lo que
 * se va a escribir, y es contra lo que hay que mirar el costo de hoy. Al lado va
 * el porcentaje, y abajo la cuenta escrita — sin ella el número no se puede
 * verificar contra el papel que el proveedor mandó.
 */
function TarjetaDeLectura({ lectura, trabajando, onElegir, rechazada = false }) {
  // El rechazo manda sobre el tono normal: mientras esté, lo que hay que ver es
  // que ESTA lectura es la que el servidor no aceptó, no si era la recomendada.
  const tono = rechazada
    ? "sunmi-state-danger"
    : lectura.recomendada
      ? "sunmi-state-success"
      : lectura.absurda
        ? "sunmi-state-danger"
        : lectura.fueraDeRango
          ? "sunmi-state-warning"
          : "";
  return (
    <SunmiButton
      color="ghost"
      onClick={onElegir}
      disabled={trabajando}
      className={`w-full text-left block rounded-xl p-3 min-h-toque sunmi-border border ${tono}`}
    >
      <span className="block text-sm3 font-semibold sunmi-text-strong">{lectura.titulo}</span>
      <span className="flex items-baseline justify-between gap-2 mt-1">
        <span className="text-lg font-bold sunmi-text-strong tabular-nums">
          {money(lectura.costoNuevo)}
        </span>
        <span className="text-sm3 font-semibold tabular-nums shrink-0">
          {pct(lectura.variacionPct)}
        </span>
      </span>
      <span className="block text-xs2 sunmi-text-muted leading-snug mt-1">{lectura.cuenta}</span>
      {lectura.advertencia && (
        <span className="block text-xs2 font-semibold leading-snug mt-1">{lectura.advertencia}</span>
      )}
      {lectura.recomendada && !rechazada && (
        <span className="block text-xs2 sunmi-text-success leading-snug mt-1">
          Es la más probable: es la única que da un aumento como los de este proveedor.
        </span>
      )}
      {rechazada && (
        <span className="block text-xs2 font-semibold leading-snug mt-1">
          Ésta es la que tocaste y no se pudo guardar. El motivo está abajo.
        </span>
      )}
    </SunmiButton>
  );
}

/**
 * La fila que no tiene producto en el catálogo: acá hay que vincular, no elegir
 * precio.
 *
 * ── POR QUÉ NO TIENE BOTONES PROPIOS ────────────────────────────────────────
 *
 * Los tenía —"Ignorar" y "Vincular"— y quedaban ARRIBA de los tres de abajo, con
 * "Ignorar" y "No lo cambio" haciendo exactamente lo mismo a dos centímetros de
 * distancia. Cuatro botones para tres decisiones. La acción principal se fue al
 * mismo lugar donde está en el otro caso, que es el borde de abajo, donde llega
 * el pulgar.
 */
function SinProductoDelCatalogo({ fila }) {
  return (
    <SunmiCard className="p-3">
      <p className="text-sm2 sunmi-text-muted leading-snug">
        Este producto de la lista no está vinculado a ninguno de los tuyos, así que no hay costo con
        qué compararlo. Dice {money(fila.precioLista)}.
      </p>
    </SunmiCard>
  );
}

/**
 * LA PREGUNTA QUE CONVIERTE UN TOQUE EN UNA ELECCIÓN.
 *
 * ── POR QUÉ NO ALCANZA CON QUE LA TARJETA LO DIGA ───────────────────────────
 *
 * La tarjeta ya muestra el porcentaje y la advertencia, y aun así el defecto de
 * la #5 fue exactamente ése: información al lado de un botón que se toca sin
 * leerla. El costo fuera de rango es el único que después nadie vuelve a
 * controlar —el veto de aplicar lo deja pasar justamente porque una persona lo
 * eligió— así que la elección tiene que ser un acto aparte, con el número de
 * hoy y el número nuevo enfrentados, y con el botón diciendo qué se acepta.
 *
 * El texto del botón NO dice "Sí" ni "Aceptar": dice el porcentaje. Un "Sí"
 * contesta a un título que a esa altura ya no se está mirando.
 */
function ConfirmarFueraDeRango({ lectura, costoDeHoy, rangoTexto, trabajando, onCerrar, onConfirmar }) {
  return (
    <SunmiModalLayout
      open
      // ── UN TÍTULO DE UN RENGLÓN, Y NO ES ESTÉTICA ─────────────────────────
      //
      // Decía "Este aumento no se parece a los de este proveedor" y a 360 px eso
      // son dos renglones, que empujan el botón "Cerrar" del kit contra el borde
      // de la tarjeta hasta recortarle la palabra. Se vio comparando esta hoja
      // con la de aplicar, cuyo título entra en uno. Lo que el título perdió lo
      // dice el primer renglón del cuerpo, que además trae los números.
      title="Este aumento no es habitual"
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      footer={
        <div className="space-y-2 w-full">
          <SunmiButton
            color="cyan"
            onClick={onConfirmar}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            {trabajando ? "Guardando…" : `Usar igual: ${pct(lectura.variacionPct)}`}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onCerrar}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Volver
          </SunmiButton>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm3 sunmi-text-strong leading-snug">
          Hoy lo tenés a {money(costoDeHoy)} y esto lo deja en {money(lectura.costoNuevo)}, que es{" "}
          {pct(lectura.variacionPct)}
          {rangoTexto ? `. Esperabas ${rangoTexto}.` : "."}
        </p>
        <p className="text-sm2 sunmi-text-muted leading-snug">{lectura.cuenta}</p>
        <p className="text-sm2 sunmi-text-muted leading-snug">
          Si lo usás, se va a escribir al aplicar la lista, y me lo voy a acordar para las próximas
          listas de este proveedor.
        </p>
      </div>
    </SunmiModalLayout>
  );
}

/** Cuánto se lleva hecho. Es la única pieza que dice que esto tiene un final. */
function BarraDeProgreso({ hechos, total }) {
  const porcentaje = total > 0 ? Math.max(0, Math.min(100, (hechos / total) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full rounded-full sunmi-surface-soft overflow-hidden"
      role="progressbar"
      aria-valuenow={hechos}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${hechos} de ${total} resueltos`}
    >
      <div className="h-full sunmi-bg-accent rounded-full" style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
