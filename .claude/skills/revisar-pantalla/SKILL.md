---
name: revisar-pantalla
description: Ficha de hardcodeo de una pantalla — colores fijos, medidas mágicas, modales a mano, elementos crudos y clases del tema paralelo, con archivo, línea y el reemplazo que ya existe.
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
4. **LO QUE LA FICHA NO DICE**: falsos positivos que detectaste, patrones detrás
   de los números, y qué no se puede arreglar todavía porque falta el componente
   o el token.

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
