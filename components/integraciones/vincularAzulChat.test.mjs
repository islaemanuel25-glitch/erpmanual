// Candados de la UI que muestra el código de canje de Azul Chat.
//
// El código es una credencial: vale 10 minutos y un canje, pero mientras vale
// alcanza para que alguien se quede con la delegación. Lo que estos candados
// cierran es POR DÓNDE se podría escapar del componente: la URL, el
// almacenamiento del navegador, la consola, una analítica, o un pedido que corra
// solo al montarse (y que al recargar mostraría un código nuevo sin que nadie lo
// pidiera, revocando el vínculo vigente).
//
// Miran el fuente SIN COMENTARIOS: el comentario de cabecera del componente
// nombra a propósito localStorage y compañía para decir que no se usan.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test components/integraciones/vincularAzulChat.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (rel) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
const MODAL = "components/integraciones/ModalVincularAzulChat.jsx";

test("26. el código no va a la URL, al almacenamiento del navegador, a la consola ni a una analítica", () => {
  const src = leer(MODAL);
  for (const prohibido of [
    /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/,
    /useRouter/, /router\./, /useSearchParams/, /searchParams/, /window\.location/, /location\.(href|hash|search|assign|replace)/, /history\.(push|replace)State/,
    /console\./, /gtag|analytics|posthog|mixpanel|sendBeacon/i,
  ]) {
    assert.ok(!prohibido.test(src), `el modal usa ${prohibido}`);
  }
});

test("27. nada corre al montarse: sin efectos, así que recargar no recupera ni genera un código", () => {
  const src = leer(MODAL);
  assert.ok(!/useEffect|useLayoutEffect|useSWR|useQuery/.test(src), "el modal tiene un efecto");
  // El estado del código arranca vacío y solo se llena con la respuesta de un clic.
  assert.match(src, /const \[codigo, setCodigo\] = useState\(null\)/);
  const asignaciones = [...src.matchAll(/setCodigo\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(asignaciones)].sort(), ["data.codigoCanje", "null"]);
  // Y cerrar lo olvida.
  const cerrar = src.split("const cerrar = () => {")[1]?.split("};")[0] ?? "";
  assert.match(cerrar, /setCodigo\(null\)/, "cerrar no borra el código");
});

test("habla solo con autorizar y revocar, por POST, con la sesión y sin cuerpo: no elige usuario", () => {
  const src = leer(MODAL);
  const llamadas = [...src.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(llamadas.sort(), ["RUTA_AUTORIZAR", "RUTA_REVOCAR"]);
  assert.match(src, /const RUTA_AUTORIZAR = "\/api\/integraciones\/azul-chat\/vinculo\/autorizar";/);
  assert.match(src, /const RUTA_REVOCAR = "\/api\/integraciones\/azul-chat\/vinculo\/revocar";/);
  assert.ok(!/body:/.test(src), "el modal manda un cuerpo: no tiene nada que decidir");
  assert.ok(!/usuarioId/.test(src), "el modal nombra un usuario");
  for (const m of src.matchAll(/fetch\([^)]*\{([^}]*)\}/g)) {
    assert.match(m[1], /method: "POST"/);
    assert.match(m[1], /cache: "no-store"/);
  }
});

test("un error del servidor se muestra: la pantalla no lo descarta", () => {
  const src = leer(MODAL);
  // Cada fetch revisa `res.ok` y tiene rama para el malo, con el texto del ERP o el estado.
  assert.equal((src.match(/if \(!res\.ok\)/g) || []).length, 2);
  assert.match(src, /data\?\.error \|\| `No se pudo \$\{accion\} \(error \$\{res\.status\}\)\.`/);
  assert.match(src, /\{error && <p/);
});

test("usa el kit: modal, botones e input de Sunmi, sin input nativo ni colores fijos", () => {
  const src = leer(MODAL);
  for (const pieza of ["SunmiModalLayout", "SunmiButton", "SunmiInput"]) assert.match(src, new RegExp(`import ${pieza}\\b`), pieza);
  assert.ok(!/<input\b|<select\b|<button\b/.test(src), "elemento nativo en el modal");
  assert.ok(!/\b(text|bg|border)-(red|amber|cyan|slate|green|gray|white|black)(-\d+)?\b/.test(src), "color fijo en el modal");
});

test("el botón 'Vincular Azul Chat' está en el menú de la persona, sin permiso que lo esconda", () => {
  const header = leer("components/Header.jsx");
  assert.match(header, /import ModalVincularAzulChat from "@\/components\/integraciones\/ModalVincularAzulChat";/);
  assert.match(header, />\s*Vincular Azul Chat\s*</);
  assert.match(header, /<ModalVincularAzulChat abierto=\{vinculoAzulChatAbierto\}/);
  // El botón no está adentro de un `esAdmin &&` ni de un chequeo de permiso.
  const antes = header.split("Vincular Azul Chat")[0].split("{esAdmin && (").pop();
  assert.ok(antes.includes(")}"), "el botón quedó adentro del bloque de admin");
});
