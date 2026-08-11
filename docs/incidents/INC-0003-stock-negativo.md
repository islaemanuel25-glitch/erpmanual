# INC-0003 — Stock negativo grande y silencioso

**Estado:** ABIERTO. Medido, no investigado. Nadie lo está mirando.

**Detectado:** 2026-08-11, midiendo otra cosa (el residuo decimal del stock).

## Qué se sabe

Sobre `erpazul_al`, copia de los datos reales. Hay filas de `StockLocal` con
cantidades negativas grandes, en el depósito y en locales. Las peores medidas:

- **Mogul Mini Twist Uva** — −551,500 en `depo`, pack de 185
- **MOGUL CONITOS** — −11.701 en `depo`, pack de 450
- **MOGUL ANILLOS 1Kg** — −4.368 en `depo`, pack de 156
- **MOGUL DIENTES 500G** — −3.010 en `depo`, pack de 86
- **Mogul Tubito Mix Frutal** — −344,620 en `depo`, pack de 70
- **Crema de Leche Cremac** — −688 en total
- **Albondigas Caseras x Caja** — −35,445 en `depo` (y +7,152 en Casiano casas)
- **Mogul Gusanitos Extreme** — −3,500 en `depo`, pack de 78
- **Queso Azul Vanguard** — −1,945 en `depo`
- **Suprema** — −1,653 en Casiano casas

No es un puñado: filtrando por "Mogul" en la pantalla de stock del depósito, la
mayoría de las filas visibles están en negativo.

## Qué NO se sabe

- **Por qué.** No se investigó. Las hipótesis obvias —vender sin stock
  habilitado, stock inicial nunca cargado, transferencias que descontaron dos
  veces, correcciones de venta mal aplicadas— no se descartaron ni una.
- **Desde cuándo.** No se miró la bitácora de auditoría. Ojo que la bitácora
  está incompleta antes del 2026-08-09 (ver INC-0002), así que puede no alcanzar.
- **Si afecta plata.** El valorizado de stock multiplica cantidad por costo: con
  cantidades negativas, ese informe da de menos. No se midió cuánto.

## Lo que SÍ se hizo

Nada sobre los datos. **No se corrigió ninguna fila.**

Lo único que cambió es que ahora **se ven bien**: hasta el 2026-08-11 la pantalla
de stock dejaba de traducir a bultos cuando el número era negativo y mostraba
"−4368 uds" donde ahora dice "−28 bultos". Además el cálculo estaba mal para
negativos y contaba un bulto de más. Eso está arreglado y con candados.

**Mostrar bien un número que no debería existir no es lo mismo que arreglarlo.**

## Por qué está acá y no en el roadmap

Porque no es una mejora pendiente: es un dato de producción que probablemente
esté mal desde hace tiempo y que nadie decidió. Sacarlo del roadmap y ponerlo
acá es para que se lea como lo que es.

## Lo primero que habría que hacer

1. Separar los negativos por causa probable: mirar si son productos que se
   venden sin stock cargado, o si tienen movimientos de transferencia.
2. Ver si el negativo crece: dos mediciones separadas por unos días dicen si es
   una herida abierta o una cicatriz vieja.
3. Recién ahí decidir si se corrigen a cero, se reponen con un inventario, o se
   dejan.

## Relacionado

- `docs/incidents/INC-0002-bitacora-incompleta.md` — la bitácora no cubre lo
  anterior al 2026-08-09
- `lib/conversiones/stock.test.mjs` — los candados del desglose usan estos
  valores reales
