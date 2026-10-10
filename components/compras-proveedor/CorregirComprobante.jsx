"use client";

// EL PAPEL NO CERRÓ: SE DICE ACÁ, ARRIBA DE LA CONCILIACIÓN.
//
// ── POR QUÉ ESTÁ ARRIBA Y NO EN OTRA PANTALLA ─────────────────────────────
//
// Un comprobante que no cierra no propone ningún costo, así que la conciliación
// de abajo no propone precios mientras esto siga rojo. Ponerlo en otro lado
// sería pedirle a alguien con el camión en la puerta que adivine por qué.
//
// ── ES EL MISMO BLOQUE QUE LA RECETA ──────────────────────────────────────
//
// `AsiLoEntendio`, literalmente el mismo componente: el cartel con la cuenta y
// la lista de lo leído.
//
// ── Y CÓMO SE ARREGLA ─────────────────────────────────────────────────────
//
// Mirando la foto: cada renglón tiene su hoja de «Corregir», que deja poner
// el costo final que dice el papel (#164). Desde la lectura interpretada no hay
// reglas de formato que señalen un renglón sospechoso: si la cuenta no cierra,
// no se sabe cuál está mal hasta mirar el papel. Si lo que falta es la lista
// entera, o el papel se leyó con el lector anterior, se vuelve a leer.

import { useEffect, useMemo, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { ORIGEN_DE_LECTURA } from "@/lib/compras-proveedor/comprobante/origenDeLectura";
import { pedirLaLectura } from "@/lib/compras-proveedor/comprobante/leerConTurno";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AsiLoEntendio from "@/components/compras-proveedor/AsiLoEntendio";
import { textoDeFallo } from "@/components/compras-proveedor/ExplicacionDelPapel";
import { comoLoEntendio } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";

export const TITULO = "Este papel no cierra";
/**
 * ── CUANDO LA LECTURA ES VIEJA, SE DICE — NO SE ACUSA A NADIE ──────────────
 *
 * Una lectura anterior a la interpretada (2026-10-10) no guardó el costo final
 * de cada renglón, y ese costo ya no se arma con reglas de formato. La acción
 * que resuelve esto es volver a leer: el botón está acá abajo.
 */
export const LECTURA_VIEJA =
  "Este papel se leyó con el lector anterior, que no guardaba el costo de cada producto. " +
  "Volvé a leerlo para que se pueda comprobar y proponga los costos.";
export const BAJADA =
  "Hasta que cierre no se propone ningún costo. Mirá la foto y corregí el costo del producto " +
  "que no coincide desde su «Corregir».";
/**
 * La salida que no depende de arreglar el sistema (Emanuel, Secco #256):
 * siempre se puede recibir. Va debajo de la bajada, con su mismo estilo.
 */
export const RECIBIR_IGUAL = "Podés recibir igual: entra el stock y los costos quedan como estaban.";

export default function CorregirComprobante({ comprobanteId, onCorregido = null }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [lectura, setLectura] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [releyendo, setReleyendo] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCargando(true);
      try {
        const r = await fetch(`/api/compras-proveedor/comprobantes/corregir/${comprobanteId}`, {
          credentials: "include",
          cache: "no-store",
        });
        const d = await r.json();
        if (!vigente) return;
        if (!d?.ok) {
          setError(textoDeFallo(d, r.status));
          return;
        }
        setLectura(d.lectura);
      } catch {
        if (vigente) setError("No se pudo abrir el papel: se cortó la conexión.");
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [comprobanteId]);

  /**
   * VOLVER A LEER EL PAPEL con las explicaciones que haya ahora.
   *
   * Llama a la MISMA ruta que usa la recepción al subir el papel —no hay un
   * segundo camino de lectura— y cuando vuelve, la pantalla se recarga sola.
   */
  const releer = async () => {
    if (releyendo) return;
    setReleyendo(true);
    setMensaje(null);
    try {
      // SE ESPERA EL TURNO. El POST contesta enseguida con un número de turno y
      // la lectura sigue en segundo plano: llamar la ruta por afuera haría
      // creer que ya leyó cuando recién arrancó. Es la misma puerta que usan
      // las otras dos pantallas, y el censo de
      // `laRecepcionSobreviveAlRefresco` se pone rojo si alguien agrega un
      // camino que la saltee.
      const { cuerpo: d } = await pedirLaLectura({
        comprobanteId,
        origen: ORIGEN_DE_LECTURA.BOTON,
        fetchImpl: fetch,
      });
      // ── EL BOTÓN NUNCA TERMINA EN SILENCIO ─────────────────────────
      //
      // El 2026-09-23 Emanuel lo tocó tres veces en dos minutos y la pantalla
      // quedaba EXACTAMENTE igual: la lectura había corrido y vuelto a traer un
      // renglón de doce, y nada lo decía. Los tres desenlaces se nombran: la
      // que no arrancó, la que volvió corta, y la que salió bien.
      if (!d?.ok) {
        setMensaje({ tipo: "error", texto: d?.error || "No se pudo volver a leer el papel." });
        return;
      }
      const dice = Number(d?.lineasEnElPapel);
      const trajo = Number(d?.lineasTranscriptas);
      if (Number.isFinite(dice) && Number.isFinite(trajo) && dice > trajo) {
        setMensaje({
          tipo: "aviso",
          texto:
            `Se volvió a leer: el lector dice ver ${dice} renglones y transcribió ${trajo}. ` +
            "Probá otra vez; si vuelve a salir corta, revisá la explicación del proveedor." +
            (d?.escalada?.texto ? ` ${d.escalada.texto}` : ""),
        });
      } else {
        setMensaje({
          tipo: "ok",
          // Si entró el modelo grande, su desenlace va pegado: cerró, no
          // cerró, o no se pudo y releer puede servir.
          texto: ["Se volvió a leer el papel.", d?.escalada?.texto].filter(Boolean).join(" "),
        });
      }
      onCorregido?.(d);
    } catch (e) {
      setMensaje({ tipo: "error", texto: `No se pudo volver a leer el papel: ${e.message}` });
    } finally {
      setReleyendo(false);
    }
  };

  // La misma función que usa el servidor al verificar. Si acá se rehiciera la
  // cuenta por otro lado, la pantalla podría decir "cierra" sobre algo que el
  // servidor después rechaza.
  const resultado = useMemo(() => (lectura ? comoLoEntendio({ lectura }) : null), [lectura]);

  if (cargando) return <SunmiLoader />;
  if (error) return <p className="text-sm3 sunmi-text-danger break-words">{error}</p>;
  if (!resultado) return null;

  // ── ¿VOLVER A LEER ES LO QUE CORRESPONDE? ─────────────────────────────
  //
  // Cuando lo que falta no es un número sino la lectura: la lista vacía o
  // corta (#247), o un papel leído con el lector anterior.
  const lecturaVieja = lectura?.interpretada !== true;
  const hayQueReleer = lecturaVieja || resultado.productos.length === 0 || resultado.faltanRenglones;

  return (
    <section className="space-y-3 mb-4">
      {/* ── "NO CIERRA" SOLO CUANDO HAY CONTRA QUÉ CERRAR ───────────────
          Sin total leído, el cartel de abajo dice otra cosa —que no trae total,
          o que no se leyeron los productos— y "no cierra" al lado afirmaría una
          cuenta que no se hizo. */}
      {resultado.hayTotal && !lecturaVieja && (
        <SunmiCard className="p-3 space-y-1">
          <span className="block font-semibold sunmi-text-strong break-words">{TITULO}</span>
          <p className="text-sm2 sunmi-text-muted break-words">{BAJADA}</p>
          <p className="text-sm2 sunmi-text-muted break-words">{RECIBIR_IGUAL}</p>
        </SunmiCard>
      )}

      {lecturaVieja && (
        <SunmiCard className="p-3 sunmi-state-warning">
          <p className="text-sm3 sunmi-text-strong break-words">{LECTURA_VIEJA}</p>
          <p className="text-sm2 sunmi-text-muted break-words">{RECIBIR_IGUAL}</p>
        </SunmiCard>
      )}

      {!lecturaVieja && <AsiLoEntendio resultado={resultado} comprobanteId={comprobanteId} />}

      {mensaje && (
        <p
          className={`text-sm3 break-words ${
            mensaje.tipo === "error"
              ? "sunmi-text-danger"
              : mensaje.tipo === "aviso"
                ? "sunmi-text-warning"
                : "sunmi-text-success"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {hayQueReleer && (
        <div className="flex flex-col gap-dato">
          <SunmiButton
            color="primary"
            type="button"
            disabled={releyendo}
            onClick={releer}
            className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
          >
            {releyendo ? "Leyendo el papel…" : "Volver a leer el papel"}
          </SunmiButton>
        </div>
      )}
    </section>
  );
}
