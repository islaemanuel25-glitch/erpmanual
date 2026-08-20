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
} from "./agregadosPeriodo.js";
import { valorizarDetalle, origenEsDepositoDe } from "./costoTransferencia.js";

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
 * Arma el detalle como lo devolvería Prisma, dejando de `base` SOLO las columnas
 * que se le pidan. Es el corazón del archivo: recortar acá es recortar el
 * `select`, y las columnas que no se piden llegan `undefined`, no `null`.
 */
function comoLoDevuelveElSelect(columnasDeBase) {
  return LINEAS_97.map((l) => {
    const base = {};
    for (const col of columnasDeBase) base[col] = l.base[col];
    return {
      cantidad: l.cantidad,
      recibido: l.recibido,
      precioCosto: l.precioCosto,
      unidadEnviada: l.unidadEnviada,
      producto: { precio_costo: null, base },
    };
  });
}

// Las columnas de `base` que pide cada ruta. Se leen del archivo de la ruta en el
// candado de más abajo, así que esta lista no se puede quedar vieja en silencio.
const COMPLETO = ["precio_costo", "unidad_medida", "factor_pack", "nombre",
                  "pesoEsFijo", "pesoReferenciaKg", "modoVentaDeposito", "modoCompraProveedor"];
const RECORTADO_VIEJO = ["precio_costo", "unidad_medida", "factor_pack", "nombre"];

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
  assert.throws(
    () =>
      importeDeDetalle(comoLoDevuelveElSelect(RECORTADO_VIEJO), {
        origenEsDeposito: true,
      }),
    (e) =>
      e.code === "PRODUCTO_INCOMPLETO" &&
      /pesoReferenciaKg|modoCompraProveedor|modoVentaDeposito/.test(e.message),
    "un producto sin las columnas del fiambre tiene que frenar, no valorizar de menos"
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

test("la defensa frena exactamente las líneas donde el fiambre es posible, y ninguna más", () => {
  // Con el select recortado, las tres líneas en kg frenan —cualquiera de ellas
  // PODRÍA ser fiambre de pieza fija y no hay forma de saberlo— y las dos de pack
  // pasan y dan el mismo importe que con el select completo. Que las de pack no
  // frenen es la mitad que importa: una defensa que frena todo es una que se
  // termina apagando.
  const completo = comoLoDevuelveElSelect(COMPLETO);
  const recortado = comoLoDevuelveElSelect(RECORTADO_VIEJO);

  const esperado = {
    "BARRA TREMBLAY": 36634.4,
    "salchicha paladini": 40200,
    "Papas Congeladas": 19000,
    "Queso Cremoso Verona": 33540,
    "Salchichas Fela": 26112,
  };

  for (let i = 0; i < LINEAS_97.length; i++) {
    const nombre = LINEAS_97[i].nombre;
    const enKg = LINEAS_97[i].base.unidad_medida === "kg";

    const conTodo = importeDeDetalle([completo[i]], { origenEsDeposito: true });
    assert.equal(conTodo, esperado[nombre], `${nombre} con el select completo`);

    if (enKg) {
      assert.throws(
        () => importeDeDetalle([recortado[i]], { origenEsDeposito: true }),
        (e) => e.code === "PRODUCTO_INCOMPLETO",
        `${nombre} está en kg: sin las columnas del fiambre tiene que frenar`
      );
    } else {
      assert.equal(
        importeDeDetalle([recortado[i]], { origenEsDeposito: true }),
        esperado[nombre],
        `${nombre} no está en kg: el select recortado le alcanza y no debe frenar`
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
        { cantidad: d.cantidad, recibido: d.recibido, unidadEnviada: d.unidadEnviada, precioCosto: d.precioCosto },
        d.producto.base,
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
            { cantidad: d.cantidad, recibido: d.recibido, unidadEnviada: d.unidadEnviada, precioCosto: d.precioCosto },
            d.producto.base,
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
];

/** El texto de la ruta, sin comentarios: un candado que busca en prosa no afirma nada. */
function fuenteSinComentarios(ruta) {
  return fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

test("TODAS las rutas que valorizan piden los campos del fiambre de pieza fija", () => {
  // `include: { base: true }` trae la tabla entera y por eso alcanza; un `select`
  // acotado tiene que nombrar los cuatro. Las dos formas se aceptan, lo que no se
  // acepta es pedir `base` a medias.
  const faltantes = [];
  for (const ruta of RUTAS_QUE_VALORIZAN) {
    const src = fuenteSinComentarios(ruta);
    if (/base:\s*true/.test(src)) continue; // trae todas las columnas
    for (const campo of ["pesoEsFijo", "pesoReferenciaKg", "modoVentaDeposito", "modoCompraProveedor"]) {
      if (!src.includes(campo)) faltantes.push(`${ruta} → falta ${campo}`);
    }
  }
  assert.deepEqual(
    faltantes,
    [],
    "estas rutas valorizan con un producto incompleto, así que el fiambre de pieza " +
      "fija no se convierte y el importe sale mal:\n  " + faltantes.join("\n  ")
  );
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
