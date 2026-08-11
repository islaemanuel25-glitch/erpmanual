// Candados de la guardia de migraciones.
//
// Ejercen la DECISIÓN sobre un comando dado: qué se rechaza, qué pasa, y qué
// hay que mandar a clasificar. Los casos negativos importan tanto como los
// positivos: una guardia que rechaza de más se termina desactivando, y ahí deja
// de proteger de todo.
//
// El caso que más se cuida acá es el del `db push` sin puerta de escape. Es
// fácil que alguien, dentro de seis meses, "unifique" los dos caminos y le
// agregue la misma variable de autorización que tiene `migrate deploy`. Estos
// candados están para que eso no pase en silencio.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decidirPorComando, esDbPush } from "./guardiaMigraciones.js";

// ── db push: rechazo total ─────────────────────────────────────────────────

test("un db push se rechaza", () => {
  const r = decidirPorComando("npx prisma db push");
  assert.equal(r.accion, "deny");
  assert.ok(r.aviso, "tiene que avisar en pantalla, no solo en la razón");
});

test("EL DB PUSH NO SE AUTORIZA CON NADA", () => {
  // El candado central. La variable que habilita `migrate deploy` no puede
  // habilitar esto, ni sola ni acompañada.
  for (const cmd of [
    "DEPLOY_MIGRACION_AUTORIZADA=1 npx prisma db push",
    "DEPLOY_MIGRACION_AUTORIZADA=1 npx prisma db push --accept-data-loss",
    "DEPLOY_MIGRACION_AUTORIZADA=1 npx prisma db push --force-reset",
  ]) {
    assert.equal(decidirPorComando(cmd).accion, "deny", cmd);
  }
});

test("si un comando trae las dos cosas, gana el rechazo", () => {
  // No hay orden de los factores que lo habilite: ni poniendo el migrate
  // deploy primero, ni escondiéndolo detrás de un &&.
  assert.equal(decidirPorComando("npx prisma migrate deploy && npx prisma db push").accion, "deny");
  assert.equal(decidirPorComando("npx prisma db push && npx prisma migrate deploy").accion, "deny");
  assert.equal(
    decidirPorComando("DEPLOY_MIGRACION_AUTORIZADA=1 npx prisma migrate deploy; npx prisma db push").accion,
    "deny"
  );
});

test("lo reconoce con las formas que se usan de verdad", () => {
  for (const cmd of [
    "npx prisma db push",
    "npx prisma db  push",
    "pnpm prisma db push",
    "npx prisma@6.19.0 db push",
    'docker compose -f docker-compose.prod.yml run --rm app npx prisma db push',
    "DATABASE_URL=postgres://x npx prisma db push --accept-data-loss",
  ]) {
    assert.equal(esDbPush(cmd), true, cmd);
  }
});

test("NO confunde un db push con otras cosas que dicen push o db", () => {
  // Una guardia que rechaza `git push` o `docker push` se vuelve insoportable
  // en un día y termina apagada.
  for (const cmd of [
    "git push origin main",
    "docker push ghcr.io/x/y:sha",
    "npx prisma db seed",
    "npx prisma db execute --file x.sql",
    "npx prisma migrate deploy",
    "psql -c 'select 1' && git push",
  ]) {
    assert.equal(esDbPush(cmd), false, cmd);
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
  const r = decidirPorComando("DEPLOY_MIGRACION_AUTORIZADA=1 npx prisma migrate deploy");
  assert.equal(r.accion, "allow");
  assert.ok(r.aviso, "sin aviso, la autorización manual pasa callada");
  assert.match(r.aviso, /autorizaci/i);
  assert.match(r.razon, /no clasific/i, "la razón tiene que decir que no se revisó nada");
});

test("la autorización se reconoce con espacios alrededor del igual", () => {
  assert.equal(
    decidirPorComando("DEPLOY_MIGRACION_AUTORIZADA = 1 npx prisma migrate deploy").accion,
    "allow"
  );
});

test("DEPLOY_MIGRACION_AUTORIZADA=0 no autoriza nada", () => {
  assert.equal(decidirPorComando("DEPLOY_MIGRACION_AUTORIZADA=0 npx prisma migrate deploy").accion, "clasificar");
});

// ── lo que no es asunto de la guardia ──────────────────────────────────────

test("migrate dev es local y pasa sin decir nada", () => {
  // Si la guardia se metiera con el trabajo local, se apagaría en una tarde.
  const r = decidirPorComando("npx prisma migrate dev --name algo");
  assert.equal(r.accion, "allow");
  assert.equal(r.aviso, null);
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
