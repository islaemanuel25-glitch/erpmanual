// LO QUE COMPARTEN LOS GENERADORES DE CORRECCIONES DE PRECIOS.
//
// Los dos generadores del 2026-10-30 leen las mismas exportaciones de producción
// y escriben migraciones con la misma forma. Lo común vive acá para que no haya
// dos maneras de decidir qué costo ve una ubicación o qué oferta está vigente.

import { ofertaVigente } from "../../lib/ofertas/vigencia.js";

export const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** El de la ubicación si es un número de verdad y no cero; si no, el de la ficha (`precioDeLaUbicacion`). */
export const deLaUbicacion = (local, ficha) => (num(local) ? num(local) : num(ficha));

/** Un número para SQL, o NULL. */
export const sql = (v) => (v === null || v === undefined ? "NULL" : String(Number(v)));

/** Las fechas de la base vienen sin zona y están en UTC. */
export const conZona = (v) => (v == null ? null : /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`);

export const moneda = (v) => {
  const s = Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${s.endsWith(",00") ? s.slice(0, -3) : s}`;
};

/** Los productos (por ficha) que están en una oferta vigente ahora, con la regla del POS. */
export function basesEnOfertaVigente(ofertas, ahora = new Date()) {
  return new Set(
    (ofertas ?? [])
      .filter((o) =>
        ofertaVigente(
          { ...o, publicadaEn: conZona(o.publicadaEn), finalizadaEn: conZona(o.finalizadaEn), inicioEn: conZona(o.inicioEn), finEn: conZona(o.finEn) },
          ahora
        )
      )
      .flatMap((o) => o.bases ?? [])
  );
}

/** CSV con comillas, como lo escribe `\copy ... csv header`: una lista de objetos por cabecera. */
export function leerCsv(texto) {
  const filas = [];
  let campo = "";
  let fila = [];
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...resto] = filas;
  return resto.filter((f) => f.length === cabecera.length).map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i]])));
}

/** El valor de `--nombre`, o sale con 2. */
export function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i < 0 || !process.argv[i + 1]) {
    console.error(`Falta --${nombre}`);
    process.exit(2);
  }
  return process.argv[i + 1];
}
