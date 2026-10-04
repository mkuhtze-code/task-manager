-- Persistent Collections: generic multi-item capture objects (grocery, snag, packing, etc.)
-- Additive only. Does not alter existing task/speech tables.

CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text NOT NULL,
  collection_type text NOT NULL DEFAULT 'generic',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'archived')),
  context_type text NULL,
  context_id uuid NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  CONSTRAINT collections_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS public.collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  normalized_content text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'removed')),
  position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NULL,
  client_op_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  deleted_at timestamptz NULL,
  CONSTRAINT collection_items_content_not_blank CHECK (length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS collections_user_id_idx ON public.collections (user_id);
CREATE INDEX IF NOT EXISTS collections_user_status_idx ON public.collections (user_id, status);
CREATE INDEX IF NOT EXISTS collections_user_normalized_title_idx ON public.collections (user_id, normalized_title);
CREATE INDEX IF NOT EXISTS collections_context_idx ON public.collections (user_id, context_type, context_id);
CREATE INDEX IF NOT EXISTS collections_user_active_idx ON public.collections (user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS collection_items_collection_id_idx ON public.collection_items (collection_id);
CREATE INDEX IF NOT EXISTS collection_items_user_id_idx ON public.collection_items (user_id);
CREATE INDEX IF NOT EXISTS collection_items_status_idx ON public.collection_items (collection_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS collection_items_client_op_unique ON public.collection_items (user_id, client_op_id) WHERE client_op_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS collections_one_active_per_user ON public.collections (user_id) WHERE is_active = true;

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own collections" ON public.collections;
CREATE POLICY "own collections" ON public.collections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own collection items" ON public.collection_items;
CREATE POLICY "own collection items" ON public.collection_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS collections_set_updated_at ON public.collections;
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS collection_items_set_updated_at ON public.collection_items;
CREATE TRIGGER collection_items_set_updated_at BEFORE UPDATE ON public.collection_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.collections IS 'Persistent multi-item capture objects (grocery, snag, packing, materials, questions). Generic — not grocery-specific.';
COMMENT ON TABLE public.collection_items IS 'Items within a collection. Mutations are item-level for sync safety.';
