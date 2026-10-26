# Instrucciones para un lote de datos curiosos

Lee `SCHEMA.md` en esta misma carpeta.

## Salida

- Un único archivo: `data/questions/fun-facts-1000/ff-XXX.json`.
- Exactamente **220 preguntas**.
- Array JSON válido, sin texto alrededor.
- No modifiques otros archivos.

## Distribución

- 88 `easy`.
- 88 `medium`.
- 44 `hard`.
- 55 respuestas con `correctIndex` 0, 55 con 1, 55 con 2 y 55 con 3.
- `category`: `"general"`.
- `topic`: `"fun_facts"`.

## Calidad

- Dato curioso claro, autocontenido y estable.
- Si mencionas un país, animal, obra, periodo o término, contextualízalo.
- No uses afirmaciones médicas ni consejos de salud.
- No uses datos que cambian con el tiempo.
- No repitas preguntas del banco actual ni reformules la misma idea.
- Evita preguntas demasiado obvias o de relleno.
- Varía la formulación: “¿Cuál…?”, “¿Qué…?”, “¿Cuántos…?”, “¿Dónde…?”, “¿Cómo…?”.
- Los distractores deben ser plausibles, no absurdos.
- Explicación breve en todas.

## Validación

```bash
node scripts/validate-fun-facts.mjs --file data/questions/fun-facts-1000/ff-XXX.json
```

Corrige hasta `0 errores`. Revisa las advertencias de contexto y near-duplicates.

## Respuesta final

Devuelve solo:

- Archivo creado.
- Cantidad.
- Resultado del validador.
- 3 IDs de ejemplo.

No pegues las preguntas.
