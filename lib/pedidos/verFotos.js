// lib/pedidos/verFotos.js
//
// "VER FOTOS" DE PEDIDOS: arranca apagado y el celular recuerda lo elegido.
// Sin nada guardado, o si no se puede leer, apagado.
//
// Salió de `app/modulos/pedidos/page.jsx` el 2026-10-22, cuando el detalle de
// un pedido anterior (`app/modulos/pedidos/historial/[id]/page.jsx`) tuvo que
// mostrar las fotos según lo elegido en Pedidos: la misma clave, leída igual.

export const CLAVE_VER_FOTOS = "pedidos_ver_fotos";

export function fotosGuardadas() {
  try {
    return localStorage.getItem(CLAVE_VER_FOTOS) === "1";
  } catch {
    return false;
  }
}
