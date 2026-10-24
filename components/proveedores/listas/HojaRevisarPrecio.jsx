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

import { useCallback, useEffect, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { Aviso, AvisoCostoRedondo, money, pct } from "@/components/proveedores/listas/PiezasPantallas";
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

/**
 * @param importacionId  la lista
 * @param filaId         el renglón de la lista atado al producto
 * @param onListo        al guardar: `(mensaje)`; la pantalla recarga y cierra
 * @param onNoEsEste     «No es este producto»: `(fila)`, para elegir otro renglón
 * @param onCerrar       cerrar sin decidir
 */
export default function HojaRevisarPrecio({ importacionId, filaId, onListo, onNoEsEste, onCerrar }) {
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

  // La única lectura que el motor da por creíble, si hay alguna. NO hay caída a
  // "la primera": ver el comentario del botón principal, más abajo.
  const recomendada = fila?.lecturas?.find((l) => l.recomendada) ?? null;
  const rangoTexto = textoDelRango(datos?.cabecera?.rango, pct);

  return (
    <SunmiModalLayout
      open
      forma="hoja"
      title={fila?.nombre ?? "Revisar"}
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
    >
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
              {fila.factorPack ? ` · lo tenés cargado por caja de ${fila.factorPack}` : ""}
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

          {fila.lecturas.length === 0 && (
            <Aviso tono="warning">
              El archivo no dice de qué presentación es este precio, así que no hay forma de saber a
              qué corresponde. Podés dejarlo como está y mirarlo en el archivo.
            </Aviso>
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
    </SunmiModalLayout>
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
