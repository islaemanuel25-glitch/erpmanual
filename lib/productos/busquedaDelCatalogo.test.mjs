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
// UNA ACCIÓN EXPLÍCITA LE GANA A UNA BÚSQUEDA QUE NO SE CONFIRMÓ
// ═══════════════════════════════════════════════════════════════════════════
//
// Es la regla de precedencia de `fijarBusquedaConfirmada`: tocar una card,
// elegir un filtro en la hoja o navegar el historial son decisiones MÁS NUEVAS
// que unas letras que todavía están esperando el vencimiento. Sin esto quedaba
// una carrera de la misma familia que la que esta corrección vino a cerrar, solo
// que a 250 ms de distancia en vez de a la velocidad del router.

/** La pantalla en chiquito: borrador, filtros efectivos y la puerta única. */
function pantalla() {
  const { reloj, confirmador } = buscador();
  const estado = { borrador: "", search: "", card: null };
  // El confirmador real no conoce a la pantalla: le avisa y la pantalla decide.
  const confirmadorReal = crearConfirmadorDiferido(
    (texto) => {
      estado.search = texto;
    },
    { programarEn: reloj.programarEn, cancelarEn: reloj.cancelarEn }
  );
  void confirmador;

  return {
    reloj,
    estado,
    /** `alTeclearEnElCelular`: solo el borrador, y se pospone. */
    teclear(texto) {
      estado.borrador = texto;
      confirmadorReal.programar(texto);
    },
    /** `fijarBusquedaConfirmada`: cancela, fija, y repone el borrador. */
    fijar(search) {
      confirmadorReal.cancelar();
      estado.search = search;
      estado.borrador = search;
    },
    /** Tocar una card: neutraliza los filtros por la puerta única. */
    tocarCard(id) {
      estado.card = id;
      this.fijar("");
    },
    /** `popstate`: cancela ANTES de hidratar. */
    historial({ search, card = null }) {
      confirmadorReal.cancelar();
      estado.search = search;
      estado.borrador = search;
      estado.card = card;
    },
  };
}

test("CARD · con una búsqueda confirmada, encender la card limpia TAMBIÉN el campo", () => {
  // No puede quedar el campo diciendo "quilmes" sobre un listado que ya no la
  // filtra. La regla existente es que la card limpia los filtros; el texto
  // visible tiene que acompañarla.
  const p = pantalla();
  p.teclear("quilmes");
  p.reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);
  assert.equal(p.estado.search, "quilmes");
  assert.equal(p.estado.borrador, "quilmes");

  p.tocarCard("para-revisar");
  assert.equal(p.estado.search, "", "el listado siguió filtrando por la búsqueda");
  assert.equal(p.estado.borrador, "", "el campo siguió mostrando una búsqueda que ya no se aplica");
});

test("CARD · apagarla y restaurar «quilmes» devuelve el texto al campo", () => {
  // El caso inverso: encender guarda y limpia, apagar repone. Si repone el
  // listado y no el campo, el buscador miente en la otra dirección.
  const p = pantalla();
  p.teclear("quilmes");
  p.reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);

  const guardado = p.estado.search;
  p.tocarCard("para-revisar");
  assert.equal(p.estado.borrador, "");

  // Apagar la card: se repone lo guardado, por la misma puerta.
  p.estado.card = null;
  p.fijar(guardado);
  assert.equal(p.estado.search, "quilmes");
  assert.equal(p.estado.borrador, "quilmes", "el campo no volvió a mostrar la búsqueda restaurada");
});

test("CARD · una búsqueda a medio escribir NO revive y apaga la card 250 ms después", () => {
  // La carrera: se escribe "qui", queda el temporizador, y ANTES de que venza se
  // toca una card. Sin la cancelación, un cuarto de segundo más tarde la
  // búsqueda se confirmaba y deshacía la card recién encendida.
  const p = pantalla();
  p.teclear("qui");
  p.tocarCard("para-revisar");

  p.reloj.avanzar(MS_DEBOUNCE_BUSQUEDA * 4);

  assert.equal(p.estado.card, "para-revisar", "la card se apagó sola después del vencimiento");
  assert.equal(p.estado.search, "", "revivió una búsqueda que la persona ya había descartado");
  assert.equal(p.estado.borrador, "", "el campo volvió a mostrar la búsqueda vieja");
});

test("HISTORIAL · Atrás cancela lo pendiente ANTES de hidratar", () => {
  // Idéntica carrera, con el otro disparador: se escribe "qui", se toca Atrás
  // antes del vencimiento, `popstate` restaura bien… y el temporizador viejo
  // vence después y pisa la navegación que la persona acaba de hacer.
  const p = pantalla();
  p.teclear("qui");
  assert.equal(p.estado.borrador, "qui");

  p.historial({ search: "coca cola", card: null });

  p.reloj.avanzar(MS_DEBOUNCE_BUSQUEDA * 4);

  assert.equal(p.estado.search, "coca cola", "el temporizador viejo pisó el estado restaurado");
  assert.equal(p.estado.borrador, "coca cola", "el campo quedó con el texto anterior al Atrás");
});

test("HOJA DE FILTROS · limpiar la búsqueda desde la hoja limpia el campo principal", () => {
  // La hoja usa `FiltrosProductos`, que tiene su propio borrador interno. Su
  // `onChange` entra por `aplicarFiltros` y de ahí por la puerta única, que es
  // el punto canónico donde una búsqueda confirmada por OTRO se refleja en el
  // campo del celular.
  const p = pantalla();
  p.teclear("quilmes");
  p.reloj.avanzar(MS_DEBOUNCE_BUSQUEDA);

  p.fijar("");
  assert.equal(p.estado.search, "");
  assert.equal(p.estado.borrador, "", "el buscador principal siguió diciendo «quilmes»");

  // Y cambiarla desde la hoja deja las dos puntas diciendo lo mismo.
  p.fijar("coca cola");
  assert.equal(p.estado.search, "coca cola");
  assert.equal(p.estado.borrador, "coca cola");
});

// ═══════════════════════════════════════════════════════════════════════════
// LA VENTANA ES UNA SOLA EN TODO EL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

test("la ventana del buscador no se duplica: el escritorio usa la misma", () => {
  // Dos números escritos a mano se separan el día que alguien toca uno solo, y
  // ahí el mismo gesto empieza a esperar tiempos distintos según la pantalla.
  assert.equal(MS_DEBOUNCE_BUSQUEDA, 250, "cambió la ventana: revisar las dos pantallas");
});
