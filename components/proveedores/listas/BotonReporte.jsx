"use client";

// DESCARGAR O COMPARTIR EL REPORTE DE LA IMPORTACIÓN.
//
// ── QUÉ ES EL PDF ───────────────────────────────────────────────────────────
//
// Una fotografía histórica. Sale de lo que quedó guardado —costos aplicados,
// filas, motivos— y no toca nada. Sirve para mandárselo al proveedor, para
// archivarlo o para discutir un aumento con el papel en la mano.
//
// ── POR QUÉ COMPARTIR Y NO SOLO DESCARGAR ───────────────────────────────────
//
// En el teléfono, "descargar" deja el archivo en una carpeta que nadie
// encuentra. El menú nativo del sistema manda el PDF por WhatsApp en dos toques,
// que es lo que realmente se hace con él. Cuando el navegador no lo soporta, se
// descarga como siempre: no se pierde la función, cambia el camino.

import { useState } from "react";
import { Download, FileText, Share2 } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
// LA CASCADA DE COMPARTIR SE MUDÓ A `lib/compartir/compartirArchivo.js`.
//
// Estaba escrita acá adentro —`conviensCompartir`, `descargar` y el try/catch con
// la guarda de AbortError— y la necesitaba igual el envío del pedido a
// proveedor. Se sacó tal cual estaba; lo único que cambió de este archivo es de
// dónde viene, y el comportamiento es el mismo carácter por carácter. El porqué
// completo, y qué NO se llevó, están en el encabezado del módulo.
import { compartirODescargar, RESULTADO_COMPARTIR } from "@/lib/compartir/compartirArchivo";
import { TIPO_REPORTE, TITULO_REPORTE } from "@/lib/proveedores/listas/reporteImportacion";
import { rangoDeLaFila } from "@/lib/proveedores/listas/vigenciaConfirmacion";

const OPCIONES = [
  {
    tipo: TIPO_REPORTE.COMPLETO,
    detalle: "Resumen del sistema, actualizados, pendientes y no informados.",
    situaciones: ["ACTUALIZADOS", "PENDIENTES", "AUSENTES"],
  },
  {
    tipo: TIPO_REPORTE.ACTUALIZADOS,
    detalle: "Solo los que ya tienen su costo nuevo, con el recorrido de cada uno.",
    situaciones: ["ACTUALIZADOS"],
  },
  {
    tipo: TIPO_REPORTE.NO_ACTUALIZADOS,
    detalle: "Pendientes y no informados, con el motivo de cada uno.",
    situaciones: ["PENDIENTES", "AUSENTES"],
  },
];

export default function BotonReporte({ importacionId, cabecera, sistema, proveedor, usuario }) {
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [error, setError] = useState("");

  const generar = async (opcion) => {
    if (trabajando) return;
    setTrabajando(opcion.tipo);
    setError("");
    try {
      // ── EL RESUMEN SE BUSCA ACÁ SI NO LO DAN ────────────────────────────
      //
      // La pantalla vieja del detalle ya lo tenía cargado y se lo pasaba. Esa
      // pantalla se eliminó, y el resultado —que es donde vive ahora el reporte—
      // no lo necesita para nada más: pedirle que lo cargue en cada visita sería
      // una consulta de más en la pantalla que más se abre, para un botón que
      // casi nunca se toca. Se busca recién cuando alguien lo pide.
      const resumen = sistema ?? (await (async () => {
        const r = await fetch(`/api/proveedores/listas/${importacionId}`, { credentials: "include" });
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error || "No se pudo leer el resumen de la importación.");
        return j.sistema ?? null;
      })());
      // Los productos, de a una situación y completos: el PDF no se pagina por
      // pantallas.
      const traer = async (situacion) => {
        const r = await fetch(
          `/api/proveedores/listas/${importacionId}/sistema?situacion=${situacion}&todo=1`,
          { credentials: "include" }
        );
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error || "No se pudo leer el detalle.");
        return j;
      };

      const partes = {};
      for (const s of opcion.situaciones) partes[s] = await traer(s);

      // El generador se carga recién ahora: jsPDF pesa y no tiene por qué estar
      // en el bundle de una pantalla que casi siempre se usa sin exportar nada.
      const [{ generarReportePDF }, { analizarFila }] = await Promise.all([
        import("@/lib/proveedores/listas/reporteImportacionPDF"),
        import("@/lib/proveedores/listas/confirmarPresentacion"),
      ]);

      const analizarPara = (item, filaPrincipal) => {
        if (!filaPrincipal || filaPrincipal.estado !== "FACTOR_DUDOSO") return null;
        return analizarFila({
          fila: filaPrincipal,
          base: {
            unidad_medida: item.unidadMedida,
            factor_pack: item.factorPack,
            modoCompraProveedor: item.modoCompraProveedor,
            precio_costo: item.costoActual,
          },
          recargoPct: filaPrincipal.recargoPct,
          // El rango DE ESA FILA, resuelto adentro del bucle. Antes se calculaba
          // uno solo para toda la importación, con un `?? 10` y un `?? 20`
          // escritos a mano: el reporte evaluaba las filas confirmadas con un
          // criterio distinto del que se ve en pantalla al abrirlas.
          rango: rangoDeLaFila(filaPrincipal, cabecera),
        });
      };

      const { blob, nombre } = generarReportePDF({
        tipo: opcion.tipo,
        generadoEn: new Date().toISOString(),
        analizarPara,
        datos: {
          cabecera,
          proveedor,
          usuario,
          sistema: resumen,
          actualizados: partes.ACTUALIZADOS?.items ?? [],
          pendientes: partes.PENDIENTES?.items ?? [],
          ausentes: partes.AUSENTES?.items ?? [],
        },
      });

      const resultado = await compartirODescargar({
        blob,
        nombre,
        titulo: `${TITULO_REPORTE[opcion.tipo]} · Importación #${cabecera?.id}`,
      });

      // CANCELAR DEJA EL MENÚ ABIERTO, y eso es lo que hacía antes: la cancelación
      // llegaba como un AbortError que saltaba al `catch` de abajo, así que este
      // `setAbierto(false)` no se ejecutaba. La pieza ahora devuelve el caso en vez
      // de tirar, así que el corte se escribe acá — es el mismo comportamiento, no
      // uno nuevo. Quien se arrepintió sigue viendo las tres opciones.
      if (resultado === RESULTADO_COMPARTIR.CANCELADO) return;

      setAbierto(false);
    } catch (e) {
      // LA GUARDA DE AbortError SE FUE, y conviene saber por qué: cancelar el
      // menú ya no llega acá. La pieza de compartir devuelve CANCELADO en vez de
      // tirar, y ese caso sale antes con un `return`. Dejar la guarda escrita
      // sería una defensa que no se puede alcanzar, que es justo lo que este
      // repo tiene anotado como peor que no tenerla: se lee como cubierta.
      setError(e?.message || "No se pudo generar el reporte.");
    } finally {
      setTrabajando("");
    }
  };

  return (
    <div data-rol="reporte" className="relative">
      <SunmiButton
        color="slate"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full min-h-toque px-3 text-sm3 inline-flex items-center justify-center gap-1"
      >
        <FileText size={13} aria-hidden="true" />
        {/* Decía "Descargar / compartir reporte" y no entraba en media pantalla.
            Qué hace lo explica el menú que abre, renglón por renglón; el botón
            solo tiene que decir de qué se trata. */}
        Reporte
      </SunmiButton>

      {abierto && (
        <div className="mt-1 sunmi-surface sunmi-border border rounded-lg p-1.5 space-y-1 max-w-[26rem]">
          {OPCIONES.map((o) => (
            <button
              key={o.tipo}
              type="button"
              disabled={!!trabajando}
              onClick={() => generar(o)}
              className="w-full text-left rounded p-1.5 sunmi-border border"
            >
              <div className="text-[11.5px] font-semibold sunmi-text-strong inline-flex items-center gap-1">
                {trabajando === o.tipo ? (
                  <>Generando…</>
                ) : (
                  <>
                    <Download size={11} aria-hidden="true" />
                    {TITULO_REPORTE[o.tipo]}
                  </>
                )}
              </div>
              <div className="text-[10px] sunmi-text-muted leading-tight">{o.detalle}</div>
            </button>
          ))}
          <p className="text-[9.5px] sunmi-text-muted leading-tight inline-flex items-start gap-1 px-1">
            <Share2 size={10} aria-hidden="true" className="shrink-0 mt-0.5" />
            En el teléfono se abre el menú para compartir; en la computadora se descarga.
          </p>
          {error && <p className="text-[10.5px] sunmi-text-danger px-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
