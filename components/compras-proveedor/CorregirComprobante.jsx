"use client";

// EL PAPEL NO CERRÓ: ARREGLALO ACÁ, ARRIBA DE LA CONCILIACIÓN.
//
// ── POR QUÉ ESTÁ ARRIBA Y NO EN OTRA PANTALLA ─────────────────────────────
//
// Un comprobante que no cierra no propone ningún costo, así que la conciliación
// de abajo está trabada mientras esto siga rojo. Ponerlo en otro lado sería
// pedirle a alguien con el camión en la puerta que adivine por qué la pantalla
// no lo deja avanzar.
//
// ── ES EL MISMO BLOQUE QUE LA RECETA ──────────────────────────────────────
//
// `AsiLoEntendio`, literalmente el mismo componente. La diferencia es qué pasa
// con lo que la persona elige: en la receta solo recalcula en pantalla, y acá
// se GUARDA en la línea del comprobante y el papel se vuelve a verificar.
//
// ── Y NO SE GUARDA NADA HASTA QUE SE TOCA GUARDAR ─────────────────────────
//
// Mientras se van eligiendo números, la cuenta se rehace acá con la misma
// función que el servidor. Recién "Guardar la corrección" escribe.

import { useEffect, useMemo, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AsiLoEntendio from "@/components/compras-proveedor/AsiLoEntendio";
import { textoDeFallo } from "@/components/compras-proveedor/ExplicacionDelPapel";
import { formatearMoneda } from "@/lib/moneda";
import { textoDeLaCorreccion } from "@/lib/compras-proveedor/comprobante/correccionAutomatica";
import { comoLoEntendio } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";

export const TITULO = "Este papel no cierra";
/**
 * ── CUANDO LA LECTURA ES VIEJA, SE DICE — NO SE ACUSA A NADIE ──────────────
 *
 * Una lectura anterior a la explicación del proveedor no trae el descuento de
 * cada renglón. El control por renglón no juzga sin ese dato —para no acusar a
 * un renglón bueno, que es lo que le pasó al Butler del #242— así que el bloque
 * no tiene nada que señalar y quedaría mudo.
 *
 * Decirlo es mejor que quedarse callado: la acción que resuelve esto es volver
 * a leer, y el botón está a dos centímetros, arriba, en la lista de
 * comprobantes.
 */
export const LECTURA_VIEJA =
  "Esta lectura es anterior a la explicación del proveedor: no trae el descuento de cada " +
  "producto, así que no se puede comprobar renglón por renglón. Tocá «Leer de nuevo» en el " +
  "comprobante de arriba.";
export const BAJADA =
  "Hasta que cierre no se propone ningún costo. Mirá la foto y decí qué dice el papel.";

export default function CorregirComprobante({ comprobanteId, onCorregido = null }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [lectura, setLectura] = useState(null);
  const [receta, setReceta] = useState(null);
  const [correcciones, setCorrecciones] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  // ── LO QUE SE DEDUCE NO SE PREGUNTA ────────────────────────────────────
  //
  // Si el papel señala un solo producto y las dos cuentas —la resta contra el
  // total y la del propio renglón— dan lo mismo, el número correcto está
  // determinado. El servidor lo dice en `automatica`; acá se aplica y se avisa
  // en una línea. `yaCorregidas` es lo mismo después de un refresco: lo que ya
  // quedó guardado en el renglón.
  const [automatica, setAutomatica] = useState(null);
  const [yaCorregidas, setYaCorregidas] = useState([]);
  const [aplicando, setAplicando] = useState(false);

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
          setError(d?.error || "No se pudo abrir el papel.");
          return;
        }
        setLectura(d.lectura);
        setReceta(d.receta);
        setAutomatica(d.automatica ?? null);
        setYaCorregidas(d.yaCorregidas ?? []);
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

  // ── SE APLICA SOLA, UNA VEZ, Y SIN BOTÓN ───────────────────────────────
  //
  // El número no viaja desde acá: la pantalla pide "aplicá la que corresponda"
  // y el servidor lo vuelve a calcular sobre el papel guardado antes de
  // escribirlo. Si viniera del navegador, cualquiera podría mandar el subtotal
  // que quisiera diciendo que lo dedujo la cuenta.
  //
  // Escribe al abrir la recepción, que es un gesto de una persona; no cuesta
  // una lectura de IA ni borra nada: deja el renglón con el único número que
  // hace cerrar el papel, y con lo leído al lado para poder cotejarlo.
  useEffect(() => {
    if (!automatica?.aplica || aplicando) return;
    let vigente = true;
    (async () => {
      setAplicando(true);
      try {
        const r = await fetch(`/api/compras-proveedor/comprobantes/corregir/${comprobanteId}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ automatica: true }),
        });
        const d = await r.json().catch(() => null);
        if (!vigente) return;
        if (d?.ok) {
          setAutomatica(null);
          setYaCorregidas((prev) => [...prev, d.automatica].filter(Boolean));
          onCorregido?.(d);
        }
        // Si no se pudo, no se insiste ni se grita: vuelve el bloque de
        // siempre, que es lo que hay que hacer cuando el número no se deduce.
      } catch {
      } finally {
        if (vigente) setAplicando(false);
      }
    })();
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatica?.aplica, comprobanteId]);

  // La misma función que usa el servidor al verificar. Si acá se rehiciera la
  // cuenta por otro lado, la pantalla podría decir "cierra" sobre algo que el
  // servidor después rechaza.
  const resultado = useMemo(() => {
    if (!lectura) return null;
    const conCorrecciones = {
      ...lectura,
      lineas: lectura.lineas.map((l, i) =>
        correcciones[i] !== undefined ? { ...l, subtotalImpreso: correcciones[i] } : l
      ),
    };
    return comoLoEntendio({ lectura: conCorrecciones, receta });
  }, [lectura, receta, correcciones]);

  const hayCambios = Object.keys(correcciones).length > 0;

  // ── ¿ESTA LECTURA TRAE LO QUE EL CONTROL NECESITA? ─────────────────────
  //
  // Si NINGÚN renglón tiene descuento leído, la lectura es de antes de que se
  // pidiera esa columna. No es que el papel no tenga descuentos —eso vendría
  // como cero— es que no se preguntó.
  const lecturaSinDescuentos =
    Boolean(lectura?.lineas?.length) &&
    lectura.lineas.every((l) => l?.bonificacion === null || l?.bonificacion === undefined);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      // Del índice de la lista al ORDEN de la línea, que es lo que el servidor
      // conoce. Los índices son de este render; el orden vive en la base.
      const porOrden = {};
      for (const [indice, valor] of Object.entries(correcciones)) {
        const linea = lectura.lineas[Number(indice)];
        if (linea?.orden != null) porOrden[linea.orden] = valor;
      }
      const r = await fetch(`/api/compras-proveedor/comprobantes/corregir/${comprobanteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ correcciones: porOrden }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok) {
        setMensaje({ tipo: "error", texto: textoDeFallo(d, r.status) });
        return;
      }
      setMensaje({ tipo: d.cierra ? "ok" : "aviso", texto: d.queHacer });
      onCorregido?.(d);
    } catch {
      setMensaje({ tipo: "error", texto: "Se cortó la conexión: no se guardó la corrección." });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <SunmiLoader />;
  if (error) return <p className="text-sm3 sunmi-text-danger break-words">{error}</p>;
  if (!resultado) return null;

  return (
    <section className="space-y-3 mb-4">
      <SunmiCard className="p-3 space-y-1">
        <span className="block font-semibold sunmi-text-strong break-words">{TITULO}</span>
        <p className="text-sm2 sunmi-text-muted break-words">{BAJADA}</p>
      </SunmiCard>

      {lecturaSinDescuentos && (
        <SunmiCard className="p-3 sunmi-state-warning">
          <p className="text-sm3 sunmi-text-strong break-words">{LECTURA_VIEJA}</p>
        </SunmiCard>
      )}

      {/* ── LO QUE SE CORRIGIÓ SOLO, EN UNA LÍNEA Y SIN BOTONES ────────
          Sobrevive al refresco porque sale de la columna del renglón, no del
          estado de la pantalla: al volver a abrir dice lo mismo. */}
      {yaCorregidas.map((c) => (
        <p key={c.orden} className="text-sm3 sunmi-text-success break-words">
          {textoDeLaCorreccion(c, { moneda: formatearMoneda })}
        </p>
      ))}

      <AsiLoEntendio
        resultado={resultado}
        comprobanteId={comprobanteId}
        onElegir={(indice, valor) =>
          setCorrecciones((prev) => ({ ...prev, [indice]: Number(valor) }))
        }
      />

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

      {/* Mientras la automática se está aplicando no se ofrece nada: el
          bloque de preguntar aparece solo si el número NO se deduce. */}
      {!automatica?.aplica && !aplicando && (
      <div className="flex flex-col gap-dato">
        <SunmiButton
          color="primary"
          type="button"
          disabled={guardando || !hayCambios}
          onClick={guardar}
          className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
        >
          {guardando ? "Guardando…" : "Guardar la corrección"}
        </SunmiButton>
        {!hayCambios && (
          <span className="text-sm3 sunmi-text-muted text-center">
            Elegí el número que dice el papel para poder guardar.
          </span>
        )}
      </div>
      )}
    </section>
  );
}
