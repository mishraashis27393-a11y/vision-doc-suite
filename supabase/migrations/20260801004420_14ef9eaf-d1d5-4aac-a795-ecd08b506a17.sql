ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS library_pin_hash text,
  ADD COLUMN IF NOT EXISTS library_pin_updated_at timestamp with time zone;