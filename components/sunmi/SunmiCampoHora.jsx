"use client";

// components/sunmi/SunmiCampoHora.jsx
//
// UNA HORA "HH:MM" DE 24 HORAS, ELEGIDA CON PIEZAS DEL KIT Y NO CON EL RELOJ
// DEL NAVEGADOR.
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
// ── DE QUÉ ESTÁ HECHA ─────────────────────────────────────────────────────
//
// De dos piezas que ya existían: la hoja de `SunmiModalLayout`
// (`hoja-o-centrado`, la de los modales de caja: pegada abajo en el teléfono)
// y dos `SunmiCampoCantidad` —hora de 00 a 23, minutos de 00 a 59, de a uno—.
// Sin reloj, sin AM/PM y sin pasos de 5 o 15: cualquier "HH:MM" que acepte el
// servidor se puede elegir. El número también se tipea, y nunca pasa del tope:
// con la caja seleccionada, "7" da "07" y "1" seguido de "8" da "18".
//
// Salió de Configuración → POS → Turnos operativos, que es la única pantalla
// que hoy pide una hora del día. El formato lo leen y escriben las mismas
// funciones que usa la regla del turno, `minutosDeHora` y `horaDeMinutos`: no
// hay un segundo parser de "HH:MM" al lado.
//
// ── LOS PROPS ─────────────────────────────────────────────────────────────
//
//   value     "HH:MM", o vacío/null si todavía no tiene.
//   onChange  recibe "HH:MM", o "" si se eligió quitarla.
//   etiqueta  el título de la hoja y el `aria-label` del campo.
//   vaciable  muestra «Sin hora» en la hoja. Los horarios de un turno que ya
//             existe se pueden quitar —el servidor decide si se acepta—; el de
//             uno nuevo no, porque nace activo y lo necesita.

import { useState } from "react";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import { horaDeMinutos, minutosDeHora } from "@/lib/caja/turnoOperativo";

/** Lo que muestra el campo cerrado cuando no hay hora. */
export const SIN_HORA = "--:--";

const TOPE_HORA = 23;
const TOPE_MINUTO = 59;

const dosDigitos = (n) => String(n).padStart(2, "0");

/** Lo que muestra el campo cerrado: el valor "HH:MM" tal cual, o `SIN_HORA`. */
export function textoDeHora(valor) {
  return minutosDeHora(valor) == null ? SIN_HORA : valor;
}

/** "HH:MM" → las dos cajas de la hoja, "HH" y "MM". Sin hora, "00" y "00". */
export function partesDeHora(valor) {
  const m = minutosDeHora(valor);
  if (m == null) return { hora: "00", minuto: "00" };
  return { hora: dosDigitos(Math.floor(m / 60)), minuto: dosDigitos(m % 60) };
}

/**
 * Lo que dejó el −/+ o el teclado en una caja, de vuelta a dos dígitos entre
 * 00 y el tope. Mandan los dos últimos dígitos: así tipear sobre "06" corre
 * los números en vez de pasarse de largo.
 */
export function digitosDe(bruto, tope) {
  const d = String(bruto ?? "").replace(/\D/g, "").slice(-2);
  const n = d === "" ? 0 : Number(d);
  return dosDigitos(Math.min(tope, Math.max(0, n)));
}

/** Las dos cajas → "HH:MM". */
export function horaDePartes(hora, minuto) {
  return horaDeMinutos(Number(hora) * 60 + Number(minuto));
}

function Caja({ rotulo, valor, onCambiar, tope, etiqueta }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm3 sunmi-text-muted">{rotulo}</span>
      <SunmiCampoCantidad
        valor={valor}
        onCambiar={(v) => onCambiar(digitosDe(v, tope))}
        etiqueta={`${rotulo}, ${etiqueta}`}
        minimo={0}
        maximo={tope}
        claseMarco="w-14"
        // 16 px: con menos, el teléfono agranda la página al enfocar el campo.
        claseInput="text-md2 tabular-nums"
      />
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
        title={etiqueta}
        color="cyan"
        onClose={() => setAbierta(false)}
        maxWidth="max-w-sm"
        forma="hoja-o-centrado"
        espacioCuerpo="mt-2 gap-3"
        z={9999}
        footer={
          <div className="flex flex-col gap-2 w-full">
            <div className="flex gap-2">
              <SunmiButton color="slate" onClick={() => setAbierta(false)} className="flex-1 min-h-toque">
                Cancelar
              </SunmiButton>
              <SunmiButton color="primary" onClick={() => elegir(horaDePartes(partes.hora, partes.minuto))} className="flex-1 min-h-toque font-bold">
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
        <p className="text-xl2 font-semibold text-center tabular-nums">{horaDePartes(partes.hora, partes.minuto)}</p>
        <Caja rotulo="Hora" valor={partes.hora} tope={TOPE_HORA} etiqueta={etiqueta} onCambiar={(hora) => setPartes((p) => ({ ...p, hora }))} />
        <Caja rotulo="Minutos" valor={partes.minuto} tope={TOPE_MINUTO} etiqueta={etiqueta} onCambiar={(minuto) => setPartes((p) => ({ ...p, minuto }))} />
      </SunmiModalLayout>
    </>
  );
}
