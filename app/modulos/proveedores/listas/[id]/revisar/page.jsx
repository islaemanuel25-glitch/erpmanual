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
  const [vinculando, setVinculando] = useState(null);
  // La lectura fuera de rango que se está por confirmar. Mientras vale algo, la
  // pantalla pregunta; el `aceptarFueraDeRango` sale solo de contestar que sí.
  const [confirmandoFuera, setConfirmandoFuera] = useState(null);
  // Los salteados de esta vuelta. NO se guardan: al recargar vuelven, que es lo
  // que "dejalo para después" quiere decir.
  const [salteados, setSalteados] = useState([]);
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
    () => <SunmiBackButton href={destinoDeVuelta.href} texto={destinoDeVuelta.texto} />,
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
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/confirmar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: lectura.clave, aceptarFueraDeRango }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo usar ese precio." });
        return;
      }
      setAviso({
        tono: "success",
        texto: `Listo. Me acuerdo: en las próximas listas de ${proveedor} este producto se lee así solo.`,
      });
      avanzar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  const noLoCambio = async () => {
    if (!fila) return;
    setTrabajando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "EXCLUIR", ids: [fila.id] }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo marcar." });
        return;
      }
      setAviso({ tono: "success", texto: "Queda con el costo de ahora, solo en esta lista." });
      avanzar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  const saltear = () => {
    if (!fila) return;
    setAviso(null);
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
  const rangoTexto =
    datos.cabecera?.rango?.minPct !== null && datos.cabecera?.rango?.minPct !== undefined
      ? `entre ${pct(datos.cabecera.rango.minPct)} y ${pct(datos.cabecera.rango.maxPct)}`
      : "";

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
            {trabajando ? "Guardando…" : recomendada.textoBoton}
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
            {fila.sinProducto ? "No lo tengo" : "No lo cambio"}
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
      <SunmiCard className="p-3">
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {fila.sinProducto
            ? `Me acuerdo: una vez que lo vinculás, las próximas listas de ${proveedor} lo reconocen solas.`
            : `Me acuerdo: en las próximas listas de ${proveedor} este producto se lee así solo, sin preguntarte.`}
        </p>
      </SunmiCard>

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
function TarjetaDeLectura({ lectura, trabajando, onElegir }) {
  const tono = lectura.recomendada
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
      {lectura.recomendada && (
        <span className="block text-xs2 sunmi-text-success leading-snug mt-1">
          Es la más probable: es la única que da un aumento como los de este proveedor.
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
