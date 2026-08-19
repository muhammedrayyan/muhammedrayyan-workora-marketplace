# GoWorkora design system

**System name:** Forward Signal
**Status:** Foundation approved for isolated implementation; application pages not yet migrated.

## 1. Core principles

Every screen must answer:

1. What is this?
2. What can I do here?
3. What is my next action?

The interface must be precise, balanced, accessible and operationally honest. It must not imply verification, guarantees, financial protection or compliance that the product does not provide.

## 2. Design tokens

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `--gw-color-black` | `#111318` | Header, sidebar, hero, footer, dark button |
| `--gw-color-gold` | `#FFB000` | Primary action, selected state, progress |
| `--gw-color-gold-hover` | `#E69D00` | Primary-action hover |
| `--gw-color-white` | `#FFFFFF` | Cards, forms and content surfaces |
| `--gw-color-cloud` | `#F7F8FA` | Page and section background |
| `--gw-color-gray-100` | `#ECEEF2` | Subtle divider and disabled surface |
| `--gw-color-gray-200` | `#D9DDE5` | Standard border |
| `--gw-color-text-primary` | `#111318` | Primary text |
| `--gw-color-text-secondary` | `#4B5563` | Supporting text |
| `--gw-color-text-muted` | `#6B7280` | Metadata |
| `--gw-color-success` | `#16A34A` | Confirmed success and availability |
| `--gw-color-warning` | `#D97706` | Attention and pending risk |
| `--gw-color-error` | `#DC2626` | Failure and destructive action |
| `--gw-color-info` | `#2563EB` | Informational state |

### Colour rules

- Gold backgrounds use Go Black text.
- Gold is not used for body text on white.
- Gold does not represent errors, warnings or success.
- Dark surfaces use white primary text and gray secondary text.
- Semantic colours require text or icon reinforcement; colour alone is insufficient.

### Typography

| Role | Family | Weight | Desktop size |
| --- | --- | ---: | ---: |
| Display | Geist / Inter Tight / Manrope / system sans | 700–800 | 56–72px |
| Page title | Display stack | 700 | 40–48px |
| Section title | Display stack | 700 | 32–40px |
| Card title | Display stack | 600–700 | 18–24px |
| Body large | Inter / Manrope / system sans | 400–500 | 18px |
| Body | Body stack | 400–500 | 16px |
| UI label | Body stack | 600 | 14px |
| Metadata | Body stack | 500 | 12px |

Heading line height ranges from 1.05 to 1.2. Body line height ranges from 1.5 to 1.65. Page titles should stay below 18 words and use a maximum readable width.

### Spacing

Only this scale is approved:

| Token | Value |
| --- | ---: |
| `--gw-space-1` | 4px |
| `--gw-space-2` | 8px |
| `--gw-space-3` | 12px |
| `--gw-space-4` | 16px |
| `--gw-space-6` | 24px |
| `--gw-space-8` | 32px |
| `--gw-space-12` | 48px |
| `--gw-space-16` | 64px |
| `--gw-space-24` | 96px |

### Radius

- Small controls and compact badges: 8px.
- Inputs and buttons: 12px.
- Cards and dialogs: 16px.
- Major page sections: 24px.
- Fully rounded shapes are limited to avatars, status dots and tags.

### Elevation

- Card: `0 8px 30px rgba(17,19,24,0.08)`.
- Hover: `0 12px 36px rgba(17,19,24,0.12)`.
- Dialog: `0 24px 70px rgba(17,19,24,0.20)`.
- Navigation uses borders before shadow.

### Layout

- Maximum content width: 1280px.
- Desktop grid: 12 columns, 24px gutters.
- Tablet grid: 8 columns, 20px gutters.
- Mobile grid: 4 columns, 16px gutters.
- Page horizontal padding: 24–32px desktop, 16–24px mobile.
- Major vertical section spacing: 64–96px.

## 3. Logo system

- Full transparent wordmark: dark header and footer.
- Full wordmark on white: light print/document fallback.
- Transparent standalone mark: app icon, compact branded state and loading.
- Standalone mark on white: non-alpha fallback.
- Dark surfaces use the approved non-destructive treatment: graphite becomes
  white while the Go Gold opportunity accents remain gold.
- Minimum wordmark width: 128px; mobile minimum: 112px.
- Minimum standalone mark: 32px.
- Clear space: 25% of mark height.
- Do not derive a new icon or trace the raster assets without approved vector artwork.

## 4. Icon system

Use one rounded geometric, two-pixel stroke family. Lucide is the preferred future implementation because it supports consistent stroke, accessible labelling and broad marketplace coverage.

- Default icon: Go Black.
- Active or selected icon: Go Gold with adjacent text.
- Semantic icons use the matching status colour.
- Decorative icons use `aria-hidden="true"`.
- Icon-only controls require an accessible name and at least a 44px target.

Do not use emoji, mixed icon packs or inconsistent filled/outlined styles in the same workflow.

## 5. Component specifications

### Buttons

All buttons have a 48–52px standard height, 12px radius, 600 weight and 20–24px horizontal padding.

- **Primary:** Gold background, Go Black text. One primary action per task region.
- **Secondary:** White or transparent background, Go Black border and text.
- **Dark:** Go Black background, white text.
- **Quiet:** Text-only, reserved for low-priority actions.
- **Danger:** White or pale red surface with red border/text; never gold.

Required states: default, hover, focus, active, loading, disabled, success and failure recovery.

### Inputs

- Top-aligned visible label.
- 48px minimum height.
- White background and Border Gray edge.
- Gold focus ring with a dark inner keyline.
- Help text below the field.
- Error text is adjacent, concise and associated through `aria-describedby`.
- User input remains intact after recoverable submission failures.

### Cards

- White surface, Light Gray border, 16px radius and card shadow.
- Header communicates the object and current state.
- Body contains meaningful information.
- Footer contains metadata or an explicit next action.
- Entire-card links must remain keyboard accessible and expose a clear name.
- Empty visual blocks are prohibited.

### Tags and badges

- 8px or fully rounded only for compact metadata.
- Gold: selected, premium or opportunity.
- Green: success/available.
- Amber: warning/pending.
- Red: failed/blocked.
- Blue: informational.
- Neutral gray: category or inactive state.

### Alerts and feedback

Alerts include an icon, title, concise message and recovery action where possible. Toasts confirm non-critical completed actions; they do not replace persistent error information.

### Tables

- Sticky header where datasets are long.
- 44px minimum row height.
- Right-align money and numeric totals.
- Never merge totals across currencies.
- Row actions use a labelled menu.
- Mobile converts non-critical columns into a detail disclosure rather than horizontal overflow.

### Dialogs and drawers

- Dialog radius: 16px.
- Focus is trapped and restored on close.
- Escape closes non-destructive dialogs.
- Destructive confirmation names the affected object.
- Mobile filters and navigation use drawers with a 220ms transition.

## 6. Application patterns

### Authentication

Desktop uses a split composition:

- Left: Go Black brand panel, approved logo and “Connect with opportunities that move work forward.”
- Right: white authentication form.

Mobile collapses to the form with a compact dark brand header. Existing authentication logic, OTP behaviour and fields remain unchanged during visual migration.

### Client workspace

- Go Black sidebar.
- Gold active indicator.
- White data cards on Soft Cloud.
- Immediate emphasis on jobs, proposals, contracts and next approvals.

### Freelancer workspace

- Profile completeness and public visibility at the top.
- Opportunities and active work receive priority.
- Earnings are separated by currency and never calculated as authoritative browser totals.

### Administration

- Dense but readable operational layout.
- Tables and filters before decorative cards.
- Semantic status colours.
- No gold treatment for dangerous or privileged actions.

### Public marketplace

- Strong search and filter orientation.
- Real public jobs and profiles only.
- Cards answer identity, relevance, status and next action.
- No fake statistics, reviews or verification indicators.

## 7. Required page states

Every data-driven page defines:

- Initial loading.
- Refreshing.
- Empty.
- Partial data.
- Success.
- Recoverable error.
- Permission denied.
- Record not found.
- Offline/network interruption where applicable.
- Restricted or suspended account state.

Loading preserves layout. Empty states explain what is absent and provide one useful next action. Raw service/database messages are never displayed.

## 8. Responsive behaviour

### Breakpoints

- Mobile: 0–639px.
- Large mobile: 640–767px.
- Tablet: 768–1023px.
- Desktop: 1024–1279px.
- Wide: 1280px and above.

Components must respond to available space rather than assuming a device. No screen may require horizontal scrolling for primary content.

## 9. Accessibility

- Target WCAG 2.2 AA.
- All controls are keyboard accessible.
- Focus ring: 2px white/dark keyline plus a 3px Go Gold outer ring.
- Touch target minimum: 44 × 44px.
- Text zoom to 200% must remain usable.
- Motion respects `prefers-reduced-motion`.
- Headings follow document order.
- Status changes use a suitable live region.
- Error summary links to affected fields on long forms.
- Icons and colour never carry meaning alone.

## 10. Adoption rules

1. New primitives use the `gw-` prefix.
2. The foundation CSS is isolated and does not replace current page styles automatically.
3. Each page family receives a separate visual migration and regression test.
4. Authentication, data bindings, routes, IDs and action handlers are preserved.
5. A page is not considered migrated until loading, empty, error, success, responsive and accessibility states are verified.
6. The static application and GitHub Pages artifact remain synchronized.
