// CANDADOS DEL ALMACÉN DE FOTOS DE PRODUCTO.
//
// Lo que defienden son las cuatro formas en que esto se rompe sin romperse:
// guardarlas donde se borran solas, escribirlas en el disco del contenedor,
// dejar que la ruta de lectura lea cualquier archivo, y pisar una foto con otra.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  LADO_MAXIMO,
  MAXIMO_BYTES,
  NOMBRE_CENTINELA_FOTOS,
  TIPOS_ACEPTADOS,
  VARIABLE_RUTA_FOTOS,
  esNombreDeFotoValido,
  nombreDeFoto,
  urlDeFoto,
} from "@/lib/productos/fotoProducto";
import { NOMBRE_CENTINELA } from "@/lib/compras-proveedor/comprobante/almacenImagenes";
import { VARIABLE_RUTA } from "@/lib/compras-proveedor/comprobante/almacenDisco";
import { medidaDeDestino } from "@/lib/productos/achicarFoto";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("F1. NO COMPARTE NADA CON EL ALMACÉN DE COMPROBANTES, salvo las defensas", () => {
  // ── EL DEFECTO QUE ESTO IMPIDE ──────────────────────────────────────────
  //
  // Los comprobantes se borran a los siete días por diseño. Si las fotos de
  // producto terminaran en ese volumen, andarían una semana y después la
  // tarjeta mostraría un cuadrado roto — sin ningún error, y sin que nadie
  // relacione una cosa con la otra una semana después.
  //
  // Se afirma que las DOS cosas que ubican el archivo son distintas: la variable
  // que dice dónde, y el centinela que prueba que está montado. Con una sola de
  // las dos compartida ya estarían en el mismo lugar.
  assert.notEqual(VARIABLE_RUTA_FOTOS, VARIABLE_RUTA);
  assert.notEqual(NOMBRE_CENTINELA_FOTOS, NOMBRE_CENTINELA);

  // Y NO HAY RETENCIÓN ACÁ. Si alguien importa la del otro módulo, esto se
  // pone rojo: es el único camino por el que una foto de producto se volvería
  // borrable.
  const fuente = leer("lib/productos/almacenFotos.js") + leer("lib/productos/fotoProducto.js");
  assert.doesNotMatch(fuente, /retencionImagen|DIAS_DE_VIDA|vencimiento/i);
});

test("F2. LAS PROTECCIONES SÍ SE REUSAN, no se copian al lado", () => {
  // La copia no la atrapa ningún candado: las dos andarían, y el día que una se
  // arregle la otra se queda con el defecto. Se afirma que este módulo IMPORTA
  // la inspección de disco en vez de tener la suya.
  const fuente = leer("lib/productos/almacenFotos.js");
  assert.match(fuente, /from "@\/lib\/compras-proveedor\/comprobante\/almacenDisco"/);
  assert.match(fuente, /inspeccionarAlmacen/);
  assert.doesNotMatch(fuente, /node:fs/, "se escribió su propia inspección de disco");

  // Y la pieza compartida sigue aceptando el centinela por parámetro, que es lo
  // que hizo posible no copiarla.
  const disco = leer("lib/compras-proveedor/comprobante/almacenDisco.js");
  assert.match(disco, /centinela = NOMBRE_CENTINELA/);
  assert.match(disco, /join\(limpia, centinela\)/);
});

test("F3. EL NOMBRE DE UNA FOTO NUEVA NUNCA PISA A LA ANTERIOR", () => {
  // ── POR QUÉ NO ALCANZA CON EL ID ────────────────────────────────────────
  //
  // Con el id solo, reemplazar la foto escribe encima del archivo anterior. La
  // url no cambia, así que el navegador sigue mostrando la VIEJA desde su caché:
  // la persona sacó una foto nueva, se guardó bien, y la pantalla le muestra la
  // de antes. No hay error en ningún lado.
  const a = nombreDeFoto({ productoBaseId: 2023 });
  const b = nombreDeFoto({ productoBaseId: 2023 });
  assert.notEqual(a, b, "dos fotos del mismo producto comparten nombre");
  assert.match(a, /^p2023-[0-9a-f]{8}\.webp$/);

  // Y un id que no sirve falla en el momento, no escribe "pNaN".
  assert.throws(() => nombreDeFoto({ productoBaseId: 0 }));
  assert.throws(() => nombreDeFoto({}));
});

test("F4. LA RUTA DE LECTURA NO SE DEJA PASEAR POR EL DISCO", () => {
  // Sin esto, pedir la foto "../../etc/passwd" lee lo que quiera del contenedor.
  // Se valida por FORMA COMPLETA y no sacando lo prohibido: una lista de cosas a
  // filtrar siempre se queda corta.
  for (const bueno of ["p1-0a1b2c3d.webp", "p2023-ffffffff.jpg", "p7-00000000.png"]) {
    assert.ok(esNombreDeFotoValido(bueno), `rechazó uno válido: ${bueno}`);
  }
  for (const malo of [
    "../../etc/passwd",
    "p1-0a1b2c3d.webp/../../x",
    "..%2Fp1-0a1b2c3d.webp",
    "p1-0a1b2c3d.svg",
    "p1-0a1b2c3d.webp ",
    "p-0a1b2c3d.webp",
    "",
    null,
    undefined,
  ]) {
    assert.equal(esNombreDeFotoValido(malo), false, `aceptó uno inválido: ${String(malo)}`);
  }
});

test("F5. LA URL QUE SE GUARDA ES LA QUE LA RUTA SABE SERVIR", () => {
  // Las dos mitades tienen que hablar del mismo camino. Si una cambia sola, la
  // foto se guarda bien y no se ve nunca — y eso solo se nota abriendo la
  // pantalla.
  const url = urlDeFoto("p2023-0a1b2c3d.webp");
  assert.equal(url, "/api/productos/foto/p2023-0a1b2c3d.webp");
  const ruta = leer("app/api/productos/foto/[archivo]/route.js");
  assert.match(ruta, /esNombreDeFotoValido/);
  assert.ok(
    fs.existsSync(path.join(RAIZ, "app/api/productos/foto/[archivo]/route.js")),
    "la url apunta a una ruta que no existe"
  );
});

test("F6. EL CLIENTE Y EL SERVIDOR HABLAN DEL MISMO TAMAÑO", () => {
  // Si el lado máximo estuviera escrito dos veces, el cliente mandaría algo que
  // el servidor rechaza y la persona vería un error que no puede resolver.
  assert.equal(LADO_MAXIMO, 1200);
  const achicar = leer("lib/productos/achicarFoto.js");
  assert.match(achicar, /LADO_MAXIMO/);
  // Y lo importa del módulo PURO, no del que toca el disco: si volviera a
  // importar `almacenFotos`, el bundle del navegador se llevaría `node:fs` y el
  // build muere con "does not support external modules".
  assert.ok(
    achicar.includes('from "@/lib/productos/fotoProducto"'),
    "el cliente volvió a importar el módulo que toca el disco"
  );
  assert.doesNotMatch(achicar, /1200/, "el lado quedó escrito a mano en el cliente");

  // Y el tope de bytes es del servidor, no una segunda compresión.
  assert.ok(MAXIMO_BYTES > 0 && MAXIMO_BYTES <= 4 * 1024 * 1024);
});

test("F7. ACHICAR NO AGRANDA, Y NO DEFORMA", () => {
  // Los dos errores posibles de la cuenta, y ninguno da error: agrandar inventa
  // detalle y pesa más; deformar cambia la foto sin avisar.
  const chica = medidaDeDestino({ ancho: 800, alto: 600 });
  assert.deepEqual(chica, { ancho: 800, alto: 600, achica: false });

  const grande = medidaDeDestino({ ancho: 4000, alto: 3000 });
  assert.equal(grande.achica, true);
  assert.equal(grande.ancho, 1200);
  assert.equal(grande.alto, 900);
  // La proporción se conserva: 4/3 antes y después.
  assert.equal(Math.round((grande.ancho / grande.alto) * 100), Math.round((4000 / 3000) * 100));

  // Vertical: el lado mayor es el alto y es el que se acota.
  const vertical = medidaDeDestino({ ancho: 3000, alto: 4000 });
  assert.equal(vertical.alto, 1200);
  assert.equal(vertical.ancho, 900);

  // Una foto larguísima y finita no termina con un lado en cero, que daría un
  // canvas inválido y una excepción sin sentido.
  const finita = medidaDeDestino({ ancho: 6000, alto: 2 });
  assert.ok(finita.alto >= 1, "un lado quedó en cero");

  // Y una medida que no se pudo leer se dice, no se adivina.
  assert.equal(medidaDeDestino({ ancho: 0, alto: 100 }), null);
  assert.equal(medidaDeDestino({}), null);
});

test("F8. SOLO ENTRAN FORMATOS QUE EL NAVEGADOR SEPA DIBUJAR", () => {
  // Un archivo que después no se puede mostrar es una foto guardada para nada, y
  // un svg adentro de un `img` es una superficie que no hace falta abrir.
  assert.deepEqual(Object.keys(TIPOS_ACEPTADOS).sort(), [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  assert.ok(!("image/svg+xml" in TIPOS_ACEPTADOS));
});

test("F9. EL COMPOSE DECLARA EL VOLUMEN, Y COMO EXTERNO", () => {
  // ── POR QUÉ ESTO ES UN CANDADO ──────────────────────────────────────────
  //
  // Sin `external: true`, Compose crea un volumen propio con el nombre del
  // proyecto adelante, vacío, y el que se aprovisionó a mano —con su centinela—
  // no se monta nunca. La aplicación se negaría a escribir por falta de
  // centinela, que es el final bueno, pero por un motivo que costaría entender.
  const compose = fs.readFileSync(path.join(RAIZ, "docker-compose.prod.yml"), "utf8");
  assert.match(compose, /erpazul_fotos_productos:\s*\n\s*external: true/);
  assert.match(compose, /FOTOS_PRODUCTOS_VOLUMEN_PATH/);

  // La variable del entorno y la del montaje tienen que ser LA MISMA, con el
  // mismo default: si se desfasan, la aplicación mira una ruta y Docker monta
  // otra, y el arranque diría "no existe el directorio" sin decir por qué.
  const usos = compose.match(/\$\{FOTOS_PRODUCTOS_VOLUMEN_PATH:-\/vol\/fotos-productos\}/g) || [];
  assert.ok(usos.length >= 2, "la ruta del volumen no sale de la misma variable en los dos lados");
});
