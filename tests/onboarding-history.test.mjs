import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateEducationEntry,
  validateLanguageEntry,
  validateWorkHistoryEntry,
} from "../public/goworkora/features/profile/experience.js";

const source = await readFile(
  new URL("../public/goworkora/features/profile/experience.js", import.meta.url),
  "utf8",
);

test("work-history validation supports completed and current roles", () => {
  assert.equal(validateWorkHistoryEntry({}), null);
  assert.equal(
    validateWorkHistoryEntry({
      companyName: "Northstar Labs",
      jobTitle: "Product Engineer",
      startDate: "2022-01-01",
      endDate: "2024-01-01",
      currentlyWorking: false,
    }),
    null,
  );
  assert.equal(
    validateWorkHistoryEntry({
      companyName: "Northstar Labs",
      jobTitle: "Product Engineer",
      startDate: "2024-01-01",
      endDate: "",
      currentlyWorking: true,
    }),
    null,
  );
  assert.match(
    validateWorkHistoryEntry({
      companyName: "Northstar Labs",
      jobTitle: "Product Engineer",
      startDate: "2024-01-01",
      endDate: "",
      currentlyWorking: false,
    }),
    /end date/i,
  );
  assert.match(
    validateWorkHistoryEntry({
      companyName: "Northstar Labs",
      jobTitle: "Product Engineer",
      startDate: "2024-01-01",
      endDate: "2023-12-31",
      currentlyWorking: false,
    }),
    /before its start date/i,
  );
});

test("education validation accepts optional years and rejects invalid ranges", () => {
  assert.equal(validateEducationEntry({}), null);
  assert.equal(
    validateEducationEntry({
      institution: "Example University",
      qualification: "Bachelor of Design",
      startYear: "2018",
      endYear: "2021",
    }),
    null,
  );
  assert.match(
    validateEducationEntry({
      institution: "Example University",
      qualification: "Bachelor of Design",
      startYear: "2022",
      endYear: "2020",
    }),
    /before its start year/i,
  );
  assert.match(
    validateEducationEntry({
      institution: "",
      qualification: "Bachelor of Design",
    }),
    /institution/i,
  );
});

test("language validation accepts complete entries and rejects partial or unsafe codes", () => {
  assert.equal(validateLanguageEntry({}), null);
  assert.equal(
    validateLanguageEntry({
      code: "en",
      name: "English",
      proficiency: "native",
    }),
    null,
  );
  assert.match(
    validateLanguageEntry({
      code: "english",
      name: "English",
      proficiency: "native",
    }),
    /two- or three-letter/i,
  );
  assert.match(
    validateLanguageEntry({
      code: "fr",
      name: "",
      proficiency: "professional",
    }),
    /language name/i,
  );
});

test("freelancer profile depth requires an explicit category and experience value", async () => {
  const { validateFreelancerStep } = await import("../public/goworkora/features/profile/onboarding.js");
  const valid = {
    primaryCategory: "Software Development",
    availableCategories: ["Software Development"],
    yearsExperience: "4.5",
    skillIds: ["one", "two", "three"],
  };

  assert.equal(validateFreelancerStep(2, valid), null);
  assert.match(validateFreelancerStep(2, { ...valid, yearsExperience: "" }), /experience/i);
  assert.match(validateFreelancerStep(2, { ...valid, primaryCategory: "Other" }), /available marketplace categories/i);
});

test("client onboarding validates professional, company and hiring-preference depth", async () => {
  const { validateClientStep } = await import("../public/goworkora/features/profile/onboarding.js");
  const valid = {
    displayName: "Alex Morgan",
    jobTitle: "Operations Director",
    department: "Operations",
    hiringRole: "Hiring manager",
    languageCode: "en",
    countryCode: "CA",
    timezone: "America/Toronto",
    independentClient: false,
    companyName: "Northstar Digital Labs",
    companySize: "11-50",
    industry: "Technology",
    companyCountryCode: "CA",
    companyDescription: "A fictional demonstration company building digital products.",
    hiringCategories: ["Development & IT"],
    typicalProjectSize: "5k-25k",
    preferredEngagementType: "fixed",
    billingCountry: "CA",
    preferredCurrency: "CAD",
    acceptedTerms: true,
    acceptedPrivacy: true,
  };

  for (const step of [1, 2, 3, 4, 5]) assert.equal(validateClientStep(step, valid), null, `step ${step}`);
  assert.match(validateClientStep(1, { ...valid, department: "" }), /department/i);
  assert.match(validateClientStep(2, { ...valid, companyDescription: "Too short" }), /description/i);
  assert.match(validateClientStep(3, { ...valid, hiringCategories: [] }), /category/i);
  assert.match(validateClientStep(3, { ...valid, typicalProjectSize: "" }), /project size/i);
});

test("client onboarding persists role-appropriate fields and safely replaces company logos", () => {
  assert.match(source, /client\.department/);
  assert.match(source, /client\.hiringRole/);
  assert.match(source, /client\.languageCode/);
  assert.match(source, /client\.companyDescription/);
  assert.match(source, /client\.typicalProjectSize/);
  assert.match(source, /client\.preferredEngagementType/);
  assert.match(source, /bucket:'company-logos'/);
  assert.match(source, /if\(logoUpdate\.error\)\{await supabase\.storage\.from\('company-logos'\)\.remove\(\[path\]\)/);
  assert.match(source, /if\(previous\)await supabase\.storage\.from\('company-logos'\)\.remove\(\[previous\]\)/);
});

test("onboarding loads and persists all owner-scoped history entries", () => {
  assert.match(source, /workHistory:\[blankWorkEntry\(\)\]/);
  assert.match(source, /educationHistory:\[blankEducationEntry\(\)\]/);
  assert.match(source, /languages:\[blankLanguageEntry\(\)\]/);
  assert.match(source, /data-add-collection="workHistory"/);
  assert.match(source, /data-add-collection="educationHistory"/);
  assert.match(source, /data-remove-collection="workHistory"/);
  assert.match(source, /data-remove-collection="educationHistory"/);
  assert.match(source, /data-add-collection="languages"/);
  assert.match(source, /data-remove-collection="languages"/);
  assert.doesNotMatch(
    source,
    /from\('work_experience'\)\.select\('\*'\)\.eq\('freelancer_user_id',user\.id\)\.order\('start_date',\{ascending:false\}\)\.limit\(1\)/,
  );
  assert.doesNotMatch(
    source,
    /from\('education'\)\.select\('\*'\)\.eq\('freelancer_user_id',user\.id\)\.order\('end_year',\{ascending:false\}\)\.limit\(1\)/,
  );
  assert.doesNotMatch(
    source,
    /from\('freelancer_languages'\)\.select\('\*'\)\.eq\('freelancer_user_id',user\.id\)\.order\('language_name'\)\.limit\(1\)/,
  );
  assert.match(
    source,
    /from\('work_experience'\)\.delete\(\)\.eq\('freelancer_user_id',state\.user\.id\)\.in\('id',state\.removedWorkIds\)/,
  );
  assert.match(
    source,
    /from\('education'\)\.delete\(\)\.eq\('freelancer_user_id',state\.user\.id\)\.in\('id',state\.removedEducationIds\)/,
  );
  assert.match(
    source,
    /from\('freelancer_languages'\)\.delete\(\)\.eq\('freelancer_user_id',state\.user\.id\)\.in\('language_code',state\.removedLanguageCodes\)/,
  );
});

test("freelancer profile depth remains owner-scoped and public-safe", async () => {
  const [migration, accountPages, routes] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260823120000_freelancer_profile_depth.sql", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/pages/account-pages.js", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/routing/site-routes.js", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /add column if not exists primary_category text/);
  assert.match(migration, /add column if not exists years_experience numeric\(4, 1\)/);
  assert.match(migration, /create or replace view public\.freelancer_public_profiles/);
  assert.match(migration, /profile\.account_status = 'active'/);
  assert.doesNotMatch(migration, /email|phone|auth\.users|payment_method/i);
  assert.match(source, /primary_category:state\.freelancer\.primaryCategory/);
  assert.match(source, /years_experience:Number\(state\.freelancer\.yearsExperience\)/);
  assert.match(accountPages, /\.eq\("id", user\.id\)/);
  assert.match(accountPages, /Save privacy settings/);
  assert.match(routes, /"\/app\/settings\/privacy"/);
});
