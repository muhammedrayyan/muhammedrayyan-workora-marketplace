# Demo analytics exclusion

## Policy

GoWorkora demo records are fictional and must never inflate genuine marketplace, revenue, conversion, reliability, review, or dispute metrics.

The demo-support migration introduces positive markers on the analytics roots:

- `profiles.is_demo`
- `companies.is_demo`
- `jobs.is_demo`

Dependent records are tied to those roots and registered in `demo_data_registry`.

## Implemented database exclusions

The additive migration replaces these reporting functions:

- `admin_overview_metrics()` excludes demo profiles and demo jobs, and excludes proposals/contracts/reports/disputes when their related job is demo.
- `admin_revenue_report()` excludes transactions connected to a demo job.
- Review aggregate recalculation excludes demo-job reviews from genuine users' public rating and completed-contract totals. Demo profiles may still show internally consistent demo-only aggregate ratings.

Demo financial fixtures:

- use the `manual` provider;
- use test-only provider references;
- record `livemode = false`;
- record `external_movement = false`;
- remain balanced in the immutable ledger;
- never call Stripe or a payout API.

## Query rule for future reports

Every new report must either:

1. join to `profiles`, `jobs`, or `companies` and require `is_demo = false`; or
2. place demo totals in a separately labelled Demo section.

For a dependent row without a direct marker, join through its authoritative parent. Do not infer demo status from display names.

Examples:

```sql
-- Genuine published jobs
select count(*)
from public.jobs
where status = 'published'
  and is_demo = false;

-- Genuine contract value, separated by currency
select c.currency, sum(c.total_value_minor)
from public.contracts c
join public.jobs j on j.id = c.job_id
where j.is_demo = false
group by c.currency;
```

## Verification checklist

- Compare admin totals before and after seeding; genuine totals remain unchanged.
- Confirm demo profiles/jobs remain discoverable only where explicitly intended.
- Confirm demo payments appear only in demo/admin inspection, not genuine GMV or platform revenue.
- Confirm demo reviews do not affect genuine profile aggregates.
- Confirm cleanup restores the original genuine-only totals.

This policy must be extended whenever a new analytics or materialized-report query is introduced.
