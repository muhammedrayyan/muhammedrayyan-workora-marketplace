import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateEducationEntry,
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

test("onboarding loads and persists all owner-scoped history entries", () => {
  assert.match(source, /workHistory:\[blankWorkEntry\(\)\]/);
  assert.match(source, /educationHistory:\[blankEducationEntry\(\)\]/);
  assert.match(source, /data-add-collection="workHistory"/);
  assert.match(source, /data-add-collection="educationHistory"/);
  assert.match(source, /data-remove-collection="workHistory"/);
  assert.match(source, /data-remove-collection="educationHistory"/);
  assert.doesNotMatch(
    source,
    /from\('work_experience'\)\.select\('\*'\)\.eq\('freelancer_user_id',user\.id\)\.order\('start_date',\{ascending:false\}\)\.limit\(1\)/,
  );
  assert.doesNotMatch(
    source,
    /from\('education'\)\.select\('\*'\)\.eq\('freelancer_user_id',user\.id\)\.order\('end_year',\{ascending:false\}\)\.limit\(1\)/,
  );
  assert.match(
    source,
    /from\('work_experience'\)\.delete\(\)\.eq\('freelancer_user_id',state\.user\.id\)\.in\('id',state\.removedWorkIds\)/,
  );
  assert.match(
    source,
    /from\('education'\)\.delete\(\)\.eq\('freelancer_user_id',state\.user\.id\)\.in\('id',state\.removedEducationIds\)/,
  );
});
