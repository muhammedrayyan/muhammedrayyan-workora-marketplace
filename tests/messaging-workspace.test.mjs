import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  attachmentPreviewKind,
  filterConversations,
  parseMessagingRoute,
  resolveMessagingRoute,
  searchLoadedMessages,
} from "../public/goworkora/features/messaging/workflow.js";

const conversations = [
  {
    conversation_id: "conversation-a",
    other_display_name: "Demo Client Owner",
    subject: "Accessibility review",
    last_message_body: "The milestone is ready.",
    conversation_type: "contract",
    unread_count: 2,
  },
  {
    conversation_id: "conversation-b",
    other_display_name: "Demo Hiring Manager",
    subject: "Frontend opportunity",
    last_message_body: "Thanks for the proposal.",
    conversation_type: "job",
    unread_count: 0,
  },
];

test("conversation filters combine inbox text, unread, and favorites safely", () => {
  assert.deepEqual(
    filterConversations(conversations, { query: "accessibility" }).map((item) => item.conversation_id),
    ["conversation-a"],
  );
  assert.deepEqual(
    filterConversations(conversations, { filter: "unread" }).map((item) => item.conversation_id),
    ["conversation-a"],
  );
  assert.deepEqual(
    filterConversations(conversations, {
      filter: "favorites",
      favoriteIds: new Set(["conversation-b"]),
    }).map((item) => item.conversation_id),
    ["conversation-b"],
  );
});

test("loaded message search is case-insensitive and requires a meaningful query", () => {
  const messages = [
    { message_id: "one", body: "The milestone is ready for review." },
    { message_id: "two", body: "Thank you for the update." },
  ];
  assert.deepEqual(searchLoadedMessages(messages, "MILESTONE").map((item) => item.message_id), ["one"]);
  assert.deepEqual(searchLoadedMessages(messages, "m"), []);
});

test("attachment previews are limited to browser-safe supported formats", () => {
  assert.equal(attachmentPreviewKind("image/png", "scan.png"), "image");
  assert.equal(attachmentPreviewKind("application/pdf", "brief.pdf"), "pdf");
  assert.equal(attachmentPreviewKind("text/plain", "notes.txt"), "text");
  assert.equal(attachmentPreviewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "brief.docx"), "unsupported");
  assert.equal(attachmentPreviewKind("", "fallback.webp"), "image");
});

test("canonical conversation routes survive renders without a legacy hash", () => {
  const conversation = parseMessagingRoute("#messages/cad957bb-09c4-42be-8499-132b38a9b508");
  assert.deepEqual(conversation, {
    view: "conversation",
    conversationId: "cad957bb-09c4-42be-8499-132b38a9b508",
  });
  assert.deepEqual(resolveMessagingRoute(conversation, ""), conversation);
  assert.deepEqual(resolveMessagingRoute(conversation, "#messages"), { view: "messages" });
});

test("message workspace exposes real filters, composer, context, and responsive states", async () => {
  const [experience, styles, freelancerShell] = await Promise.all([
    readFile(new URL("../public/goworkora/features/messaging/experience.js", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/styles/features/messaging.css", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/styles/freelancer-workspace-shell.css", import.meta.url), "utf8"),
  ]);
  for (const expected of [
    "Search conversations",
    "Unread",
    "Favorites",
    "Activity timeline",
    "Search messages",
    "Private to conversation members",
    "data-favorite",
    "send_conversation_message",
    "report_conversation_message",
    "data-preview",
    "Secure attachment preview",
    "Download file",
  ]) {
    assert.match(experience, new RegExp(expected));
  }
  assert.match(styles, /grid-template-columns:\s*minmax\(286px,\s*340px\).*minmax\(430px,\s*1fr\).*minmax\(300px,\s*356px\)/s);
  assert.match(experience, /message-app message-app-workspace/);
  assert.match(styles, /\.message-app-workspace\s*\{[^}]*display:\s*flex;[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  assert.match(styles, /\.message-workspace\s*\{[^}]*flex:\s*1 1 auto;[^}]*height:\s*auto;[^}]*min-height:\s*0;/s);
  assert.match(styles, /\.conversation-detail\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[^}]*min-height:\s*0;/s);
  assert.match(styles, /\.conversation-detail\.participant-disabled\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto;/s);
  assert.match(experience, /conversation-detail[^`]*participant-disabled/s);
  assert.match(freelancerShell, /\.message-app-workspace \.message-workspace\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;/s);
  assert.match(freelancerShell, /@media \(max-width: 900px\)[\s\S]*>\s*\.workora-messaging-root\s*\{[^}]*height:\s*calc\(100dvh - var\(--freelancer-nav-height\)\);[^}]*min-height:\s*0;/s);
  assert.doesNotMatch(freelancerShell, /\.message-workspace\s*\{\s*height:\s*calc\(100vh - var\(--freelancer-nav-height\)\);/s);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(experience, /anchor\.download\s*=\s*attachment\.name/);
  assert.match(experience, /captureMessageViewport/);
  assert.match(experience, /updateFavoritePresentation\(conversationId\)/);
  assert.doesNotMatch(experience, /window\.open\(data\.signedUrl/);
  assert.doesNotMatch(experience, /#wm-thread'\)\?\.scrollTo/);
  assert.match(styles, /\.message-attachment-preview\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s);
  assert.match(styles, /\.message-app-workspace\s*>\s*\.message-global-alert\s*\{[^}]*position:\s*absolute/s);
});

test("message preferences and search migration fail closed to active participants", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260730190000_message_workspace_preferences_search.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.conversation_preferences/);
  assert.match(migration, /alter table public\.conversation_preferences force row level security/);
  assert.match(migration, /public\.current_active_user\(\)/);
  assert.match(migration, /public\.can_access_conversation\(p_conversation_id\)/);
  assert.match(migration, /create or replace function public\.search_conversation_messages/);
  assert.match(migration, /revoke all on function public\.search_conversation_messages/);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\bdrop table\b/i);
});
