// Tests UNITARIOS PUROS del tender "Saldo automático" (lib/pos-ventas/pagosAjuste).
// Sin DB, sin servidor. Verifica que la suma de pagos SIEMPRE quede igual al total
// corregido (en centavos), la reasignación del ajustador y el payload final.
// Uso: node scripts/unit-pagos-ajuste.mjs

import {
  aCent, desdeCent, totalCentDeLineas, crearPago, esFiado,
  normalizarAjustador, recomputar, maxAsignableCent, setMontoCent, setAjustador,
  agregarPago, quitarPago, aplicarFiado, medioUnico, cambiarMedio,
  payloadPagos, sumaPayloadCent, payloadValido, FIADO,
} from "../lib/pos-ventas/pagosAjuste.js";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };
const sum = (ps) => ps.reduce((a, p) => a + (p.montoCent || 0), 0);
// El ajustador siempre cierra la suma contra el total.
const cuadra = (r, totalCent) => r.sumaCent === totalCent;

// 1) UN medio y AUMENTO del total ------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(1920), false)]);
  let r = recomputar(pagos, aCent(1920));
  ok("1a. un medio: importe = total inicial (1920)", r.pagos[0].montoCent === aCent(1920), `${r.pagos[0].montoCent}`);
  r = recomputar(pagos, aCent(3820)); // sube el total
  ok("1b. un medio: absorbe automáticamente el nuevo total (3820)", r.pagos[0].montoCent === aCent(3820) && cuadra(r, aCent(3820)), `${r.pagos[0].montoCent}`);
  ok("1c. un medio: es de solo lectura (setMontoCent no lo cambia)",
     setMontoCent(pagos, pagos[0].id, aCent(1), aCent(3820))[0].montoCent === pagos[0].montoCent);
}

// 2) UN medio y REDUCCIÓN del total ---------------------------------------------
{
  const pagos = normalizarAjustador([crearPago("DEBITO", 0, false)]);
  const r = recomputar(pagos, aCent(500));
  ok("2. un medio: baja de total → absorbe 500", r.pagos[0].montoCent === aCent(500) && cuadra(r, aCent(500)));
}

// 3) VARIOS medios y AUMENTO -----------------------------------------------------
{
  let pagos = [crearPago("EFECTIVO", aCent(1000), false), crearPago("DEBITO", 0, false)];
  pagos = normalizarAjustador(pagos); // DEBITO (último) = ajustador
  let r = recomputar(pagos, aCent(1500));
  const aj = r.pagos.find((p) => p.id === r.ajustadorId);
  ok("3a. ajustador por defecto = último no-FIADO (DEBITO)", aj.medio === "DEBITO");
  ok("3b. varios + aumento: EFECTIVO fijo 1000, DEBITO absorbe 500", r.pagos[0].montoCent === aCent(1000) && aj.montoCent === aCent(500) && cuadra(r, aCent(1500)));
  r = recomputar(pagos, aCent(2600)); // sube total
  ok("3c. varios + aumento mayor: DEBITO absorbe 1600", r.pagos.find((p) => p.id === r.ajustadorId).montoCent === aCent(1600) && cuadra(r, aCent(2600)));
}

// 4) VARIOS medios y REDUCCIÓN ---------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(300), false), crearPago("CREDITO", 0, false)]);
  const r = recomputar(pagos, aCent(500));
  ok("4. varios + reducción: EFECTIVO 300, CREDITO absorbe 200", r.pagos[0].montoCent === aCent(300) && r.pagos[1].montoCent === aCent(200) && cuadra(r, aCent(500)));
}

// 5) CAMBIO de ajustador ---------------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(700), false), crearPago("DEBITO", aCent(300), false)]);
  // Hoy DEBITO es ajustador. Cambiar a EFECTIVO.
  pagos = setAjustador(pagos, pagos[0].id);
  const r = recomputar(pagos, aCent(1000));
  ok("5. cambio de ajustador: EFECTIVO pasa a Saldo automático", r.ajustadorId === r.pagos[0].id && r.pagos[1].montoCent === aCent(300) && r.pagos[0].montoCent === aCent(700) && cuadra(r, aCent(1000)));
}

// 6) AGREGAR medio ---------------------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(1000), false)]);
  pagos = agregarPago(pagos, "DEBITO"); // nuevo editable, NO ajustador
  const nuevo = pagos.find((p) => p.medio === "DEBITO");
  ok("6a. agregar medio: NO se vuelve ajustador y arranca en 0", nuevo.ajusta === false && nuevo.montoCent === 0);
  ok("6b. agregar medio: el ajustador sigue siendo EFECTIVO", pagos.find((p) => p.ajusta).medio === "EFECTIVO");
  const conMonto = setMontoCent(pagos, nuevo.id, aCent(250), aCent(1000));
  const r = recomputar(conMonto, aCent(1000));
  ok("6c. al asignar 250 al nuevo, EFECTIVO absorbe 750", r.pagos.find((p) => p.medio === "DEBITO").montoCent === aCent(250) && r.pagos.find((p) => p.ajusta).montoCent === aCent(750) && cuadra(r, aCent(1000)));
}

// 7) ELIMINAR medio (no ajustador) ----------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(400), false), crearPago("DEBITO", aCent(600), false)]);
  pagos = setAjustador(pagos, pagos[1].id); // DEBITO ajustador
  const idEfec = pagos[0].id;
  pagos = quitarPago(pagos, idEfec);
  const r = recomputar(pagos, aCent(1000));
  ok("7. eliminar medio: importe vuelve al ajustador (DEBITO=1000)", r.pagos.length === 1 && r.pagos[0].medio === "DEBITO" && r.pagos[0].montoCent === aCent(1000) && cuadra(r, aCent(1000)));
}

// 8) ELIMINAR el ajustador -------------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(400), false), crearPago("DEBITO", aCent(300), false), crearPago("CREDITO", 0, false)]);
  // CREDITO (último) es ajustador; lo eliminamos.
  const ajId = normalizarAjustador(pagos).find((p) => p.ajusta).id;
  pagos = quitarPago(pagos, ajId);
  const r = recomputar(pagos, aCent(1000));
  ok("8a. eliminar ajustador: nuevo ajustador = último no-FIADO (DEBITO)", r.pagos.find((p) => p.ajusta).medio === "DEBITO");
  ok("8b. eliminar ajustador: EFECTIVO 400, DEBITO absorbe 600", r.pagos[0].montoCent === aCent(400) && r.pagos.find((p) => p.ajusta).montoCent === aCent(600) && cuadra(r, aCent(1000)));
}

// 9) AJUSTADOR en CERO -----------------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(1000), false), crearPago("DEBITO", 0, false)]);
  // EFECTIVO editable = 1000 (= total) → DEBITO ajustador queda en 0.
  const r = recomputar(pagos, aCent(1000));
  ok("9a. ajustador en 0 se detecta (ceroAjustador)", r.ceroAjustador === true && r.pagos.find((p) => p.ajusta).montoCent === 0);
  ok("9b. el tender en 0 se EXCLUYE del payload", payloadPagos(r.pagos).length === 1 && payloadPagos(r.pagos)[0].medio === "EFECTIVO");
  ok("9c. payload en 0-ajustador sigue sumando el total exacto", sumaPayloadCent(r.pagos) === aCent(1000) && payloadValido(r.pagos, aCent(1000)));
}

// 10) INTENTO de superar el total ------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(0), false), crearPago("DEBITO", 0, false)]);
  // EFECTIVO editable; intentar asignarle 5000 con total 1000 → clamp a 1000.
  const idEfec = pagos[0].id;
  const clamp = setMontoCent(pagos, idEfec, aCent(5000), aCent(1000));
  const r = recomputar(clamp, aCent(1000));
  ok("10a. no se puede superar el total (clamp a max)", r.pagos[0].montoCent === aCent(1000));
  ok("10b. ajustador nunca negativo (queda en 0)", r.negativo === false && r.pagos.find((p) => p.ajusta).montoCent === 0);
  ok("10c. maxAsignableCent respeta el total", maxAsignableCent(pagos, idEfec, aCent(1000)) === aCent(1000));
}

// 11) CANTIDADES FRACCIONARIAS ---------------------------------------------------
{
  // 3 líneas de 33.33 (→ 9999) + una de 0.1×3 (→ 30) = 10029 centavos.
  const lineas = [
    { precio: 33.33, cantidad: 1 }, { precio: 33.33, cantidad: 1 }, { precio: 33.33, cantidad: 1 },
    { precio: 0.1, cantidad: 3 },
  ];
  const totalCent = totalCentDeLineas(lineas);
  ok("11a. total con fracciones sin artefactos float (10029c)", totalCent === 10029, `${totalCent}`);
  const pagos = normalizarAjustador([crearPago("EFECTIVO", 0, false)]);
  const r = recomputar(pagos, totalCent);
  ok("11b. un medio absorbe el total fraccionario exacto", r.pagos[0].montoCent === totalCent && cuadra(r, totalCent));
  ok("11c. desdeCent muestra 100.29", desdeCent(totalCent).toFixed(2) === "100.29");
}

// 12) DIFERENCIA DE UN CENTAVO ---------------------------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(3.33), false), crearPago("DEBITO", 0, false)]);
  let r = recomputar(pagos, aCent(10)); // total 1000c; EFECTIVO 333c; DEBITO 667c
  ok("12a. reparto 333 + 667 = 1000", r.pagos[0].montoCent === 333 && r.pagos.find((p) => p.ajusta).montoCent === 667 && cuadra(r, 1000));
  r = recomputar(pagos, 1001); // sube 1 centavo
  ok("12b. +1 centavo lo absorbe el ajustador (668)", r.pagos.find((p) => p.ajusta).montoCent === 668 && cuadra(r, 1001));
}

// 13) FIADO ÚNICO ----------------------------------------------------------------
{
  const pagos = aplicarFiado(aCent(2500));
  ok("13a. FIADO es único tender = total", pagos.length === 1 && pagos[0].medio === FIADO && pagos[0].montoCent === aCent(2500));
  ok("13b. agregarPago no agrega medios si hay FIADO", agregarPago(pagos, "EFECTIVO").length === 1);
  const r = recomputar(pagos, aCent(2500));
  ok("13c. FIADO cuadra con el total", cuadra(r, aCent(2500)) && esFiado(r.pagos));
}

// 14) CAMBIO DESDE y HACIA FIADO -------------------------------------------------
{
  // Distribución múltiple → a FIADO: colapsa a FIADO único = total.
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(600), false), crearPago("DEBITO", aCent(400), false)]);
  const aFiado = cambiarMedio(pagos, pagos[0].id, FIADO, aCent(1000));
  ok("14a. → FIADO: colapsa a FIADO único = total", aFiado.length === 1 && aFiado[0].medio === FIADO && aFiado[0].montoCent === aCent(1000));
  // Desde FIADO → EFECTIVO: único medio = total.
  const desdeFiado = cambiarMedio(aFiado, aFiado[0].id, "EFECTIVO", aCent(1000));
  ok("14b. desde FIADO → medio único = total", desdeFiado.length === 1 && desdeFiado[0].medio === "EFECTIVO" && desdeFiado[0].montoCent === aCent(1000));
}

// 15) PAYLOAD final == total EXACTO en centavos ----------------------------------
{
  let pagos = normalizarAjustador([crearPago("EFECTIVO", aCent(123.45), false), crearPago("MERCADOPAGO", 0, false)]);
  const totalCent = aCent(500);
  const r = recomputar(pagos, totalCent);
  const pl = payloadPagos(r.pagos);
  const sumaPl = pl.reduce((a, p) => a + aCent(p.monto), 0);
  ok("15a. payload suma exactamente el total en centavos", sumaPl === totalCent && payloadValido(r.pagos, totalCent));
  ok("15b. payload no incluye montos ≤ 0", pl.every((p) => aCent(p.monto) > 0));
  ok("15c. montos del payload son decimales (desde centavos)", pl.every((p) => Number.isFinite(p.monto)));
}

console.log(`\nRESULTADO PAGOS-AJUSTE: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
