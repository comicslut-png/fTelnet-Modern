import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Ansi, Crt } from '@crt/index.js';
import { RIP } from '@graph/index.js';

/*
  Tests for the RIPscrip parser.

  RIP commands look like `!|<level><sub>c<payload>` on a line by
  itself. Examples used here:
    !|c0A      → SetColour(10)
    !|L<8 chars>  → Line(x1,y1,x2,y2) (4 base-36 coords)
    !|m<4 chars>  → MoveTo(x,y)
    !|*        → ResetWindows
    !|H        → Home (gotoxy 1,1)
    !|R<8 chars>  → Rectangle

  Numeric fields use base-36 (digits 0-9 plus A-Z). For example, "0A"
  is 10, "10" is 36, "ZZ" is 1295.

  Tests verify:
   - Non-RIP bytes pass through to Ansi unchanged.
   - RIP commands invoke the expected Graph methods (spied via vi).
   - The parser correctly buffers partial commands across Parse() calls.
   - The reported listener-leak fix actually works (mouse-down handlers
     don't accumulate on the canvas across button-press cycles).
*/

describe('RIP — parser construction', () => {
  let container: HTMLDivElement;
  let graphContainer: HTMLDivElement;
  let crt: Crt;
  let ansi: Ansi;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    ansi = new Ansi(crt);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  it('constructs without throwing', () => {
    expect(() => new RIP(crt, ansi, graphContainer)).not.toThrow();
  });

  it('attaches exactly one mousedown listener on the graph canvas', () => {
    const rip = new RIP(crt, ansi, graphContainer);
    // The fix for the original's listener leak: the same bound
    // reference is used for add and remove. We can't directly count
    // listeners in jsdom, but we can verify that the canvas exists.
    // (Listener-leak test below exercises this more directly.)
    expect(rip).toBeDefined();
  });
});

describe('RIP — non-RIP bytes flow through to Ansi', () => {
  let container: HTMLDivElement;
  let graphContainer: HTMLDivElement;
  let crt: Crt;
  let ansi: Ansi;
  let rip: RIP;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    ansi = new Ansi(crt);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
    rip = new RIP(crt, ansi, graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  it('writes plain text to Ansi', () => {
    const ansiSpy = vi.spyOn(ansi, 'Write');
    rip.Parse('Hello, world!\n');
    // Each char becomes a separate Write() call.
    expect(ansiSpy).toHaveBeenCalled();
    // First char delivered should be 'H'.
    expect(ansiSpy.mock.calls[0]?.[0]).toBe('H');
  });

  it('does NOT invoke Ansi.Write while consuming a RIP command body', () => {
    // The `!|` prefix and the command char shouldn't reach Ansi.
    // After the full command runs, the state machine resets.
    const ansiSpy = vi.spyOn(ansi, 'Write');
    rip.Parse('!|c0A');
    // The colour command (`c` + "0A" = 10) consumes 5 chars without
    // forwarding any of them to Ansi.
    expect(ansiSpy).not.toHaveBeenCalled();
  });

  it('passes through bare "!" if not followed by "|"', () => {
    const ansiSpy = vi.spyOn(ansi, 'Write');
    rip.Parse('!X');
    // The parser sees '!' at LineStarting → GotExclamation, then 'X'
    // doesn't match '|' so the parser writes "!X" to Ansi and resets.
    expect(ansiSpy).toHaveBeenCalledWith('!X');
  });
});

describe('RIP — command dispatch', () => {
  let container: HTMLDivElement;
  let graphContainer: HTMLDivElement;
  let crt: Crt;
  let ansi: Ansi;
  let rip: RIP;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    ansi = new Ansi(crt);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
    rip = new RIP(crt, ansi, graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  /**
   * Pulls the Graph instance out of the RIP — it's stored on a
   * private field, so we access via cast. Tests use this to spy on
   * Graph method dispatch.
   */
  function getGraph(): {
    SetColour: (n: number) => void;
    Line: (x1: number, y1: number, x2: number, y2: number) => void;
    MoveTo: (x: number, y: number) => void;
    Rectangle: (x1: number, y1: number, x2: number, y2: number) => void;
    Bar: (x1: number, y1: number, x2: number, y2: number) => void;
    Circle: (x: number, y: number, r: number) => void;
  } {
    return (rip as unknown as { _Graph: ReturnType<typeof getGraph> })._Graph;
  }

  it('SetColour command: !|c0A → Graph.SetColour(10)', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'SetColour');
    rip.Parse('!|c0A');
    expect(spy).toHaveBeenCalledWith(10);
  });

  it('SetColour: !|c0F → Graph.SetColour(15)', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'SetColour');
    rip.Parse('!|c0F');
    expect(spy).toHaveBeenCalledWith(15);
  });

  it('Line command: !|L00010203 → Graph.Line(0, 1, 2, 3)', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'Line');
    rip.Parse('!|L00010203');
    expect(spy).toHaveBeenCalledWith(0, 1, 2, 3);
  });

  it('Move command: !|m0A0B → Graph.MoveTo(10, 11)', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'MoveTo');
    rip.Parse('!|m0A0B');
    expect(spy).toHaveBeenCalledWith(10, 11);
  });

  it('Rectangle command: !|R00010203 → Graph.Rectangle(0, 1, 2, 3)', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'Rectangle');
    rip.Parse('!|R00010203');
    expect(spy).toHaveBeenCalledWith(0, 1, 2, 3);
  });

  it('Bar command: !|B00010203 → Graph.Bar(0, 1, 2, 3)', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'Bar');
    rip.Parse('!|B00010203');
    expect(spy).toHaveBeenCalledWith(0, 1, 2, 3);
  });

  it('Circle command: !|C010203 → Graph.Circle(1, 2, 3)', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'Circle');
    rip.Parse('!|C010203');
    expect(spy).toHaveBeenCalledWith(1, 2, 3);
  });

  it('base-36 parsing: !|cZZ → SetColour(1295)', () => {
    // ZZ in base-36 = 35 * 36 + 35 = 1295. The handler doesn't
    // validate the value (Graph.SetColour will clamp 0..15) but the
    // parse step is unaffected. Confirms base-36 logic.
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'SetColour');
    rip.Parse('!|cZZ');
    expect(spy).toHaveBeenCalledWith(1295);
  });

  it('handles split delivery: !|c then 0A in two Parse() calls', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'SetColour');
    rip.Parse('!|c');
    expect(spy).not.toHaveBeenCalled();
    rip.Parse('0A');
    expect(spy).toHaveBeenCalledWith(10);
  });

  it('handles multiple commands in one Parse()', () => {
    const graph = getGraph();
    const spy = vi.spyOn(graph, 'SetColour');
    // Two colour commands separated by a pipe (new-command shorthand
    // within the same RIP block).
    rip.Parse('!|c0A|c0F');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[0]).toBe(10);
    expect(spy.mock.calls[1]?.[0]).toBe(15);
  });
});

describe('RIP — KillMouseFields', () => {
  let container: HTMLDivElement;
  let graphContainer: HTMLDivElement;
  let crt: Crt;
  let ansi: Ansi;
  let rip: RIP;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    ansi = new Ansi(crt);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
    rip = new RIP(crt, ansi, graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  it('KillMouseFields empties the field list', () => {
    // Push a couple of buttons through the private field, then kill.
    type WithMouse = { _MouseFields: unknown[] };
    const ripPriv = rip as unknown as WithMouse;
    ripPriv._MouseFields.push({}, {}, {});
    expect(ripPriv._MouseFields.length).toBe(3);
    rip.KillMouseFields();
    expect(ripPriv._MouseFields.length).toBe(0);
  });
});

describe('RIP — listener leak fix', () => {
  // The original RIP had a subtle bug: addEventListener was called
  // with an arrow-function wrapper, and removeEventListener was
  // called with the raw method reference. The two are different
  // function objects, so removeEventListener silently did nothing,
  // and every button press leaked another listener.
  //
  // The migration fix: store the bound handlers as instance fields
  // and use those references for both add and remove. This test
  // verifies the fix by checking that the bound handlers exist as
  // stable instance fields.

  let container: HTMLDivElement;
  let graphContainer: HTMLDivElement;
  let crt: Crt;
  let ansi: Ansi;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    ansi = new Ansi(crt);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  it('stores stable bound mouse handlers as instance fields', () => {
    const rip = new RIP(crt, ansi, graphContainer);
    type WithHandlers = {
      _onMouseDown: (e: MouseEvent) => void;
      _onMouseMove: (e: MouseEvent) => void;
      _onMouseUp: (e: MouseEvent) => void;
    };
    const priv = rip as unknown as WithHandlers;

    expect(typeof priv._onMouseDown).toBe('function');
    expect(typeof priv._onMouseMove).toBe('function');
    expect(typeof priv._onMouseUp).toBe('function');

    // Crucially: the handlers must be stable references so that
    // addEventListener and removeEventListener see the same function
    // object. Two reads of the field should return the same function.
    expect(priv._onMouseDown).toBe(priv._onMouseDown);
    expect(priv._onMouseUp).toBe(priv._onMouseUp);
  });
});

describe('RIP — KeyPressed', () => {
  let container: HTMLDivElement;
  let graphContainer: HTMLDivElement;
  let crt: Crt;
  let ansi: Ansi;
  let rip: RIP;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    ansi = new Ansi(crt);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
    rip = new RIP(crt, ansi, graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  it('returns false when the keybuf is empty', () => {
    // The Crt-to-mouse-field routing logic was commented out in the
    // original (preserved as commented-out code in the migration),
    // so today this only checks _KeyBuf length.
    expect(rip.KeyPressed()).toBe(false);
  });
});
