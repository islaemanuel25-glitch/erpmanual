"use client";

// "PERSONALIZAR CARD": qué datos muestra cada producto en el celular.
//
// ── LOS TRES FIJOS SE MUESTRAN, Y NO SE PUEDEN APAGAR ───────────────────────
//
// Se listan igual, en gris y sin interruptor. Esconderlos de la lista dejaría al
// que abre esta hoja preguntándose dónde está el nombre; mostrarlos con un
// interruptor apagable convertiría en apagable lo que no lo es. La regla vive en
// `lib/productos/camposTarjeta.js`, con un candado, y acá solo se dibuja.
//
// ── ESTO NO EDITA VALORES, Y ES A PROPÓSITO ─────────────────────────────────
//
// Elige qué se VE, no cambia ningún dato del producto. El issue lo pide expreso y
// además es lo correcto: una tarjeta de lista con campos editables en línea es
// justo donde se cambia un precio sin querer, y el catálogo ya tiene su editor
// —Editar, que es la acción fija de la tarjeta.

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { ChevronUp, ChevronDown, Lock } from "lucide-react";
import {
  CAMPOS_FIJOS,
  CAMPOS_OPCIONALES,
  normalizarConfiguracion,
  moverCampo,
  alternarCampo,
} from "@/lib/productos/camposTarjeta";

/** Cuántos campos comparten región con éste. De uno, no se puede reordenar. */
function tieneConQuienIntercambiarse(id) {
  const campo = CAMPOS_OPCIONALES.find((c) => c.id === id);
  if (!campo) return false;
  return CAMPOS_OPCIONALES.filter((c) => c.region === campo.region).length > 1;
}

export default function HojaPersonalizarTarjeta({ open, onClose, config, onChange }) {
  const actual = normalizarConfiguracion(config);

  return (
    <SunmiModalLayout
      open={open}
      onClose={onClose}
      title="Personalizar card"
      subtitle={null}
      forma="hoja"
      z={9999}
      espacioCuerpo="mt-2 gap-1"
      maxWidth="max-w-xl"
    >
      <p className="text-[10.5px] sunmi-text-muted leading-[1.35] mb-1">
        Elegí qué datos muestra cada producto. Nombre, precio y Editar van siempre.
      </p>

      {CAMPOS_FIJOS.map((campo) => (
        <div
          key={campo.id}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg opacity-60"
        >
          <Lock className="w-3.5 h-3.5 shrink-0 sunmi-text-muted" aria-hidden="true" />
          <span className="text-[13px] sunmi-text-strong">{campo.etiqueta}</span>
          <span className="ml-auto text-[10.5px] sunmi-text-muted">siempre</span>
        </div>
      ))}

      <div className="border-t sunmi-divider my-1" />

      {/* EL ORDEN DE ESTA LISTA ES EL CONFIGURADO, no el del catálogo: si se
          mostrara siempre en el orden de fábrica, mover un campo no se vería
          acá y el botón parecería no hacer nada. */}
      {actual.orden.map((id) => {
        const campo = CAMPOS_OPCIONALES.find((c) => c.id === id);
        if (!campo) return null;
        const visible = actual.visibles[id] === true;
        const ordenable = tieneConQuienIntercambiarse(id);

        return (
          <div key={id} className="flex items-center gap-1 px-1 py-0.5 rounded-lg sunmi-row-hover">
            {/* EL INTERRUPTOR ES EL RENGLÓN ENTERO, no una casilla de 16 px.
                A 390 px una casilla nativa es el blanco más difícil de acertar
                de toda la pantalla, y equivocarle esconde un dato. */}
            <button
              type="button"
              onClick={() => onChange(alternarCampo(actual, id))}
              aria-pressed={visible}
              className="flex-1 flex items-center gap-2.5 text-left px-1.5 py-2 min-h-[44px]"
            >
              {/* La marca de encendido sale de `--pos-accent`, el token del
                  acento del theme. Un verde o un azul escritos acá se verían
                  fuera de lugar en trece de los catorce temas. */}
              <span
                className="w-4 h-4 shrink-0 rounded border flex items-center justify-center"
                style={{
                  borderColor: visible ? "var(--pos-accent)" : "var(--pos-panel-border)",
                  background: visible ? "var(--pos-accent)" : "transparent",
                }}
                aria-hidden="true"
              >
                {visible && (
                  <span
                    className="block w-1.5 h-1.5 rounded-sm"
                    style={{ background: "var(--pos-panel-bg)" }}
                  />
                )}
              </span>
              <span
                className={`text-[13px] ${visible ? "sunmi-text-strong" : "sunmi-text-muted"}`}
              >
                {campo.etiqueta}
              </span>
            </button>

            {/* SUBIR Y BAJAR SOLO DONDE SE PUEDE. El proveedor y la equivalencia
                tienen posición estructural propia —pegado al nombre uno, franja
                bajo el precio la otra— y no hay con qué intercambiarlos. Ofrecer
                el botón igual sería prometer un movimiento que la tarjeta no va
                a mostrar. */}
            {ordenable && (
              <span className="flex shrink-0">
                <button
                  type="button"
                  onClick={() => onChange(moverCampo(actual, id, "arriba"))}
                  aria-label={`Subir ${campo.etiqueta}`}
                  className="w-9 h-9 flex items-center justify-center rounded-lg sunmi-row-hover sunmi-text-muted"
                >
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(moverCampo(actual, id, "abajo"))}
                  aria-label={`Bajar ${campo.etiqueta}`}
                  className="w-9 h-9 flex items-center justify-center rounded-lg sunmi-row-hover sunmi-text-muted"
                >
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        );
      })}
    </SunmiModalLayout>
  );
}
