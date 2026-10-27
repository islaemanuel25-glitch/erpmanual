// La grilla del panel de herramientas en el celular (abajo de `md`).
//
// Tres por fila y cuatro filas: doce por página. Con doce o menos hay una sola
// página y no se dibujan puntitos; con más, carrusel que se pasa deslizando.
//
// Las clases de Tailwind de `SubmenuPanel` —`grid-cols-3`, `grid-rows-4`— van
// escritas literales porque Tailwind no ve una clase armada en tiempo de
// ejecución; el candado comprueba que coincidan con estas constantes.

export const COLUMNAS_MOVIL = 3;
export const FILAS_MOVIL = 4;
export const POR_PAGINA_MOVIL = COLUMNAS_MOVIL * FILAS_MOVIL;

/** Parte las herramientas en páginas de doce, en el mismo orden. */
export function paginarHerramientas(items) {
  const lista = items || [];
  if (lista.length === 0) return [[]];
  const paginas = [];
  for (let i = 0; i < lista.length; i += POR_PAGINA_MOVIL) {
    paginas.push(lista.slice(i, i + POR_PAGINA_MOVIL));
  }
  return paginas;
}

/** Los puntitos —y el deslizamiento— solo existen con más de una página. */
export function llevaPuntitos(paginas) {
  return paginas.length > 1;
}
