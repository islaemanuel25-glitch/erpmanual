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
// No define ningún color propio. El fondo sale de `sunmi-btn-accent-soft`, el
// redondel de `sunmi-badge-accent` y los textos de las clases semánticas del
// kit. No hay hex, ni rgb, ni clases de color crudas de Tailwind.

export default function SunmiAviso({ icon, titulo, children, className = "" }) {
  // JSX trata un identificador en minúscula como etiqueta HTML, así que un
  // componente recibido por prop hay que renombrarlo con mayúscula. Se hace acá
  // y no en la firma para que el nombre `icon` siga apareciendo en el cuerpo:
  // el candado del kit que busca props declarados y nunca usados mira eso.
  const Icono = icon;

  return (
    <div className={`sunmi-btn-accent-soft flex items-start gap-3 rounded-2xl p-4 ${className}`}>
      {Icono && (
        <span className="sunmi-badge-accent flex size-10 shrink-0 items-center justify-center rounded-full">
          <Icono className="size-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        {titulo && <p className="text-sm font-semibold sunmi-text-accent">{titulo}</p>}
        <p className="mt-1 text-sm leading-snug sunmi-text-muted">{children}</p>
      </div>
    </div>
  );
}
