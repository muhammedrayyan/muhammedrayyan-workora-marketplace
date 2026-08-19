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

const STATIC_CONTENT = {
  "/how-it-works": ["How GoWorkora works", "From the right introduction to a finished result.", "Choose the path that matches your role.", [
    ["For clients", "Create a verified account, complete a business profile, publish a job or browse talent, review proposals, hire, manage milestones, approve work and leave an eligible review."],
    ["For freelancers", "Create a verified profile, show relevant evidence, discover work, submit proposals, deliver through contracts and build a record of completed work."],
    ["Managed alternative", "Clients who need recruitment and ongoing workforce support can request a scoped managed-service conversation."],
  ], [["How it works for clients", "/how-it-works/clients"], ["How it works for freelancers", "/how-it-works/freelancers"], ["Managed services", "/managed-services"]]],
  "/how-it-works/clients": ["For clients", "Hire with context, not guesswork.", "A structured client journey from requirement to completed engagement.", [
    ["Prepare", "Verify your account, complete your business profile and define a job with clear outcomes, required skills, location rules, timing and budget."],
    ["Evaluate", "Search public talent, invite eligible freelancers and compare private proposals against consistent criteria."],
    ["Deliver", "Hire through the atomic acceptance workflow, manage contract milestones, communicate, review submissions and request revisions when needed."],
    ["Approve and review", "Approve agreed work, rely on verified payment state and leave a review only after an eligible completed contract."],
    ["Responsibilities and limits", "Clients remain responsible for lawful scope, timely feedback, accurate requirements and verifying any regulatory obligations."],
  ], [["Find talent", "/find-talent"], ["Post a job", "/signup/client?returnTo=/app/jobs/new"], ["Explore managed services", "/managed-services"], ["Contact sales", "/contact?subject=sales"]]],
  "/how-it-works/freelancers": ["For freelancers", "Build a credible profile and do focused work.", "A transparent path from verification to professional delivery.", [
    ["Build your profile", "Verify your email, add a professional summary, skills, rate, availability and only portfolio work you may publish."],
    ["Find opportunities", "Search public jobs, respond to valid invitations and submit one active proposal for an eligible job."],
    ["Deliver professionally", "Use the contract workspace, messages and milestone submissions to keep work and decisions connected."],
    ["Earnings and reputation", "Complete Stripe test or live onboarding when enabled, monitor verified payment states and build reputation through eligible reviews."],
    ["Account safety", "Keep one-time codes private, avoid external payment requests and report suspicious behaviour."],
  ], [["Create freelancer account", "/signup/freelancer"], ["Browse jobs", "/find-work"], ["Freelancer help", "/help/freelancer-getting-started"]]],
  "/managed-services": ["Managed services", "Build remote capacity with more support.", "GoWorkora can help scope, recruit and support remote professional roles when marketplace discovery alone is not enough.", [
    ["Who it is for", "Organisations seeking a curated shortlist, recruitment coordination, onboarding assistance or optional ongoing workforce support."],
    ["How it works", "Describe the role and outcomes, review a scoped proposal, interview suitable candidates and agree written ownership and performance checkpoints."],
    ["Available capabilities", "Requests may include healthcare administration, IT support, customer service, sales, operations and administrative roles, subject to availability."],
    ["Security and compliance", "Security and regulatory requirements are assessed for each scope. GoWorkora does not claim a certification or legal guarantee without written verification."],
    ["Pricing", "Managed services use a custom quote based on role, region, hours and support level."],
  ], [["Request managed talent", "/contact?subject=managed-services"], ["How it works", "/how-it-works/clients"]]],
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
  const requested = new URLSearchParams(search).get("subject") || "other";
  const selected = ENQUIRIES.some(([value]) => value === requested) ? requested : requested === "accessibility" ? "support" : "other";
  const options = ENQUIRIES.map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${escape(label)}</option>`).join("");
  return `<form id="public-contact-form" class="public-form" novalidate>
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
    <label>Subject *<input name="subject" minlength="5" required></label>
    <label>Message *<textarea name="message" rows="7" minlength="20" required></textarea></label>
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
  if (STATIC_CONTENT[path]) {
    const [eyebrow, title, intro, itemSections, actions] = STATIC_CONTENT[path];
    return routePage(eyebrow, title, intro, sections(itemSections), actions);
  }
  if (path === "/pricing") {
    const result = supabase ? await supabase.from("platform_settings").select("key,value,description").eq("is_public", true) : { data: [], error: true };
    const configured = !result.error && result.data?.length
      ? cards(result.data.map((setting) => ({ eyebrow: "Configured platform setting", title: setting.description || setting.key, copy: typeof setting.value === "object" ? JSON.stringify(setting.value) : String(setting.value) })))
      : `<div class="public-state"><h2>Commercial settings are not published yet</h2><p>GoWorkora will show fees and supported currencies here when approved configuration is available. No irreversible pricing has been invented.</p></div>`;
    return routePage("Transparent by design", "Know the terms before you commit.", "Marketplace fees and managed-service pricing must come from approved configuration.", `${configured}${sections([
      ["Clients", "Job posting, platform and payment-processing treatment will be shown before a financial commitment."],
      ["Freelancers", "Applicable platform fees, proposal rules and payout information will be shown before acceptance or release."],
      ["Managed services", "Managed staffing uses a scoped custom quote based on role, region, hours and support level."],
      ["Important", "Taxes and payment-provider processing may vary. GoWorkora does not describe funds as escrow without legal and operational approval."],
    ])}`, [["Start as a client", "/signup/client"], ["Start as a freelancer", "/signup/freelancer"], ["Contact sales", "/contact?subject=sales"]]);
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
