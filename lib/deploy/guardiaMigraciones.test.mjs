// Candados de la guardia de migraciones.
//
// Ejercen la DECISIÓN sobre un comando dado: qué se rechaza, qué pasa, y qué
// hay que mandar a clasificar. Los casos negativos importan tanto como los
// positivos: una guardia que rechaza de más se termina desactivando, y ahí deja
// de proteger de todo.
//
// Lo que más se cuida acá es que la lista de rechazo NO se pueda aflojar sin
// ponerse en rojo. Es fácil que alguien, dentro de seis meses, "unifique" los
// caminos y le agregue a todos la variable de autorización que tiene
// `migrate deploy`, o que saque uno de la lista porque le estorbó una tarde.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decidirPorComando,
  comandoRechazado,
  RECHAZADOS,
  NO_TAPADOS,
} from "./guardiaMigraciones.js";

const AUT = "DEPLOY_MIGRACION_AUTORIZADA=1";

// Cada rechazado con las formas en que se escribe de verdad, y con las cosas
// parecidas que NO tiene que confundir.
const CASOS = [
  {
    nombre: "prisma db push",
    escribe: [
      "npx prisma db push",
      "npx prisma db  push",
      "pnpm prisma db push",
      "npx prisma@6.19.3 db push",
      "DATABASE_URL=postgres://x npx prisma db push --accept-data-loss",
      "docker compose -f docker-compose.prod.yml run --rm app npx prisma db push",
    ],
    noEs: ["git push origin main", "docker push ghcr.io/x/y:sha"],
  },
  {
    nombre: "prisma migrate reset",
    escribe: [
      "npx prisma migrate reset",
      "npx prisma migrate reset --force",
      "npx prisma migrate reset --skip-seed --skip-generate",
    ],
    noEs: ["git reset --hard", "docker compose restart app"],
  },
  {
    nombre: "prisma db execute",
    escribe: [
      "npx prisma db execute --file borrar.sql --schema prisma/schema.prisma",
      "npx prisma db execute --stdin --url postgres://prod",
      'echo "DROP TABLE x" | npx prisma db execute --stdin --url postgres://prod',
    ],
    noEs: ["psql -c 'select 1'", "docker exec erpazul_app node x.js"],
  },
  {
    nombre: "prisma migrate resolve",
    escribe: [
      "npx prisma migrate resolve --applied 20260101000000_algo",
      "npx prisma migrate resolve --rolled-back 20260101000000_algo",
    ],
    noEs: ["npx prisma migrate status", "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma"],
  },
];

// ── Uno por rechazado ──────────────────────────────────────────────────────

for (const caso of CASOS) {
  test(`${caso.nombre}: se rechaza en todas sus formas`, () => {
    for (const cmd of caso.escribe) {
      const r = decidirPorComando(cmd);
      assert.equal(r.accion, "deny", cmd);
      assert.equal(r.rechazado, caso.nombre, cmd);
      assert.ok(r.aviso, `${cmd}: tiene que avisar en pantalla`);
      assert.match(r.razon, /Qué hace:/, `${cmd}: la razón dice qué hace`);
      assert.match(r.razon, /Por qué está bloqueado:/, `${cmd}: la razón dice por qué`);
    }
  });

  test(`${caso.nombre}: NO SE AUTORIZA CON NADA`, () => {
    // El candado central, repetido para cada uno. La variable que habilita
    // `migrate deploy` no puede habilitar ninguno de estos.
    for (const cmd of caso.escribe) {
      assert.equal(decidirPorComando(`${AUT} ${cmd}`).accion, "deny", `${AUT} ${cmd}`);
    }
  });

  test(`${caso.nombre}: no se confunde con lo que se le parece`, () => {
    for (const cmd of caso.noEs) {
      assert.notEqual(comandoRechazado(cmd)?.nombre, caso.nombre, cmd);
    }
  });
}

test("si un comando trae un rechazado y una migración normal, gana el rechazo", () => {
  // No hay orden de los factores que lo habilite, ni escondiéndolo detrás de
  // un && o un punto y coma.
  for (const cmd of [
    "npx prisma migrate deploy && npx prisma db push",
    "npx prisma db push && npx prisma migrate deploy",
    `${AUT} npx prisma migrate deploy; npx prisma migrate reset --force`,
    `${AUT} npx prisma migrate deploy && npx prisma db execute --stdin`,
  ]) {
    assert.equal(decidirPorComando(cmd).accion, "deny", cmd);
  }
});

test("todo rechazado exige que el comando nombre a prisma", () => {
  // Sin esto, `git push` y `git reset --hard` caerían en la lista.
  for (const caso of CASOS) {
    const sinPrisma = caso.escribe[0].replace(/prisma\S*/g, "herramienta");
    assert.equal(comandoRechazado(sinPrisma), null, sinPrisma);
  }
});

// ── La lista, como lista ───────────────────────────────────────────────────

test("LA LISTA DE RECHAZO NO SE RECORTA", () => {
  // Salió de la regla de Emanuel: "no lo hagas solo, porque si vamos de a uno
  // siempre va a faltar la próxima". Si alguien saca uno porque le estorbó una
  // tarde, esto se pone rojo y lo obliga a decir por qué.
  const nombres = RECHAZADOS.map((r) => r.nombre).sort();
  assert.deepEqual(nombres, [
    "prisma db execute",
    "prisma db push",
    "prisma migrate reset",
    "prisma migrate resolve",
  ]);
});

test("cada rechazado explica qué hace y por qué está tapado", () => {
  // Una entrada sin motivo es una que el próximo va a sacar, porque no va a
  // tener con qué defenderla.
  for (const r of RECHAZADOS) {
    assert.ok(r.nombre && r.patron instanceof RegExp, r.nombre);
    assert.ok(r.que && r.que.length > 30, `${r.nombre}: falta qué hace`);
    assert.ok(r.porque && r.porque.length > 60, `${r.nombre}: falta por qué`);
  }
});

test("lo que se miró y no se tapó también queda anotado con su motivo", () => {
  // Las ausencias son la parte que más se malinterpreta. Si esta lista se
  // vacía, la próxima persona lee la de rechazo y no sabe si `migrate dev`
  // está afuera a propósito o por olvido.
  assert.ok(NO_TAPADOS.length >= 4);
  for (const n of NO_TAPADOS) {
    assert.ok(n.nombre, "sin nombre");
    assert.ok(n.riesgo && n.riesgo.length > 20, `${n.nombre}: falta el riesgo`);
    assert.ok(n.porque_no_se_tapa && n.porque_no_se_tapa.length > 40, `${n.nombre}: falta el motivo`);
  }
});

test("ninguno de los NO tapados está tapado de hecho", () => {
  // Que la documentación y el comportamiento no se separen: si alguien agrega
  // `migrate dev` a la lista de rechazo sin sacarlo de acá, esto lo agarra.
  for (const n of NO_TAPADOS) {
    assert.equal(comandoRechazado(`npx ${n.nombre.replace(/^prisma /, "prisma ")}`), null, n.nombre);
  }
});

// ── migrate deploy: los tres caminos ───────────────────────────────────────

test("un migrate deploy sin autorizar va al clasificador, no se decide de una", () => {
  const r = decidirPorComando("npx prisma migrate deploy");
  assert.equal(r.accion, "clasificar");
  assert.equal(r.aviso, null, "todavía no pasó nada que avisar");
});

test("LA AUTORIZACIÓN MANUAL PASA, PERO AVISA", () => {
  // Antes de sacar los pedidos de permiso, el cartel era el segundo control de
  // este caso. Sin cartel, el aviso es el único: si alguien lo saca, la
  // autorización vuelve a ser invisible y nadie se entera de que se usó.
  const r = decidirPorComando(`${AUT} npx prisma migrate deploy`);
  assert.equal(r.accion, "allow");
  assert.ok(r.aviso, "sin aviso, la autorización manual pasa callada");
  assert.match(r.aviso, /autorizaci/i);
  assert.match(r.razon, /no clasific/i, "la razón tiene que decir que no se revisó nada");
});

test("la autorización se reconoce con espacios alrededor del igual", () => {
  assert.equal(decidirPorComando("DEPLOY_MIGRACION_AUTORIZADA = 1 npx prisma migrate deploy").accion, "allow");
});

test("DEPLOY_MIGRACION_AUTORIZADA=0 no autoriza nada", () => {
  assert.equal(decidirPorComando("DEPLOY_MIGRACION_AUTORIZADA=0 npx prisma migrate deploy").accion, "clasificar");
});

// ── lo que no es asunto de la guardia ──────────────────────────────────────

test("migrate dev es local y pasa sin decir nada", () => {
  // Si la guardia se metiera con el trabajo local, se apagaría en una tarde.
  // Es una ausencia deliberada: está en NO_TAPADOS con su motivo.
  const r = decidirPorComando("npx prisma migrate dev --name algo");
  assert.equal(r.accion, "allow");
  assert.equal(r.aviso, null);
});

test("los comandos de lectura de prisma pasan sin decir nada", () => {
  for (const cmd of [
    "npx prisma generate",
    "npx prisma migrate status",
    "npx prisma validate",
    "npx prisma version",
    "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma",
  ]) {
    const r = decidirPorComando(cmd);
    assert.equal(r.accion, "allow", cmd);
    assert.equal(r.aviso, null, cmd);
  }
});

test("un comando cualquiera pasa sin aviso ni razón", () => {
  for (const cmd of ["git status", "node --test", "ls -la", ""]) {
    const r = decidirPorComando(cmd);
    assert.equal(r.accion, "allow", cmd);
    assert.equal(r.aviso, null, cmd);
    assert.equal(r.razon, "", cmd);
  }
});

test("un comando ausente no rompe la guardia", () => {
  // El hook le pasa lo que venga del evento; si viene vacío o nulo, la guardia
  // tiene que contestar algo, no explotar.
  for (const v of [undefined, null]) {
    assert.equal(decidirPorComando(v).accion, "allow");
  }
});
