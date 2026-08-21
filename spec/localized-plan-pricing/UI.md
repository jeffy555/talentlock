# TalentLock — UI Specification: Localized Plan Pricing

## Surface

Primary: `/pricing`  
Secondary: any upgrade banner that shows a monthly plan amount.

## Layout (Pricing)

Keep existing card grid. Add a compact **currency control** above the grid (not in the hero):

```
Prices in:  [ USD $ ]  [ EUR € ]  [ INR ₹ ]
```

- Segmented control or three equal toggle buttons
- Active state uses existing gold/navy tokens — no purple
- Mobile: full-width segmented control

## Price typography

| Currency | Example Starter |
|----------|-----------------|
| USD | `$49` + `/mo` |
| EUR | `€49` + `/mo` |
| INR | `₹4,099` + `/mo` |

- Use tabular/lining figures where the design system already does
- Free plans: `Free` or `$0` / `€0` / `₹0` consistently — prefer word **Free** when `priceMonthly === 0`
- Enterprise: **Custom** (no currency amount)

## Footnote

Below the grid, muted text:

> Prices shown in {USD|EUR|INR}. Your account location sets the default. Engagement rates (freelancer day/hour rates) use each talent’s own currency and are separate from subscription pricing.

## Switcher behaviour

| User | Default | Override |
|------|---------|----------|
| Logged out | USD | sessionStorage |
| Logged in INR | INR | sessionStorage until tab closes |
| Logged in EUR | EUR | sessionStorage |
| Logged in USD/GBP/… | USD | sessionStorage |

## Empty / loading / error

- Loading: existing skeleton/spinner on cards
- Error fetching plans: inline error + Retry — do not redirect to `/pricing` from itself
- While `PREMIUM_FEATURES_FREE`: Growth/Pro show **Start Free** in all currencies

## Accessibility

- Currency control is a `role="radiogroup"` with labelled options
- Price text includes visually hidden currency code for screen readers: `49 US dollars per month`
