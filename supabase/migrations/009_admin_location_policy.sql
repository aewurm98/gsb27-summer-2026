-- Admins can manage all locations (for pre-seeding profiles with multi-stop itineraries)
CREATE POLICY "Admins can manage all locations"
  ON public.locations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true));
