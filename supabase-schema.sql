-- XD Messenger: схема для Supabase
-- Выполните в Supabase Dashboard → SQL Editor

-- Таблица сессий чата (ключ + аккаунт создателя)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  creator_account TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Таблица сообщений
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_sessions_key ON sessions(key);
CREATE INDEX IF NOT EXISTS idx_sessions_creator ON sessions(creator_account);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- Важно: в Dashboard → Database → Replication включите Realtime для таблицы messages

-- RLS (Row Level Security)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Разрешить всем чтение и запись (приложение проверяет доступ по ключу)
-- Для production можно ужесточить политики
CREATE POLICY "Allow all sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all messages" ON messages FOR ALL USING (true) WITH CHECK (true);
