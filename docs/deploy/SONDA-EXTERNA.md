# La sonda de cascada, corrida afuera de producción

**Esto lo usa `/deploy` dos veces: la PRE en el paso 0 y la POST en el paso 5.**
Quien despliega no corre nada a mano ni cambia de sesión: el procedimiento
dispara la sonda, espera y lee el veredicto.

## Qué hace

`scripts/sonda-externa.mjs` dispara `.github/workflows/sonda-cascada.yml` en
GitHub Actions y espera a que termine. El workflow corre la misma
`scripts/sonda-cascada.mjs` de siempre contra `https://operix.cloud`, con el
Chrome que trae el runner, y antes y después de medir comprueba que
`/api/version` sea el SHA que se le pidió.

El cliente sale con **0 solo si** el job terminó en `success`, el log dice que
producción servía el SHA esperado antes y después de medir, la sonda dio VERDE y
el workflow llegó a su última línea. Cualquier otra cosa sale con **1 y es
ROJO**: token que falta, GitHub que no contesta, una corrida que no termina en
15 minutos, un log ilegible. No hay "no se pudo comprobar".

En el VPS no se instala nada: el cliente es un solo archivo que usa `fetch` de
Node, y `/deploy` lo corre con `git show origin/main:scripts/sonda-externa.mjs`,
sin mover el árbol de producción.

## Lo que hay que hacer UNA vez: el token

Disparar un workflow pide un token de GitHub. Se crea una sola vez, con lo mínimo:

1. En GitHub: Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token.
2. **Repository access: Only select repositories → `erpmanual`.** Ningún otro.
3. **Permissions → Repository permissions → Actions: Read and write.** Nada más
   (Metadata: Read-only lo agrega GitHub solo).
4. Vencimiento: el que se quiera. Cuando venza, la sonda da ROJO diciendo que el
   token no sirve (401), y se repite este paso.

Y en la máquina que corre `/deploy`, como el usuario que la corre, sin que el
token pase por la pantalla ni por el historial del shell:

    mkdir -p ~/.config/erpazul && chmod 700 ~/.config/erpazul
    read -rs T && printf '%s' "$T" > ~/.config/erpazul/sonda-github-token && unset T
    chmod 600 ~/.config/erpazul/sonda-github-token

(`read -rs` espera que se pegue el token y no lo muestra; se termina con Enter.)

Si el archivo lo pueden leer otros usuarios, el cliente no lo usa y da ROJO
pidiendo `chmod 600`. **El token no se pega en ningún chat ni se escribe en el
repo**, y el cliente no lo imprime nunca.

Como alternativa, el token se puede pasar en la variable `SONDA_GITHUB_TOKEN`,
que gana sobre el archivo.

## Qué ve quien despliega

    sonda externa PRE — se espera <SHA> en producción
    disparada: sonda pre <SHA> sonda-pre-<id>
    corrida: https://github.com/islaemanuel25-glitch/erpmanual/actions/runs/<n>
    estado: queued
    estado: in_progress
    estado: completed

    sonda de cascada — https://operix.cloud/login
      1rem = 14px · <n> reglas en la hoja
      …
    VERDE · las utilidades de Tailwind le ganan a las clases del kit.

    VERDE · sonda externa PRE: producción sirve <SHA> antes y después de medir, y la cascada está bien
      https://github.com/…/actions/runs/<n>

Tarda alrededor de un minuto, más lo que haya de cola en Actions.

## Cuándo cambia algo de esto

- Si se toca el workflow o la sonda, el PR corre la **autoprueba**: el mismo
  workflow, sin SHA esperado, midiendo producción tal como esté. Un
  `workflow_dispatch` solo se puede disparar sobre `main`, así que ésa es la
  única forma de probarlo antes de juntarlo.
- El formato de las líneas que el cliente exige —`SONDA-EXTERNA …`— lo comparten
  el workflow y el cliente; `scripts/sonda-externa.test.mjs` se pone rojo si se
  separan.
