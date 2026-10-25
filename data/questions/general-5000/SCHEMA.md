# Banco ampliado de Cultura General

Directorio: `data/questions/general-5000/`

- 20 archivos: `gen-001.json` … `gen-020.json`.
- 260 preguntas por archivo.
- Total: 5.200 candidatas; se seleccionan al menos 5.000.
- Categoría: `general`.
- IDs de trabajo: `cg-1001` … `cg-6200`.

## Esquema

```json
{
  "id": "cg-1001",
  "category": "general",
  "topic": "science_physics",
  "difficulty": "easy",
  "question": "¿Qué físico alemán formuló la teoría de la relatividad general en 1915?",
  "options": ["Isaac Newton", "Albert Einstein", "Niels Bohr", "Max Planck"],
  "correctIndex": 1,
  "explanation": "Albert Einstein publicó la teoría de la relatividad general en 1915."
}
```

## Reglas obligatorias

- Exactamente 4 opciones únicas y plausibles.
- Una sola respuesta correcta.
- `correctIndex` entre 0 y 3.
- Español neutro.
- Sin HTML.
- Sin “todas las anteriores” ni “ninguna de las anteriores”.
- Sin preguntas duplicadas dentro del archivo ni contra el banco actual.

## Contexto obligatorio

Cada pregunta debe entenderse sin ver las opciones y sin conversación previa.

- No uses “esta obra”, “este país”, “dicho autor”, “el mencionado”, etc.
- Si mencionas una obra, persona, lugar, periodo o término que pueda ser ambiguo, añade el contexto en la misma pregunta: autor, país, época, disciplina, título.
- El contexto no debe revelar la respuesta.
- Ejemplo correcto: “¿Qué pintor neerlandés creó *La noche estrellada* en 1889?”
- Ejemplo incorrecto: “¿Quién pintó esta obra?”

## Dificultad por archivo

- 104 `easy`
- 104 `medium`
- 52 `hard`
- `correctIndex` equilibrado: aproximadamente 65/65/65/65.

## Validación

```bash
node scripts/validate-general-5000.mjs --file data/questions/general-5000/gen-001.json
```

Debe terminar con `0 errores`.
