"use client";

// PAQUETE 2 DE UNA LISTA: "PUEDEN SER DE DAB" (Emanuel, 2026-10-24).
//
// Es la MISMA pantalla de la revisión con el otro paquete: comparten la barra
// de «Para aplicar» —que cuenta los dos paquetes—, «✓ Aplicar», «Usar»,
// «Corregir» y las hojas. Qué cambia y por qué, en `../page.jsx` (`PAQUETE`).

import ResultadoDeListaPage, { PAQUETE } from "../page";

export default function PuedenSerDeLaListaPage() {
  return <ResultadoDeListaPage paquete={PAQUETE.PUEDEN_SER} />;
}
