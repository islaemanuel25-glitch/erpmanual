# `unidad_medida` es cómo se COMPRA, no cómo se cuenta ni cómo se vende

**Una ficha que dice `pack` no está mal cargada.** Antes de "corregirla",
leer esto.

Escrito el 2026-09-12, después de que el mismo error apareciera por segunda vez
en otro lugar del sistema. La primera vez costó 5.450 filas rotuladas mal; la
segunda, una pantalla que le preguntaba al operador algo que ya sabía.

## La regla

Un producto tiene **tres** escalas y son datos distintos que contestan preguntas
distintas. Ninguna se deduce de las otras:

1. **Cómo se COMPRA** — `Producto.unidad_medida` y `factor_pack`. Es la escala en
   la que el proveedor factura y en la que entra la mercadería. Es lo que hay
   escrito en la ficha.
2. **Cómo se VENDE** — la resuelve `calcularModoSalida`. Es la escala en la que
   el POS cobra y en la que se rotula un precio.
3. **Cómo SALIÓ una línea concreta** — `TransferenciaDetalle.unidadEnviada`, más
   el snapshot `presentacionEnvio` / `factorPresentacion` / `sueltasEnviadas`
   cuando la línea es posterior a la migración. Es un hecho de ESA línea, no del
   producto.

**Las tres pueden diferir al mismo tiempo y las tres pueden ser ciertas.**

El caso testigo es real y está en producción. `POETT PERFUMINA SOLO PARA TI`:

- se **compra** por pack de 12 — `unidad_medida: "pack"`, `factor_pack: 12`;
- se **vende** de a una;
- sus líneas de las transferencias #132, #149 y #195 **salieron sueltas** —
  `unidadEnviada: "UNIDAD"`, sin snapshot.

No hay contradicción, no hay nada que arreglar en la ficha, y no hay ningún
desempate que pedirle a una persona.

## Cuál manda, según para qué

- **Para contar una recepción manda cómo SALIÓ.** El depósito despachó de una
  manera concreta y el operador tiene eso en la mano. Es `unidadEnviada` de la
  línea —o su snapshot, que es más preciso todavía—, **nunca** la ficha. Si el
  catálogo cambió después del envío, la línea sigue mandando: la mercadería ya
  salió.
- **Para rotular un precio manda cómo se VENDE.** Un precio de bulto rotulado
  como unitario es falso, y eso fue el INC del catálogo.
- **Para una compra manda `unidad_medida`.** Que es para lo que está.

## Dónde está implementado

- `lib/transferencias/presentacionEnvio.js` → `descriptorDeEnvio`. Camino 1: si
  la línea trae `presentacionEnvio`, ese snapshot manda entero. Camino 2: se
  reconstruye del catálogo **pasándole `contadoEn: linea.unidadEnviada`** a
  `presentacionDeProducto`, que es exactamente lo que hace que la línea le gane a
  la ficha. Medido el 2026-09-12: la línea de POETT resuelve `UNIDAD` con la
  ficha diciendo `pack` x12.
- `lib/productos/presentacionDeProducto.js` → `presentacionDeProducto`, el
  resolutor canónico. `contadoEn` es el parámetro que permite pisar el catálogo.
- `lib/productos/calcularModoSalida.js` → la escala de venta.

## Las dos veces que el mismo error apareció

**Primera, en el catálogo.** La tarjeta de producto rotulaba el precio con
`unidad_medida` —cómo se compra— en vez de la escala en la que se vende. Eran
**5.450 de 10.521 filas activas, el 51,8 %**. Se arregló extrayendo
`calcularModoSalida`, en el commit `ad10fcf`. El postmortem completo está en
`docs/roadmap/el-precio-que-se-cobra.md`.

**Segunda, en la recepción de transferencias.** La ficha veía que la línea decía
UNIDAD y el catálogo decía PACK x12, lo leía como una contradicción a resolver, y
le ofrecía al operador "Usar PACK x12 para esta recepción". La escala ya estaba
bien resuelta: la pantalla preguntaba encima de una respuesta correcta. Se sacó
el bloque de adopción de las dos superficies el 2026-09-12.

Es el mismo error las dos veces: **tratar `unidad_medida` como si fuera la escala
de la operación que se está haciendo.** No lo es en ninguna de las dos.

## Lo que queda abierto

La ruta `app/api/transferencias/adoptar-presentacion/route.js` sigue existiendo y
**ya no tiene ningún llamador en el cliente**. Se dejó en pie porque hay **6
líneas adoptadas en producción** —contadas el 2026-09-12— cuyos datos escribió
ese endpoint, y porque su conversión, `admiteAdopcion` y
`equivalenciaParaAdoptar`, es la que el servidor valida. Darla de baja es una
decisión aparte y no se tomó acá.
