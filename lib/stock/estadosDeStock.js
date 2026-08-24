// lib/stock/estadosDeStock.js
//
// LOS CUATRO ESTADOS DE "ESTADO DEL STOCK", EN UN SOLO LUGAR.
//
// ── POR QUÉ ESTO EXISTE Y NO ESTÁ ESCRITO EN CADA RUTA ────────────────────
//
// De acá cuelgan DOS consumidores que tienen que decir lo mismo:
//
//   · `/api/stock_locales/resumen`, que CUENTA cuántos hay de cada uno;
//   · `/api/stock_locales/listar`, que FILTRA el listado por uno de ellos.
//
// Si cada uno escribiera su propia condición, el número de la card y el total
// del listado podrían separarse sin que nada fallara: la card diría 12 y la
// lista mostraría 9, las dos con cara de estar bien. Es el mismo motivo por el
// que los controles de Productos tienen su clasificación en un módulo aparte.
//
// Acá la condición se escribe UNA vez y las dos consultas la piden.
//
// ── POR QUÉ SON FRAGMENTOS SQL Y NO PREDICADOS DE JAVASCRIPT ──────────────
//
// Porque contar en el navegador o traer el catálogo entero para clasificarlo en
// memoria es exactamente lo que hay que evitar: son miles de filas por local. La
// pregunta se contesta en PostgreSQL, con agregación, y vuelve un número.
//
// El filtro `faltantes` que ya existía traía el conjunto COMPLETO a memoria antes
// de paginar —lo dice el propio comentario en `listar/route.js`— y ese es el
// costo que esta tanda no puede multiplicar por cuatro.
//
// ── LOS ESTADOS SE SUPERPONEN A PROPÓSITO ─────────────────────────────────
//
// No son una partición del catálogo: son cuatro controles de revisión. Un
// producto sin stock y con límites configurados está en "Sin stock" Y en "Bajo
// mínimo" al mismo tiempo, y las dos cards tienen razón. Sumar los cuatro
// números no da el total del catálogo, y no tiene por qué.

/** Los ids que viajan por la URL. Se validan contra esto, no contra memoria. */
export const ESTADO_STOCK = {
  BAJO_MINIMO: "bajo-minimo",
  SIN_STOCK: "sin-stock",
  LIMITES_SIN_AJUSTAR: "limites-sin-ajustar",
  SOBRE_MAXIMO: "sobre-maximo",
};

/**
 * Las cuatro cards, en el orden aprobado del diseño (2×2).
 *
 * `rol` es SEMÁNTICO y no un color —`warning` es "hay que mirarlo", `danger` es
 * "esto ya duele"—, igual que en los controles de Productos, para que el
 * componente no tenga que decidir paleta.
 *
 * `detalleSano` es lo que dice la card cuando el conteo es cero. En cero, "Bajo
 * mínimo · reponer" sobre un 0 se sigue leyendo como el nombre de un problema y
 * hay que pararse a pensar si el 0 es "ninguno" o "no se pudo calcular". "todo
 * repuesto" contesta solo. Es la misma decisión que ya se tomó en Productos.
 */
export const ESTADOS = [
  {
    id: ESTADO_STOCK.BAJO_MINIMO,
    titulo: "Bajo mínimo",
    detalle: "reponer",
    detalleSano: "todo repuesto",
    rol: "warning",
  },
  {
    id: ESTADO_STOCK.SIN_STOCK,
    titulo: "Sin stock",
    detalle: "sin unidades",
    detalleSano: "todo con stock",
    rol: "danger",
  },
  {
    id: ESTADO_STOCK.LIMITES_SIN_AJUSTAR,
    titulo: "Límites sin ajustar",
    detalle: "configurar",
    detalleSano: "todos configurados",
    rol: "warning",
  },
  {
    id: ESTADO_STOCK.SOBRE_MAXIMO,
    titulo: "Sobre máximo",
    detalle: "revisar",
    detalleSano: "sin excedentes",
    rol: "warning",
  },
];

/** Los ids válidos, para rechazar cualquier cosa que llegue por la URL. */
export const IDS_ESTADO = ESTADOS.map((e) => e.id);

export function esEstadoValido(id) {
  return typeof id === "string" && IDS_ESTADO.includes(id);
}

/**
 * LA CONDICIÓN DE CADA ESTADO, EN SQL, SOBRE UNA FILA DE `StockLocal`.
 *
 * ── POR QUÉ `limitesConfiguradosAt` Y NO `stockMin > 0` ───────────────────
 *
 * Porque un límite en 0 es un valor CONFIGURADO válido —lo decidió Emanuel—, y
 * `stockMin = 0` no distingue "el encargado puso cero a propósito" de "esta fila
 * la creó el listado al abrir la pantalla".
 *
 * Y esa confusión no es teórica: cinco rutas creaban filas con `stockMin: 0,
 * stockMax: 0` mientras otras tres las creaban en `null`. Medido en `erpazul_dev`
 * antes de esta tanda: 3.820 filas en null, 126 en 0/0 —de las cuales **una**
 * tenía auditoría de LIMITES, o sea un cero deliberado— y 62 con algún valor
 * positivo. Sin una marca propia, esas 126 eran indistinguibles entre sí.
 *
 * `limitesConfiguradosAt` es un HECHO propio y no derivado: se sella cuando
 * alguien guarda límites, y nada más lo escribe. Es la regla 3 del proyecto —un
 * hecho, una columna— y es lo que hace que "sin ajustar" se pueda contestar sin
 * adivinar.
 *
 * ── EL ALIAS ──────────────────────────────────────────────────────────────
 *
 * Cada fragmento se escribe sobre un alias que el consumidor pasa, para que la
 * misma condición sirva en un `COUNT` agregado y en un `WHERE` de listado sin
 * reescribirse. Si el alias cambiara en una sola de las dos consultas, el
 * fragmento dejaría de compilar en vez de contestar distinto — que es el modo de
 * fallar que queremos.
 *
 * @param {string} alias  el alias de la tabla `StockLocal` en la consulta
 * @returns {Record<string, string>} id de estado → fragmento SQL booleano
 */
export function condicionesSql(alias = "sl") {
  const a = String(alias).replace(/[^A-Za-z0-9_]/g, "");
  if (!a) throw new Error("alias de tabla inválido para las condiciones de stock");

  // ── SE ESCRIBEN PARA UN LEFT JOIN, Y NO ES UN DETALLE ────────────────────
  //
  // El universo NO es `StockLocal`: es `ProductoLocal`, que es lo que el listado
  // muestra. Un producto puede no tener fila de stock todavía —recién creado, o
  // nunca movido— y sigue siendo parte del catálogo de la ubicación.
  //
  // Si el conteo mirara `StockLocal` a secas, se separaría del listado por los
  // dos lados a la vez: contaría de MENOS los productos sin fila, y contaría de
  // MÁS las filas de productos inactivos o de combos, que el listado excluye. La
  // card diría un número y la lista mostraría otro, las dos con cara de bien.
  //
  // Por eso cada condición está escrita para sobrevivir a que todas las columnas
  // de `sl` vengan en NULL, que es lo que pasa cuando no hay fila.
  return {
    // Reusa la regla de "faltantes" que ya existía —cantidad por debajo del
    // mínimo— y le agrega lo único que le faltaba: que el mínimo SIGNIFIQUE
    // algo. Antes, con los límites en null, `mapItem` los aplanaba a 0 y
    // "faltante" quedaba en `cantidad < 0`, o sea solo los negativos.
    //
    // Sin fila de stock no hay límites configurados, así que el `IS NOT NULL`
    // ya deja afuera ese caso solo.
    [ESTADO_STOCK.BAJO_MINIMO]:
      `${a}."limitesConfiguradosAt" IS NOT NULL AND ${a}."stockMin" IS NOT NULL ` +
      `AND ${a}."cantidad" < ${a}."stockMin"`,

    // Exactamente cero, y SIN fila también cuenta: no tener fila de stock es no
    // tener unidades. El `COALESCE` es lo que lo incluye; sin él, un producto
    // recién creado quedaba fuera de "Sin stock" en el conteo y adentro en el
    // listado.
    //
    // El negativo NO entra acá: tiene su propio estado en el selector y su propia
    // alerta en la ficha. Un negativo con límites sí puede caer en "Bajo mínimo",
    // que es donde corresponde mirarlo.
    [ESTADO_STOCK.SIN_STOCK]: `COALESCE(${a}."cantidad", 0) = 0`,

    // La única fuente de verdad. No mira los valores: mira si alguien los ajustó.
    // Sin fila, la columna es NULL y el producto entra — que es correcto: nunca
    // se le configuró nada.
    [ESTADO_STOCK.LIMITES_SIN_AJUSTAR]: `${a}."limitesConfiguradosAt" IS NULL`,

    [ESTADO_STOCK.SOBRE_MAXIMO]:
      `${a}."limitesConfiguradosAt" IS NOT NULL AND ${a}."stockMax" IS NOT NULL ` +
      `AND ${a}."cantidad" > ${a}."stockMax"`,
  };
}

/**
 * LA MISMA CONDICIÓN, PARA EL `where` DE PRISMA — CUANDO SE PUEDE.
 *
 * ── POR QUÉ DOS DE LOS CUATRO NO SE PUEDEN ───────────────────────────────
 *
 * `cantidad < stockMin` compara DOS COLUMNAS de la misma fila, y el `where` de
 * Prisma no lo expresa: solo compara una columna contra un valor. Ése es el
 * motivo real por el que el filtro `faltantes` que ya existía traía el conjunto
 * completo a memoria y recortaba en JavaScript.
 *
 * Los otros dos sí se pueden, y conviene que se hagan por Prisma: quedan dentro
 * de la misma consulta paginada, sin un `IN` con miles de ids.
 *
 * ── Y POR QUÉ EL `IN` NO ES UN PROBLEMA EN LOS QUE FALTAN ────────────────
 *
 * Porque el conjunto es chico POR DEFINICIÓN: los productos por debajo del
 * mínimo o por encima del máximo son la excepción, no el catálogo. El caso
 * grande —"límites sin ajustar", que hoy son 3.945 de 4.008— es justamente uno
 * de los que Prisma resuelve solo.
 *
 * Si algún día "bajo mínimo" fuera medio catálogo, el `IN` deja de servir y hay
 * que pasar el listado entero a SQL. Queda dicho acá para que se decida mirando
 * el número y no descubriéndolo por lentitud.
 *
 * @returns {Record<string, {prisma: object}|{necesitaSql: true}>}
 */
export function condicionesPrisma() {
  return {
    // Comparan columna contra columna: van por SQL.
    [ESTADO_STOCK.BAJO_MINIMO]: { necesitaSql: true },
    [ESTADO_STOCK.SOBRE_MAXIMO]: { necesitaSql: true },

    // Éstos comparan una columna contra un valor y entran en la consulta
    // paginada sin traer nada de más.
    [ESTADO_STOCK.SIN_STOCK]: {
      // `none` incluye al producto que todavía no tiene fila de stock: no tener
      // fila es no tener unidades. Sin esa rama, un producto recién creado
      // quedaría fuera de "Sin stock" y la card contaría de menos.
      prisma: { OR: [{ stock: { none: {} } }, { stock: { some: { cantidad: 0 } } }] },
    },
    [ESTADO_STOCK.LIMITES_SIN_AJUSTAR]: {
      prisma: {
        OR: [
          { stock: { none: {} } },
          { stock: { some: { limitesConfiguradosAt: null } } },
        ],
      },
    },
  };
}

/**
 * La misma decisión, sobre una fila ya leída.
 *
 * No duplica la de arriba: existe porque la ficha y los candados necesitan
 * preguntar por UNA fila que ya tienen en la mano, y bajar a SQL para eso sería
 * absurdo. Las dos se prueban contra los mismos casos en
 * `estadosDeStock.test.mjs`, y ahí es donde se comprueba que no se separaron.
 *
 * @param {{cantidad:number, stockMin:number|null, stockMax:number|null,
 *          limitesConfigurados:boolean}} fila
 */
export function estadosDeLaFila(fila) {
  const cantidad = Number(fila?.cantidad ?? 0);
  const configurados = fila?.limitesConfigurados === true;
  const min = fila?.stockMin ?? null;
  const max = fila?.stockMax ?? null;
  const salida = [];

  if (configurados && min !== null && cantidad < Number(min)) salida.push(ESTADO_STOCK.BAJO_MINIMO);
  if (cantidad === 0) salida.push(ESTADO_STOCK.SIN_STOCK);
  if (!configurados) salida.push(ESTADO_STOCK.LIMITES_SIN_AJUSTAR);
  if (configurados && max !== null && cantidad > Number(max)) salida.push(ESTADO_STOCK.SOBRE_MAXIMO);

  return salida;
}
