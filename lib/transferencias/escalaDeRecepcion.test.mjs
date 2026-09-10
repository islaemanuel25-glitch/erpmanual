// LA ESCALA EN LA QUE SE RECIBE UNA LÍNEA, Y QUIÉN LA CONTESTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/escalaDeRecepcion.test.mjs
//
// ── EL DEFECTO QUE ESTOS CANDADOS FIJAN ──────────────────────────────────
//
// La tanda anterior enseñó al sistema a CONGELAR cómo salió la mercadería, y la
// pantalla aprendió a mostrarlo. El servidor no. Las cuatro rutas de recepción
// seguían leyendo los campos crudos:
//
//     cantidad:      d.cantidad            → 48
//     unidadEnviada: d.unidadEnviada       → "UNIDAD"
//     factorPack:    base.factor_pack      → del catálogo VIVO
//
// sobre una línea cuyo snapshot dice que salieron 6 CAJÓN x8. El resultado no
// era un rótulo feo: era que 5 cajones y 7 sueltas **no se podían guardar**. Con
// unidad UNIDAD el factor no se aplica, y `milesimasFisicas` rechaza un desglose
// sin bulto devolviendo null — así que el conteo se caía con SUELTAS_SIN_BULTO
// en las tres rutas que escriben, y el endpoint de lectura informaba cero
// recibido y ningún ajuste justo en la línea que sí tenía una diferencia.
//
// El caso obligatorio recorre las cuatro puertas con los MISMOS números.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { milesimasFisicas, validarDetalleRecepcion, calcularAjusteOrigenUnidades } from "./recepcion.js";
import {
  detalleParaValidar,
  escalaDeRecepcion,
  planificarRecepcion,
} from "./recepcionServidor.js";
import { escalaDeEnvio, unidadFisicaDe } from "./presentacionEnvio.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/**
 * UNA FILA DE `TransferenciaDetalle` COMO LA DEVUELVE PRISMA.
 *
 * Con los nombres reales: el catálogo cuelga de `producto.base` y en snake. Es
 * la forma que las rutas reciben, y la que obliga a que la resolución canónica
 * tenga un adaptador — sin él, la reconstrucción de un histórico se quedaría sin
 * catálogo.
 *
 * Los números son los del caso obligatorio: la venta interna persiste la
 * cantidad FÍSICA consolidada —48— porque el POS ya convirtió, y el snapshot
 * dice que eso fueron 6 cajones de 8.
 */
const filaCajon = (extra = {}) => ({
  id: 1,
  cantidad: 48,
  unidadEnviada: "UNIDAD",
  recibido: null,
  recibidoUnidadesSueltas: null,
  motivoPrincipal: null,
  motivoDetalle: null,
  agregadoEnRecepcion: false,
  presentacionEnvio: "CAJON",
  cantidadPresentada: 6,
  sueltasEnviadas: 0,
  factorPresentacion: 8,
  pesoPiezaKg: null,
  producto: {
    base: {
      id: 10,
      nombre: "Coca-Cola 2,25 L",
      unidad_medida: "cajon",
      factor_pack: 8,
      es_combo: false,
    },
  },
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA RESOLUCIÓN CANÓNICA
// ═══════════════════════════════════════════════════════════════════════════

test("1. con snapshot, un CAJÓN se recibe en BULTO con el factor congelado", () => {
  const e = escalaDeRecepcion(filaCajon());
  assert.equal(e.cantidad, 6, "la recepción tiene que operar en 6, no en 48");
  assert.equal(e.unidad, "BULTO");
  assert.equal(e.factorPack, 8);
  assert.equal(e.sueltas, 0);
  assert.equal(e.registrado, true);
});

test("2. UNIDAD, KG y PIEZA se reciben en UNIDAD y con factor 1", () => {
  // En las tres la cantidad YA está en la escala del dominio: multiplicar por un
  // factor sería inventar mercadería.
  const casos = [
    { presentacionEnvio: "UNIDAD", cantidadPresentada: 20, factorPresentacion: null, espera: 20 },
    { presentacionEnvio: "KG", cantidadPresentada: 3.25, factorPresentacion: null, espera: 3.25 },
    { presentacionEnvio: "PIEZA", cantidadPresentada: 2, factorPresentacion: null, espera: 2, pesoPiezaKg: 3.5 },
  ];
  for (const c of casos) {
    const e = escalaDeRecepcion(filaCajon(c));
    assert.equal(e.unidad, "UNIDAD", `${c.presentacionEnvio} no puede recibirse en BULTO`);
    assert.equal(e.factorPack, 1, `${c.presentacionEnvio} no lleva factor`);
    assert.equal(e.cantidad, c.espera);
  }
});

test("3. un PACK con despacho MIXTO conserva sus dos mitades", () => {
  // 4 packs de 6 más 5 sueltas son 29 físicas, y de ahí no se puede volver:
  // 29/6 no es entero. Perder las 5 leería 24 y la línea informaría un sobrante
  // de 5 que nunca existió.
  const e = escalaDeRecepcion(
    filaCajon({
      presentacionEnvio: "PACK",
      cantidadPresentada: 4,
      sueltasEnviadas: 5,
      factorPresentacion: 6,
      cantidad: 29,
    })
  );
  assert.equal(e.cantidad, 4);
  assert.equal(e.sueltas, 5);
  assert.equal(e.factorPack, 6);
  const fisicas = milesimasFisicas({
    cantidad: e.cantidad, sueltas: e.sueltas, unidad: e.unidad, factorPack: e.factorPack,
  });
  assert.equal(fisicas, 29000, "4 × 6 + 5 = 29, exacto");
});

test("4. SIN snapshot no se reinterpreta nada: manda lo de siempre", () => {
  // Una línea anterior a la migración, despachada en bultos por el camino
  // manual. El descriptor la reconstruye del catálogo y la escala sale igual que
  // con el código viejo: BULTO y el `factor_pack` del producto.
  const vieja = filaCajon({
    presentacionEnvio: null,
    cantidadPresentada: null,
    sueltasEnviadas: null,
    factorPresentacion: null,
    cantidad: 6,
    unidadEnviada: "BULTO",
  });
  const e = escalaDeRecepcion(vieja);
  assert.equal(e.registrado, false, "no se puede hacer pasar un histórico por registrado");
  assert.equal(e.unidad, "BULTO");
  assert.equal(e.factorPack, 8);
  assert.equal(e.cantidad, 6);

  // Y el número final es EXACTAMENTE el que daba el código viejo.
  const nuevo = milesimasFisicas({
    cantidad: e.cantidad, sueltas: e.sueltas, unidad: e.unidad, factorPack: e.factorPack,
  });
  const legacy = milesimasFisicas({
    cantidad: vieja.cantidad, sueltas: 0,
    unidad: vieja.unidadEnviada, factorPack: vieja.producto.base.factor_pack,
  });
  assert.equal(nuevo, legacy);
});

test("5. un histórico en UNIDAD tampoco cambia de escala", () => {
  const e = escalaDeRecepcion(
    filaCajon({
      presentacionEnvio: null, cantidadPresentada: null, factorPresentacion: null,
      cantidad: 48, unidadEnviada: "UNIDAD",
    })
  );
  // El catálogo dice "cajon x8", pero la OPERACIÓN dice que se contó por
  // unidades, y eso gana. Reinterpretar 48 como "6 cajones" sería inventar.
  assert.equal(e.unidad, "UNIDAD");
  assert.equal(e.factorPack, 1);
  assert.equal(e.cantidad, 48);
});

test("6. la traducción presentación → unidadEnviada vive UNA sola vez", () => {
  assert.equal(unidadFisicaDe({ presentacion: "PACK", factor: 6 }), "BULTO");
  assert.equal(unidadFisicaDe({ presentacion: "CAJON", factor: 8 }), "BULTO");
  assert.equal(unidadFisicaDe({ presentacion: "UNIDAD", factor: null }), "UNIDAD");
  assert.equal(unidadFisicaDe({ presentacion: "KG", factor: null }), "UNIDAD");
  assert.equal(unidadFisicaDe({ presentacion: "PIEZA", factor: null }), "UNIDAD");
  // Agrupa, pero no se sabe con cuánto: no se inventa un factor.
  assert.equal(unidadFisicaDe({ presentacion: "PACK", factor: null }), "UNIDAD");
  assert.equal(unidadFisicaDe({ presentacion: "CAJON", factor: 1 }), "UNIDAD");

  // Y `escalaDeEnvio` la usa a ella, no una copia al lado.
  const src = leer("lib/transferencias/presentacionEnvio.js");
  assert.match(src, /const agrupada = unidadFisicaDe\(envio\) === "BULTO"/);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CASO OBLIGATORIO: 6 CAJÓN x8 ENVIADOS, 5 CAJONES + 7 SUELTAS RECIBIDOS
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que las tres rutas que escriben calculan, por el mismo camino. */
const revisarCon = (fila, recibido, sueltas) =>
  validarDetalleRecepcion({
    ...detalleParaValidar(fila, { detalle: { motivoPrincipal: "Faltante" } }),
    recibidoPropuesto: recibido,
    sueltasPropuestas: sueltas,
  });

test("7. REVISAR acepta 5 + 7 y calcula 47 contra 48, faltante 1", () => {
  const plan = revisarCon(filaCajon(), 5, 7);

  assert.equal(plan.ok, true, `la revisión se rechazó: ${plan.error}`);
  assert.equal(plan.unidad, "BULTO", "se revisó en unidades y no en cajones");
  assert.equal(plan.enviadaUnidades, 48);
  assert.equal(plan.recibidaUnidades, 47, "5 × 8 + 7 = 47");
  assert.equal(plan.hayDiferencia, true);
  assert.equal(plan.ajusteOrigenUnidades, 1, "falta 1 unidad física");
  assert.equal(plan.devolucionUnidades, 1);
  assert.equal(plan.excedenteUnidades, 0);

  // Y lo que se PERSISTE son los dos números, no un 5,875 inexacto.
  assert.equal(plan.recibida, 5);
  assert.equal(plan.recibidaSueltas, 7);
});

test("8. CONTRAPRUEBA: leyendo los campos crudos, 5 + 7 era irrepresentable", () => {
  // Esto es exactamente lo que hacían las cuatro rutas antes de esta tanda.
  const d = filaCajon();
  const legacy = milesimasFisicas({
    cantidad: 5,
    sueltas: 7,
    unidad: d.unidadEnviada,                    // "UNIDAD"
    factorPack: d.producto.base.factor_pack,    // 8, inaplicable en UNIDAD
  });
  assert.equal(
    legacy,
    null,
    "si esto deja de ser null, la contraprueba dejó de probar el defecto"
  );

  // Y el camino canónico sí lo representa.
  const e = escalaDeRecepcion(d);
  assert.equal(
    milesimasFisicas({ cantidad: 5, sueltas: 7, unidad: e.unidad, factorPack: e.factorPack }),
    47000
  );
});

test("9. GUARDAR usa la misma resolución y da los mismos 47 contra 48", () => {
  // `guardar-recepcion` valida con `detalleParaValidar` + el recibido propuesto
  // del ítem del lote. Mismo núcleo, mismos números.
  const plan = validarDetalleRecepcion({
    ...detalleParaValidar(filaCajon(), { detalle: { motivoPrincipal: "Faltante" } }),
    recibidoPropuesto: 5,
    sueltasPropuestas: 7,
  });
  assert.equal(plan.ok, true, `guardar rechazó el lote: ${plan.error}`);
  assert.equal(plan.enviadaUnidades, 48);
  assert.equal(plan.recibidaUnidades, 47);
});

test("10. CONFIRMAR planifica 5 + 7 sobre la fila ya persistida", () => {
  // Después de revisar, la fila tiene los dos números guardados. Confirmar
  // relee y vuelve a planificar DENTRO del lock: es el número que mueve stock.
  const guardada = filaCajon({
    recibido: 5,
    recibidoUnidadesSueltas: 7,
    motivoPrincipal: "Faltante",
  });
  const r = planificarRecepcion([guardada]);
  assert.equal(r.ok, true, `confirmar rechazó la línea: ${r.error}`);

  const plan = r.planes.get(1);
  assert.equal(plan.enviadaUnidades, 48);
  assert.equal(plan.recibidaUnidades, 47, "al destino entran 47, no 5");
  assert.equal(plan.ajusteOrigenUnidades, 1, "al origen le vuelve 1");
  assert.equal(plan.tocaTransito, true);
});

test("11. RECARGAR conserva 5 + 7 y el documento dice 47 de 48", () => {
  // Lo que hace `/api/transferencias/detalle` para armar el DTO. Con los campos
  // crudos, `recFisM` daba null: el total recibido quedaba en cero y el ajuste
  // desaparecía — stock bien y papel mal, que es peor que los dos mal.
  const d = filaCajon({ recibido: 5, recibidoUnidadesSueltas: 7, motivoPrincipal: "Faltante" });
  const escala = escalaDeRecepcion(d);

  const envFisM = milesimasFisicas({
    cantidad: escala.cantidad, sueltas: escala.sueltas,
    unidad: escala.unidad, factorPack: escala.factorPack,
  });
  const recFisM = milesimasFisicas({
    cantidad: d.recibido, sueltas: d.recibidoUnidadesSueltas,
    unidad: escala.unidad, factorPack: escala.factorPack,
  });

  assert.equal(envFisM, 48000);
  assert.equal(recFisM, 47000, "la recarga tiene que poder leer el pack incompleto");

  const ajuste = calcularAjusteOrigenUnidades({
    enviada: escala.cantidad, enviadaSueltas: escala.sueltas,
    recibida: d.recibido, recibidaSueltas: d.recibidoUnidadesSueltas,
    unidad: escala.unidad, factorPack: escala.factorPack,
  });
  assert.equal(ajuste, 1, "el documento tiene que informar el faltante de 1");
});

test("12. lo ENVIADO también puede traer sueltas, y se cuentan", () => {
  // Un despacho mixto de 4 packs de 6 más 5 sueltas: 29 físicas. Recibir 29
  // sueltas exactas NO es una diferencia.
  const mixta = filaCajon({
    presentacionEnvio: "PACK", cantidadPresentada: 4, sueltasEnviadas: 5,
    factorPresentacion: 6, cantidad: 29, recibido: 4, recibidoUnidadesSueltas: 5,
  });
  const r = planificarRecepcion([mixta]);
  assert.equal(r.ok, true, `la línea mixta se rechazó: ${r.error}`);
  const plan = r.planes.get(1);
  assert.equal(plan.enviadaUnidades, 29, "las 5 sueltas del envío no se pueden perder");
  assert.equal(plan.recibidaUnidades, 29);
  assert.equal(plan.hayDiferencia, false, "llegó exactamente lo que salió");
});

// ═══════════════════════════════════════════════════════════════════════════
// NINGUNA RUTA VUELVE A INTERPRETAR LA LÍNEA POR SU CUENTA
// ═══════════════════════════════════════════════════════════════════════════

const RUTAS = [
  "app/api/transferencias/revisar-producto/route.js",
  "app/api/transferencias/guardar-recepcion/route.js",
  "app/api/transferencias/detalle/route.js",
];

/**
 * El texto de cada llamada a una función, con sus argumentos.
 *
 * Se mira la LLAMADA y no el archivo entero a propósito: el DTO de `detalle`
 * reenvía `factor_pack` crudo para que el cliente pueda reconstruir una línea
 * anterior a la migración, y eso es correcto. Lo que no puede pasar es que ese
 * campo entre en la ARITMÉTICA. Un candado que prohibiera el nombre en todo el
 * archivo daría rojo sobre el uso legítimo, y bajarlo después terminaría
 * apagándolo — que es peor que no tenerlo.
 */
function llamadasA(src, nombre) {
  const salida = [];
  let desde = 0;
  for (;;) {
    const i = src.indexOf(`${nombre}(`, desde);
    if (i === -1) return salida;
    let prof = 0;
    let j = i + nombre.length;
    for (; j < src.length; j += 1) {
      if (src[j] === "(") prof += 1;
      else if (src[j] === ")") {
        prof -= 1;
        if (prof === 0) break;
      }
    }
    salida.push(src.slice(i, j + 1));
    desde = j + 1;
  }
}

test("13. ninguna ruta de recepción arma la escala a mano", () => {
  const ARITMETICA = ["milesimasFisicas", "calcularAjusteOrigenUnidades", "validarDetalleRecepcion"];

  for (const rel of RUTAS) {
    // Sin comentarios: un candado que busca código y encuentra prosa da verde
    // afirmando nada. Ya pasó tres veces en este repo.
    const src = leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    assert.ok(
      /detalleParaValidar\(|escalaDeRecepcion\(/.test(src),
      `${rel} no usa la resolución canónica`
    );

    for (const fn of ARITMETICA) {
      for (const llamada of llamadasA(src, fn)) {
        assert.ok(
          !/factor_pack/.test(llamada),
          `${rel}: ${fn}() volvió a recibir el factor del catálogo vivo`
        );
        assert.ok(
          !/d\.unidadEnviada/.test(llamada),
          `${rel}: ${fn}() volvió a recibir unidadEnviada cruda`
        );
        assert.ok(
          !/cantidad:\s*d\.cantidad\b/.test(llamada),
          `${rel}: ${fn}() volvió a recibir la cantidad física cruda como enviada`
        );
      }
    }
  }
});

test("13.bis y el candado 13 mira donde el defecto ocurre", () => {
  // Contraprueba del candado, no del producto: si `llamadasA` no encontrara las
  // llamadas, el 13 pasaría en verde afirmando nada. Se comprueba que las ve.
  const src = leer("app/api/transferencias/detalle/route.js");
  const encontradas = llamadasA(src, "milesimasFisicas");
  assert.ok(encontradas.length >= 2, "el extractor no está encontrando las llamadas");
  assert.ok(
    encontradas.every((l) => /escala\./.test(l)),
    "alguna llamada dejó de pasar por la escala canónica"
  );

  // Y sobre un texto con el defecto puesto a mano, el criterio da rojo.
  const conDefecto = llamadasA(
    'milesimasFisicas({ cantidad: d.cantidad, unidad: d.unidadEnviada, factorPack: b.factor_pack })',
    "milesimasFisicas"
  );
  assert.equal(conDefecto.length, 1);
  assert.ok(/factor_pack/.test(conDefecto[0]), "el criterio no detecta el defecto que dice detectar");
});

test("14. confirmar-recepcion planifica y no calcula aparte", () => {
  const src = leer("app/api/transferencias/confirmar-recepcion/route.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(src, /planificarRecepcion\(detalles\)/);
  assert.ok(
    !/factorPack:\s*Number\(d\.producto\?\.base\?\.factor_pack/.test(src),
    "confirmar volvió a leer el factor del catálogo"
  );
});

test("15. la pantalla y el servidor comparten la MISMA escala", () => {
  // `controlFisico` tenía su propia copia privada —`escalaDe`— mientras las
  // rutas leían los campos crudos. Dos respuestas para la misma pregunta, y una
  // de las dos escribe stock.
  const src = leer("lib/transferencias/controlFisico.js");
  assert.match(src, /import \{ escalaDeEnvio \} from "\.\/presentacionEnvio\.js"/);
  assert.ok(
    !/function escalaDe\(/.test(src),
    "volvió a aparecer una copia privada de la resolución de escala"
  );

  // Y dan lo mismo sobre la misma línea, entrando cada una por su forma.
  const dto = {
    cantidadEnviada: 48, unidadEnviada: "UNIDAD", unidadMedida: "cajon", factorPack: 8,
    presentacionEnvio: "CAJON", cantidadPresentada: 6, sueltasEnviadas: 0, factorPresentacion: 8,
  };
  const pantalla = escalaDeEnvio(dto);
  const servidor = escalaDeRecepcion(filaCajon());
  assert.equal(pantalla.unidad, servidor.unidad);
  assert.equal(pantalla.factorPack, servidor.factorPack);
  assert.equal(pantalla.cantidad, servidor.cantidad);
});
