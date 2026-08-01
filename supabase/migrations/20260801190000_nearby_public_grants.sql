begin;

-- The "Акции рядом" storefront is anonymous, so it is rendered server-side with
-- the service client and the publication rules are applied explicitly in
-- `listPublicOffers`. That client needs read access to exactly three tables and
-- nothing more; no write grant is added, and none of this reaches the browser.
grant select on public.nearby_offers, public.business_locations, public.tracking_codes to service_role;
grant select, insert on public.nearby_offer_events to service_role;

comment on table public.nearby_offer_events is
 'Intent only: a view, click or save is never counted as a visit. A visit requires a verified QR scan or redemption.';

commit;
