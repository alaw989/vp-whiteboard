-- Keep-alive ping function to prevent Supabase free-tier auto-pause
CREATE OR REPLACE FUNCTION ping()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object('status', 'ok', 'timestamp', NOW());
$$;

GRANT EXECUTE ON FUNCTION ping TO anon, authenticated;