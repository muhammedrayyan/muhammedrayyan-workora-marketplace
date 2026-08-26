import { createHash, randomBytes } from "node:crypto";

export const DEMO_PREFIX = "goworkora-demo";
export const DEMO_NOTICE = "Demonstration opportunity — not a genuine paid job.";
export const ALLOWED_ENVIRONMENTS = new Set(["local", "development", "test"]);

export function uuidFor(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export function keyFor(environment, type, slug) {
  return `${DEMO_PREFIX}:${environment}:${type}:${slug}`;
}

export function strongPassword() {
  return `${randomBytes(18).toString("base64url")}!aA7`;
}

export const ACCOUNT_SPECS = [
  ["client-owner", "Demo Client Owner", "client", "active", true, "client"],
  ["client-member", "Demo Client Team Member", "client", "active", true, "client"],
  ["freelancer-primary", "Demo Freelancer Professional", "freelancer", "active", true, "freelancer"],
  ["freelancer-secondary", "Demo Freelancer Secondary", "freelancer", "active", true, "freelancer"],
  ["freelancer-frontend", "Demo Frontend Specialist", "freelancer", "active", true, "freelancer"],
  ["freelancer-designer", "Demo Product Designer", "freelancer", "active", true, "freelancer"],
  ["freelancer-qa", "Demo Quality Engineer", "freelancer", "active", true, "freelancer"],
  ["freelancer-assistant", "Demo Operations Assistant", "freelancer", "active", true, "freelancer"],
  ["freelancer-support", "Demo Support Specialist", "freelancer", "active", true, "freelancer"],
  ["freelancer-health", "Demo Healthcare Administrator", "freelancer", "active", true, "freelancer"],
  ["admin", "Demo Platform Administrator", "admin", "active", true, "admin"],
  ["suspended", "Demo Suspended User", "freelancer", "suspended", true, "restricted"],
  ["incomplete", "Demo Incomplete Onboarding User", "freelancer", "pending", false, "onboarding"],
].map(([slug, name, role, status, complete, dashboard]) => ({
  slug, name, role, status, complete, dashboard,
}));

export const SKILL_SPECS = [
  ["javascript", "JavaScript", "Software Development"],
  ["typescript", "TypeScript", "Software Development"],
  ["react", "React", "Software Development"],
  ["node-js", "Node.js", "Software Development"],
  ["postgresql", "PostgreSQL", "Data and Analytics"],
  ["accessibility", "Accessibility", "Design and Creative"],
  ["figma", "Figma", "Design and Creative"],
  ["user-research", "User Research", "Design and Creative"],
  ["playwright", "Playwright", "Quality Assurance"],
  ["manual-testing", "Manual Testing", "Quality Assurance"],
  ["test-automation", "Test Automation", "Quality Assurance"],
  ["executive-assistance", "Executive Assistance", "Virtual Assistance"],
  ["calendar-management", "Calendar Management", "Virtual Assistance"],
  ["data-entry", "Data Entry", "Virtual Assistance"],
  ["customer-support", "Customer Support", "Customer Support"],
  ["zendesk", "Zendesk", "Customer Support"],
  ["shopify", "Shopify", "Customer Support"],
  ["patient-scheduling", "Patient Scheduling", "Healthcare Administration"],
  ["insurance-verification", "Insurance Verification", "Healthcare Administration"],
  ["medical-administration", "Medical Administration", "Healthcare Administration"],
  ["microsoft-365", "Microsoft 365", "IT Support"],
  ["help-desk", "Help Desk", "IT Support"],
  ["network-troubleshooting", "Network Troubleshooting", "IT Support"],
  ["project-management", "Project Management", "Project Management"],
  ["reporting", "Reporting", "Data and Analytics"],
  ["sql", "SQL", "Data and Analytics"],
  ["content-marketing", "Content Marketing", "Sales and Marketing"],
  ["react-native", "React Native", "Software Development"],
  ["api-design", "API Design", "Software Development"],
  ["ui-design", "UI Design", "Design and Creative"],
  ["seo", "SEO", "Sales and Marketing"],
  ["content-strategy", "Content Strategy", "Sales and Marketing"],
];

const PROFILE_SPECS = [
  ["freelancer-primary", "full-stack-developer", "Full-Stack Developer", ["javascript", "typescript", "react", "node-js", "postgresql"], 9500],
  ["freelancer-secondary", "it-support-specialist", "IT Support Specialist", ["microsoft-365", "help-desk", "network-troubleshooting"], 6500],
  ["freelancer-frontend", "frontend-accessibility-developer", "Frontend Developer", ["javascript", "typescript", "react", "accessibility"], 8500],
  ["freelancer-designer", "product-ui-ux-designer", "UI/UX Designer", ["figma", "user-research", "accessibility"], 7800],
  ["freelancer-qa", "qa-automation-engineer", "QA Engineer", ["playwright", "manual-testing", "test-automation"], 7200],
  ["freelancer-assistant", "executive-virtual-assistant", "Virtual Assistant", ["executive-assistance", "calendar-management", "data-entry"], 4200],
  ["freelancer-support", "ecommerce-support-specialist", "Customer Support Specialist", ["customer-support", "zendesk", "shopify"], 4600],
  ["freelancer-health", "healthcare-administration-specialist", "Healthcare Administrator", ["patient-scheduling", "insurance-verification", "medical-administration"], 5200],
];

const JOB_SPECS = [
  ["saas-dashboard", "Full-Stack Developer for SaaS Dashboard", "Software Development", "published", "public", "fixed", 500000, 800000],
  ["react-accessibility", "React Frontend Accessibility Improvements", "Software Development", "published", "public", "hourly", 7000, 9500],
  ["onboarding-designer", "Product Designer for Freelancer Onboarding", "Design and Creative", "published", "public", "fixed", 250000, 400000],
  ["regression-automation", "QA Engineer for Regression Automation", "Quality Assurance", "paused", "public", "hourly", 5500, 7500],
  ["executive-operations", "Virtual Assistant for Executive Operations", "Virtual Assistance", "draft", "private", "managed", 150000, 250000],
  ["ecommerce-support", "Customer Support Specialist for E-commerce", "Customer Support", "published", "public", "hourly", 3500, 5000],
  ["healthcare-scheduling", "Healthcare Scheduling Coordinator", "Healthcare Administration", "published", "invite_only", "managed", 180000, 260000],
  ["insurance-verification", "Insurance Verification Assistant", "Healthcare Administration", "closed", "private", "hourly", 3500, 4800],
  ["microsoft-support", "Microsoft 365 Support Specialist", "IT Support", "filled", "public", "hourly", 5000, 7000],
  ["security-review", "Marketplace Security Review", "Quality Assurance", "cancelled", "private", "fixed", 300000, 450000],
  ["landing-page", "Landing Page Design Project", "Design and Creative", "published", "public", "fixed", 120000, 200000],
  ["managed-operations", "Managed Remote Operations Assistant", "Virtual Assistance", "published", "public", "managed", 220000, 300000],
  ["mobile-qa", "Mobile Application QA Specialist", "Quality Assurance", "published", "public", "hourly", 5000, 7200],
  ["customer-onboarding", "Customer Onboarding Coordinator", "Customer Support", "published", "public", "managed", 180000, 280000],
  ["data-reporting", "Data Reporting Specialist", "Data and Analytics", "closed", "public", "fixed", 180000, 300000],
  ["mobile-developer", "Mobile Developer for Customer Portal", "Software Development", "published", "public", "hourly", 6500, 9000],
  ["api-developer", "API Developer for Marketplace Integrations", "Software Development", "published", "public", "fixed", 280000, 460000],
  ["ui-designer", "UI Designer for Operations Workspace", "Design and Creative", "published", "public", "hourly", 5500, 7800],
  ["manual-tester", "Manual Tester for Multi-Device Release", "Quality Assurance", "published", "public", "hourly", 4200, 6000],
  ["seo-specialist", "SEO Specialist for Commerce Growth", "Sales and Marketing", "published", "public", "managed", 180000, 260000],
];

export function buildDemoManifest(environment, accountIds) {
  const id = (type, slug) => uuidFor(keyFor(environment, type, slug));
  const user = (slug) => accountIds[slug];
  const now = Date.now();
  const iso = (days = 0) => new Date(now + days * 86400000).toISOString();
  const companies = [
    ["northstar-digital-labs", "Northstar Digital Labs", "Technology", "11-50", "Fictional demonstration company for software, product design and quality workflows."],
    ["harbor-health-operations", "Harbor Health Operations", "Healthcare Administration", "51-200", "Fictional demonstration company, not a healthcare provider."],
    ["brightcart-commerce", "BrightCart Commerce", "E-commerce", "11-50", "Fictional demonstration company for commerce support and operations."],
  ].map(([slug, name, industry, size, description]) => ({
    id: id("company", slug), owner_user_id: user("client-owner"), name, slug: `demo-${slug}`,
    industry, company_size: size, description, country_code: "AU", verification_status: "unverified",
    is_demo: true, demo_key: keyFor(environment, "company", slug), demo_environment: environment,
  }));
  const company = Object.fromEntries(companies.map((item) => [item.demo_key.split(":").at(-1), item.id]));
  const skillCategory = Object.fromEntries(SKILL_SPECS.map(([slug, , category]) => [slug, category]));

  const freelancerProfiles = PROFILE_SPECS.map(([account, slug, title, skills, rate], index) => ({
    account, skills,
    row: {
      user_id: user(account), professional_title: title,
      bio: `Fictional demonstration profile for a ${title.toLowerCase()}. This profile exists only to validate GoWorkora workflows and privacy controls.`,
      hourly_rate_minor: rate, currency: "AUD", experience_level: index < 2 ? "expert" : "intermediate",
      primary_category: skillCategory[skills[0]], years_experience: 5,
      availability_status: index === 7 ? "limited" : "available", weekly_capacity_hours: 30,
      minimum_project_minor: 50000, country_code: "AU", timezone: "Australia/Perth",
      profile_slug: `demo-${slug}`, verification_status: "unverified",
    },
  }));
  const roleFreelancerProfiles = [
    {
      user_id: user("suspended"), professional_title: "Restricted Demo Specialist",
      bio: "Fictional suspended profile for restriction testing.", hourly_rate_minor: 5000, currency: "AUD",
      experience_level: "intermediate", availability_status: "unavailable",
      primary_category: "IT Support", years_experience: 5,
      weekly_capacity_hours: 0, minimum_project_minor: 50000, country_code: "AU",
      timezone: "Australia/Perth", profile_slug: "demo-suspended-specialist",
      verification_status: "unverified",
    },
    {
      user_id: user("incomplete"), professional_title: "", bio: "", hourly_rate_minor: null, currency: "AUD",
      experience_level: "entry", availability_status: "available",
      weekly_capacity_hours: null, minimum_project_minor: null, country_code: "AU",
      timezone: "Australia/Perth", profile_slug: "demo-incomplete-onboarding",
      verification_status: "unverified",
    },
  ];
  const skills = SKILL_SPECS.map(([slug, name, category]) => ({
    id: id("skill", slug), slug: `demo-${slug}`, name: `Demo ${name}`, category, is_active: true,
  }));
  const skillId = Object.fromEntries(SKILL_SPECS.map(([slug]) => [slug, id("skill", slug)]));
  const jobs = JOB_SPECS.map(([slug, title, category, status, visibility, type, min, max], index) => ({
    id: id("job", slug), client_user_id: user("client-owner"),
    company_id: category === "Healthcare Administration"
      ? company["harbor-health-operations"]
      : ["Customer Support", "Virtual Assistance", "Sales and Marketing"].includes(category)
        ? company["brightcart-commerce"]
        : company["northstar-digital-labs"],
    title, slug: `demo-${slug}`,
    description: `${DEMO_NOTICE}\n\nThis fictional brief contains enough detail to demonstrate search, proposal, contract and moderation workflows without representing real paid work.`,
    category, experience_level: index % 3 === 0 ? "expert" : "intermediate", engagement_type: type,
    budget_min_minor: type === "hourly" ? null : min, budget_max_minor: type === "hourly" ? null : max,
    hourly_min_minor: type === "hourly" ? min : null, hourly_max_minor: type === "hourly" ? max : null,
    currency: "AUD", estimated_duration: "1–3 months", weekly_hours: 20, location_type: "remote",
    allowed_countries: ["AU", "NZ"], visibility, status,
    published_at: status === "published" || status === "paused" || status === "closed" || status === "filled" ? iso(-14 + index) : null,
    application_deadline: slug === "insurance-verification" ? iso(-2) : iso(30 + index),
    screening_questions: [{ id: "demo-experience", prompt: "Describe relevant fictional demo experience." }],
    moderation_status: "visible", is_demo: true, demo_key: keyFor(environment, "job", slug), demo_environment: environment,
  }));
  const job = Object.fromEntries(JOB_SPECS.map(([slug]) => [slug, id("job", slug)]));
  const proposalSpecs = [
    ["draft", "saas-dashboard", "freelancer-secondary"],
    ["submitted", "react-accessibility", "freelancer-primary"],
    ["viewed", "onboarding-designer", "freelancer-designer"],
    ["shortlisted", "ecommerce-support", "freelancer-support"],
    ["rejected", "landing-page", "freelancer-designer"],
    ["withdrawn", "managed-operations", "freelancer-assistant"],
    ["accepted", "microsoft-support", "freelancer-secondary"],
    ["interview", "mobile-qa", "freelancer-qa"],
  ];
  const proposals = proposalSpecs.map(([status, jobSlug, account], index) => ({
    id: id("proposal", `${jobSlug}-${account}`), job_id: job[jobSlug], freelancer_user_id: user(account),
    cover_letter: status === "draft" ? null : "Fictional demonstration proposal used to validate confidential proposal access and status workflows.",
    proposed_rate_minor: JOB_SPECS.find(([slug]) => slug === jobSlug)?.[5] === "hourly" ? 6200 : null,
    proposed_budget_minor: JOB_SPECS.find(([slug]) => slug === jobSlug)?.[5] === "hourly" ? null : 220000,
    currency: "AUD", estimated_duration: "6 weeks", availability_date: new Date(now + 7 * 86400000).toISOString().slice(0, 10),
    answers: { "demo-experience": "Fictional screening answer." }, status,
    submitted_at: status === "draft" ? null : iso(-8 + index), updated_at: iso(-2),
  }));
  const proposal = Object.fromEntries(proposals.map((item) => [proposalSpecs.find((spec) => item.id === id("proposal", `${spec[1]}-${spec[2]}`))[1], item.id]));
  const contracts = [
    ["active", "react-accessibility", "freelancer-primary", "active"],
    ["completed", "microsoft-support", "freelancer-secondary", "completed"],
    ["paused", "data-reporting", "freelancer-qa", "paused"],
    ["disputed", "saas-dashboard", "freelancer-primary", "disputed"],
  ].map(([slug, jobSlug, freelancer, status]) => ({
    id: id("contract", slug), job_id: job[jobSlug],
    proposal_id: slug === "completed" ? proposal[jobSlug] ?? null : null,
    client_user_id: user("client-owner"), freelancer_user_id: user(freelancer),
    company_id: company["northstar-digital-labs"], title: `Demo ${slug} contract`,
    contract_type: slug === "active" ? "hourly" : "fixed", currency: "AUD",
    hourly_rate_minor: slug === "active" ? 8000 : null,
    total_value_minor: slug === "active" ? null : 300000,
    platform_fee_rate_basis_points: 1000, status, started_at: iso(-30),
    completed_at: status === "completed" ? iso(-5) : null,
  }));
  const contract = Object.fromEntries(contracts.map((item) => [item.title.split(" ")[1], item.id]));
  const milestoneSpecs = [
    ["active-work", "active", 1, "in_progress"], ["active-submission", "active", 2, "submitted"],
    ["completed-approved", "completed", 1, "approved"], ["completed-released", "completed", 2, "released"],
    ["paused-draft", "paused", 1, "draft"], ["paused-awaiting", "paused", 2, "awaiting_funding"],
    ["disputed-funded", "disputed", 1, "funded"], ["disputed-revision", "disputed", 2, "revision_requested"],
    ["disputed-item", "disputed", 3, "disputed"], ["active-cancelled", "active", 3, "cancelled"],
  ];
  const milestones = milestoneSpecs.map(([slug, contractSlug, sequence, status]) => ({
    id: id("milestone", slug), contract_id: contract[contractSlug], title: `Demo ${slug.replaceAll("-", " ")}`,
    description: "Fictional milestone; no real money is moved.", amount_minor: 100000, currency: "AUD",
    due_at: iso(14 + sequence), sequence, status,
    funded_at: ["funded", "in_progress", "submitted", "revision_requested", "approved", "released", "disputed"].includes(status) ? iso(-15) : null,
    submitted_at: ["submitted", "revision_requested", "approved", "released"].includes(status) ? iso(-7) : null,
    approved_at: ["approved", "released"].includes(status) ? iso(-5) : null,
    released_at: status === "released" ? iso(-4) : null,
  }));
  const milestone = Object.fromEntries(milestones.map((item) => [item.title.slice(5).replaceAll(" ", "-"), item.id]));
  const workDiaryEntries = Array.from({ length: 20 }, (_, index) => ({
    id: id("work-diary", `active-${index + 1}`),
    contract_id: contract.active,
    freelancer_user_id: user("freelancer-primary"),
    work_date: new Date(now - index * 86400000).toISOString().slice(0, 10),
    minutes: [390, 360, 330, 420, 300][index % 5],
    memo: [
      "Reviewed the fictional project brief and documented implementation priorities.",
      "Completed demonstration interface work and recorded accessibility checks.",
      "Prepared a fictional client progress update and organised follow-up actions.",
      "Tested the demonstration workflow across supported responsive layouts.",
      "Refined generated deliverables and documented the next milestone hand-off.",
    ][index % 5],
    billable: index % 6 !== 5,
    status: "recorded",
    created_at: iso(-index + 0.25),
    updated_at: iso(-index + 0.25),
  }));
  const invitationSpecs = [
    ["pending", "saas-dashboard", "freelancer-frontend", 7], ["viewed", "healthcare-scheduling", "freelancer-health", 6],
    ["accepted", "customer-onboarding", "freelancer-support", 5], ["declined", "managed-operations", "freelancer-assistant", 4],
    ["expired", "mobile-qa", "freelancer-secondary", -1], ["withdrawn", "landing-page", "freelancer-designer", 3],
    ["pending", "mobile-developer", "freelancer-primary", 9], ["viewed", "api-developer", "freelancer-frontend", 8],
    ["accepted", "manual-tester", "freelancer-qa", 7],
  ];
  const invitations = invitationSpecs.map(([status, jobSlug, account, days], index) => ({
    id: id("invitation", `${jobSlug}-${account}`), job_id: job[jobSlug], client_user_id: user("client-owner"),
    freelancer_user_id: user(account), message: "Fictional invitation for demonstration testing.", status,
    created_at: iso(days < 0 ? -10 : -2), expires_at: iso(days), updated_at: iso(-1 + index / 24),
  }));
  const conversationSpecs = [
    ["job-clarification", "job", "healthcare-scheduling", null, "freelancer-primary", "Healthcare Admin Support"],
    ["proposal-discussion", "job", "react-accessibility", null, "freelancer-primary", "Frontend Development Project"],
    ["contract-kickoff", "contract", null, "active", "freelancer-primary"],
    ["work-approval", "contract", null, "completed", "freelancer-secondary"],
    ["support", "support", null, null, "admin"], ["dispute", "dispute", null, "disputed", "freelancer-primary"],
  ];
  const conversations = conversationSpecs.map(([slug, type, jobSlug, contractSlug, , subject]) => ({
    id: id("conversation", slug), created_by_user_id: user("client-owner"),
    job_id: jobSlug ? job[jobSlug] : null, contract_id: contractSlug ? contract[contractSlug] : null,
    subject: subject || `Demo ${slug.replaceAll("-", " ")}`, conversation_type: type, status: "active", last_message_at: iso(-1),
  }));
  const conversationMembers = conversationSpecs.flatMap(([slug, , , , other]) => [
    { conversation_id: id("conversation", slug), user_id: user("client-owner"), member_role: "owner", last_read_at: iso(-1) },
    { conversation_id: id("conversation", slug), user_id: user(other), member_role: other === "admin" ? "moderator" : "member" },
  ]);
  const messageCopy = {
    "job-clarification": [
      "Thanks for considering this fictional healthcare administration brief. How would you organise the scheduling support workflow?",
      "I would begin with an intake checklist, scheduling priorities, documented hand-offs, and a daily exception report.",
      "That structure fits Harbor Health Operations. Please keep every example fictional and avoid real patient information.",
      "Understood. I will use generated demonstration records only and keep the activity visible in this workspace.",
    ],
    "proposal-discussion": [
      "Your accessibility experience looks relevant. Which parts of the current frontend would you review first?",
      "I would begin with keyboard flow, form errors, focus management, and the highest-traffic responsive layouts.",
      "That is the priority order we had in mind. I have attached fictional discussion notes for this demo.",
      "Thank you. I will use those notes only within this demonstration conversation.",
    ],
    "contract-kickoff": [
      "Welcome to the fictional contract workspace. The first milestone covers technical discovery.",
      "Thanks. I have reviewed the demo brief and can start with the architecture and risk summary.",
      "Please keep all decisions here so the demonstration activity timeline stays complete.",
      "Understood. I will share the first fictional progress update tomorrow.",
    ],
    "work-approval": [
      "The final demonstration deliverable is ready for your review.",
      "I have reviewed it and the fictional milestone is approved. No real payment will be moved.",
      "Thank you for confirming. I will archive the generated working files.",
      "Great work keeping the scope and communication clear throughout the demo.",
    ],
    support: [
      "This is a fictional support conversation used to test the private support workflow.",
      "A demonstration administrator has received the request and is reviewing the supplied context.",
      "No credentials, secrets, or real customer information are included.",
      "Confirmed. The demonstration support request can now be marked resolved.",
    ],
    dispute: [
      "I would like the fictional scope difference documented before the next demonstration step.",
      "Thank you. Please describe the expected outcome without adding private or real-world information.",
      "The demo requirement was a two-page report; the submitted placeholder represents one page.",
      "The fictional issue is recorded for administrator review. No financial movement is permitted.",
    ],
  };
  const messages = conversationSpecs.flatMap(([slug, , , , other], index) =>
    messageCopy[slug].map((body, messageIndex) => ({
      id: id("message", `${slug}-${messageIndex + 1}`),
      conversation_id: id("conversation", slug),
      sender_user_id: messageIndex % 2 === 0 ? user("client-owner") : user(other),
      body,
      message_type: "text",
      created_at: iso(-4 + messageIndex + index / 24),
    })));
  const notifications = [
    "new_proposal", "proposal_viewed", "proposal_shortlisted", "proposal_rejected", "proposal_accepted",
    "new_invitation", "invitation_response", "new_message", "contract_created", "milestone_funded",
    "work_submitted", "revision_requested", "milestone_approved", "review_request", "dispute_update", "support_update",
  ].map((type, index) => ({
    id: id("notification", type), user_id: index % 2 ? user("freelancer-primary") : user("client-owner"),
    notification_type: type, title: `Demo ${type.replaceAll("_", " ")}`, body: "Fictional demonstration notification.",
    action_url: index % 3 === 0 ? "/app/contracts" : "/app/notifications",
    data: { is_demo: true, environment }, dedupe_key: keyFor(environment, "notification", type),
    read_at: index % 4 === 0 ? iso(-1) : null, created_at: iso(-index / 24),
  }));
  const disputeId = id("dispute", "contract-scope");
  const completedReleaseTransactionId = id("payment", "completed-release");
  const completedFundingTransactionId = id("payment", "completed-funding");
  const failedFundingTransactionId = id("payment", "failed-funding");
  const hourlyReleaseSpecs = Array.from({ length: 12 }, (_, index) => {
    const status = index < 8 ? "succeeded" : index === 8 ? "processing" : index === 9 ? "pending" : index === 10 ? "failed" : "cancelled";
    const amount = 44000 + index * 2500;
    const fee = Math.round(amount * 0.1);
    return {
      slug: `hourly-release-${index + 1}`,
      id: id("payment", `hourly-release-${index + 1}`),
      amount,
      fee,
      status,
      processedAt: ["succeeded", "failed", "cancelled"].includes(status) ? iso(-2 - index * 7) : null,
    };
  });
  const jobEvents = jobs.map((item) => ({
    id: id("job-event", item.slug), job_id: item.id, actor_user_id: user("client-owner"),
    event_type: "demo_seeded", to_status: item.status,
    metadata: { is_demo: true, environment, notice: DEMO_NOTICE },
  }));
  const jobAttachments = [{
    id: id("job-attachment", "saas-dashboard-brief"), job_id: job["saas-dashboard"],
    uploaded_by_user_id: user("client-owner"),
    file_path: `${user("client-owner")}/${job["saas-dashboard"]}/demo/${environment}/brief.pdf`,
    file_name: "demo-project-brief.pdf", content_type: "application/pdf", size_bytes: 90,
  }];
  const messageAttachments = [{
    id: id("message-attachment", "proposal-discussion"),
    message_id: id("message", "proposal-discussion-1"), uploader_user_id: user("client-owner"),
    file_path: `${id("conversation", "proposal-discussion")}/${user("client-owner")}/demo/${environment}/discussion.txt`,
    file_name: "demo-discussion-notes.txt", content_type: "text/plain", size_bytes: 76,
  }];
  const messageReports = [{
    id: id("message-report", "job-clarification"),
    conversation_id: id("conversation", "job-clarification"),
    message_id: id("message", "job-clarification-1"), reporter_user_id: user("freelancer-primary"),
    reason: "other", details: "Fictional report for moderation workflow testing.", status: "reviewing",
    reviewed_by_user_id: user("admin"),
  }];
  const disputeEvents = [
    {
      id: id("dispute-event", "opened"), dispute_id: disputeId,
      actor_user_id: user("freelancer-primary"), event_type: "opened", to_status: "opened",
      public_note: "Fictional dispute opened for demonstration.",
      metadata: { is_demo: true, environment },
    },
    {
      id: id("dispute-event", "assigned"), dispute_id: disputeId,
      actor_user_id: user("admin"), event_type: "assigned",
      from_status: "opened", to_status: "under_review",
      public_note: "A demonstration administrator is reviewing this fictional case.",
      internal_note: "No external action or real financial movement is permitted.",
      metadata: { is_demo: true, environment },
    },
  ];
  const disputeEvidence = [{
    id: id("dispute-evidence", "scope-notes"), dispute_id: disputeId,
    uploaded_by_user_id: user("freelancer-primary"),
    file_path: `${disputeId}/${user("freelancer-primary")}/demo/${environment}/scope-notes.txt`,
    file_name: "demo-scope-notes.txt", content_type: "text/plain", size_bytes: 84,
    description: "Generated fictional evidence metadata for access-control testing.",
  }];
  const connectedAccounts = [{
    user_id: user("freelancer-secondary"),
    stripe_account_id: `acct_demo_${id("stripe-account", "freelancer-secondary").replaceAll("-", "").slice(0, 16)}`,
    account_status: "enabled", charges_enabled: true, payouts_enabled: true, details_submitted: true,
    country_code: "AU", default_currency: "AUD", transfers_capability: "active",
    onboarding_completed_at: iso(-20), last_synced_at: iso(-1),
  }];
  const paymentTransactions = [
    {
      id: completedFundingTransactionId, contract_id: contract.completed,
      milestone_id: milestone["completed-released"], payer_user_id: user("client-owner"),
      payee_user_id: user("freelancer-secondary"), requested_by_user_id: user("client-owner"),
      transaction_type: "funding", provider: "manual",
      provider_reference: `demo-funding-${environment}`,
      idempotency_key: keyFor(environment, "payment", "completed-funding"),
      amount_minor: 100000, platform_fee_minor: 0, net_amount_minor: 100000,
      currency: "AUD", status: "succeeded", provider_status: "demo_only",
      provider_data: { is_demo: true, environment, livemode: false, external_movement: false },
      processed_at: iso(-10),
    },
    {
      id: completedReleaseTransactionId, contract_id: contract.completed,
      milestone_id: milestone["completed-released"], payer_user_id: user("client-owner"),
      payee_user_id: user("freelancer-secondary"), requested_by_user_id: user("client-owner"),
      transaction_type: "release", provider: "manual",
      provider_reference: `demo-release-${environment}`,
      idempotency_key: keyFor(environment, "payment", "completed-release"),
      amount_minor: 100000, platform_fee_minor: 10000, net_amount_minor: 90000,
      currency: "AUD", status: "succeeded", provider_status: "demo_only",
      provider_data: { is_demo: true, environment, livemode: false, external_movement: false },
      processed_at: iso(-4),
    },
    {
      id: failedFundingTransactionId, contract_id: contract.disputed,
      milestone_id: milestone["disputed-funded"], payer_user_id: user("client-owner"),
      payee_user_id: user("freelancer-primary"), requested_by_user_id: user("client-owner"),
      transaction_type: "funding", provider: "manual",
      provider_reference: `demo-failed-${environment}`,
      idempotency_key: keyFor(environment, "payment", "failed-funding"),
      amount_minor: 100000, platform_fee_minor: 0, net_amount_minor: 100000,
      currency: "AUD", status: "failed", failure_code: "demo_decline",
      failure_message: "Fictional failure; no payment provider was contacted.",
      provider_status: "demo_only",
      provider_data: { is_demo: true, environment, livemode: false, external_movement: false },
      processed_at: iso(-3),
    },
    ...hourlyReleaseSpecs.map((item) => ({
      id: item.id, contract_id: contract.active, milestone_id: null,
      payer_user_id: user("client-owner"), payee_user_id: user("freelancer-primary"),
      requested_by_user_id: user("client-owner"), transaction_type: "release", provider: "manual",
      provider_reference: `demo-${item.slug}-${environment}`,
      idempotency_key: keyFor(environment, "payment", item.slug),
      amount_minor: item.amount, platform_fee_minor: item.fee, net_amount_minor: item.amount - item.fee,
      currency: "AUD", status: item.status,
      failure_code: item.status === "failed" ? "demo_decline" : null,
      failure_message: item.status === "failed" ? "Fictional failure; no payment provider was contacted." : null,
      provider_status: "demo_only",
      provider_data: { is_demo: true, environment, livemode: false, external_movement: false },
      processed_at: item.processedAt,
      created_at: iso(-2 - hourlyReleaseSpecs.indexOf(item) * 7),
    })),
  ];
  const ledgerEntries = [
    ["funding-client", completedFundingTransactionId, user("client-owner"), "client", "debit", "funding", 100000],
    ["funding-holding", completedFundingTransactionId, null, "escrow", "credit", "escrow", 100000],
    ["release-holding", completedReleaseTransactionId, null, "escrow", "debit", "release", 100000],
    ["release-freelancer", completedReleaseTransactionId, user("freelancer-secondary"), "freelancer", "credit", "release", 90000],
    ["release-platform", completedReleaseTransactionId, null, "platform", "credit", "fee", 10000],
  ].map(([slug, transactionId, accountUserId, accountType, direction, entryType, amount]) => ({
    id: id("ledger", slug), transaction_id: transactionId, account_user_id: accountUserId,
    account_type: accountType, direction, entry_type: entryType, amount_minor: amount,
    currency: "AUD", description: "Fictional balanced demo ledger entry; excluded from genuine analytics.",
    contract_id: contract.completed, milestone_id: milestone["completed-released"],
    external_reference: `demo-${environment}-${slug}`,
    idempotency_key: keyFor(environment, "ledger", slug),
  })).concat(hourlyReleaseSpecs.filter((item) => item.status === "succeeded").flatMap((item) => [
    {
      id: id("ledger", `${item.slug}-client`), transaction_id: item.id,
      account_user_id: user("client-owner"), account_type: "client", direction: "debit", entry_type: "release",
      amount_minor: item.amount, currency: "AUD",
      description: "Fictional hourly release debit; excluded from genuine analytics.",
      contract_id: contract.active, milestone_id: null,
      external_reference: `demo-${environment}-${item.slug}-client`,
      idempotency_key: keyFor(environment, "ledger", `${item.slug}-client`),
    },
    {
      id: id("ledger", `${item.slug}-freelancer`), transaction_id: item.id,
      account_user_id: user("freelancer-primary"), account_type: "freelancer", direction: "credit", entry_type: "release",
      amount_minor: item.amount - item.fee, currency: "AUD",
      description: "Fictional hourly freelancer credit; excluded from genuine analytics.",
      contract_id: contract.active, milestone_id: null,
      external_reference: `demo-${environment}-${item.slug}-freelancer`,
      idempotency_key: keyFor(environment, "ledger", `${item.slug}-freelancer`),
    },
    {
      id: id("ledger", `${item.slug}-platform`), transaction_id: item.id,
      account_user_id: null, account_type: "platform", direction: "credit", entry_type: "fee",
      amount_minor: item.fee, currency: "AUD",
      description: "Fictional hourly platform fee; excluded from genuine analytics.",
      contract_id: contract.active, milestone_id: null,
      external_reference: `demo-${environment}-${item.slug}-platform`,
      idempotency_key: keyFor(environment, "ledger", `${item.slug}-platform`),
    },
  ]));
  const webhookEvents = [{
    id: id("webhook", "payment-succeeded"),
    provider: "stripe", provider_event_id: `evt_demo_${environment}_payment_succeeded`,
    event_type: "payment_intent.succeeded",
    payload: { id: `evt_demo_${environment}`, livemode: false, demo: true },
    processing_status: "processed", attempt_count: 1,
    object_id: `pi_demo_${environment}`, api_version: "demo", livemode: false,
    processed_at: iso(-10),
  }];
  const auditLogs = [{
    id: id("audit", "demo-seed"), actor_user_id: user("admin"), action: "demo_dataset_seeded",
    entity_table: "demo_data_registry", context: {
      is_demo: true, environment, external_notifications_sent: false, live_payments_triggered: false,
    },
  }];
  return {
    companies, freelancerProfiles, roleFreelancerProfiles, skills, jobs, proposals, invitations, contracts, milestones,
    workDiaryEntries,
    conversations, conversationMembers, messages, notifications, jobEvents, jobAttachments,
    messageAttachments, messageReports, disputeEvents, disputeEvidence, connectedAccounts,
    paymentTransactions, ledgerEntries, webhookEvents, auditLogs,
    clientProfiles: [
      { user_id: user("client-owner"), company_id: company["northstar-digital-labs"], job_title: "Demo Operations Director", preferred_currency: "AUD", billing_country: "AU" },
      { user_id: user("client-member"), company_id: company["northstar-digital-labs"], job_title: "Demo Hiring Manager", preferred_currency: "AUD", billing_country: "AU" },
    ],
    companyMembers: [
      ...companies.map((item) => ({
        company_id: item.id, user_id: user("client-owner"), role: "owner", status: "active",
      })),
      { company_id: company["northstar-digital-labs"], user_id: user("client-member"), role: "recruiter", status: "active" },
    ],
    conversationPreferences: [
      {
        conversation_id: id("conversation", "proposal-discussion"),
        user_id: user("freelancer-primary"),
        is_favorite: true,
      },
      {
        conversation_id: id("conversation", "contract-kickoff"),
        user_id: user("client-owner"),
        is_favorite: true,
      },
    ],
    freelancerSkills: freelancerProfiles.flatMap(({ account, skills: assigned }) => assigned.map((slug) => ({
      freelancer_user_id: user(account), skill_id: skillId[slug], proficiency_level: "advanced", years_experience: 5,
    }))),
    portfolioItems: freelancerProfiles.map(({ account, row }, index) => ({
      id: id("portfolio", account), freelancer_user_id: user(account), title: `Demo ${row.professional_title} portfolio`,
      description: "Generated placeholder portfolio item for demonstration only.",
      image_path: `${user(account)}/demo/${environment}/portfolio.png`, display_order: index, is_published: true,
    })),
    workExperience: freelancerProfiles.map(({ account, row }) => ({
      id: id("experience", account), freelancer_user_id: user(account), company_name: "Fictional Demo Studio",
      job_title: row.professional_title, start_date: "2021-01-01", end_date: "2025-12-31",
      currently_working: false, description: "Fictional experience used only for product testing.",
    })),
    education: freelancerProfiles.map(({ account }) => ({
      id: id("education", account), freelancer_user_id: user(account), institution: "Demo Learning Institute",
      qualification: "Demonstration Certificate", field_of_study: "Professional Services", start_year: 2018, end_year: 2020,
    })),
    languages: freelancerProfiles.map(({ account }) => ({
      freelancer_user_id: user(account), language_code: "en", language_name: "English", proficiency_level: "professional",
    })),
    jobSkills: jobs.flatMap((item) => {
      const categorySkills = SKILL_SPECS
        .filter(([, , category]) => category === item.category)
        .slice(0, 4);
      const selected = categorySkills.length ? categorySkills : SKILL_SPECS.slice(0, 3);
      return selected.map(([slug], index) => ({
        job_id: item.id,
        skill_id: skillId[slug],
        required: index < 2,
        importance: Math.max(1, 5 - index),
      }));
    }),
    savedJobs: [
      { user_id: user("freelancer-primary"), job_id: job["landing-page"] },
      { user_id: user("freelancer-secondary"), job_id: job["ecommerce-support"] },
    ],
    savedFreelancers: [
      { client_user_id: user("client-owner"), freelancer_user_id: user("freelancer-primary"), collection_name: "Demo shortlist" },
      { client_user_id: user("client-owner"), freelancer_user_id: user("freelancer-secondary"), collection_name: "Demo shortlist" },
    ],
    deliverables: [
      { id: id("deliverable", "active-v1"), milestone_id: milestone["active-submission"], submitted_by_user_id: user("freelancer-primary"), message: "Fictional demo deliverable.", file_path: `${contract.active}/${milestone["active-submission"]}/${user("freelancer-primary")}/demo/${environment}/deliverable.txt`, version_number: 1 },
      { id: id("deliverable", "completed-v2"), milestone_id: milestone["completed-released"], submitted_by_user_id: user("freelancer-secondary"), message: "Fictional approved demo deliverable.", file_path: `${contract.completed}/${milestone["completed-released"]}/${user("freelancer-secondary")}/demo/${environment}/deliverable.txt`, version_number: 2 },
    ],
    contractEvents: contracts.map((item) => ({
      id: id("contract-event", item.title.split(" ")[1]), contract_id: item.id, actor_user_id: user("client-owner"),
      event_type: "demo_contract_created", to_status: item.status, metadata: { is_demo: true, environment },
    })),
    reviews: [
      { id: id("review", "client-to-freelancer"), contract_id: contract.completed, reviewer_user_id: user("client-owner"), reviewee_user_id: user("freelancer-secondary"), rating: 5, title: "Clear communication", body: "Fictional feedback for the completed demonstration contract only.", visibility: "public", status: "published", direction: "client_to_freelancer", submitted_at: iso(-3), editable_until: iso(-1), publish_at: iso(-2), published_at: iso(-2) },
      { id: id("review", "freelancer-to-client"), contract_id: contract.completed, reviewer_user_id: user("freelancer-secondary"), reviewee_user_id: user("client-owner"), rating: 4, title: "Well scoped demo", body: "Fictional feedback validating the double-sided review workflow.", visibility: "public", status: "published", direction: "freelancer_to_client", submitted_at: iso(-3), editable_until: iso(-1), publish_at: iso(-2), published_at: iso(-2) },
    ],
    disputes: [{
      id: disputeId, contract_id: contract.disputed, milestone_id: milestone["disputed-item"],
      opened_by_user_id: user("freelancer-primary"), category: "scope", reason: "Fictional dispute created to test safe administrator review.",
      status: "under_review", assigned_admin_user_id: user("admin"), financial_references: { is_demo: true },
    }],
    disputeMessages: [
      { id: id("dispute-message", "participant"), dispute_id: id("dispute", "contract-scope"), sender_user_id: user("freelancer-primary"), message: "Fictional participant response.", is_internal: false },
      { id: id("dispute-message", "admin"), dispute_id: id("dispute", "contract-scope"), sender_user_id: user("admin"), message: "Fictional administrator response.", is_internal: true },
    ],
    userReports: [
      { id: id("report", "profile"), reporter_user_id: user("client-owner"), reported_user_id: user("freelancer-secondary"), category: "demo_profile", description: "Fictional profile report.", status: "triaged", assigned_admin_user_id: user("admin") },
      { id: id("report", "job"), reporter_user_id: user("freelancer-primary"), job_id: job["security-review"], category: "demo_job", description: "Fictional job report.", status: "investigating", assigned_admin_user_id: user("admin") },
      { id: id("report", "message"), reporter_user_id: user("freelancer-primary"), message_id: id("message", "job-clarification-1"), category: "demo_message", description: "Fictional message report.", status: "resolved", assigned_admin_user_id: user("admin") },
    ],
    supportRequests: [{
      id: id("support", "technical"), reference_code: `GW-DEMO-${environment.toUpperCase()}`,
      user_id: user("client-owner"), category: "technical", subject: "Demo support request",
      description: "Fictional support request used to test the authenticated support queue.",
      related_type: "contract", related_reference: contract.active, status: "in_progress", assigned_admin_user_id: user("admin"),
    }],
    adminActions: [{
      id: id("admin-action", "resolved-moderation"), admin_user_id: user("admin"), action_type: "demo_moderation_resolved",
      target_table: "jobs", target_record_id: job["security-review"], reason: "Fictional resolved moderation case for demonstration.",
      metadata: { is_demo: true, environment },
    }],
    notificationPreferences: ACCOUNT_SPECS.map(({ slug }) => ({
      user_id: user(slug), email_enabled: false, email_invitations: false, email_proposals: false,
      email_messages: false, email_contracts: false, email_milestones: false, email_payments: false,
      email_reviews: false, email_disputes: false, email_new_jobs: false,
      email_product_announcements: false, email_managed_services: false,
    })),
    uploads: freelancerProfiles.map(({ account }) => ({
      bucket: "portfolio-assets", path: `${user(account)}/demo/${environment}/portfolio.png`, kind: "png",
    })).concat([
      { bucket: "job-attachments", path: jobAttachments[0].file_path, kind: "pdf" },
      { bucket: "contract-deliverables", path: `${contract.active}/${milestone["active-submission"]}/${user("freelancer-primary")}/demo/${environment}/deliverable.txt`, kind: "text" },
      { bucket: "contract-deliverables", path: `${contract.completed}/${milestone["completed-released"]}/${user("freelancer-secondary")}/demo/${environment}/deliverable.txt`, kind: "text" },
      { bucket: "message-attachments", path: messageAttachments[0].file_path, kind: "text" },
      { bucket: "dispute-evidence", path: disputeEvidence[0].file_path, kind: "text" },
    ]),
  };
}

export function expectedCounts(manifest) {
  return Object.fromEntries(
    Object.entries(manifest)
      .filter(([, value]) => Array.isArray(value))
      .map(([name, value]) => [name, value.length]),
  );
}
