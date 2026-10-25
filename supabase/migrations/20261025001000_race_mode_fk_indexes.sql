-- Índices de apoyo para las claves foráneas del modo Relámpago.
-- Se aplicaron por separado tras revisar el asesor de rendimiento.

create index if not exists game_race_questions_question_idx
  on public.game_race_questions (question_id);
create index if not exists game_race_questions_answered_by_idx
  on public.game_race_questions (answered_by);

notify pgrst, 'reload schema';
