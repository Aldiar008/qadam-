-- Prompt 3: public QR customer flow is served by server-only code.
-- The browser never receives the service role key; this grant only lets the server
-- resolve an opaque QR token hash into the public loyalty context.
grant select on public.qr_codes, public.businesses, public.loyalty_programs, public.rewards to service_role;
