# GoWorkora internal UI mood board

## Direction: Forward Signal

The mood board was resolved before component code was created. It is a restrained enterprise-marketplace language derived directly from the supplied logo.

## Brand atmosphere

| Attribute | Visual expression |
| --- | --- |
| Professional | Dense graphite typography, aligned grids, explicit labels and calm motion |
| Premium | Generous space, precise borders, controlled shadow and confident contrast |
| Human-focused | Real professional imagery when approved, readable copy and clear outcomes |
| Global | Neutral surfaces, international date/currency readiness and location-aware layouts |
| Efficient | Short decision paths, visible next actions and compact operational states |
| Trustworthy | Dark structural areas, white content surfaces and semantic status colours |

## Colour mood

- **Go Black `#111318`** is the architectural frame.
- **Go Gold `#FFB000`** is the opportunity signal.
- **Pure White `#FFFFFF`** is the primary reading surface.
- **Soft Cloud `#F7F8FA`** separates page regions without decorative colour.
- **Light Gray `#ECEEF2`** and **Border Gray `#D9DDE5`** create structure.
- Semantic green, amber, red and blue are reserved for status—not branding.

Gold is never used as body text on white. Gold buttons always use Go Black text. Status colours never replace Gold’s action role.

## Typography mood

- **Display:** Geist, with Inter Tight and Manrope as fallbacks.
- **Interface/body:** Inter, with Manrope and system UI as fallbacks.
- Headings use 600–800 weights, compact tracking and short line lengths.
- Body text uses 400–600 weights with 1.5–1.65 line height.
- Labels are sentence case by default. Uppercase is reserved for compact operational overlines.

The typography should resemble an established global business platform, not an advertising landing-page template.

## Composition mood

- Maximum application width: 1280px.
- Main pages use a 12-column desktop grid.
- Content density changes by context:
  - Public/marketing: spacious and editorial.
  - Client/freelancer workspace: balanced cards and clear next actions.
  - Administration: denser tables and operational controls.
- Major sections use 64–96px vertical space.
- Cards align to shared edges and avoid arbitrary staggering.

## Component mood

### Buttons

Rectangular with a 12px radius, strong labels and no exaggerated pill shape. Gold is the decisive primary action; black is the authoritative secondary action; outlined buttons are quieter.

### Cards

White, 16px radius, fine gray border and low, broad shadow. Each card must contain information or an action. Decorative empty panels are excluded.

### Forms

Clear top-aligned labels, 48px minimum input height, 12px radius, gray border and gold focus ring. Validation copy appears adjacent to the relevant field.

### Navigation

Go Black shell, white text, Gold active indicator. The logo receives generous horizontal space and is never reduced to an improvised letter badge.

### Status

Compact badges use semantic colours:

- Green: completed, available or healthy.
- Amber: requires attention.
- Red: failed, destructive or blocked.
- Blue: informational.
- Gold: selected, premium or current opportunity—not system health.

## Distinctive motifs

### Motion Cut

A short 12-degree gold bar derived from the cuts inside the wordmark. Use once per major composition: active navigation, page overline, selected card or progress marker.

### Workforce Pillars

Three aligned vertical elements derived from the standalone mark. Appropriate for steps, comparisons, progress and workforce grouping. Never use as a meaningless background pattern.

### Precision Frame

A white or Cloud surface with a one-pixel gray border, 16px corner radius and measured shadow. This is the standard information container.

### Opportunity Beacon

A small gold square or lozenge that marks the next meaningful action. It is not a generic decoration and should not appear beside every heading.

## Imagery

- Prefer real, consented professional portraits and work-context photography.
- Crop people naturally and avoid exaggerated “team celebration” stock imagery.
- Use interface previews only when they communicate a real workflow.
- Use the standalone logo mark for branded empty states before inventing illustrations.
- Avoid cartoons, floating decorative blobs, fake dashboards and unsupported marketplace statistics.

## Motion

- 160ms for hover and focus transitions.
- 220ms for drawers and dialogs.
- Movement stays within 2px for card elevation.
- Loading uses restrained opacity or progress motion based on the logo pillars.
- All motion is disabled or reduced under `prefers-reduced-motion`.

## Final alignment check

The mood board satisfies the logo’s four defining ideas:

1. Graphite structure → trusted application shell.
2. Gold energy → decisive action only.
3. Geometric precision → consistent grid, spacing and radii.
4. Forward movement → directional motifs and explicit next actions.

No page redesign should begin until its requirements can be expressed using these approved foundations and primitives.
