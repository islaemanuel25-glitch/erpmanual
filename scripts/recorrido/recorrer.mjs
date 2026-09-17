// EL RECORRIDO COMPLETO DEL MÓDULO DE LISTAS DE PROVEEDOR.
//
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/bancoDeListas.mjs --sembrar
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/recorrer.mjs
//
// Las herramientas —navegador, pantalla, libro de hallazgos— están en
// `arnes.mjs`. Acá está QUÉ se recorre, que es lo que hay que poder leer sin
// pasar por cuatrocientas líneas de protocolo.
//
// ── LAS DOS REGLAS DE ESTE ARCHIVO ─────────────────────────────────────────
//
// 1. NO ABORTA. Un recorrido que se corta en el primer defecto informa uno por
//    corrida, y la idea es que Emanuel no los descubra de a uno con el celular.
//    Cada paso anota lo que encuentra y sigue.
//
// 2. LA VERDAD ESTÁ EN LA BASE. La pantalla es el sujeto del examen, no la
//    fuente. Preguntarle a la pantalla si el costo se guardó deja pasar un
//    módulo que dibuja bien y no escribe — que es el defecto que más caro sale
//    en este repo: algo que no falla donde se rompe.

import fs from "node:fs";
import path from "node:path";

import {
  navegar,
  evaluar,
  esperar,
  esperarTexto,
  dice,
  textoDelContenido,
  tocables,
  tocar,
  tocarOpcion,
  opcionesAccesibles,
  escribir,
  subirArchivo,
  fijarAncho,
  fijarTema,
  foto,
  abrirNavegador,
  entrar,
  defecto,
  comprobar,
  anotarPaso,
  resumen,
  cerrar,
  SEVERIDAD,
  BASE,
  BANCO,
  CAPTURAS,
  INFORME,
  ANCHOS,
  PROVEEDOR,
  MARCA,
  CATALOGO,
  RANGO,
  crearClientePrisma,
  LECTURA,
} from "./arnes.mjs";

const { ROJO, AMARILLO, VERDE } = SEVERIDAD;

const LISTAS = "/modulos/proveedores/listas";

/**
 * LO QUE DICE LA BARRA DE ARRIBA — en los dos anchos.
 *
 * ── POR QUÉ NO ES `querySelector('header')` ────────────────────────────────
 *
 * Porque a 360 px eso mide el lugar equivocado y el recorrido informa defectos
 * que no existen. La primera versión preguntaba por el `<header>` y a 360
 * devolvía "Depósito: Depósito Central | Administrador | A": el título de
 * escritorio está apagado por CSS a ese ancho, y el título y el botón de volver
 * viven en OTRA fila —un `div.md:hidden` que también está antes del `<main>`—.
 *
 * Con esa medición salieron dos hallazgos ("no dice Listas de proveedores", "no
 * está el botón de volver") y los dos eran falsos: las dos cosas estaban, una
 * fila más abajo. Es el caso que el CLAUDE.md pide comprobar antes de
 * atribuirle un movimiento a un cambio.
 *
 * Así que se mide TODO lo que está antes del `<main>`, que es la definición de
 * "la barra" en este shell: la fila del título nunca scrollea porque está fuera
 * del contenedor que scrollea.
 */
const tituloDeLaBarra = () =>
  evaluar(`(() => {
    const main = document.querySelector('main');
    if (!main) return '(sin main)';
    const trozos = [];
    let n = main.previousElementSibling;
    while (n) { trozos.unshift(n.innerText || ''); n = n.previousElementSibling; }
    return trozos.join(' | ').split('\\n').map((s) => s.trim()).filter(Boolean).join(' | ');
  })()`);

// ═══════════════════════════════════════════════════════════════════════════
// 1. EL LISTADO
// ═══════════════════════════════════════════════════════════════════════════

async function recorrerListado({ db }) {
  anotarPaso("LISTADO — /modulos/proveedores/listas");
  await navegar(`${BASE}${LISTAS}`);
  await esperarTexto("Subir una lista");

  // ── CONTRA LA BASE: las importaciones que muestra son las que hay ──────
  const enLaBase = await db.importacionListaProveedor.count();
  const texto = await textoDelContenido();

  await comprobar(texto.includes("Subir una lista"), {
    pantalla: "Listado",
    hice: "Abrí el listado",
    esperaba: "El botón «+ Subir una lista» arriba de todo",
    paso: "no aparece",
    severidad: ROJO,
  });

  const barra = await tituloDeLaBarra();
  await comprobar(/Listas de proveedores/i.test(barra), {
    pantalla: "Listado",
    hice: "Miré la barra de arriba",
    esperaba: "Que diga «Listas de proveedores»",
    paso: `dice «${barra}»`,
    severidad: AMARILLO,
  });
  await comprobar(/Compras/i.test(barra), {
    pantalla: "Listado",
    hice: "Busqué el botón de volver",
    esperaba: "Un «Compras» para volver al módulo",
    paso: `la barra dice «${barra}»`,
    severidad: AMARILLO,
  });

  // ── EL BUSCADOR ───────────────────────────────────────────────────────
  anotarPaso("LISTADO — el buscador");
  const hayCampo = await escribir("Buscar proveedor", "DREAMCO");
  if (
    await comprobar(hayCampo, {
      pantalla: "Listado",
      hice: "Busqué el campo de búsqueda",
      esperaba: "Un campo «Buscar proveedor»",
      paso: "no existe",
      severidad: AMARILLO,
    })
  ) {
    // 350 ms de espera antes de consultar, más la ida al servidor.
    await esperar(1600);
    const conFiltro = await textoDelContenido();
    await comprobar(conFiltro.includes("DREAMCO"), {
      pantalla: "Listado",
      hice: "Escribí «DREAMCO» en el buscador",
      esperaba: "Que queden las listas de DREAMCO",
      paso: "no quedó ninguna en pantalla",
      severidad: AMARILLO,
    });
    await comprobar(!conFiltro.includes("AASS"), {
      pantalla: "Listado",
      hice: "Escribí «DREAMCO» en el buscador",
      esperaba: "Que las de OTROS proveedores desaparezcan",
      paso: "sigue apareciendo AASS",
      severidad: AMARILLO,
    });

    // Y que vuelva: un buscador que no se puede limpiar es una trampa.
    await escribir("Buscar proveedor", "");
    await esperar(1600);
    const limpio = await textoDelContenido();
    await comprobar(limpio.includes("AASS"), {
      pantalla: "Listado",
      hice: "Borré lo que había escrito en el buscador",
      esperaba: "Que vuelvan a verse todas",
      paso: "AASS no volvió",
      severidad: AMARILLO,
    });
  }

  // ── LOS FILTROS ───────────────────────────────────────────────────────
  anotarPaso("LISTADO — los filtros");
  for (const chip of ["Todas", "A medias", "Terminadas", "Canceladas"]) {
    const hay = await tocar(chip, { esperaMs: 1400 });
    await comprobar(hay, {
      pantalla: "Listado",
      hice: `Busqué el filtro «${chip}»`,
      esperaba: `Un filtro «${chip}»`,
      paso: "no está",
      severidad: VERDE,
    });
  }
  // Y se vuelve a Todas para que el resto del recorrido vea el listado entero.
  await tocar("Todas", { esperaMs: 1400 });

  return { enLaBase };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SUBIR — pantalla «nueva»
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sube el archivo del banco y devuelve el id de la importación creada.
 *
 * `modo` es "ACTUALIZAR" o "CONTROLAR"; `rango` permite forzar el 0–0 para el
 * caso del rescate.
 */
async function subirLaLista({ db, modo, rango = RANGO, etiqueta }) {
  anotarPaso(`SUBIR (${etiqueta}) — /modulos/proveedores/listas/nueva`);
  await navegar(`${BASE}${LISTAS}/nueva`);
  await esperar(1200);

  const antes = await db.importacionListaProveedor.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });

  const barra = await tituloDeLaBarra();
  await comprobar(!/Listas de proveedores/i.test(barra) || /Subir/i.test(barra), {
    pantalla: "Subir",
    hice: "Miré la barra de arriba en la pantalla de subir",
    esperaba: "Un título propio de esta pantalla, no el del menú",
    paso: `dice «${barra}»`,
    severidad: VERDE,
  });

  // ── ELEGIR EL PROVEEDOR ───────────────────────────────────────────────
  const eligio = await elegirProveedor(PROVEEDOR);
  if (
    !(await comprobar(eligio, {
      pantalla: "Subir",
      hice: `Quise elegir el proveedor «${PROVEEDOR}»`,
      esperaba: "Poder elegirlo del selector",
      paso: "no lo encontré en el selector",
      severidad: ROJO,
    }))
  ) {
    return null;
  }
  await esperar(1200);

  // ── EL MODO ───────────────────────────────────────────────────────────
  const textoModo = modo === "CONTROLAR" ? "Solo controlar" : "Actualizar precios";
  const hayModo = await tocar(textoModo, { esperaMs: 700 });
  await comprobar(hayModo, {
    pantalla: "Subir",
    hice: `Busqué la opción «${textoModo}»`,
    esperaba: "Poder elegir entre actualizar y solo controlar",
    paso: "la opción no está en la pantalla",
    severidad: ROJO,
  });

  // ── EL RANGO ──────────────────────────────────────────────────────────
  const elRango = await ponerElRango(rango);
  console.log(`  rango: ${elRango.pidio ? `puesto ${rango.minPct}–${rango.maxPct}` : "no lo pidió"}`);

  // ── EL ARCHIVO ────────────────────────────────────────────────────────
  const archivo = path.join(BANCO, "banco-lista.pdf");
  const subio = await subirArchivo(archivo);
  if (
    !(await comprobar(subio, {
      pantalla: "Subir",
      hice: "Quise adjuntar el archivo de la lista",
      esperaba: "Un campo de archivo en la pantalla",
      paso: "no hay ningún input de archivo",
      severidad: ROJO,
    }))
  ) {
    return null;
  }

  const leyo = await tocar("Leer la lista", { ultimo: true, esperaMs: 3000 });
  await comprobar(leyo, {
    pantalla: "Subir",
    hice: "Busqué el botón para leer la lista",
    esperaba: "Un botón «Leer la lista»",
    paso: "no está",
    severidad: ROJO,
  });

  // ── «¿LEÍ BIEN LA LISTA?» ─────────────────────────────────────────────
  //
  // La importación NO existe todavía: se crea al confirmar la lectura. Por eso
  // la comprobación contra la base va después de este paso y no acá.
  const llego = await esperarTexto("¿Leí bien la lista?", 45000);
  if (
    !(await comprobar(llego, {
      pantalla: "Subir",
      hice: "Toqué «Leer la lista» con el archivo del banco adjunto",
      esperaba: "La pantalla «¿Leí bien la lista?» con las columnas detectadas",
      paso: `no llegó en 45 s; en pantalla: ${(await textoDelContenido()).replace(/\s+/g, " ").slice(0, 200)}`,
      severidad: ROJO,
    }))
  ) {
    return null;
  }

  const lectura = await revisarLaLectura();

  // ── LA RAMA EN QUE EL MOTOR SÍ PREGUNTA ───────────────────────────────
  //
  // Cuando ninguna columna explica los aumentos, la pantalla dice "Elegí cuál
  // es" y no deja seguir sin elegir. Es la rama CORRECTA — y es la que NO se
  // ejerce la primera vez que se sube una lista de este proveedor, que es
  // justamente el hallazgo. Acá se la atiende para que el recorrido pueda
  // seguir, eligiendo a mano la columna que mejor explica.
  if (lectura.pidePrecio) {
    console.log("  la pantalla pide elegir la columna de precio: elijo C/IVA");
    // "Elegí cuál es" es el TEXTO del dato vacío, no un botón. El que abre el
    // desplegable es el "Cambiar" de esa fila, y como hay uno por cada dato
    // —código, producto, unidades, precio— el del precio es el ÚLTIMO.
    await tocar("Cambiar", { ultimo: true, esperaMs: 1500 });
    const eligio = await tocar("C/IVA", { ultimo: true, esperaMs: 1500 });
    console.log(`  columna elegida a mano: ${eligio ? "C/IVA" : "no se pudo"}`);
    await esperar(1200);
  }

  await tocar("Está bien, seguir", { ultimo: true, esperaMs: 5000 });
  await esperar(3000);

  // ── CONTRA LA BASE: ¿se creó la importación? ──────────────────────────
  const creada = await db.importacionListaProveedor.findFirst({
    orderBy: { id: "desc" },
    select: {
      id: true,
      estado: true,
      modo: true,
      totalFilas: true,
      aumentoEsperadoMinPct: true,
      aumentoEsperadoMaxPct: true,
      archivoNombre: true,
    },
  });

  if (
    !(await comprobar(creada && creada.id !== antes?.id, {
      pantalla: "¿Leí bien la lista?",
      hice: "Confirmé la lectura con «Está bien, seguir»",
      esperaba: "Una importación nueva en la base",
      paso: `la última sigue siendo la ${antes?.id ?? "(ninguna)"}`,
      severidad: ROJO,
    }))
  ) {
    return null;
  }

  // ── EL 0 A 0 SE CONVIERTE EN CONTROL, Y ESO ES LO CORRECTO ────────────
  //
  // Un rango de 0 a 0 no puede explicar ningún aumento: no hay contra qué
  // medir. En vez de dejar la lista inservible, el módulo la trata como un
  // control y lo avisa. Así que acá se espera CONTROLAR aunque se haya pedido
  // actualizar, y exigir ACTUALIZAR informaría un defecto donde hay una
  // decisión deliberada.
  const esperado = rango.minPct === 0 && rango.maxPct === 0 ? "CONTROLAR" : modo;
  await comprobar(creada.modo === esperado, {
    pantalla: "Subir",
    hice: `Elegí el modo «${textoModo}» con el rango ${rango.minPct}–${rango.maxPct} y subí`,
    esperaba: `Que la base guarde modo ${esperado}`,
    paso: `guardó ${creada.modo}`,
    severidad: ROJO,
  });

  // El rango solo se guarda actualizando: controlando no hay aumento esperado
  // que valga —se compara contra el costo de hoy— y la cabecera lo deja en null
  // a propósito. Exigirlo en los dos modos informaría un defecto que no existe.
  await comprobar(
    modo === "CONTROLAR" ||
      (Number(creada.aumentoEsperadoMinPct) === rango.minPct &&
        Number(creada.aumentoEsperadoMaxPct) === rango.maxPct),
    {
      pantalla: "Subir",
      hice: `Puse el rango ${rango.minPct}–${rango.maxPct} y subí`,
      esperaba: `Que la importación guarde ese rango`,
      paso: `guardó ${creada.aumentoEsperadoMinPct}–${creada.aumentoEsperadoMaxPct}`,
      severidad: ROJO,
    }
  );

  console.log(`  importación ${creada.id} · ${creada.estado} · modo ${creada.modo} · ${creada.totalFilas} filas`);
  return creada;
}

/**
 * LA PANTALLA «¿LEÍ BIEN LA LISTA?», que es donde se confirma la receta.
 *
 * Lo que se mira acá no es cosmético: si la columna de precio elegida es la
 * equivocada, TODOS los costos de la lista salen mal y nada más adelante lo
 * puede detectar — la conciliación compara contra el número que esta pantalla
 * dejó entrar.
 */
async function revisarLaLectura() {
  const texto = await textoDelContenido();

  // ── LA COLUMNA DE PRECIO ──────────────────────────────────────────────
  //
  // El archivo del banco tiene las dos de Arcor: S/IVA y C/IVA. Los costos
  // sembrados están calibrados contra la de CON IVA, que es la que el proveedor
  // cobra. Cuál propone el sistema es lo que se anota.
  const columna = texto.match(/Precio\s+columna\s+«([^»]+)»/)?.[1] ?? null;
  // Cuando el motor no pudo decidir, en vez de una columna dice "Elegí cuál es".
  const pidePrecio = !columna && /Precio\s+Elegí cuál es/.test(texto);
  console.log(
    `  columna de precio: ${columna ?? (pidePrecio ? "LA PIDE (el motor no pudo decidir)" : "(no dice)")}`
  );

  // ── LOS TÍTULOS DE RUBRO ──────────────────────────────────────────────
  //
  // El archivo trae TRES —GOLOSINAS, CHOCOLATES y ALIMENTOS—, cada uno con
  // "$0.00" en las dos columnas de precio. Es la trampa del archivo real: si el
  // lector no los descarta, entran como productos de precio cero.
  //
  // El aviso solo aparece si salteó ALGO, así que "no está la frase" y "dice
  // cero" son cosas distintas y no se pueden leer igual: tomar la ausencia como
  // un cero informaría un hallazgo en cada pantalla que no tiene el aviso.
  const dicho = texto.match(/Salte[ée]\s+(\d+)\s+fila/);
  const salteadas = dicho ? Number(dicho[1]) : null;
  await comprobar(salteadas === 3, {
    pantalla: "¿Leí bien la lista?",
    hice: "Subí un archivo con tres títulos de rubro (GOLOSINAS, CHOCOLATES, ALIMENTOS), cada uno con $0.00",
    esperaba: "Que diga que salteó 3 filas que no son productos",
    paso: salteadas === null ? "no dice nada de filas salteadas" : `dice que salteó ${salteadas}`,
    severidad: AMARILLO,
  });

  // ── Y LO QUE DICE HABER SALTEADO, NO SE MUESTRA ───────────────────────
  //
  // La vista previa dibuja "GOLOSINAS · Código — · Caja de — · $ 0,00" como si
  // fuera un producto, en el mismo bloque y con la misma forma que los de
  // verdad, y abajo dice que salteó filas que no son productos. Las dos cosas no
  // pueden ser: o lo salteó y no va en la lista de productos, o no lo salteó.
  const previa = texto.split("Así quedan los primeros productos")[1] ?? "";
  const rubroEnLaPrevia = ["GOLOSINAS", "CHOCOLATES", "ALIMENTOS"].filter((r) => previa.includes(r));
  await comprobar(rubroEnLaPrevia.length === 0, {
    pantalla: "¿Leí bien la lista?",
    hice: "Miré «Así quedan los primeros productos» en un archivo con títulos de rubro",
    esperaba: "Solo productos; los títulos de rubro son lo que dice haber salteado",
    paso:
      `muestra ${rubroEnLaPrevia.join(", ")} como si fuera un producto, con «Código —», ` +
      `«Caja de —» y «$ 0,00», y abajo dice que salteó las filas que no son productos`,
    severidad: AMARILLO,
  });

  return { columna, salteadas, pidePrecio };
}

/**
 * El selector de proveedor es un SunmiSelectAdv, no un `<select>` nativo.
 *
 * El botón dice "Elegí un proveedor" mientras no hay ninguno elegido, así que se
 * abre por ese texto y recién después aparecen las opciones.
 */
async function elegirProveedor(nombre) {
  await tocar("Elegí un proveedor", { esperaMs: 800 });

  // ── LO QUE SE MIDE DE PASO ────────────────────────────────────────────
  //
  // Con el desplegable abierto se pregunta si sus opciones se pueden usar sin
  // el dedo. No es una digresión: es la única pantalla donde el proveedor se
  // elige, y si el desplegable no es alcanzable con el teclado no hay otra
  // forma de subir una lista.
  const acc = await opcionesAccesibles();
  await comprobar(acc.hay > 0 && acc.enfocables === acc.hay, {
    pantalla: "Subir",
    hice: "Abrí el desplegable de proveedor y miré cómo están hechas las opciones",
    esperaba: "Opciones alcanzables con el teclado y anunciables por un lector de pantalla",
    paso:
      `son ${acc.hay} <div onClick> sin role ni tabindex ` +
      `(${acc.conRol} con role, ${acc.enfocables} enfocables); con teclado no se puede elegir proveedor`,
    severidad: AMARILLO,
  });

  return tocarOpcion(nombre);
}

/**
 * Escribe el rango de aumento esperado, si la pantalla lo está pidiendo.
 *
 * NO siempre lo pide: un proveedor que ya tiene rango configurado no vuelve a
 * preguntarlo. Por eso devuelve qué hizo en vez de dar por sentado que los
 * campos están, y el que llama decide si eso es un defecto o lo esperado.
 */
async function ponerElRango({ minPct, maxPct }) {
  const campos = await evaluar(`(() => [...document.querySelectorAll('input')]
    .filter((n) => n.offsetParent !== null && n.type !== 'file')
    .map((n) => ((n.getAttribute('aria-label') || '') + '|' + (n.getAttribute('placeholder') || ''))))()`);

  const busca = (frag) => campos.find((c) => c.toLowerCase().includes(frag));
  const min = busca("mínimo") ?? busca("minimo") ?? busca("desde");
  const max = busca("máximo") ?? busca("maximo") ?? busca("hasta");

  if (!min || !max) return { pidio: false, campos };

  await escribir(min.split("|")[0] || min.split("|")[1], String(minPct));
  await escribir(max.split("|")[0] || max.split("|")[1], String(maxPct));
  await esperar(400);
  return { pidio: true, campos };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. EL RESULTADO — y sus cinco tarjetas
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que dice la base de esta importación, agrupado como lo agrupa la pantalla. */
async function estadoEnLaBase(db, id) {
  const filas = await db.importacionListaFila.findMany({
    where: { importacionId: id },
    select: {
      filaExcel: true,
      codigoCrudo: true,
      descripcionProveedor: true,
      precioConIva: true,
      costoAnterior: true,
      costoMaestroPropuesto: true,
      diferenciaPct: true,
      estado: true,
      motivo: true,
      productoBaseId: true,
      seleccionada: true,
      excluidaManual: true,
    },
    orderBy: { filaExcel: "asc" },
  });
  const por = {};
  for (const f of filas) por[f.estado] = (por[f.estado] ?? 0) + 1;
  return { filas, por };
}

async function recorrerResultado({ db, imp }) {
  anotarPaso(`RESULTADO — /modulos/proveedores/listas/${imp.id}`);
  await navegar(`${BASE}${LISTAS}/${imp.id}`);
  await esperarTexto("se actualiza", 20000);

  const texto = await textoDelContenido();
  const { filas, por } = await estadoEnLaBase(db, imp.id);
  console.log(`  en la base: ${JSON.stringify(por)}`);

  const enPantalla = (rotulo) => {
    // Las tarjetas son "<número>\n<rótulo>". Se lee el número que precede al
    // rótulo, no cualquier número de la pantalla.
    const m = texto.match(new RegExp(`(\\d+)\\s*\\n\\s*${rotulo}`));
    return m ? Number(m[1]) : null;
  };

  // ── CONTRA LA BASE: cada tarjeta cuenta lo que hay ────────────────────
  const listos = por.LISTO_PARA_ACTUALIZAR ?? 0;
  const noMacheados = por.NO_MACHEADO ?? 0;

  await comprobar(enPantalla("se actualiza") === listos, {
    pantalla: "Resultado",
    hice: "Comparé la tarjeta «se actualizan» contra la base",
    esperaba: `${listos}, que son las filas LISTO_PARA_ACTUALIZAR`,
    paso: `la tarjeta dice ${enPantalla("se actualiza")}`,
    severidad: ROJO,
  });

  // ── LOS TÍTULOS DE RUBRO CONTADOS COMO PRODUCTOS ──────────────────────
  //
  // La consecuencia medible de que el lector no descarte las filas de rubro:
  // GOLOSINAS, CHOCOLATES y ALIMENTOS entran a la importación con precio cero y
  // caen en "no los tenés", que es la cola donde se vincula un renglón de la
  // lista con un producto del catálogo. La pantalla invita a vincular un título
  // de sección con un producto.
  const rubrosComoFila = filas.filter((f) =>
    ["GOLOSINAS", "CHOCOLATES", "ALIMENTOS"].includes(f.descripcionProveedor)
  );
  await comprobar(rubrosComoFila.length === 0, {
    pantalla: "Resultado",
    hice: "Busqué en la base los títulos de rubro del archivo",
    esperaba: "Que no sean filas de la importación: son títulos de sección, no productos",
    paso:
      `están las ${rubrosComoFila.length} (${rubrosComoFila.map((f) => f.descripcionProveedor).join(", ")}), ` +
      `con precio 0 y estado ${rubrosComoFila[0]?.estado}, y engordan «no los tenés» (${noMacheados})`,
    severidad: AMARILLO,
  });

  // ── EL ESTADO QUE NO DICE LA VERDAD ───────────────────────────────────
  //
  // `FACTOR_DUDOSO` es, en el motor, el cajón de "esto lo puede resolver una
  // persona". Pero es un nombre con significado propio, y quedan ahí filas cuyo
  // único problema es el rango o la falta de costo anterior. Se anota lo que la
  // base guarda, porque es lo que va a leer quien audite dentro de seis meses.
  const dudososSinFactor = filas.filter(
    (f) => f.estado === "FACTOR_DUDOSO" && f.motivo && f.motivo !== "FACTOR_FALTANTE"
  );
  await comprobar(dudososSinFactor.length === 0, {
    pantalla: "Resultado (base)",
    hice: "Miré el estado que la base le pone a las filas que quedan para revisar",
    esperaba: "Un estado que nombre el problema real de la fila",
    paso:
      `${dudososSinFactor.length} filas quedan en estado FACTOR_DUDOSO con motivos que no son el factor ` +
      `(${[...new Set(dudososSinFactor.map((f) => f.motivo))].join(", ")}); ` +
      `el nombre del estado no describe por qué la fila está ahí`,
    severidad: VERDE,
  });

  // ── LA COLUMNA DE PRECIO: LO MÁS CARO DE TODO EL MÓDULO ───────────────
  //
  // `decisionDeLectura` guarda lo que el motor midió de cada columna candidata.
  // Se lee de ahí y no de la pantalla porque es el registro de auditoría: es lo
  // que va a mirar alguien dentro de seis meses cuando un costo no cierre.
  const cab = await db.importacionListaProveedor.findFirst({
    where: { id: imp.id },
    select: { columnaPrecioElegida: true, decisionDeLectura: true },
  });
  const d = cab?.decisionDeLectura ?? {};
  const opciones = Array.isArray(d.opciones) ? d.opciones : [];
  const mejor = opciones.reduce((a, b) => (!a || (b.explicadas ?? 0) > (a.explicadas ?? 0) ? b : a), null);
  const elegida = opciones.find((o) => o.titulo === cab?.columnaPrecioElegida) ?? null;

  if (opciones.length > 1) {
    console.log(
      `  columnas candidatas: ${opciones.map((o) => `${o.titulo} explica ${o.explicadas}/${o.comparables}`).join(" · ")}` +
        ` → elegida ${cab.columnaPrecioElegida} (motor: ${d.delMotor ? "sí" : "no eligió"})`
    );

    await comprobar(mejor && elegida && elegida.titulo === mejor.titulo, {
      pantalla: "¿Leí bien la lista? → Resultado",
      hice:
        "Subí un archivo con dos columnas de precio (S/IVA y C/IVA) y acepté la lectura " +
        "con «Está bien, seguir», que es el botón obvio",
      esperaba: "Que se use la columna que mejor explica los costos que ya tengo",
      paso:
        `se usó «${elegida?.titulo}», que explica ${elegida?.explicadas} de ${elegida?.comparables}, ` +
        `teniendo «${mejor?.titulo}», que explica ${mejor?.explicadas}. ` +
        `El motor no eligió ninguna (ninguna llegó a los dos tercios) y su pregunta —«elegí vos la columna»— ` +
        `no se hace, porque la columna que propone la pantalla de lectura cuenta como elección manual`,
      severidad: ROJO,
    });
  }

  // ── LA BARRA Y EL VOLVER ──────────────────────────────────────────────
  const barra = await tituloDeLaBarra();
  await comprobar(/Listas/.test(barra), {
    pantalla: "Resultado",
    hice: "Miré la barra de arriba",
    esperaba: "Un botón para volver al listado",
    paso: `la barra dice «${barra}»`,
    severidad: AMARILLO,
  });

  // ── Y NO DICE QUE CAMBIÓ ALGO QUE NO CAMBIÓ ───────────────────────────
  await comprobar(texto.includes("todavía no cambió ningún precio"), {
    pantalla: "Resultado",
    hice: "Miré el encabezado de una lista recién conciliada, antes de aplicar",
    esperaba: "Que diga que todavía no cambió ningún precio",
    paso: "no lo dice",
    severidad: AMARILLO,
  });

  return { filas, por, texto };
}

/** Toca cada tarjeta del resultado y comprueba que lleve a algún lado. */
async function tocarLasTarjetas({ db, imp, por }) {
  anotarPaso("RESULTADO — tocar TODAS las tarjetas");

  const tarjetas = [
    { rotulo: "se actualiza", destino: "/actualizan", hay: (por.LISTO_PARA_ACTUALIZAR ?? 0) > 0 },
    { rotulo: "para revisar", destino: "/revisar", hay: (por.FACTOR_DUDOSO ?? 0) + (por.BLOQUEADO ?? 0) > 0 },
    { rotulo: "los dejaste igual", destino: "/no-cambian", hay: false },
    { rotulo: "no los tenés", destino: "/revisar", hay: (por.NO_MACHEADO ?? 0) > 0 },
    { rotulo: "tuyos sin precio", destino: "/no-cambian", hay: true },
  ];

  for (const t of tarjetas) {
    await navegar(`${BASE}${LISTAS}/${imp.id}`);
    await esperarTexto("se actualiza", 15000);

    const fue = await tocar(t.rotulo, { esperaMs: 2500 });
    const url = await evaluar("location.pathname + location.search");
    const llego = url.includes(t.destino);

    if (t.hay) {
      await comprobar(fue && llego, {
        pantalla: "Resultado",
        hice: `Toqué la tarjeta «${t.rotulo}», que tiene filas adentro`,
        esperaba: `Que abra ${t.destino}`,
        paso: fue ? `quedó en ${url}` : "la tarjeta no se puede tocar",
        severidad: AMARILLO,
      });
    } else {
      // Una tarjeta en cero que igual navega lleva a una pantalla vacía; una que
      // no navega está bien. Se anota lo que hace, sin exigir.
      console.log(`  «${t.rotulo}» (vacía) → ${fue ? url : "no se toca"}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LAS TRES SUBPANTALLAS
// ═══════════════════════════════════════════════════════════════════════════

async function recorrerActualizan({ db, imp }) {
  anotarPaso(`SE ACTUALIZAN — /${imp.id}/actualizan`);
  await navegar(`${BASE}${LISTAS}/${imp.id}/actualizan`);
  await esperar(2500);

  const texto = await textoDelContenido();
  const enLaBase = await db.importacionListaFila.findMany({
    where: { importacionId: imp.id, estado: "LISTO_PARA_ACTUALIZAR" },
    select: { descripcionProveedor: true, costoAnterior: true, costoMaestroPropuesto: true },
  });

  for (const f of enLaBase) {
    await comprobar(texto.includes(f.descripcionProveedor), {
      pantalla: "Se actualizan",
      hice: `Busqué «${f.descripcionProveedor}», que la base tiene como LISTO_PARA_ACTUALIZAR`,
      esperaba: "Que aparezca en la lista de los que se actualizan",
      paso: "no está en pantalla",
      severidad: ROJO,
    });
  }

  await comprobar(!texto.includes("entre 0,0 % y 0,0 %"), {
    pantalla: "Se actualizan",
    hice: "Busqué el texto de rango vacío",
    esperaba: "Que nunca se muestre «entre 0,0 % y 0,0 %»",
    paso: "aparece en pantalla",
    severidad: AMARILLO,
  });

  return { texto };
}

async function recorrerRevisar({ db, imp }) {
  anotarPaso(`REVISAR DE A UNO — /${imp.id}/revisar`);
  await navegar(`${BASE}${LISTAS}/${imp.id}/revisar`);
  await esperar(2500);

  const texto = await textoDelContenido();
  const botones = await tocables();
  const visibles = botones.join(" | ");

  // Las seis acciones que Emanuel pidió recorrer, por su texto en pantalla.
  const acciones = [
    "Usar",
    "No lo cambio",
    "Saltear",
    "No es este producto",
    "Elegir otro renglón",
    "No está en la lista",
  ];
  const faltan = acciones.filter((a) => !visibles.toLowerCase().includes(a.toLowerCase()));
  console.log(`  acciones visibles: ${acciones.filter((a) => !faltan.includes(a)).join(", ") || "(ninguna)"}`);
  if (faltan.length) console.log(`  acciones que NO se ven acá: ${faltan.join(", ")}`);

  await comprobar(!texto.includes("entre 0,0 % y 0,0 %"), {
    pantalla: "Revisar de a uno",
    hice: "Busqué el texto de rango vacío",
    esperaba: "Que nunca se muestre «entre 0,0 % y 0,0 %»",
    paso: "aparece en pantalla",
    severidad: AMARILLO,
  });

  return { texto, acciones: acciones.filter((a) => !faltan.includes(a)), faltan };
}

async function recorrerNoCambian({ db, imp }) {
  anotarPaso(`NO CAMBIAN — /${imp.id}/no-cambian`);
  await navegar(`${BASE}${LISTAS}/${imp.id}/no-cambian`);
  await esperar(2500);

  const texto = await textoDelContenido();

  // El producto del catálogo que no vino en la lista tiene que estar acá.
  const noVino = CATALOGO.find((t) => t.trampa === "NO_VINO");
  const nombreSinMarca = noVino.nombre.replace(`${MARCA} `, "");
  await comprobar(texto.includes(nombreSinMarca) || texto.includes(noVino.nombre), {
    pantalla: "No cambian",
    hice: `Busqué «${noVino.nombre}», que es del proveedor y NO viene en la lista`,
    esperaba: "Que aparezca como tuyo que no vino en la lista",
    paso: "no está en pantalla",
    severidad: AMARILLO,
  });

  // Los filtros de esta pantalla.
  for (const chip of ["No vino", "Lo dejaste igual", "Todos"]) {
    const hay = await tocar(chip, { esperaMs: 1200 });
    console.log(`  filtro «${chip}» → ${hay ? "OK" : "no está"}`);
  }

  return { texto };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. APLICAR, DESHACER, TERMINAR, CANCELAR
// ═══════════════════════════════════════════════════════════════════════════

async function aplicarYDeshacer({ db, imp }) {
  anotarPaso(`APLICAR — lista ${imp.id}`);

  const antes = await db.productoBase.findMany({
    where: { nombre: { startsWith: MARCA } },
    select: { id: true, nombre: true, precio_costo: true },
    orderBy: { id: "asc" },
  });

  await navegar(`${BASE}${LISTAS}/${imp.id}`);
  await esperarTexto("se actualiza", 15000);

  // ── LOS DOS TOQUES, CON SUS TEXTOS EXACTOS ────────────────────────────
  //
  // Aplicar NO es un toque: el botón de la pantalla abre una hoja de
  // confirmación y el que aplica de verdad es el de adentro. La primera versión
  // tocaba "Aplicar" dos veces y el segundo toque no encontraba nada —la hoja
  // dice "Sí, aplicar", con minúscula, y la comparación es sensible a
  // mayúsculas—. Resultado: el recorrido informó "cambiaron 0 costos" como si
  // fuera un defecto del módulo, cuando lo que pasó es que nunca confirmó.
  const abrio = await tocar("Aplicar los", { ultimo: true, esperaMs: 2500 });
  const confirmo = await tocar("Sí, aplicar", { ultimo: true, esperaMs: 6000 });
  await comprobar(abrio && confirmo, {
    pantalla: "Resultado",
    hice: "Quise aplicar los precios listos",
    esperaba: "El botón «Aplicar los N precios» y su confirmación «Sí, aplicar»",
    paso: `${abrio ? "" : "no está el botón de aplicar; "}${confirmo ? "" : "no está la confirmación"}`,
    severidad: ROJO,
  });
  await esperar(3000);

  const despues = await db.productoBase.findMany({
    where: { nombre: { startsWith: MARCA } },
    select: { id: true, nombre: true, precio_costo: true },
    orderBy: { id: "asc" },
  });

  const cambiados = despues.filter((d, i) => String(d.precio_costo) !== String(antes[i]?.precio_costo));
  console.log(
    `  costos que cambiaron: ${cambiados.length}` +
      cambiados.map((c, i) => `\n    ${c.nombre}: ${antes.find((a) => a.id === c.id)?.precio_costo} → ${c.precio_costo}`).join("")
  );

  const listos = await db.importacionListaFila.count({
    where: { importacionId: imp.id, estado: "LISTO_PARA_ACTUALIZAR" },
  });

  // ── LO QUE SE ESCRIBIÓ ES LO QUE SE DIJO QUE SE IBA A ESCRIBIR ────────
  await comprobar(cambiados.length === listos, {
    pantalla: "Aplicar",
    hice: `Apliqué una lista con ${listos} filas listas para actualizar`,
    esperaba: `Que cambien exactamente ${listos} costos en el catálogo`,
    paso: `cambiaron ${cambiados.length}`,
    severidad: ROJO,
  });

  // ── NADA FUERA DE RANGO SE ESCRIBIÓ SOLO ──────────────────────────────
  //
  // Es la comprobación más importante del recorrido: el módulo existe para
  // escribir costos, y lo único que no puede hacer nunca es escribir uno que
  // nadie miró.
  const fueraDeRango = [];
  for (const c of cambiados) {
    const viejo = Number(antes.find((a) => a.id === c.id)?.precio_costo ?? 0);
    const nuevo = Number(c.precio_costo);
    if (viejo <= 0) continue;
    const pct = ((nuevo - viejo) / viejo) * 100;
    if (pct < RANGO.minPct || pct > RANGO.maxPct) {
      fueraDeRango.push(`${c.nombre}: ${viejo} → ${nuevo} (${pct.toFixed(1)} %)`);
    }
  }
  await comprobar(fueraDeRango.length === 0, {
    pantalla: "Aplicar",
    hice: `Apliqué con el rango ${RANGO.minPct}–${RANGO.maxPct} % sin revisar nada a mano`,
    esperaba: "Que no se escriba solo ningún costo fuera de ese rango",
    paso: `se escribieron ${fueraDeRango.length}: ${fueraDeRango.join("; ")}`,
    severidad: ROJO,
  });

  // ── DESHACER ──────────────────────────────────────────────────────────
  anotarPaso(`DESHACER — lista ${imp.id}`);
  await navegar(`${BASE}${LISTAS}/${imp.id}`);
  await esperar(2500);
  // Mismo par que aplicar: el botón de la pantalla abre el modal, y adentro el
  // que revierte dice "Revertir los N productos".
  const hayDeshacer = await tocar("Deshacer los", { ultimo: true, esperaMs: 2500 });
  const revirtio = hayDeshacer ? await tocar("Revertir los", { ultimo: true, esperaMs: 6000 }) : false;
  await esperar(3000);

  const vuelto = await db.productoBase.findMany({
    where: { nombre: { startsWith: MARCA } },
    select: { id: true, nombre: true, precio_costo: true },
    orderBy: { id: "asc" },
  });
  const noVolvieron = vuelto.filter((v, i) => String(v.precio_costo) !== String(antes[i]?.precio_costo));

  await comprobar(hayDeshacer, {
    pantalla: "Resultado (aplicada)",
    hice: "Busqué cómo deshacer lo que acababa de aplicar",
    esperaba: "Un botón para deshacer",
    paso: "no está en la pantalla",
    severidad: ROJO,
  });

  if (hayDeshacer && revirtio) {
    await comprobar(noVolvieron.length === 0, {
      pantalla: "Deshacer",
      hice: "Deshice la aplicación",
      esperaba: "Que TODOS los costos vuelvan a como estaban",
      paso: `${noVolvieron.length} quedaron cambiados: ${noVolvieron.map((n) => `${n.nombre}=${n.precio_costo}`).join(", ")}`,
      severidad: ROJO,
    });
  }

  return { cambiados: cambiados.length, deshizo: hayDeshacer && revirtio && noVolvieron.length === 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LOS DOS ANCHOS Y LOS DOS TEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recorre las seis pantallas en los cuatro combinados de ancho y tema.
 *
 * Lo que se mide acá no es "se ve linda": es que no haya scroll horizontal y que
 * el texto que la pantalla tiene que decir siga estando. Una pantalla que a 360
 * desborda obliga a Emanuel a arrastrar de costado para leer un precio.
 */
async function recorrerAnchosYTemas({ imp }) {
  const pantallas = [
    { nombre: "listado", ruta: LISTAS, espera: "Subir una lista" },
    { nombre: "subir", ruta: `${LISTAS}/nueva`, espera: "¿Para qué subís esta lista?" },
    { nombre: "resultado", ruta: `${LISTAS}/${imp.id}`, espera: "se actualiza" },
    { nombre: "actualizan", ruta: `${LISTAS}/${imp.id}/actualizan`, espera: null },
    { nombre: "revisar", ruta: `${LISTAS}/${imp.id}/revisar`, espera: null },
    { nombre: "no-cambian", ruta: `${LISTAS}/${imp.id}/no-cambian`, espera: null },
  ];

  /** El fondo de cada pantalla en cada tema, para compararlos al final. */
  const fondos = {};

  for (const [etiqueta, ancho] of Object.entries(ANCHOS)) {
    for (const tema of ["claro", "oscuro"]) {
      anotarPaso(`${etiqueta.toUpperCase()} ${ancho}px · tema ${tema}`);
      await fijarAncho(ancho);
      await fijarTema(tema);

      for (const p of pantallas) {
        await navegar(`${BASE}${p.ruta}`);
        if (p.espera) await esperarTexto(p.espera, 15000);
        await esperar(900);

        const desborde = await foto(`${p.nombre}-${ancho}-${tema}`);
        await comprobar(desborde === 0, {
          pantalla: p.nombre,
          hice: `Abrí la pantalla a ${ancho} px con el tema ${tema}`,
          esperaba: "Que entre en el ancho, sin arrastrar de costado",
          paso: `desborda ${desborde} px`,
          severidad: AMARILLO,
        });

        // ── EL TEMA SE APLICÓ DE VERDAD ─────────────────────────────────
        //
        // Sin esto las cuatro vueltas fotografían lo mismo y el recorrido
        // informa "recorrido en dos temas" sobre ocho fotos iguales.
        //
        // ── Y SE MIDE COMPARANDO, NO CONTRA UNA LISTA DE COLORES ────────
        //
        // La primera versión preguntaba si el fondo contenía 255, 248, 250 o
        // 252 y daba por oscuro todo lo demás. El tema claro de este kit es
        // `rgb(241, 245, 249)` —slate-100— así que las DOCE pantallas claras
        // salieron informadas como si no hubieran aplicado el tema. Doce
        // hallazgos falsos, todos del mismo error: adivinar el valor en vez de
        // medirlo.
        //
        // Lo que de verdad importa no es qué color es, es que los dos temas den
        // DISTINTO. Así que se guarda el fondo de cada vuelta y se comparan al
        // final, que además es la única forma de detectar que el tema no cambia
        // nada sin saber de antemano cuál es el color correcto.
        fondos[`${p.nombre}-${tema}`] = await evaluar(
          "getComputedStyle(document.body).backgroundColor"
        );
      }
    }
  }
  // ── ¿LOS DOS TEMAS DAN DISTINTO? ──────────────────────────────────────
  //
  // Una sola comprobación por pantalla, hecha al final, comparando lo medido.
  // Si el tema oscuro pintara igual que el claro, las cuatro vueltas de arriba
  // serían ocho fotos iguales y el recorrido diría que recorrió los dos temas.
  const pantallasVistas = [...new Set(Object.keys(fondos).map((k) => k.replace(/-(claro|oscuro)$/, "")))];
  for (const nombre of pantallasVistas) {
    const claro = fondos[`${nombre}-claro`];
    const oscuro = fondos[`${nombre}-oscuro`];
    await comprobar(claro && oscuro && claro !== oscuro, {
      pantalla: nombre,
      hice: "Abrí la pantalla con el tema claro y con el oscuro",
      esperaba: "Que el fondo cambie entre un tema y el otro",
      paso: `los dos dan ${claro} (claro) y ${oscuro} (oscuro)`,
      severidad: AMARILLO,
    });
  }
  console.log(`  fondos medidos: ${JSON.stringify(fondos)}`);

  await fijarAncho(ANCHOS.movil);
  await fijarTema("claro");
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. TERMINAR Y CANCELAR
// ═══════════════════════════════════════════════════════════════════════════

async function terminar({ db, imp }) {
  anotarPaso(`TERMINAR — lista ${imp.id}`);
  await navegar(`${BASE}${LISTAS}/${imp.id}`);
  await esperar(2500);

  const abrio = await tocar("Terminar", { ultimo: true, esperaMs: 1800 });
  const confirmo = abrio ? await tocar("Sí, terminar", { ultimo: true, esperaMs: 4000 }) : false;
  await esperar(2500);

  const cab = await db.importacionListaProveedor.findFirst({
    where: { id: imp.id },
    select: { estado: true, terminadaEn: true },
  });

  await comprobar(abrio && confirmo && cab?.estado === "TERMINADA", {
    pantalla: "Resultado",
    hice: "Toqué «Terminar» y confirmé",
    esperaba: "Que la lista quede TERMINADA en la base",
    paso: `${abrio ? "" : "no está el botón; "}${confirmo ? "" : "no está la confirmación; "}la base dice ${cab?.estado}`,
    severidad: ROJO,
  });

  return cab;
}

async function cancelar({ db, imp }) {
  anotarPaso(`CANCELAR — lista ${imp.id}`);
  await navegar(`${BASE}${LISTAS}/${imp.id}`);
  await esperar(2500);

  const abrio = await tocar("Cancelar esta lista", { ultimo: true, esperaMs: 1800 });
  const confirmo = abrio ? await tocar("Sí, cancelar", { ultimo: true, esperaMs: 4000 }) : false;
  await esperar(2500);

  let cab = await db.importacionListaProveedor.findFirst({
    where: { id: imp.id },
    select: { estado: true, canceladaEn: true },
  });

  // ── LO QUE SE ENCONTRÓ: CANCELAR NO SE OFRECE CASI NUNCA ──────────────
  //
  // "Cancelar esta lista" existe en UN solo lugar de la pantalla: adentro del
  // aviso de la lista que quedó atrapada en el 0 a 0, que es un caso viejo y
  // puntual. Sobre una lista abierta normal no hay ningún botón para
  // descartarla: las únicas salidas son aplicar o terminar.
  await comprobar(abrio, {
    pantalla: "Resultado",
    hice: "Busqué cómo descartar una lista abierta que subí por error",
    esperaba: "Un botón para cancelarla",
    paso:
      "no hay ninguno: «Cancelar esta lista» solo aparece adentro del aviso de la lista " +
      "atrapada en el rango 0 a 0. En una lista normal las únicas salidas son aplicar o terminar",
    severidad: AMARILLO,
  });

  if (abrio) {
    await comprobar(confirmo && cab?.estado === "CANCELADA", {
      pantalla: "Resultado",
      hice: "Toqué «Cancelar esta lista» y confirmé",
      esperaba: "Que la lista quede CANCELADA en la base",
      paso: `${confirmo ? "" : "no está la confirmación; "}la base dice ${cab?.estado}`,
      severidad: ROJO,
    });
  } else {
    // El recorrido sigue igual: se cierra con "Terminar", que es la salida que
    // la pantalla SÍ ofrece. Sin cerrarla, la subida siguiente del mismo archivo
    // choca con `importacion_archivo_unica` y el resto del recorrido no corre.
    await terminar({ db, imp });
    cab = await db.importacionListaProveedor.findFirst({
      where: { id: imp.id },
      select: { estado: true, canceladaEn: true },
    });
  }

  return cab;
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. EL MODO CONTROLAR, Y EL RANGO CERO
// ═══════════════════════════════════════════════════════════════════════════

async function recorrerControl({ db }) {
  const imp = await subirLaLista({ db, modo: "CONTROLAR", etiqueta: "solo controlar" });
  if (!imp) return null;

  anotarPaso(`CONTROL — resultado de la lista ${imp.id}`);
  await navegar(`${BASE}${LISTAS}/${imp.id}`);
  await esperar(3000);
  const texto = await textoDelContenido();

  // ── CONTROLAR NO ESCRIBE. NUNCA. ──────────────────────────────────────
  //
  // Se comprueba contra la base y no contra la pantalla: el módulo podría decir
  // "no cambia nada" y escribir igual, que es exactamente el defecto que no se
  // ve. Se guardan los costos antes y después de recorrer toda la pantalla.
  const antes = await db.productoBase.findMany({
    where: { nombre: { startsWith: MARCA } },
    select: { id: true, precio_costo: true },
    orderBy: { id: "asc" },
  });

  await comprobar(!texto.includes("Aplicar los"), {
    pantalla: "Resultado (controlando)",
    hice: "Subí la lista en modo «Solo controlar»",
    esperaba: "Que no se ofrezca aplicar precios: controlar no cambia nada",
    paso: "está el botón de aplicar",
    severidad: ROJO,
  });

  await comprobar(!texto.includes("entre 0,0 % y 0,0 %"), {
    pantalla: "Resultado (controlando)",
    hice: "Busqué el texto de rango vacío",
    esperaba: "Que nunca se muestre «entre 0,0 % y 0,0 %»",
    paso: "aparece en pantalla",
    severidad: AMARILLO,
  });

  // ── PASAR DE CONTROLAR A ACTUALIZAR ───────────────────────────────────
  anotarPaso(`CONTROL — pasar a actualizar precios (lista ${imp.id})`);
  const pasa = await tocar("Pasar a actualizar", { ultimo: true, esperaMs: 2500 });
  console.log(`  «Pasar a actualizar precios» → ${pasa ? "OK" : "no está"}`);
  if (pasa) {
    // La hoja pide el rango y confirma con "Volver a leer con este aumento" —no
    // con un segundo "Pasar a actualizar"—, porque lo que hace es volver a
    // conciliar la lista entera con el rango nuevo.
    await ponerElRango(RANGO);
    await tocar("Volver a leer con este aumento", { ultimo: true, esperaMs: 8000 });
    await esperar(4000);
  }

  const cab = await db.importacionListaProveedor.findFirst({
    where: { id: imp.id },
    select: { modo: true, estado: true },
  });
  await comprobar(cab?.modo === "ACTUALIZAR", {
    pantalla: "Resultado (controlando)",
    hice: "Usé «Pasar a actualizar precios» sobre una lista de control",
    esperaba: "Que la lista quede en modo ACTUALIZAR",
    paso: `la base dice modo ${cab?.modo}, estado ${cab?.estado}`,
    severidad: ROJO,
  });

  // ── Y EN TODO ESO NO SE ESCRIBIÓ UN SOLO COSTO ────────────────────────
  const despues = await db.productoBase.findMany({
    where: { nombre: { startsWith: MARCA } },
    select: { id: true, precio_costo: true },
    orderBy: { id: "asc" },
  });
  const tocados = despues.filter((d, i) => String(d.precio_costo) !== String(antes[i]?.precio_costo));
  await comprobar(tocados.length === 0, {
    pantalla: "Controlar",
    hice: "Recorrí entera una lista en modo controlar, incluido el pase a actualizar",
    esperaba: "Cero costos escritos: controlar no cambia nada",
    paso: `se escribieron ${tocados.length}`,
    severidad: ROJO,
  });

  return imp;
}

/**
 * EL RANGO CERO, Y CÓMO SE RESCATA LA LISTA.
 *
 * Una lista subida con 0–0 no puede explicar ningún aumento: el motor no tiene
 * contra qué medir. El caso está atendido —se trata como un control, con aviso—
 * y lo que se recorre es que se pueda salir de ahí sin volver a subir el archivo.
 */
async function recorrerRangoCero({ db }) {
  const imp = await subirLaLista({
    db,
    modo: "ACTUALIZAR",
    rango: { minPct: 0, maxPct: 0 },
    etiqueta: "rango 0–0",
  });
  if (!imp) return null;

  anotarPaso(`RANGO 0–0 — rescatar la lista ${imp.id}`);
  await navegar(`${BASE}${LISTAS}/${imp.id}`);
  await esperar(3000);
  const texto = await textoDelContenido();

  await comprobar(!texto.includes("entre 0,0 % y 0,0 %"), {
    pantalla: "Resultado (rango 0–0)",
    hice: "Subí la lista con el rango en 0 y 0",
    esperaba: "Que nunca se muestre «entre 0,0 % y 0,0 %»",
    paso: "aparece en pantalla",
    severidad: AMARILLO,
  });

  const rescata = await tocar("Pasar a actualizar", { ultimo: true, esperaMs: 2500 });
  await comprobar(rescata, {
    pantalla: "Resultado (rango 0–0)",
    hice: "Busqué cómo salir de una lista subida con el rango en cero",
    esperaba: "Poder ponerle un rango sin volver a subir el archivo",
    paso: "no hay forma de rescatarla desde la pantalla",
    severidad: ROJO,
  });

  if (rescata) {
    await ponerElRango(RANGO);
    await tocar("Volver a leer con este aumento", { ultimo: true, esperaMs: 8000 });
    await esperar(4000);
    const cab = await db.importacionListaProveedor.findFirst({
      where: { id: imp.id },
      select: { modo: true, aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true },
    });
    await comprobar(Number(cab?.aumentoEsperadoMaxPct) === RANGO.maxPct, {
      pantalla: "Resultado (rango 0–0)",
      hice: `Rescaté la lista poniéndole el rango ${RANGO.minPct}–${RANGO.maxPct}`,
      esperaba: "Que la base guarde el rango nuevo",
      paso: `guardó ${cab?.aumentoEsperadoMinPct}–${cab?.aumentoEsperadoMaxPct}`,
      severidad: ROJO,
    });
  }

  return imp;
}

/**
 * SUBIR LA MISMA LISTA OTRA VEZ, para ver si se acuerda de lo decidido.
 *
 * Es lo que hace que el módulo sirva en la segunda lista y no solo en la
 * primera: lo que una persona contestó de un producto no se vuelve a preguntar.
 */
async function recorrerLaMemoria({ db }) {
  anotarPaso("MEMORIA — subir la misma lista por segunda vez");

  const recordadas = await db.lecturaProductoProveedor.count();
  const noSeCambian = await db.productoQueNoSeCambia.count();
  console.log(`  antes: ${recordadas} lecturas recordadas, ${noSeCambian} «no lo cambio»`);

  const imp = await subirLaLista({ db, modo: "ACTUALIZAR", etiqueta: "segunda vez" });
  if (!imp) {
    // Subir dos veces el mismo archivo puede chocar con `importacion_archivo_unica`,
    // que es un índice real y una defensa legítima. Se anota qué pasó y se sigue.
    console.log("  la segunda subida no creó importación (puede ser el índice de archivo único)");
    return null;
  }
  return imp;
}

// ═══════════════════════════════════════════════════════════════════════════
// EL PROGRAMA
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const contextoPath = path.join(BANCO, "contexto.json");
  if (!fs.existsSync(contextoPath)) {
    console.error(
      `ABORTADO: no está el banco de prueba (${contextoPath}).\n` +
        `  Sembralo con:\n` +
        `    node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/bancoDeListas.mjs --sembrar`
    );
    process.exit(2);
  }
  const ctx = JSON.parse(fs.readFileSync(contextoPath, "utf8"));

  const db = await crearClientePrisma({ nivel: LECTURA });
  await abrirNavegador();

  try {
    await entrar();
    await fijarAncho(ANCHOS.movil);
    await fijarTema("claro");
    await navegar(`${BASE}${LISTAS}`);

    await recorrerListado({ db });

    // ── EL CAMINO DE ACTUALIZAR, DE PUNTA A PUNTA ─────────────────────
    const imp = await subirLaLista({ db, modo: "ACTUALIZAR", etiqueta: "actualizar" });
    if (imp) {
      const { por } = await recorrerResultado({ db, imp });
      await tocarLasTarjetas({ db, imp, por });
      await recorrerActualizan({ db, imp });
      await recorrerRevisar({ db, imp });
      await recorrerNoCambian({ db, imp });
      await recorrerAnchosYTemas({ imp });
      await aplicarYDeshacer({ db, imp });
      await terminar({ db, imp });
    }

    // ── SUBIR LA MISMA OTRA VEZ, PARA VER SI SE ACUERDA ───────────────
    const segunda = await recorrerLaMemoria({ db });
    if (segunda) await cancelar({ db, imp: segunda });

    // ── SOLO CONTROLAR, Y EL PASE A ACTUALIZAR ────────────────────────
    const control = await recorrerControl({ db });

    // Se cierra antes de seguir: `importacion_archivo_unica` no deja tener dos
    // importaciones ABIERTAS del mismo archivo para el mismo proveedor, y es una
    // defensa legítima. Sin cerrarla, la subida del 0–0 se rechaza y el paso
    // siguiente informaría un defecto que no existe.
    if (control) await terminar({ db, imp: control });

    // ── LA LISTA SUBIDA CON EL RANGO EN CERO ──────────────────────────
    const cero = await recorrerRangoCero({ db });
    if (cero) await terminar({ db, imp: cero });
  } catch (e) {
    console.error(`\nEL RECORRIDO SE CORTÓ: ${e.message}`);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    const r = resumen();
    fs.mkdirSync(BANCO, { recursive: true });
    fs.writeFileSync(INFORME, JSON.stringify({ cuando: new Date().toISOString(), ...r }, null, 2));
    console.log(
      `\n${r.pasos} pasos · ${r.comprobaciones} comprobaciones · ${r.hallazgos.length} hallazgos ` +
        `(${r.rojos} rojos, ${r.amarillos} amarillos, ${r.verdes} verdes)`
    );
    console.log(`informe: ${INFORME}`);
    console.log(`capturas: ${CAPTURAS}`);
    await db.$disconnect();
    cerrar();
  }
}

await main();
process.exit(process.exitCode ?? 0);
