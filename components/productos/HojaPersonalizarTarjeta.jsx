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
// ── ESTA HOJA PRENDE Y APAGA. NO REORDENA. ─────────────────────────────────
//
// Tenía flechas de subir y bajar en cada campo, y movían el dato dentro de su
// región. **Se sacaron por decisión de diseño**: la posición de cada dato la
// define el layout aprobado.
//
// Con las flechas se fue `moverCampo` y también `tieneConQuienIntercambiarse`,
// que existía solo para decidir a quién ofrecerle las flechas. Y el orden de esta
// lista dejó de salir del guardado: es el del catálogo de campos, fijo, porque ya
// no hay nada que reflejar.
//
// ── ESTO NO EDITA VALORES, Y ES A PROPÓSITO ─────────────────────────────────
//
// Elige qué se VE, no cambia ningún dato del producto. El issue lo pide expreso y
// además es lo correcto: una tarjeta de lista con campos editables en línea es
// justo donde se cambia un precio sin querer, y el catálogo ya tiene su editor
// —Editar, que es la acción fija de la tarjeta.

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { Lock } from "lucide-react";
import {
  CAMPOS_FIJOS,
  CAMPOS_OPCIONALES,
  normalizarConfiguracion,
  alternarCampo,
} from "@/lib/productos/camposTarjeta";

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
      {/* EL TEXTO DICE QUE NO SE REORDENA. Sin esto, alguien que conoció la
          versión con flechas las va a buscar y va a creer que se rompieron. */}
      <p className="text-[10.5px] sunmi-text-muted leading-[1.35] mb-1">
        Elegí qué datos muestra cada producto. Nombre, precio con su presentación y
        Editar van siempre. La posición de cada dato la define el diseño de la card:
        acá se prende y se apaga.
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

      {/* EL ORDEN DE ESTA LISTA ES EL DEL CATÁLOGO DE CAMPOS, no el guardado:
          ya no hay orden configurable que reflejar. */}
      {CAMPOS_OPCIONALES.map((campo) => {
        const visible = actual.visibles[campo.id] === true;

        return (
          <div key={campo.id} className="flex items-center gap-1 px-1 py-0.5 rounded-lg sunmi-row-hover">
            {/* EL INTERRUPTOR ES EL RENGLÓN ENTERO, no una casilla de 16 px.
                A 390 px una casilla nativa es el blanco más difícil de acertar
                de toda la pantalla, y equivocarle esconde un dato. */}
            <button
              type="button"
              onClick={() => onChange(alternarCampo(actual, campo.id))}
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
          </div>
        );
      })}
    </SunmiModalLayout>
  );
}
