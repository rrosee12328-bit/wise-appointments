# Jey Link Mobile Deployment

Jey Link uses one shared web app plus Capacitor native shells for iOS and Android.

## Billing Routing

- Web users buy and manage subscriptions through Stripe.
- iOS users buy through Apple in-app purchase unless their account already has Stripe billing.
- Android users buy through Google Play Billing unless their account already has Stripe billing.
- Stripe subscribers keep paid access in the mobile apps and open Stripe Customer Portal in the system browser.
- Apple and Google subscribers keep paid access on web and mobile, with Supabase app metadata as the shared source of access.

## Required Lovable Environment Variables

Set these client-safe RevenueCat SDK keys before publishing a mobile build:

- `VITE_REVENUECAT_IOS_API_KEY`
- `VITE_REVENUECAT_ANDROID_API_KEY`

Optional package overrides if RevenueCat package identifiers differ from the defaults:

- `VITE_REVENUECAT_PACKAGE_PRO_MONTHLY`
- `VITE_REVENUECAT_PACKAGE_PRO_YEARLY`
- `VITE_REVENUECAT_PACKAGE_BUSINESS_MONTHLY`
- `VITE_REVENUECAT_PACKAGE_BUSINESS_YEARLY`

Defaults expected by the app:

- `pro_monthly`
- `pro_yearly`
- `business_monthly`
- `business_yearly`

## RevenueCat Setup

Create real App Store and Google Play products, then attach them to:

- Entitlement `pro`
- Entitlement `business`

The RevenueCat webhook must stay pointed at:

```text
https://jeylink.vektiss.com/api/revenuecat/webhook
```

Use the same authorization header value saved in Lovable as `REVENUECAT_WEBHOOK_AUTH_HEADER`.

## Native Shell

The first Capacitor shell loads:

```text
https://jeylink.vektiss.com
```

That keeps TanStack Start server routes, OAuth callbacks, Supabase, Stripe web billing, and webhooks on the live Lovable deployment.

Common commands:

```bash
pnpm build
pnpm cap:sync
pnpm cap:open:ios
pnpm cap:open:android
```
