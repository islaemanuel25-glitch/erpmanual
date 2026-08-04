// Reemplazo de `next/link` para `node --test`. NO entra en el bundle.
//
// POR QUÉ EXISTE
//
// El `Link` real arrastra el router del cliente y no se puede montar fuera de
// Next. Pero un componente que navega no puede quedar sin prueba por eso: el
// vínculo del turno origen al destino es justo el tipo de cosa que se rompe en
// silencio, y comprobarlo leyendo el archivo como texto no ejercita nada.
//
// Se sustituye por el `<a>` que `Link` termina renderizando en el HTML, así la
// prueba verifica el href que ve el usuario. El comportamiento de navegación de
// Next no es responsabilidad de este proyecto.
//
// Vive como archivo del repo —y no como módulo virtual del loader— porque
// necesita resolver `react` desde node_modules, y un especificador con esquema
// propio no tiene scope de paquete.

import { createElement } from "react";

export default function Link({ href, children, ...resto }) {
  return createElement("a", { href: typeof href === "string" ? href : "#", ...resto }, children);
}
