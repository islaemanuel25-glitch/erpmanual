"use client";

// components/sunmi/SunmiCampoHora.jsx
//
// UNA HORA "HH:MM" DE 24 HORAS, ELEGIDA CON DOS RUEDAS DEL KIT Y NO CON EL
// RELOJ DEL NAVEGADOR.
//
// ── POR QUÉ NO `<input type="time">` ──────────────────────────────────────
//
// El campo nativo guarda "18:30", pero lo MUESTRA como lo pida el idioma del
// teléfono: en un Android en español sale "06:30 p. m.", y al tocarlo abre el
// reloj circular de Chrome, que no entra en la pantalla y no respeta el tema.
// El ERP trabaja en 24 horas. Lo que se ve acá es siempre el valor tal cual,
// "HH:MM", porque el campo cerrado es un botón que lo escribe como texto: no
// hay ningún `<input type="time">` al que el navegador le pueda aplicar su
// formato ni su selector.
//
// ── LA HOJA: DOS RUEDAS, DISEÑO APROBADO ──────────────────────────────────
//
// Figma `uptcbzbnV5M4q32kgmupF9`, nodo `22:2`, "Turnos operativos · Selector
// hora · propuesta compacta": título "Elegir hora", "Formato 24 horas", dos
// columnas —Hora 00–23 y Minutos 00–59— separadas por ":", el renglón del
// medio destacado con el anterior y el siguiente a la vista, un divisor y
// Cancelar / Confirmar. Reemplazó a la primera versión, dos `SunmiCampoCantidad`
// con − y +, que se rechazó al verla en el teléfono.
//
// Cada rueda es una lista que scrollea con `scroll-snap`: el dedo la arrastra,
// el navegador la deja quieta con un renglón centrado, y el elegido es el que
// quedó en el medio —`indiceDeScroll`—. Sin librería, sin rueda infinita: 24 y
// 60 renglones se recorren con un deslizamiento. Sin pasos de 5 o 15: cualquier
// "HH:MM" que acepte el servidor se puede elegir.
//
// El diseño trae una manija arriba de la hoja; `SunmiModalLayout` no tiene
// una y no se le agregó para esta pieza. La hoja es la de siempre del kit
// (`hoja-o-centrado`, la de los modales de caja: pegada abajo en el teléfono).
//
// El formato lo leen y escriben las mismas funciones que usa la regla del
// turno, `minutosDeHora` y `horaDeMinutos`: no hay un segundo parser de
// "HH:MM" al lado. Los colores salen del tema: el renglón elegido usa la
// misma clase que una fila seleccionada de tabla, `sunmi-fila-seleccionada`.
//
// ── LOS PROPS ─────────────────────────────────────────────────────────────
//
//   value     "HH:MM", o vacío/null si todavía no tiene.
//   onChange  recibe "HH:MM", o "" si se eligió quitarla. Solo al Confirmar
//             (o «Sin hora»): Cancelar y tocar afuera no lo llaman.
//   etiqueta  el `aria-label` del campo y de las dos ruedas.
//   vaciable  muestra «Sin hora» en la hoja. Los horarios de un turno que ya
//             existe se pueden quitar —el servidor decide si se acepta—; el de
//             uno nuevo no, porque nace activo y lo necesita.

import { useLayoutEffect, useRef, useState } from "react";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { horaDeMinutos, minutosDeHora } from "@/lib/caja/turnoOperativo";

/** Lo que muestra el campo cerrado cuando no hay hora. */
export const SIN_HORA = "--:--";

const dosDigitos = (n) => String(n).padStart(2, "0");
const deCeroA = (tope) => Object.freeze(Array.from({ length: tope + 1 }, (_, i) => dosDigitos(i)));

/** Los renglones de cada rueda: "00".."23" y "00".."59". */
export const VALORES_HORA = deCeroA(23);
export const VALORES_MINUTO = deCeroA(59);

/** Lo que muestra el campo cerrado: el valor "HH:MM" tal cual, o `SIN_HORA`. */
export function textoDeHora(valor) {
  return minutosDeHora(valor) == null ? SIN_HORA : valor;
}

/** "HH:MM" → el renglón de cada rueda. Sin hora, 00 y 00. */
export function partesDeHora(valor) {
  const m = minutosDeHora(valor);
  if (m == null) return { hora: 0, minuto: 0 };
  return { hora: Math.floor(m / 60), minuto: m % 60 };
}

/** El renglón de cada rueda → "HH:MM". */
export function horaDePartes({ hora, minuto }) {
  return horaDeMinutos(hora * 60 + minuto);
}

/**
 * Qué renglón quedó en el medio de la rueda: el desplazamiento dividido el
 * alto de un renglón, redondeado y dentro de la lista. La rueda tiene un
 * renglón vacío arriba, así que el renglón `i` está centrado con `scrollTop`
 * igual a `i` renglones.
 */
export function indiceDeScroll(scrollTop, altoRenglon, cantidad) {
  if (!(altoRenglon > 0) || !(cantidad > 0)) return 0;
  const i = Math.round(scrollTop / altoRenglon);
  return Math.min(cantidad - 1, Math.max(0, i));
}

/**
 * UNA RUEDA. Se monta cada vez que se abre la hoja —el modal cerrado no
 * dibuja nada—, así que arranca posicionada en el valor que tenía el campo.
 */
function Rueda({ rotulo, valores, indice, onIndice }) {
  const ref = useRef(null);
  const altoRenglon = () => ref.current?.querySelector("[data-renglon-rueda]")?.offsetHeight || 0;

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = indice * altoRenglon();
    // Solo al montar: después la mueve el dedo, no el estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alDesplazar = () => {
    const i = indiceDeScroll(ref.current.scrollTop, altoRenglon(), valores.length);
    if (i !== indice) onIndice(i);
  };
  const ir = (i) => {
    const destino = Math.min(valores.length - 1, Math.max(0, i));
    ref.current?.scrollTo({ top: destino * altoRenglon(), behavior: "smooth" });
    onIndice(destino);
  };
  const alTeclear = (e) => {
    const paso = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!paso) return;
    e.preventDefault();
    ir(indice + paso);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={rotulo}
      tabIndex={0}
      onScroll={alDesplazar}
      onKeyDown={alTeclear}
      className="relative flex-1 min-w-0 h-rueda overflow-y-auto overscroll-contain snap-y snap-mandatory"
    >
      <div aria-hidden="true" className="min-h-toque" />
      {valores.map((v, i) => (
        <div
          key={v}
          role="option"
          aria-selected={i === indice}
          data-renglon-rueda
          onClick={() => ir(i)}
          className={`min-h-toque snap-center flex items-center justify-center tabular-nums select-none ${
            i === indice ? "text-xl2 font-semibold sunmi-text-strong" : "text-lg2 sunmi-text-muted"
          }`}
        >
          {v}
        </div>
      ))}
      <div aria-hidden="true" className="min-h-toque" />
    </div>
  );
}

/**
 * Lo de adentro de la hoja: los rótulos, las dos ruedas y el renglón
 * destacado. Separado del modal para poder dibujarlo sin portal.
 */
export function RuedasDeHora({ partes, onPartes, etiqueta }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center text-sm2 sunmi-text-muted">
        <span className="flex-1 text-center">Hora</span>
        <span aria-hidden="true" className="invisible text-xl2">:</span>
        <span className="flex-1 text-center">Minutos</span>
      </div>
      <div className="relative flex items-stretch">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 min-h-toque rounded-xl border sunmi-divider sunmi-fila-seleccionada"
        />
        <Rueda
          rotulo={`Hora, ${etiqueta}`}
          valores={VALORES_HORA}
          indice={partes.hora}
          onIndice={(hora) => onPartes((p) => ({ ...p, hora }))}
        />
        <span aria-hidden="true" className="relative self-center text-xl2 font-semibold">
          :
        </span>
        <Rueda
          rotulo={`Minutos, ${etiqueta}`}
          valores={VALORES_MINUTO}
          indice={partes.minuto}
          onIndice={(minuto) => onPartes((p) => ({ ...p, minuto }))}
        />
      </div>
    </div>
  );
}

export default function SunmiCampoHora({ value, onChange, etiqueta, vaciable = false }) {
  const [abierta, setAbierta] = useState(false);
  const [partes, setPartes] = useState(() => partesDeHora(value));
  const texto = textoDeHora(value);

  const abrir = () => {
    setPartes(partesDeHora(value));
    setAbierta(true);
  };
  // Cancelar y tocar afuera solo cierran: el valor del campo queda como estaba.
  const cerrar = () => setAbierta(false);
  const elegir = (hora) => {
    onChange(hora);
    setAbierta(false);
  };

  return (
    <>
      <button
        type="button"
        className={`sunmi-input w-full min-h-toque text-left tabular-nums ${texto === SIN_HORA ? "sunmi-text-muted" : ""}`}
        aria-label={`${etiqueta}: ${texto === SIN_HORA ? "sin hora" : texto}`}
        aria-haspopup="dialog"
        onClick={abrir}
      >
        {texto}
      </button>

      <SunmiModalLayout
        open={abierta}
        title="Elegir hora"
        color="cyan"
        onClose={cerrar}
        showCloseButton={false}
        maxWidth="max-w-sm"
        forma="hoja-o-centrado"
        espacioCuerpo="gap-3"
        z={9999}
        footer={
          <div className="flex flex-col gap-2 w-full border-t sunmi-divider pt-3">
            <div className="flex gap-2">
              <SunmiButton color="slate" onClick={cerrar} className="flex-1 min-h-toque">
                Cancelar
              </SunmiButton>
              <SunmiButton color="primary" onClick={() => elegir(horaDePartes(partes))} className="flex-1 min-h-toque font-bold">
                Confirmar
              </SunmiButton>
            </div>
            {vaciable && texto !== SIN_HORA && (
              <SunmiButton color="ghost" onClick={() => elegir("")} className="w-full min-h-toque">
                Sin hora
              </SunmiButton>
            )}
          </div>
        }
      >
        <p className="text-sm2 sunmi-text-muted">Formato 24 horas</p>
        <RuedasDeHora partes={partes} onPartes={setPartes} etiqueta={etiqueta} />
      </SunmiModalLayout>
    </>
  );
}
