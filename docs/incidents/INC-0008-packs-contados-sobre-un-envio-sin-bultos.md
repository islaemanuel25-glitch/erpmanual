# INC-0008 — Una línea que salió sin ningún pack tiene 6 packs contados: 180 unidades donde llegaron 8

**Estado:** **ABIERTO.** El dato equivocado sigue en la base. La causa de
interfaz se arregló el 2026-09-13 y todavía no está desplegada; **la fila no se
tocó a propósito**, para que se corrija desde la pantalla y quede el autor.
**Cuándo:** el conteo se guardó antes del 2026-09-13; la transferencia #195 se
abrió y sigue en «Recibiendo». Medido el 2026-09-13.
**Alcance:** una línea con el dato mal, y **cero** unidades de stock movidas por
esto. Veintidós líneas más expuestas al mismo error, todavía sin contar.

## Los números

`TransferenciaDetalle` **6519**, de la transferencia **#195**, local 1 → local 2,
producto `DON SATUR BIZCOCHITOS SALADO`:

- **Enviado:** `presentacionEnvio = PACK`, `factorPresentacion = 30`,
  `cantidadPresentada = 0`, `sueltasEnviadas = 8`. O sea **cero packs enteros y 8
  unidades sueltas: 8 unidades**. El depósito rompió un pack y despachó suelto.
- **Guardado como recibido:** `recibido = 6`, `recibidoUnidadesSueltas = 0`, con
  `revisadoEnRecepcion = true` y `motivoPrincipal = "Producto dañado"`.
- **Cómo lo lee el sistema:** `recibido` está en la escala de la presentación, así
  que 6 × 30 = **180 unidades recibidas contra 8 enviadas**. Un **sobrante de
  172** que nadie despachó.

El motivo elegido es lo que delata la intención: **"Producto dañado" sobre un
sobrante no tiene sentido.** Quien contó estaba declarando que de las 8 llegaron
6 —faltaban 2— y escribió el 6 en el único campo que la pantalla ofrecía para el
número principal, que era el de packs.

## NO MOVIÓ STOCK, Y POR QUÉ

**La transferencia #195 está en «Recibiendo», o sea sin confirmar.** El stock del
destino se acredita al confirmar, no al guardar el conteo: guardar es un borrador
—así está escrito en `guardar-recepcion`, que a propósito no marca revisado ni
toca inventario—.

Comprobado además por el otro lado: `AuditoriaStock` no tiene ninguna fila para
el detalle 6519.

**Si la #195 se confirma tal como está, sí lo mueve:** entrarían **180 unidades**
al local 2 y el origen quedaría con un ajuste de **−172**, porque un excedente se
le descuenta al origen además de lo que ya perdió al enviar. Son las dos cosas a
la vez y ninguna ocurrió.

## Cuántas más, enumerado

Tres consultas sobre `TransferenciaDetalle` completo —`findMany` sin filtrar por
estado, así que no hay un nivel afuera—, el 2026-09-13:

- **24 líneas** con `presentacionEnvio` agrupado, `cantidadPresentada = 0` y
  `sueltasEnviadas > 0`, sobre 299 con snapshot agrupado: el **8 %**. No es un
  caso raro.
- De esas 24: **22 en «Enviada»** —todas en la transferencia #199, que todavía no
  empezó a recibirse— y **2 en «Recibiendo»**. **Ninguna en «Recibida».**
- Con `recibido > 0` sobre un envío de cero bultos hay **2**, y una **no es este
  defecto**: el detalle **6389** —QUILMES CERVEZA 1L, transferencia #186, ya
  Recibida— es `agregadoEnRecepcion = true`, un producto agregado durante la
  recepción, que por definición tiene envío cero. Su fila de auditoría dice
  "enviado 0, recibido 2 CAJÓN x12, descontado" en el local 1. Es la función de
  no declarados trabajando bien.

**Conclusión, que es la que importaba:** **ninguna transferencia cerrada movió
stock por este defecto.** El faltante no quedó en la base de ninguna recepción
confirmada.

La otra línea en «Recibiendo» —detalle **6393**, Manteca Tremblay, transferencia
#191— está **bien contada**: 0 packs y 5 sueltas contra 0 packs y 5 sueltas
enviadas, sin diferencia. Se nombra acá porque es la que demuestra que el par
"recibido 0 · sueltas N" es la codificación válida y que hay datos vivos escritos
así.

## La causa

**La pantalla ofrecía un campo de packs sobre una línea que no trajo ningún
pack.** El panel dibujaba dos campos siempre que la presentación agrupara, sin
preguntar si de esa presentación había salido algo: el de "PACK x30 completos"
—precargado en 0— y el de "Unidades sueltas". El número principal, el grande, el
primero, era el de packs.

Pedirle a alguien que cuente packs cuando no llegó ningún pack es pedirle que
cuente algo que no existe, y el error que produce no es un typo: multiplica por
30.

## Resolución

**De la causa, el 2026-09-13:** si el envío no tiene ningún bulto entero, la línea
se cuenta **por unidad** — el pack no se nombra, hay **un solo campo** rotulado
"Unidades", y el precio que se muestra es el de la unidad y no el del pack. La
regla vive en `seCuentaPorUnidad`, en
`lib/transferencias/presentacionEnvio.js`, y la consultan la tarjeta y el panel
del teléfono. Es la extensión de
[`unidad-medida-es-como-se-compra.md`](../business-rules/unidad-medida-es-como-se-compra.md):
manda cómo salió la línea.

**De la fila, NADA, y es deliberado.** No se escribió sobre el dato. El campo
único de esa línea va a abrir mostrando **180** —las unidades que el sistema hoy
cree que llegaron—, con el borde en danger y el importe tachado, así que el
número equivocado se ve, se corrige desde la pantalla y queda con su autor y su
hora. Reescribirlo desde un script lo habría dejado sin autoría y sin que nadie
se enterara de que había pasado.

**Lo que NO se cambió, y es lo que hace que esto sea seguro:** la escala en la que
la línea se guarda y en la que el servidor la valida. Sigue siendo la del
snapshot, BULTO con factor 30. Colapsarla también del lado del servidor era la
solución más limpia de leer y **habría dejado sin poder confirmar la
transferencia #191**: el par "recibido 0 · sueltas 5" del detalle 6393 es
irrepresentable con factor 1 —`milesimasFisicas` rechaza un desglose sobre una
escala que no agrupa, a propósito— y `validarDetalleRecepcion` devuelve
`UNIDADES_SUELTAS_SIN_BULTO`. Medido ejecutándolo, no leyéndolo. Ese camino
necesita una migración de datos y quedó descartado para esta tanda.

## Detección

No lo encontró ningún candado ni ninguna alarma. Apareció **contando en producción
cuántas líneas tenían la combinación "cero bultos y sueltas positivas"** para
dimensionar un cambio de rótulo, el 2026-09-13. Las dos líneas con conteo
guardado se miraron una por una porque eran solo dos.

**Es el mismo patrón que ya está escrito en `CLAUDE.md`:** el defecto vivía entre
las piezas. Cada una hacía bien su parte —el campo guardaba packs, el validador
multiplicaba por el factor, el snapshot decía la verdad— y nadie preguntaba si
tenía sentido ofrecer ese campo.

## Lección

Un campo que no puede tener un valor válido no se muestra en gris ni precargado
en cero: **no se muestra.** Un cero editable al lado de la etiqueta "PACK x30
completos" no dice "acá no va nada", dice "escribí cuántos packs".

## Evidencia

- Los números del 6519, del 6393 y del 6389, leídos de la base de producción el
  2026-09-13 en un contenedor descartable de la imagen que atiende.
- `AuditoriaStock` sin filas para el 6519 y con una para el 6389.
- `milesimasFisicas({cantidad: 0, sueltas: 5, unidad: "UNIDAD", factorPack: 1})`
  → `null`, y `validarDetalleRecepcion` → `UNIDADES_SUELTAS_SIN_BULTO`, ejecutado
  el 2026-09-13.
- `components/transferencias/lineaSoloSueltas.test.mjs` — los once candados de la
  regla nueva, con el fixture sacado del detalle 6702.

## Sin verificar

- **Quién contó esa línea y qué tenía en la mano.** `revisadoEnRecepcionPorId`
  dice quién la marcó, pero la reconstrucción de la intención —"quiso decir 6
  unidades"— sale del motivo elegido y de la aritmética, no de un testimonio. Es
  la explicación más simple que ajusta los datos, no un hecho registrado.
- **Si las 22 líneas de la #199 se van a contar mal.** Están sin tocar: la
  afirmación es que están EXPUESTAS al mismo error, no que vaya a ocurrir. Con el
  arreglo desplegado antes de que se reciba la #199, no se puede cometer.
- **Cuántas veces pasó antes del snapshot.** La combinación solo se puede
  reconocer en líneas que registran `cantidadPresentada` y `sueltasEnviadas`, o
  sea posteriores al 2026-09-09. En las 6.000 anteriores el dato no existe, así
  que no se puede contar ni afirmar que no ocurrió.
