import {
  formatTalentRate,
  talentFiltersFromQuery,
  talentRpcArgs,
} from "../features/talent/workflow.js";
import { formatMoney } from "../features/jobs/workflow.js";
import { safePublicDisplayName, safePublicProfessionalTitle } from "../shared/public-privacy.js?v=20260811";

let activeRoot = null;
let menuCleanup = null;
let revealCleanup = null;
let interactionCleanup = null;
let renderVersion = 0;
const brandLogoUrl = new URL("../assets/brand/goworkora-wordmark-transparent.png", import.meta.url).href;
const brandMarkUrl = new URL("../assets/brand/goworkora-mark-transparent.png", import.meta.url).href;
const marketplaceImageUrl = new URL("../goworkora-hero-marketplace.jpg", import.meta.url).href;
// Free-to-use collaboration footage by Tiger Lily via Pexels, video 7148578.
const heroVideoUrl = "https://videos.pexels.com/video-files/7148578/7148578-sd_960_540_25fps.mp4";
// Free-to-use collaboration photography by fauxels via Pexels, photo 3184360.
const humanCollaborationImageUrl = "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1600";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const slugify = (value) => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const titleCase = (value) => String(value || "")
  .replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const displayDate = (value) => {
  if (!value) return "Open deadline";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "Date available on job";
  }
};

async function ensurePreviewStyles() {
  const existing = document.querySelector("#kinetic-ember-preview-styles");
  if (existing?.dataset.loaded === "true") return;
  if (existing) {
    await new Promise((resolve) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", resolve, { once: true });
    });
    return;
  }
  const link = document.createElement("link");
  link.id = "kinetic-ember-preview-styles";
  link.rel = "stylesheet";
  link.href = new URL("../styles/pages/homepage-preview.css?v=readability-v9-20260729", import.meta.url).href;
  document.head.append(link);
  await new Promise((resolve) => {
    link.addEventListener("load", () => {
      link.dataset.loaded = "true";
      resolve();
    }, { once: true });
    link.addEventListener("error", () => {
      link.dataset.loaded = "true";
      resolve();
    }, { once: true });
  });
}

function routeLink(path, label, className = "") {
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(path)}" data-route="${escapeHtml(path)}">${escapeHtml(label)}</a>`;
}

function brandMarkup() {
  return `<img class="ke-brand-logo" src="${escapeHtml(brandLogoUrl)}" alt="GoWorkora">`;
}

function brandLink(className = "") {
  return `<a class="ke-brand ${escapeHtml(className)}" href="/" data-route="/" aria-label="GoWorkora home">${brandMarkup()}</a>`;
}

function brandMarkMarkup() {
  return `<img src="${escapeHtml(brandMarkUrl)}" alt="" aria-hidden="true">`;
}

function previewHeader({ user, role, authReady }) {
  const dashboardDestination = role === "admin"
    ? "/app/admin"
    : role === "freelancer"
      ? "/app/freelancer"
      : role === "client"
        ? "/app/client"
        : "/app/access-denied";
  const accountActions = !authReady
    ? `<button class="ke-nav-status" type="button" disabled>Checking session…</button>`
    : user
      ? `${routeLink(dashboardDestination, "Dashboard", "ke-button ke-button-coral ke-button-small")}<button class="ke-button ke-button-ghost ke-button-small" type="button" data-ke-signout>Sign out</button>`
      : `${routeLink("/login", "Log In", "ke-nav-login")}${routeLink("/signup", "Sign Up", "ke-button ke-button-coral ke-button-small")}`;
  return `<header class="ke-header">
    <div class="ke-shell ke-header-inner">
      ${brandLink("ke-brand-dark")}
      <nav class="ke-desktop-nav" aria-label="Primary navigation">
        ${routeLink("/find-talent", "Find Talent")}
        ${routeLink("/find-work", "Find Work")}
        ${routeLink("/how-it-works", "How It Works")}
        ${routeLink("/pricing", "Pricing")}
        ${routeLink("/managed-services", "Managed Services")}
      </nav>
      <div class="ke-header-actions">${accountActions}<button class="ke-menu-trigger" type="button" aria-expanded="false" aria-controls="ke-mobile-menu" aria-label="Open menu"><span></span><span></span></button></div>
    </div>
    <div class="ke-mobile-backdrop" data-ke-menu-backdrop hidden></div>
    <nav class="ke-mobile-menu" id="ke-mobile-menu" aria-label="Mobile primary navigation" hidden>
      <div class="ke-mobile-menu-head">${brandLink("ke-brand-light")}<button type="button" data-ke-menu-close aria-label="Close menu">×</button></div>
      ${routeLink("/find-talent", "Find Talent")}
      ${routeLink("/find-work", "Find Work")}
      ${routeLink("/how-it-works", "How It Works")}
      ${routeLink("/pricing", "Pricing")}
      ${routeLink("/managed-services", "Managed Services")}
      <div class="ke-mobile-account">${accountActions}</div>
    </nav>
  </header>`;
}

function previewHero() {
  const heroVideo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? ""
    : `<video class="ke-hero-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true" tabindex="-1" data-footage-source="Pexels video 7148578">
        <source src="${escapeHtml(heroVideoUrl)}" type="video/mp4">
      </video>`;
  return `<section class="ke-hero" aria-labelledby="ke-hero-title">
    <div class="ke-shell">
      <div class="ke-hero-grid">
        <div class="ke-hero-copy">
          <p class="ke-eyebrow"><span aria-hidden="true"></span>The professional marketplace for modern work</p>
          <h1 id="ke-hero-title">Find the right talent.<br><em>Move work forward.</em><i aria-hidden="true"></i></h1>
          <p class="ke-hero-lede">Connect with skilled professionals or build a managed remote team through one focused, transparent marketplace.</p>
          <form class="ke-market-search" data-ke-market-search>
            <div class="ke-search-tabs" role="tablist" aria-label="Choose what to search">
              <button class="active" type="button" role="tab" aria-selected="true" data-ke-search-mode="talent">I want to hire</button>
              <button type="button" role="tab" aria-selected="false" data-ke-search-mode="jobs">I want to work</button>
            </div>
            <label for="ke-hero-query">What do you need help with?</label>
            <div class="ke-search-control">
              <span aria-hidden="true">⌕</span>
              <input id="ke-hero-query" name="q" type="search" autocomplete="off" placeholder="Search by skill, role or keyword">
              <a class="ke-search-submit" href="/find-talent" data-route="/find-talent" data-ke-search-submit aria-label="Search talent">Search</a>
            </div>
          </form>
          <div class="ke-popular-searches" aria-label="Popular searches">
            <span>Popular:</span>
            ${routeLink("/find-talent?q=customer%20support", "Customer support")}
            ${routeLink("/find-talent?q=web%20development", "Web development")}
            ${routeLink("/find-talent?q=virtual%20assistant", "Virtual assistance")}
          </div>
          <div class="ke-hero-actions">
            ${routeLink("/find-talent", "Browse Talent", "ke-button ke-button-coral")}
            ${routeLink("/find-work", "Browse Jobs", "ke-button ke-button-violet")}
            ${routeLink("/managed-services", "Explore Managed Services", "ke-text-link")}
          </div>
        </div>
        <div class="ke-hero-media" aria-label="Illustrative GoWorkora marketplace workflow from a business requirement to approved work" data-preview-content="fictional">
          ${heroVideo}
          <div class="ke-hero-media-scrim" aria-hidden="true"></div>
          <div class="ke-media-controls">
            <p class="ke-media-label"><span aria-hidden="true"></span>Remote collaboration in progress</p>
            <button class="ke-scene-toggle" type="button" data-ke-scene-toggle aria-pressed="false"><span aria-hidden="true">Ⅱ</span> Pause scene</button>
          </div>
          <div class="ke-marketplace-story">
            <button class="ke-story-card ke-story-brief is-active" type="button" data-ke-story-card data-step="0" data-title="A clear brief starts the relationship" data-copy="Share the outcome, working style and context that will help a professional understand the real need." aria-pressed="true">
              <small>Business need</small>
              <strong>Healthcare operations support</strong>
              <span>Remote · Contract</span>
            </button>
            <button class="ke-story-card ke-story-match" type="button" data-ke-story-card data-step="1" data-title="Relevant people come into focus" data-copy="Compare public skills, availability and experience without losing the person behind the profile." aria-pressed="false">
              <small>Talent discovery</small>
              <strong>3 professional profiles matched</strong>
              <span>Skills and availability aligned</span>
            </button>
            <button class="ke-story-card ke-story-profile" type="button" data-ke-story-card data-step="2" data-title="A profile becomes a conversation" data-copy="Open the profile, understand the professional’s approach and decide whether the working relationship feels right." aria-pressed="false">
              <span class="ke-story-avatar" aria-hidden="true">HO</span>
              <div><small>Professional profile</small><strong>Healthcare Operations Specialist</strong><span>Scheduling · Insurance · Operations</span></div>
              <b><i aria-hidden="true"></i>Available</b>
            </button>
            <button class="ke-story-card ke-story-success" type="button" data-ke-story-card data-step="3" data-title="Progress stays visible" data-copy="Clear milestones and thoughtful communication help both sides understand what has moved forward." aria-pressed="false">
              <span aria-hidden="true">✓</span>
              <div><small>Collaboration and success</small><strong>Milestone approved</strong><span>Work reviewed and ready for the next outcome.</span></div>
            </button>
          </div>
          <div class="ke-story-live" aria-live="polite">
            <div><span>Marketplace workflow · <b data-ke-story-counter>01 / 04</b></span><strong data-ke-story-title>A clear brief starts the relationship</strong></div>
            <p data-ke-story-copy>Share the outcome, working style and context that will help a professional understand the real need.</p>
            <span class="ke-story-progress" aria-hidden="true"><i data-ke-story-progress></i></span>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

const VALUE_ITEMS = [
  ["01", "Professional Talent", "Find skilled professionals across multiple industries."],
  ["02", "Flexible Hiring", "Hire freelancers or build a more managed remote team."],
  ["03", "Transparent Collaboration", "Keep communication, contracts and structured workflows connected."],
  ["04", "Global Opportunities", "Connect businesses and professionals across locations."],
];

function valueSection() {
  return `<section class="ke-section ke-value-section" aria-labelledby="ke-value-title">
    <div class="ke-shell">
      <div class="ke-section-heading"><div><span class="ke-momentum" aria-hidden="true"><i></i></span><p class="ke-kicker">Why GoWorkora</p><h2 id="ke-value-title">Everything you need to move from idea to done.</h2></div><p>Discover professionals, agree on the work and keep every important next step clear in one marketplace.</p></div>
      <div class="ke-value-grid">${VALUE_ITEMS.map(([number, title, copy]) => `<article class="ke-value-card"><span>${number}</span><div class="ke-geo-icon" aria-hidden="true"><i></i></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></article>`).join("")}</div>
    </div>
  </section>`;
}

function humanSection() {
  return `<section class="ke-section ke-human-section" aria-labelledby="ke-human-title">
    <div class="ke-shell">
      <div class="ke-human-frame" data-ke-reveal>
        <figure class="ke-human-photo">
          <img src="${escapeHtml(humanCollaborationImageUrl)}" alt="Professionals gathered around a table sharing ideas" loading="lazy" decoding="async">
          <div class="ke-human-note"><span aria-hidden="true">✦</span><strong>Better work happens together.</strong></div>
          <figcaption><span>People first, process second.</span><a href="https://www.pexels.com/photo/group-of-people-gathered-around-wooden-table-3184360/" target="_blank" rel="noopener noreferrer">Photo by fauxels · Pexels</a></figcaption>
        </figure>
        <div class="ke-human-copy">
          <p class="ke-kicker">The human side of work</p>
          <h2 id="ke-human-title">Good work starts with a real conversation.</h2>
          <p class="ke-human-lede">Behind every brief is a person trying to move something forward. Behind every profile is a professional building a career. GoWorkora helps them meet with clarity.</p>
          <div class="ke-human-perspectives" role="group" aria-label="Choose your GoWorkora perspective">
            <button class="is-active" type="button" aria-pressed="true" data-ke-human-perspective="business" data-prompt="What outcome would make this project meaningful?"><span>For businesses</span><strong>Bring the ambition.</strong><p>Share the outcome, the context and what a great working relationship looks like.</p></button>
            <button type="button" aria-pressed="false" data-ke-human-perspective="professional" data-prompt="What kind of work brings out your best thinking?"><span>For professionals</span><strong>Bring the craft.</strong><p>Show how you think, what you do well and the kind of work where you can thrive.</p></button>
          </div>
          <div class="ke-human-prompt" aria-live="polite"><span><i aria-hidden="true"></i> Conversation starter</span><strong data-ke-human-prompt>What outcome would make this project meaningful?</strong></div>
          <div class="ke-human-actions">
            ${routeLink("/find-talent", "Meet professionals", "ke-human-primary")}
            ${routeLink("/find-work", "Find meaningful work", "ke-human-secondary")}
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function sectionState(title, copy, actions = "") {
  return `<div class="ke-state"><span aria-hidden="true">↗</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p>${actions}</div>`;
}

const CATEGORY_OUTCOMES = {
  "software-development": ["Build Digital Products", "Developers, engineers and technical specialists."],
  "design-and-creative": ["Design Standout Experiences", "Designers and creative professionals shaping clear customer experiences."],
  "customer-support": ["Scale Customer Experience", "Support specialists who help customers succeed."],
  "quality-assurance": ["Ship with Confidence", "Quality specialists improving reliability across every release."],
  "virtual-assistance": ["Grow Operations", "Professionals managing daily workflows and priorities."],
  "admin-support": ["Run Smarter Operations", "Administrative specialists keeping work organised and moving."],
};

function categoryPresentation(category) {
  return CATEGORY_OUTCOMES[category.slug] || [
    `Advance ${category.name}`,
    "Explore professionals and published opportunities in this field.",
  ];
}

function categoryCard(category, index) {
  const count = Number(category.jobs || 0);
  const [outcome, description] = categoryPresentation(category);
  const skills = [...new Set(category.skills || [])].slice(0, 4);
  return `<a class="ke-category-card${index < 2 ? " ke-forward-cut" : ""}" href="/categories/${escapeHtml(category.slug)}" data-route="/categories/${escapeHtml(category.slug)}" data-ke-reveal style="--ke-delay:${Math.min(index * 70, 350)}ms">
    <div class="ke-category-icon" aria-hidden="true">${String(index + 1).padStart(2, "0")}</div>
    <div class="ke-category-copy"><span class="ke-category-label">${escapeHtml(category.name)}</span><h3>${escapeHtml(outcome)}</h3><p>${escapeHtml(description)}</p></div>
    <div class="ke-category-skills" aria-label="Example skills">${skills.length ? skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("") : "<span>Explore relevant skills</span>"}</div>
    <footer><span>${count ? `${count} public ${count === 1 ? "job" : "jobs"}` : "Marketplace category"}</span><b>Explore marketplace <i aria-hidden="true">↗</i></b></footer>
  </a>`;
}

function categoriesSection(data) {
  let content;
  if (data.loading) content = `<div class="ke-category-grid ke-skeleton-grid" aria-label="Loading categories">${Array.from({ length: 6 }, () => "<span></span>").join("")}</div>`;
  else if (data.error) content = sectionState("Categories are temporarily unavailable", "GoWorkora could not load public category data. No private information was requested.", routeLink("/categories", "Open categories", "ke-button ke-button-violet"));
  else if (!data.items.length) content = sectionState("No active categories yet", "Active marketplace categories will appear here as soon as they are available.", routeLink("/categories", "Explore categories", "ke-button ke-button-violet"));
  else content = `<div class="ke-category-grid">${data.items.slice(0, 6).map(categoryCard).join("")}</div>`;
  return `<section class="ke-section ke-categories-section" aria-labelledby="ke-categories-title"><div class="ke-shell">
    <div class="ke-category-stage">
      <div class="ke-category-intro" data-ke-reveal>
        <p class="ke-kicker">Explore the marketplace</p>
        <h2 id="ke-categories-title">Find talent for every kind of work.</h2>
        <p>Start with the outcome you need. Explore professional disciplines, compare relevant skills and move directly into talent discovery.</p>
        ${routeLink("/categories", "Open the talent directory", "ke-category-directory-action")}
      </div>
      <figure class="ke-category-media" data-ke-reveal style="--ke-delay:120ms">
        <img src="${escapeHtml(marketplaceImageUrl)}" alt="Illustration of professional profile cards in a talent marketplace" loading="lazy" decoding="async">
        <figcaption><span>Explore by outcome</span><strong>From specialist skills to business results.</strong><small>Illustrative marketplace view</small></figcaption>
      </figure>
    </div>
    ${content}
  </div></section>`;
}

function talentCard(person, index) {
  const name = safePublicDisplayName(person.display_name);
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const skills = Array.isArray(person.skill_names) ? person.skill_names.slice(0, 3) : [];
  const publicDetails = skills.length
    ? skills
    : ["Profile skills available"];
  const experience = person.experience_level ? titleCase(person.experience_level) : "Professional";
  const location = person.public_location || "Location private";
  const timezone = person.timezone || "Timezone available in profile";
  return `<a class="ke-talent-card ke-forward-cut" href="/find-talent/${escapeHtml(person.profile_slug)}" data-route="/find-talent/${escapeHtml(person.profile_slug)}" data-ke-reveal style="--ke-delay:${Math.min(index * 90, 270)}ms">
    <header><span class="ke-talent-number">${person.is_demo ? "Demo profile" : `Featured profile ${String(index + 1).padStart(2, "0")}`}</span>${person.availability_status ? `<span class="ke-availability"><i></i>${escapeHtml(titleCase(person.availability_status))}</span>` : ""}</header>
    <div class="ke-talent-identity"><span class="ke-talent-avatar">${person.avatar_url ? `<img src="${escapeHtml(person.avatar_url)}" alt="" loading="lazy" decoding="async">` : escapeHtml(initials)}</span><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(safePublicProfessionalTitle(person.professional_title, "Professional freelancer"))}</p></div></div>
    <div class="ke-talent-skills">${publicDetails.map((detail) => `<span>${escapeHtml(detail)}</span>`).join("")}</div>
    <div class="ke-talent-meta"><span><small>Experience</small><strong>${escapeHtml(experience)}</strong></span><span><small>Location</small><strong>${escapeHtml(location)}</strong></span><span><small>Timezone</small><strong>${escapeHtml(timezone)}</strong></span></div>
    <div class="ke-talent-review"><span>Review the full profile</span><p>Open the public profile to explore the professional summary, portfolio and available experience.</p></div>
    <div class="ke-talent-proof">${Number(person.average_rating) > 0 ? `<span>★ ${Number(person.average_rating).toFixed(1)} genuine rating</span>` : "<span>Public professional profile</span>"}${Number(person.completed_contracts_count) > 0 ? `<span>${Number(person.completed_contracts_count)} completed contracts</span>` : ""}</div>
    ${person.is_demo ? '<p class="ke-demo-profile-copy">Fictional demonstration profile.</p>' : ""}
    <footer><div><small>Hourly rate</small><strong>${escapeHtml(formatTalentRate(person.hourly_rate_minor, person.currency))}</strong></div><span class="ke-talent-action">View Profile <b aria-hidden="true">↗</b></span></footer>
  </a>`;
}

function talentSection(data) {
  let content;
  if (data.loading) content = `<div class="ke-talent-grid ke-skeleton-grid" aria-label="Loading public talent">${Array.from({ length: 4 }, () => "<span></span>").join("")}</div>`;
  else if (data.error) content = sectionState("Public talent could not be loaded", "GoWorkora could not retrieve permitted public profiles. Try the full discovery page.", routeLink("/find-talent", "Find Talent", "ke-button ke-button-coral"));
  else if (!data.items.length) content = sectionState("Be among the first professionals here", "No eligible public freelancer profiles are available right now.", `${routeLink("/signup/freelancer", "Create a freelancer profile", "ke-button ke-button-violet")}${routeLink("/find-talent", "Check talent discovery", "ke-text-link ke-text-link-light")}`);
  else content = `<div class="ke-talent-grid">${data.items.slice(0, 4).map(talentCard).join("")}</div>`;
  return `<section class="ke-section ke-talent-section" aria-labelledby="ke-talent-title"><div class="ke-shell">
    <div class="ke-talent-heading ke-heading-dark" data-ke-reveal><div><span class="ke-momentum" aria-hidden="true"><i></i></span><p class="ke-kicker">Featured talent</p><h2 id="ke-talent-title">Hire professionals with the skills you need.</h2></div><p>Review the public details that matter, compare relevant experience and open the full profile when you are ready to go deeper.</p></div>
    <div class="ke-talent-showcase">
      <aside class="ke-talent-promise" data-ke-reveal>
        <span class="ke-talent-promise-label">Build your shortlist</span>
        <div class="ke-talent-orbit" aria-hidden="true">
          <span class="ke-talent-orbit-node ke-talent-orbit-skills" data-label="Skills"></span>
          <span class="ke-talent-orbit-node ke-talent-orbit-experience" data-label="Experience"></span>
          <span class="ke-talent-orbit-node ke-talent-orbit-availability" data-label="Availability"></span>
          <div class="ke-talent-orbit-core">${brandMarkMarkup()}<small>Talent fit</small></div>
        </div>
        <p class="ke-talent-match-legend" aria-label="Compare skills, experience and availability"><span>Skills</span><i>+</i><span>Experience</span><i>+</i><span>Availability</span></p>
        <h3>Professional profiles, clear next steps.</h3>
        <p>Compare the signals that shape a focused shortlist, then continue into talent search.</p>
        ${routeLink("/find-talent", "Browse all talent", "ke-talent-browse-action")}
      </aside>
      ${content}
    </div>
  </div></section>`;
}

const CLIENT_STEPS = ["Define your needs", "Discover professionals", "Hire confidently", "Complete projects"];
const FREELANCER_STEPS = ["Build your profile", "Find opportunities", "Deliver great work", "Grow your career"];

function processPath(title, intro, steps, path, accent) {
  return `<article class="ke-process-path ke-process-${accent}" data-ke-reveal><header><span>${escapeHtml(title)}</span><p>${escapeHtml(intro)}</p></header><ol>${steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(step)}</strong><i aria-hidden="true">→</i></li>`).join("")}</ol>${routeLink(path, `Explore the ${title.toLowerCase()} path`, `ke-process-action ke-process-action-${accent}`)}</article>`;
}

function processSection() {
  return `<section class="ke-section ke-process-section" aria-labelledby="ke-process-title"><div class="ke-shell">
    <div class="ke-process-heading" data-ke-reveal><p class="ke-kicker">How GoWorkora works</p><h2 id="ke-process-title">A clear path from first search to finished work.</h2><p>Two sides of one professional marketplace, connected by a shared rhythm: define the goal, find the right fit, collaborate and move forward.</p></div>
    <div class="ke-process-journey" aria-label="A connected marketplace journey" data-ke-reveal style="--ke-delay:100ms"><span>Need</span><i aria-hidden="true"></i><span>Match</span><i aria-hidden="true"></i><span>Work</span><i aria-hidden="true"></i><span>Outcome</span></div>
    <div class="ke-process-grid">${processPath("Clients", "From a focused brief to reviewed work.", CLIENT_STEPS, "/how-it-works/clients", "coral")}${processPath("Freelancers", "From a credible profile to professional growth.", FREELANCER_STEPS, "/how-it-works/freelancers", "violet")}</div>
  </div></section>`;
}

function jobCompensation(job) {
  if (job.engagement_type === "hourly") {
    const minimum = formatMoney(job.hourly_min_minor, job.currency);
    const maximum = formatMoney(job.hourly_max_minor ?? job.hourly_min_minor, job.currency);
    return `${minimum} – ${maximum}/hr`;
  }
  const minimum = formatMoney(job.budget_min_minor, job.currency);
  const maximum = formatMoney(job.budget_max_minor ?? job.budget_min_minor, job.currency);
  return `${minimum} – ${maximum}`;
}

function jobCard(job, skillMap, index) {
  const skills = (skillMap[job.id] || []).slice(0, 4);
  const company = job.company_name || "GoWorkora client";
  const location = titleCase(job.location_type || "remote");
  return `<a class="ke-job-card ke-forward-cut" href="/jobs/${escapeHtml(job.slug)}" data-route="/jobs/${escapeHtml(job.slug)}" data-ke-reveal style="--ke-delay:${Math.min(index * 90, 180)}ms">
    <div class="ke-job-index"><span>${String(index + 1).padStart(2, "0")}</span><i aria-hidden="true"></i></div>
    <div class="ke-job-main">
      <header><span>${escapeHtml(titleCase(job.engagement_type))}</span><div><strong class="ke-job-status"><i aria-hidden="true"></i>Open opportunity</strong>${job.is_demo ? '<b class="ke-demo-badge">Demo</b>' : ""}</div></header>
      <h3>${escapeHtml(job.title)}</h3>
      <p class="ke-job-company">${escapeHtml(company)} <i aria-hidden="true"></i> ${escapeHtml(location)}</p>
      ${job.is_demo ? '<p class="ke-demo-copy">Demonstration opportunity — not a genuine paid job.</p>' : ""}
      <div class="ke-job-skills">${skills.length ? skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("") : "<span>Professional skills listed in opportunity</span>"}</div>
    </div>
    <footer><div><small>Budget or rate</small><strong>${escapeHtml(jobCompensation(job))}</strong></div><div><small>Posted</small><span>${escapeHtml(displayDate(job.published_at))}</span></div><div><small>Deadline</small><span>${escapeHtml(displayDate(job.application_deadline))}</span></div><b><span>View Opportunity</span><i aria-hidden="true">↗</i></b></footer>
  </a>`;
}

function jobsSection(data) {
  let content;
  if (data.loading) content = `<div class="ke-job-grid ke-skeleton-grid" aria-label="Loading public jobs">${Array.from({ length: 3 }, () => "<span></span>").join("")}</div>`;
  else if (data.error) content = sectionState("Published jobs could not be loaded", "GoWorkora could not retrieve publicly permitted opportunities.", routeLink("/find-work", "Browse all jobs", "ke-button ke-button-violet"));
  else if (!data.items.length) content = sectionState("The public job board is ready for its first opportunity", "Clients can create a private draft, while freelancers can complete a profile and check back.", `${routeLink("/signup/client?returnTo=/app/jobs/new", "Post the first job", "ke-button ke-button-coral")}${routeLink("/signup/freelancer", "Create a freelancer profile", "ke-button ke-button-violet")}`);
  else content = `<div class="ke-job-grid">${data.items.slice(0, 3).map((job, index) => jobCard(job, data.skillMap, index)).join("")}</div>`;
  return `<section class="ke-section ke-jobs-section" aria-labelledby="ke-jobs-title"><div class="ke-shell">
    <div class="ke-jobs-heading" data-ke-reveal><div><p class="ke-kicker">Featured jobs</p><h2 id="ke-jobs-title">Find work that fits the way you work.</h2></div><div><p>Browse public opportunities with the engagement details, timing and scope visible before you take the next step.</p>${routeLink("/find-work", "Open the opportunity board", "ke-jobs-board-action")}</div></div>
    ${content}
  </div></section>`;
}

function managedSection() {
  const managedVideo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? ""
    : `<video class="ke-managed-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true" tabindex="-1" data-footage-source="Pexels video 7148578"><source src="${escapeHtml(heroVideoUrl)}" type="video/mp4"></video>`;
  return `<section class="ke-managed" aria-labelledby="ke-managed-title"><div class="ke-shell ke-managed-grid" data-ke-reveal>
    <div class="ke-managed-citron"><span class="ke-go-spark" aria-hidden="true"></span><p class="ke-kicker">GoWorkora Managed Services</p><h2 id="ke-managed-title">Need more than a marketplace?</h2><p>Build a more supported remote workforce around clearly defined roles, responsibilities and outcomes.</p>${routeLink("/managed-services", "Design a managed team", "ke-managed-action")}</div>
    <div class="ke-managed-plum">${managedVideo}<div class="ke-managed-scrim" aria-hidden="true"></div><div class="ke-managed-content"><span class="ke-preview-label">Remote collaboration in motion</span><ul><li><i aria-hidden="true"></i><span><strong>Talent sourcing</strong><small>Find professionals aligned to the role.</small></span></li><li><i aria-hidden="true"></i><span><strong>Managed remote professionals</strong><small>Shape a dependable long-term workforce.</small></span></li><li><i aria-hidden="true"></i><span><strong>Workforce support</strong><small>Keep expectations and communication clear.</small></span></li><li><i aria-hidden="true"></i><span><strong>Operational assistance</strong><small>Support coordination around day-to-day delivery.</small></span></li></ul><p class="ke-managed-caption"><i aria-hidden="true"></i> A more supported path from hiring need to ongoing work.</p></div></div>
  </div></section>`;
}

function finalCta() {
  return `<section class="ke-final-cta" aria-labelledby="ke-final-title"><div class="ke-final-glow" aria-hidden="true"></div><div class="ke-shell ke-final-inner"><div class="ke-final-brand">${brandMarkMarkup()}<div><span class="ke-go-spark" aria-hidden="true"></span><h2 id="ke-final-title">Your next great working relationship starts here.</h2><p>Hire skilled professionals or take the next step in your freelance career with GoWorkora.</p></div></div><div class="ke-final-actions"><button class="ke-button ke-button-coral" type="button" data-ke-start-hiring>Start Hiring</button>${routeLink("/signup/freelancer", "Start Freelancing", "ke-button ke-button-violet")}</div></div></section>`;
}

function previewFooter() {
  const group = (title, links) => `<div><h3>${escapeHtml(title)}</h3>${links.map(([label, path]) => routeLink(path, label)).join("")}</div>`;
  return `<footer class="ke-footer"><div class="ke-shell"><div class="ke-footer-main"><div class="ke-footer-brand">${brandLink("ke-brand-light")}<p>Hire Better.<br>Work Smarter.</p></div><div class="ke-footer-links">
    ${group("For Clients", [["Find Talent", "/find-talent"], ["Post a Job", "/signup/client?returnTo=/app/jobs/new"], ["Managed Services", "/managed-services"], ["Pricing", "/pricing"], ["How It Works", "/how-it-works/clients"]])}
    ${group("For Freelancers", [["Find Work", "/find-work"], ["Create Profile", "/signup/freelancer"], ["How It Works", "/how-it-works/freelancers"], ["Freelancer Help", "/help/freelancer-getting-started"], ["Earnings & Payments", "/help/earnings-and-payments"]])}
    ${group("GoWorkora", [["About", "/about"], ["Careers", "/careers"], ["Blog", "/blog"], ["Contact", "/contact"], ["Trust & Safety", "/trust-and-safety"]])}
    ${group("Support", [["Help Centre", "/help"], ["Accessibility", "/accessibility"], ["Report an Issue", "/contact?subject=safety-report"], ["Contact Support", "/contact?subject=support"]])}
    ${group("Legal", [["Terms", "/terms"], ["Privacy", "/privacy"], ["Cookie Policy", "/cookies"]])}
  </div></div><div class="ke-footer-bottom"><span>© 2026 GoWorkora.</span><span>Hire Better. Work Smarter.</span></div></div></footer>`;
}

function initialMarkup(context) {
  return `<div class="ke-preview">
    ${previewHeader(context)}
    <main>${previewHero()}${valueSection()}${humanSection()}${categoriesSection({ loading: true })}${talentSection({ loading: true })}${processSection()}${jobsSection({ loading: true })}${managedSection()}${finalCta()}</main>
    ${previewFooter()}
  </div>`;
}

async function loadPreviewTalent(supabase, role) {
  const filters = talentFiltersFromQuery("");
  if (role === "client" || role === "admin") {
    return supabase.rpc("search_freelancers", talentRpcArgs(filters, { savedOnly: false }));
  }
  return supabase
    .from("freelancer_public_profiles")
    .select("user_id,profile_slug,display_name,public_location,timezone,professional_title,hourly_rate_minor,currency,experience_level,availability_status,average_rating,completed_contracts_count,is_verified,avatar_path")
    .order("average_rating", { ascending: false })
    .limit(12);
}

async function loadPreviewData(supabase, role) {
  const [talentResult, jobsResult, categoryJobsResult, skillsResult] = await Promise.all([
    loadPreviewTalent(supabase, role),
    supabase.from("jobs").select("*").eq("status", "published").eq("visibility", "public").eq("moderation_status", "visible").order("published_at", { ascending: false }).limit(12),
    supabase.from("jobs").select("category").eq("status", "published").eq("visibility", "public").eq("moderation_status", "visible"),
    supabase.from("skills").select("id,name,slug,category").eq("is_active", true).order("category").order("name"),
  ]);
  const jobs = jobsResult.error ? [] : jobsResult.data || [];
  const talent = talentResult.error ? [] : talentResult.data || [];
  const talentWithAvatars = await Promise.all(talent.map(async (person, index) => {
    if (index > 3 || !person.avatar_path) return person;
    const signed = await supabase.storage.from("profile-avatars").createSignedUrl(person.avatar_path, 3600);
    return { ...person, avatar_url: signed.data?.signedUrl || null };
  }));
  const jobLinksResult = jobs.length
    ? await supabase.from("job_skills").select("job_id,skill_id").in("job_id", jobs.map((job) => job.id))
    : { data: [], error: null };
  const skillNames = new Map((skillsResult.data || []).map((skill) => [skill.id, skill.name]));
  const skillMap = {};
  for (const link of jobLinksResult.data || []) {
    skillMap[link.job_id] ||= [];
    skillMap[link.job_id].push(skillNames.get(link.skill_id) || "Professional skill");
  }
  const categoryMap = new Map();
  if (!skillsResult.error) {
    for (const skill of skillsResult.data || []) {
      const name = skill.category || "Other";
      const item = categoryMap.get(name) || { name, slug: slugify(name), skills: [], jobs: 0 };
      item.skills.push(skill.name);
      categoryMap.set(name, item);
    }
  }
  if (!categoryJobsResult.error) {
    for (const job of categoryJobsResult.data || []) {
      const name = job.category || "Other";
      const item = categoryMap.get(name) || { name, slug: slugify(name), skills: [], jobs: 0 };
      item.jobs += 1;
      categoryMap.set(name, item);
    }
  }
  return {
    categories: {
      items: [...categoryMap.values()].sort((a, b) => (b.jobs - a.jobs) || a.name.localeCompare(b.name)),
      error: Boolean(skillsResult.error && categoryJobsResult.error),
    },
    talent: {
      items: talentWithAvatars,
      error: Boolean(talentResult.error),
    },
    jobs: {
      items: jobs,
      skillMap,
      error: Boolean(jobsResult.error || jobLinksResult.error),
    },
  };
}

function bindMenu(root) {
  const trigger = root.querySelector(".ke-menu-trigger");
  const menu = root.querySelector("#ke-mobile-menu");
  const backdrop = root.querySelector("[data-ke-menu-backdrop]");
  const closeButton = root.querySelector("[data-ke-menu-close]");
  let previousFocus = null;
  const close = (restore = true) => {
    menu.hidden = true;
    backdrop.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("ke-menu-open");
    if (restore) previousFocus?.focus();
  };
  const open = () => {
    previousFocus = document.activeElement;
    menu.hidden = false;
    backdrop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-label", "Close menu");
    document.body.classList.add("ke-menu-open");
    closeButton.focus();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape" && !menu.hidden) close();
    if (event.key !== "Tab" || menu.hidden) return;
    const focusable = [...menu.querySelectorAll("a,button")].filter((item) => !item.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  trigger.addEventListener("click", () => menu.hidden ? open() : close());
  closeButton.addEventListener("click", () => close());
  backdrop.addEventListener("click", () => close());
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => close(false)));
  document.addEventListener("keydown", onKeydown);
  return () => {
    document.removeEventListener("keydown", onKeydown);
    close(false);
  };
}

function bindHeroSearch(root) {
  const form = root.querySelector("[data-ke-market-search]");
  const query = root.querySelector("#ke-hero-query");
  const submit = root.querySelector("[data-ke-search-submit]");
  const modeButtons = [...root.querySelectorAll("[data-ke-search-mode]")];
  if (!form || !query || !submit || !modeButtons.length) return () => {};
  let mode = "talent";
  const updateDestination = () => {
    const base = mode === "jobs" ? "/find-work" : "/find-talent";
    const term = query.value.trim();
    const destination = term ? `${base}?q=${encodeURIComponent(term)}` : base;
    submit.href = destination;
    submit.dataset.route = destination;
    submit.setAttribute("aria-label", mode === "jobs" ? "Search jobs" : "Search talent");
  };
  const chooseMode = (nextMode) => {
    mode = nextMode;
    for (const button of modeButtons) {
      const selected = button.dataset.keSearchMode === mode;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    }
    query.placeholder = mode === "jobs"
      ? "Search jobs by skill, title or keyword"
      : "Search talent by skill, role or keyword";
    updateDestination();
  };
  const onModeClick = (event) => chooseMode(event.currentTarget.dataset.keSearchMode);
  const onInput = () => updateDestination();
  const onSubmit = (event) => {
    event.preventDefault();
    updateDestination();
    submit.click();
  };
  for (const button of modeButtons) button.addEventListener("click", onModeClick);
  query.addEventListener("input", onInput);
  form.addEventListener("submit", onSubmit);
  updateDestination();
  return () => {
    for (const button of modeButtons) button.removeEventListener("click", onModeClick);
    query.removeEventListener("input", onInput);
    form.removeEventListener("submit", onSubmit);
  };
}

function bindScrollReveals(root) {
  const items = [...root.querySelectorAll("[data-ke-reveal]")];
  if (!items.length) return () => {};
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
  items.forEach((item) => observer.observe(item));
  return () => observer.disconnect();
}

function bindInteractiveStory(root) {
  const cards = [...root.querySelectorAll("[data-ke-story-card]")];
  const toggle = root.querySelector("[data-ke-scene-toggle]");
  const video = root.querySelector(".ke-hero-video");
  const counter = root.querySelector("[data-ke-story-counter]");
  const title = root.querySelector("[data-ke-story-title]");
  const copy = root.querySelector("[data-ke-story-copy]");
  const progress = root.querySelector("[data-ke-story-progress]");
  const media = root.querySelector(".ke-hero-media");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!cards.length) return () => {};

  let activeIndex = 0;
  let timer = null;
  let userPaused = Boolean(reduceMotion);
  const activate = (nextIndex) => {
    activeIndex = (nextIndex + cards.length) % cards.length;
    cards.forEach((card, index) => {
      const selected = index === activeIndex;
      card.classList.toggle("is-active", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
    const activeCard = cards[activeIndex];
    if (counter) counter.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
    if (title) title.textContent = activeCard.dataset.title || "";
    if (copy) copy.textContent = activeCard.dataset.copy || "";
    if (progress) progress.style.setProperty("--ke-story-progress", `${((activeIndex + 1) / cards.length) * 100}%`);
  };
  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
  };
  const start = () => {
    stop();
    if (userPaused || reduceMotion || media?.contains(document.activeElement) || media?.matches(":hover")) return;
    timer = window.setInterval(() => activate(activeIndex + 1), 4200);
  };
  const updateToggle = () => {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", String(userPaused));
    toggle.innerHTML = userPaused
      ? '<span aria-hidden="true">▶</span> Play scene'
      : '<span aria-hidden="true">Ⅱ</span> Pause scene';
  };
  const cardHandlers = cards.map((card, index) => {
    const onClick = () => {
      activate(index);
      start();
    };
    const onKeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const nextIndex = (index + direction + cards.length) % cards.length;
      activate(nextIndex);
      cards[nextIndex].focus();
      start();
    };
    card.addEventListener("click", onClick);
    card.addEventListener("keydown", onKeydown);
    return { card, onClick, onKeydown };
  });
  const onToggle = () => {
    userPaused = !userPaused;
    if (userPaused) {
      stop();
      video?.pause();
    } else {
      void video?.play().catch(() => {});
      start();
    }
    updateToggle();
  };
  const onEnter = () => stop();
  const onLeave = () => start();
  toggle?.addEventListener("click", onToggle);
  media?.addEventListener("mouseenter", onEnter);
  media?.addEventListener("mouseleave", onLeave);
  media?.addEventListener("focusin", onEnter);
  media?.addEventListener("focusout", onLeave);
  activate(0);
  updateToggle();
  start();
  return () => {
    stop();
    cardHandlers.forEach(({ card, onClick, onKeydown }) => {
      card.removeEventListener("click", onClick);
      card.removeEventListener("keydown", onKeydown);
    });
    toggle?.removeEventListener("click", onToggle);
    media?.removeEventListener("mouseenter", onEnter);
    media?.removeEventListener("mouseleave", onLeave);
    media?.removeEventListener("focusin", onEnter);
    media?.removeEventListener("focusout", onLeave);
  };
}

function bindHumanPerspectives(root) {
  const buttons = [...root.querySelectorAll("[data-ke-human-perspective]")];
  const prompt = root.querySelector("[data-ke-human-prompt]");
  const primary = root.querySelector(".ke-human-primary");
  const secondary = root.querySelector(".ke-human-secondary");
  if (!buttons.length || !prompt) return () => {};
  const handlers = buttons.map((button) => {
    const onClick = () => {
      buttons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      prompt.textContent = button.dataset.prompt || "";
      const businessSelected = button.dataset.keHumanPerspective === "business";
      primary?.classList.toggle("is-emphasized", businessSelected);
      secondary?.classList.toggle("is-emphasized", !businessSelected);
    };
    button.addEventListener("click", onClick);
    return { button, onClick };
  });
  return () => handlers.forEach(({ button, onClick }) => button.removeEventListener("click", onClick));
}

function bindPointerResponse(root) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia?.("(pointer: fine)").matches;
  if (reduceMotion || !finePointer) return () => {};
  const interactiveCards = [...root.querySelectorAll(".ke-value-card, .ke-category-card, .ke-talent-card, .ke-job-card")];
  const responsiveMedia = [...root.querySelectorAll(".ke-hero-media, .ke-human-photo")];
  const cardHandlers = interactiveCards.map((card) => {
    const onMove = (event) => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty("--ke-pointer-x", `${event.clientX - bounds.left}px`);
      card.style.setProperty("--ke-pointer-y", `${event.clientY - bounds.top}px`);
    };
    card.addEventListener("pointermove", onMove);
    return { card, onMove };
  });
  const mediaHandlers = responsiveMedia.map((item) => {
    const onMove = (event) => {
      const bounds = item.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      item.style.setProperty("--ke-parallax-x", `${x * 7}px`);
      item.style.setProperty("--ke-parallax-y", `${y * 7}px`);
    };
    const onLeave = () => {
      item.style.setProperty("--ke-parallax-x", "0px");
      item.style.setProperty("--ke-parallax-y", "0px");
    };
    item.addEventListener("pointermove", onMove);
    item.addEventListener("pointerleave", onLeave);
    return { item, onMove, onLeave };
  });
  return () => {
    cardHandlers.forEach(({ card, onMove }) => card.removeEventListener("pointermove", onMove));
    mediaHandlers.forEach(({ item, onMove, onLeave }) => {
      item.removeEventListener("pointermove", onMove);
      item.removeEventListener("pointerleave", onLeave);
    });
  };
}

function refreshScrollReveals(root) {
  revealCleanup?.();
  revealCleanup = bindScrollReveals(root);
}

function refreshInteractiveElements(root) {
  interactionCleanup?.();
  const cleanupStory = bindInteractiveStory(root);
  const cleanupPerspectives = bindHumanPerspectives(root);
  const cleanupPointer = bindPointerResponse(root);
  interactionCleanup = () => {
    cleanupStory();
    cleanupPerspectives();
    cleanupPointer();
  };
}

function bindPreviewActions(root, { onSignOut, onStartHiring }) {
  root.querySelectorAll("[data-ke-signout]").forEach((button) => button.addEventListener("click", () => void onSignOut()));
  root.querySelector("[data-ke-start-hiring]")?.addEventListener("click", onStartHiring);
  const cleanupMenu = bindMenu(root);
  const cleanupSearch = bindHeroSearch(root);
  refreshScrollReveals(root);
  refreshInteractiveElements(root);
  menuCleanup = () => {
    cleanupSearch();
    cleanupMenu();
  };
}

export async function renderHomepagePreview({
  root,
  supabase,
  user,
  role,
  authReady,
  onSignOut,
  onStartHiring,
  onBindRoutes,
}) {
  const version = ++renderVersion;
  activeRoot = root;
  await ensurePreviewStyles();
  if (activeRoot !== root || version !== renderVersion) return;
  root.innerHTML = initialMarkup({ user, role, authReady });
  bindPreviewActions(root, { onSignOut, onStartHiring });
  onBindRoutes(root);
  void loadPreviewData(supabase, role).then((data) => {
    if (activeRoot !== root || version !== renderVersion) return;
    root.querySelector(".ke-categories-section").outerHTML = categoriesSection(data.categories);
    root.querySelector(".ke-talent-section").outerHTML = talentSection(data.talent);
    root.querySelector(".ke-jobs-section").outerHTML = jobsSection(data.jobs);
    onBindRoutes(root);
    refreshScrollReveals(root);
    refreshInteractiveElements(root);
  }).catch(() => {
    if (activeRoot !== root || version !== renderVersion) return;
    root.querySelector(".ke-categories-section").outerHTML = categoriesSection({ items: [], error: true });
    root.querySelector(".ke-talent-section").outerHTML = talentSection({ items: [], error: true });
    root.querySelector(".ke-jobs-section").outerHTML = jobsSection({ items: [], skillMap: {}, error: true });
    onBindRoutes(root);
    refreshScrollReveals(root);
    refreshInteractiveElements(root);
  });
}

export function unmountHomepagePreview() {
  renderVersion += 1;
  menuCleanup?.();
  menuCleanup = null;
  interactionCleanup?.();
  interactionCleanup = null;
  revealCleanup?.();
  revealCleanup = null;
  if (activeRoot) activeRoot.innerHTML = "";
  activeRoot = null;
  document.body.classList.remove("ke-menu-open");
}
