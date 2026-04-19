DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'platform_desktop_model_profiles'
    ) THEN
        ALTER TABLE platform_desktop_model_profiles
            ADD COLUMN IF NOT EXISTS api_key VARCHAR(512) NOT NULL DEFAULT '';
    END IF;
END $$;
