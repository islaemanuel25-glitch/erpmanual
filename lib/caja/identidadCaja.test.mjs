// LA IDENTIDAD DE LA CAJA: el operador responde por su cajón; la cuenta ERP solo
// autentica.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/identidadCaja.test.mjs
//
// Las funciones son puras y viven en `lib/caja/cierreRelevo.js`. Lo que se
// afirma acá es la regla de negocio: con la MISMA cuenta, el operador A y el
// operador B tienen cajas distintas; sin operador, la caja es de la cuenta,
// como fue siempre; y la condición Prisma y el predicado sobre una fila dicen
// exactamente lo mismo —si divergieran, una ruta que filtra en la consulta y
// otra que compara después decidirían distinto sobre el mismo turno—.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  whereCajaPropia,
  esCajaPropia,
  whereCajaAccesible,
  puedeActuarSobreCaja,
  responsableDeCaja,
} from "@/lib/caja/cierreRelevo";

const CUENTA_CASIANO = 10;
const OTRA_CUENTA = 11;
const OP_A = 1;
const OP_B = 2;

// Los turnos con la forma que tiene la fila: `vendedorId` siempre, `operadorId`
// presente o null. No hay otra combinación posible en la tabla.
const turnoA = { id: 100, vendedorId: CUENTA_CASIANO, operadorId: OP_A };
const turnoB = { id: 101, vendedorId: CUENTA_CASIANO, operadorId: OP_B };
const turnoDeCuenta = { id: 102, vendedorId: CUENTA_CASIANO, operadorId: null };
const turnoDeOtraCuenta = { id: 103, vendedorId: OTRA_CUENTA, operadorId: null };
const turnoDeAConOtraCuenta = { id: 104, vendedorId: OTRA_CUENTA, operadorId: OP_A };
const TODOS = [turnoA, turnoB, turnoDeCuenta, turnoDeOtraCuenta, turnoDeAConOtraCuenta];

/** Evalúa una condición Prisma plana (igualdades y `{}`) sobre una fila. */
function cumple(fila, where) {
  return Object.entries(where).every(([campo, valor]) => fila[campo] === valor);
}

test("misma cuenta, dos operadores: cada uno ve SOLO su caja", () => {
  const a = { usuarioId: CUENTA_CASIANO, operadorId: OP_A };
  const b = { usuarioId: CUENTA_CASIANO, operadorId: OP_B };
  assert.equal(esCajaPropia(turnoA, a), true);
  assert.equal(esCajaPropia(turnoB, a), false, "A no puede tomar la caja de B");
  assert.equal(esCajaPropia(turnoB, b), true);
  assert.equal(esCajaPropia(turnoA, b), false, "B no puede tomar la caja de A");
});

test("la cuenta no define la propiedad: la caja de A es de A con cualquier cuenta", () => {
  // A entró por otro dispositivo, con otra cuenta del mismo local: el cajón
  // sigue siendo el suyo. Y por eso mismo la base no le deja abrir un segundo.
  assert.equal(esCajaPropia(turnoDeAConOtraCuenta, { usuarioId: CUENTA_CASIANO, operadorId: OP_A }), true);
  assert.deepEqual(whereCajaPropia({ usuarioId: CUENTA_CASIANO, operadorId: OP_A }), { operadorId: OP_A });
});

test("sin operador: la caja es de la cuenta, como históricamente", () => {
  const sinOperador = { usuarioId: CUENTA_CASIANO, operadorId: null };
  assert.equal(esCajaPropia(turnoDeCuenta, sinOperador), true);
  assert.equal(esCajaPropia(turnoDeOtraCuenta, sinOperador), false);
  assert.deepEqual(whereCajaPropia(sinOperador), { vendedorId: CUENTA_CASIANO, operadorId: null });
});

test("una caja de cuenta NO es de cualquier operador de esa cuenta", () => {
  // La diferencia con `esReservaPropia`: si un PIN alcanzara el turno sin
  // operador de su cuenta, ese turno sería un cajón compartido otra vez.
  assert.equal(esCajaPropia(turnoDeCuenta, { usuarioId: CUENTA_CASIANO, operadorId: OP_A }), false);
  // Y al revés: quien opera sin operador no alcanza la caja de un operador.
  assert.equal(esCajaPropia(turnoA, { usuarioId: CUENTA_CASIANO, operadorId: null }), false);
});

test("la condición Prisma y el predicado deciden IGUAL sobre cada turno", () => {
  const identidades = [
    { usuarioId: CUENTA_CASIANO, operadorId: OP_A },
    { usuarioId: CUENTA_CASIANO, operadorId: OP_B },
    { usuarioId: CUENTA_CASIANO, operadorId: null },
    { usuarioId: OTRA_CUENTA, operadorId: null },
    { usuarioId: OTRA_CUENTA, operadorId: OP_A },
  ];
  for (const id of identidades) {
    for (const t of TODOS) {
      assert.equal(
        cumple(t, whereCajaPropia(id)),
        esCajaPropia(t, id),
        `propia: identidad ${JSON.stringify(id)} sobre turno ${t.id}`
      );
      for (const puedeIntervenir of [false, true]) {
        const conIntervencion = { ...id, puedeIntervenir };
        assert.equal(
          cumple(t, whereCajaAccesible(conIntervencion)),
          puedeActuarSobreCaja(t, conIntervencion),
          `accesible: ${JSON.stringify(conIntervencion)} sobre turno ${t.id}`
        );
      }
    }
  }
});

test("intervención: Admin o Dueño alcanzan cualquier caja; un cajero común, solo la suya", () => {
  assert.deepEqual(whereCajaAccesible({ usuarioId: 99, operadorId: null, puedeIntervenir: true }), {});
  assert.equal(puedeActuarSobreCaja(turnoB, { usuarioId: 99, operadorId: null, puedeIntervenir: true }), true);
  // Sin la capacidad, `puedeIntervenir` ausente o cualquier valor que no sea
  // `true` literal no abre nada: la llave tiene que ser explícita.
  for (const valor of [undefined, false, "true", 1]) {
    assert.equal(
      puedeActuarSobreCaja(turnoB, { usuarioId: CUENTA_CASIANO, operadorId: OP_A, puedeIntervenir: valor }),
      false,
      `puedeIntervenir=${String(valor)}`
    );
  }
});

test("ids como texto se normalizan; ids inválidos no abren cajas", () => {
  assert.equal(esCajaPropia(turnoA, { usuarioId: "10", operadorId: "1" }), true);
  assert.equal(esCajaPropia(turnoDeCuenta, { usuarioId: undefined, operadorId: null }), false);
  assert.equal(esCajaPropia(turnoDeCuenta, { usuarioId: 0, operadorId: 0 }), false);
  assert.equal(esCajaPropia(null, { usuarioId: CUENTA_CASIANO, operadorId: OP_A }), false);
  assert.throws(() => whereCajaPropia({ usuarioId: null, operadorId: null }), /sin cuenta/);
});

test("el responsable de la caja: operador si lo hay, cuenta si no, con claves que no chocan", () => {
  assert.deepEqual(responsableDeCaja(turnoA), { tipo: "OPERADOR", id: OP_A, clave: "operador:1" });
  assert.deepEqual(responsableDeCaja(turnoDeCuenta), { tipo: "CUENTA", id: CUENTA_CASIANO, clave: "cuenta:10" });
  // Un operador 10 y la cuenta 10 son dos responsables distintos.
  assert.notEqual(
    responsableDeCaja({ vendedorId: 3, operadorId: 10 }).clave,
    responsableDeCaja({ vendedorId: 10, operadorId: null }).clave
  );
  assert.equal(responsableDeCaja(null), null);
});
