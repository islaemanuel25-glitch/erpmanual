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
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import AsiLoEntendio from "@/components/compras-proveedor/AsiLoEntendio";
import VisorDeFoto from "@/components/compras-proveedor/VisorDeFoto";
import { comoLoEntendio } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import {
  OPERACION,
  queHacerHttp,
  SIN_RESPUESTA_LECTURA,
} from "@/lib/compras-proveedor/comprobante/subida";
import {
  ESTADO_TURNO,
  TEXTO_TURNO,
} from "@/lib/compras-proveedor/comprobante/lector/lecturasEnCurso";

export const TITULO_PROBAR = "Probar: ver cómo lo entiende";
export const AVISO_PROBAR = "Todavía no se guarda nada. Primero te muestra cómo leyó el papel.";
/** Lo que se ve mientras la lectura corre aparte. El minuto NO es adorno: una
 *  lectura real tarda entre 12 y 45 segundos, y sin decirlo la espera se lee
 *  como que se colgó. */
export const TEXTO_LEYENDO = TEXTO_TURNO[ESTADO_TURNO.LEYENDO];
/** Cada cuánto se pregunta por el turno. */
export const CADA_CUANTO_SE_PREGUNTA_MS = 2000;

/**
 * QUÉ DECIR CUANDO ALGO SALE MAL. NUNCA UN NÚMERO DE HTTP.
 *
 * Lo que el servidor haya mandado gana, porque sabe más. Si no mandó nada
 * —una página de error del proxy, una respuesta que no es JSON— sale del
 * CATÁLOGO que ya existe, el mismo que usa la recepción: `queHacerHttp` con
 * `OPERACION.LECTURA`, que para un 504 dice "la lectura tardó más de lo que el
 * servidor espera".
 *
 * Acá decía `El servidor contestó ${r.status}.`, y eso fue literalmente lo que
 * Emanuel leyó en el celular el 2026-09-21: "El servidor contestó 504." Un
 * número no le dice a nadie qué hacer. El catálogo existía desde antes; esta
 * pantalla no lo estaba usando.
 */
export function textoDeFallo(cuerpo, status) {
  if (cuerpo?.queHacer) return cuerpo.queHacer;
  if (cuerpo?.error) return cuerpo.error;
  return queHacerHttp(status, { operacion: OPERACION.LECTURA }).texto;
}
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
  // La variación normal del proveedor, en %. Texto y no número: se está
  // escribiendo, y un `0` intermedio no tiene que volverse un valor guardado.
  const [variacion, setVariacion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [proveedor, setProveedor] = useState(null);
  const [papel, setPapel] = useState(null);
  const [explicacion, setExplicacion] = useState("");
  const [probando, setProbando] = useState(false);
  // Qué decirle a quien espera mientras la lectura corre aparte.
  const [leyendo, setLeyendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [lectura, setLectura] = useState(null);
  const [receta, setReceta] = useState(null);
  // Qué producto resultó ser cada renglón, cuando se pudo saber por su alias.
  // Lo resuelve el servidor y viaja para que la cuenta se rehaga acá con los
  // MISMOS datos: si no, corregir un número haría cambiar la unidad sola.
  const [productos, setProductos] = useState(null);
  const [correcciones, setCorrecciones] = useState({});
  const [mirandoLaFoto, setMirandoLaFoto] = useState(false);

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
        // Lo que ya está guardado. Sin esto el campo arranca vacío y guardar
        // la explicación borraría una variación cargada antes.
        if (d.variacionNormalPct != null) setVariacion(String(d.variacionNormalPct));
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
    return comoLoEntendio({ lectura: conCorrecciones, receta, productos });
  }, [lectura, receta, correcciones, productos]);

  const sePuedeGuardar =
    !resultado || resultado.hayTotal === false ? Boolean(explicacion.trim()) : resultado.cierra;

  async function probar() {
    setProbando(true);
    setMensaje(null);
    setCorrecciones({});
    try {
      // ── ARRANCAR: ESTO CONTESTA ENSEGUIDA ────────────────────────────
      //
      // No espera la lectura. Devuelve un número de turno y la espera se hace
      // preguntando, para que ningún proxy pueda cortar por tiempo — que es
      // exactamente lo que pasó el 2026-09-21 con un 504 a los 60 segundos.
      const r = await fetch("/api/compras-proveedor/recetas/explicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proveedorId, comprobanteId, explicacion, probar: true }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok || !d?.turno) {
        setMensaje({ tipo: "error", texto: textoDeFallo(d, r.status) });
        return;
      }
      await esperarElTurno(d.turno);
    } catch {
      setMensaje({ tipo: "error", texto: SIN_RESPUESTA_LECTURA.texto });
    } finally {
      setProbando(false);
    }
  }

  /** Preguntar por el turno hasta que esté, mostrando mientras tanto qué pasa. */
  async function esperarElTurno(turno) {
    setLeyendo(TEXTO_LEYENDO);
    try {
      // Sin tope de intentos a propósito: el que decide cuándo deja de esperar
      // es quien mira la pantalla, no un número acá adentro. La lectura tiene
      // su propio corte del lado del servidor y siempre termina — bien o mal—,
      // así que este bucle no puede quedarse girando para siempre.
      for (;;) {
        await new Promise((listo) => setTimeout(listo, CADA_CUANTO_SE_PREGUNTA_MS));
        const r = await fetch(
          `/api/compras-proveedor/recetas/explicacion?turno=${encodeURIComponent(turno)}`,
          { credentials: "include", cache: "no-store" }
        );
        const d = await r.json().catch(() => null);
        if (!d?.ok) {
          setMensaje({ tipo: "error", texto: textoDeFallo(d, r.status) });
          return;
        }
        const t = d.turno;
        if (t.estado === ESTADO_TURNO.LEYENDO) {
          setLeyendo(t.texto || TEXTO_LEYENDO);
          continue;
        }
        if (t.estado === ESTADO_TURNO.NO_ESTA) {
          setMensaje({ tipo: "error", texto: t.texto });
          return;
        }
        if (t.estado === ESTADO_TURNO.FALLO || !t.resultado?.ok) {
          setMensaje({
            tipo: "error",
            texto:
              t.resultado?.queHacer ||
              t.resultado?.error ||
              "No se pudo leer el papel. Probá de nuevo: no se guardó nada.",
          });
          return;
        }
        // ── LISTO ────────────────────────────────────────────────────
        const d2 = t.resultado;
        setLectura(d2.lectura);
        setReceta(d2.receta);
        setProductos(d2.productos ?? null);
        return;
      }
    } finally {
      setLeyendo(null);
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
        body: JSON.stringify({
          proveedorId,
          explicacion,
          // Vacío significa "no la toques": el default lo pone la base.
          variacionNormalPct: variacion.trim() === "" ? undefined : Number(variacion.replace(",", ".")),
        }),
      });
      const d = await r.json().catch(() => null);
      setMensaje(
        d?.ok
          ? { tipo: "ok", texto: d.queHacer }
          : { tipo: "error", texto: textoDeFallo(d, r.status) }
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
      {papel && (
        <VisorDeFoto
          comprobanteId={papel.comprobanteId}
          abierto={mirandoLaFoto}
          onCerrar={() => setMirandoLaFoto(false)}
        />
      )}
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
            {/* El MISMO visor que usa el bloque de abajo: respeta el EXIF,
                gira y se agranda con dos dedos. Era un enlace a la imagen
                cruda, que el navegador abría dada vuelta. */}
            <SunmiButton
              color="ghost"
              type="button"
              onClick={() => setMirandoLaFoto(true)}
              className="shrink-0 min-h-toque text-sm3 sunmi-text-accent"
            >
              Ver foto
            </SunmiButton>
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

      {/* ── CUÁNTO SE LE MUEVE EL PRECIO A ESTE PROVEEDOR ───────────────
          Un 9 % es normal en uno que actualiza todos los meses y es una señal
          de lectura mal hecha en uno que no movió un precio en medio año. El
          mismo número no significa lo mismo en los dos, así que lo decide cada
          proveedor. Decide qué viene marcado en la hoja de Corregir y cuándo el
          cierre frena. Se guarda con el botón de abajo, como la explicación. */}
      <SunmiCard className="p-3">
        <div className="flex items-center justify-between gap-renglon">
          <span className="text-sm3 font-medium sunmi-text-strong">
            Variación normal de precios
          </span>
          <div className="shrink-0 flex items-center gap-dato">
            <SunmiInput
              inputMode="decimal"
              value={variacion}
              onChange={(e) => setVariacion(e.target.value)}
              aria-label="Variación normal de precios, en por ciento"
              className="w-20 min-h-toque px-filtro text-lg2 tabular-nums text-right"
            />
            <span className="text-sm3 sunmi-text-muted">%</span>
          </div>
        </div>
      </SunmiCard>

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
            {probando ? (leyendo || TEXTO_LEYENDO) : TITULO_PROBAR}
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
                setProductos(null);
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
