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
import { comoLoEntendio } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";

export const TITULO = "Este papel no cierra";
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
        setMensaje({ tipo: "error", texto: d?.queHacer || d?.error || `El servidor contestó ${r.status}.` });
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
    </section>
  );
}
