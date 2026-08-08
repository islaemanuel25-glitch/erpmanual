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

/**
 * ¿Conviene compartir en vez de descargar?
 *
 * Solo en dispositivos táctiles. En una computadora el menú de compartir es un
 * rodeo —lo que se quiere es el archivo en Descargas— y además varios
 * navegadores de escritorio dicen que pueden compartir y después rechazan el
 * pedido si no viene de un gesto directo.
 */
function conviensCompartir(archivo) {
  try {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const tactil = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    if (!tactil) return false;
    return !!navigator.canShare?.({ files: [archivo] });
  } catch {
    return false;
  }
}

/** Bajar el archivo. Es el camino por defecto y el respaldo de compartir. */
function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera en el próximo tick: revocarla en el mismo cancela la descarga en
  // algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function BotonReporte({ importacionId, cabecera, sistema, proveedor, usuario }) {
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [error, setError] = useState("");

  const generar = async (opcion) => {
    if (trabajando) return;
    setTrabajando(opcion.tipo);
    setError("");
    try {
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
          sistema,
          actualizados: partes.ACTUALIZADOS?.items ?? [],
          pendientes: partes.PENDIENTES?.items ?? [],
          ausentes: partes.AUSENTES?.items ?? [],
        },
      });

      const archivo = new File([blob], nombre, { type: "application/pdf" });
      if (conviensCompartir(archivo)) {
        try {
          await navigator.share({
            files: [archivo],
            title: `${TITULO_REPORTE[opcion.tipo]} · Importación #${cabecera?.id}`,
          });
        } catch (e) {
          // Cancelar el menú es una decisión, no un error: ahí no se descarga
          // nada. Cualquier otra falla cae al camino normal para que el reporte
          // no se pierda.
          if (e?.name === "AbortError") throw e;
          descargar(blob, nombre);
        }
      } else {
        descargar(blob, nombre);
      }
      setAbierto(false);
    } catch (e) {
      // Cancelar el menú de compartir tira AbortError y no es un error.
      if (e?.name !== "AbortError") setError(e?.message || "No se pudo generar el reporte.");
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
        className="py-1.5 px-3 !text-[11.5px] inline-flex items-center gap-1"
      >
        <FileText size={13} aria-hidden="true" />
        Descargar / compartir reporte
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
