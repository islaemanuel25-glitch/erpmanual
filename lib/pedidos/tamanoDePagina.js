// lib/pedidos/tamanoDePagina.js
//
// CUÁNTOS PRODUCTOS POR PÁGINA TRAE EL CATÁLOGO DE PEDIDOS.
//
// Una sola definición para los dos lados: la ruta (`/api/pedidos/catalogo`)
// valida con esto lo que le llega, y la pantalla (`app/modulos/pedidos`) ofrece
// estas mismas opciones y arranca en el mismo número. Si el default viviera dos
// veces, el día que cambie uno la pantalla diría "viendo 1–50" sobre una página
// de otro tamaño.
//
// La ruta tenía `PAGE_SIZE = 50` fijo y no leía lo que mandaba la pantalla: el
// selector de la pantalla vieja nunca cambió nada (2026-10-22).
//
// Mismas tres opciones que `app/api/productos/listar/route.js`, que tiene la
// suya escrita adentro y sin exportar.
//
// Puro y sin imports: se corre bajo `node --test`.

/** Las opciones que se pueden pedir. */
export const TAMANOS_DE_PAGINA_CATALOGO = Object.freeze([25, 50, 100]);

/** Lo que da cuando no se pide nada o se pide algo que no está en la lista. */
export const TAMANO_DE_PAGINA_CATALOGO = 50;

/**
 * El tamaño de página que corresponde a lo pedido: 25, 50 o 100 tal cual, y
 * cualquier otra cosa —nada, un texto, 30, "50abc", 0, -25— da 50.
 *
 * @param {unknown} valor lo que vino en `pageSize`, normalmente un string o null.
 * @returns {number}
 */
export function tamanoDePaginaCatalogo(valor) {
  if (valor === null || valor === undefined || valor === "") return TAMANO_DE_PAGINA_CATALOGO;
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return TAMANO_DE_PAGINA_CATALOGO;
  const n = Number(texto);
  return TAMANOS_DE_PAGINA_CATALOGO.includes(n) ? n : TAMANO_DE_PAGINA_CATALOGO;
}
