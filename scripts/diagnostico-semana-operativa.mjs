// scripts/diagnostico-semana-operativa.mjs
//
// DIAGNÓSTICO DE SOLO LECTURA de la semana operativa de las ubicaciones.
//
// Responde lo que la migración `20260924230000_semana_operativa_ubicacion` NO
// decidió a propósito, para que se decida con nombre y apellido y no en silencio:
//
//   1. ACUERDOS EN CONFLICTO: un local con acuerdos de días distintos en su grupo.
//      El backfill no eligió ninguno y el local quedó sin configurar.
//   2. ACUERDOS OBSOLETOS: filas de `AcuerdoDepositoLocal` de un grupo al que el
//      local ya no pertenece, o contra un depósito que ya no es el del grupo. El
//      runtime no las leía y el backfill tampoco.
//   3. LOCALES SIN CONFIGURAR, con el motivo.
//   4. DEPÓSITOS SIN CONFIGURAR. Siempre, después de la migración: la semana del
//      depósito no se deduce de la de sus locales.
//   5. ANOMALÍAS DEL BACKFILL: una vigencia de origen MIGRACION que no coincide
//      con el acuerdo, una sobre un depósito, y acuerdos con un día fuera de 0..6.
//   6. MÁS DE UN CAMBIO PENDIENTE en una ubicación, que la regla no permite.
//
// Es uno de los pocos lugares autorizados a leer `AcuerdoDepositoLocal`
// (`lib/semanaOperativa/unaSolaFuente.test.mjs` tiene la lista): lo lee para
// comparar, nunca para decidir una semana.
//
// NO ESCRIBE NADA. Pide el cliente en nivel LECTURA, así que puede correr contra
// cualquier base cuya URL se le pase explícitamente.
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/diagnostico-semana-operativa.mjs [--json]

import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

import { fileURLToPath } from "node:url";
import { hoyArgentinaISO } from "../lib/fechas/rangoArgentina.js";
import { diaDeVigencia } from "../lib/semanaOperativa/semanaOperativa.js";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const nombreDia = (d) => (Number.isInteger(d) && d >= 0 && d <= 6 ? DIAS[d] : `día inválido (${d})`);

/**
 * Arma el diagnóstico. Separado del `main` para que el candado de base lo ejerza
 * sobre sus propios datos.
 *
 * @param {object} db  cliente de Prisma (solo se usan lecturas)
 * @param {object} [opciones]
 * @param {Array<number>} [opciones.soloLocales]  limitar a estos ids (candados)
 * @param {string} [opciones.hoy]
 */
export async function diagnosticar(db, { soloLocales = null, hoy = hoyArgentinaISO() } = {}) {
  const filtro = soloLocales ? { id: { in: soloLocales } } : {};
  const locales = await db.local.findMany({
    where: filtro,
    select: { id: true, nombre: true, activo: true, es_deposito: true },
    orderBy: { id: "asc" },
  });
  const ids = locales.map((l) => l.id);
  const porId = new Map(locales.map((l) => [l.id, l]));

  const [grupoLocales, grupoDepositos, acuerdos, vigencias] = await Promise.all([
    db.grupoLocal.findMany({ where: { localId: { in: ids } }, select: { localId: true, grupoId: true } }),
    db.grupoDeposito.findMany({ select: { localId: true, grupoId: true } }),
    db.acuerdoDepositoLocal.findMany({
      where: { localId: { in: ids } },
      select: { id: true, grupoId: true, depositoLocalId: true, localId: true, diaDeCorte: true },
      orderBy: { id: "asc" },
    }),
    db.semanaOperativaVigencia.findMany({
      where: { localId: { in: ids } },
      select: { id: true, localId: true, diaDeCorte: true, vigenteDesde: true, origen: true },
    }),
  ]);

  const grupoDe = new Map(grupoLocales.map((g) => [g.localId, g.grupoId]));
  const depositosDelGrupo = new Map();
  for (const gd of grupoDepositos) {
    if (!depositosDelGrupo.has(gd.grupoId)) depositosDelGrupo.set(gd.grupoId, new Set());
    depositosDelGrupo.get(gd.grupoId).add(gd.localId);
  }
  const esDeposito = (id) =>
    Boolean(porId.get(id)?.es_deposito) || grupoDepositos.some((gd) => gd.localId === id);

  const vigenciasDe = new Map(ids.map((id) => [id, []]));
  for (const v of vigencias) vigenciasDe.get(v.localId)?.push(v);

  const vigentesDelGrupo = new Map();
  const obsoletos = [];
  const diasInvalidos = [];
  for (const a of acuerdos) {
    if (!(Number.isInteger(a.diaDeCorte) && a.diaDeCorte >= 0 && a.diaDeCorte <= 6)) diasInvalidos.push(a);
    const grupoActual = grupoDe.get(a.localId);
    const depositoVigente = depositosDelGrupo.get(a.grupoId)?.has(a.depositoLocalId) ?? false;
    if (grupoActual !== a.grupoId) {
      obsoletos.push({ ...a, motivo: `el local ya no es del grupo ${a.grupoId}` });
      continue;
    }
    if (!depositoVigente) obsoletos.push({ ...a, motivo: `el depósito ${a.depositoLocalId} ya no es del grupo` });
    if (!vigentesDelGrupo.has(a.localId)) vigentesDelGrupo.set(a.localId, []);
    vigentesDelGrupo.get(a.localId).push(a);
  }

  const conflictos = [];
  for (const [localId, lista] of vigentesDelGrupo) {
    const dias = [...new Set(lista.map((a) => a.diaDeCorte))];
    if (dias.length > 1 && !esDeposito(localId)) conflictos.push({ localId, dias, acuerdos: lista.map((a) => a.id) });
  }

  const localesSinConfigurar = [];
  const depositosSinConfigurar = [];
  for (const l of locales) {
    if (vigenciasDe.get(l.id).length > 0) continue;
    if (esDeposito(l.id)) {
      depositosSinConfigurar.push({ localId: l.id, nombre: l.nombre, activo: l.activo });
      continue;
    }
    const propios = vigentesDelGrupo.get(l.id) || [];
    let motivo = "sin acuerdo en su grupo";
    if (!grupoDe.has(l.id)) motivo = "sin grupo";
    else if (conflictos.some((c) => c.localId === l.id)) motivo = "acuerdos en conflicto";
    else if (propios.length > 0) motivo = "acuerdo con día inválido";
    localesSinConfigurar.push({ localId: l.id, nombre: l.nombre, activo: l.activo, motivo });
  }

  const anomalias = [];
  for (const v of vigencias) {
    if (v.origen !== "MIGRACION") continue;
    if (esDeposito(v.localId)) {
      anomalias.push({ localId: v.localId, vigenciaId: v.id, motivo: "vigencia de MIGRACION sobre un depósito" });
      continue;
    }
    const propios = vigentesDelGrupo.get(v.localId) || [];
    const dias = [...new Set(propios.map((a) => a.diaDeCorte))];
    if (dias.length !== 1 || dias[0] !== v.diaDeCorte) {
      anomalias.push({
        localId: v.localId,
        vigenciaId: v.id,
        motivo: `vigencia de MIGRACION con ${nombreDia(v.diaDeCorte)} y acuerdos del grupo con [${dias.map(nombreDia).join(", ")}]`,
      });
    }
    if (diaDeVigencia(v.vigenteDesde) !== null) {
      anomalias.push({ localId: v.localId, vigenciaId: v.id, motivo: "vigencia de MIGRACION con fecha: tenía que ser desde siempre" });
    }
  }
  for (const a of diasInvalidos) {
    anomalias.push({ localId: a.localId, acuerdoId: a.id, motivo: `acuerdo con ${nombreDia(a.diaDeCorte)}: no se migró` });
  }

  const pendientesMultiples = [];
  for (const [localId, lista] of vigenciasDe) {
    const pendientes = lista.filter((v) => {
      const d = diaDeVigencia(v.vigenteDesde);
      return d !== null && d > hoy;
    });
    if (pendientes.length > 1) pendientesMultiples.push({ localId, vigencias: pendientes.map((v) => v.id) });
  }

  return {
    hoy,
    ubicaciones: locales.length,
    configuradas: locales.filter((l) => vigenciasDe.get(l.id).length > 0).length,
    conflictos,
    obsoletos,
    localesSinConfigurar,
    depositosSinConfigurar,
    anomalias,
    pendientesMultiples,
  };
}

function informe(d, nombres) {
  const n = (id) => `${nombres.get(id) ?? "?"} (#${id})`;
  const renglones = [];
  renglones.push(`Semana operativa, diagnóstico al ${d.hoy}.`);
  renglones.push(`Ubicaciones: ${d.ubicaciones}. Con semana configurada: ${d.configuradas}.`);
  renglones.push("");
  renglones.push(`Acuerdos en conflicto: ${d.conflictos.length}.`);
  for (const c of d.conflictos) renglones.push(`  - ${n(c.localId)}: ${c.dias.map(nombreDia).join(" y ")} (acuerdos ${c.acuerdos.join(", ")})`);
  renglones.push(`Acuerdos obsoletos: ${d.obsoletos.length}.`);
  for (const o of d.obsoletos) renglones.push(`  - acuerdo ${o.id} de ${n(o.localId)}: ${o.motivo}`);
  renglones.push(`Locales sin configurar: ${d.localesSinConfigurar.length}.`);
  for (const l of d.localesSinConfigurar) renglones.push(`  - ${n(l.localId)}${l.activo ? "" : " [inactivo]"}: ${l.motivo}`);
  renglones.push(`Depósitos sin configurar: ${d.depositosSinConfigurar.length}.`);
  for (const l of d.depositosSinConfigurar) renglones.push(`  - ${n(l.localId)}${l.activo ? "" : " [inactivo]"}`);
  renglones.push(`Anomalías del backfill: ${d.anomalias.length}.`);
  for (const a of d.anomalias) renglones.push(`  - ${n(a.localId)}: ${a.motivo}`);
  renglones.push(`Ubicaciones con más de un cambio pendiente: ${d.pendientesMultiples.length}.`);
  for (const p of d.pendientesMultiples) renglones.push(`  - ${n(p.localId)}: vigencias ${p.vigencias.join(", ")}`);
  return renglones.join("\n");
}

async function main() {
  const prisma = await crearClientePrisma({ nivel: LECTURA });
  try {
    const d = await diagnosticar(prisma);
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(d, null, 2));
      return;
    }
    const locales = await prisma.local.findMany({ select: { id: true, nombre: true } });
    console.log(informe(d, new Map(locales.map((l) => [l.id, l.nombre]))));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`No se pudo armar el diagnóstico de la semana operativa: ${e.message}`);
    process.exit(1);
  });
}
