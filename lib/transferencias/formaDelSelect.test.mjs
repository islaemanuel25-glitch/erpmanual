// LA FORMA DEL DATO QUE CADA RUTA PRODUCE, NO LA QUE LA FUNCIÓN ACEPTA.
//
// ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
//
// El 2026-08-20 la transferencia #97 seguía mostrando 144.086,40 en la lista y
// 155.486,40 en el detalle, DESPUÉS del arreglo que se desplegó para eso mismo.
// Lo encontró Emanuel abriendo la pantalla; los candados estaban todos en verde.
//
// El arreglo anterior era correcto y estaba probado: se le pasaba el origen a la
// función que valoriza, y con el origen la función convierte bien. Lo que nadie
// probó es que la ruta le ESTUVIERA PASANDO un producto completo.
//
// `esProductoFiambre` mira tres campos —`unidad_medida`, `modoCompraProveedor` y
// `pesoReferenciaKg`— y `esFiambreFijo` mira un cuarto, `modoVentaDeposito`. El
// `select` de `/api/transferencias/listar` pedía de `base` solamente
// `precio_costo`, `unidad_medida`, `factor_pack` y `nombre`. Los otros llegaban
// `undefined`, el predicado contestaba "no es fiambre" y la conversión no
// ocurría. Con el origen bien pasado y todo lo demás bien puesto.
//
// El de `/api/transferencias/por-destino` además no pedía `es_deposito`, así que
// `t.origen?.es_deposito === true` daba `false` — y por ser un booleano válido,
// pasaba el control de origen obligatorio sin quejarse.
//
// ── LA LECCIÓN, QUE YA ESTABA ESCRITA Y SE VOLVIÓ A COBRAR ──────────────────
//
// "La forma del dato de prueba tiene que ser la forma del dato real." Los
// candados de `costoTransferencia` y de `agregadosPeriodo` arman el producto a
// mano y completo, así que prueban la fórmula y nunca la recolección. El defecto
// vivía en el espacio entre el `select` y la fórmula, que es donde no miraba
// ninguno de los dos.
//
// Por eso estos candados NO arman el dato: declaran la forma de cada `select` tal
// como está escrito en su ruta, y valorizan con eso. Si alguien recorta un
// `select`, el candado se pone rojo acá y no en producción.
//
// ── EL SUJETO CAMBIÓ EL 2026-10-31: YA NO ES LA FICHA, ES LA LÍNEA ──────────
//
// Hasta esa fecha la presentación con la que se normalizaba el precio se leía de
// `producto.base`, y por eso estos candados exigían que cada ruta trajera la
// ficha completa. Desde entonces cada línea guarda las seis columnas
// `valorizacion*` al crearse y la fórmula lee SOLO esas: la ficha viva puede
// haber cambiado de presentación después del envío, que es lo que dejó a la #1
// con $51.968,86 de menos. La lección de la #97 no cambió —la forma del dato es
// la que trae el `select`—, cambió qué `select` hay que mirar.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  importeDeDetalle,
  importeDeDetalleCentavos,
  desdeCentavos,
  resumenPorEstado,
  productosMasTransferidos,
  agruparPorDestino,
  totalesDeDestinos,
  cantidadesDeDetalle,
} from "./agregadosPeriodo.js";
import { diferenciaDeLinea } from "./recepcionUI.js";
import {
  valorizarDetalle,
  valorizarLineaDelRemito,
  origenEsDepositoDe,
  presentacionParaGuardar,
  columnasDeValorizacion,
  COLUMNAS_DE_VALORIZACION,
} from "./costoTransferencia.js";

/** La línea como la deja `crearTransferencia`: con la presentación de la ficha guardada. */
const conFicha = (linea, ficha) => ({ ...linea, ...presentacionParaGuardar(ficha) });

const RAIZ = path.resolve(import.meta.dirname, "../..");

/**
 * Redondeo a centavos para comparar sumas de floats.
 *
 * Las funciones de `agregadosPeriodo` acumulan en centavos ENTEROS y por eso no
 * lo necesitan; las que suman `subtotal` a mano —los dos PDF y el detalle— sí,
 * porque 3,62 × 10120 arrastra residuo binario. Se redondea acá y no se toca la
 * aritmética de producción: el residuo es de esta suma de prueba, no de ellas.
 */
const redondear = (n) => Math.round(n * 100) / 100;

// ── LAS LÍNEAS REALES DE LA #97 ─────────────────────────────────────────────
//
// Leídas de producción el 2026-08-20 con psql. No están inventadas para que la
// cuenta cierre: son las cinco líneas del remito que Emanuel fotografió, con sus
// costos congelados y los campos del producto tal como están hoy en la base.
//
// La tercera es la única que cambia de valor: Papas Congeladas es fiambre de
// pieza fija, sale del depósito en piezas y su costo está por kilo.
//   sin convertir: 2 × 3.800 =  7.600
//   convertido:    2 × (3.800 × 2,5) = 2 × 9.500 = 19.000
// Los 11.400 de diferencia son exactamente los que separaban las dos pantallas.
const LINEAS_97 = [
  { nombre: "BARRA TREMBLAY", cantidad: 3.62, recibido: null, precioCosto: 10120, unidadEnviada: "UNIDAD",
    base: { precio_costo: 10120, unidad_medida: "kg", factor_pack: null, nombre: "BARRA TREMBLAY",
            pesoEsFijo: false, pesoReferenciaKg: 4.1, modoVentaDeposito: "PESO", modoCompraProveedor: "UNIDAD" } },
  { nombre: "salchicha paladini", cantidad: 24, recibido: null, precioCosto: 40200, unidadEnviada: "UNIDAD",
    base: { precio_costo: 40200, unidad_medida: "pack", factor_pack: 24, nombre: "salchicha paladini",
            pesoEsFijo: false, pesoReferenciaKg: null, modoVentaDeposito: "PESO", modoCompraProveedor: "BULTO" } },
  { nombre: "Papas Congeladas", cantidad: 2, recibido: null, precioCosto: 3800, unidadEnviada: "UNIDAD",
    base: { precio_costo: 3800, unidad_medida: "kg", factor_pack: null, nombre: "Papas Congeladas",
            pesoEsFijo: true, pesoReferenciaKg: 2.5, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD" } },
  { nombre: "Queso Cremoso Verona", cantidad: 4.3, recibido: null, precioCosto: 7800, unidadEnviada: "UNIDAD",
    base: { precio_costo: 7800, unidad_medida: "kg", factor_pack: null, nombre: "Queso Cremoso Verona",
            pesoEsFijo: false, pesoReferenciaKg: 4.5, modoVentaDeposito: "PESO", modoCompraProveedor: "UNIDAD" } },
  { nombre: "Salchichas Fela", cantidad: 24, recibido: null, precioCosto: 26112, unidadEnviada: "UNIDAD",
    base: { precio_costo: 26112, unidad_medida: "pack", factor_pack: 24, nombre: "Salchichas Fela",
            pesoEsFijo: false, pesoReferenciaKg: null, modoVentaDeposito: "PESO", modoCompraProveedor: "BULTO" } },
];

/** Lo que el detalle muestra hoy, y lo que las cuatro superficies tienen que dar. */
const TOTAL_CORRECTO = 155486.4;
/** Lo que mostraban la lista y el agrupado por destino. Nunca más. */
const TOTAL_VIEJO = 144086.4;

/**
 * Arma el detalle como lo devolvería Prisma, dejando de la presentación guardada
 * en la LÍNEA solo las columnas que se le pidan. Es el corazón del archivo:
 * recortar acá es recortar el `select`, y las columnas que no se piden llegan
 * `undefined`, no `null`.
 *
 * La ficha viaja entera a propósito: la fórmula no la lee, y si la leyera, un
 * `select` recortado de la línea pasaría en verde apoyándose en ella.
 */
function comoLoDevuelveElSelect(columnasDeLaLinea) {
  return LINEAS_97.map((l) => {
    const guardada = presentacionParaGuardar(l.base);
    const linea = {
      cantidad: l.cantidad,
      recibido: l.recibido,
      precioCosto: l.precioCosto,
      unidadEnviada: l.unidadEnviada,
      producto: { precio_costo: null, base: { ...l.base } },
    };
    for (const col of columnasDeLaLinea) linea[col] = guardada[col];
    return linea;
  });
}

// Las columnas de la línea que trae cada ruta. Se leen del archivo de la ruta en
// el candado de más abajo, así que esta lista no se puede quedar vieja en silencio.
const COMPLETO = Object.keys(COLUMNAS_DE_VALORIZACION);
/** Lo que traía un `select` de la línea escrito antes de que las columnas existieran. */
const RECORTADO_VIEJO = [];

// ── EL DEFECTO, REPRODUCIDO ─────────────────────────────────────────────────

test("con el select recortado ahora LANZA, en vez de devolver un importe mal", () => {
  // ── LO QUE ESTE CANDADO CAMBIÓ MIENTRAS SE ESCRIBÍA, Y VALE CONTARLO ───────
  //
  // Escrito primero como reproducción, afirmaba `total === 144.086,40`: con el
  // origen bien pasado y la fórmula intacta, el select recortado igual daba el
  // número viejo. Esa versión pasó en verde y probó que la causa era el select.
  //
  // Después se agregó `exigirProductoCompleto`, y este candado se puso ROJO —
  // porque ya no hay número: hay una excepción. Ése es el arreglo funcionando, y
  // reescribirlo así es lo que corresponde. El 144.086,40 queda escrito arriba,
  // en TOTAL_VIEJO, como lo que se veía en pantalla.
  //
  // Desde el 2026-10-31 lo que se recorta es la línea, no la ficha, y el código
  // es PRESENTACION_FALTANTE: la ficha llega entera y aun así frena.
  assert.throws(
    () =>
      importeDeDetalle(comoLoDevuelveElSelect(RECORTADO_VIEJO), {
        origenEsDeposito: true,
      }),
    (e) => e.code === "PRESENTACION_FALTANTE" && /valorizacion/.test(e.message),
    "una línea sin la presentación guardada tiene que frenar, no valorizar con la ficha"
  );
});

test("el importe que mostraba la pantalla era TOTAL_VIEJO, y la diferencia es una sola línea", () => {
  // El número viejo no se puede volver a producir —la defensa lo intercepta—, así
  // que se reconstruye por su definición: es el total bueno menos lo que la
  // conversión del fiambre agrega. Sin esto, TOTAL_VIEJO sería una constante que
  // nadie comprueba y que quedaría vieja sin que se note.
  const PAPAS_SIN_CONVERTIR = 2 * 3800; // 7.600
  const PAPAS_CONVERTIDO = 2 * (3800 * 2.5); // 19.000
  assert.equal(
    TOTAL_CORRECTO - PAPAS_CONVERTIDO + PAPAS_SIN_CONVERTIR,
    TOTAL_VIEJO,
    "los 11.400 de diferencia entre las dos pantallas son exactamente esta línea"
  );
});

test("con el select completo la #97 da 155.486,40", () => {
  const total = importeDeDetalle(comoLoDevuelveElSelect(COMPLETO), {
    origenEsDeposito: true,
  });
  assert.equal(total, TOTAL_CORRECTO);
});

test("la defensa frena cualquier línea a la que le falte UNA columna de la presentación", () => {
  // Cuando la presentación se leía de la ficha, solo frenaban las líneas en kg:
  // a las de pack les alcanzaba con `factor_pack`, que todo `select` traía. Ahora
  // las seis columnas viven juntas en la línea y salen del mismo `select`, así que
  // no hay ninguna que "le alcance" sin las otras: falta una y frena, sea kg o
  // pack. No frena de más —con las seis, las cinco dan su importe—.
  const completo = comoLoDevuelveElSelect(COMPLETO);

  const esperado = {
    "BARRA TREMBLAY": 36634.4,
    "salchicha paladini": 40200,
    "Papas Congeladas": 19000,
    "Queso Cremoso Verona": 33540,
    "Salchichas Fela": 26112,
  };

  for (let i = 0; i < LINEAS_97.length; i++) {
    const nombre = LINEAS_97[i].nombre;

    const conTodo = importeDeDetalle([completo[i]], { origenEsDeposito: true });
    assert.equal(conTodo, esperado[nombre], `${nombre} con el select completo`);

    for (const falta of COMPLETO) {
      const recortado = comoLoDevuelveElSelect(COMPLETO.filter((c) => c !== falta));
      assert.throws(
        () => importeDeDetalle([recortado[i]], { origenEsDeposito: true }),
        (e) => e.code === "PRESENTACION_FALTANTE" && e.message.includes(falta),
        `${nombre} sin ${falta} tiene que frenar`
      );
    }
  }

  // Y la única cuyo importe cambia por la conversión es la del fiambre: las otras
  // dos en kg dan lo mismo con y sin la rama, así que el arreglo no toca de más.
  assert.equal(esperado["BARRA TREMBLAY"], 3.62 * 10120);
  assert.equal(esperado["Queso Cremoso Verona"], 4.3 * 7800);
});

// ── LAS SIETE SUPERFICIES, TODAS SOBRE LA MISMA #97 ─────────────────────────
//
// Emanuel lo pidió con estas palabras: "no me digas que están las dos; recorré
// TODAS las vistas de esa pantalla". Tenía razón en desconfiar: el arreglo
// anterior arregló la fila de la lista y el detalle, y dejó mal el agrupado por
// destino, el desglose por estado, los productos más transferidos y el total del
// período — cuatro superficies que nadie había enumerado.
//
// Así que la enumeración es el candado. Si mañana aparece una octava vista, este
// archivo no la va a conocer; lo que sí impide es que las siete que hay vuelvan a
// separarse.

test("las SIETE superficies dan 155.486,40 para la #97", () => {
  const detalle = comoLoDevuelveElSelect(COMPLETO);
  const t = {
    id: 97,
    estado: "Enviada",
    tieneDiferencias: false,
    destinoId: 3,
    destino: { id: 3, nombre: "Casiano casas" },
    origen: { id: 1, nombre: "Depósito", es_deposito: true },
    fechaEnvio: "2026-08-18T12:00:00.000Z",
    createdAt: "2026-08-18T12:00:00.000Z",
    detalle,
  };
  const origenEsDeposito = origenEsDepositoDe(t, "candado");

  // 1 · El detalle del remito (la pantalla que SÍ mostraba bien).
  const sumaDelDetalle = detalle.reduce(
    (acc, d) =>
      acc +
      valorizarDetalle(
        { cantidad: d.cantidad, recibido: d.recibido, unidadEnviada: d.unidadEnviada, precioCosto: d.precioCosto,
          ...columnasDeValorizacion(d) },
        { origenEsDeposito }
      ).subtotal,
    0
  );
  assert.equal(redondear(sumaDelDetalle), TOTAL_CORRECTO, "1 · detalle");

  // 2 · La fila de la lista, vista "Por transferencia".
  assert.equal(importeDeDetalle(detalle, { origenEsDeposito }), TOTAL_CORRECTO, "2 · fila de la lista");

  // 3 · El importe total del período, que barre sin paginar.
  assert.equal(
    desdeCentavos(importeDeDetalleCentavos(detalle, { origenEsDeposito })),
    TOTAL_CORRECTO,
    "3 · total del período"
  );

  // 4 · El desglose por estado. Éste tomaba el origen de la transferencia, así
  // que fallaba cuando el barrido del período no traía `origen` — que era el caso.
  const porEstado = resumenPorEstado([t]);
  assert.equal(porEstado.length, 1);
  assert.equal(porEstado[0].importeTotal, TOTAL_CORRECTO, "4 · desglose por estado");

  // 5 · Productos más transferidos: la suma de sus filas es el mismo remito.
  const productos = productosMasTransferidos([t]);
  const sumaProductos = redondear(productos.reduce((a, p) => a + p.importeTransferido, 0));
  assert.equal(sumaProductos, TOTAL_CORRECTO, "5 · productos más transferidos");
  // Y la línea del fiambre tiene que estar convertida, no solo cerrar el total.
  const papas = productos.find((p) => p.nombre === "Papas Congeladas");
  assert.equal(papas.importeTransferido, 19000, "5b · el fiambre, por pieza");

  // 6 y 7 · El agrupado por destino: el total del grupo Y la fila de adentro. La
  // captura de Emanuel es de acá, y las dos salían del mismo cálculo equivocado.
  const [grupo] = agruparPorDestino([t]);
  assert.equal(grupo.importeTotal, TOTAL_CORRECTO, "6 · total del grupo por destino");
  assert.equal(grupo.transferencias[0].totalCosto, TOTAL_CORRECTO, "7 · fila dentro del grupo");

  // Y los totales de la vista, que suman los grupos.
  assert.equal(totalesDeDestinos([grupo]).importeTotal, TOTAL_CORRECTO, "6b · totales de la vista");
});

test("los dos PDF también, y el de envío valoriza lo ENVIADO", () => {
  // El remito de envío usa `cantidadModo: "ENVIADA"`. En la #97 no hay recepción
  // cargada, así que los dos documentos dan lo mismo — y eso es lo que se
  // comprueba: que la diferencia entre ellos sea la recepción y no la conversión.
  const detalle = comoLoDevuelveElSelect(COMPLETO);
  const suma = (opts) =>
    redondear(
      detalle.reduce(
        (acc, d) =>
          acc +
          valorizarDetalle(
            { cantidad: d.cantidad, recibido: d.recibido, unidadEnviada: d.unidadEnviada, precioCosto: d.precioCosto,
              ...columnasDeValorizacion(d) },
            opts
          ).subtotal,
        0
      )
    );
  assert.equal(suma({ origenEsDeposito: true, cantidadModo: "ENVIADA" }), TOTAL_CORRECTO, "pdf de envío");
  assert.equal(suma({ origenEsDeposito: true }), TOTAL_CORRECTO, "pdf de recepción");
});

// ── LAS RUTAS, LEÍDAS DEL ARCHIVO ───────────────────────────────────────────
//
// Los de arriba prueban la fórmula contra dos formas de dato. Éstos comprueban
// que las rutas de verdad piden la forma buena. Sin esto, el arreglo se podría
// deshacer recortando un `select` y los tres candados de arriba seguirían verdes.

const RUTAS_QUE_VALORIZAN = [
  "app/api/transferencias/listar/route.js",
  "app/api/transferencias/por-destino/route.js",
  "app/api/transferencias/detalle/route.js",
  "app/api/transferencias/pdf/route.js",
  "app/api/transferencias/pdf-recepcion/route.js",
  // La lista de trabajo del teléfono, agregada el 2026-09-13. Valoriza lo
  // RECIBIDO de cada transferencia del período para armar el "a pagar" de cada
  // local, así que le corren exactamente los mismos riesgos: un `select` a
  // medias le daría un importe mal sin quejarse, que es el defecto de la #97.
  //
  // ── SE MUDÓ EL 2026-10-01, Y EL CANDADO LO SIGUE ──────────────────────────
  //
  // Estaba como "app/api/transferencias/tablero/route.js". Su `select` pasó a
  // `SELECT_TRANSFERENCIA_DE_LA_CUENTA`, en este archivo, porque desde ese día lo
  // lee también el "Pago a depósito" de Finanzas: dos copias del `select` era la
  // #97 esperando a pasar de un solo lado. Si el candado siguiera mirando la ruta
  // quedaría en rojo sin que falte nada; si la sacara de la lista sin agregar
  // éste, quedaría en verde sin mirar nada. Por eso mira el archivo donde vive
  // el `select`, y el candado de abajo exige que la ruta consulte con ÉSE.
  "lib/transferencias/cuentaDelPeriodoServer.js",
];

test("la ruta del tablero consulta con el `select` compartido, y con ningún otro", () => {
  // La contracara de la mudanza: si la ruta volviera a escribir un `select`
  // propio, el de arriba no lo vería —ya no mira la ruta—. Acá se exige que la
  // consulta use la constante y que en la ruta no quede ningún `detalle:` ni
  // `base:` escrito a mano.
  const ruta = fuenteSinComentarios("app/api/transferencias/tablero/route.js");
  assert.match(ruta, /select:\s*SELECT_TRANSFERENCIA_DE_LA_CUENTA\b/, "la consulta no usa el select compartido");
  assert.doesNotMatch(ruta, /\bdetalle:\s*\{/, "la ruta volvió a escribir el select de las líneas");
  assert.doesNotMatch(ruta, /\bbase:\s*\{/, "la ruta volvió a escribir el select del producto");
  // Y Finanzas no tiene ninguno: consume la cuenta, no consulta transferencias.
  const finanzas = fuenteSinComentarios("app/api/finanzas/tablero/route.js");
  assert.doesNotMatch(finanzas, /transferencia\.findMany|SELECT_TRANSFERENCIA_DE_LA_CUENTA/);
});

/** El texto de la ruta, sin comentarios: un candado que busca en prosa no afirma nada. */
function fuenteSinComentarios(ruta) {
  return fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

test("TODAS las rutas que valorizan traen la presentación guardada en la línea", () => {
  // Hasta el 2026-10-31 este candado pedía los cuatro campos del fiambre en
  // `base`. Ya no hacen falta ahí: la fórmula no lee la ficha. Lo que hace falta
  // es que el `select` del DETALLE traiga las seis `valorizacion*`. Se acepta
  // `detalle: { include: … }` —trae todos los escalares de la línea— o la
  // constante `SELECT_DE_VALORIZACION`, que es la que nombra las seis en un solo
  // lugar. Nombrarlas a mano no se acepta: es la copia que se queda vieja.
  const faltantes = [];
  for (const ruta of RUTAS_QUE_VALORIZAN) {
    const src = fuenteSinComentarios(ruta);
    if (/detalle:\s*\{\s*include:/.test(src)) continue;
    if (!/\.\.\.SELECT_DE_VALORIZACION\b/.test(src)) faltantes.push(ruta);
  }
  assert.deepEqual(
    faltantes,
    [],
    "estas rutas valorizan sin la presentación de la línea, así que no pueden " +
      "normalizar el precio congelado:\n  " + faltantes.join("\n  ")
  );
});

test("las rutas que arman la línea campo por campo le pasan la presentación guardada", () => {
  // Los dos PDF traen la línea entera con `include`, pero no se la pasan tal
  // cual a `valorizarDetalle`: arman un objeto nuevo copiando campo por campo.
  // Ahí el `select` completo no alcanza — si la copia se olvida las seis, la
  // línea llega sin ellas igual. Es el mismo hueco de la #198, del lado de la
  // presentación valorizada.
  for (const ruta of ["app/api/transferencias/pdf/route.js", "app/api/transferencias/pdf-recepcion/route.js"]) {
    const src = fuenteSinComentarios(ruta);
    const desde = src.indexOf("valorizarDetalle(");
    assert.ok(desde >= 0, `${ruta} dejó de valorizar con valorizarDetalle`);
    const llamada = src.slice(desde, desde + 1200);
    assert.match(
      llamada,
      /\.\.\.columnasDeValorizacion\(d\)/,
      `${ruta} arma la línea sin la presentación con la que se valorizó`
    );
  }
});

test("TODAS las rutas que valorizan piden es_deposito del origen", () => {
  // `origen: true` trae la tabla entera. Un `select` acotado tiene que nombrarlo:
  // sin la columna, `t.origen?.es_deposito === true` da `false` en silencio y el
  // control de origen obligatorio lo deja pasar porque `false` es un booleano.
  const faltantes = [];
  for (const ruta of RUTAS_QUE_VALORIZAN) {
    const src = fuenteSinComentarios(ruta);
    if (/origen:\s*true/.test(src)) continue;
    if (!src.includes("es_deposito")) faltantes.push(ruta);
  }
  assert.deepEqual(
    faltantes,
    [],
    "estas rutas no traen es_deposito, así que valorizan como si nada saliera del " +
      "depósito:\n  " + faltantes.join("\n  ")
  );
});

// ── Y EL TERCERO DE LA MISMA FAMILIA: EL SNAPSHOT DE PRESENTACIÓN ───────────
//
// Los dos de arriba nacieron de la #97, donde el importe salía mal porque la
// ruta traía el PRODUCTO a medias. Éste nace de la #198, donde salía mal porque
// traía la LÍNEA a medias: sin el snapshot, `valorizarLineaDelRemito` tiene que
// reconstruir la presentación desde los campos crudos y los 6 packs se releen
// como 6 unidades sueltas.
//
// Es el mismo defecto con otro sujeto, y por eso el candado tiene la misma forma.

const CAMPOS_DEL_SNAPSHOT = [
  "presentacionEnvio",
  "cantidadPresentada",
  "factorPresentacion",
  "sueltasEnviadas",
  "pesoPiezaKg",
];

test("TODAS las rutas que valorizan traen el snapshot de presentación de la línea", () => {
  const faltantes = [];
  for (const ruta of RUTAS_QUE_VALORIZAN) {
    const src = fuenteSinComentarios(ruta);
    // `detalle: { include: … }` trae todos los escalares de la línea, igual que
    // pasa con `base`. El que recorta es `select`.
    if (/detalle:\s*\{\s*include:/.test(src)) continue;
    for (const campo of CAMPOS_DEL_SNAPSHOT) {
      // ── POR QUÉ NO ES UN `includes` ─────────────────────────────────────
      //
      // Lo era, y la contraprueba lo encontró: renombrar la clave a
      // `presentacionEnvioNo` dejaba el candado en VERDE, porque el nombre
      // viejo es prefijo del nuevo. Un candado que busca una subcadena suelta
      // se conforma con cualquier identificador que la contenga. Tiene que
      // pedir la CLAVE: el nombre seguido de dos puntos.
      if (!new RegExp(`\\b${campo}\\s*:`).test(src)) faltantes.push(`${ruta} → falta ${campo}`);
    }
  }
  assert.deepEqual(
    faltantes,
    [],
    "estas rutas valorizan con la línea incompleta, así que una presentación en " +
      "packs se relee como unidades sueltas:\n  " + faltantes.join("\n  ")
  );
});

// ── Y LAS SUELTAS RECIBIDAS, QUE ES EL CUARTO DE LA FAMILIA ─────────────────
//
// La lista y el agrupado por destino pedían `recibido` sin
// `recibidoUnidadesSueltas`. `cantidadesDeDetalle` las leía como 0: una línea
// PACK x12 que mandó 2 y recibió 1 bulto + 12 sueltas salía con "Recibido 12" y
// un faltante de 12 que no existe. Mismo defecto que la #373, en la lista.

/** Una línea PACK x12 tal como la trae el `select`: enviada 2, recibida 1 + 12 sueltas. */
const PACK_CON_SUELTAS = Object.freeze({
  cantidad: 2,
  recibido: 1,
  recibidoUnidadesSueltas: 12,
  unidadEnviada: "BULTO",
  presentacionEnvio: "PACK",
  cantidadPresentada: 2,
  sueltasEnviadas: 0,
  factorPresentacion: 12,
  pesoPiezaKg: null,
});

test("SUELTAS · la cantidad recibida de la lista suma las sueltas y no inventa un faltante", () => {
  const { cantidadEnviada, cantidadRecibida } = cantidadesDeDetalle([PACK_CON_SUELTAS]);
  assert.equal(cantidadEnviada, 24);
  assert.equal(cantidadRecibida, 24, "las sueltas recibidas no se sumaron");
  // Es la cuenta con la que `FilaTransferencia` y `CardTransferencia` deciden el faltante.
  assert.equal(diferenciaDeLinea({ enviada: cantidadEnviada, recibida: cantidadRecibida }), 0);
  // Y solo sueltas, sin bultos, también cuentan.
  const soloSueltas = cantidadesDeDetalle([{ ...PACK_CON_SUELTAS, recibido: 0, recibidoUnidadesSueltas: 3 }]);
  assert.equal(soloSueltas.cantidadRecibida, 3);
  // Y por qué importa el `select`: la misma línea sin la columna cuenta 12.
  const { recibidoUnidadesSueltas, ...sinLaColumna } = PACK_CON_SUELTAS;
  assert.equal(recibidoUnidadesSueltas, 12);
  assert.equal(cantidadesDeDetalle([sinLaColumna]).cantidadRecibida, 12);
});

test("SUELTAS · TODAS las rutas que valorizan piden recibidoUnidadesSueltas", () => {
  const faltantes = [];
  for (const ruta of RUTAS_QUE_VALORIZAN) {
    const src = fuenteSinComentarios(ruta);
    if (/detalle:\s*\{\s*include:/.test(src)) continue;
    if (!/\brecibidoUnidadesSueltas\s*:/.test(src)) faltantes.push(ruta);
  }
  assert.deepEqual(
    faltantes,
    [],
    "estas rutas leen lo recibido sin las sueltas, así que las cuentan como 0:\n  " +
      faltantes.join("\n  ")
  );
});

// ════════════════════════════════════════════════════════════════════════════
// EL ACTA DE RECEPCIÓN SIGUE CONTESTANDO CUÁNTO VALE LO RECIBIDO
// ════════════════════════════════════════════════════════════════════════════
//
// El reporte del período pasó a hablar del importe ENVIADO. El acta NO: es el
// papel con el que el destino reclama, así que su pregunta es cuánto llegó —y
// tiene que incluir las sueltas, que es donde se esconden las diferencias.
//
// Una escala; dos cantidades posibles. Las dos salen del mismo descriptor.
//
// El caso es el de la #191: PACK x12, el pack cuesta 21.600.

// `precioCosto` está POR BULTO, que es como lo guarda el catálogo y como lo
// copia `crearTransferencia`. El costo por unidad —1.800— lo deriva
// `resolverCostoTransferencia` dividiendo por `factor_pack`; escribirlo por
// unidad acá sería inventar una convención que la base no tiene.
const LINEA_191 = Object.freeze({
  cantidad: 12,
  unidadEnviada: "UNIDAD",
  precioCosto: 21600,
  presentacionEnvio: "PACK",
  cantidadPresentada: 1,
  factorPresentacion: 12,
  sueltasEnviadas: 0,
});

const BASE_191 = Object.freeze({
  precio_costo: 21600,
  unidad_medida: "pack",
  factor_pack: 12,
  nombre: "Producto de la #191",
  pesoEsFijo: false,
  pesoReferenciaKg: null,
  modoVentaDeposito: "UNIDAD",
  modoCompraProveedor: "BULTO",
});

const actaDe = (parche) =>
  valorizarDetalle(conFicha({ ...LINEA_191, ...parche }, BASE_191), { origenEsDeposito: true });

test("ACTA · el costo del pack es 21.600 y el remito vale 21.600", () => {
  const remito = valorizarLineaDelRemito(conFicha(LINEA_191, BASE_191), { origenEsDeposito: true });
  assert.equal(remito.costoPresentacion, 21600, "el rótulo PACK x12 con el costo de una unidad");
  assert.equal(remito.subtotal, 21600, "el importe enviado");
});

test("ACTA · 4 packs recibidos valen 4 packs, no 4 unidades", () => {
  const { subtotal, cantidad } = actaDe({ recibido: 4, recibidoUnidadesSueltas: 0 });
  assert.equal(subtotal, 4 * 21600, "sin el snapshot daban 4 × 1.800 = 7.200");
  assert.equal(cantidad, 48, "la cantidad que imprime el acta está en unidades físicas");
});

test("ACTA · 5 packs y 7 sueltas incluyen las sueltas", () => {
  const { subtotal, cantidad } = actaDe({ recibido: 5, recibidoUnidadesSueltas: 7 });
  assert.equal(cantidad, 5 * 12 + 7);
  assert.equal(subtotal, 5 * 21600 + 7 * 1800, "las 7 sueltas valen 12.600 y no pueden faltar");
});

test("ACTA · el caso #191 completo: enviado 21.600, recibido 201.600", () => {
  // Once veces más de lo enviado. No es un defecto del cálculo: es un remito con
  // una diferencia enorme, y el acta existe para dejarla escrita.
  const { subtotal } = actaDe({ recibido: 1, recibidoUnidadesSueltas: 100 });
  assert.equal(subtotal, 201600);
  assert.equal(
    valorizarLineaDelRemito(conFicha(LINEA_191, BASE_191), { origenEsDeposito: true }).subtotal,
    21600,
    "el importe enviado no se movió por lo que contó el destino"
  );
});

test("REMITO DE ENVÍO · su total coincide con la primitiva canónica, línea por línea", () => {
  // ── POR QUÉ UN CANDADO Y NO UN CAMBIO EN LA RUTA ──────────────────────────
  //
  // `pdf/route.js` valoriza con `cantidadModo: "ENVIADA"`, que multiplica la
  // cantidad física por el costo en la escala de `unidadEnviada`. Da el mismo
  // número que `valorizarLineaDelRemito` —se comprueba acá abajo, en las cinco
  // formas de línea—, pero por otro camino.
  //
  // No se lo cambió a la primitiva porque la ruta IMPRIME ese par: la columna
  // "Cant." y la columna "Costo" del remito son exactamente `cantidad` y
  // `costoUnitario` de esa llamada. Pasarlas a la escala de la presentación
  // cambiaría lo que dice un documento, y esta tanda no estaba autorizada a
  // tocar documentos.
  //
  // Lo que sí corresponde es que no puedan separarse en silencio: si algún día
  // las dos interpretaciones dejan de coincidir, este candado se pone rojo y la
  // decisión se toma mirando, en vez de descubrirse en una foto de un remito.
  const LINEAS = [
    ["UNIDAD sin snapshot", { cantidad: 10, unidadEnviada: "UNIDAD", precioCosto: 500 },
      { precio_costo: 500, unidad_medida: "unidad", factor_pack: 1, pesoEsFijo: false,
        pesoReferenciaKg: null, modoVentaDeposito: "UNIDAD", modoCompraProveedor: "UNIDAD" }],
    ["BULTO sin snapshot", { cantidad: 3, unidadEnviada: "BULTO", precioCosto: 23500 },
      { precio_costo: 23500, unidad_medida: "pack", factor_pack: 12, pesoEsFijo: false,
        pesoReferenciaKg: null, modoVentaDeposito: "UNIDAD", modoCompraProveedor: "BULTO" }],
    ["PACK con snapshot", LINEA_191, BASE_191],
    ["PACK con sueltas enviadas", { ...LINEA_191, cantidad: 19, cantidadPresentada: 1, sueltasEnviadas: 7 }, BASE_191],
    ["KG", { cantidad: 3.62, unidadEnviada: "UNIDAD", precioCosto: 10120 },
      { precio_costo: 10120, unidad_medida: "kg", factor_pack: null, pesoEsFijo: false,
        pesoReferenciaKg: 4.1, modoVentaDeposito: "PESO", modoCompraProveedor: "UNIDAD" }],
  ];

  for (const [caso, linea, base] of LINEAS) {
    const pdf = valorizarDetalle(conFicha(linea, base), { origenEsDeposito: true, cantidadModo: "ENVIADA" });
    const canonica = valorizarLineaDelRemito(conFicha(linea, base), { origenEsDeposito: true });
    assert.equal(
      redondear(pdf.subtotal),
      redondear(canonica.subtotal),
      `el remito de envío y la primitiva canónica se separaron (${caso})`
    );
  }
});

test("ACTA · recibir 0 vale 0, y no haber contado todavía vale lo enviado", () => {
  // La distinción entre null y 0 es la que más veces se perdió en este módulo.
  assert.equal(actaDe({ recibido: 0, recibidoUnidadesSueltas: 0 }).subtotal, 0);
  assert.equal(actaDe({ recibido: null, recibidoUnidadesSueltas: null }).subtotal, 21600);
});

test("ACTA · y la RUTA le pasa el snapshot y las sueltas, no solo `recibido`", () => {
  // Los cinco de arriba prueban la fórmula. Éste prueba que el acta la use con
  // la línea completa: es exactamente el hueco por el que entró la #198.
  const src = fuenteSinComentarios("app/api/transferencias/pdf-recepcion/route.js");
  const llamada = src.slice(src.indexOf("valorizarDetalle("), src.indexOf("valorizarDetalle(") + 800);
  for (const campo of [...CAMPOS_DEL_SNAPSHOT, "recibidoUnidadesSueltas"]) {
    assert.ok(
      new RegExp(`${campo}:\\s*d\\.${campo}`).test(llamada),
      `el acta dejó de pasar ${campo}, así que vuelve a valorizar en la escala equivocada`
    );
  }
});
