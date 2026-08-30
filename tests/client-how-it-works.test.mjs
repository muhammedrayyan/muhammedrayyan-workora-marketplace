import assert from "node:assert/strict";
import test from "node:test";

import { publicPageContent } from "../public/goworkora/pages/public-pages.js";

const clientMatch = () => ({
  pathname: "/how-it-works/clients",
  path: "/how-it-works/clients",
  params: {},
  search: "",
});
function fakeSupabase(fixtures = {}, failures = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = {
        select(columns, options) {
          calls.push({ table, method: "select", columns, options });
          return query;
        },
        eq(column, value) {
          calls.push({ table, method: "eq", column, value });
          return query;
        },
        not(column, operator, value) {
          calls.push({ table, method: "not", column, operator, value });
          return query;
        },
        order(column, options) {
          calls.push({ table, method: "order", column, options });
          return query;
        },
        limit(value) {
          calls.push({ table, method: "limit", value });
          return query;
        },
        then(resolve, reject) {
          const data = fixtures[table] || [];
          return Promise.resolve({
            data: failures[table] ? null : data,
            count: failures[table] ? null : data.length,
            error: failures[table] ? new Error(`${table} unavailable`) : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("client journey renders current non-demo public marketplace data", async () => {
  const supabase = fakeSupabase({
    jobs: [
      {
        id: "job-live",
        title: "Operations Dashboard Accessibility Review",
        slug: "operations-dashboard-accessibility-review",
        category: "Software Development",
        experience_level: "intermediate",
        engagement_type: "hourly",
        hourly_min_minor: 2500,
        hourly_max_minor: 4000,
        currency: "USD",
        location_type: "remote",
        published_at: "2026-08-29T10:00:00Z",
        is_demo: false,
      },
      {
        id: "job-demo",
        title: "Demo Opportunity — Customer Support",
        slug: "demo-opportunity-customer-support",
        category: "Customer Support",
        is_demo: false,
      },
    ],
    companies: [
      { id: "company-live", name: "Atlas Health Operations", industry: "Healthcare", company_size: "11-50", country_code: "AU", verification_status: "verified", is_demo: false },
      { id: "company-demo", name: "Demo Company", verification_status: "verified", is_demo: true },
    ],
    freelancer_public_profiles: [
      { user_id: "talent-1", primary_category: "Healthcare", availability_status: "available", is_demo: false },
      { user_id: "talent-2", primary_category: "Healthcare", availability_status: "limited", is_demo: false },
      { user_id: "talent-3", primary_category: "Admin & Support", availability_status: "available", is_demo: false },
      { user_id: "talent-demo", primary_category: "Software Development", availability_status: "available", is_demo: true },
    ],
  });

  const page = await publicPageContent(clientMatch(), { supabase });

  assert.equal(page.title, "Build the brief. Choose the right fit. Keep delivery accountable.");
  assert.match(page.body, /Live public marketplace/);
  assert.match(page.body, /<strong>3<\/strong><span>Public professionals<\/span>/);
  assert.match(page.body, /<strong>2<\/strong><span>Talent categories<\/span>/);
  assert.match(page.body, /<strong>1<\/strong><span>Live client briefs<\/span>/);
  assert.match(page.body, /<strong>1<\/strong><span>Verified organisations<\/span>/);
  assert.match(page.body, /Operations Dashboard Accessibility Review/);
  assert.match(page.body, /Atlas Health Operations/);
  assert.match(page.body, /Healthcare/);
  assert.match(page.body, /Admin &amp; Support/);
  assert.doesNotMatch(page.body, /Demo Opportunity|Demo Company|Software Development<\/strong><small>1 public profile/);
});

test("client journey queries only public-safe marketplace fields and excludes demo records", async () => {
  const supabase = fakeSupabase();
  await publicPageContent(clientMatch(), { supabase });

  for (const table of ["jobs", "companies", "freelancer_public_profiles"]) {
    assert.ok(supabase.calls.some((call) => call.table === table && call.method === "eq" && call.column === "is_demo" && call.value === false));
  }
  assert.ok(supabase.calls.some((call) => call.table === "jobs" && call.method === "not" && call.column === "title" && call.operator === "ilike" && call.value === "Demo Opportunity%"));

  const talentSelect = supabase.calls.find((call) => call.table === "freelancer_public_profiles" && call.method === "select");
  assert.equal(talentSelect.columns, "user_id,primary_category,availability_status,is_demo");
  assert.doesNotMatch(talentSelect.columns, /email|display_name|bio|avatar|rate/);
});

test("client journey keeps database failures honest and presentation-safe", async () => {
  const supabase = fakeSupabase({}, {
    jobs: true,
    companies: true,
    freelancer_public_profiles: true,
  });

  const page = await publicPageContent(clientMatch(), { supabase });

  assert.match(page.body, /Live data unavailable/);
  assert.match(page.body, /Published opportunities could not be loaded/);
  assert.match(page.body, /Public talent signals could not be loaded/);
  assert.match(page.body, /Directory unavailable/);
  assert.doesNotMatch(page.body, />0<\/strong><span>(Public professionals|Talent categories|Live client briefs|Verified organisations)/);
});
