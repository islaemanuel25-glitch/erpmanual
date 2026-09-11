// SONDA DE SOLO LECTURA: qué decía y qué dice ahora la valorización.
//
//   node --import ./scripts/alias-loader.mjs scripts/sonda-valorizacion-remito.mjs <archivo.json>
//
// Lee filas YA EXTRAÍDAS de la base —no se conecta a nada, no escribe nada— y
// las pasa por la función NUEVA y por la fórmula VIEJA, para poder informar
// viejo → nuevo sin tocar producción.
//
// La fórmula vieja se reproduce acá a propósito: es la única forma de mostrar
// el antes sin volver atrás el código. Está encerrada en esta sonda y no la usa
// nadie más.

import fs from "node:fs";

import {
  valorizarLineaDelRemito,
  resolverCostoTransferencia,
} from "@/lib/transferencias/costoTransferencia";

const archivo = process.argv[2];
if (!archivo) {
  console.error("falta el archivo JSON con las filas");
  process.exit(2);
}

const filas = JSON.parse(fs.readFileSync(archivo, "utf8"));

const money = (n) =>
  n == null ? "—" : `$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lo que hacía antes: costo normalizado × `recibido` crudo. */
function comoEraAntes(fila, base, origenEsDeposito) {
  const costo = resolverCostoTransferencia({
    precioCosto: fila.precioCosto,
    unidadEnviada: fila.unidadEnviada,
    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,
    pesoEsFijo: base.pesoEsFijo,
    pesoReferenciaKg: base.pesoReferenciaKg,
    modoVentaDeposito: base.modoVentaDeposito,
    modoCompraProveedor: base.modoCompraProveedor,
    origenEsDeposito,
  });
  const cantidad = fila.recibido == null ? fila.cantidad : fila.recibido;
  return { costo, subtotal: cantidad * costo };
}

console.log("═".repeat(78));
for (const f of filas) {
  const base = {
    unidad_medida: f.unidad_medida,
    factor_pack: f.factor_pack,
    modoVentaDeposito: f.modoVentaDeposito,
    modoCompraProveedor: f.modoCompraProveedor,
    pesoReferenciaKg: f.pesoReferenciaKg,
    pesoEsFijo: f.pesoEsFijo,
  };
  const origenEsDeposito = f.origenEsDeposito === true;

  const antes = comoEraAntes(f, base, origenEsDeposito);
  const ahora = valorizarLineaDelRemito(f, base, { origenEsDeposito });

  console.log(`transf ${f.t} · detalle ${f.id} · ${f.nombre}`);
  console.log(
    `  ${ahora.presentacion}${ahora.factor ? ` x${ahora.factor}` : ""}` +
      ` · enviado ${ahora.cantidadPresentada}${ahora.sueltas ? ` + ${ahora.sueltas} sueltas` : ""}` +
      ` · recibido ${f.recibido ?? "(sin contar)"}`
  );
  console.log(`  costo    ANTES ${money(antes.costo)}   →   AHORA ${money(ahora.costoPresentacion)}`);
  console.log(`  subtotal ANTES ${money(antes.subtotal)}   →   AHORA ${money(ahora.subtotal)}`);
  console.log("");
}
console.log("═".repeat(78));
console.log("sonda de SOLO LECTURA: no se conectó a la base ni se escribió nada.");
