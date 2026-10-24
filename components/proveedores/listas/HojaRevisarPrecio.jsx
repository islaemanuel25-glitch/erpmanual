"use client";

// REVISAR UN PRODUCTO: CÓMO SE LEE SU PRECIO, O NO CAMBIARLO.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// Es la decisión de la pantalla "Revisar de a uno", sacada tal cual a una hoja
// inferior cuando la revisión de una lista pasó a ser UNA pantalla que arranca
// de tus productos (diseño de Emanuel, 2026-10-23). Se abre con «Revisar» desde
// la tarjeta del producto. Las piezas —las lecturas con su cuenta, la pregunta
// antes de un costo fuera de rango, el rechazo pegado a los botones— son las
// mismas y con los mismos candados: cada una costó un defecto encontrado usando
// la pantalla, y ninguna se reescribió.
//
// Lo que se fue con la cola es lo que solo tenía sentido recorriendo de a uno:
// el "3 de 70", la barra de progreso y «Saltear». Cerrar la hoja es saltear.
//
// ── LOS DOS BOTONES, Y QUÉ RECUERDA CADA UNO ───────────────────────────────
//
//   Usar $X            confirma la lectura. Se guarda para las próximas listas
//                      de este proveedor (`confirmar`).
//   No lo cambio       excluye la fila, y el proveedor lo puede mandar en las
//                      próximas listas: lo va a dejar igual (`seleccion`).

import { useCallback, useEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import {
  Aviso,
  AvisoCostoRedondo,
  CLASE_OPCION,
  CLASE_OPCION_ELEGIDA,
  EtiquetaFueraDeRango,
  MarcaDeElegida,
  money,
  pct,
  tonoDelPorcentaje,
} from "@/components/proveedores/listas/PiezasPantallas";
// EL RANGO DICHO EN PALABRAS, y vacío cuando no hay ninguno. Vive con el modo
// porque lo que decide es qué significa un 0 a 0.
import { textoDelRango } from "@/lib/proveedores/listas/modoDeLaLista";
import { TEXTO_FALTAN_LOS_KILOS } from "@/lib/proveedores/listas/tusProductos";
import PreguntaQueFalta from "@/components/proveedores/listas/PreguntaQueFalta";

/** El porqué de la hoja cuando faltan las unidades de la caja. */
export const TEXTO_FALTA_LA_CAJA =
  "La lista cotiza una unidad y no dice cuántas trae la caja: decímelo y armo la cuenta.";

/**
 * Qué acción rechazó el servidor, cuando no fue una lectura.
 *
 * Las lecturas se identifican por su `clave` —`MISMA_PRESENTACION`, `PACK_12`—
 * así que hace falta un valor que ninguna pueda tener. Con un `true` suelto no se
 * podría saber cuál de los botones fue.
 */
const ACCION_NO_LO_CAMBIO = "__NO_LO_CAMBIO__";
/** El «Listo» del dato que faltaba, para pegarle su rechazo. */
const ACCION_LO_QUE_FALTA = "__LO_QUE_FALTA__";

/**
 * LA HOJA DE «CORREGIR»: la decisión adentro de su hoja.
 *
 * @param importacionId  la lista
 * @param filaId         el renglón de la lista atado al producto
 * @param onListo        al guardar: `(mensaje)`; la pantalla recarga y cierra
 * @param onNoEsEste     «No es este producto»: `(fila)`, para elegir otro renglón
 * @param onCerrar       cerrar sin decidir
 * @param tomarLaUnica   recién vinculado con «✓ Sí» en la tarjeta: el mismo paso
 *                       que sigue a la hoja de vincular (`DecisionDeLectura`)
 */
export default function HojaRevisarPrecio({
  importacionId,
  filaId,
  onListo,
  onNoEsEste,
  onCerrar,
  tomarLaUnica = false,
  onCambio,
}) {
  const [titulo, setTitulo] = useState("Revisar");
  const [trabajando, setTrabajando] = useState(false);
  return (
    <SunmiModalLayout
      open
      forma="hoja"
      title={titulo}
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
    >
      <DecisionDeLectura
        importacionId={importacionId}
        filaId={filaId}
        tomarLaUnica={tomarLaUnica}
        onCambio={onCambio}
        onListo={onListo}
        onNoEsEste={onNoEsEste}
        onTitulo={setTitulo}
        onTrabajando={setTrabajando}
      />
    </SunmiModalLayout>
  );
}

/**
 * LA DECISIÓN, SIN SU HOJA: cómo se lee el precio, o no cambiarlo.
 *
 * ── POR QUÉ SALIÓ DE LA HOJA (Emanuel, 2026-10-24) ─────────────────────────
 *
 * Vincular eran dos pasos: elegir el renglón, que la hoja se cerrara, y tocar
 * «Corregir» para elegir caja o unidad. Ahora la hoja de vincular, al elegir el
 * renglón, SIGUE con esta misma decisión adentro —sin cerrarse—, así que la
 * decisión tiene que poder dibujarse en cualquier hoja. Es la misma pieza, con
 * los mismos candados; no hay una segunda.
 *
 * `tomarLaUnica` es lo que trae ese paso: recién vinculado, si el renglón ya
 * quedó listo no hay nada que decidir, y si hay UNA sola lectura que cae en el
 * rango del proveedor —la recomendada, que por definición es la única— se toma
 * sola. Fuera de rango NUNCA se toma sola: eso pregunta, siempre.
 *
 * @param onTitulo      el nombre del producto, para el título de la hoja
 * @param onTrabajando  avisa si hay un pedido en vuelo, para no cerrar a la mitad
 */
export function DecisionDeLectura({
  importacionId,
  filaId,
  onListo,
  onNoEsEste,
  onTitulo,
  onTrabajando,
  tomarLaUnica = false,
  // Algo cambió sin cerrar la hoja (se contestó el dato que faltaba): la
  // pantalla relee la lista.
  onCambio,
}) {
  const id = importacionId;
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  // ── EL RECHAZO DEL SERVIDOR VA DONDE SE TOCÓ, Y NO ARRIBA DE TODO ────────
  //
  // Un rechazo tiene DOS partes y las dos hacen falta: qué contestó el servidor,
  // y CUÁL de las acciones fue la rechazada. Con la segunda el botón que se tocó
  // puede dejar de verse como si no hubiera pasado nada, que es lo que lo hacía
  // indistinguible de un toque que no registró.
  const [rechazo, setRechazo] = useState(null);
  // La lectura fuera de rango que se está por confirmar. Mientras vale algo, la
  // hoja pregunta; el `aceptarFueraDeRango` sale solo de contestar que sí.
  const [confirmandoFuera, setConfirmandoFuera] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/revisar?filaId=${filaId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo abrir este producto.");
        return;
      }
      setDatos(json);
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, [id, filaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const fila = datos?.fila ?? null;
  const proveedor = datos?.cabecera?.proveedor?.nombre ?? "";

  // ── UN RECHAZO NO SOBREVIVE AL PRODUCTO SOBRE EL QUE OCURRIÓ ─────────────
  useEffect(() => {
    setRechazo(null);
  }, [fila?.id]);

  const usarLectura = async (lectura, { aceptarFueraDeRango = false } = {}) => {
    if (!fila) return;
    setTrabajando(true);
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
      onListo?.(`Listo. Me acuerdo: en las próximas listas de ${proveedor} este producto se lee así solo.`);
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
      onListo?.(`Listo. ${proveedor} puede mandarlo en las próximas listas y lo voy a dejar igual.`);
    } catch {
      setRechazo({
        accion: ACCION_NO_LO_CAMBIO,
        texto: "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo.",
      });
    } finally {
      setTrabajando(false);
    }
  };

  /**
   * «LISTO» CON EL DATO QUE FALTABA (2026-10-24): los kilos de la pieza o las
   * unidades de la caja, a la misma ruta que la tarjeta (`lectura-recordada`).
   * Solo se llama desde el «Listo» de `PreguntaQueFalta`: el valor sugerido no
   * se guarda solo. Después se vuelve a leer la fila, y la MISMA hoja sigue con
   * las lecturas que ese dato arma —pieza y bulto, con su cuenta—. Y avisa a la
   * pantalla, para que la tarjeta no quede vieja si se cierra la hoja sin elegir.
   */
  const guardarLoQueFalta = async (numero) => {
    if (!fila?.pregunta || !fila.productoBaseId) return;
    setTrabajando(true);
    setRechazo(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/productos/${fila.productoBaseId}/lectura-recordada`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fila.pregunta.porKilo ? { kilos: numero } : { cantidad: numero }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setRechazo({
          accion: ACCION_LO_QUE_FALTA,
          texto: j?.error || "El servidor no pudo guardarlo y no dijo por qué.",
        });
        return;
      }
      onCambio?.();
      await cargar();
    } catch {
      setRechazo({
        accion: ACCION_LO_QUE_FALTA,
        texto: "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo.",
      });
    } finally {
      setTrabajando(false);
    }
  };

  /**
   * «Volver a cambiarlo»: deshace un «No lo cambio» (`seleccion` INCLUIR) y
   * vuelve a leer la fila, que recupera su decisión de lectura. Es la salida de
   * una tarjeta dejada como está, que si no quedaba sin ninguna acción.
   */
  const volverACambiarlo = async () => {
    if (!fila) return;
    setTrabajando(true);
    setRechazo(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "INCLUIR", ids: [fila.id] }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setRechazo({
          accion: ACCION_NO_LO_CAMBIO,
          texto: j?.error || "No pude volver a dejarlo para cambiar, y el servidor no dijo por qué.",
        });
        return;
      }
      await cargar();
    } catch {
      setRechazo({
        accion: ACCION_NO_LO_CAMBIO,
        texto: "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo.",
      });
    } finally {
      setTrabajando(false);
    }
  };

  // La única lectura que el motor da por creíble, si hay alguna. NO hay caída a
  // "la primera": ver el comentario del botón principal, más abajo.
  const recomendada = fila?.lecturas?.find((l) => l.recomendada) ?? null;
  const rangoTexto = textoDelRango(datos?.cabecera?.rango, pct);

  // El título y el "no cierres ahora" son de la hoja que la contiene.
  useEffect(() => {
    if (fila?.nombre) onTitulo?.(fila.nombre);
  }, [fila?.nombre, onTitulo]);
  useEffect(() => {
    onTrabajando?.(trabajando);
  }, [trabajando, onTrabajando]);

  // ── RECIÉN VINCULADO: LO QUE NO HACE FALTA DECIDIR, NO SE PREGUNTA ────────
  //
  // Una sola vez por fila: después de un rechazo la persona decide a mano.
  const yaSeTomo = useRef(null);
  useEffect(() => {
    if (!tomarLaUnica || !fila || yaSeTomo.current === fila.id) return;
    yaSeTomo.current = fila.id;
    if (fila.motivo === null && !fila.excluida) {
      // Ya quedó lista —o con el mismo precio—: no hay nada que elegir.
      onListo?.("Listo: quedó vinculado y con su precio.");
      return;
    }
    if (fila.confirmable && recomendada && !recomendada.fueraDeRango && !recomendada.absurda) {
      usarLectura(recomendada, { aceptarFueraDeRango: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tomarLaUnica, fila?.id]);

  return (
    <>
      {cargando && !datos ? (
        <SunmiLoader />
      ) : error ? (
        <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>
      ) : !fila ? (
        <p className="text-sm2 sunmi-text-muted leading-snug">Este producto ya no tiene nada para revisar.</p>
      ) : (
        <>
          <div>
            <p className="text-sm2 sunmi-text-muted leading-snug">
              {proveedor}
              {fila.codigo ? ` · código ${fila.codigo}` : ""}
              {fila.porKilo
                ? " · lo tenés cargado por kilo"
                : fila.factorPack
                  ? ` · lo tenés cargado por caja de ${fila.factorPack}`
                  : ""}
            </p>
            {/* El aviso va debajo del nombre y no al lado del costo: lo que pone
                en duda es el costo de hoy, que es contra lo que se calculan TODOS
                los porcentajes de abajo. */}
            {fila.costoRedondo && <AvisoCostoRedondo costo={fila.costoAnterior} />}
          </div>

          {/* ── CON QUÉ RENGLÓN DE LA LISTA SE LO EMPAREJÓ ─────────────────
              Va ARRIBA de las lecturas y no abajo, porque es la pregunta
              anterior: de nada sirve elegir cómo leer un precio si el precio es
              de otro producto. El caso: "MOGUL CONITOS" tenía guardado el 13113,
              que en la lista es "MOGUL GOMITAS 30G X 12"; el suyo era el 3113. */}
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
                type="button"
                onClick={() => onNoEsEste?.(fila)}
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

          {/* ── SI ESTE RENGLÓN NO ADMITE UNA LECTURA, SE DICE ANTES ─────────
              Antes se ofrecían las lecturas igual y el «no» llegaba después de
              tocar una: "Esta fila no está esperando una lectura… No se guardó
              nada". El servidor ya sabe la respuesta al abrir la hoja, y la dice
              en criollo y con qué hacer. */}
          {fila.confirmable === false ? (
            <div className="space-y-2">
              <Aviso tono="warning">{fila.porQueNo}</Aviso>
              {rechazo && (
                <Aviso tono="danger">
                  {rechazo.texto}
                  <span className="block mt-1 font-semibold">No se guardó nada.</span>
                </Aviso>
              )}
              {fila.excluida && (
                <SunmiButton
                  color="cyan"
                  type="button"
                  onClick={volverACambiarlo}
                  disabled={trabajando}
                  className="w-full min-h-toque text-base font-bold"
                >
                  {trabajando ? "Guardando…" : "Volver a cambiarlo"}
                </SunmiButton>
              )}
            </div>
          ) : (
          <>
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
                // `aceptarFueraDeRango`.
                onElegir={() =>
                  l.fueraDeRango ? setConfirmandoFuera(l) : usarLectura(l, { aceptarFueraDeRango: false })
                }
                rechazada={rechazo?.accion === l.clave}
              />
            ))}
          </div>

          {/* ── LO QUE FALTA, CON DÓNDE CONTESTARLO (2026-10-24) ───────────
              Nunca un cartel que pide algo sin dónde ponerlo: con la pregunta
              va el campo, la MISMA pieza de la tarjeta, arrancando en lo que
              dice el nombre ("2KG" → 2). Al tocar «Listo» la hoja se relee y
              sigue con las lecturas que arma ese dato. */}
          {fila.pregunta ? (
            <SunmiCard className="p-3 space-y-2">
              <p className="text-sm2 sunmi-text-warning leading-snug">
                {fila.pregunta.porKilo ? TEXTO_FALTAN_LOS_KILOS : TEXTO_FALTA_LA_CAJA}
              </p>
              <PreguntaQueFalta
                key={`${fila.id}-${fila.pregunta.porKilo ? "kilos" : "caja"}`}
                id={`hoja-pregunta-${fila.id}`}
                porKilo={fila.pregunta.porKilo}
                sugerido={fila.pregunta.sugerido}
                trabajando={trabajando}
                onListo={guardarLoQueFalta}
              />
            </SunmiCard>
          ) : (
            fila.lecturas.length === 0 && (
              <Aviso tono="warning">
                La lista no dice si este precio es de una unidad o de la caja, así que no sé por cuánto
                multiplicarlo. Dejalo como está y miralo en el papel del proveedor.
              </Aviso>
            )
          )}

          <div className="space-y-2">
            {/* ── EL RECHAZO DEL SERVIDOR, PEGADO A LOS BOTONES ──────────────
                Acá y no arriba de todo: a 360 arriba queda fuera de la pantalla
                justo cuando el pulgar está en el botón de abajo. */}
            {rechazo && (
              <Aviso tono="danger">
                {rechazo.texto}
                <span className="block mt-1 font-semibold">No se guardó nada.</span>
              </Aviso>
            )}
            {/* ── EL BOTÓN GRANDE SOLO EXISTE SI HAY UNA LECTURA CREÍBLE ────
                Sin lectura creíble no hay acción principal: la decisión se
                toma tocando la tarjeta de la lectura, que muestra el
                porcentaje y la cuenta. Es el defecto de la #5: un "Usar $X"
                en cian sobre un +99,5 % presentado como la opción obvia. */}
            {!fila.sinProducto && recomendada && (
              <SunmiButton
                color="cyan"
                type="button"
                onClick={() => usarLectura(recomendada, { aceptarFueraDeRango: false })}
                disabled={trabajando}
                className="w-full min-h-toque text-base font-bold"
              >
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
            <SunmiButton
              color="slate"
              type="button"
              onClick={noLoCambio}
              disabled={trabajando}
              className="w-full min-h-toque text-sm3"
            >
              {rechazo?.accion === ACCION_NO_LO_CAMBIO ? "No se pudo" : "No lo cambio"}
            </SunmiButton>
          </div>
          </>
          )}

          <p className="text-sm2 sunmi-text-muted leading-snug">
            Todo lo que decidas acá lo recuerdo para las próximas listas de {proveedor}: el producto
            que corresponde, cómo se lee y si lo dejás igual.
          </p>
        </>
      )}

      {confirmandoFuera && fila && (
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
    </>
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
  // ── LA MARCADA SE VE COMO LA ELEGIDA DE LA HOJA DE VINCULAR (2026-10-24) ──
  //
  // Fondo de acento suave, borde de 2 px y el ✓ en un círculo; las demás, la
  // superficie de siempre. La marcada es la que el servidor eligió para la
  // tarjeta (`elegida`, de `lecturaElegida`): la misma que «✓ Usar» acepta.
  //
  // El rechazo y la absurda mandan sobre eso, en rojo: mientras esté el
  // rechazo, lo que hay que ver es que ESTA es la que el servidor no aceptó.
  // Fuera de rango ya no pinta el fondo de ámbar: lleva la etiqueta al lado del
  // porcentaje y el borde ámbar, como la tarjeta de la lista.
  const marcada = (lectura.elegida ?? lectura.recomendada) === true && !rechazada;
  const tono = rechazada || lectura.absurda
    ? `${CLASE_OPCION} sunmi-state-danger`
    : marcada
      ? CLASE_OPCION_ELEGIDA
      : lectura.fueraDeRango
        ? "border-1.5 sunmi-border-warning sunmi-card-surface"
        : CLASE_OPCION;
  return (
    <SunmiButton
      color="ghost"
      aria-pressed={marcada}
      onClick={onElegir}
      disabled={trabajando}
      className={`w-full text-left block rounded-xl p-3 min-h-toque ${tono}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="block text-sm3 font-semibold sunmi-text-strong">{lectura.titulo}</span>
        {marcada && <MarcaDeElegida />}
      </span>
      <span className="flex items-baseline justify-between gap-2 mt-1">
        <span className="text-lg font-bold sunmi-text-strong tabular-nums">
          {money(lectura.costoNuevo)}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {lectura.fueraDeRango && !lectura.absurda && <EtiquetaFueraDeRango />}
          <span className={`text-sm3 font-semibold tabular-nums ${tonoDelPorcentaje(lectura.variacionPct)}`}>
            {pct(lectura.variacionPct)}
          </span>
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
 * LA PREGUNTA QUE CONVIERTE UN TOQUE EN UNA ELECCIÓN.
 *
 * El costo fuera de rango es el único que después nadie vuelve a controlar —el
 * veto de aplicar lo deja pasar justamente porque una persona lo eligió— así
 * que la elección tiene que ser un acto aparte, con el número de hoy y el número
 * nuevo enfrentados, y con el botón diciendo qué se acepta. El texto del botón
 * NO dice "Sí": dice el porcentaje.
 *
 * Se exporta porque «✓ Usar», en la tarjeta de la revisión, hace la misma
 * pregunta antes de confirmar una lectura fuera de rango: un toque en la tarjeta
 * no puede saltearse lo que la hoja pregunta.
 */
export function ConfirmarFueraDeRango({ lectura, costoDeHoy, rangoTexto, trabajando, onCerrar, onConfirmar }) {
  return (
    <SunmiModalLayout
      open
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
