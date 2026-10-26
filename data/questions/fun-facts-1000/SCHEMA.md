# Banco de datos curiosos (1.000 preguntas)

Directorio: `data/questions/fun-facts-1000/`

- 5 archivos: `ff-001.json` … `ff-005.json`.
- 220 candidatas por archivo.
- Total: 1.100 candidatas.
- Se seleccionan 1.000 finales.
- Categoría: `general`.
- Topic: `fun_facts`.
- IDs de trabajo: `cg-6001` … `cg-7100`.
- IDs finales: `cg-6001` … `cg-7000`.

## Esquema

```json
{
  "id": "cg-6001",
  "category": "general",
  "topic": "fun_facts",
  "difficulty": "easy",
  "question": "¿Cuántos huesos tiene normalmente el esqueleto de un adulto humano?",
  "options": ["186", "206", "226", "246"],
  "correctIndex": 1,
  "explanation": "Un adulto humano tiene habitualmente 206 huesos."
}
```

## Reglas

- Exactamente 4 opciones únicas y plausibles.
- Una respuesta correcta.
- Español neutro.
- Sin HTML.
- Sin “todas las anteriores” ni “ninguna de las anteriores”.
- Sin preguntas duplicadas.
- Solo datos estables y verificables.
- Nada de cifras de población, récords deportivos o datos de 2025–2026.
- Si el dato puede cambiar, no se usa.
- El contexto debe estar dentro de la pregunta.
- No usar “este/esta/dicho/mencionado”.
- No revelar la respuesta en el enunciado.

## Dificultad por archivo

- 88 `easy`
- 88 `medium`
- 44 `hard`
- `correctIndex` equilibrado: 55 por cada índice.

## Temas

- `ff-001`: cuerpo humano y salud.
- `ff-002`: animales, plantas y naturaleza.
- `ff-003`: Tierra, océanos, clima y espacio.
- `ff-004`: ciencia, inventos, matemáticas y tecnología.
- `ff-005`: mundo, historia, comida, objetos y vida cotidiana.

## Validación

```bash
node scripts/validate-fun-facts.mjs --file data/questions/fun-facts-1000/ff-001.json
```

Debe terminar con `0 errores`.
