// TODOS LOS HOOKS ANTES DE CUALQUIER RETURN CONDICIONAL.
//
// ── EL DEFECTO QUE ESTE CANDADO ATAJA ───────────────────────────────────────
//
// El 2026-08-20 la pantalla de detalle de transferencia llegó a producción
// rompiéndose con "Application error: a client-side exception has occurred" al
// abrir CUALQUIER transferencia.
//
// La causa: un `useState` declarado 130 líneas debajo de `if (!me) return ...`.
// En el primer render `me` es null, el componente retorna antes y React cuenta
// ocho hooks; en el segundo `me` ya existe, la ejecución llega hasta el noveno.
// Cambiar la cantidad de hooks entre renders es lo que las Rules of Hooks
// prohíben, y React lo castiga tirando la página entera.
//
// Cómo se coló: se reemplazó un handler —`const cancelarTransferencia = async
// () => {...}`— por un `useState`, en el mismo lugar y línea por línea. Un
// handler puede vivir en cualquier parte del cuerpo; un hook no. El diff se leía
// como un cambio inocente.
//
// ── POR QUÉ NI EL BUILD NI LA SUITE LO VEÍAN ────────────────────────────────
//
// El build compila JSX válido, y esto lo es. La suite son funciones puras que no
// renderizan. El defecto solo aparece en el navegador, en el SEGUNDO render — y
// el primero, que es el que uno mira, funciona bien.
//
// ── QUÉ AFIRMA, Y POR QUÉ NO ES UN GREP DE CADENAS ──────────────────────────
//
// Se lee el archivo contando LLAVES para saber qué está en el cuerpo del
// componente y qué adentro de una función auxiliar o un callback. Un `return`
// dentro de `fmtFechaHoraAR` o de un `.map()` no es un guard del componente y no
// tiene que contar; el primer intento de escribir esto con una expresión regular
// marcó justamente ese falso positivo.
//
// La propiedad: en el cuerpo de un componente, ningún hook puede aparecer
// después del primer `return` condicional.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/** Los hooks de React más los custom del proyecto. */
const HOOK = /\b(useState|useEffect|useRef|useMemo|useCallback|useReducer|useContext|useLayoutEffect|useTransition|useRouter|useParams|useSearchParams|usePathname|use[A-Z][A-Za-z0-9]*)\s*\(/;

/**
 * Analiza un componente y devuelve dónde está su primer guard y qué hooks
 * quedaron después.
 *
 * Recorre línea por línea llevando la cuenta de llaves para saber la
 * profundidad. El cuerpo del componente es la profundidad 1: ahí viven los
 * guards y ahí tienen que vivir los hooks. Cualquier cosa más adentro —una
 * función auxiliar, un callback, un `.map()`— no cuenta.
 */
export function analizarComponente(fuente) {
  const lineas = fuente.split("\n");

  // Dónde empieza el componente exportado.
  const inicio = lineas.findIndex((l) => /^export default function\s+\w+/.test(l));
  if (inicio === -1) return { encontrado: false };

  let profundidad = 0;
  let guard = null;
  const hooksDespues = [];

  for (let i = inicio; i < lineas.length; i++) {
    const linea = lineas[i];
    // Se ignoran los comentarios de una línea: un candado que lee prosa no
    // afirma nada. Es la cuarta vez que este proyecto se tropieza con eso.
    const codigo = linea.replace(/\/\/.*$/, "");

    const profundidadAntes = profundidad;

    // Un guard: `if (...) return`, en el cuerpo del componente (profundidad 1).
    if (profundidadAntes === 1 && /^\s*if\s*\(.*\)\s*return\b/.test(codigo) && guard === null) {
      guard = { linea: i + 1, texto: linea.trim() };
    }

    // Un hook en el cuerpo del componente, después del guard.
    if (profundidadAntes === 1 && guard !== null && HOOK.test(codigo)) {
      hooksDespues.push({ linea: i + 1, texto: linea.trim() });
    }

    for (const ch of codigo) {
      if (ch === "{") profundidad++;
      else if (ch === "}") profundidad--;
    }
    if (profundidad <= 0 && i > inicio) break; // se cerró el componente
  }

  return { encontrado: true, guard, hooksDespues };
}

// Las pantallas con guard de carga o de permisos. La de transferencias es la que
// se rompió; las otras dos se agregan porque tienen la misma forma —cargan un
// usuario y retornan antes— y son las que más se parecen al caso.
const PANTALLAS = [
  "app/modulos/transferencias/[id]/page.jsx",
  "app/modulos/reportes-ventas/[ventaId]/page.jsx",
  "app/modulos/reportes-ventas/page.jsx",
];

test("ningún hook queda después del guard de carga o permisos", () => {
  for (const rel of PANTALLAS) {
    const fuente = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    const r = analizarComponente(fuente);
    assert.ok(r.encontrado, `${rel}: no se encontró el componente exportado`);

    if (!r.guard) continue; // sin guard no hay nada que proteger

    assert.deepEqual(
      r.hooksDespues,
      [],
      `${rel}: hay ${r.hooksDespues.length} hook(s) DESPUÉS del guard de la línea ` +
        `${r.guard.linea} (${r.guard.texto}).\n  ` +
        r.hooksDespues.map((h) => `línea ${h.linea}: ${h.texto}`).join("\n  ") +
        `\n  En el primer render el componente retorna antes de llegar ahí y React ` +
        `cuenta menos hooks; en el siguiente los cuenta todos. Eso tira la página ` +
        `entera con "a client-side exception has occurred". Movelos arriba del guard.`
    );
  }
});

test("y el analizador distingue el cuerpo del componente de sus funciones internas", () => {
  // El par del anterior, y hace falta: si el analizador contara los `return` de
  // cualquier función auxiliar, marcaría todo y sería inútil. La primera versión
  // de este candado —escrita con una expresión regular sobre el archivo entero—
  // hacía exactamente eso.
  const conHelper = `
function fmtFecha(iso) {
  if (!iso) return "—";
  return iso;
}

export default function Pantalla() {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  if (!a) return <div>Cargando</div>;
  return <div>{b}</div>;
}
`;
  const r = analizarComponente(conHelper);
  assert.ok(r.encontrado);
  assert.ok(r.guard, "no detectó el guard del componente");
  assert.match(r.guard.texto, /if \(!a\) return/);
  assert.deepEqual(r.hooksDespues, [], "marcó hooks que están antes del guard");
});

test("y detecta el caso malo: un hook debajo del guard", () => {
  // La contraprueba escrita como candado. Sin esto, el analizador podría no
  // encontrar nada nunca y los dos tests de arriba pasarían igual.
  const malo = `
export default function Pantalla() {
  const [a, setA] = useState(null);
  if (!a) return <div>Cargando</div>;
  const [b, setB] = useState(false);
  return <div>{b}</div>;
}
`;
  const r = analizarComponente(malo);
  assert.equal(r.hooksDespues.length, 1, "no detectó el hook mal ubicado");
  assert.match(r.hooksDespues[0].texto, /useState\(false\)/);
});

test("un hook dentro de un callback NO cuenta como mal ubicado", () => {
  // Los callbacks viven a más profundidad. Un `useState` ahí adentro sería otro
  // problema —y de hecho no es válido tampoco— pero no es ÉSTE, y marcarlo haría
  // que el candado grite por algo que no está mirando.
  const conCallback = `
export default function Pantalla() {
  const [a, setA] = useState(null);
  if (!a) return <div>Cargando</div>;
  return (
    <div>
      {lista.map((x) => {
        const y = calcular(x);
        return <span key={x}>{y}</span>;
      })}
    </div>
  );
}
`;
  const r = analizarComponente(conCallback);
  assert.deepEqual(r.hooksDespues, [], "marcó código de un callback como hook del cuerpo");
});
