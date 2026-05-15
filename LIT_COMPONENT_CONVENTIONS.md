# Lit Component Conventions

This document records the conventions for Lit web components in
`src/components/`. Established with the first component
(`<f-focus-warning>`) and applied uniformly to all that follow.

## Tag naming

  - **Prefix**: `f-` (short for fTelnet). All custom elements
    are `<f-foo>`.
  - **Two words minimum**, per the Custom Elements spec (a
    requirement, not a style preference — the browser rejects
    single-word custom-element names).
  - **kebab-case** in the tag, **PascalCase** in the class:
    `<f-focus-warning>` → `class FFocusWarning extends LitElement`.

## Module layout

One component per file, named after the class:
```
src/components/
  FFocusWarning.ts        // class FFocusWarning
  FScrollbackBar.ts       // class FScrollbackBar
  ...
  index.ts                // barrel
```

The file MUST call `customElements.define(...)` at module level
so that any `import` of the file registers the element as a side
effect. Without this, host pages need a separate registration
step and tests get confused.

```typescript
// in FFocusWarning.ts
export class FFocusWarning extends LitElement { ... }
customElements.define('f-focus-warning', FFocusWarning);

// in tests / host code:
import '@components/FFocusWarning.js';  // registers <f-focus-warning>
```

The barrel re-exports the classes for callers that need the
type, separate from registration:

```typescript
// in index.ts
export { FFocusWarning } from './FFocusWarning.js';
export { FScrollbackBar } from './FScrollbackBar.js';
```

## Rendering: light DOM

All components render into **light DOM**, not shadow DOM. We
override `createRenderRoot()` to return `this`:

```typescript
protected override createRenderRoot(): HTMLElement {
  return this;
}
```

**Why light DOM**:

  1. The existing `ftelnet.css` and the size-keyed
     `keyboard-*.css` files target classes like
     `.fTelnetFocusWarning`, `.fTelnetStatusBar`. Light DOM lets
     those selectors keep matching without rewrites.
  2. The keyboard CSS gets **swapped at runtime** based on
     screen size (see `OnCrtScreenSizeChanged` picking among 8
     size-specific stylesheets). Shadow DOM would isolate each
     component from those swaps.
  3. Years of CSS tuning. Throwing it out to gain encapsulation
     we don't need would be a regression.

Phase 3 (chrome facelift) is a good time to revisit per-component
shadow DOM if it actually helps any individual chrome piece. For
Phase 2 we stay uniformly light-DOM.

## State

Components **own their slice of state** via Lit's reactive
properties:

```typescript
@property({ type: Boolean })
visible = false;

@property({ type: Number, attribute: 'width-px' })
widthPx = 0;
```

Two flavors:
  - **Property-only** (no attribute): use `@state` for internal
    state, `@property({ attribute: false })` for parent-set state
    that doesn't need HTML attribute reflection.
  - **Property + attribute** (default for `@property`): can be
    set via either `el.visible = true` or `<f-x visible>`. Use
    kebab-case for multi-word attributes
    (`attribute: 'width-px'`).

Imperative TS callers (`fTelnetClient.ts`) set properties:

```typescript
this._FocusWarningBar.visible = true;
this._FocusWarningBar.widthPx = 480;
```

**Note on decorator flavor**: we use TypeScript's experimental
decorators (Stage 2, TS-specific). The tsconfig has both
`experimentalDecorators: true` AND `useDefineForClassFields:
false` — both are required for Lit's `@property` decorator to
install accessors that class-field initializers flow through
rather than overwrite. Lit's own docs recommend this mode for
production output quality, and it sidesteps an issue where Vite
5's Rollup 4 parser doesn't accept the `accessor` keyword that
TC39 standard decorators require. If we ever switch to standard
decorators in a future delta (when Vite/Rollup catches up to
the `accessor` keyword), every decorated class field will need
`accessor` prepended and both tsconfig flags flipped.

## Events

Components dispatch native `CustomEvent`s for user interactions.
Event names use kebab-case, no prefix:

```typescript
this.dispatchEvent(new CustomEvent('connect-click', {
  bubbles: true,
  composed: true,
}));
```

(`composed: true` is harmless in light DOM and lets the event
cross shadow boundaries if we ever add them later.)

Listeners on the parent side use `addEventListener`:

```typescript
this._StatusBar.addEventListener('connect-click', () => {
  this.Connect();
});
```

**Don't** use Lit's `@event-name=${handler}` decorator syntax
from `lit-html` for parent → child wiring — we're not using
`lit-html` for the top-level rendering (fTelnetClient still
builds the page imperatively in Phase 2).

For type safety, each component declares its dispatched events
in a comment block at the top:

```typescript
/**
 * Events:
 *   connect-click — fires when the Connect button is activated
 *   menu-click    — fires when the Menu button is activated
 */
```

We may add typed event interfaces later if the boilerplate
warrants it.

## File template

```typescript
/*
  Copyright header.
*/

import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * <f-foo> — one-line description.
 *
 * Properties:
 *   - bar: number — describes bar
 *
 * Events:
 *   - foo-click — fires when …
 *
 * CSS:
 *   - Inherits styles from .fTelnetFoo in ftelnet.css.
 */
@customElement('f-foo')
export class FFoo extends LitElement {
  @property({ type: Number })
  bar = 0;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<div class="fTelnetFoo">…</div>`;
  }
}
```

**Note on `@customElement` decorator**: it does the same job as
a bottom-of-file `customElements.define('f-foo', FFoo)` call.
Either is fine; the decorator is slightly cleaner. We use the
decorator throughout.

The tsconfig has `experimentalDecorators: true`. Decorated
properties use plain class-field syntax (`visible = false`), not
the standard-decorator `accessor visible = false` syntax.

## Testing pattern

One test file per component, in `tests/components/`. Use jsdom
(the existing vitest environment). Tests render the component
into a detached container, exercise reactive properties and
events, and assert DOM/state changes.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FFoo.js';
import type { FFoo } from '@components/index.js';

describe('<f-foo>', () => {
  let container: HTMLDivElement;
  let el: FFoo;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-foo') as FFoo;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders the expected DOM', () => {
    expect(el.querySelector('.fTelnetFoo')).not.toBeNull();
  });

  it('reacts to bar property changes', async () => {
    el.bar = 42;
    await el.updateComplete;
    // ... assert DOM reflects bar = 42
  });

  it('dispatches foo-click on the right interaction', () => {
    let fired = false;
    el.addEventListener('foo-click', () => { fired = true; });
    el.querySelector('button')!.click();
    expect(fired).toBe(true);
  });
});
```

**Key Lit testing gotchas**:

  - **`await el.updateComplete`** after construction and after
    property changes. Lit batches DOM updates into a microtask,
    so synchronous property writes don't immediately reflect in
    the DOM.
  - **Use `el.querySelector` not `el.shadowRoot?.querySelector`**.
    We're in light DOM.
  - **Don't dispatch events through `el.click()` for buttons that
    use `@click=${...}`** in lit-html — that path goes through
    Lit's event listener. For our pattern (light DOM + native
    listeners) the standard `.click()` works.

## Path alias

The vitest and vite configs map `@components/*` to
`src/components/*`, matching the pattern used for other
modules. Imports use the alias:

```typescript
import '@components/FFocusWarning.js';
```

## What goes in a component vs. fTelnetClient

A component owns:
  - Its DOM shape (the `html`...`` template)
  - Its reactive state (`@property` and `@state`)
  - User interaction → custom event dispatch

fTelnetClient owns:
  - **Where** components are placed in the page
  - **When** their properties change (driven by Crt events,
    connection lifecycle, etc.)
  - **What** happens in response to custom events (calling
    `Connect()`, `Disconnect()`, etc.)

This split means each Lit delta becomes:
  1. Add component file
  2. Update fTelnetClient to use it (replace `createElement('div')`
     etc. with `createElement('f-foo')`, change setter calls)
  3. Add tests

The fTelnetClient deltas in Phase 2 should be smaller each time
because we're replacing imperative DOM with component setters,
not adding new logic.

## What this enables

This convention set:
  - Makes Phase 3 (chrome facelift) **mechanical** — change the
    component template, the styles update consistently
  - Lets each component be testable in isolation
  - Doesn't break the existing CSS workflow
  - Doesn't lock us into anything weird if we want to switch to
    shadow DOM later (just change `createRenderRoot()` per-component)
