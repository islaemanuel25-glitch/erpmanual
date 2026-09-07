"use client";

// UN AVISO COMPACTO: icono en redondel, un rótulo corto y una explicación.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// Del "Tip" de la portada de Configuración POS, que es donde hoy funciona. Se
// saca tal cual está: mismo fondo suave, mismo redondel, mismos tamaños. La
// prueba de que la extracción salió bien es que esa pantalla quede idéntica.
//
// El segundo consumidor es Cobros, que necesita el mismo bloque para avisar que
// el local todavía usa la configuración por defecto. Dos pantallas con el mismo
// aviso escrito dos veces es como empiezan a separarse: una gana un borde, la
// otra cambia el tamaño de la letra, y nadie se entera hasta verlas juntas.
//
// ── LO QUE NO HACE ─────────────────────────────────────────────────────────
//
// No define ningún color propio. El fondo sale de `sunmi-btn-<tono>-soft`, el
// redondel de `sunmi-badge-<tono>` y los textos de las clases semánticas del
// kit. No hay hex, ni rgb, ni clases de color crudas de Tailwind.
//
// ── EL TONO, Y POR QUÉ NO ES UN SISTEMA NUEVO ──────────────────────────────
//
// Un aviso de que algo salió bien y uno de que algo falló no se pueden
// distinguir con el tono de acento. Por eso las pantallas los escribían a mano
// —`bg-green-500/10 text-green-400` contra `bg-red-500/10 text-red-400`—, que es
// color crudo de Tailwind y no sigue ningún tema.
//
// `tono` elige entre TRES FAMILIAS QUE YA EXISTEN y están parametrizadas por la
// misma variable: `sunmi-btn-X-soft`, `sunmi-badge-X` y `sunmi-text-X`. Lo único
// que hubo que agregar son las cuatro clases que a esas familias les faltaban
// —los `-soft` de success, danger y warning, y el badge de warning—, con la
// fórmula idéntica a la de `accent`. Ninguna variable de tema es nueva:
// `--pos-success`, `--pos-danger` y `--pos-warning` ya están definidas en los
// catorce scopes, igual que `--pos-accent`.
//
// `neutral` es el default y repite exactamente las clases de antes, así que un
// `SunmiAviso` sin `tono` se ve igual que siempre. Eso no es una promesa: lo
// comprueba `sunmiAviso.test.mjs` comparando el markup contra el literal.

/**
 * Las tres clases de cada tono. La del cuerpo cambia con el tono salvo en
 * `neutral`, que conserva `sunmi-text-muted` para no mover lo que ya existe: en
 * un aviso de error el texto en rojo ES la señal, y en el neutral la señal es el
 * título de acento y el cuerpo tiene que quedar tranquilo.
 */
const TONOS = {
  neutral: { caja: "sunmi-btn-accent-soft", redondel: "sunmi-badge-accent", texto: "sunmi-text-accent", cuerpo: "sunmi-text-muted" },
  success: { caja: "sunmi-btn-success-soft", redondel: "sunmi-badge-success", texto: "sunmi-text-success", cuerpo: "sunmi-text-success" },
  danger: { caja: "sunmi-btn-danger-soft", redondel: "sunmi-badge-danger", texto: "sunmi-text-danger", cuerpo: "sunmi-text-danger" },
  warning: { caja: "sunmi-btn-warning-soft", redondel: "sunmi-badge-warning", texto: "sunmi-text-warning", cuerpo: "sunmi-text-warning" },
};

export default function SunmiAviso({ icon, titulo, children, tono = "neutral", className = "" }) {
  // Un tono desconocido cae en `neutral` en vez de dibujar sin clase: una caja
  // sin fondo se lee como un defecto de maquetado y no como un valor mal escrito.
  const t = TONOS[tono] ?? TONOS.neutral;

  // JSX trata un identificador en minúscula como etiqueta HTML, así que un
  // componente recibido por prop hay que renombrarlo con mayúscula. Se hace acá
  // y no en la firma para que el nombre `icon` siga apareciendo en el cuerpo:
  // el candado del kit que busca props declarados y nunca usados mira eso.
  const Icono = icon;

  return (
    <div className={`${t.caja} flex items-start gap-3 rounded-2xl p-4 ${className}`}>
      {Icono && (
        <span className={`${t.redondel} flex size-10 shrink-0 items-center justify-center rounded-full`}>
          <Icono className="size-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        {titulo && <p className={`text-sm font-semibold ${t.texto}`}>{titulo}</p>}
        <p className={`mt-1 text-sm leading-snug ${t.cuerpo}`}>{children}</p>
      </div>
    </div>
  );
}
