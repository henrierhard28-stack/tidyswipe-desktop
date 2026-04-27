-- Notifications créées par les admins, visibles par tous les users connectés
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Tous les utilisateurs authentifiés peuvent lire les notifications
CREATE POLICY "Anyone authenticated can view notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (true);

-- Seuls les admins peuvent créer
CREATE POLICY "Admins can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seuls les admins peuvent supprimer
CREATE POLICY "Admins can delete notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Suivi des lectures par utilisateur
CREATE TABLE public.notification_reads (
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reads"
  ON public.notification_reads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark notifications as read"
  ON public.notification_reads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);