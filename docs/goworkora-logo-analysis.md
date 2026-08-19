# GoWorkora logo analysis

This analysis records the visual decisions derived from the four approved logo references before any application page is restyled.

## Supplied variants

| Variant | Dimensions | Alpha | Intended use |
| --- | ---: | --- | --- |
| Full wordmark on white | 2172 × 724 | No | Light-background fallback, documents, presentations and print |
| Standalone mark on white | 1254 × 1254 | No | Light-background fallback and large-format icon use |
| Standalone mark, transparent | 1254 × 1254 | Yes | Dark navigation, dark hero surfaces and adaptable digital placement |
| Full wordmark, transparent | 2172 × 724 | Yes | Dark navigation, footer and adaptable digital placement |

The transparent assets include a fine light keyline. That keyline separates the graphite forms from dark surfaces and becomes visually quiet on white.

## Formal analysis

### Wordmark

- The letterforms are broad, geometric and structurally heavy.
- Rounded counters make the name approachable without becoming playful.
- Gold interruptions act like motion cuts: short, angled moments that imply direction, acceleration and opportunity.
- The repeated gold details create rhythm without turning the wordmark into a multicolour identity.
- The black mass carries authority; the gold is deliberately scarce and therefore meaningful.

### Standalone mark

- Three vertical forms read as a workforce, skyline, progress chart or connected team.
- The taller central gold form establishes opportunity and forward momentum.
- The lower converging points suggest connection, routing and people meeting around shared work.
- Rounded external corners communicate approachability; the sharper internal points communicate precision.
- The mark is vertically stable and suitable for square application icons, avatars and loading moments.

## Brand meaning translated into interface rules

| Logo characteristic | Interface interpretation |
| --- | --- |
| Graphite mass | Trusted navigation, major sections, sidebars and high-authority surfaces |
| Scarce gold cuts | Primary action, selection, progress and decisive moments only |
| Repeated geometric rhythm | Consistent spacing, grid alignment and predictable component anatomy |
| Rounded exterior geometry | 12px inputs, 16px cards and 24px major containers |
| Sharp internal direction | Small diagonal motion-cut detail, directional iconography and clear next actions |
| Three-pillar mark | Three-part workflows, comparison structures and grouped workspace navigation |
| High contrast | White content surfaces, strong typography and unambiguous hierarchy |

## Logo usage

### Preferred

- Use the transparent wordmark on Go Black navigation and footer surfaces.
- Use the transparent standalone mark for square brand moments at 32px and above.
- Use the supplied white-background variants when alpha transparency is unavailable.
- Preserve the original aspect ratio and all graphite/gold relationships.
- Keep surrounding clear space at least equal to one quarter of the mark height.

### Minimum sizes

- Digital wordmark: 128px wide.
- Compact mobile wordmark: 112px wide.
- Standalone mark: 32px.
- A separately approved simplified vector is required before using the mark below 24px.

### Prohibited

- Do not recolour the gold or graphite forms.
- Do not add gradients, shadows, outlines or glow effects to the logo.
- Do not crop the mark, remove motion cuts or rearrange the wordmark.
- Do not place the logo over visually busy imagery.
- Do not substitute the current letter “G” badge after the logo-led system is adopted.

## Existing-interface audit

The current repository contains three competing visual directions:

1. Green and citron tokens in the main static application and React wrapper.
2. Plum, coral, violet and citron in the isolated Kinetic Ember homepage preview.
3. Ad-hoc colour, radius and shadow values in feature-specific styles.

These systems should not be overwritten globally in one change. The new logo-led system is therefore being built with `gw-` prefixed tokens and scoped component primitives. Existing pages remain unchanged until each page family is reviewed and migrated deliberately.

## Alignment decision

The logo supports a visual system named **Forward Signal**:

- **Forward** represents progress, opportunity and the directional cuts.
- **Signal** represents clarity, action and gold’s deliberately limited role.
- The system uses Go Black for structure, Go Gold for decisive action, white for content clarity and gray for information architecture.
