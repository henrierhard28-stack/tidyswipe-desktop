-- 1. Add cooldown tracking column
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS last_device_change_at timestamptz;

-- 2. Backfill max_activations based on plan
UPDATE public.licenses
SET max_activations = 1
WHERE plan = 'monthly' AND max_activations <> 1;

UPDATE public.licenses
SET max_activations = 3
WHERE plan = 'yearly' AND max_activations <> 3;

-- 3. Revoke EXECUTE on SECURITY DEFINER functions from anon role
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_access(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- 4. Trigger to enforce one profile/role per user already exists via handle_new_user.
-- Ensure trigger is wired (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END$$;

-- 5. Server-side function to deactivate a device (called by edge function only)
CREATE OR REPLACE FUNCTION public.deactivate_license_device(
  _license_id uuid,
  _device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lic record;
  new_fps jsonb;
BEGIN
  SELECT id, activations, device_fingerprints
    INTO lic
    FROM public.licenses
   WHERE id = _license_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'license_not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO new_fps
    FROM jsonb_array_elements(lic.device_fingerprints) elem
   WHERE elem->>'id' <> _device_id;

  UPDATE public.licenses
     SET device_fingerprints = new_fps,
         activations = GREATEST(0, jsonb_array_length(new_fps)),
         updated_at = now()
   WHERE id = _license_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_license_device(uuid, text) FROM anon, authenticated;