import assert from "node:assert/strict";
import test from "node:test";

import { publicPageContent } from "../public/goworkora/pages/public-pages.js";

const pricingMatch = () => ({
  pathname: "/pricing",
  path: "/pricing",
  params: {},
  search: "",
});

test("pricing presents three distinct GoWorkora engagement models", async () => {
  const page = await publicPageContent(pricingMatch());

  assert.equal(page.title, "Choose how you want to work.");
  assert.equal((page.body.match(/class="pricing-model(?: is-featured)?" aria-labelledby=/g) || []).length, 3);
  assert.match(page.body, /Marketplace Hiring/);
  assert.match(page.body, /Managed Service/);
  assert.match(page.body, /Launch &amp; Stabilisation Sprint/);
  assert.match(page.body, /Most popular/);
  assert.match(page.body, /Best for/);
  assert.match(page.body, /How it works/);
  assert.match(page.body, /What's included/);
});

test("pricing removes all timeline content and unsupported fixed-price claims", async () => {
  const page = await publicPageContent(pricingMatch());

  assert.doesNotMatch(page.body, /timeline/i);
  assert.doesNotMatch(page.body, /\$\s*\d|£\s*\d|€\s*\d/);
  assert.match(page.body, /custom quote/i);
  assert.match(page.body, /shown before a commitment/i);
  assert.match(page.body, /Taxes and payment-provider processing can vary/);
});

test("pricing never queries or exposes raw platform configuration", async () => {
  const supabase = {
    from(table) {
      throw new Error(`Pricing must not query ${table}`);
    },
  };

  const page = await publicPageContent(pricingMatch(), { supabase });

  assert.doesNotMatch(page.body, /platform_settings|Configured platform setting|stripe_test_mode|minimum_milestone/i);
  assert.match(page.body, /No hidden configuration\. No invented price\./);
});

test("pricing offers working routes for every engagement path", async () => {
  const page = await publicPageContent(pricingMatch());

  for (const path of ["/signup/client", "/managed-services", "/contact?subject=sales"]) {
    assert.match(page.body, new RegExp(`data-route="${path.replace("?", "\\?")}"`));
  }
  assert.equal((page.body.match(/<details/g) || []).length, 5);
});
