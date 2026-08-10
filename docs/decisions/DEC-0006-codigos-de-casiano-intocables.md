# DEC-0006 — Los códigos de Casiano Casas no se tocan

**Estado:** Vigente
**Fecha:** 2026-08-10
**Decidió:** Emanuel

## Contexto

En la columna `ProductoBase.codigo_barra` hay 90 productos cuyo valor no es un
código de barras sino texto: el nombre del producto volcado, o una abreviatura
que alguien escribió para poder encontrarlo. El detalle está en
[../business-rules/codigos-de-barra.md](../business-rules/codigos-de-barra.md).

Se probaron tres criterios para decidir cuáles vaciar y los tres se quedaron
cortos. "El código es el nombre o su comienzo" dejaba adentro atajos como `bica`
y `camel10`, porque un atajo también empieza igual que el nombre. "Más de 8
caracteres" partía la fiambrería al medio, porque sus nombres son cortos. "Cero
ventas" funcionó y vació 29, pero por construcción dejó afuera todo lo que se
usa, que es justamente lo que había que decidir.

Lo que ninguna regla de forma podía saber es **de quién es cada código**.

## Decisión

**El único local que crea y toca productos es Casiano Casas. Lo suyo no se toca:
ni los productos que creó ni los códigos que inventó. Todo lo demás es del
depósito y se vacía.**

Vale solo para los códigos escritos con letras. Los tres códigos GS1 de 16
dígitos son legítimos —etiquetas de bulto emitidas por un lector— y quedan como
están, sin importar quién creó el producto.

El creador no se deduce de nada: está guardado en `ProductoBase.creadoEnLocalId`.

## Por qué

**El motivo no está escrito porque Emanuel no lo dio, y no se completa acá.** La
regla que dio es la de arriba: Casiano crea y toca productos, y lo suyo no se
toca.

Lo que sí se puede afirmar es lo que la medición sostiene: el creador está
guardado y es un hecho verificable, mientras que "quién tipea este código" no
está en ninguna tabla. Cualquier explicación sobre los hábitos de una ubicación
sería una suposición, y una suposición metida en una hoja de decisión se lee
después como si hubiera sido parte de la decisión.

Si el motivo hace falta para revisar esto más adelante, hay que preguntárselo,
no reconstruirlo.

## Lo que esta decisión cuesta, y se acepta

**Los 60 del depósito que se vacían tienen ventas. Los 60.** Tiene que ser así:
los que nunca vendieron ya los vació la migración anterior, así que lo que queda
es exactamente lo que se usa. Entre ellos `cremosocremac` con 204 ventas,
`BARRATREMBLAY` con 203 y `xl` con 172, las tres del mismo día de la medición.

Se probó un recorte por ventas —dejar afuera los de más de 50— y **se descartó**:
el criterio quedó siendo uno solo, quién creó el producto. No hay condición ni
excepción por ventas.

Lo que sí queda es una ayuda operativa, no una regla: en el respaldo, los 15 que
más venden están señalados arriba de todo con su `UPDATE` listo. Si alguien avisa
que le falta un atajo, lo más probable es que sea uno de esos y se repone sin leer
las sesenta líneas.

## Esto NO es un invariante del sistema

**Es una decisión de hoy, y se puede cambiar mañana sin pelear con nada.**

No hay ningún candado que impida tocar los productos de Casiano, ni una
validación en el código, ni una regla en el motor. No la hay a propósito: si
mañana Casiano deja de cargar productos, o empieza a cargar otro local, o
aparecen códigos suyos que también son basura, la decisión se revisa y se escribe
la siguiente. Lo único que existe es esta hoja y la lista explícita de ids dentro
de una migración.

Un invariante en el código diría "esto es así siempre"; lo que hay que decir es
"esto lo decidimos el 2026-08-10". Y si el motivo no está, que se note que no
está, en vez de rellenarlo.

## Alcance real, medido

- **61** productos con código de texto quedaban al momento de decidir.
- **60** los creó el depósito → **se vacían**, sin mirar ventas.
- **1** lo creó Casiano Casas: `pollo trozado` (id 2387, 34 ventas) → **no se
  toca**.
- **0** sin creador. El campo está siempre cargado en los 2.578 productos del
  catálogo, así que el grupo que preveíamos no existe.
- Casiano creó **305 productos** en total: 247 sin ningún código, 57 con código
  de dígitos y ese 1 con texto. Cuando carga algo, lo normal es dejar el campo
  vacío.
- Al terminar queda **1** solo código de texto en la columna: el de Casiano.

## Lo que esta decisión NO alcanza

El código de nivel ubicación —`ProductoLocal.codigo_barra_propio`, el tercer
campo, el que un local se pone para sí y el depósito no ve— **está vacío en las
11.651 filas de producción**. La capacidad existe en la ficha y nadie la usó
nunca, ni Casiano.

Así que la parte de la regla que hablaba de "los códigos que Casiano inventó en
su nivel" no tiene hoy ningún caso. Queda escrita igual, porque el día que
empiece a usarse conviene que la regla ya esté decidida y no haya que discutirla
con datos encima.
