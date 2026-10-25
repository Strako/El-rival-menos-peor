# Esquema del banco de preguntas

Cada pregunta es un objeto JSON:

```json
{
  "id": "cg-0001",
  "category": "general",
  "difficulty": "easy",
  "question": "¿Cuál es la capital de Australia?",
  "options": ["Sídney", "Melbourne", "Canberra", "Perth"],
  "correctIndex": 2,
  "explanation": "Canberra es la capital de Australia desde 1913."
}
```

## Reglas obligatorias

- `id`: único. Prefijos: `cg-` (cultura general), `vg-` (videojuegos), `s90-` (series de los 90).
- `category`: `general`, `videogames` o `series_90s`.
- `difficulty`: `easy`, `medium` o `hard`.
- `question`: texto en español, claro y sin ambigüedad.
- `options`: exactamente 4 opciones únicas.
- `correctIndex`: entero de 0 a 3.
- `explanation`: una frase breve que confirme la respuesta correcta.
- No usar "todas las anteriores" ni "ninguna de las anteriores".
- No usar HTML.
- Una sola respuesta debe ser correcta e indiscutible.

## Distribución por tanda de 175 preguntas

- 70 `easy`
- 70 `medium`
- 35 `hard`
- Posición de la respuesta correcta: aproximadamente 44/44/44/43 entre los índices 0, 1, 2 y 3.

## Validación

Desde la raíz del proyecto:

```bash
node scripts/validate-questions.mjs data/questions/parts/ARCHIVO.json
```

El comando debe terminar con `0 errores`.
