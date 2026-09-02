// Candados de la clasificación por presentación.
//
// ── QUÉ DEFIENDEN ───────────────────────────────────────────────────────────
//
// Dos cosas que se rompen distinto:
//
//   1. Que las ocho categorías digan lo que el ERP ya dice. La de venta tiene que
//      coincidir con lo que el POS cobra —por eso sale de `escalaDeVentaDe` y no
//      de una regla nueva— y la de compra con lo que el formulario de producto
//      escribe. Una clasificación "razonable" pero distinta de la del motor sería
//      una pantalla que contradice al mostrador sin que nada falle.
//
//   2. Que el CONTADOR y el FILTRO usen la misma función. Es lo mismo que ya
//      defiende `controlesCalidad`: con dos predicados escritos al lado, el día
//      que uno cambie la card dice 47 sobre una lista de 45.
//
// Los casos son los del pedido, uno por uno, y están escritos con la forma REAL
// de la fila —la que produce `filaParaControles`— y no con un objeto cómodo. Un
// candado que prueba una forma que no ocurre pasa en verde sobre código roto.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PRESENTACION,
  PRESENTACIONES,
  GRUPO,
  IDS_PRESENTACION,
  IDS_VENTA,
  IDS_COMPRA,
  esPresentacionValida,
  esPresentacionDeVenta,
  esPresentacionDeCompra,
  grupoDePresentacion,
  presentacionDeVenta,
  presentacionDeCompra,
  marcadoPorPresentacion,
  contarPresentaciones,
} from "./presentaciones.js";
import { filaParaControles, contarPresentacionesDesdePrisma, filaMarcadaPorPresentacion }
  from "./controlesDesdePrisma.js";

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Una fila con la forma que la clasificación recibe de verdad.
 *
 * Pasa por `filaParaControles`, que es la MISMA función que usan el contador y el
 * filtro. Escribir el objeto a mano acá dejaría los candados probando una forma
 * que nadie produce — y el defecto que más veces se cobró este repo es
 * exactamente ése: un `select` a medias que deja un campo en `undefined` y hace
 * que un predicado conteste con confianza una respuesta equivocada.
 */
const fila = (base = {}, local = null) =>
  filaParaControles(
    {
      id: 1,
      precio_costo: 100,
      precio_venta: 150,
      margen: 50,
      modalidad: "NORMAL",
      unidad_medida: "unidad",
      factor_pack: null,
      pesoReferenciaKg: null,
      modo_envio: null,
      modoCompraProveedor: "BULTO",
      pesoEsFijo: false,
      modoVentaDeposito: "PESO",
      es_combo: false,
      ...base,
    },
    local
  );

const DEPOSITO = true;
const LOCAL = false;

// ── LOS CASOS DEL PEDIDO, UNO POR UNO ─────────────────────────────────────

test("P1. producto unitario: se vende por unidad y se compra por unidad", () => {
  const p = fila({ unidad_medida: "unidad" });
  assert.equal(presentacionDeVenta(p, LOCAL), PRESENTACION.VENTA_UNIDAD);
  assert.equal(presentacionDeVenta(p, DEPOSITO), PRESENTACION.VENTA_UNIDAD,
    "una unidad suelta sale por unidad también en el depósito");
  assert.equal(presentacionDeCompra(p), PRESENTACION.COMPRA_UNIDAD);
});

test("P2. pack y cajón vendidos por pack: venta pack y compra pack", () => {
  // Las dos unidades de medida caen en la MISMA categoría operativa. Es la
  // agrupación que pide la pantalla: quien mira estas cards quiere saber cuántos
  // salen en un envoltorio cerrado, y para eso un cajón y un pack son lo mismo.
  for (const unidad of ["pack", "cajon"]) {
    const p = fila({ unidad_medida: unidad, factor_pack: 12, modo_envio: "SOLO_BULTO" });
    assert.equal(presentacionDeVenta(p, DEPOSITO), PRESENTACION.VENTA_PACK, `venta de ${unidad}`);
    assert.equal(presentacionDeCompra(p), PRESENTACION.COMPRA_PACK, `compra de ${unidad}`);
  }
});

test("P3. un pack SIN modo_envio sigue saliendo por pack en el depósito", () => {
  // El campo en null NO se rellena en el camino: `escalaDeVentaDe` lo resuelve
  // con `defaultModoEnvio`, que para pack da SOLO_BULTO. Si alguien lo rellenara
  // antes con el "MIXTO" del mapper la respuesta sería la misma acá, pero no en
  // los 120 productos donde las dos reglas difieren — por eso viaja crudo.
  const p = fila({ unidad_medida: "pack", modo_envio: null, factor_pack: 6 });
  assert.equal(presentacionDeVenta(p, DEPOSITO), PRESENTACION.VENTA_PACK);
});

test("P4. comprado por pack pero VENDIDO por unidad", () => {
  // El caso que motiva separar las dos preguntas: un producto entra por pack y
  // sale de a uno. Clasificar leyendo solo `unidad_medida` lo pondría en "venta
  // por pack", que es lo que la tarjeta hacía mal en 5.410 filas.
  const enElLocal = fila({ unidad_medida: "pack", factor_pack: 12, modo_envio: "SOLO_BULTO" });
  assert.equal(presentacionDeVenta(enElLocal, LOCAL), PRESENTACION.VENTA_UNIDAD,
    "en un local el POS vende SIEMPRE por unidad");
  assert.equal(presentacionDeCompra(enElLocal), PRESENTACION.COMPRA_PACK);

  // Y en el depósito, con el producto marcado como solo-unidad.
  const enDeposito = fila({ unidad_medida: "pack", factor_pack: 12, modo_envio: "SOLO_UNIDAD" });
  assert.equal(presentacionDeVenta(enDeposito, DEPOSITO), PRESENTACION.VENTA_UNIDAD);
  assert.equal(presentacionDeCompra(enDeposito), PRESENTACION.COMPRA_PACK);
});

test("P5. kg comprado DIRECTAMENTE por kg", () => {
  // `modoCompraProveedor = BULTO` sobre un kg es lo que el formulario presenta
  // como "Por kg". El nombre del enum no manda: manda la regla efectiva.
  const p = fila({ unidad_medida: "kg", modoCompraProveedor: "BULTO" });
  assert.equal(presentacionDeCompra(p), PRESENTACION.COMPRA_KG);
  assert.equal(presentacionDeVenta(p, LOCAL), PRESENTACION.VENTA_KG);
  assert.equal(presentacionDeVenta(p, DEPOSITO), PRESENTACION.VENTA_KG,
    "sin compra por pieza no es fiambre de pieza fija, así que tampoco en el depósito");
});

test("P6. fiambre comprado POR PIEZA y vendido POR KG en un local", () => {
  const p = fila({
    unidad_medida: "kg",
    modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 4.5,
    modoVentaDeposito: "PIEZA",
  });
  assert.equal(presentacionDeCompra(p), PRESENTACION.COMPRA_PIEZA,
    "se ingresa una cantidad de piezas, con un peso de referencia que las lleva a kilos");
  assert.equal(presentacionDeVenta(p, LOCAL), PRESENTACION.VENTA_KG,
    "en un local el mismo fiambre se vende por kilo");
});

test("P7. el MISMO fiambre se vende POR PIEZA en el depósito", () => {
  // La prueba de que la ubicación manda: misma fila, dos respuestas. Es lo que
  // hace que clasificar leyendo solo columnas del producto sea insuficiente.
  const p = fila({
    unidad_medida: "kg",
    modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 4.5,
    modoVentaDeposito: "PIEZA",
  });
  assert.equal(presentacionDeVenta(p, DEPOSITO), PRESENTACION.VENTA_PIEZA);
  assert.equal(presentacionDeVenta(p, LOCAL), PRESENTACION.VENTA_KG);
  assert.notEqual(
    presentacionDeVenta(p, DEPOSITO),
    presentacionDeVenta(p, LOCAL),
    "si las dos dieran lo mismo, la ubicación no estaría llegando a la clasificación"
  );
});

test("P8. fiambre configurado para venta POR PESO en el depósito", () => {
  // Mismo producto, `modoVentaDeposito = PESO`: en el depósito se vende por kilo
  // y no por pieza. La compra no cambia — se le sigue comprando por pieza.
  const p = fila({
    unidad_medida: "kg",
    modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 4.5,
    modoVentaDeposito: "PESO",
  });
  assert.equal(presentacionDeVenta(p, DEPOSITO), PRESENTACION.VENTA_KG);
  assert.equal(presentacionDeVenta(p, LOCAL), PRESENTACION.VENTA_KG);
  assert.equal(presentacionDeCompra(p), PRESENTACION.COMPRA_PIEZA,
    "cómo se vende no cambia cómo se compra: son dos preguntas independientes");
});

test("P9. contraprueba de P7/P8: `modoVentaDeposito` es el que decide, y llega", () => {
  // ── EL CANDADO QUE ATAJA EL SELECT A MEDIAS ──────────────────────────────
  //
  // `esFiambreFijo` mira `modoVentaDeposito` PRIMERO y solo cae a `pesoEsFijo`
  // cuando el campo llega `undefined`. O sea que no pedirlo en el select no da
  // error: cambia la respuesta, en silencio. Acá se ejerce la diferencia.
  const comun = { unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5 };
  assert.equal(
    presentacionDeVenta(fila({ ...comun, modoVentaDeposito: "PIEZA" }), DEPOSITO),
    PRESENTACION.VENTA_PIEZA
  );
  assert.equal(
    presentacionDeVenta(fila({ ...comun, modoVentaDeposito: "PESO" }), DEPOSITO),
    PRESENTACION.VENTA_KG
  );
});

test("P10. combo: se vende por unidad y NO tiene presentación de compra", () => {
  // Y no se deduce de sus columnas: la ficha de un combo tiene su propia
  // `unidad_medida`, que el POS ignora —lo mapea con `unidadMedida: "unidad"`—.
  // Por eso el caso se prueba con una ficha que dice "pack": si la clasificación
  // leyera la columna, contestaría "por pack".
  const p = fila({ es_combo: true, unidad_medida: "pack", factor_pack: 6, modo_envio: "SOLO_BULTO" });
  assert.equal(presentacionDeVenta(p, DEPOSITO), PRESENTACION.VENTA_UNIDAD);
  assert.equal(presentacionDeVenta(p, LOCAL), PRESENTACION.VENTA_UNIDAD);
  assert.equal(presentacionDeCompra(p), null,
    "no se le compra un combo a un proveedor: se arma con componentes que sí se compran");
});

test("P11. servicio de importe variable: afuera de las OCHO", () => {
  const p = fila({ modalidad: "IMPORTE_VARIABLE", unidad_medida: "unidad" });
  assert.equal(presentacionDeVenta(p, LOCAL), null);
  assert.equal(presentacionDeVenta(p, DEPOSITO), null);
  assert.equal(presentacionDeCompra(p), null);
  // Y no suma en ninguna de las ocho al contar, que es donde se vería.
  const conteo = contarPresentaciones([p], LOCAL);
  for (const id of IDS_PRESENTACION) {
    assert.equal(conteo[id], 0, `el servicio sumó en ${id}`);
  }
});

test("P12. un combo suma en venta y NO en compra: las dos páginas no tienen por qué empatar", () => {
  // Es deliberado y conviene que esté fijado: si algún día alguien "arregla" que
  // los totales no coincidan metiendo los combos en una card de compra, esto se
  // pone rojo.
  const conteo = contarPresentaciones([fila({ es_combo: true })], LOCAL);
  const totalVenta = IDS_VENTA.reduce((n, id) => n + conteo[id], 0);
  const totalCompra = IDS_COMPRA.reduce((n, id) => n + conteo[id], 0);
  assert.equal(totalVenta, 1);
  assert.equal(totalCompra, 0);
});

// ── LA MISMA FUNCIÓN PARA CONTAR Y PARA FILTRAR ───────────────────────────

test("P13. el contador y el filtro dan lo mismo, categoría por categoría", () => {
  // La afirmación de la que cuelga todo: el número de la card tiene que ser el
  // total de la lista que esa card abre.
  const filas = [
    fila({ unidad_medida: "unidad" }),
    fila({ unidad_medida: "unidad" }),
    fila({ unidad_medida: "pack", modo_envio: "SOLO_BULTO", factor_pack: 6 }),
    fila({ unidad_medida: "cajon", modo_envio: "SOLO_BULTO", factor_pack: 12 }),
    fila({ unidad_medida: "kg", modoCompraProveedor: "BULTO" }),
    fila({ unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5, modoVentaDeposito: "PIEZA" }),
    fila({ es_combo: true }),
    fila({ modalidad: "IMPORTE_VARIABLE" }),
  ];

  for (const esDeposito of [LOCAL, DEPOSITO]) {
    const conteo = contarPresentaciones(filas, esDeposito);
    for (const id of IDS_PRESENTACION) {
      const porFiltro = filas.filter((f) => marcadoPorPresentacion(id, f, esDeposito)).length;
      assert.equal(
        porFiltro,
        conteo[id],
        `${id} en ${esDeposito ? "depósito" : "local"}: filtro ${porFiltro} vs contador ${conteo[id]}`
      );
    }
  }
});

test("P14. cada producto cae en UNA sola card de venta y UNA sola de compra", () => {
  // Si un producto pudiera caer en dos del mismo grupo, la suma de las cards
  // superaría el catálogo y ninguna card diría la verdad sobre su lista.
  const filas = [
    fila({ unidad_medida: "unidad" }),
    fila({ unidad_medida: "pack", modo_envio: "SOLO_BULTO" }),
    fila({ unidad_medida: "cajon", modo_envio: "SOLO_BULTO" }),
    fila({ unidad_medida: "kg", modoCompraProveedor: "BULTO" }),
    fila({ unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5, modoVentaDeposito: "PIEZA" }),
  ];
  for (const esDeposito of [LOCAL, DEPOSITO]) {
    for (const f of filas) {
      assert.equal(IDS_VENTA.filter((id) => marcadoPorPresentacion(id, f, esDeposito)).length, 1);
      assert.equal(IDS_COMPRA.filter((id) => marcadoPorPresentacion(id, f, esDeposito)).length, 1);
    }
  }
});

test("P15. Venta + Compra es una INTERSECCIÓN y puede dar menos que cada card", () => {
  // Los tres se compran por pack; uno solo se vende por unidad en el depósito.
  const filas = [
    fila({ unidad_medida: "pack", modo_envio: "SOLO_BULTO" }),
    fila({ unidad_medida: "pack", modo_envio: "SOLO_BULTO" }),
    fila({ unidad_medida: "pack", modo_envio: "SOLO_UNIDAD" }),
  ];
  const conteo = contarPresentaciones(filas, DEPOSITO);
  assert.equal(conteo[PRESENTACION.COMPRA_PACK], 3);
  assert.equal(conteo[PRESENTACION.VENTA_UNIDAD], 1);

  const cruce = filas.filter(
    (f) =>
      marcadoPorPresentacion(PRESENTACION.COMPRA_PACK, f, DEPOSITO) &&
      marcadoPorPresentacion(PRESENTACION.VENTA_UNIDAD, f, DEPOSITO)
  ).length;
  assert.equal(cruce, 1, "la intersección es menor que cualquiera de las dos cards");
  assert.ok(cruce < conteo[PRESENTACION.COMPRA_PACK]);
});

test("P16. las gemelas de Prisma clasifican igual que las puras", () => {
  // `contarPresentacionesDesdePrisma` y `filaMarcadaPorPresentacion` mergean la
  // fila con `filaParaControles` y después llaman a estas mismas funciones. Si
  // alguna vez mergearan distinto, los dos números se separarían — que es
  // exactamente lo que este archivo existe para impedir.
  const comoPrisma = {
    id: 5,
    precio_costo: 100,
    precio_venta: 150,
    margen: 50,
    modalidad: "NORMAL",
    unidad_medida: "kg",
    factor_pack: null,
    pesoReferenciaKg: 4.5,
    modo_envio: null,
    modoCompraProveedor: "UNIDAD",
    pesoEsFijo: false,
    modoVentaDeposito: "PIEZA",
    es_combo: false,
    locales: [],
  };

  const conteo = contarPresentacionesDesdePrisma([comoPrisma], DEPOSITO);
  assert.equal(conteo[PRESENTACION.VENTA_PIEZA], 1);
  assert.equal(conteo[PRESENTACION.COMPRA_PIEZA], 1);
  assert.equal(filaMarcadaPorPresentacion(PRESENTACION.VENTA_PIEZA, comoPrisma, DEPOSITO), true);
  assert.equal(filaMarcadaPorPresentacion(PRESENTACION.VENTA_KG, comoPrisma, DEPOSITO), false);
  assert.equal(filaMarcadaPorPresentacion(PRESENTACION.VENTA_KG, comoPrisma, LOCAL), true,
    "la ubicación llega hasta la función de Prisma, no se pierde en el camino");
});

// ── LO QUE LLEGA DE LA URL SE VALIDA ──────────────────────────────────────

test("P17. un id inventado no marca nada y no deja el listado vacío en silencio", () => {
  const p = fila({ unidad_medida: "unidad" });
  for (const basura of ["venta-litros", "compra", "", null, undefined, "VENTA-PACK", "../../etc"]) {
    assert.equal(esPresentacionValida(basura), false, `${basura} no puede ser válido`);
    assert.equal(grupoDePresentacion(basura), null);
    assert.equal(marcadoPorPresentacion(basura, p, LOCAL), false,
      "un id desconocido que marcara todo mostraría el catálogo entero como una categoría");
  }
});

test("P18. LA VALIDACIÓN ES POR GRUPO, no solo por existencia", () => {
  // `?presVenta=compra-kg` es un id que existe, en el grupo equivocado. Aceptarlo
  // dejaría el listado vacío con una card encendida que nadie tocó: ninguna fila
  // puede tener una presentación de compra como presentación de venta.
  assert.equal(esPresentacionValida(PRESENTACION.COMPRA_KG), true, "existe…");
  assert.equal(esPresentacionDeVenta(PRESENTACION.COMPRA_KG), false, "…pero no es de venta");
  assert.equal(esPresentacionDeCompra(PRESENTACION.VENTA_KG), false);
  assert.equal(esPresentacionDeVenta(PRESENTACION.VENTA_KG), true);
  assert.equal(esPresentacionDeCompra(PRESENTACION.COMPRA_KG), true);
  // Y la basura tampoco pasa por ninguno de los dos.
  assert.equal(esPresentacionDeVenta("cualquier-cosa"), false);
  assert.equal(esPresentacionDeCompra("cualquier-cosa"), false);
});

test("P19. LA PANTALLA Y EL LISTADO VALIDAN POR GRUPO, y no solo por existencia", () => {
  // El candado de arriba prueba la función; éste prueba que los dos consumidores
  // la llamen. Sin esto, `esPresentacionValida` podría estar perfecta y las dos
  // superficies validando con la débil.
  const pantalla = leer("app/modulos/productos/page.jsx").replace(/\/\/[^\n]*/g, "");
  assert.match(pantalla, /esPresentacionDeVenta\(/, "la pantalla no valida el grupo de venta");
  assert.match(pantalla, /esPresentacionDeCompra\(/, "la pantalla no valida el grupo de compra");

  const ruta = leer("app/api/productos/listar/route.js").replace(/\/\/[^\n]*/g, "");
  assert.match(ruta, /esPresentacionDeVenta\(/, "el listado no valida el grupo de venta");
  assert.match(ruta, /esPresentacionDeCompra\(/, "el listado no valida el grupo de compra");
});

// ── EL CATÁLOGO DE CARDS ──────────────────────────────────────────────────

test("P19-bis. LAS DOS RUTAS USAN EL CLASIFICADOR COMPARTIDO, y no cuentan por su cuenta", () => {
  // ── EL CANDADO DEL PEDIDO, EN LAS RUTAS ─────────────────────────────────
  //
  // No puede existir una regla para contar, otra parecida para filtrar y otra
  // escrita en la pantalla. Los candados de arriba prueban que las funciones
  // coincidan; éste prueba que las rutas las LLAMEN, que es lo que ninguno mira.
  // Es el mismo criterio que `whereCatalogo.test.mjs` ya aplica al universo.
  const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "");

  const contador = sinComentarios(leer("app/api/productos/controles/route.js"));
  assert.match(contador, /contarPresentacionesDesdePrisma\(/,
    "el contador dejó de usar la función compartida");
  assert.match(contador, /PRESENTACIONES\.map\(/,
    "el catálogo de cards dejó de salir del dominio: la ruta lo estaría escribiendo");

  const listado = sinComentarios(leer("app/api/productos/listar/route.js"));
  assert.match(listado, /filaMarcadaPorPresentacion\(/,
    "el listado dejó de filtrar con la función compartida");

  // Y NINGUNA DE LAS DOS REESCRIBE LA REGLA. Si una ruta empezara a mirar
  // `unidad_medida` o `modoCompraProveedor` para clasificar, sería la segunda
  // lógica que este archivo existe para impedir.
  for (const [nombre, fuente] of [["contador", contador], ["listado", listado]]) {
    assert.doesNotMatch(fuente, /modoCompraProveedor/,
      `${nombre}: está clasificando la compra por su cuenta`);
    assert.doesNotMatch(fuente, /modoVentaDeposito|pesoEsFijo/,
      `${nombre}: está resolviendo el fiambre por su cuenta`);
  }

  // Y LAS DOS TRAEN LAS FILAS CON LA MISMA FUNCIÓN, que es lo que hace que corten
  // por el mismo lugar cuando el catálogo pasa el techo.
  assert.match(contador, /traerFilasParaControles\(/);
  assert.match(listado, /traerFilasParaControles\(/);
});

test("P19-ter. el contador NO abre una consulta por card", () => {
  // El pedido es explícito: ni ocho consultas independientes ni un N+1. Se
  // comprueba contando los accesos a Prisma de la ruta: el universo, las filas y
  // la ubicación. Ocho `findMany` para ocho cards saltarían acá.
  const fuente = leer("app/api/productos/controles/route.js").replace(/\/\/[^\n]*/g, "");
  const consultas = [...fuente.matchAll(/prisma\.[a-zA-Z]+\.(findMany|findUnique|findFirst|count|groupBy)\(/g)];
  assert.ok(
    consultas.length <= 2,
    `la ruta hace ${consultas.length} consultas propias y tendría que hacer como mucho 2 ` +
      `(la ubicación; las filas salen de traerFilasParaControles): ${consultas.map((m) => m[0]).join(", ")}`
  );
  // Y el `groupBy` merece nombrarse: sería la forma "ingeniosa" de contar las
  // ocho en SQL, y daría una clasificación distinta de la del POS.
  assert.doesNotMatch(fuente, /groupBy/,
    "está contando por SQL, que no puede expresar la escala de venta efectiva");
});

test("P20. son ocho, cuatro y cuatro, y en el orden que el carrusel pagina", () => {
  // El orden NO es decorativo: el carrusel corta de a cuatro, así que las cuatro
  // de venta tienen que ser las cuatro primeras para caer juntas en la página 1.
  assert.equal(PRESENTACIONES.length, 8);
  assert.equal(IDS_VENTA.length, 4);
  assert.equal(IDS_COMPRA.length, 4);
  assert.deepEqual(
    PRESENTACIONES.slice(0, 4).map((p) => p.grupo),
    Array(4).fill(GRUPO.VENTA),
    "las cuatro de venta no son las cuatro primeras: el carrusel las mezclaría entre las dos páginas"
  );
  assert.deepEqual(
    PRESENTACIONES.slice(4).map((p) => p.grupo),
    Array(4).fill(GRUPO.COMPRA)
  );
  assert.equal(new Set(IDS_PRESENTACION).size, 8, "hay ids repetidos");
});

test("P21. cada card dice de qué grupo es: 'Venta / por pack', no solo 'Pack'", () => {
  // Un rótulo que solo dijera "Pack" no distinguiría la página de venta de la de
  // compra en cuanto alguien deslice, que es justo cuando hace falta.
  for (const p of PRESENTACIONES) {
    assert.ok(p.titulo === "Venta" || p.titulo === "Compra", `${p.id} no dice el grupo`);
    assert.match(p.detalle, /^por (pack|unidad|kg|pieza)$/, `${p.id} no dice la modalidad`);
    assert.equal(p.titulo, p.grupo === GRUPO.VENTA ? "Venta" : "Compra");
  }
});

test("P22. LAS CARDS DE CLASIFICACIÓN NO SON ALERTAS: no traen rol ni texto sano", () => {
  // ── EL CANDADO DE LA SEMÁNTICA ───────────────────────────────────────────
  //
  // Si una de estas cards trajera `rol` o `detalleSano`, el componente la
  // pintaría como los controles de "Para revisar": un cero en verde con un tilde
  // y "sin pendientes". Cero productos vendidos por kg no es un logro ni un
  // problema — es un dato, y afirmarlo sano sería afirmar algo que nadie dijo.
  for (const p of PRESENTACIONES) {
    assert.equal(p.rol, undefined, `${p.id} trae un rol semántico y no le corresponde`);
    assert.equal(p.detalleSano, undefined, `${p.id} trae un texto de "sano" y no le corresponde`);
  }
});

test("P23. LA REGLA DE VENTA SALE DE `escalaDeVentaDe`, y no de una copia", () => {
  // El pedido es explícito: no inventar una segunda lógica. Si mañana alguien
  // reescribe la clasificación de venta acá adentro con sus propios `if`, esto se
  // pone rojo antes de que la pantalla empiece a contradecir al POS.
  const fuente = leer("lib/productos/presentaciones.js").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /escalaDeVentaDe\(/, "dejó de delegar en la escala del POS");
  assert.match(fuente, /esProductoServicio\(/, "dejó de usar la marca de servicio del POS");
  // Y no reimplementa lo que aquella función decide: ni el modo de salida ni el
  // predicado del fiambre.
  assert.doesNotMatch(fuente, /SOLO_BULTO|SOLO_UNIDAD|MIXTO/,
    "está decidiendo el modo de salida por su cuenta en vez de preguntarle a escalaDeVenta");
  assert.doesNotMatch(fuente, /esFiambreFijo|pesoEsFijo/,
    "está resolviendo el fiambre por su cuenta en vez de preguntarle a escalaDeVenta");
});

test("P24. LA COMPRA NO MIRA `modo_pedido`: eso es el pedido interno al depósito", () => {
  // La corrección expresa del pedido. `modo_pedido` gobierna cómo un local le
  // pide al depósito —logística interna— y no cómo se le compra al proveedor.
  const fuente = leer("lib/productos/presentaciones.js");
  const sinComentarios = fuente.replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(sinComentarios, /modo_pedido|modoPedido/,
    "la clasificación de compra está mirando el modo de pedido interno");
  // Y sí mira los dos que sí gobiernan la compra al proveedor.
  assert.match(sinComentarios, /modoCompraProveedor/);
  assert.match(sinComentarios, /unidad_medida/);
});

test("P25. contraprueba de P24: el analizador vería `modo_pedido` si estuviera", () => {
  // Sin esto, P24 pasaría en verde con cualquier regex rota.
  const conElCampo = 'const x = p.modo_pedido;'.replace(/\/\/[^\n]*/g, "");
  assert.match(conElCampo, /modo_pedido|modoPedido/);
});

test("P26. el select trae los cinco campos que la clasificación necesita", () => {
  // Un campo que no viaje llega `undefined` y la clasificación contesta con
  // confianza una respuesta equivocada. Acá se comprueba contra el select real,
  // que es de donde el SQL crudo deriva sus columnas.
  const desde = leer("lib/productos/controlesDesdePrisma.js");
  const bloque = desde.slice(
    desde.indexOf("export const SELECT_CONTROLES_BASE"),
    desde.indexOf("export const SELECT_CONTROLES_LOCAL")
  );
  for (const campo of ["modo_envio", "modoCompraProveedor", "pesoEsFijo", "modoVentaDeposito", "es_combo"]) {
    assert.match(
      bloque.replace(/\/\/[^\n]*/g, ""),
      new RegExp(`${campo}:\\s*true`),
      `el select no pide ${campo}, y sin él la clasificación contesta otra cosa`
    );
  }
});

test("P27. `filaParaControles` no inventa el modo de envío: lo pasa crudo", () => {
  // Rellenarlo con un default acá sería lo que `escalaDeVenta.js` advierte: el
  // mapper lo completa con "MIXTO" y la escala con `defaultModoEnvio`, y en 120
  // productos las dos respuestas difieren. La que anticipa al POS es la segunda.
  const f = filaParaControles({ id: 1, unidad_medida: "unidad", modo_envio: null }, null);
  assert.equal(f.modo_envio, null, "el modo de envío llegó relleno y tendría que llegar crudo");
  assert.equal(f.es_combo, false, "sin el campo, un producto normal no puede quedar como combo");
});
