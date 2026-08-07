// Compara dos corridas del generador de huellas y reporta, campo por campo, qué
// se movió y en qué pantalla.
//
// Uso: node scripts/comparar-huellas.mjs <dirAntes> <dirDespues>
//
// Distingue dos clases de diferencia:
//   - ESTRUCTURAL: padding, alineación, fondo, alto de fila, opacidad, ancho,
//     overflow, columnas. Es lo que un refactor de la tabla puede romper.
//   - DATOS: cantidad de filas y texto de la tabla. Depende de la base, no del
//     código. Si la cantidad de filas cambió, la pantalla se marca como NO
//     COMPARABLE: la línea de base se tomó sobre otro conjunto de datos y
//     cualquier diferencia estructural que aparezca ahí no es concluyente.

import fs from "node:fs";
import path from "node:path";

const [dirAntes, dirDespues] = process.argv.slice(2);
if (!dirAntes || !dirDespues) {
  console.error("Uso: node scripts/comparar-huellas.mjs <dirAntes> <dirDespues>");
  process.exit(1);
}

const cargar = (d) => {
  const f = path.join(d, "huellas.json");
  if (!fs.existsSync(f)) {
    console.error(`No existe ${f}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
};

const antes = cargar(dirAntes);
const despues = cargar(dirDespues);

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const muestra = (v) => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v));

// Campos estructurales de una tabla, en el orden en que se reportan.
const CAMPOS_TABLA = [
  "columnas", "thAlign", "thPad", "thFondo", "anchoTabla",
];
const CAMPOS_FILA = ["alto", "fondo", "opacidad", "tdPad", "tdFuente", "tdAlign"];
const CAMPOS_CONTENEDOR = ["overflowX", "overflowY", "maxHeight", "id"];

function compararTabla(tA, tD, prefijo, dif) {
  for (const c of CAMPOS_TABLA) {
    if (!igual(tA[c], tD[c])) {
      dif.push({ campo: `${prefijo}.${c}`, antes: muestra(tA[c]), despues: muestra(tD[c]) });
    }
  }
  const cA = tA.contenedor || {};
  const cD = tD.contenedor || {};
  for (const c of CAMPOS_CONTENEDOR) {
    if (!igual(cA[c], cD[c])) {
      dif.push({ campo: `${prefijo}.contenedor.${c}`, antes: muestra(cA[c]), despues: muestra(cD[c]) });
    }
  }
  const n = Math.max((tA.muestra || []).length, (tD.muestra || []).length);
  for (let i = 0; i < n; i++) {
    const fA = (tA.muestra || [])[i] || {};
    const fD = (tD.muestra || [])[i] || {};
    for (const c of CAMPOS_FILA) {
      if (!igual(fA[c], fD[c])) {
        dif.push({ campo: `${prefijo}.fila[${i}].${c}`, antes: muestra(fA[c]), despues: muestra(fD[c]) });
      }
    }
  }
}

const pantallas = Object.keys(antes).filter((k) => k in despues);
const soloAntes = Object.keys(antes).filter((k) => !(k in despues));
const soloDespues = Object.keys(despues).filter((k) => !(k in antes));

let conDiferencias = 0;
let noComparables = 0;
const informe = [];

for (const nombre of pantallas) {
  const a = antes[nombre];
  const d = despues[nombre];
  const dif = [];
  const avisos = [];

  const nA = (a.tablas || []).length;
  const nD = (d.tablas || []).length;
  if (nA !== nD) {
    avisos.push(`cantidad de tablas: ${nA} → ${nD}`);
  }

  let datosDistintos = false;
  const n = Math.min(nA, nD);
  for (let i = 0; i < n; i++) {
    const tA = a.tablas[i];
    const tD = d.tablas[i];
    if (tA.filas !== tD.filas) {
      datosDistintos = true;
      avisos.push(`tabla ${i}: filas ${tA.filas} → ${tD.filas} (dato, no estilo)`);
    }
    compararTabla(tA, tD, `tabla[${i}]`, dif);
  }

  if (datosDistintos) noComparables++;
  if (dif.length) conDiferencias++;

  if (dif.length || avisos.length) {
    informe.push({ nombre, dif, avisos, datosDistintos });
  }
}

// --- Salida -----------------------------------------------------------------
console.log(`Comparando ${dirAntes} → ${dirDespues}`);
console.log(`Pantallas en ambas corridas: ${pantallas.length}`);
if (soloAntes.length) console.log(`Sólo en la base: ${soloAntes.join(", ")}`);
if (soloDespues.length) console.log(`Sólo en la corrida nueva: ${soloDespues.join(", ")}`);
console.log("");

if (!informe.length) {
  console.log("Sin diferencias: las huellas son idénticas en las dos corridas.");
} else {
  for (const p of informe) {
    const etiqueta = p.datosDistintos ? " [NO COMPARABLE: los datos cambiaron]" : "";
    console.log(`${p.nombre}${etiqueta}`);
    for (const av of p.avisos) console.log(`   aviso: ${av}`);
    for (const d of p.dif) console.log(`   ${d.campo}: ${d.antes}  →  ${d.despues}`);
    console.log("");
  }
}

// Una pantalla puede tener a la vez datos distintos y diferencias estructurales,
// así que las categorías se solapan: las idénticas se cuentan aparte, no restando.
const identicas = pantallas.length - informe.length;
console.log(`Resumen: ${pantallas.length} pantalla(s) comparadas, ${identicas} idénticas, ` +
  `${conDiferencias} con diferencias estructurales, ${noComparables} con datos distintos.`);
