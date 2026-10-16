import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import RoomArt from "./RoomArt.jsx";
import { DEMO_TASTES } from "../server/fixtures.js";
import "./style.css";
const sampleA = ["The Quiet Atlas", "Low Tide Radio", "North Window House"];
const sampleB = [
  "Paper Sun Parade",
  "Sunday Brass Club",
  "Clay Market Kitchen",
];
const Arrow = () => <span aria-hidden="true">↗</span>;
function App() {
  const [mode, setMode] = useState("solo"),
    [room, setRoom] = useState("Living room"),
    [people, setPeople] = useState([
      { name: "Alex", tastes: sampleA },
      { name: "Sam", tastes: sampleB },
    ]),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [copied, setCopied] = useState(false),
    [progress, setProgress] = useState(0);
  const [dataMode, setDataMode] = useState("demo");
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((config) => {
        if (config.dataMode === "live") {
          setDataMode("live");
          setPeople((ps) => ps.map((p) => ({ ...p, tastes: ["", "", ""] })));
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (selected) {
      const previous = triggerRef.current;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
        previous?.focus();
      };
    }
  }, [selected]);
  const formRef = useRef(),
    resultRef = useRef(),
    triggerRef = useRef();
  const edit = (index, field, value) =>
    setPeople((ps) =>
      ps.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  const scrollToForm = () =>
    formRef.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    setResult(null);
    setSelected(null);
    setProgress(0);
    const interval = setInterval(
      () => setProgress((p) => Math.min(p + 1, 3)),
      1500,
    );
    try {
      const res = await fetch("/api/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          room,
          people: people.slice(0, mode === "shared" ? 2 : 1),
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || "Something went wrong. Please try again.",
        );
      setResult(data);
      setTimeout(
        () =>
          resultRef.current?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
            block: "start",
          }),
        50,
      );
    } catch (err) {
      setError(err.message || "Could not reach TasteRoom. Please try again.");
    } finally {
      clearInterval(interval);
      setBusy(false);
    }
  }
  const trace = (reason) => (
    <div className="trace">
      <span className="trace-label">TASTE TRACE</span>
      <p>{reason.text}</p>
      <div className="trace-chips">
        {reason.evidence.map((id) => {
          const e = result.evidence.find((e) => e.id === id);
          return e ? (
            <button
              key={id}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setSelected(e);
              }}
              aria-label={`Inspect signal ${e.name}`}
            >
              ⌁ {e.name} <Arrow />
            </button>
          ) : null;
        })}
      </div>
    </div>
  );
  async function copyBrief() {
    const b = result.brief;
    const text = [
      `TASTEROOM / ${b.room}`,
      `${result.mode.toUpperCase()} DATA · ${result.reasoning}`,
      b.title,
      b.story,
      "\nCOLOR PALETTE",
      ...b.palette.map((p) => `${p.name} ${p.hex}`),
      b.paletteReason.text,
      "\nMATERIALS",
      ...b.materials.map(
        (m) => `${m.name}: ${m.description}. ${m.reason.text}`,
      ),
      "\nFURNITURE",
      b.furniture.text,
      b.furniture.reason.text,
      "\nLIGHTING",
      ...b.lighting.map((l) => `${l.time} · ${l.kelvin} · ${l.description}`),
      b.lightingReason.text,
      "\nCHECKLIST",
      ...b.shopping.map((s) => `☐ ${s.category}: ${s.item}`),
      "\nEVIDENCE",
      ...result.evidence.map(
        (e) => `${e.id}: ${e.name} ← ${e.entity} (${e.owner})`,
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(
        "Clipboard is unavailable. Use the Print brief button to save your room.",
      );
    }
  }
  return (
    <>
      <header>
        <a className="wordmark" href="#" aria-label="TasteRoom home">
          <span className="brand-symbol">
            t<span>r</span>
          </span>
          TasteRoom<span className="brand-dot">·</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">The idea</a>
          <a href="#studio">Your studio</a>
          <span className="header-label">CULTURE → SPACE</span>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="dot" /> INTERIORS, FROM THE INSIDE OUT
            </div>
            <h1>
              Good taste.
              <br />
              Your <em>space.</em>
            </h1>
            <p className="hero-description">
              The films you linger on. The music you come back to. The places
              that feel like you.
              <br />
              <strong>There’s a room in all of that.</strong>
            </p>
            <button className="primary" onClick={scrollToForm}>
              Find your room <Arrow />
            </button>
            <div className="hero-foot">
              <span className="little-mark">✳</span>
              <span>
                No style quizzes. No blank canvases.
                <br />
                Just a few things you already love.
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <RoomArt />
            <div className="room-label">
              <span>
                <span className="dot" /> A ROOM, TRANSLATED FROM TASTE
              </span>
              <span>STUDY Nº 001</span>
            </div>
            <div className="floating-note">
              <span>THE STARTING POINT</span>
              <p>
                Less “what’s your style?”
                <br />
                More “what moves you?”
              </p>
              <span className="note-line" />
            </div>
          </div>
        </section>
        <div className="concept-strip" id="how">
          <span>A DIFFERENT WAY IN</span>
          <p>
            Your culture is the brief.
            <br />
            <em>Qloo connects the dots.</em>
          </p>
          <div>
            01 &nbsp; Tell us what you love
            <br />
            02 &nbsp; Follow your cultural affinities
            <br />
            03 &nbsp; Make room for yourself
          </div>
        </div>
        <section className="studio" id="studio" ref={formRef}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">01 / THE INGREDIENTS</span>
              <h2>Start with your kind of things.</h2>
            </div>
            <span className="small-note">
              A room that feels like you
              <br />
              starts outside the room.
            </span>
          </div>
          <div className="demo-banner">
            <span className="demo-icon">◈</span>
            <div>
              <strong>
                {dataMode === "live"
                  ? "Live cultural discovery is configured."
                  : "Try the studio. No key needed."}
              </strong>
              <span>
                {dataMode === "live"
                  ? "Enter real films, artists, restaurants, places, books or brands. Your tastes are resolved and researched through Qloo."
                  : "Without a Qloo key, the agent uses fictional sample tastes and synthetic responses. Add a server key for real cultural names."}
              </span>
            </div>
            <span className="demo-pill">
              {dataMode === "live"
                ? "SERVER KEY CONFIGURED"
                : "KEYLESS DEMO AVAILABLE"}
            </span>
          </div>
          <form onSubmit={submit}>
            <div className="form-top">
              <div className="mode-switch" aria-label="Design mode">
                <button
                  type="button"
                  className={mode === "solo" ? "active" : ""}
                  onClick={() => setMode("solo")}
                  aria-pressed={mode === "solo"}
                >
                  Just for me <span>↗</span>
                </button>
                <button
                  type="button"
                  className={mode === "shared" ? "active" : ""}
                  onClick={() => setMode("shared")}
                  aria-pressed={mode === "shared"}
                >
                  A shared space <span>↔</span>
                </button>
              </div>
              <label className="room-select">
                MAKE ROOM FOR
                <select value={room} onChange={(e) => setRoom(e.target.value)}>
                  <option>Living room</option>
                  <option>Bedroom</option>
                  <option>Home office</option>
                </select>
              </label>
            </div>
            <div className={`people-grid ${mode === "shared" ? "two" : ""}`}>
              {people.slice(0, mode === "shared" ? 2 : 1).map((person, i) => (
                <div className="person" key={i}>
                  <div className="person-top">
                    <span className={`avatar avatar-${i}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <label>
                      WHOSE TASTE?
                      <input
                        className="name-input"
                        aria-label={`Person ${i + 1} name`}
                        maxLength="32"
                        value={person.name}
                        onChange={(e) => edit(i, "name", e.target.value)}
                      />
                    </label>
                    {dataMode === "demo" && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          edit(i, "tastes", i === 0 ? sampleA : sampleB)
                        }
                      >
                        Use sample ↗
                      </button>
                    )}
                  </div>
                  <p className="input-hint">
                    Add 3–5 films, artists, places, books or brands you love.
                  </p>
                  <div className="taste-fields">
                    {person.tastes.map((taste, index) => (
                      <div className="taste-field" key={index}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <input
                          required
                          minLength="2"
                          maxLength="100"
                          list={dataMode === "demo" ? "demo-tastes" : undefined}
                          aria-label={`Person ${i + 1} taste ${index + 1}`}
                          value={taste}
                          placeholder="A film, artist, place…"
                          onChange={(e) =>
                            edit(
                              i,
                              "tastes",
                              person.tastes.map((t, j) =>
                                j === index ? e.target.value : t,
                              ),
                            )
                          }
                        />
                        {person.tastes.length > 3 && (
                          <button
                            type="button"
                            className="remove"
                            aria-label={`Remove person ${i + 1} taste ${index + 1}`}
                            onClick={() =>
                              edit(
                                i,
                                "tastes",
                                person.tastes.filter((_, j) => j !== index),
                              )
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {person.tastes.length < 5 && (
                    <button
                      type="button"
                      className="text-button add-taste"
                      onClick={() => edit(i, "tastes", [...person.tastes, ""])}
                    >
                      + Add another thing you love
                    </button>
                  )}
                </div>
              ))}
            </div>
            <datalist id="demo-tastes">
              {DEMO_TASTES.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.types[0].replace("urn:entity:", "")} · fictional demo taste
                </option>
              ))}
            </datalist>
            {mode === "shared" && (
              <div className="shared-hint">
                <span>↔</span>
                <p>
                  Common ground, without the compromise aesthetic.
                  <br />
                  <span>
                    We compare both taste groups, then give each person a place
                    in the room.
                  </span>
                </p>
              </div>
            )}
            <div className="form-bottom">
              <span>
                No account. No saved taste profiles.
                <br />
                Live mode sends tastes to Qloo and, if enabled, your LLM
                provider.
              </span>
              <button className="primary" type="submit" disabled={busy}>
                {busy
                  ? "Connecting your taste…"
                  : mode === "shared"
                    ? "Find our common ground"
                    : "Translate my taste"}{" "}
                {busy ? <span className="spinner" /> : <Arrow />}
              </button>
            </div>
            {busy && (
              <div className="progress" role="status">
                <span className="dot" />
                {
                  [
                    "Resolving your cultural tastes…",
                    "Exploring cross-domain affinities…",
                    mode === "shared"
                      ? "Comparing both worlds…"
                      : "Following the taste signals…",
                    "Composing your room brief…",
                  ][progress]
                }
                <small>The complete tool log appears with your brief.</small>
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
          </form>
        </section>
        {result && (
          <section className="results" ref={resultRef} id="your-room">
            <div className="result-top">
              <span className="eyebrow">02 / YOUR ROOM, DECODED</span>
              <div>
                <span className={`data-badge ${result.mode}`}>
                  {result.mode === "demo"
                    ? "SYNTHETIC DEMO DATA"
                    : "LIVE QLOO DATA"}
                </span>
                <span className="planner-badge">{result.reasoning}</span>
              </div>
            </div>
            <div className="result-title">
              <div>
                <h2>{result.brief.title}</h2>
                <p>{result.brief.story}</p>
              </div>
              <div className="export-actions">
                <button onClick={copyBrief}>
                  {copied ? "Copied ✓" : "Copy brief ↗"}
                </button>
                <button onClick={() => window.print()}>Print brief ↗</button>
              </div>
            </div>
            {result.warnings.map((w, i) => (
              <p className="warning" key={i}>
                {w}
              </p>
            ))}
            <div className="result-layout">
              <div className="moodboard">
                <div className="result-art">
                  <RoomArt
                    direction={result.brief.direction}
                    room={result.brief.room}
                  />
                  <span className="art-caption">
                    {result.brief.room.toUpperCase()} / CONCEPTUAL ILLUSTRATION
                    · NOT A RENDER
                  </span>
                </div>
                <article className="palette-card">
                  <div className="card-heading">
                    <span>01</span>
                    <h3>A palette with a point of view.</h3>
                    <span>THE COLOR STORY</span>
                  </div>
                  <div className="swatches">
                    {result.brief.palette.map((c) => (
                      <div className="swatch" key={c.hex}>
                        <div style={{ background: c.hex }} />
                        <strong>{c.name}</strong>
                        <span>{c.hex}</span>
                      </div>
                    ))}
                  </div>
                  {trace(result.brief.paletteReason)}
                </article>
                <div className="material-grid">
                  {result.brief.materials.map((m, i) => (
                    <article className="material-card" key={m.name}>
                      <div
                        className={`texture ${m.texture} ${result.brief.direction}`}
                      >
                        <span>0{i + 1}</span>
                      </div>
                      <h3>{m.name}</h3>
                      <p>{m.description}</p>
                      {trace(m.reason)}
                    </article>
                  ))}
                </div>
                <article className="furniture-card">
                  <span className="eyebrow">THE SHAPE OF THINGS</span>
                  <h3>Give the room its rhythm.</h3>
                  <p>{result.brief.furniture.text}</p>
                  {trace(result.brief.furniture.reason)}
                </article>
                <article className="lighting-card">
                  <div className="card-heading">
                    <span>02</span>
                    <h3>Light that lives with you.</h3>
                  </div>
                  <div className="lighting-timeline">
                    {result.brief.lighting.map((l, i) => (
                      <div key={l.time}>
                        <span className={`light-orb orb-${i}`} />
                        <span className="time">{l.time}</span>
                        <h4>{l.name}</h4>
                        <span className="kelvin">{l.kelvin}</span>
                        <p>{l.description}</p>
                      </div>
                    ))}
                  </div>
                  {trace(result.brief.lightingReason)}
                </article>
                {result.comparison && (
                  <article className="comparison-card">
                    <span className="eyebrow">↔ / A PLACE FOR BOTH</span>
                    <h3>Meet in the middle. Keep your edges.</h3>
                    <p>
                      Shared signals from each person’s highest-ranked cultural
                      affinities. These are overlapping signals, not a
                      compatibility score.
                    </p>
                    <div className="overlap-tags">
                      {result.comparison.shared.length ? (
                        result.comparison.shared.map((s) => (
                          <span key={s.key}>{s.name}</span>
                        ))
                      ) : (
                        <span>
                          No overlapping signals in the returned results.
                        </span>
                      )}
                    </div>
                    <div className="personal-corners">
                      {result.brief.profiles.map((p, i) => (
                        <div key={i}>
                          <span className={`avatar avatar-${i}`}>0{i + 1}</span>
                          <h4>{p.name}’s corner</h4>
                          <p>{p.accent}.</p>
                          <small>Distinct signals</small>
                          <p>
                            {(i === 0
                              ? result.comparison.aOnly
                              : result.comparison.bOnly
                            )
                              .slice(0, 5)
                              .map((s) => s.name)
                              .join(" · ") ||
                              "Your returned signals overlap; use different arrangements to personalize each corner."}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="bridge-note">
                      <strong>Qloo Analysis Compare anchors</strong>
                      <p>
                        {result.comparison.bridges
                          .map((b) => b.name)
                          .join(" · ") || "No comparison anchors returned."}
                      </p>
                      <small>
                        Comparison anchors guide the shared foundation and its
                        taste traces.
                      </small>
                    </div>
                  </article>
                )}
                <article className="shopping-card">
                  <span className="eyebrow">03 / MAKE IT REAL</span>
                  <h3>A considered shopping list.</h3>
                  <p>
                    Categories to look for. No scraped products or affiliate
                    links.
                  </p>
                  <div>
                    {result.brief.shopping.map((s, i) => (
                      <label key={`${result.brief.direction}-${s.category}`}>
                        <input type="checkbox" />
                        <span className="checkmark" />
                        <span>
                          <small>{s.category}</small>
                          {s.item}
                        </span>
                      </label>
                    ))}
                  </div>
                </article>
              </div>
              <aside className="agent-panel">
                <div className="agent-panel-title">
                  <span className="dot" />
                  <h3>Behind the room</h3>
                  <span>{result.steps.length} STEPS</span>
                </div>
                <p>
                  A visible trail from cultural taste to creative decisions.
                </p>
                <div className="resolved-list">
                  {result.resolved.map((p, i) => (
                    <div key={i}>
                      <span className="eyebrow">
                        {p.name}’S STARTING POINTS
                      </span>
                      {p.entities.map((e) => (
                        <div key={e.id}>
                          <span>↳</span>
                          <span>
                            {e.name}
                            <small>{e.type?.replace("urn:entity:", "")}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <details open>
                  <summary>
                    Agent tool log <span>↗</span>
                  </summary>
                  <ol className="tool-log">
                    {result.steps.map((s) => (
                      <li key={s.index}>
                        <span>{String(s.index).padStart(2, "0")}</span>
                        <div>
                          <strong>
                            {s.tool
                              .replace("qloo.", "Qloo / ")
                              .replaceAll("_", " ")}
                          </strong>
                          <p>{s.detail}</p>
                          {s.cached && <small>Request cache hit</small>}
                        </div>
                        <span className="step-check">✓</span>
                      </li>
                    ))}
                  </ol>
                </details>
                <div className="evidence-list">
                  <span className="eyebrow">EXPLORE THE SIGNALS</span>
                  <div>
                    {result.evidence.slice(0, 14).map((e) => (
                      <button
                        key={e.id}
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          setSelected(e);
                        }}
                      >
                        {e.name} ↗
                      </button>
                    ))}
                  </div>
                </div>
                <p className="agent-disclaimer">
                  {result.mode === "demo"
                    ? "All demo names, IDs and affinities are fictional fixtures. No live Qloo request was made."
                    : "Qloo supplies cultural affinity data. TasteRoom interprets it as interior design direction."}{" "}
                  Room illustrations are original conceptual artwork. Lighting
                  temperatures and furniture choices are design suggestions.
                </p>
              </aside>
            </div>
          </section>
        )}
      </main>
      <footer>
        <a className="wordmark" href="#">
          TasteRoom<span className="brand-dot">·</span>
        </a>
        <p>Make room for the things that make you.</p>
        <span>BUILT WITH QLOO · MADE FOR YOU</span>
      </footer>
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div
            className="signal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null);
              if (e.key === "Tab") {
                e.preventDefault();
                e.currentTarget.querySelector("button").focus();
              }
            }}
          >
            <button
              className="close-dialog"
              autoFocus
              onClick={() => setSelected(null)}
              aria-label="Close signal"
            >
              ×
            </button>
            <span className="eyebrow">{selected.id} / TASTE TRACE</span>
            <h2 id="signal-title">{selected.name}</h2>
            <p>
              From <strong>{selected.entity}</strong> in{" "}
              {selected.domain.replace("urn:entity:", "")} affinities.
            </p>
            <dl>
              <dt>Taste group</dt>
              <dd>{selected.owner}</dd>
              <dt>Entity ID</dt>
              <dd>{selected.entityId || selected.key}</dd>
              <dt>Source</dt>
              <dd>
                {result.mode === "demo"
                  ? "Original synthetic fixture"
                  : "Qloo API response"}
              </dd>
            </dl>
            <p className="small-note">
              This is cultural affinity evidence. The connection to a color,
              material or room choice is TasteRoom’s creative interpretation.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
