# Instrucciones para generar un lote

Lee también `SCHEMA.md` en esta misma carpeta.

## Salida

- Un único archivo JSON: `data/questions/general-5000/gen-XXX.json`.
- Exactamente **260 preguntas**.
- Array JSON válido, sin texto antes ni después.
- No modifiques ningún otro archivo.

## Distribución obligatoria

- 104 `easy`.
- 104 `medium`.
- 52 `hard`.
- `correctIndex` equilibrado: aproximadamente 65 por cada índice 0, 1, 2 y 3.
- `category`: `"general"`.
- `topic`: un identificador corto en minúsculas, por ejemplo `physics`, `astronomy`, `chemistry`.

## Calidad y contexto

- Pregunta autocontenida: debe entenderse sin opciones y sin contexto previo.
- Prohibido: “esta obra”, “este país”, “dicho autor”, “el mencionado”, etc.
- Si la pregunta depende de una obra, país, periodo, personaje o disciplina, indícalo en el mismo enunciado.
- El contexto no debe contener la respuesta correcta.
- Solo hechos estables y verificables.
- Sin datos de 2025–2026, récords cambiantes ni estadísticas oscuras.
- Español neutro.
- 4 opciones únicas y plausibles.
- Una sola respuesta correcta.
- Sin “todas las anteriores” ni “ninguna de las anteriores”.
- Explicación breve en todas.

## Evitar duplicados

- No repitas preguntas de `data/questions.json`.
- No repitas preguntas dentro del archivo.
- No reformules la misma pregunta con otras palabras.
- El validador comprueba duplicados contra el banco actual y dentro del archivo.

## Validación

Al terminar:

```bash
node scripts/validate-general-5000.mjs --file data/questions/general-5000/gen-XXX.json
```

Corrige hasta que el comando termine con `0 errores`. Revisa también las advertencias de contexto y de near-duplicates.

## Respuesta final

Devuelve solo:

- Archivo creado.
- Cantidad.
- Resultado del validador.
- 3 IDs de ejemplo.

No pegues las preguntas.
