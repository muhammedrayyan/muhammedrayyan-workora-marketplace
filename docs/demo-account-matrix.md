# GoWorkora demo account matrix

Passwords and account email aliases are deliberately excluded. After seeding, they are available only in the ignored `demo-credentials.local.json` file.

| Account | Trusted role | Status | Company or profile | Dashboard | Intended verification |
|---|---|---|---|---|---|
| Demo Client Owner | Client | Active, complete | Owner of all three fictional demo companies | `/app/client` | Company management, jobs, proposals, invitations, saved talent, hiring, contracts, milestones, messages, test-mode financial records, reviews, disputes, support |
| Demo Client Team Member | Client | Active, complete | Recruiter at Northstar Digital Labs | `/app/client` | Delegated recruiter actions only; owner-only actions must fail |
| Demo Freelancer Professional | Freelancer | Active, complete/public | Full-Stack Developer | `/app/freelancer` | Discovery, saves, proposals, invitation response, active hourly work, 20 diary entries, two active client conversations, eight downloadable financial statements, reviews, disputes, settings and support |
| Demo Freelancer Secondary | Freelancer | Active, complete/public | IT Support Specialist | `/app/freelancer` | Cross-user isolation, accepted proposal, completed contract, test payment history and reviews |
| Demo Frontend Specialist | Freelancer | Active, complete/public | Frontend Developer | `/app/freelancer` | Search/filter and pending invitation states |
| Demo Product Designer | Freelancer | Active, complete/public | UI/UX Designer | `/app/freelancer` | Viewed/rejected proposal states and private portfolio protection |
| Demo Quality Engineer | Freelancer | Active, complete/public | QA Engineer | `/app/freelancer` | Submitted proposal, QA category and file access |
| Demo Operations Assistant | Freelancer | Active, complete/public | Virtual Assistant | `/app/freelancer` | Withdrawn proposal and managed-service job discovery |
| Demo Support Specialist | Freelancer | Active, complete/public | Customer Support Specialist | `/app/freelancer` | Shortlisted proposal and e-commerce category |
| Demo Healthcare Administrator | Freelancer | Active, complete/public | Healthcare Administrator | `/app/freelancer` | Invitation-only visibility and healthcare-administration disclaimer |
| Demo Platform Administrator | Admin | Active | Trusted admin profile created through the service-only seeding function | `/app/admin` | Admin dashboard, moderation, reports, disputes, support, platform settings, financial-event inspection and audit history |
| Demo Suspended User | Freelancer | Suspended | Restricted fictional profile | `/app/restricted` | Restricted page, blocked marketplace writes, support/appeal and logout |
| Demo Incomplete Onboarding User | Freelancer | Pending, incomplete | Incomplete profile | `/app/onboarding` | Forced onboarding, saved progress, no full dashboard access |

## Public/anonymous checklist

- Open the homepage, public navigation, legal, contact and help pages without a session.
- Public discovery shows only complete public profiles and permitted published jobs.
- Every public demo profile/job has a `Demo` badge.
- Every public demo job states: “Demonstration opportunity — not a genuine paid job.”
- Protected routes redirect to login without revealing private resource existence.

## Client owner checklist

- Can open own company, jobs, proposal lists, saved talent, contracts, messages and payments.
- Can create a new draft without changing the deterministic fixtures.
- Can view the fictional in-app notifications without triggering email.
- Cannot alter demo markers in browser writes.

## Client team member checklist

- Can see only the Northstar company context granted to the recruiter role.
- Can perform recruiter actions supported by current database policy.
- Cannot transfer ownership, alter platform settings, grant admin status, or access unrelated client data.

## Freelancer checklist

- Primary and secondary freelancers see only their own proposals/saves/private profile fields.
- The primary freelancer can review twenty manual diary entries and eight successful transaction statements without any live payment movement.
- The healthcare-administration and frontend-development conversations remain visible only to their members.
- Only invited users can view the invitation-only job.
- Contract participants can access their own messages and generated placeholder deliverables.
- An unrelated freelancer receives a denied/not-found-safe response.

## Administrator checklist

- Trusted role resolves from `public.profiles`, never from a URL or ordinary browser-editable field.
- Demo reports, dispute, support request, audit action and test financial records appear.
- Genuine metrics exclude demo rows.
- No secret, password, full payment method, or bank detail is shown.

## Suspended/incomplete checklist

- Suspended user is routed to `/app/restricted`; blocked marketplace actions fail at policy/function level.
- Incomplete user is routed to `/app/onboarding`; direct dashboard navigation does not bypass completion.

## Cross-account denial checklist

Use different browser profiles or isolated sessions:

1. Client member cannot edit a job outside their authorized company.
2. Freelancer Professional cannot update Freelancer Secondary's profile.
3. Freelancer Professional cannot read Freelancer Secondary's private proposal.
4. An unrelated user cannot read a contract or its financial rows.
5. A non-member cannot read or send messages in a conversation.
6. A private deliverable path cannot be used to obtain a signed URL.
7. A normal user cannot grant themselves admin access.
8. A normal user cannot clear or change the demo marker.

Record actual HTTP/database errors without copying tokens or secrets into the test report.
