---
name: revisar-pantalla
description: Auditoría de una pantalla — hardcodeo y procedencia de componentes: qué reutiliza del sistema, qué pieza nueva debería pasar al kit, qué puede quedar local y qué duplica algo que ya existe.
context: fork
agent: auditor
allowed-tools: Read, Glob, Grep
---

# Ficha de hardcodeo — $ARGUMENTS

La ficha ya está corrida. Abajo está la salida cruda del contador, con archivo y
línea de cada hallazgo. **No hay que volver a contar nada.**

## La ficha

!`node --no-warnings scripts/hardcodeo.mjs --ficha "$ARGUMENTS" 2>&1`

## Cuánto es esto comparado con el resto

!`node --no-warnings scripts/hardcodeo.mjs --ranking "$ARGUMENTS" 2>&1`

## Qué hacer con esto

Sos el auditor: **mirás y explicás, no arreglás**. La tanda que corrige es otra.

### La forma del informe, que no se negocia

**La ficha de arriba NO se copia.** Emanuel ya la tiene si la quiere; lo que
espera de vos es lo que la ficha no dice. Un informe que repite doscientas líneas
no se lee, y entonces no sirvió de nada haberlo pedido.

Cuatro bloques, en este orden, y nada más:

1. **Una línea de encabezado**: cuántos hallazgos, en cuántos archivos, y el
   puesto en el ranking.
2. **LO PRIMERO QUE CONVIENE ARREGLAR — como mucho cinco entradas.** Cada una con
   qué es, **archivo y línea** —los que de verdad hay que abrir, no todos—,
   cuántas veces se repite, y el reemplazo concreto. Si son treinta ocurrencias
   del mismo caso en el mismo archivo, es UNA entrada que dice "treinta veces en
   tal archivo", no treinta.
3. **EL RESTO, RESUMIDO**: dos o tres líneas por categoría con el total y dónde
   se concentra. Sin listar ubicaciones.
4. **LO QUE LA FICHA NO DICE**: falsos positivos, patrones detrás de los números,
   qué no se puede arreglar todavía y la **procedencia de componentes** de la
   pantalla con la clasificación que se define más abajo.

Como referencia de largo: **cuarenta líneas está bien, ochenta ya es demasiado.**
Si no entra, es que se está copiando la ficha en vez de leerla.

### Si no hay ficha porque el nombre no existe

No inventes un informe ni salgas a buscar la pantalla por tu cuenta. Decilo en
dos líneas, ofrecé los nombres que más se parecen al que se pidió —el contador ya
los imprime— y terminá. Quien preguntó necesita el nombre correcto para repetir
la consulta, no un análisis de otra cosa.

### Cómo elegir esas cinco

Tres criterios para ordenar, en este orden:

1. **Lo que rompe un tema.** Un color fijo o una clase del tema paralelo se ve
   mal en las otras trece apariencias. Es lo que un usuario nota.
2. **Lo que tiene reemplazo directo.** Un `text-[11px]` con `text-sm2` al lado se
   cambia sin pensar. Un `text-[13px]` sin token equivalente necesita una
   decisión antes, así que no es lo primero.
3. **Lo que se repite.** Veinte veces el mismo `<button>` crudo en un archivo es
   una tarde de trabajo; uno suelto en otro es un minuto.

Y decí lo que la ficha NO dice:

- **Si un hallazgo es un falso positivo**, marcalo. El contador lee texto: no
  sabe si un `<button>` está adentro de un componente que ya es el botón del
  sistema, ni si un color fijo está en una pantalla que a propósito no sigue el
  tema.
- **Si hay un patrón detrás de los números.** "Los 30 colores fijos son todos del
  mismo archivo" es información; "hay 30 colores fijos" no.
- **Qué no se puede arreglar todavía** porque falta el componente o el token.

## La segunda mitad: procedencia de componentes

La ficha automática cuenta hardcodeo. **No puede decidir si la pantalla está
inventando una segunda versión de una pieza que ya existe, ni si una pieza nueva
merece entrar al kit.** Eso se audita leyendo la pantalla y buscando sus
equivalentes en `components/sunmi/` y en los componentes compartidos del repo.

No se busca que una pantalla sea "100 % componentes existentes". Esa regla sería
mala: impediría diseñar algo nuevo. Se busca otra cosa:

> **Una pantalla puede crear una composición nueva. No puede crear una segunda
> versión local de una pieza reutilizable.**

### Las cuatro clasificaciones

Cada pieza visual relevante que no sea mera composición de layout se clasifica en
una de estas cuatro categorías. **No inventes una quinta.**

- **REUTILIZA** — usa una pieza compartida que ya existe y corresponde al caso.
  Es verde. Ejemplos: `SunmiCard`, `SunmiInput`, `SunmiModalLayout`, un
  selector o badge ya existente.

- **CANDIDATO A KIT** — la pieza no existe hoy, la solución es buena y tiene
  sentido fuera de esta pantalla. **No es un error y no bloquea.** Se informa
  para decidir si conviene extraerla ahora o en otra tanda. Ejemplo: una tarjeta
  de navegación "icono + título + descripción + estado + chevron" que puede
  aparecer en otras portadas.

- **LOCAL JUSTIFICADO** — la pieza es composición o comportamiento propio de esta
  pantalla y extraerla no daría reutilización real. Es verde. Un `div` local no
  es un problema por existir; el problema es duplicar una abstracción.

- **DUPLICADO** — ya existe una pieza compartida equivalente y la pantalla la
  rehízo localmente, o reimplementa chrome global del ERP que ya provee el
  layout. **Este es el único rojo de esta auditoría.** Tiene que nombrar la pieza
  existente y el archivo concreto que debería usarse.

### Qué mirar, sin convertir esto en un policía que frena todo

No clasifiques cada `div`, `span` ni wrapper. Mirá solo las piezas con
identidad visual o de interacción: cards, chips, badges, headers, bloques de
estado, botones, inputs, selects, modales, filas navegables, avisos, tabs,
toolbars y patrones equivalentes.

Para cada pieza nueva:

1. Leer sus imports y JSX.
2. Buscar por función y forma en `components/sunmi/` y en `components/`.
3. Si ya existe un equivalente real, marcar **DUPLICADO**.
4. Si no existe, preguntar si tiene sentido en otra pantalla:
   - sí → **CANDIDATO A KIT**;
   - no → **LOCAL JUSTIFICADO**.
5. Si ya importa la pieza correcta → **REUTILIZA**.

**Parecido no alcanza para declarar DUPLICADO.** Dos cards pueden tener objetivos
distintos. Para poner rojo tiene que existir un reemplazo concreto que cubra el
caso sin perder comportamiento necesario. Si hay duda, es CANDIDATO A KIT o
LOCAL JUSTIFICADO, no rojo.

### El shell del ERP también cuenta como componente compartido

`Header`, navegación, título mobile, contexto activo, usuario/operador,
sidebar/topbar/bottom-nav y el padding estructural que pone `LayoutBase` son
chrome global. Una pantalla de `/modulos` no los reimplementa ni los oculta por
su cuenta.

Si una pantalla agrega su propio header, duplica el título global o mete una
excepción por ruta para saltear el chrome, clasificar **DUPLICADO**, salvo que
haya una excepción arquitectónica documentada y explícitamente aprobada para esa
ruta.

Un Figma de contenido **no es autorización para reemplazar el shell**. Si el
trabajo es un rediseño de una pantalla, se presume que cambia el contenido dentro
del shell existente. El shell solo cambia si el pedido lo dice de manera
explícita.

### Cómo entra esto en el informe

No agregues un quinto bloque. Va dentro de **LO QUE LA FICHA NO DICE**, resumido.

Formato esperado, solo para las piezas que importan:

- `REUTILIZA — SunmiCard / SunmiButton / ...`
- `CANDIDATO A KIT — [pieza]: por qué sería reutilizable`
- `LOCAL JUSTIFICADO — [pieza]: por qué es propia de esta pantalla`
- `DUPLICADO — [pieza local] duplica [pieza compartida], en [archivo]`

Si no hay DUPLICADOS, decirlo. Si hay diez REUTILIZA iguales, agruparlos. La
auditoría tiene que ayudar a decidir, no producir inventario.

**CANDIDATO A KIT nunca pone rojo por sí solo.** Que una pieza buena todavía viva
localmente puede ser una deuda aceptable. El rojo es haber ignorado una pieza
compartida que ya existía o haber rehecho el shell global sin autorización.

## Cómo se cierra el informe

Terminá **siempre** con una línea que diga exactamente:

    Ficha leída con el criterio ARRANQUE-2026-08-11.

Es la marca de que este cuerpo se cargó y no solo su descripción. Si esa línea no
aparece en el informe, la skill no se abrió: lo que se leyó fue el resumen de una
línea del frontmatter, y el informe se armó sin ninguna de las instrucciones de
acá.

## Los límites del contador

Está escrito en `lib/hardcodeo/contador.js`, en `FUERA_DE_ALCANCE`, y conviene
leerlo antes de sacar conclusiones: hay categorías que **no se cuentan a
propósito** —los textos de la interfaz, los números de negocio, los estilos en el
atributo `style`— porque no se pueden contar de forma confiable o no tienen
reemplazo.

Un número que a veces miente es peor que no tener número, porque igual se usa
para decidir.

## Por qué la ficha viene inyectada y no la corrés vos

Este skill se abre en el auditor, que **no tiene Bash a propósito**: es el agente
que mira y no toca. Los dos comandos de arriba se ejecutan ANTES del fork, y lo
que llega es su salida ya resuelta.

Si hiciera falta otro dato de un comando, se agrega acá arriba como otro bloque
inyectado. Nunca se le agrega Bash al auditor para que se lo consiga solo.

## El trinquete, que es la otra mitad

La ficha dice qué hay. El trinquete dice si empeoró:

    node scripts/hardcodeo.mjs --trinquete

Corre solo, en un hook `PostToolUse` sobre `Edit` y `Write`. No revierte nada:
avisa. La línea de base está en `docs/hardcodeo-linea-base.json` y arranca en lo
que había el 2026-08-11 — **no se trata de bajarla ya, se trata de no subirla**.

### Por dónde se saltea el hook

Cubre un solo camino: las escrituras que pasan por las herramientas `Edit` y
`Write` de Claude Code, en este repo. Estos llegan al código sin que se entere:

1. **Cualquier editor que no sea Claude Code.** VS Code, un `vim`, el bloc de
   notas: el hook no existe fuera de la herramienta.
2. **Un `sed`, un `>` o un script que escriba el archivo**, aunque se lance desde
   Claude Code. El hook mira `Edit` y `Write`, no `Bash`.
3. **Otra sesión de Claude Code fuera de este repo**, o con `--settings` propio:
   los hooks se resuelven por directorio de proyecto.
4. **Un `git checkout`, un `merge` o un `revert`** que traiga código de otra rama.
   Ahí los archivos cambian sin que nadie los edite.
5. **GitHub Actions y cualquier cosa que corra en el VPS.** El hook es local.
6. **Un archivo que no sea `.jsx` bajo `app/` o `components/`.** Es a propósito
   —es el universo que el contador recorre— pero significa que un `.js` con JSX
   adentro pasaría sin mirar.

En resumen: atrapa el camino de todos los días y **ninguno de los otros**. Lo que
lo haría obligatorio es que corra del lado del servidor, en CI, y eso todavía no
existe.
