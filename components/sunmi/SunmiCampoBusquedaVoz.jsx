"use client";

// EL CAMPO DE BÚSQUEDA DE PRODUCTOS DEL ERP, CON SU BOTÓN DE VOZ.
//
// ── POR QUÉ EXISTE, Y POR QUÉ ES UNA SOLA DEFINICIÓN ───────────────────────
//
// Buscar un producto es la misma acción en el POS y en el catálogo, y hasta
// ahora eran dos campos distintos: el del POS con borde de acento, ícono a la
// izquierda y micrófono; el de Productos, un `SunmiInput` pelado. La persona que
// vende y la que carga precios son la misma, y en un teléfono la diferencia se
// nota — una pantalla escucha y la otra no.
//
// Esta pieza SALIÓ DEL POS TAL CUAL ESTABA, no se escribió adivinando: las
// clases, el tamaño del ícono, la posición del micrófono y el texto de
// "Escuchando..." son los que ese componente ya tenía andando. La prueba de que
// la extracción salió bien no es que compile: es que la pantalla de donde salió
// quede IDÉNTICA, comparada píxel a píxel.
//
// ── LO QUE NO HACE, Y ES A PROPÓSITO ──────────────────────────────────────
//
// No busca. No sabe qué es un producto, no llama a ninguna ruta y no conoce el
// escáner. Eso es de cada pantalla y es justamente lo que las diferencia: el POS
// auto-agrega con un código exacto y Productos filtra un listado. Meter la
// búsqueda acá adentro habría obligado a una pieza con dos modos, que es la
// forma en que una pieza compartida se vuelve inusable.
//
// ── LA VOZ NO ES LO MISMO QUE ESCRIBIR, Y POR ESO SON DOS AVISOS ──────────
//
// `onChange` es teclear. `onVoz` es dictar. Se ven iguales desde afuera y no lo
// son: el POS le manda `fromVoice=true` al servidor para que le devuelva cómo
// interpretó la transcripción, y ese dato solo tiene sentido cuando la persona
// habló. Una pantalla que quiera tratar la voz exactamente igual que el teclado
// —Productos— pasa la misma función en los dos, y queda dicho en el llamado.

import { useRef, useState } from "react";
import { Search } from "lucide-react";

import SunmiInput from "@/components/sunmi/SunmiInput";

/** El idioma del reconocimiento. Está acá y no en cada pantalla por lo mismo
 *  que el resto: dos pantallas del mismo ERP no pueden escuchar en idiomas
 *  distintos. */
export const IDIOMA_VOZ = "es-AR";

/** Lo que se ve mientras el micrófono está abierto. */
export const TEXTO_ESCUCHANDO = "Escuchando...";

/** Si el navegador sabe escuchar. Fuera del componente para que las pantallas
 *  puedan preguntarlo sin montarlo. */
export function soportaVoz() {
  return (
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export default function SunmiCampoBusquedaVoz({
  value,
  onChange,
  onVoz = null,
  inputRef = null,
  placeholder = "",
  id = undefined,
  ariaLabel = undefined,
  onKeyDown = undefined,
  autoFocus = false,
  className = "",
  // Avisa cuándo el micrófono se abre y se cierra.
  //
  // No es un adorno: el POS apaga DOS renglones mientras se escucha —el de "no
  // se encontraron productos" y el de cómo interpretó lo dictado—, y esos
  // renglones son suyos, no de esta pieza. Sin este aviso, extraer el estado acá
  // adentro los habría dejado apareciendo arriba del "Escuchando...", que es un
  // cambio de comportamiento que ningún candado del kit habría visto.
  onEscuchandoChange = null,
  // Ranura para el aviso que va ENTRE el campo y "Escuchando...".
  //
  // Existe por una razón chica y concreta: en el POS el orden de los renglones
  // es campo, "Buscando...", "Escuchando...", y `escuchando` es estado de esta
  // pieza mientras que `loading` es de la pantalla. Sin la ranura, extraer el
  // segundo renglón acá adentro daba vuelta el orden de los dos. Se cruzan poco
  // —dictar apaga el micrófono antes de empezar a buscar—, pero "poco" no es
  // "nunca", y la regla de la extracción es que la pantalla de origen quede
  // idéntica, no parecida.
  avisoDeEstado = null,
}) {
  const refPropia = useRef(null);
  const ref = inputRef || refPropia;
  const [escuchando, setEscuchandoCrudo] = useState(false);
  const reconocimientoRef = useRef(null);

  // Un solo lugar cambia el estado, así el aviso hacia afuera no se puede
  // olvidar en una de las cinco ramas que lo apagan.
  const setEscuchando = (v) => {
    setEscuchandoCrudo(v);
    onEscuchandoChange?.(v);
  };

  const puedeEscuchar = soportaVoz();

  const iniciarVoz = () => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) return;

    if (escuchando && reconocimientoRef.current) {
      reconocimientoRef.current.stop();
      setEscuchando(false);
      return;
    }

    const reconocimiento = new SpeechRecognition();
    reconocimiento.lang = IDIOMA_VOZ;
    reconocimiento.continuous = false;
    reconocimiento.interimResults = false;

    reconocimiento.onstart = () => setEscuchando(true);
    reconocimiento.onresult = (evento) => {
      const transcripcion = evento.results[0][0].transcript;
      (onVoz || onChange)?.(transcripcion);
      setEscuchando(false);
    };
    reconocimiento.onerror = () => setEscuchando(false);
    reconocimiento.onend = () => setEscuchando(false);

    reconocimientoRef.current = reconocimiento;
    reconocimiento.start();
  };

  return (
    <>
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
          style={{ color: "var(--pos-link)" }}
        />
        <SunmiInput
          ref={ref}
          id={id}
          type="text"
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          className={`w-full text-base min-h-12 lg:min-h-10 !py-2 !pl-9 !border-2 pulse-neon ${
            puedeEscuchar ? "!pr-12" : ""
          } ${className}`}
          style={{ borderColor: "var(--pos-link)" }}
          autoFocus={autoFocus}
          // Sin historial/autocompletado nativo del navegador (no afecta el
          // desplegable de productos del ERP, que es propio).
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {puedeEscuchar && (
          <button
            onClick={iniciarVoz}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded transition-colors ${
              escuchando ? "sunmi-btn-red animate-pulse" : "pos-control"
            }`}
            title="Buscar por voz"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        )}
      </div>

      {avisoDeEstado}

      {escuchando && (
        <div className="text-xs pos-text-danger mt-2 animate-pulse">
          {TEXTO_ESCUCHANDO}
        </div>
      )}
    </>
  );
}
