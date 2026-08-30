import assert from "node:assert/strict";
import test from "node:test";

import { publicPageContent } from "../public/goworkora/pages/public-pages.js";

const managedMatch = (search = "") => ({
  pathname: "/managed-services",
  path: "/managed-services",
  params: {},
  search,
});

const contactMatch = (search = "") => ({
  pathname: "/contact",
  path: "/contact",
  params: {},
  search,
});

test("managed services presents eight selectable operating functions", async () => {
  const page = await publicPageContent(managedMatch());

  assert.equal(page.title, "Your operation, staffed and managed.");
  assert.equal((page.body.match(/data-managed-service-tab=/g) || []).length, 8);
  assert.equal((page.body.match(/data-managed-service-panel=/g) || []).length, 8);
  assert.equal((page.body.match(/aria-selected="true"/g) || []).length, 1);
  assert.equal((page.body.match(/role="tabpanel"/g) || []).length, 8);

  for (const service of [
    "Managed Customer Experience",
    "Healthcare Operations Support",
    "Finance & Back-Office Operations",
    "Revenue Operations & CRM",
    "IT Helpdesk & Systems Support",
    "Data, Reporting & Quality Operations",
    "Product & Engineering Delivery Pods",
    "Executive & Business Operations",
  ]) {
    assert.match(page.body, new RegExp(service.replace(/[&]/g, "&amp;")));
  }
});

test("managed service deep links select the requested service and retain enquiry context", async () => {
  const page = await publicPageContent(managedMatch("?service=healthcare-operations"));

  assert.match(
    page.body,
    /data-managed-service-tab="healthcare-operations"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-managed-service-tab="healthcare-operations"/,
  );
  assert.match(
    page.body,
    /data-managed-service-panel="healthcare-operations">/,
  );
  assert.match(
    page.body,
    /subject=managed-services&amp;service=healthcare-operations/,
  );
});

test("engagement and service choices prefill the managed enquiry form", async () => {
  const serviceContact = await publicPageContent(contactMatch("?subject=managed-services&service=it-helpdesk"));
  const engagementContact = await publicPageContent(contactMatch("?subject=managed-services&engagement=dedicated-team"));
  const unknownContact = await publicPageContent(contactMatch("?subject=managed-services&service=%3Cscript%3E"));

  assert.match(serviceContact.body, /Managed services enquiry — IT Helpdesk &amp; Systems Support/);
  assert.match(serviceContact.body, /Managed service context/);
  assert.match(engagementContact.body, /Managed services enquiry — Dedicated team/);
  assert.match(unknownContact.body, /value="Managed services enquiry"/);
  assert.doesNotMatch(unknownContact.body, /&lt;script&gt;/);
});

test("managed service copy keeps commercial and compliance commitments scoped", async () => {
  const page = await publicPageContent(managedMatch());

  assert.match(page.body, /Commercial terms are quoted after scope/);
  assert.match(page.body, /must be verified and agreed in writing/);
  assert.match(page.body, /does not represent certification or legal compliance by default/);
  assert.doesNotMatch(page.body, /guaranteed|guarantee/i);
});
