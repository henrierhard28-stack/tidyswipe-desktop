UPDATE auth.users
SET encrypted_password = crypt('Fantomas288-', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE lower(email) = 'henri.erhard28@gmail.com';