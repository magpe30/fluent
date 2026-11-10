# Fluent UI foundations

## Buttons

Import `Button` from `components/ui/button`. All action buttons in the rehearsal
and studio flows use this component. Brand marks and large interactive practice
cards remain separate controls because their layouts and roles are different.

```tsx
import { Button } from "./ui/button";
import { Icon } from "./icons";

<Button onClick={start} endIcon={<Icon name="arrow" size={18}/>}>Start conversation</Button>
<Button variant="secondary" onClick={preview}>Try the demo</Button>
<Button variant="ghost" startIcon={<Icon name="back" size={20}/>} onClick={back}>Back</Button>
<Button type="submit" loading={saving}>Save scenario</Button>
```

- `primary`: filled surface, clipped top-left and bottom-right corners; use for
  the main action in a group.
- `secondary`: transparent surface with a continuous clipped outline; use for
  an alternative action alongside the primary.
- `ghost`: quiet text treatment for navigation and inline actions.
- `size`: `md` (default, 54px minimum height) or `sm` (44px minimum height).
- `fullWidth`: fill the available width without changing the variant.
- `loading`: disables activation, adds `aria-busy` and a decorative spinner.
  Keep a meaningful label visible; the component does not announce arbitrary text.
- `startIcon` / `endIcon`: optional icon slots. Icons can also be passed as children.
- `color`, `background`, `borderColor`: optional CSS color/background overrides.
  Prefer the defaults or semantic tokens so screens remain consistent.
- Native button props, ARIA attributes, handlers, and React 19 `ref` are forwarded.
  The default `type` is `button`; form submissions must specify `type="submit"`.

```tsx
<Button
  variant="secondary"
  color="#e5d1ff"
  background="#251c35"
  borderColor="#b997e4"
>
  Preview
</Button>
```

The shape is decorative: the actual button and its focus outline are not clipped.
Disabled controls cannot activate; loading also blocks repeated clicks. Hover
movement is limited to devices with hover, reduced motion removes movement,
and forced-colors mode uses a visible native border. Icon-only buttons need an
`aria-label`. For navigation to a URL, use a link rather than a button.

## Styling ownership

- `app/space.css`: existing brand primitives, typography and layout tokens.
- `app/design-tokens.css`: semantic action colors, dimensions, corner cut and
  motion duration. Adjust these to change buttons across the app.
- `components/ui/button.module.css`: all button shapes and interaction states.
- Page stylesheets: positioning and surrounding layout only. Use `className` for
  margins/placement; do not recreate button fills, borders or states in page CSS.
- `components/heading-accent.tsx`: the shared decorative heading underline.

Use native semantics and small purpose-built components. Add a shared component
when a pattern repeats; avoid a generic component with unrelated page-specific
flags. The broader app still has page-specific card, input and status styles;
those are not yet a complete component library.

## Validation

`npm run typecheck`, `npm run build`, and `npm run test:integration` cover both
practice flows, form submission, disabled actions, microphone recovery and
responsive demo navigation. Live AI tests are opt-in. Inspect desktop and mobile
screenshots after visual changes, including the transparent secondary outline.

## Scrolling headers

`ScrollHeader` in `components/ui/scroll-header.tsx` wraps navigation in a native
`header`. It stays transparent at the top and adds an opaque, textured backdrop
when the document scrolls past 8px. It reuses the page’s `Starfield` grain and stars
at viewport scale, with the same fixed background gradient. The extra canvas is
static and clipped to the header. The backdrop fades below the controls so
content cannot show through the logo or Back button. No divider is used.

Use a full-width header with horizontal padding, rather than outer margins, to
avoid an inset background panel. Page CSS owns height and content layout; the
component owns stickiness, scroll detection and the backdrop. Set `sticky={false}`
for the fixed-height homepage. Reduced motion removes the fade transition.
