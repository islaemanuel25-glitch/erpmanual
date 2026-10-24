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
//
// ── ES UNA HOJA, NO UN BOTÓN CON UN PANEL (Emanuel, 2026-10-24) ─────────────
//
// Era `BotonReporte`: un botón de medio ancho que desplegaba un panel de medio
// ancho con tres renglones de 10 px y colores propios, que no se parecía a nada
// de la pantalla. Ahora el botón lo pone la pantalla —en la barra fija de una
// lista cerrada, como «✓ Aplicar»— y esto es la hoja que abre: la MISMA pieza
// que la hoja de vincular (`SunmiModalLayout` en forma de hoja), con las tres
// opciones como tarjetas del kit a todo el ancho, cada una con su ícono, título
// y descripción, y la línea de compartir al pie, en gris.

import { useState } from "react";
import { CheckCircle2, CircleDashed, FileText, Share2 } from "lucide-react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
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

export const TITULO_HOJA_REPORTE = "Reporte de la lista";
export const TEXTO_PIE_REPORTE = "En el teléfono se abre el menú para compartir; en la computadora se descarga.";

export const OPCIONES_REPORTE = [
  {
    tipo: TIPO_REPORTE.COMPLETO,
    Icono: FileText,
    detalle: "Resumen del sistema, actualizados, pendientes y no informados.",
    situaciones: ["ACTUALIZADOS", "PENDIENTES", "AUSENTES"],
  },
  {
    tipo: TIPO_REPORTE.ACTUALIZADOS,
    Icono: CheckCircle2,
    detalle: "Solo los que ya tienen su costo nuevo, con el recorrido de cada uno.",
    situaciones: ["ACTUALIZADOS"],
  },
  {
    tipo: TIPO_REPORTE.NO_ACTUALIZADOS,
    Icono: CircleDashed,
    detalle: "Pendientes y no informados, con el motivo de cada uno.",
    situaciones: ["PENDIENTES", "AUSENTES"],
  },
];

/**
 * @param onCerrar  cerrar la hoja; también al terminar de compartir o descargar
 */
export default function HojaReporte({ importacionId, cabecera, sistema, proveedor, usuario, onCerrar }) {
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

      // CANCELAR DEJA LA HOJA ABIERTA, y eso es lo que hacía el menú de antes: la
      // cancelación llegaba como un AbortError que saltaba al `catch` de abajo,
      // así que el cierre no se ejecutaba. La pieza ahora devuelve el caso en vez
      // de tirar, así que el corte se escribe acá — es el mismo comportamiento, no
      // uno nuevo. Quien se arrepintió sigue viendo las tres opciones.
      if (resultado === RESULTADO_COMPARTIR.CANCELADO) return;

      onCerrar?.();
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
    <SunmiModalLayout
      open
      forma="hoja"
      title={TITULO_HOJA_REPORTE}
      color="amber"
      // Mientras se arma el PDF no se cierra: el compartir llega después.
      onClose={trabajando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-2"
      z={9999}
      footer={
        <p className="w-full text-sm2 sunmi-text-muted leading-snug flex items-start gap-1.5">
          <Share2 size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
          {TEXTO_PIE_REPORTE}
        </p>
      }
    >
      {OPCIONES_REPORTE.map(({ tipo, Icono, detalle, situaciones }) => (
        <SunmiActionCard
          key={tipo}
          disabled={!!trabajando}
          onClick={() => generar({ tipo, situaciones })}
          data-reporte={tipo}
        >
          <span className="flex items-start gap-3">
            <Icono size={22} aria-hidden="true" className="shrink-0 sunmi-text-accent" />
            <span className="min-w-0">
              <span className="block text-sm3 font-semibold sunmi-text-strong">
                {trabajando === tipo ? "Generando…" : TITULO_REPORTE[tipo]}
              </span>
              <span className="block text-sm2 sunmi-text-muted leading-snug">{detalle}</span>
            </span>
          </span>
        </SunmiActionCard>
      ))}
      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}
    </SunmiModalLayout>
  );
}
