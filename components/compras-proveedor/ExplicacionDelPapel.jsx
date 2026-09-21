"use client";

// EXPLICALE CÓMO SE LEE EL PAPEL DE ESTE PROVEEDOR.
//
// ── QUÉ REEMPLAZA ─────────────────────────────────────────────────────────
//
// Hay unos treinta proveedores y cada papel es distinto. La receta que existía
// pregunta por impuestos —IVA por línea, alícuota, percepciones— y eso no es lo
// que cambia de papel a papel: lo que cambia es qué columna es la cantidad, si
// hay descuento, si el precio es por kilo. Eso no se programa treinta veces: se
// explica una vez, en castellano.
//
// ── POR QUÉ SE PRUEBA ANTES DE GUARDAR ────────────────────────────────────
//
// Una explicación que no se probó es una promesa. Acá se lee el papel de verdad
// con lo que está escrito en pantalla, se muestra cómo lo entendió, y recién
// ahí se guarda. Probar NO escribe nada: ni el comprobante, ni la receta.
//
// ── EL BLOQUE DE "ASÍ LO ENTENDIÓ" NO VIVE ACÁ ────────────────────────────
//
// Está en `AsiLoEntendio.jsx`, porque la recepción dibuja el mismo cuando un
// papel no cierra. Acá la elección de la persona solo recalcula; allá se guarda
// en la línea del comprobante.
//
// ── LAS MEDIDAS SON LAS DE LA PANTALLA DE UN PEDIDO RECIBIDO ──────────────
//
// `SunmiCard` con su `p-3`, los tokens `renglon` y `dato`, la escala de letra
// del proyecto y `SunmiSeparator`. No se eligió ningún número acá.

import { useEffect, useMemo, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import AsiLoEntendio, { fotoDelComprobante } from "@/components/compras-proveedor/AsiLoEntendio";
import { comoLoEntendio } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";

export const TITULO_PROBAR = "Probar: ver cómo lo entiende";
export const AVISO_PROBAR = "Todavía no se guarda nada. Primero te muestra cómo leyó el papel.";
export const BAJADA =
  "Explicale cómo se lee, como se lo explicarías a una persona. Se hace una sola vez.";

/**
 * @param proveedorId
 * @param comprobanteId  con cuál papel probar. Lo manda la recepción cuando
 *                       llegó una factura de un proveedor sin explicación: se
 *                       prueba con ESA foto y no con la última que haya.
 * @param onGuardado     qué hacer después de guardar. La recepción vuelve sola.
 */
export default function ExplicacionDelPapel({ proveedorId, comprobanteId = null, onGuardado = null }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [proveedor, setProveedor] = useState(null);
  const [papel, setPapel] = useState(null);
  const [explicacion, setExplicacion] = useState("");
  const [probando, setProbando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [lectura, setLectura] = useState(null);
  const [receta, setReceta] = useState(null);
  const [correcciones, setCorrecciones] = useState({});

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const conPapel = comprobanteId ? `&comprobanteId=${comprobanteId}` : "";
        const r = await fetch(
          `/api/compras-proveedor/recetas/explicacion?proveedorId=${proveedorId}${conPapel}`,
          { credentials: "include", cache: "no-store" }
        );
        const d = await r.json();
        if (!vigente) return;
        if (!d?.ok) {
          setError(d?.error || "No se pudo abrir la explicación.");
          return;
        }
        setProveedor(d.proveedor);
        setPapel(d.papel);
        setExplicacion(d.explicacion || "");
      } catch {
        if (vigente) setError("No se pudo abrir la explicación: se cortó la conexión.");
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [proveedorId, comprobanteId]);

  // ── LO QUE SE MUESTRA SALE DE LA MISMA FUNCIÓN QUE EL SERVIDOR ─────────
  //
  // Cuando la persona corrige un número, el resultado se recalcula ACÁ con
  // `comoLoEntendio`, que es la misma que usó el servidor al probar. Si la
  // pantalla rehiciera la cuenta por su lado, el "cierra" de acá y el de allá
  // podrían decir cosas distintas sobre el mismo papel.
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

  const sePuedeGuardar =
    !resultado || resultado.hayTotal === false ? Boolean(explicacion.trim()) : resultado.cierra;

  async function probar() {
    setProbando(true);
    setMensaje(null);
    setCorrecciones({});
    try {
      const r = await fetch("/api/compras-proveedor/recetas/explicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proveedorId, comprobanteId, explicacion, probar: true }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok) {
        setMensaje({ tipo: "error", texto: d?.queHacer || d?.error || `El servidor contestó ${r.status}.` });
        return;
      }
      // ── SE GUARDA LA LECTURA CRUDA, NO LO YA MASTICADO ──────────────
      //
      // Corregir un número obliga a rehacer los dos controles, y rehacerlos
      // sobre el resultado ya armado sería reconstruir lo que el servidor ya
      // hizo — o sea, un segundo criterio. Con la lectura y la receta acá,
      // `comoLoEntendio` es literalmente la misma función de los dos lados.
      setLectura(d.lectura);
      setReceta(d.receta);
    } catch {
      setMensaje({ tipo: "error", texto: "Se cortó la conexión mientras probaba. No se guardó nada." });
    } finally {
      setProbando(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/compras-proveedor/recetas/explicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proveedorId, explicacion }),
      });
      const d = await r.json().catch(() => null);
      setMensaje(
        d?.ok
          ? { tipo: "ok", texto: d.queHacer }
          : { tipo: "error", texto: d?.error || `El servidor contestó ${r.status}.` }
      );
      if (d?.ok) onGuardado?.();
    } catch {
      setMensaje({ tipo: "error", texto: "Se cortó la conexión: no se guardó." });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <SunmiLoader />;
  if (error) return <p className="text-sm3 sunmi-text-danger break-words">{error}</p>;

  return (
    <section className="space-y-3">
      <SunmiCard className="p-3 space-y-1">
        <span className="block font-semibold sunmi-text-strong break-words">
          El papel de {proveedor?.nombre}
        </span>
        <p className="text-sm2 sunmi-text-muted break-words">{BAJADA}</p>
      </SunmiCard>

      {/* ── TU EXPLICACIÓN ───────────────────────────────────────────── */}
      <SunmiCard className="p-3 space-y-dato">
        <span className="block text-sm3 font-medium sunmi-text-strong">Tu explicación</span>
        <SunmiTextarea
          rows={7}
          value={explicacion}
          onChange={(e) => setExplicacion(e.target.value)}
          placeholder="Por ejemplo: CANTIDAD son las unidades que manda. BONIF. es el descuento en porcentaje. Cuando la columna PESO trae un número, el PRECIO es por kilo y la cantidad son piezas."
          className="w-full text-sm3"
        />
      </SunmiCard>

      {/* ── EL PAPEL CON EL QUE SE PRUEBA ────────────────────────────── */}
      {papel ? (
        <SunmiCard className="p-3 space-y-dato">
          <span className="block text-sm3 font-medium sunmi-text-strong">
            Se prueba con este papel
          </span>
          <div className="flex items-center justify-between gap-renglon">
            <span className="text-sm2 sunmi-text-muted">
              Pedido #{papel.pedidoId} · {papel.productos}{" "}
              {papel.productos === 1 ? "producto" : "productos"}
            </span>
            <a
              href={fotoDelComprobante(papel.comprobanteId)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-sm3 sunmi-text-accent"
            >
              Ver foto
            </a>
          </div>
        </SunmiCard>
      ) : (
        <SunmiCard className="p-3">
          <p className="text-sm2 sunmi-text-muted break-words">
            Todavía no hay ninguna foto de este proveedor con la que probar. Subí una factura
            desde la recepción y volvé.
          </p>
        </SunmiCard>
      )}

      {mensaje && (
        <p
          className={`text-sm3 break-words ${
            mensaje.tipo === "error" ? "sunmi-text-danger" : "sunmi-text-success"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {!resultado && (
        <div className="flex flex-col gap-dato">
          <SunmiButton
            color="primary"
            type="button"
            disabled={probando || !explicacion.trim() || !papel}
            onClick={probar}
            className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
          >
            {probando ? "Leyendo el papel…" : TITULO_PROBAR}
          </SunmiButton>
          <span className="text-sm3 sunmi-text-muted text-center">{AVISO_PROBAR}</span>
        </div>
      )}

      {/* ── ASÍ LO ENTENDIÓ ──────────────────────────────────────────── */}
      {resultado && (
        <>
          <span className="block text-sm3 font-medium sunmi-text-strong">Así lo entendió</span>

          <AsiLoEntendio
            resultado={resultado}
            comprobanteId={papel?.comprobanteId}
            onElegir={(indice, valor) =>
              setCorrecciones((prev) => ({ ...prev, [indice]: Number(valor) }))
            }
          />

          <div className="flex flex-col gap-dato">
            <SunmiButton
              color="primary"
              type="button"
              disabled={guardando || !sePuedeGuardar}
              onClick={guardar}
              className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
            >
              {guardando ? "Guardando…" : "Está bien, guardar"}
            </SunmiButton>
            {!sePuedeGuardar && (
              <span className="text-sm3 sunmi-text-muted text-center">
                Se puede guardar cuando los productos sumen el total del papel.
              </span>
            )}
            <SunmiButton
              color="slate"
              type="button"
              onClick={() => {
                setLectura(null);
                setCorrecciones({});
              }}
              className="w-full min-h-toque justify-center text-sm3"
            >
              Algo está mal: corregir la explicación
            </SunmiButton>
          </div>
        </>
      )}
    </section>
  );
}
