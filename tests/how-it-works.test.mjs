import assert from "node:assert/strict";
import test from "node:test";

import { publicPageContent } from "../public/goworkora/pages/public-pages.js";

const howItWorksMatch = () => ({
  pathname: "/how-it-works",
  path: "/how-it-works",
  params: {},
  search: "",
});

test("how it works presents a complete multi-service outsourcing model", async () => {
  const page = await publicPageContent(howItWorksMatch());

  assert.equal(page.title, "Outsourcing that runs like an operation.");
  assert.equal((page.body.match(/class="how-work-project"/g) || []).length, 8);

  for (const project of [
    "Customer Service &amp; Call Centre",
    "Administrative Support",
    "Billing &amp; Finance Operations",
    "Sales &amp; Revenue Support",
    "Healthcare Administration",
    "E-commerce Operations",
    "Data, Reporting &amp; Quality",
    "IT, Product &amp; Digital Support",
  ]) {
    assert.match(page.body, new RegExp(project));
  }
});

test("how it works includes engagement, lifecycle, visibility, quality, and continuity depth", async () => {
  const page = await publicPageContent(howItWorksMatch());

  assert.equal((page.body.match(/class="how-work-phase"/g) || []).length, 5);
  assert.match(page.body, /Direct marketplace hire/);
  assert.match(page.body, /Dedicated remote team/);
  assert.match(page.body, /Managed function/);
  assert.match(page.body, /Work visibility/);
  assert.match(page.body, /Quality observations/);
  assert.match(page.body, /Approved instructions/);
  assert.match(page.body, /Client acceptance/);
  assert.match(page.body, /Documented workflows/);
  assert.match(page.body, /Complete handover/);
});

test("how it works keeps financial, healthcare, and continuity claims scoped", async () => {
  const page = await publicPageContent(howItWorksMatch());

  assert.match(page.body, /under the client&#039;s approval controls/);
  assert.match(page.body, /carefully scoped non-clinical workflows/);
  assert.match(page.body, /Continuity measures apply only where they are part of the approved scope/);
  assert.doesNotMatch(page.body, /guaranteed|guarantee|same-day|\d+\s*(?:hours|days|weeks)/i);
  assert.doesNotMatch(page.body, /timeline commitments|fixed milestones|code review before every/i);
});

test("how it works routes every next step through existing GoWorkora workflows", async () => {
  const page = await publicPageContent(howItWorksMatch(), {
    supabase: {
      from(table) {
        throw new Error(`How It Works must not query ${table}`);
      },
    },
  });

  for (const path of [
    "/how-it-works/clients",
    "/managed-services",
    "/pricing",
    "/signup/client?returnTo=/app/jobs/new",
    "/contact?subject=managed-services",
  ]) {
    assert.match(page.body, new RegExp(`data-route="${path.replaceAll("?", "\\?")}"`));
  }
  assert.equal((page.body.match(/data-route="\/managed-services\?service=/g) || []).length, 8);
});
