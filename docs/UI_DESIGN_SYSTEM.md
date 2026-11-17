# UI design system (U1)

## Color

`frontend/src/design/tokens.css` is the source for the blue and pink 50–900 scales and Tailwind color tokens. The palette uses deep blue `#09318D`, white `#FFFFFF`, and the single pink accent `#FD91CC` at `pink-500`. Use deep-blue text on pink controls and never use pink as text on white. Pink marks the main action and key large visual highlight.

The only semantic colors are compact error and success pairs. Each required text/background pairing is checked by `frontend/scripts/check-contrast.mjs`; text pairs must meet WCAG AA 4.5:1. Pink on white is deliberately verified to remain below that threshold so it stays out of text use.

## Components and risk communication

- `Button` has primary, secondary, and quiet variants, native button semantics, and visible keyboard focus.
- `Card` provides a neutral content surface.
- `RiskBadge` always supplies a written risk label and a distinct geometric symbol in addition to its color treatment. It accepts an already-classified level; it does not calculate clinical risk.

Use the badge with calm explanatory text and the screening disclaimer on report screens. Do not imply a risk level can be inferred from an arbitrary score until the backend provides an approved mapping.

## Motion and focus

Keep motion brief (160 ms by default), decorative, and non-essential. Use `useMotionPreferences` with Framer Motion and keep the global `prefers-reduced-motion` CSS override. Do not encode information only in an animation. Keyboard focus uses a high-contrast blue outline with offset; do not remove native focus without replacing it.

The reference screenshot named in the UI prompt was not provided. This system follows only the written palette and visual constraints; refine spacing, gradients, and decorative treatments when the intended reference is available.
