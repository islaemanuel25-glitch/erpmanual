"use client";

import Link from "next/link";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiNavCard from "@/components/sunmi/SunmiNavCard";
import { inicialesDeMedio } from "@/lib/pos-ventas/mediosCobroPantalla";
import { etiquetaVisibilidadModalidad, resumenDeModalidad } from "@/lib/pos-ventas/modalidadesPantalla";

// LAS MODALIDADES DE UN MEDIO — la lista que se ve adentro del medio.
//
// ── MISMA PIEZA QUE LA LISTA DE MEDIOS, NO UNA PARECIDA ────────────────────
//
// `SunmiNavCard`, igual que Cobros. Las dos listas dicen lo mismo —nombre,
// condición comercial, estado— y si se escribieran por separado, dentro de dos
// meses una tendría un dato que la otra no. Lo único propio de acá es el texto
// del resumen, y vive en `modalidadesPantalla.js` con sus candados.
//
// ── UNA MODALIDAD INACTIVA SE VE ───────────────────────────────────────────
//
// Se dibuja apagada y con su etiqueta, y NO se esconde. Esconderla dejaría a
// alguien sin forma de volver a prenderla, que es el mismo motivo por el que un
// medio oculto sigue apareciendo en Cobros. Lo que cambia con `activo` es si la
// opción aparece en el SELECTOR DEL CAJERO, no si existe.
//
// ── NINGÚN PORCENTAJE ESTÁ ESCRITO ACÁ ─────────────────────────────────────
//
// Los 2 %, 6 % y 0 % del diseño son datos de ejemplo. Lo que se dibuja sale de
// `modalidades`, tal como lo devolvió el servidor.

export default function ListaModalidades({ modalidades = [], hrefDe, hrefNueva, mensajeVacio }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm2 sunmi-section-title">MODALIDADES</h2>

      {modalidades.length === 0 ? (
        <SunmiCard className="p-3 text-xs sunmi-text-muted">{mensajeVacio}</SunmiCard>
      ) : (
        <div className="flex flex-col gap-3">
          {modalidades.map((m) => (
            <SunmiNavCard
              key={m.id}
              insignia={inicialesDeMedio(m.nombre)}
              label={m.nombre}
              descripcion={resumenDeModalidad(m)}
              href={hrefDe(m)}
              atenuado={!m.activo}
              estado={m.activo ? null : etiquetaVisibilidadModalidad(m)}
            />
          ))}
        </div>
      )}

      <Link href={hrefNueva} className="block">
        <SunmiCard className="p-4 text-center text-sm font-semibold sunmi-text-accent">
          + Agregar modalidad
        </SunmiCard>
      </Link>
    </div>
  );
}
