// app/modulos/transferencias/corte-de-semana/page.jsx
//
// LA PANTALLA VIEJA DE "CORTE DE SEMANA": HOY SOLO REDIRIGE.
//
// La semana dejó de ser un acuerdo de Transferencias: es de la ubicación, y se
// configura en Configuración → Semana operativa, sobre la ubicación en la que se
// opera. La ruta se conserva para que un enlace guardado, un historial o un
// atajo viejo no caigan en un 404: llevan a la pantalla nueva.
//
// `redirect` corre en el servidor antes de dibujar nada, así que no hay un
// parpadeo de la pantalla vieja. La API vieja (`/api/transferencias/acuerdos`)
// sigue viva hasta una limpieza posterior; esta pantalla ya no la llama.

import { redirect } from "next/navigation";

import { RUTA_SEMANA_OPERATIVA } from "@/lib/semanaOperativa/rutas";

export default function CorteDeSemanaRedirige() {
  redirect(RUTA_SEMANA_OPERATIVA);
}
