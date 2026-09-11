// Candados del buscador del catálogo: quién es dueño del texto que se escribe.
//
//   node --import ./scripts/alias-loader.mjs --test lib/productos/busquedaDelCatalogo.test.mjs
//
// ── EL DEFECTO QUE DEFIENDEN ───────────────────────────────────────────────
//
// En el buscador móvil de Productos, escribir "quilmes" rápido podía terminar
// en "quiquilmes". `filtros.search` era a la vez el estado confirmado, el
// `value` del input y un estado sincronizado en los dos sentidos con `?q=`.
// Escribiendo rápido había varias navegaciones propias en vuelo; cuando
// aterrizaba una intermedia, el guardia —que recordaba UNA sola URL— la tomaba
// por externa y la aplicaba encima del estado más nuevo.
//
// ── POR QUÉ SE PRUEBA ACÁ Y NO RENDERIZANDO LA PANTALLA ───────────────────
//
// Este repo no tiene DOM en las pruebas: no hay jsdom, ni testing-library, ni
// happy-dom. `react-dom/server` produce marcado pero no despacha eventos ni
// corre temporizadores, así que una decisión que viva adentro de un `useEffect`
// no se puede ejercer. Por eso las dos decisiones —quién hidrata, y cuándo se
// confirma— viven en funciones que la pantalla IMPORTA, y se ejercen acá con el
// reloj falso de `node:test`. No son réplicas escritas al lado para el candado:
// es el mismo código que corre en el teléfono.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MS_DEBOUNCE_BUSQUEDA,
  ORIGEN_DE_URL,
  crearConfirmadorDiferido,
  laUrlHidrataElEstado,
} from "@/lib/productos/busquedaDelCatalogo";

/** Un reloj de mentira, para no depender del reloj real en un candado. */
function relojFalso() {
  let ahora = 0;
  let siguienteId = 1;
  const pendientes = new Map();
  return {
    programarEn(fn, ms) {
      const id = siguienteId++;
      pendientes.set(id, { fn, cuando: ahora + ms });
      return id;
    },
    cancelarEn(id) {
      pendientes.delete(id);
    },
    /** Corre el reloj y ejecuta lo que venció, en orden. */
    avanzar(ms) {
      ahora += ms;
      const vencidos = [...pendientes.entries()]
        .filter(([, t]) => t.cuando <= ahora)
        .sort((a, b) => a[1].cuando - b[1].cuando);
      for (const [id, t] of vencidos) {
        pendientes.delete(id);
        t.fn();
      }
    },
  };
}

/** El buscador tal como lo arma la pantalla, con el reloj inyectado. */
function buscador() {
  const reloj = relojFalso();
  const confirmadas = [];
  const confirmador = crearConfirmadorDiferido((t) => confirmadas.push(t), {
    programarEn: reloj.programarEn,
    cancelarEn: reloj.cancelarEn,
  });
  return { reloj, confirmadas, confirmador };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 · EL INPUT ES INMUNE A UN ECO VIEJO DE LA URL
// ═══════════════════════════════════════════════════════════════════════════

test("1. UN ECO PROPIO DE LA URL NO PUEDE HIDRATAR EL ESTADO", () => {
  // Es la regla entera del arreglo. El `router.replace` que esta pantalla
  // dispara al sincronizar su estado no es una navegación: es el reflejo de algo
  // que React ya sabe. Si vuelve a hidratar, vuelve "quiquilmes".
  assert.equal(laUrlHidrataElEstado(ORIGEN_DE_URL.ECO_PROPIO), false);

  // Y las dos que SÍ tienen derecho, que son las que hacen falta para que la
  // funcionalidad siga existiendo.
  assert.equal(laUrlHidrataElEstado(ORIGEN_DE_URL.INICIAL), true);
  assert.equal(laUrlHidrataElEstado(ORIGEN_DE_URL.HISTORIAL), true);
});

test("1b. un origen desconocido NO hidrata: falla cerrado", () => {
  // Si mañana aparece una cuarta forma de que la URL cambie, la respuesta por
  // defecto tiene que ser "no toques el texto de la persona".
  for (const raro of [undefined, null, "", "PROPIA", "otra cosa", 0, {}]) {
    assert.equal(laUrlHidrataElEstado(raro), false, String(raro));
  }
});

test("1c. el borrador sobrevive a un eco viejo que llega después", () => {
  // La secuencia exacta del defecto, con el discriminador nuevo: la persona ya
  // escribió "quilmes" y recién entonces aterriza la URL propia "?q=qui".
  let borrador = "quilmes";
  const hidratar = (origen, textoDeLaUrl) => {
    if (!laUrlHidrataElEstado(origen)) return;
    borrador = textoDeLaUrl;
  };

  hidratar(ORIGEN_DE_URL.ECO_PROPIO, "qui");
  assert.equal(borrador, "quilmes", "el eco viejo volvió a pisar lo que se estaba escribiendo");

  // Y Atrás sí lo repone, que es lo que no se puede perder al arreglar esto.
  hidratar(ORIGEN_DE_URL.HISTORIAL, "coca cola");
  assert.equal(borrador, "coca cola");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · UNA BÚSQUEDA POR ESCRITURA, NO UNA POR TECLA
// ═══════════════════════════════════════════════════════════════════════════

test("2. SIETE TECLAS DEJAN UNA SOLA BÚSQUEDA CONFIRMADA", () => {
  const { reloj, confirmadas, confirmador } = buscador();

  for (const t of ["q", "qu", "qui", "quil", "quilm", "quilme", "quilmes"]) {
    confirmador.programar(t);
    // Entre tecla y tecla pasa menos que la ventana: así se escribe de verdad.
    reloj.avanzar(40);
  }

  // Antes del vencimiento no se confirmó nada. Ésta es la mitad que evita los
  // siete `/api/productos/listar`.
  assert.deepEqual(confirmadas, [], "se confirmó algo antes de que dejara de escribir");
  assert.equal(confirmador.hayPendiente(), true);

  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);

  // Y después, exactamente una, con el texto completo.
  assert.deepEqual(confirmadas, ["quilmes"]);
  assert.equal(confirmador.hayPendiente(), false);
});

test("2b. dos escrituras separadas por una pausa son dos búsquedas", () => {
  // El debounce no puede tragarse la segunda: sería un buscador que deja de
  // buscar.
  const { reloj, confirmadas, confirmador } = buscador();

  confirmador.programar("quilmes");
  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);
  confirmador.programar("coca");
  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);

  assert.deepEqual(confirmadas, ["quilmes", "coca"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · BORRAR
// ═══════════════════════════════════════════════════════════════════════════

test("3. BORRAR RÁPIDO CONFIRMA EL VACÍO, Y UNA SOLA VEZ", () => {
  const { reloj, confirmadas, confirmador } = buscador();

  // Se escribe, se confirma, y después se borra letra por letra.
  confirmador.programar("quilmes");
  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);
  assert.deepEqual(confirmadas, ["quilmes"]);

  for (const t of ["quilme", "quilm", "quil", "qui", "qu", "q", ""]) {
    confirmador.programar(t);
    reloj.avanzar(30);
  }
  assert.deepEqual(confirmadas, ["quilmes"], "confirmó un estado intermedio del borrado");

  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);
  assert.deepEqual(confirmadas, ["quilmes", ""], "no confirmó el buscador vacío");
});

test("3b. escribir, borrar y volver a escribir termina en lo último", () => {
  const { reloj, confirmadas, confirmador } = buscador();
  for (const t of ["coca", "coc", "co", "c", "", "q", "qu", "quilmes"]) {
    confirmador.programar(t);
    reloj.avanzar(30);
  }
  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);
  assert.deepEqual(confirmadas, ["quilmes"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · PEGAR
// ═══════════════════════════════════════════════════════════════════════════

test("4. PEGAR «coca cola» ES UNA SOLA CONFIRMACIÓN, INTACTA", () => {
  // Pegar llega como un único cambio con el valor completo. El espacio y las dos
  // palabras tienen que sobrevivir tal cual.
  const { reloj, confirmadas, confirmador } = buscador();
  confirmador.programar("coca cola");
  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);
  assert.deepEqual(confirmadas, ["coca cola"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA VOZ NO ESPERA, PORQUE YA ES UNA FRASE
// ═══════════════════════════════════════════════════════════════════════════

test("dictar confirma sin esperar y descarta lo que estuviera en cola", () => {
  const { reloj, confirmadas, confirmador } = buscador();

  confirmador.programar("qui");
  confirmador.inmediato("quilmes");
  assert.deepEqual(confirmadas, ["quilmes"], "el dictado tuvo que esperar la ventana");

  // Y la tecla que había quedado programada no puede revivir después.
  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA * 4);
  assert.deepEqual(confirmadas, ["quilmes"], "revivió una confirmación vieja después de dictar");
});

test("cancelar deja el buscador sin nada en cola", () => {
  // Es lo que corre al desmontarse la pantalla: no se confirma sobre algo que
  // ya no está.
  const { reloj, confirmadas, confirmador } = buscador();
  confirmador.programar("quilmes");
  confirmador.cancelar();
  reloj.avanzar(MS_DEBOUNCE_BUSQUEDA * 4);
  assert.deepEqual(confirmadas, []);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA VENTANA ES UNA SOLA EN TODO EL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

test("la ventana del buscador no se duplica: el escritorio usa la misma", () => {
  // Dos números escritos a mano se separan el día que alguien toca uno solo, y
  // ahí el mismo gesto empieza a esperar tiempos distintos según la pantalla.
  assert.equal(MS_DEBOUNCE_BUSQUEDA, 250, "cambió la ventana: revisar las dos pantallas");
});
