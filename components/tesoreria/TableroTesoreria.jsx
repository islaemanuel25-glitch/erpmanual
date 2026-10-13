"use client";

// components/tesoreria/TableroTesoreria.jsx
//
// LO QUE SE VE AL ABRIR TESORERÍA. Dos entradas, y las elige el servidor, como
// en Pago a depósito: el DEPÓSITO —o un admin en vista global— ve la lista de
// locales y entra a uno; un LOCAL ve directo la suya. Quién puede mirar qué lo
// decide la API: acá no se reconstruye ningún alcance.
//
// Este es el único lugar con estado de pantalla: qué hoja está abierta. La
// pantalla (`PantallaTesoreria`) es presentacional y las hojas hacen sus
// propios envíos; después de un éxito, se vuelve a leer del servidor.

import { useState } from "react";
import { useRouter } from "next/navigation";

import EntradaDeLocales from "@/components/transferencias/EntradaDeLocales";
import { AnchoDeLectura } from "@/components/finanzas/LayoutFinanzasEscritorio";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import { insigniaDelLocal } from "@/components/finanzas/TableroFinanzas";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { VISTA_TESORERIA, urlDeLocalTesoreria, urlDeTesoreria } from "@/lib/tesoreria/contextoTesoreria";

import PantallaTesoreria from "./PantallaTesoreria";
import HojaVerificarEfectivo from "./HojaVerificarEfectivo";
import HojaAnularVerificacion from "./HojaAnularVerificacion";
import { useTesoreria } from "./useTesoreria";

/**
 * @param {object} props
 * @param {React.ReactNode} [props.volver]  el Volver de la página
 *
 * ── DÓNDE VA EL VOLVER EN ESCRITORIO ─────────────────────────────────────
 *
 * En el resumen del período, en la barra del molde de Finanzas, al lado del
 * período: no ocupa su propia fila. En la lista de locales y en los detalles,
 * que no usan el molde, en su fila de siempre (`AccionDePantalla`).
 *
 * `AccionDePantalla` se dibuja SIEMPRE, vacía cuando el Volver se fue a la
 * barra: en el celular no se ve pero cuenta —es la hermana anterior que le da
 * a lo que sigue el margen de `space-y-3.5` de la página—, y sacarla subiría
 * la pantalla 12 px.
 */
export default function TableroTesoreria({ destino = null, volver = null }) {
  const router = useRouter();
  const t = useTesoreria({ destino });
  const [verificando, setVerificando] = useState(null);
  const [anulando, setAnulando] = useState(null);

  const esEntrada = t.datos?.vista === "ENTRADA";
  const lectura = t.datos?.tesoreria || null;
  // La misma condición con que `PantallaTesoreria` elige un detalle.
  const enDetalle = t.ctx.vista !== VISTA_TESORERIA.RESUMEN && Boolean(lectura);
  const volverEnLaBarra = !esEntrada && !enDetalle;

  if (esEntrada) {
    return (
      <>
        <AccionDePantalla>{volver}</AccionDePantalla>
        <AnchoDeLectura>
          <EntradaDeLocales
            locales={t.datos.locales || []}
            rotulo="LOCALES"
            textoVacio="Este grupo todavía no tiene locales."
            insigniaDe={insigniaDelLocal}
            onEntrar={(l) => router.push(urlDeLocalTesoreria(l.localId, t.ctx))}
          />
        </AnchoDeLectura>
      </>
    );
  }

  return (
    <>
      <AccionDePantalla>{volverEnLaBarra ? null : volver}</AccionDePantalla>
      <PantallaTesoreria
        datos={t.datos?.vista === "UN_LOCAL" ? t.datos : null}
        cargando={t.cargando}
        error={t.error}
        ctx={t.ctx}
        faltaRango={t.faltaRango}
        hoy={hoyArgentinaISO()}
        onCambiarUnidad={t.onCambiarUnidad}
        onElegirRango={t.onElegirRango}
        onAtras={t.onAtras}
        onAdelante={t.onAdelante}
        onReintentar={t.recargar}
        onIr={t.onIr}
        onVolver={t.onVolver}
        onVerificar={(g) => setVerificando({ entregas: g.pendientes, subtitulo: g.nombre })}
        onAnular={(acto) => setAnulando(acto)}
        // Solo quien entró desde la lista puede volver a ella a elegir otro local.
        onCambiarLocal={destino ? () => router.push(urlDeTesoreria(t.ctx)) : null}
        volver={volverEnLaBarra ? volver : null}
      />

      <HojaVerificarEfectivo
        abierto={Boolean(verificando)}
        entregas={verificando?.entregas || []}
        cajas={lectura?.cajas || []}
        subtitulo={verificando?.subtitulo}
        localId={t.datos?.local?.id}
        onCerrar={() => setVerificando(null)}
        onHecho={() => {
          setVerificando(null);
          t.recargar();
        }}
      />

      <HojaAnularVerificacion
        abierto={Boolean(anulando)}
        acto={anulando}
        onCerrar={() => setAnulando(null)}
        onHecho={() => {
          setAnulando(null);
          // La anulada ya no es vigente: se vuelve a su turno (o al resumen) y se
          // relee. Sus entregas aparecen otra vez como pendientes.
          const grupo = t.ctx.grupo;
          t.onIr(grupo ? { vista: VISTA_TESORERIA.TURNO, grupo } : { vista: VISTA_TESORERIA.RESUMEN }, { reemplazar: true });
          t.recargar();
        }}
      />
    </>
  );
}
