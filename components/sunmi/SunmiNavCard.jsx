"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";

// TARJETA QUE LLEVA A OTRA PANTALLA: icono, nombre, explicación y estado.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// De la portada mobile de Configuración POS, que es la pantalla donde hoy
// funciona. No está escrita adivinando casos futuros: tiene exactamente lo que
// esa pantalla necesita, y por eso el tamaño del redondel, el relleno, el radio
// y el tratamiento del icono viven acá y no repetidos en cada página que quiera
// una lista de secciones.
//
// ── EL ENLACE LO DECIDE LA PIEZA, Y ESO ES EL PUNTO ────────────────────────
//
// `href` presente = la tarjeta navega y muestra el chevron. `href` ausente = no
// navega y NO se dibuja el chevron.
//
// Esa unión no es comodidad: es lo que impide repetir el defecto que ya tuvo
// esta pantalla. Antes la página decidía por su cuenta si envolvía la tarjeta en
// un `Link`, y una sección apagada quedó con la flecha puesta — o sea prometiendo
// una navegación que no existía. Con la decisión adentro de la pieza, una tarjeta
// sin destino no puede quedar con flecha aunque alguien se distraiga.
//
// ── LO QUE NO HACE ─────────────────────────────────────────────────────────
//
// No define colores propios: el fondo y el borde los pone `SunmiCard` desde el
// theme, y el redondel usa las clases semánticas del kit. No hay ninguna paleta
// paralela acá.

export default function SunmiNavCard({
  icon,
  insignia = null,
  label,
  descripcion,
  estado = null,
  href = null,
  atenuado = false,
  className = "",
}) {
  // JSX trata un identificador en minúscula como etiqueta HTML, así que un
  // componente recibido por prop hay que renombrarlo con mayúscula. Se hace ACÁ
  // y no en la firma a propósito: renombrándolo en el destructuring, el nombre
  // `icon` no vuelve a aparecer en el cuerpo, y el candado del kit que busca
  // props declarados y nunca usados lo cuenta como muerto. Lo encontró él, no yo.
  const Icono = icon;
  const navega = Boolean(href);

  const tarjeta = (
    <SunmiCard className={`flex items-center gap-3 p-4 ${atenuado ? "opacity-60" : ""} ${className}`}>
      {/* ── EL REDONDEL ES UNO SOLO, LLEVE UN ICONO O DOS LETRAS ─────────────
          Configuración POS pone un icono; Cobros pone las iniciales del medio,
          porque el nombre lo escribe cada local y no hay icono que le
          corresponda. Es el ÚNICO punto donde las dos pantallas difieren, así
          que se resuelve adentro de la pieza y no duplicando la tarjeta: el
          tamaño, el radio y el color del redondel siguen decidiéndose en un
          solo lugar. */}
      {(insignia || Icono) && (
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${
            atenuado ? "sunmi-badge-muted" : "sunmi-badge-accent"
          }`}
        >
          {insignia ?? <Icono className="size-6" aria-hidden="true" />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold sunmi-text-strong">{label}</h3>
        {descripcion && (
          <p className="mt-1 text-sm leading-snug sunmi-text-muted">{descripcion}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {estado && (
          <span className="sunmi-badge-muted rounded-full px-3 py-1 text-xs">{estado}</span>
        )}
        {/* Sin destino no hay flecha: una flecha que no lleva a ningún lado
            promete algo que no pasa cuando la tocás. */}
        {navega && <ChevronRight className="size-5 sunmi-text-muted" aria-hidden="true" />}
      </div>
    </SunmiCard>
  );

  return navega ? (
    <Link href={href} className="block">
      {tarjeta}
    </Link>
  ) : (
    tarjeta
  );
}
