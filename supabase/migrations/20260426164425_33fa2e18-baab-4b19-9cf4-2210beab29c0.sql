ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS device_fingerprints jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_licenses_key_active
  ON public.licenses (license_key)
  WHERE status = 'active';