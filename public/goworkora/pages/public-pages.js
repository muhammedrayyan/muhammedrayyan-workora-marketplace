import { formatMoney } from "../features/jobs/workflow.js";

const INDUSTRIES = [
  ["healthcare", "Healthcare", "Administrative, customer-support and operational work for healthcare organisations.", ["Patient administration", "Scheduling", "Revenue-cycle support"], ["Healthcare administration", "Customer support", "Data operations"]],
  ["technology", "Technology", "Product, engineering, quality and customer-success support for technology teams.", ["Product delivery", "Software quality", "Technical support"], ["Software development", "Quality assurance", "IT support"]],
  ["professional-services", "Professional Services", "Reliable delivery support for consultancies and specialist service firms.", ["Client operations", "Project coordination", "Research"], ["Project management", "Virtual assistance", "Data and analytics"]],
  ["real-estate", "Real Estate", "Remote operational support for property, brokerage and facilities teams.", ["Listing administration", "Lead coordination", "Document support"], ["Virtual assistance", "Sales", "Customer support"]],
  ["e-commerce", "E-commerce", "Customer, catalogue and growth support for online retailers.", ["Catalogue operations", "Customer care", "Performance marketing"], ["Customer support", "Marketing", "Data and analytics"]],
  ["financial-services", "Financial Services", "Professional operational support for regulated financial organisations.", ["Administrative review", "Client operations", "Reporting support"], ["Accounting and finance", "Data and analytics", "Customer support"]],
  ["education", "Education", "Programme, learner and administrative support for education providers.", ["Learner support", "Programme coordination", "Content operations"], ["Customer support", "Project management", "Design and creative"]],
  ["logistics", "Logistics", "Coordination and support for transport, warehousing and supply-chain teams.", ["Shipment coordination", "Customer updates", "Operational reporting"], ["Operations", "Customer support", "Data and analytics"]],
  ["hospitality", "Hospitality", "Reservation, customer and administrative support for hospitality operators.", ["Reservation support", "Guest communication", "Back-office administration"], ["Customer support", "Virtual assistance", "Sales"]],
  ["startups-and-saas", "Startups and SaaS", "Flexible professional support for growing software and service businesses.", ["Product delivery", "Customer success", "Revenue operations"], ["Software development", "Customer support", "Sales"]],
].map(([slug, name, summary, needs, skills]) => ({ slug, name, summary, needs, skills }));

const BLOG_ARTICLES = [
  {
    slug: "write-a-clear-project-brief",
    title: "How to write a clear project brief",
    description: "A practical structure for defining outcomes, constraints and evidence before inviting proposals.",
    category: "Hiring",
    author: "GoWorkora Editorial",
    published: "2026-07-20",
    minutes: 6,
    sections: [
      ["Start with the outcome", "Describe the business result you need, who will use it and how you will judge whether the work is complete."],
      ["Separate requirements from preferences", "Identify non-negotiable requirements, useful preferences, dependencies and decisions that are still open."],
      ["Make review possible", "Name the deliverables, review checkpoints, responsible decision-maker and realistic response time for feedback."],
    ],
  },
  {
    slug: "compare-freelancer-proposals-fairly",
    title: "How to compare freelancer proposals fairly",
    description: "Evaluate relevant evidence and delivery thinking without relying on price alone.",
    category: "Hiring",
    author: "GoWorkora Editorial",
    published: "2026-07-21",
    minutes: 5,
    sections: [
      ["Use the same criteria", "Compare every eligible proposal against the same outcome, experience, communication and availability criteria."],
      ["Review relevant evidence", "Look for work samples and examples that resemble the problem you are solving, not just broad credentials."],
      ["Clarify before hiring", "Resolve assumptions about scope, timing, ownership and milestones inside the recorded proposal workflow."],
    ],
  },
  {
    slug: "deliver-remote-work-with-milestones",
    title: "Deliver remote work with useful milestones",
    description: "Turn a broad engagement into reviewable, accountable stages.",
    category: "Delivery",
    author: "GoWorkora Editorial",
    published: "2026-07-22",
    minutes: 7,
    sections: [
      ["Make each milestone observable", "A milestone should produce something that can be reviewed, accepted or returned with specific feedback."],
      ["Keep decisions connected", "Use contract messages and activity history so changes remain visible to both parties."],
      ["Close the loop", "Record approval only after reviewing the agreed deliverable and keep payment status distinct from work status."],
    ],
  },
];

const HELP_ARTICLES = [
  ["client-getting-started", "Client basics", "Create a client account and prepare to hire", "Complete email verification, finish your business profile, then post a job or browse public talent.", ["Use a business email you can access.", "Describe your organisation and hiring needs accurately.", "Keep job, proposal and contract decisions inside GoWorkora."]],
  ["freelancer-getting-started", "Freelancer basics", "Build a complete public freelancer profile", "Verify your email, complete required professional information and choose only skills you can support with evidence.", ["Add a focused professional title.", "Set honest availability and rate information.", "Publish only portfolio items you are authorised to share."]],
  ["account-access", "Account and security", "Access your account with a one-time code", "GoWorkora uses Supabase email one-time passwords instead of a reusable password.", ["Request a fresh code from the login page.", "Use only the newest code and never share it.", "Contact support if you lose access to your email account."]],
  ["jobs-and-proposals", "Jobs and proposals", "Publish, find and respond to relevant work", "Clients publish complete public jobs; eligible freelancers submit one active proposal through the controlled workflow.", ["Drafts are private to authorised client users.", "Closed or expired jobs cannot accept new proposals.", "Other freelancers cannot view private proposal content."]],
  ["contracts-and-milestones", "Contracts and milestones", "Manage agreed work through a contract", "Contracts connect the accepted proposal, parties, milestones, submissions and activity history.", ["Only contract participants can view private details.", "Submit work against the correct milestone.", "Use revision and approval actions to preserve state history."]],
  ["earnings-and-payments", "Payments and earnings", "Understand funding and release status", "Financial status is updated by trusted server-side operations and verified Stripe events.", ["Never pay through an unverified external request.", "A funded milestone is not the same as released earnings.", "Keep Stripe onboarding and payout requirements current."]],
  ["managed-services", "Managed services", "Request a managed remote professional", "Describe the role, outcomes, working hours and support level so GoWorkora can assess the requirement.", ["Managed service availability and pricing require a scoped quote.", "Clients interview proposed candidates.", "Compliance obligations remain subject to written scope and verification."]],
  ["trust-and-safety", "Trust and safety", "Report suspicious marketplace activity", "Use the report action or contact form for suspicious profiles, jobs, messages or payment requests.", ["Do not share verification codes or credentials.", "Preserve relevant links and reference numbers.", "Use the safety enquiry type for urgent review."]],
].map(([slug, category, title, description, items]) => ({
  slug,
  category,
  title,
  description,
  items,
  updated: "2026-07-23",
}));

const ENQUIRIES = [
  ["hiring-freelancers", "Hiring freelancers"],
  ["becoming-a-freelancer", "Becoming a freelancer"],
  ["managed-services", "Managed services"],
  ["sales", "Sales"],
  ["support", "Account support"],
  ["payment-support", "Payment support"],
  ["safety-report", "Safety report"],
  ["partnership", "Partnership"],
  ["media", "Media"],
  ["other", "Other"],
];

const MANAGED_SERVICES = [
  {
    slug: "customer-experience",
    code: "CX",
    name: "Managed Customer Experience",
    summary: "Build a dependable customer-care operation across the channels and hours your business actually needs.",
    challenge: "Support demand grows faster than internal capacity, creating uneven response quality, overloaded teams and limited visibility into recurring customer issues.",
    approach: "GoWorkora helps define the service model, assemble suitable support professionals and establish client-approved playbooks, escalation paths, quality reviews and reporting rhythms.",
    outcomes: ["More predictable queue coverage", "Consistent response and escalation standards", "Clearer insight into demand and service quality"],
    deliverables: ["Channel and coverage plan", "Knowledge-base and response workflows", "Quality review scorecard", "Weekly service reporting"],
    bestFor: "Customer support, member services and customer-success operations",
    launch: "Planning range: 3–5 weeks",
    coverage: "Dedicated or blended coverage",
  },
  {
    slug: "healthcare-operations",
    code: "HC",
    name: "Healthcare Operations Support",
    summary: "Extend non-clinical healthcare administration with carefully scoped remote operational support.",
    challenge: "Scheduling, referral coordination and administrative follow-up can consume skilled internal capacity and make patient-facing workflows harder to manage.",
    approach: "We help map permitted non-clinical tasks, access requirements and escalation rules before sourcing professionals for scheduling, verification support, records coordination and service administration.",
    outcomes: ["More consistent administrative follow-up", "Documented handoffs and escalation routes", "Capacity aligned to approved non-clinical work"],
    deliverables: ["Workflow and access map", "Scheduling or verification playbooks", "Exception and escalation register", "Quality and workload review"],
    bestFor: "Clinics, care networks and healthcare service organisations",
    launch: "Planning range: 4–6 weeks",
    coverage: "Subject to scope and compliance review",
  },
  {
    slug: "finance-back-office",
    code: "FO",
    name: "Finance & Back-Office Operations",
    summary: "Create an organised processing layer for repeatable finance administration and business support.",
    challenge: "Routine reconciliation preparation, document control and transaction follow-up often sit across inboxes and spreadsheets without clear ownership.",
    approach: "GoWorkora can structure repeatable workflows for invoice administration, accounts coordination, record preparation and operational follow-up under your approval controls.",
    outcomes: ["Cleaner processing queues", "Traceable review and approval handoffs", "Fewer unowned administrative exceptions"],
    deliverables: ["Process and control checklist", "Queue ownership model", "Exception tracking workflow", "Period-end support pack"],
    bestFor: "Finance administration, shared services and growing back offices",
    launch: "Planning range: 3–5 weeks",
    coverage: "Operational support, not financial advice",
  },
  {
    slug: "revenue-operations",
    code: "RO",
    name: "Revenue Operations & CRM",
    summary: "Keep leads, customer records and commercial handoffs organised from first contact to reporting.",
    challenge: "Inconsistent CRM data and unclear handoffs make pipeline reporting unreliable and leave valuable follow-up dependent on individual habits.",
    approach: "We can help establish lead-routing rules, CRM hygiene routines, sales-administration workflows and reporting support around your approved commercial process.",
    outcomes: ["More reliable pipeline records", "Faster ownership of follow-up tasks", "Consistent commercial reporting inputs"],
    deliverables: ["CRM workflow map", "Data-quality standards", "Lead and opportunity routing rules", "Pipeline reporting cadence"],
    bestFor: "Sales operations, account teams and service businesses",
    launch: "Planning range: 3–5 weeks",
    coverage: "Project, fractional or dedicated support",
  },
  {
    slug: "it-helpdesk",
    code: "IT",
    name: "IT Helpdesk & Systems Support",
    summary: "Add structured first-line technical support and systems administration around approved tools and policies.",
    challenge: "Internal technology teams lose focus when access requests, common incidents and routine administration arrive through fragmented channels.",
    approach: "GoWorkora can support a documented service desk model with approved request categories, triage guidance, access workflows, escalation thresholds and service reporting.",
    outcomes: ["A clearer path for routine requests", "Consistent triage and escalation", "Better visibility into recurring issues"],
    deliverables: ["Service catalogue and request intake", "Triage and escalation matrix", "Access and asset procedures", "Incident trend reporting"],
    bestFor: "Distributed teams, SaaS companies and internal IT functions",
    launch: "Planning range: 4–6 weeks",
    coverage: "First-line support with agreed escalation",
  },
  {
    slug: "data-quality",
    code: "DQ",
    name: "Data, Reporting & Quality Operations",
    summary: "Turn recurring data checks, operational reporting and quality reviews into a managed rhythm.",
    challenge: "Business reporting becomes slow and inconsistent when source data, validation rules and review ownership are not clearly defined.",
    approach: "We help translate reporting and quality requirements into repeatable preparation, validation, sampling and exception-management workflows.",
    outcomes: ["Repeatable reporting cycles", "Visible data-quality exceptions", "Documented review criteria and ownership"],
    deliverables: ["Source and metric register", "Validation and sampling rules", "Reporting production calendar", "Issue and correction log"],
    bestFor: "Operations, service quality and management reporting teams",
    launch: "Planning range: 2–4 weeks",
    coverage: "Recurring cycles or defined reporting projects",
  },
  {
    slug: "product-engineering",
    code: "PE",
    name: "Product & Engineering Delivery Pods",
    summary: "Add coordinated product, engineering and quality capacity around a defined roadmap or delivery backlog.",
    challenge: "A roadmap can stall when design, development, testing and delivery coordination are sourced separately without one working cadence.",
    approach: "GoWorkora can assemble a role-based delivery pod and align backlog ownership, review checkpoints, quality expectations and release communication to your team.",
    outcomes: ["A coordinated cross-functional delivery cadence", "Reviewable milestones and acceptance criteria", "Clear ownership across build and quality work"],
    deliverables: ["Role and responsibility map", "Delivery backlog and milestone plan", "Quality and review checkpoints", "Release and handover record"],
    bestFor: "Product teams, digital programmes and internal platforms",
    launch: "Planning range: 4–7 weeks",
    coverage: "Milestone-based or dedicated pod",
  },
  {
    slug: "executive-operations",
    code: "EO",
    name: "Executive & Business Operations",
    summary: "Give leaders a reliable operating layer for coordination, research and recurring administrative work.",
    challenge: "High-value priorities compete with calendar, inbox, research, meeting and project follow-up that still require judgement and consistent ownership.",
    approach: "We help define an executive-support or virtual-operations scope with communication protocols, decision boundaries, recurring routines and progress visibility.",
    outcomes: ["More protected leadership capacity", "Reliable follow-through on recurring work", "Clear communication and decision boundaries"],
    deliverables: ["Operating preferences and protocol", "Calendar and inbox workflows", "Meeting and action tracking", "Weekly priorities review"],
    bestFor: "Executives, founders and distributed operating teams",
    launch: "Planning range: 2–4 weeks",
    coverage: "Fractional or dedicated support",
  },
];

const MANAGED_ENGAGEMENTS = [
  {
    slug: "launch-sprint",
    name: "Launch sprint",
    label: "Defined setup",
    description: "Map one workflow, define controls and stand up an initial operating team around a bounded requirement.",
    includes: ["Scope and workflow design", "Role and capacity plan", "Initial onboarding support"],
  },
  {
    slug: "dedicated-team",
    name: "Dedicated team",
    label: "Ongoing capacity",
    description: "Create stable, named capacity with agreed coverage, responsibilities and direct working routines.",
    includes: ["Curated role-based team", "Agreed operating cadence", "Performance review rhythm"],
  },
  {
    slug: "managed-function",
    name: "Managed function",
    label: "Outcome-led operation",
    description: "Combine people, workflow governance, quality review and service reporting under a scoped operating model.",
    includes: ["Delivery ownership", "Quality and exception management", "Capacity and continuity planning"],
  },
];

const PRICING_ENGAGEMENTS = [
  {
    slug: "marketplace-hiring",
    code: "01",
    label: "Direct marketplace",
    name: "Marketplace Hiring",
    summary: "Choose and contract an independent professional directly through GoWorkora's structured marketplace workflow.",
    bestFor: "Clients who want direct control over the brief, professional selection, contract decisions and day-to-day collaboration.",
    steps: [
      "Create a verified client and company profile",
      "Publish a clear opportunity or search public talent",
      "Review eligible proposals, evidence and availability",
      "Select a professional through the protected hiring flow",
      "Agree the contract, milestones and responsibilities",
      "Review submissions and record decisions in the workspace",
    ],
    includes: [
      "Public talent and job discovery",
      "Invitations and private proposals",
      "Contract and milestone workspaces",
      "Permission-aware messages and files",
      "Recorded approvals and activity history",
      "Eligible post-contract reviews",
    ],
    commercial: "Applicable marketplace and payment terms are shown before a commitment is made.",
    action: ["Start hiring", "/signup/client"],
  },
  {
    slug: "managed-service",
    code: "02",
    label: "Coordinated capacity",
    name: "Managed Service",
    badge: "Most popular",
    featured: true,
    summary: "Add a professionally scoped remote operating team with the people, workflows and review cadence matched to your requirement.",
    bestFor: "Organisations that need more than an introduction—such as coordinated staffing, onboarding, operating routines and quality review.",
    steps: [
      "Describe the function, outcomes, systems and constraints",
      "Review a written scope and proposed operating model",
      "Assess suitable professionals for the approved roles",
      "Complete client-approved access and onboarding",
      "Run the agreed workflow and communication cadence",
      "Review quality, exceptions and capacity against the scope",
    ],
    includes: [
      "Requirement and workflow design",
      "Curated role-based professionals",
      "Onboarding and handoff support",
      "Documented playbooks and escalation routes",
      "Agreed service reporting",
      "Continuity planning where included in scope",
    ],
    commercial: "A custom quote is prepared after the responsibilities, coverage and controls are documented.",
    action: ["Explore managed services", "/managed-services"],
  },
  {
    slug: "stabilisation-sprint",
    code: "03",
    label: "Bounded intervention",
    name: "Launch & Stabilisation Sprint",
    summary: "Diagnose and organise one defined operational challenge before deciding whether ongoing marketplace or managed capacity is appropriate.",
    bestFor: "Teams with a stalled workflow, unclear ownership, inconsistent handoffs or a specific operation that needs a controlled reset.",
    steps: [
      "Review the current workflow, evidence and constraints",
      "Identify priority risks, decisions and ownership gaps",
      "Agree a bounded work plan and acceptance criteria",
      "Complete the approved improvement work",
      "Hand over decisions, documentation and next-step options",
    ],
    includes: [
      "Diagnostic review",
      "Prioritised work register",
      "Risk and dependency record",
      "Workflow or handoff documentation",
      "Agreed fixes or operating improvements",
      "Handover and follow-up review",
    ],
    commercial: "A custom quote covers only the bounded scope confirmed in writing.",
    action: ["Discuss a sprint", "/contact?subject=sales"],
  },
];

const OUTSOURCING_PROJECTS = [
  {
    slug: "customer-experience",
    code: "CX",
    name: "Customer Service & Call Centre",
    summary: "Create dependable inbound or outbound customer support around approved channels, scripts and escalation rules.",
    examples: ["Phone, email and chat queues", "Customer follow-up and appointment support", "Escalation and quality-review workflows"],
  },
  {
    slug: "executive-operations",
    code: "AD",
    name: "Administrative Support",
    summary: "Give teams reliable help with recurring coordination, records and executive or operational administration.",
    examples: ["Calendar, inbox and meeting support", "Document and data-entry workflows", "Research, tracking and follow-up"],
  },
  {
    slug: "finance-back-office",
    code: "BL",
    name: "Billing & Finance Operations",
    summary: "Organise repeatable billing administration and finance-support queues under the client's approval controls.",
    examples: ["Invoice preparation and distribution", "Payment-status follow-up", "Reconciliation and period-close preparation"],
  },
  {
    slug: "revenue-operations",
    code: "SL",
    name: "Sales & Revenue Support",
    summary: "Build the operating support behind prospecting, qualification, CRM quality and commercial follow-through.",
    examples: ["Lead research and qualification", "Appointment setting and follow-up", "CRM updates and pipeline administration"],
  },
  {
    slug: "healthcare-operations",
    code: "HC",
    name: "Healthcare Administration",
    summary: "Extend carefully scoped non-clinical workflows for providers, clinics and healthcare service organisations.",
    examples: ["Patient scheduling support", "Insurance-verification administration", "Referral and records coordination"],
  },
  {
    slug: "customer-experience",
    code: "EC",
    name: "E-commerce Operations",
    summary: "Support the recurring customer and catalogue work behind a responsive online retail operation.",
    examples: ["Order and returns support", "Catalogue and product-data upkeep", "Marketplace and customer enquiries"],
  },
  {
    slug: "data-quality",
    code: "DQ",
    name: "Data, Reporting & Quality",
    summary: "Turn recurring reporting, validation and quality checks into a documented operating rhythm.",
    examples: ["Report preparation and distribution", "Data-quality sampling", "Exception and correction tracking"],
  },
  {
    slug: "it-helpdesk",
    code: "IT",
    name: "IT, Product & Digital Support",
    summary: "Add technical helpdesk, product operations or coordinated digital-delivery capacity when the scope requires it.",
    examples: ["First-line support and triage", "Product and release coordination", "Design, engineering and QA delivery"],
  },
];

const OUTSOURCING_LIFECYCLE = [
  {
    code: "01",
    name: "Assess the operation",
    summary: "Understand the business outcome before discussing headcount.",
    activities: ["Clarify work volumes, channels and operating context", "Identify systems, access needs and risk boundaries", "Agree what evidence will show acceptable work"],
    output: "A requirement brief with known constraints, responsibilities and open decisions.",
  },
  {
    code: "02",
    name: "Design the workflow",
    summary: "Turn the requirement into roles, instructions and review points.",
    activities: ["Define role mix and ownership boundaries", "Document workflow, escalation and approval paths", "Choose direct marketplace or managed support"],
    output: "A client-reviewed scope and operating model suitable for selection.",
  },
  {
    code: "03",
    name: "Select & onboard",
    summary: "Review suitable professionals against the same requirement.",
    activities: ["Compare eligible profiles, proposals or curated candidates", "Complete interviews and role-specific checks", "Provide only approved systems, access and work instructions"],
    output: "A confirmed professional or team with controlled onboarding records.",
  },
  {
    code: "04",
    name: "Operate & review",
    summary: "Run the work with visible queues, decisions and quality checks.",
    activities: ["Use the agreed communication and reporting rhythm", "Review samples, exceptions and completed outputs", "Record changes before responsibilities expand"],
    output: "Reviewable work records, quality observations and authorised decisions.",
  },
  {
    code: "05",
    name: "Improve, renew or hand over",
    summary: "Close the loop instead of allowing an engagement to drift.",
    activities: ["Review capacity, outcomes and unresolved exceptions", "Agree further scope through the correct workflow", "Complete documentation and handover where required"],
    output: "A recorded close, renewed scope or controlled transition plan.",
  },
];

const STATIC_CONTENT = {
  "/how-it-works/freelancers": ["For freelancers", "Build a credible profile and do focused work.", "A transparent path from verification to professional delivery.", [
    ["Build your profile", "Verify your email, add a professional summary, skills, rate, availability and only portfolio work you may publish."],
    ["Find opportunities", "Search public jobs, respond to valid invitations and submit one active proposal for an eligible job."],
    ["Deliver professionally", "Use the contract workspace, messages and milestone submissions to keep work and decisions connected."],
    ["Earnings and reputation", "Complete Stripe test or live onboarding when enabled, monitor verified payment states and build reputation through eligible reviews."],
    ["Account safety", "Keep one-time codes private, avoid external payment requests and report suspicious behaviour."],
  ], [["Create freelancer account", "/signup/freelancer"], ["Browse jobs", "/find-work"], ["Freelancer help", "/help/freelancer-getting-started"]]],
  "/about": ["About GoWorkora", "Hire Better. Work Smarter.", "GoWorkora connects businesses with skilled freelancers and managed remote professionals through a secure, transparent and results-focused platform.", [
    ["Mission", "Make professional remote work easier to scope, evaluate, deliver and account for."],
    ["For clients", "Support clear hiring decisions with public profiles, structured jobs, private proposals and traceable contract workflows."],
    ["For freelancers", "Create fair access to relevant opportunities and a professional record built from genuine work."],
    ["Principles", "Protect private data, show real marketplace states, avoid unsupported claims and keep important decisions connected to the engagement."],
  ], [["How GoWorkora works", "/how-it-works"], ["Trust and safety", "/trust-and-safety"]]],
  "/careers": ["Careers", "Help make professional remote work work better.", "No internal GoWorkora positions are publicly listed at this time.", [
    ["Marketplace work", "Freelancers looking for client opportunities should browse the public job marketplace."],
    ["Recruitment safety", "GoWorkora will not ask candidates to pay an application fee or send banking credentials through an unverified channel."],
  ], [["Browse marketplace jobs", "/find-work"], ["About GoWorkora", "/about"]]],
  "/trust-and-safety": ["Trust and safety", "Professional work needs clear safeguards.", "GoWorkora combines secure authentication, role-aware access, private records and reporting workflows without overstating what those controls guarantee.", [
    ["Accounts and profiles", "Email verification protects account access. Public profile badges appear only when supported by genuine data."],
    ["Contracts and payments", "Contracts preserve agreed workflow state. Financial state changes rely on trusted functions and verified Stripe events when payments are enabled."],
    ["Communication and files", "Conversation and attachment access is limited to authorised participants through RLS and signed access."],
    ["Common warnings", "Never share one-time codes, API keys or banking credentials in messages. Be cautious of requests to move payment outside the agreed workflow."],
    ["Reporting and disputes", "Report suspicious activity with relevant links and reference numbers. Opening a dispute does not itself move money."],
  ], [["Report a concern", "/contact?subject=safety-report"], ["Safety help", "/help/trust-and-safety"]]],
  "/accessibility": ["Accessibility", "GoWorkora should work with different ways of navigating.", "Last reviewed 23 July 2026. We continue to test and improve the experience.", [
    ["Interaction support", "Public navigation and forms support keyboard use, visible focus, descriptive labels and responsive zoom."],
    ["Screen readers", "Pages use semantic headings, landmarks and status or error announcements where applicable."],
    ["Known limitations", "Some third-party Supabase and Stripe experiences are outside GoWorkora's direct accessibility control."],
    ["Tell us about an issue", "Include the page, browser, device and assistive technology where comfortable. Do not include passwords or one-time codes."],
  ], [["Report an accessibility issue", "/contact?subject=accessibility"]]],
};

const LEGAL = {
  "/terms": ["Terms", [
    ["Acceptance and eligibility", "Account creation and platform use are subject to approved legal terms, age and authority requirements."],
    ["Accounts", "Users are responsible for accurate information, authorised access and protecting verification credentials."],
    ["Marketplace role", "GoWorkora provides marketplace and managed-service workflows; the exact contractual role must be approved in final legal language."],
    ["Clients and freelancers", "Each party is responsible for lawful scope, accurate representations, professional conduct and agreed deliverables."],
    ["Fees and payments", "Applicable fees and supported payment processes must be displayed before commitment. Final refund and payout terms require legal approval."],
    ["Contracts, disputes and reviews", "Structured workflows preserve important states but do not replace professional or legal advice."],
    ["Prohibited conduct", "Fraud, impersonation, harassment, illegal work, credential sharing and attempts to bypass security controls are prohibited."],
    ["Intellectual property and confidentiality", "Final ownership, licences and confidentiality provisions must be agreed and legally reviewed."],
    ["Termination, disclaimers and liability", "Suspension, termination, warranty, liability and governing-law language remains subject to counsel approval."],
  ]],
  "/privacy": ["Privacy Notice", [
    ["Data collected", "GoWorkora processes account, profile, job, proposal, contract, message, file, support and technical log data needed for platform operation."],
    ["Payments", "Stripe processes payment and connected-account data. GoWorkora stores required identifiers and status information, not full bank or card details."],
    ["Service providers", "Supabase, Stripe, Resend and GitHub Pages process relevant data for authentication, hosting, payments and email."],
    ["Uses and sharing", "Data is used to provide, secure, support and improve the service and is shared only for defined operational, legal or safety purposes."],
    ["Retention and rights", "Final retention schedules, legal bases and jurisdiction-specific user rights require legal approval."],
    ["International processing and security", "Providers may process data across regions. Technical controls reduce risk but no system can promise absolute security."],
    ["Children and contact", "Eligibility and formal privacy-contact details must be confirmed in the approved notice."],
  ]],
  "/cookies": ["Cookie Policy", [
    ["Essential storage", "GoWorkora uses browser storage and cookies needed for Supabase authentication, session continuity, security and preferences."],
    ["Analytics", "No non-essential analytics should run unless configured and, where required, consented to."],
    ["Third parties", "Supabase and Stripe may use necessary storage in their hosted flows under their own notices."],
    ["Managing preferences", "Blocking essential authentication storage may prevent sign-in and protected workflows from functioning."],
    ["Retention and contact", "Specific storage durations and the formal contact point require legal review before launch."],
  ]],
};

function escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sections(items) {
  return `<div class="public-sections">${items.map(([heading, copy]) => `<section><h2>${escape(heading)}</h2><p>${escape(copy)}</p></section>`).join("")}</div>`;
}

function cards(items) {
  return `<div class="public-card-grid">${items.map(({ eyebrow = "", title, copy, path = "" }) => path
    ? `<a class="public-card" href="${escape(path)}" data-route="${escape(path)}"><small>${escape(eyebrow)}</small><strong>${escape(title)}</strong><span>${escape(copy)}</span></a>`
    : `<article class="public-card"><small>${escape(eyebrow)}</small><strong>${escape(title)}</strong><span>${escape(copy)}</span></article>`).join("")}</div>`;
}

function routePage(eyebrow, title, intro, body, actions = [], description = intro) {
  return { eyebrow, title, intro, body, actions, description };
}

function managedContactPath({ service = "", engagement = "" } = {}) {
  const query = new URLSearchParams({ subject: "managed-services" });
  if (service) query.set("service", service);
  if (engagement) query.set("engagement", engagement);
  return `/contact?${query.toString()}`;
}

function managedServicesPage(search = "") {
  const requestedService = new URLSearchParams(search).get("service");
  const activeService = MANAGED_SERVICES.find((service) => service.slug === requestedService) || MANAGED_SERVICES[0];
  const serviceTabs = MANAGED_SERVICES.map((service) => {
    const selected = service.slug === activeService.slug;
    return `<button id="managed-service-tab-${escape(service.slug)}" class="ms-service-tab" type="button" role="tab" aria-selected="${selected}" aria-controls="managed-service-panel-${escape(service.slug)}" tabindex="${selected ? "0" : "-1"}" data-managed-service-tab="${escape(service.slug)}">
      <span>${escape(service.code)}</span><strong>${escape(service.name)}</strong><small>${escape(service.summary)}</small>
    </button>`;
  }).join("");
  const servicePanels = MANAGED_SERVICES.map((service) => {
    const selected = service.slug === activeService.slug;
    return `<section id="managed-service-panel-${escape(service.slug)}" class="ms-service-panel" role="tabpanel" aria-labelledby="managed-service-tab-${escape(service.slug)}" data-managed-service-panel="${escape(service.slug)}"${selected ? "" : " hidden"}>
      <div class="ms-service-heading">
        <div><span>${escape(service.code)} · Managed service</span><h3>${escape(service.name)}</h3><p>${escape(service.summary)}</p></div>
        <a class="btn btn-lime" href="${escape(managedContactPath({ service: service.slug }))}" data-route="${escape(managedContactPath({ service: service.slug }))}">Discuss this service <b aria-hidden="true">↗</b></a>
      </div>
      <div class="ms-service-narrative">
        <article><small>The operating challenge</small><p>${escape(service.challenge)}</p></article>
        <article><small>How GoWorkora can help</small><p>${escape(service.approach)}</p></article>
      </div>
      <div class="ms-service-detail-grid">
        <section><span>Designed outcomes</span><ul>${service.outcomes.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></section>
        <section><span>Typical scoped deliverables</span><ul>${service.deliverables.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></section>
        <aside>
          <small>Best suited to</small><strong>${escape(service.bestFor)}</strong>
          <small>Launch planning</small><strong>${escape(service.launch)}</strong>
          <small>Engagement shape</small><strong>${escape(service.coverage)}</strong>
        </aside>
      </div>
    </section>`;
  }).join("");
  const engagementCards = MANAGED_ENGAGEMENTS.map((engagement, index) => `<article class="ms-model-card${index === 1 ? " featured" : ""}">
    <div><span>0${index + 1}</span><small>${escape(engagement.label)}</small></div>
    <h3>${escape(engagement.name)}</h3><p>${escape(engagement.description)}</p>
    <ul>${engagement.includes.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>
    <a href="${escape(managedContactPath({ engagement: engagement.slug }))}" data-route="${escape(managedContactPath({ engagement: engagement.slug }))}">Scope this model <b aria-hidden="true">→</b></a>
  </article>`).join("");

  return routePage(
    "Managed services",
    "Your operation, staffed and managed.",
    "Build dependable remote capacity with a clear scope, accountable delivery and the right level of GoWorkora support.",
    `<div class="managed-services-page">
      <section class="ms-principles" aria-label="Managed service foundations">
        <article><span>01</span><strong>Scope before staffing</strong><p>Define outcomes, ownership, systems and decision boundaries before a team is proposed.</p></article>
        <article><span>02</span><strong>Curated for the work</strong><p>Review suitable professionals against the role, coverage and operating context you approve.</p></article>
        <article><span>03</span><strong>Visible operations</strong><p>Use documented workflows, checkpoints and reporting instead of relying on informal handoffs.</p></article>
        <article><span>04</span><strong>Support that can evolve</strong><p>Start with a bounded scope and review capacity as demand, process and priorities change.</p></article>
      </section>

      <section class="ms-catalogue" aria-labelledby="managed-service-catalogue-title">
        <header class="ms-section-heading"><span>Service catalogue</span><h2 id="managed-service-catalogue-title">Choose the operating function you need to strengthen.</h2><p>Every option is a starting point. The final team, controls, hours, responsibilities and commercial terms are confirmed in a written scope.</p></header>
        <div class="ms-service-tabs" role="tablist" aria-label="Managed service options">${serviceTabs}</div>
        <div class="ms-service-panels">${servicePanels}</div>
      </section>

      <section class="ms-models" aria-labelledby="managed-engagement-title">
        <header class="ms-section-heading"><span>Engagement options</span><h2 id="managed-engagement-title">Choose how much operating ownership you need.</h2><p>Commercial terms are quoted after scope. No team, timeline or compliance requirement is treated as agreed until it appears in the written plan.</p></header>
        <div class="ms-model-grid">${engagementCards}</div>
      </section>

      <section class="ms-process" aria-labelledby="managed-process-title">
        <div class="ms-process-intro"><span>Operating model</span><h2 id="managed-process-title">From requirement to a working service.</h2><p>A practical sequence keeps people, process and accountability connected from the start.</p><a href="${escape(managedContactPath())}" data-route="${escape(managedContactPath())}">Start a scoped conversation <b aria-hidden="true">↗</b></a></div>
        <ol>
          <li><span>01</span><div><strong>Discover</strong><p>Confirm outcomes, volumes, hours, systems, risks and success criteria.</p></div></li>
          <li><span>02</span><div><strong>Design</strong><p>Define roles, workflows, access boundaries, governance and a commercial scope.</p></div></li>
          <li><span>03</span><div><strong>Launch</strong><p>Review the proposed team, complete approved onboarding and begin with controlled handoffs.</p></div></li>
          <li><span>04</span><div><strong>Improve</strong><p>Review quality, capacity, exceptions and priorities through the agreed service rhythm.</p></div></li>
        </ol>
      </section>

      <section class="ms-assurance" aria-labelledby="managed-assurance-title">
        <div><span>Responsible delivery</span><h2 id="managed-assurance-title">Controls belong inside the service design.</h2><p>GoWorkora assesses access, privacy, security and regulatory needs during scoping. Any certification, jurisdictional requirement or service-level commitment must be verified and agreed in writing.</p></div>
        <ul><li>Role and access boundaries</li><li>Documented escalation paths</li><li>Quality and exception reviews</li><li>Business continuity planning where scoped</li></ul>
      </section>

      <section class="ms-faq" aria-labelledby="managed-faq-title">
        <header class="ms-section-heading"><span>Practical answers</span><h2 id="managed-faq-title">Before you request a managed plan.</h2></header>
        <div>
          <details><summary>Is this the same as hiring one freelancer?</summary><p>No. Marketplace hiring lets you select and manage an individual directly. A managed scope can add workflow design, coordinated recruitment, onboarding support, operating cadence, quality review or broader delivery ownership.</p></details>
          <details><summary>Can we start with a small scope?</summary><p>Yes. A bounded workflow or launch sprint is often the clearest way to validate responsibilities, demand and working routines before considering longer-term capacity.</p></details>
          <details><summary>Do you publish standard prices?</summary><p>Not for managed services. Team shape, region, coverage hours, systems, governance and risk requirements materially affect the scope, so pricing is provided through a written quote.</p></details>
          <details><summary>Can GoWorkora support regulated work?</summary><p>Potentially, but only after the specific tasks, data, access, jurisdiction and control requirements are reviewed. The page does not represent certification or legal compliance by default.</p></details>
        </div>
      </section>
    </div>`,
    [["Request a managed plan", managedContactPath()], ["Explore the client workflow", "/how-it-works/clients"]],
    "Explore GoWorkora managed services for customer experience, healthcare operations, finance administration, revenue operations, IT support, data quality, product delivery and executive operations.",
  );
}

function pricingPage() {
  const engagementCards = PRICING_ENGAGEMENTS.map((engagement) => `<article id="pricing-${escape(engagement.slug)}" class="pricing-model${engagement.featured ? " is-featured" : ""}" aria-labelledby="pricing-${escape(engagement.slug)}-title">
    <header class="pricing-model-header">
      <div class="pricing-model-identity"><span>${escape(engagement.code)}</span><div><small>${escape(engagement.label)}</small><h2 id="pricing-${escape(engagement.slug)}-title">${escape(engagement.name)}</h2></div></div>
      ${engagement.badge ? `<strong class="pricing-model-badge">${escape(engagement.badge)}</strong>` : ""}
    </header>
    <p class="pricing-model-summary">${escape(engagement.summary)}</p>
    <div class="pricing-model-grid">
      <section class="pricing-best-fit"><small>Best for</small><p>${escape(engagement.bestFor)}</p></section>
      <section><small>How it works</small><ol>${engagement.steps.map((item) => `<li>${escape(item)}</li>`).join("")}</ol></section>
      <section><small>What's included</small><ul>${engagement.includes.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></section>
    </div>
    <footer class="pricing-model-footer"><div><small>Commercial approach</small><strong>${escape(engagement.commercial)}</strong></div><a class="btn ${engagement.featured ? "btn-dark" : "btn-outline"}" href="${escape(engagement.action[1])}" data-route="${escape(engagement.action[1])}">${escape(engagement.action[0])} <b aria-hidden="true">↗</b></a></footer>
  </article>`).join("");

  return routePage(
    "Flexible engagement models",
    "Choose how you want to work.",
    "Hire directly, build managed capacity, or stabilise a defined operational challenge through one professional GoWorkora experience.",
    `<div class="pricing-engagement-page">
      <section class="pricing-principles" aria-label="GoWorkora commercial principles">
        <article><span>01</span><strong>Choose the level of support</strong><p>Stay hands-on through the marketplace or add coordinated operating support when the requirement needs it.</p></article>
        <article><span>02</span><strong>See terms before commitment</strong><p>Applicable marketplace terms or a written custom quote are presented before you approve an engagement.</p></article>
        <article><span>03</span><strong>Keep decisions connected</strong><p>Briefs, proposals, contracts, communication and delivery records remain part of the same accountable workflow.</p></article>
      </section>

      <section class="pricing-models" aria-labelledby="pricing-models-title">
        <header class="pricing-section-heading"><span>Three ways to engage</span><h2 id="pricing-models-title">Match the operating model to the work.</h2><p>Start with the amount of ownership and support you need. Each model keeps scope, access and commercial decisions explicit.</p></header>
        <div class="pricing-model-list">${engagementCards}</div>
      </section>

      <section class="pricing-clarity" aria-labelledby="pricing-clarity-title">
        <div><span>Commercial clarity</span><h2 id="pricing-clarity-title">No hidden configuration. No invented price.</h2><p>GoWorkora does not publish internal platform settings as customer pricing. Approved charges are shown in the relevant transaction flow, while managed services and sprints are quoted against a written scope.</p></div>
        <ul>
          <li><strong>Marketplace</strong><span>Applicable platform and payment treatment is disclosed before commitment.</span></li>
          <li><strong>Custom scopes</strong><span>Roles, coverage, responsibilities, controls and commercial terms are documented together.</span></li>
          <li><strong>Additional charges</strong><span>Taxes and payment-provider processing can vary by transaction and jurisdiction.</span></li>
        </ul>
      </section>

      <section class="pricing-faq" aria-labelledby="pricing-faq-title">
        <header class="pricing-section-heading"><span>Common questions</span><h2 id="pricing-faq-title">Choose with confidence.</h2><p>Practical answers before you start a marketplace or managed engagement.</p></header>
        <div>
          <details open><summary>How do I choose the right engagement model?</summary><p>Choose Marketplace Hiring when you want to select and manage an independent professional directly. Choose Managed Service when you need coordinated staffing and operating support. Choose a sprint when the immediate need is to diagnose and organise one bounded challenge.</p></details>
          <details><summary>Where will I see the applicable costs?</summary><p>Marketplace charges are shown in the relevant protected workflow before a financial commitment. Managed services and sprints receive a written quote after the scope and responsibilities are agreed.</p></details>
          <details><summary>Can I change the engagement approach?</summary><p>Yes, subject to a fresh scope and approval. For example, a client can begin with a bounded sprint and later hire directly or request managed capacity. Existing contracts and financial obligations remain governed by their agreed terms.</p></details>
          <details><summary>Who owns the work and intellectual property?</summary><p>Ownership, licences and confidentiality must be stated in the approved contract or managed-service scope. GoWorkora does not replace those written terms with a generic page promise.</p></details>
          <details><summary>What happens after the agreed work is complete?</summary><p>The parties review deliverables, record the appropriate contract outcome and retain the permitted activity history. Any follow-on work requires a new milestone, contract or written managed scope.</p></details>
        </div>
      </section>

      <section class="pricing-management" aria-labelledby="pricing-management-title">
        <header class="pricing-section-heading"><span>How engagements are managed</span><h2 id="pricing-management-title">Clear ownership at every level.</h2></header>
        <ol>
          <li><span>01</span><div><strong>Direct marketplace collaboration</strong><p>Clients work directly with the professional they contract and keep hiring and delivery decisions in their authorised workspace.</p></div></li>
          <li><span>02</span><div><strong>Scoped managed support</strong><p>Managed engagements add the agreed coordination, operating cadence and quality review around the approved service.</p></div></li>
          <li><span>03</span><div><strong>Permission-aware records</strong><p>Proposals, messages, files and contracts remain subject to participant permissions and database security policies.</p></div></li>
          <li><span>04</span><div><strong>Continuity only when agreed</strong><p>Backup capacity, handover and continuity arrangements apply only when they are included in the written managed scope.</p></div></li>
        </ol>
      </section>

      <section class="pricing-cta" aria-labelledby="pricing-cta-title">
        <div><span>Ready to decide?</span><h2 id="pricing-cta-title">Start with the work, then choose the right model.</h2><p>Tell GoWorkora what outcome you need. We will point you toward direct hiring or a scoped managed conversation without forcing a one-size-fits-all plan.</p></div>
        <div><a class="btn btn-lime" href="/signup/client" data-route="/signup/client">Start as a client <b aria-hidden="true">↗</b></a><a class="btn btn-light" href="/contact?subject=sales" data-route="/contact?subject=sales">Talk to GoWorkora</a></div>
      </section>
    </div>`,
    [],
    "Compare GoWorkora marketplace hiring, managed service and stabilisation sprint engagement models with clear inclusions and commercial treatment.",
  );
}

function howItWorksPage() {
  const projectCards = OUTSOURCING_PROJECTS.map((project) => {
    const path = `/managed-services?service=${encodeURIComponent(project.slug)}`;
    return `<article class="how-work-project">
      <header><span>${escape(project.code)}</span><small>Outsourcing project</small></header>
      <h3>${escape(project.name)}</h3><p>${escape(project.summary)}</p>
      <ul>${project.examples.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>
      <a href="${escape(path)}" data-route="${escape(path)}">Explore this service <b aria-hidden="true">↗</b></a>
    </article>`;
  }).join("");

  const lifecycleCards = OUTSOURCING_LIFECYCLE.map((phase) => `<article class="how-work-phase">
    <div class="how-work-phase-title"><span>${escape(phase.code)}</span><div><small>Operating phase</small><h3>${escape(phase.name)}</h3><p>${escape(phase.summary)}</p></div></div>
    <section><small>Activities</small><ul>${phase.activities.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></section>
    <section><small>Recorded output</small><p>${escape(phase.output)}</p></section>
  </article>`).join("");

  return routePage(
    "The GoWorkora operating model",
    "Outsourcing that runs like an operation.",
    "From customer service and administration to billing, sales, healthcare support and digital delivery—GoWorkora keeps scope, people, communication and review connected.",
    `<div class="how-work-page">
      <section class="how-work-foundation" aria-labelledby="how-work-foundation-title">
        <header class="how-work-section-heading"><span>A system for professional work</span><h2 id="how-work-foundation-title">Clear work. Suitable people. Visible decisions.</h2><p>Outsourcing works best when a business requirement becomes an operating workflow—not an informal handoff to an unknown individual.</p></header>
        <div>
          <article><span>01</span><strong>Define the outcome</strong><p>Capture the queue, task, customer or business result, along with systems, decision owners and limits.</p></article>
          <article><span>02</span><strong>Select against one brief</strong><p>Compare professionals, proposals or a managed team against the same responsibilities and evidence.</p></article>
          <article><span>03</span><strong>Review the operation</strong><p>Keep work records, quality observations, exceptions and approvals connected to the engagement.</p></article>
        </div>
      </section>

      <section class="how-work-projects" aria-labelledby="how-work-projects-title">
        <header class="how-work-section-heading"><span>Beyond software projects</span><h2 id="how-work-projects-title">Build the function your business needs.</h2><p>Use the marketplace for direct professional hiring or request a managed scope when the work needs coordinated staffing, operating design or quality support.</p></header>
        <div class="how-work-project-grid">${projectCards}</div>
      </section>

      <section class="how-work-engagements" aria-labelledby="how-work-engagements-title">
        <header class="how-work-section-heading"><span>Ways to work</span><h2 id="how-work-engagements-title">Choose the right level of operating support.</h2><p>The engagement model changes who coordinates selection, onboarding and workflow management. Responsibilities remain explicit in every path.</p></header>
        <div>
          <article>
            <header><span>01</span><small>Client-led</small></header><h3>Direct marketplace hire</h3><p>Publish a job or find talent, compare private proposals, contract a professional and manage the working relationship directly.</p>
            <ul><li>Client owns selection and daily direction</li><li>Professional delivers against the agreed contract</li><li>GoWorkora provides the structured marketplace workflow</li></ul>
            <a href="/how-it-works/clients" data-route="/how-it-works/clients">See the client journey <b aria-hidden="true">→</b></a>
          </article>
          <article class="is-featured">
            <header><span>02</span><small>Shared setup</small></header><h3>Dedicated remote team</h3><p>Combine approved professionals into stable role-based capacity with agreed coverage, communication and review routines.</p>
            <ul><li>Requirement and role design support</li><li>Curated professional review</li><li>Onboarding and operating cadence where scoped</li></ul>
            <a href="/managed-services" data-route="/managed-services">Explore managed teams <b aria-hidden="true">→</b></a>
          </article>
          <article>
            <header><span>03</span><small>Managed operation</small></header><h3>Managed function</h3><p>Add documented workflows, coordination, quality review and service reporting around an approved business function.</p>
            <ul><li>Defined service ownership and boundaries</li><li>Quality and exception-management rhythm</li><li>Continuity planning only where agreed in writing</li></ul>
            <a href="/pricing" data-route="/pricing">Compare engagement models <b aria-hidden="true">→</b></a>
          </article>
        </div>
      </section>

      <section class="how-work-lifecycle" aria-labelledby="how-work-lifecycle-title">
        <header class="how-work-section-heading"><span>Delivery lifecycle</span><h2 id="how-work-lifecycle-title">From business need to accountable operation.</h2><p>The same lifecycle can support a call-centre queue, an administrative team, billing follow-up, sales operations or a technical delivery scope.</p></header>
        <div>${lifecycleCards}</div>
      </section>

      <section class="how-work-visibility" aria-labelledby="how-work-visibility-title">
        <header><span>Communication & reporting</span><h2 id="how-work-visibility-title">Visibility without constant chasing.</h2><p>The exact reporting cadence is agreed per scope. These controls keep important work and decisions findable.</p></header>
        <div>
          <article><span>01</span><div><strong>Work visibility</strong><p>Use agreed queues, milestones, diary records or reporting inputs that suit the operation.</p></div></article>
          <article><span>02</span><div><strong>Quality observations</strong><p>Record samples, exceptions, corrections and coaching themes against approved criteria.</p></div></article>
          <article><span>03</span><div><strong>Decision record</strong><p>Keep material scope changes, approvals and handoff decisions connected to the engagement.</p></div></article>
          <article><span>04</span><div><strong>Access & escalation</strong><p>Document who can use each system, who approves changes and where sensitive issues escalate.</p></div></article>
        </div>
      </section>

      <section class="how-work-quality" aria-labelledby="how-work-quality-title">
        <header class="how-work-section-heading"><span>Quality & acceptance</span><h2 id="how-work-quality-title">Quality starts before the first task.</h2><p>Criteria depend on the work. A support queue, billing process and software release should not be measured by the same generic checklist.</p></header>
        <div class="how-work-quality-list">
          <article><span>01</span><strong>Approved instructions</strong><p>The client confirms responsibilities, permitted actions and escalation boundaries.</p></article>
          <article><span>02</span><strong>Access readiness</strong><p>Systems and data are limited to what the role needs and provided through approved controls.</p></article>
          <article><span>03</span><strong>Sample calibration</strong><p>Representative work is reviewed early so expectations can be corrected before volume increases.</p></article>
          <article><span>04</span><strong>Quality review</strong><p>Outputs, calls, records or deliverables are sampled against the agreed operational criteria.</p></article>
          <article><span>05</span><strong>Client acceptance</strong><p>Approval, revision or escalation follows the applicable contract or managed-service workflow.</p></article>
        </div>
        <aside class="how-work-definition"><div><span>Definition of acceptable work</span><h3>Agree what “done” means for this operation.</h3><p>Quality is only useful when both sides can observe it. Final criteria belong in the contract, work instructions or written managed scope.</p></div><ul><li>Required output or customer outcome</li><li>Accuracy and review criteria</li><li>Permitted systems and actions</li><li>Exception and approval route</li></ul></aside>
      </section>

      <section class="how-work-continuity" aria-labelledby="how-work-continuity-title">
        <header class="how-work-section-heading"><span>Controlled continuity</span><h2 id="how-work-continuity-title">Knowledge should stay with the operation.</h2><p>Continuity measures apply only where they are part of the approved scope, but every engagement benefits from clearer records and handoffs.</p></header>
        <div>
          <article><span>01</span><h3>Documented workflows</h3><p>Capture approved instructions, decision boundaries and recurring operating steps instead of relying on memory.</p></article>
          <article><span>02</span><h3>Role-aware coverage</h3><p>Where scoped, plan backup capacity and cross-training without granting unnecessary access.</p></article>
          <article><span>03</span><h3>Complete handover</h3><p>Return client materials, document current state and close or transfer access through the agreed process.</p></article>
        </div>
      </section>

      <section class="how-work-cta" aria-labelledby="how-work-cta-title">
        <div><span>Start with a real requirement</span><h2 id="how-work-cta-title">Tell us what the operation needs to achieve.</h2><p>Hire one professional directly or discuss a managed team for a larger function. GoWorkora will keep the next step connected to the right workflow.</p></div>
        <div class="how-work-cta-actions"><a class="btn btn-lime" href="/signup/client?returnTo=/app/jobs/new" data-route="/signup/client?returnTo=/app/jobs/new">Post a job <b aria-hidden="true">↗</b></a><a class="btn btn-light" href="/contact?subject=managed-services" data-route="/contact?subject=managed-services">Request managed support</a></div>
      </section>
    </div>`,
    [],
    "Learn how GoWorkora scopes, selects, onboards, manages and reviews outsourced customer service, administration, billing, sales, healthcare, data and digital work.",
  );
}

const CLIENT_JOURNEY_STEPS = [
  {
    title: "Shape the requirement",
    label: "Brief",
    copy: "Define the outcome, deliverables, skills, engagement model, budget, timing and decision owner before the opportunity goes live.",
    control: "Drafts remain private until an authorised client publishes them.",
  },
  {
    title: "Prepare the company",
    label: "Verify",
    copy: "Complete the client and company context that helps professionals understand who they may be working with.",
    control: "Public company information is shown only when database policy permits it.",
  },
  {
    title: "Discover the right fit",
    label: "Search",
    copy: "Search public talent, review relevant evidence and invite suitable professionals to a specific opportunity.",
    control: "Private notes and internal hiring decisions stay with the client team.",
  },
  {
    title: "Compare consistently",
    label: "Review",
    copy: "Evaluate proposals against the same scope, experience, availability and communication criteria before shortlisting.",
    control: "Proposal content is visible only to authorised participants.",
  },
  {
    title: "Contract the work",
    label: "Agree",
    copy: "Connect the accepted proposal to a contract, milestones, responsibilities and the communication record.",
    control: "Role checks and server-side workflow rules protect contract transitions.",
  },
  {
    title: "Review and close",
    label: "Deliver",
    copy: "Review milestone submissions, request specific changes, approve completed work and preserve an accountable history.",
    control: "Payment state and work approval remain distinct, auditable events.",
  },
];

function publicDataCount(result, excluded = 0) {
  const count = Number(result?.count);
  if (Number.isFinite(count)) return Math.max(0, count - excluded);
  return Math.max(0, (result?.data || []).length - excluded);
}

function isDemoOpportunity(job) {
  return Boolean(job?.is_demo) || /^demo(?:\s+opportunity)?(?:\s*[—–:-]|\b)/i.test(String(job?.title || "").trim());
}

function clientJourneyUnavailable() {
  return {
    jobs: { items: [], count: 0, error: true },
    companies: { items: [], count: 0, error: true },
    talent: { items: [], count: 0, categories: [], error: true },
  };
}

async function loadClientJourneyData(supabase) {
  if (!supabase) return clientJourneyUnavailable();
  try {
    const [jobsResult, companiesResult, talentResult] = await Promise.all([
      supabase
        .from("jobs")
        .select("id,company_id,title,slug,category,experience_level,engagement_type,budget_min_minor,budget_max_minor,hourly_min_minor,hourly_max_minor,currency,estimated_duration,weekly_hours,location_type,published_at,application_deadline,is_demo", { count: "exact" })
        .eq("status", "published")
        .eq("visibility", "public")
        .eq("moderation_status", "visible")
        .eq("is_demo", false)
        .not("title", "ilike", "Demo Opportunity%")
        .order("published_at", { ascending: false })
        .limit(6),
      supabase
        .from("companies")
        .select("id,name,slug,industry,company_size,country_code,verification_status,is_demo", { count: "exact" })
        .eq("verification_status", "verified")
        .eq("is_demo", false)
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("freelancer_public_profiles")
        .select("user_id,primary_category,availability_status,is_demo", { count: "exact" })
        .eq("is_demo", false)
        .order("primary_category", { ascending: true })
        .limit(200),
    ]);

    const rawJobs = jobsResult.error ? [] : jobsResult.data || [];
    const jobs = rawJobs.filter((job) => !isDemoOpportunity(job));
    const rawCompanies = companiesResult.error ? [] : companiesResult.data || [];
    const companies = rawCompanies.filter((company) => !company.is_demo && company.verification_status === "verified");
    const rawTalent = talentResult.error ? [] : talentResult.data || [];
    const talent = rawTalent.filter((profile) => !profile.is_demo);
    const categoryMap = new Map();
    for (const profile of talent) {
      const category = String(profile.primary_category || "Other professional services").trim() || "Other professional services";
      const current = categoryMap.get(category) || { name: category, count: 0, available: 0 };
      current.count += 1;
      if (profile.availability_status === "available") current.available += 1;
      categoryMap.set(category, current);
    }

    return {
      jobs: {
        items: jobs,
        count: publicDataCount(jobsResult, rawJobs.length - jobs.length),
        error: Boolean(jobsResult.error),
      },
      companies: {
        items: companies,
        count: publicDataCount(companiesResult, rawCompanies.length - companies.length),
        error: Boolean(companiesResult.error),
      },
      talent: {
        items: talent,
        count: publicDataCount(talentResult, rawTalent.length - talent.length),
        categories: [...categoryMap.values()].sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name)),
        error: Boolean(talentResult.error),
      },
    };
  } catch {
    return clientJourneyUnavailable();
  }
}

function readableLabel(value) {
  return String(value || "Not specified")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clientJobCompensation(job) {
  const hourly = job.engagement_type === "hourly";
  const minimumValue = hourly ? job.hourly_min_minor : job.budget_min_minor;
  const maximumValue = hourly ? job.hourly_max_minor : job.budget_max_minor;
  if (minimumValue == null && maximumValue == null) return "Terms in brief";
  const minimum = formatMoney(minimumValue ?? maximumValue, job.currency || "USD");
  const maximum = formatMoney(maximumValue ?? minimumValue, job.currency || "USD");
  const range = minimum === maximum ? minimum : `${minimum} – ${maximum}`;
  return hourly ? `${range}/hr` : range;
}

function clientDisplayDate(value) {
  if (!value) return "Open date";
  try {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return "Date in brief";
  }
}

function clientMetric({ value, label, detail, error = false }) {
  return `<article class="cj-metric${error ? " is-unavailable" : ""}"><strong>${error ? "—" : escape(value)}</strong><span>${escape(label)}</span><small>${escape(detail)}</small></article>`;
}

function clientJobsMarkup(data) {
  if (data.error) return `<div class="cj-data-state is-error"><span>Live data unavailable</span><h3>Published opportunities could not be loaded.</h3><p>The public database request failed without exposing private job or proposal information.</p><a href="/find-work" data-route="/find-work">Open the opportunity board <b aria-hidden="true">↗</b></a></div>`;
  if (!data.items.length) return `<div class="cj-data-state"><span>Current public status</span><h3>No genuine client briefs are live yet.</h3><p>Demo-labelled opportunities are excluded from this page. An authorised client can create a private draft and publish the first genuine brief when it is ready.</p><a href="/signup/client?returnTo=/app/jobs/new" data-route="/signup/client?returnTo=/app/jobs/new">Prepare the first live brief <b aria-hidden="true">→</b></a></div>`;
  return `<div class="cj-job-list">${data.items.map((job) => `<a class="cj-job" href="/jobs/${escape(job.slug)}" data-route="/jobs/${escape(job.slug)}">
    <header><span>${escape(job.category || "Professional services")}</span><small>Published ${escape(clientDisplayDate(job.published_at))}</small></header>
    <h3>${escape(job.title)}</h3>
    <div class="cj-job-tags"><span>${escape(readableLabel(job.engagement_type))}</span><span>${escape(readableLabel(job.experience_level))}</span><span>${escape(readableLabel(job.location_type || "remote"))}</span></div>
    <div class="cj-job-footer"><strong>${escape(clientJobCompensation(job))}</strong><span>Review brief <b aria-hidden="true">↗</b></span></div>
  </a>`).join("")}</div>`;
}

function clientCompaniesMarkup(data) {
  if (data.error) return `<div class="cj-directory-state"><span>Directory unavailable</span><p>Verified public company profiles could not be loaded.</p></div>`;
  if (!data.items.length) return `<div class="cj-directory-state"><span>Public directory status</span><p>No verified, non-demo company profile is public yet. Company details will appear here only after verification and public database permission.</p></div>`;
  return `<div class="cj-company-list">${data.items.map((company) => `<article><span aria-hidden="true">${escape(String(company.name || "G").slice(0, 2).toUpperCase())}</span><div><strong>${escape(company.name)}</strong><small>${escape([company.industry, company.company_size, company.country_code].filter(Boolean).join(" · ") || "Verified public organisation")}</small></div><b>Verified</b></article>`).join("")}</div>`;
}

function clientTalentMarkup(data) {
  if (data.error) return `<div class="cj-data-state is-error"><span>Live data unavailable</span><h3>Public talent signals could not be loaded.</h3><p>Try the protected talent marketplace again shortly.</p><a href="/find-talent" data-route="/find-talent">Open Find Talent <b aria-hidden="true">↗</b></a></div>`;
  if (!data.categories.length) return `<div class="cj-data-state"><span>Current public status</span><h3>The public talent directory is ready for its first profile.</h3><p>Freelancers appear only after completing the required marketplace profile state.</p><a href="/find-talent" data-route="/find-talent">Open Find Talent <b aria-hidden="true">↗</b></a></div>`;
  return `<div class="cj-talent-categories">${data.categories.map((category, index) => {
    const path = `/find-talent?category=${encodeURIComponent(category.name)}`;
    return `<a href="${escape(path)}" data-route="${escape(path)}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escape(category.name)}</strong><small>${category.count} public profile${category.count === 1 ? "" : "s"}${category.available ? ` · ${category.available} available` : ""}</small></div><b aria-hidden="true">→</b></a>`;
  }).join("")}</div>`;
}

function clientJourneyPage(data) {
  const metrics = [
    clientMetric({ value: data.talent.count, label: "Public professionals", detail: "Non-demo marketplace profiles", error: data.talent.error }),
    clientMetric({ value: data.talent.categories.length, label: "Talent categories", detail: "Represented by current profiles", error: data.talent.error }),
    clientMetric({ value: data.jobs.count, label: "Live client briefs", detail: "Published, visible and non-demo", error: data.jobs.error }),
    clientMetric({ value: data.companies.count, label: "Verified organisations", detail: "Public non-demo company profiles", error: data.companies.error }),
  ].join("");
  const steps = CLIENT_JOURNEY_STEPS.map((step, index) => `<li>
    <div class="cj-step-head"><span>${String(index + 1).padStart(2, "0")}</span><small>${escape(step.label)}</small></div>
    <h3>${escape(step.title)}</h3><p>${escape(step.copy)}</p><div class="cj-step-control"><i aria-hidden="true"></i><span>${escape(step.control)}</span></div>
  </li>`).join("");

  return routePage(
    "For clients · Live marketplace",
    "Build the brief. Choose the right fit. Keep delivery accountable.",
    "A professional client journey for moving from a defined business need to reviewed work—with public marketplace signals drawn from the current GoWorkora database.",
    `<div class="client-journey-page">
      <section class="cj-pulse" aria-labelledby="client-marketplace-pulse-title">
        <header><div class="cj-live-label"><i aria-hidden="true"></i><span>Live public marketplace</span></div><h2 id="client-marketplace-pulse-title">Real signals. No demo inflation.</h2><p>These figures are loaded from public rows permitted by GoWorkora's database policies. Demo-tagged profiles and demo-labelled opportunities are excluded.</p></header>
        <div class="cj-metrics">${metrics}</div>
        <div class="cj-pulse-note"><span>Private proposals, messages, client contacts and internal company records are never queried here.</span><a href="/find-talent" data-route="/find-talent">Explore public talent <b aria-hidden="true">↗</b></a></div>
      </section>

      <section class="cj-journey" aria-labelledby="client-journey-title">
        <header class="cj-section-heading"><span>One connected workflow</span><h2 id="client-journey-title">From requirement to accepted outcome.</h2><p>Each stage creates the context needed for the next decision. The result is a cleaner hiring process and a usable record of what was agreed.</p></header>
        <ol class="cj-step-grid">${steps}</ol>
      </section>

      <section class="cj-market" aria-labelledby="client-market-title">
        <header class="cj-section-heading"><span>Current marketplace</span><h2 id="client-market-title">See what is genuinely available today.</h2><p>Live sections update from public database state. Empty states remain explicit so a presentation never confuses demonstration records with real client activity.</p></header>
        <div class="cj-market-grid">
          <article class="cj-talent-panel"><header><span>Talent signal</span><strong>${data.talent.error ? "Public profiles" : `${data.talent.count} public professional${data.talent.count === 1 ? "" : "s"}`}</strong></header>${clientTalentMarkup(data.talent)}</article>
          <article class="cj-jobs-panel"><header><span>Client activity</span><strong>${data.jobs.error ? "Published briefs" : `${data.jobs.count} genuine live brief${data.jobs.count === 1 ? "" : "s"}`}</strong></header>${clientJobsMarkup(data.jobs)}</article>
        </div>
        <section class="cj-company-directory"><header><div><span>Verified organisation directory</span><h3>Public company context, only when verified.</h3></div><small>${data.companies.error ? "Status unavailable" : `${data.companies.count} public verified profile${data.companies.count === 1 ? "" : "s"}`}</small></header>${clientCompaniesMarkup(data.companies)}</section>
      </section>

      <section class="cj-decisions" aria-labelledby="client-decisions-title">
        <header class="cj-section-heading"><span>Decision quality</span><h2 id="client-decisions-title">A workspace designed around accountable choices.</h2></header>
        <div>
          <article><span>01</span><h3>Comparable evidence</h3><p>Keep the scope, screening questions, proposal terms and portfolio evidence connected to the same opportunity.</p></article>
          <article><span>02</span><h3>Permission-aware communication</h3><p>Message professionals through eligible invitations, proposals or contracts instead of opening uncontrolled contact.</p></article>
          <article><span>03</span><h3>Reviewable delivery</h3><p>Connect milestones, submissions, revision requests and approvals to the engagement that created them.</p></article>
          <article><span>04</span><h3>Recorded outcomes</h3><p>Preserve contract activity and eligible reviews so future decisions can rely on genuine marketplace history.</p></article>
        </div>
      </section>

      <section class="cj-assurance" aria-labelledby="client-assurance-title">
        <div><span>Trust is operational</span><h2 id="client-assurance-title">The platform supports the workflow. The client still owns the decision.</h2><p>GoWorkora provides structured records, role-aware access and controlled state changes. Clients remain responsible for lawful scope, accurate requirements, timely review and any industry-specific verification.</p><a href="/trust-and-safety" data-route="/trust-and-safety">Review trust and safety <b aria-hidden="true">↗</b></a></div>
        <ul><li><strong>Private by default</strong><span>Drafts, proposals and conversations follow participant permissions.</span></li><li><strong>Clear approvals</strong><span>Contract, milestone and payment states are not collapsed into one ambiguous action.</span></li><li><strong>Honest public data</strong><span>This page excludes known demo data and never invents adoption metrics.</span></li></ul>
      </section>
    </div>`,
    [["Find talent", "/find-talent"], ["Post a job", "/signup/client?returnTo=/app/jobs/new"], ["Explore managed services", "/managed-services"], ["Contact sales", "/contact?subject=sales"]],
    "Learn how clients use GoWorkora to define work, discover professionals, review proposals, contract delivery and approve outcomes with live public marketplace context.",
  );
}

async function loadCategories(supabase) {
  if (!supabase) return { items: [], error: true };
  const [skills, jobs] = await Promise.all([
    supabase.from("skills").select("name,slug,category").eq("is_active", true).order("category"),
    supabase.from("jobs").select("category").eq("status", "published").eq("visibility", "public").is("moderation_hidden_at", null),
  ]);
  // Categories remain useful when one optional marketplace source is unavailable
  // (for example, while an additive moderation migration is still being applied).
  // RLS remains the source of truth for every row returned by either query.
  if (skills.error && jobs.error) return { items: [], error: true };
  const groups = new Map();
  for (const skill of skills.error ? [] : skills.data || []) {
    const name = skill.category || "Other";
    const current = groups.get(name) || { name, slug: slugify(name), skills: [], jobs: 0 };
    current.skills.push(skill.name);
    groups.set(name, current);
  }
  for (const job of jobs.error ? [] : jobs.data || []) {
    const name = job.category || "Other";
    const current = groups.get(name) || { name, slug: slugify(name), skills: [], jobs: 0 };
    current.jobs += 1;
    groups.set(name, current);
  }
  return { items: [...groups.values()], error: false, partial: Boolean(skills.error || jobs.error) };
}

function contactForm(search = "") {
  const query = new URLSearchParams(search);
  const requested = query.get("subject") || "other";
  const selected = ENQUIRIES.some(([value]) => value === requested) ? requested : requested === "accessibility" ? "support" : "other";
  const service = MANAGED_SERVICES.find((item) => item.slug === query.get("service"));
  const engagement = MANAGED_ENGAGEMENTS.find((item) => item.slug === query.get("engagement"));
  const managedContext = [service?.name, engagement?.name].filter(Boolean);
  const subjectValue = selected === "managed-services"
    ? `Managed services enquiry${managedContext.length ? ` — ${managedContext.join(" · ")}` : ""}`
    : "";
  const options = ENQUIRIES.map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${escape(label)}</option>`).join("");
  return `<form id="public-contact-form" class="public-form" novalidate>
    ${managedContext.length ? `<div class="public-form-context"><small>Managed service context</small><strong>${escape(managedContext.join(" · "))}</strong><span>You can adjust the subject and add the operational detail below.</span></div>` : ""}
    <div class="public-form-grid">
      <label>Name *<input name="name" autocomplete="name" required></label>
      <label>Email *<input name="email" type="email" autocomplete="email" required></label>
      <label>Account type<select name="accountType"><option value="visitor">Not registered</option><option value="client">Client</option><option value="freelancer">Freelancer</option><option value="company">Company representative</option></select></label>
      <label>Company <small>(optional)</small><input name="company" autocomplete="organization"></label>
      <label>Enquiry type *<select name="enquiryType">${options}</select></label>
      <label>Preferred contact<select name="preferredContact"><option value="email">Email</option><option value="phone">Phone</option></select></label>
      <label>Phone <small>(optional)</small><input name="phone" type="tel" autocomplete="tel"></label>
      <label class="public-honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
    </div>
    <label>Subject *<input name="subject" value="${escape(subjectValue)}" minlength="5" required></label>
    <label>Message *<textarea name="message" rows="7" minlength="20" placeholder="Tell us about the work, team size, coverage, systems and preferred start date." required></textarea></label>
    <label class="public-consent"><input name="consent" type="checkbox" required><span>I understand GoWorkora will process this information to respond, as described in the <a href="/privacy" data-route="/privacy">Privacy Notice</a>.</span></label>
    <p id="public-contact-status" class="public-form-status" aria-live="polite"></p>
    <button class="btn btn-dark" type="submit">Send enquiry</button>
    <p class="public-note">Do not include passwords, verification codes, payment credentials or sensitive identity documents.</p>
  </form>`;
}

function articlePage(article) {
  return routePage(article.category, article.title, article.description,
    `<article class="public-article"><p class="public-meta">By ${escape(article.author)} · Published ${escape(article.published)} · ${article.minutes} min read</p>${sections(article.sections)}<button type="button" class="btn btn-outline" data-copy-url>Copy article link</button></article>`,
    [["All guides", "/blog"]],
  );
}

function helpArticlePage(article) {
  return routePage(article.category, article.title, article.description,
    `<article class="public-article"><p class="public-meta">Updated ${escape(article.updated)}</p><ul>${article.items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul><section class="public-helpful" data-help-article="${escape(article.slug)}"><h2>Was this helpful?</h2><div><button class="btn btn-outline" type="button" data-helpful="true">Yes</button><button class="btn btn-outline" type="button" data-helpful="false">No</button></div><p aria-live="polite"></p></section></article>`,
    [["Contact support", "/contact?subject=support"], ["Help Centre", "/help"]],
  );
}

export async function publicPageContent(match, { supabase } = {}) {
  const path = match.pathname;
  if (path === "/managed-services") return managedServicesPage(match.search);
  if (path === "/how-it-works") return howItWorksPage();
  if (path === "/how-it-works/clients") return clientJourneyPage(await loadClientJourneyData(supabase));
  if (path === "/pricing") return pricingPage();
  if (STATIC_CONTENT[path]) {
    const [eyebrow, title, intro, itemSections, actions] = STATIC_CONTENT[path];
    return routePage(eyebrow, title, intro, sections(itemSections), actions);
  }
  if (path === "/categories" || match.path === "/categories/:categorySlug") {
    const loaded = await loadCategories(supabase);
    if (match.params.categorySlug) {
      if (loaded.error) return routePage("Marketplace unavailable", "Categories could not be loaded.", "The public database request failed without exposing private information.", `<div class="public-state"><p>Try again later or browse the marketplace directly.</p></div>`, [["Find talent", "/find-talent"], ["Find work", "/find-work"]]);
      const selected = loaded.items.find((item) => item.slug === match.params.categorySlug);
      if (!selected) return { notFound: true };
      return routePage("Professional category", selected.name, `${selected.jobs} public job${selected.jobs === 1 ? "" : "s"} currently use this category.`, `${sections([["Related skills", selected.skills.join(", ") || "No active skills are assigned yet."], ["Marketplace availability", "Counts reflect current public jobs. Public talent results are loaded through the privacy-protected talent search."]])}`, [["Find relevant talent", `/find-talent?category=${encodeURIComponent(selected.name)}`], ["Find relevant work", `/find-work?category=${encodeURIComponent(selected.name)}`]]);
    }
    const content = loaded.error
      ? `<div class="public-state"><h2>Categories could not be loaded</h2><p>The public database request failed. Try again later or browse all talent and jobs.</p></div>`
      : loaded.items.length
        ? cards(loaded.items.map((item) => ({ eyebrow: `${item.jobs} public jobs`, title: item.name, copy: item.skills.slice(0, 4).join(" · ") || "Active marketplace category", path: `/categories/${item.slug}` })))
        : `<div class="public-state"><h2>No active categories yet</h2><p>Browse all marketplace listings while categories are being prepared.</p></div>`;
    return routePage("Browse by capability", "Professional categories for focused discovery.", "Active categories and counts come from current marketplace data.", content, [["Find talent", "/find-talent"], ["Find work", "/find-work"]]);
  }
  if (path === "/industries" || match.path === "/industries/:industrySlug") {
    if (match.params.industrySlug) {
      const industry = INDUSTRIES.find((item) => item.slug === match.params.industrySlug);
      if (!industry) return { notFound: true };
      return routePage("Industry guide", `${industry.name} support`, industry.summary, sections([
        ["Common hiring needs", industry.needs.join(", ")],
        ["Relevant capabilities", industry.skills.join(", ")],
        ["Managed option", "A managed-services enquiry can describe headcount, timezone, security and performance requirements for a scoped response."],
        ["Important limitation", "Industry relevance does not establish a certification, licence or regulatory compliance status."],
      ]), [["Find talent", `/find-talent?q=${encodeURIComponent(industry.name)}`], ["Find work", `/find-work?q=${encodeURIComponent(industry.name)}`], ["Discuss managed support", `/contact?subject=managed-services&industry=${industry.slug}`]]);
    }
    return routePage("Industry context", "Professional support for different operating environments.", "Controlled industry guides describe common needs without inventing marketplace counts or compliance claims.", cards(INDUSTRIES.map((industry) => ({ title: industry.name, copy: industry.summary, path: `/industries/${industry.slug}` }))));
  }
  if (path === "/blog" || match.path === "/blog/:articleSlug") {
    if (match.params.articleSlug) {
      const article = BLOG_ARTICLES.find((item) => item.slug === match.params.articleSlug);
      return article ? articlePage(article) : { notFound: true };
    }
    return routePage("GoWorkora guides", "Work with more clarity.", "Approved, repository-managed guidance for scoping, hiring and delivering professional remote work.", `<label class="public-search">Search guides<input type="search" data-filter-cards placeholder="Search by topic"></label>${cards(BLOG_ARTICLES.map((article) => ({ eyebrow: `${article.category} · ${article.minutes} min`, title: article.title, copy: article.description, path: `/blog/${article.slug}` })))}`);
  }
  if (path === "/help" || match.path === "/help/:articleSlug") {
    if (match.params.articleSlug) {
      const article = HELP_ARTICLES.find((item) => item.slug === match.params.articleSlug);
      return article ? helpArticlePage(article) : { notFound: true };
    }
    return routePage("Help Centre", "Find the right next step.", "Current guidance for accounts, hiring, work, contracts, payments, managed services and safety.", `<label class="public-search">Search help<input type="search" data-filter-cards placeholder="Search Help Centre"></label>${cards(HELP_ARTICLES.map((article) => ({ eyebrow: article.category, title: article.title, copy: article.description, path: `/help/${article.slug}` })))}`, [["Contact support", "/contact?subject=support"]]);
  }
  if (path === "/contact") return routePage("Contact GoWorkora", "Send your enquiry to the right team.", "Use this validated form for hiring, freelancing, managed services, support, safety, partnership or media enquiries.", contactForm(match.search));
  if (LEGAL[path]) {
    const [title, itemSections] = LEGAL[path];
    return routePage("Draft for legal review", `GoWorkora ${title}`, "This structured draft reflects current platform architecture but is not represented as lawyer-approved.", `<div class="public-legal-note"><strong>Legal review required</strong><p>Jurisdiction, company identity, formal notice details, retention periods and liability language must be approved before production launch.</p></div>${sections(itemSections)}`, [["Contact GoWorkora", "/contact?subject=other"]]);
  }
  return null;
}

function setFormStatus(form, message, isError = false) {
  const status = form.querySelector("#public-contact-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

export function bindPublicPageActions({ root, supabase }) {
  root.classList.toggle("route-client-journey", Boolean(root.querySelector(".client-journey-page")));
  root.classList.toggle("route-pricing-engagements", Boolean(root.querySelector(".pricing-engagement-page")));
  root.classList.toggle("route-how-work", Boolean(root.querySelector(".how-work-page")));
  root.querySelector("[data-copy-url]")?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(location.href);
  });
  const filter = root.querySelector("[data-filter-cards]");
  filter?.addEventListener("input", () => {
    const query = filter.value.trim().toLowerCase();
    root.querySelectorAll(".public-card").forEach((card) => {
      card.hidden = Boolean(query && !card.textContent.toLowerCase().includes(query));
    });
  });
  const managedTabs = [...root.querySelectorAll("[data-managed-service-tab]")];
  root.classList.toggle("route-managed-services", managedTabs.length > 0);
  if (managedTabs.length) {
    const activateManagedService = (target, moveFocus = false) => {
      managedTabs.forEach((tab) => {
        const selected = tab === target;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        const panel = root.querySelector(`[data-managed-service-panel="${tab.dataset.managedServiceTab}"]`);
        if (panel) panel.hidden = !selected;
      });
      if (moveFocus) target.focus();
    };
    managedTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateManagedService(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % managedTabs.length;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + managedTabs.length) % managedTabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = managedTabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activateManagedService(managedTabs[nextIndex], true);
      });
    });
  }
  root.querySelectorAll("[data-helpful]").forEach((button) => button.addEventListener("click", async () => {
    const box = button.closest("[data-help-article]");
    const output = box.querySelector("p");
    box.querySelectorAll("button").forEach((item) => { item.disabled = true; });
    output.textContent = "Saving feedback…";
    const { error } = await supabase.functions.invoke("public-page-actions", { body: { action: "help-feedback", articleSlug: box.dataset.helpArticle, helpful: button.dataset.helpful === "true" } });
    output.textContent = error ? "Feedback could not be saved. Please try again." : "Thank you. Your feedback was recorded.";
    if (error) box.querySelectorAll("button").forEach((item) => { item.disabled = false; });
  }));
  const form = root.querySelector("#public-contact-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.consent = new FormData(form).get("consent") === "on";
    if (!data.name?.trim() || !/^\S+@\S+\.\S+$/.test(data.email || "") || (data.subject || "").trim().length < 5 || (data.message || "").trim().length < 20 || !data.consent) {
      setFormStatus(form, "Complete the required fields, use a valid email and provide at least 20 characters of detail.", true);
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setFormStatus(form, "Sending securely…");
    const { data: response, error } = await supabase.functions.invoke("public-page-actions", { body: { action: "contact", ...data } });
    if (error || !response?.reference) {
      setFormStatus(form, response?.message || "Your enquiry could not be sent. Please wait and try again.", true);
      submit.disabled = false;
      return;
    }
    form.innerHTML = `<div class="public-state" role="status"><h2>Enquiry received</h2><p>Keep this reference: <strong>${escape(response.reference)}</strong></p><p>A confirmation is sent when transactional email is configured.</p></div>`;
  });
}

export function updatePublicMetadata(page, match, browserDestination) {
  if (!page) return;
  const title = `${page.title} | GoWorkora`;
  document.title = title;
  const set = (selector, attribute, value) => {
    let element = document.querySelector(selector);
    if (!element) {
      element = document.createElement(selector.startsWith("link") ? "link" : "meta");
      if (selector.includes("canonical")) element.setAttribute("rel", "canonical");
      else if (selector.includes("property=")) element.setAttribute("property", selector.match(/property="([^"]+)/)[1]);
      else element.setAttribute("name", selector.match(/name="([^"]+)/)[1]);
      document.head.append(element);
    }
    element.setAttribute(attribute, value);
  };
  set('meta[name="description"]', "content", page.description || page.intro);
  set('meta[property="og:title"]', "content", title);
  set('meta[property="og:description"]', "content", page.description || page.intro);
  set('link[rel="canonical"]', "href", new URL(browserDestination(match.pathname), location.origin).href);
}
