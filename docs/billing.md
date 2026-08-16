# Jey Link Billing Setup

Jey Link supports Free, Pro, Business, Trial, and Internal billing states.

## Stripe prices

Create four recurring Stripe prices and add their IDs to the deployment environment:

- `STRIPE_PRICE_ID_PRO_MONTHLY` - Pro, $9.99 monthly
- `STRIPE_PRICE_ID_PRO_YEARLY` - Pro, $99 yearly
- `STRIPE_PRICE_ID_BUSINESS_MONTHLY` - Business, $29.99 monthly
- `STRIPE_PRICE_ID_BUSINESS_YEARLY` - Business, $299 yearly

`STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID` still work as fallbacks for Pro monthly.

## Required Stripe secrets

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Optional settings

- `STRIPE_ENABLE_PRO_TRIAL` - defaults to `true`; set to `false` to disable the 14-day Pro trial.
- `STRIPE_AUTOMATIC_TAX_ENABLED` - defaults to `true`; set to `false` if Stripe Tax is not enabled yet.
- `FREE_MONTHLY_APPOINTMENT_LIMIT` - defaults to `25`.

Checkout enables promotion codes. Business checkout also enables supported tax ID collection.
