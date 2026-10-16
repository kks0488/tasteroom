import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import RoomArt from "./RoomArt.jsx";
import StoreArt from "./StoreArt.jsx";
import { DEMO_TASTES } from "../server/fixtures.js";
import "./style.css";
const liveSampleA = ["Amélie", "Radiohead", "MUJI"];
const liveSampleB = ["Spirited Away", "Björk", "IKEA"];
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
      { name: "Alex", tastes: ["", "", ""] },
      { name: "Sam", tastes: ["", "", ""] },
    ]),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [copied, setCopied] = useState(false),
    [progress, setProgress] = useState(0);
  const [dataMode, setDataMode] = useState("loading");
  const modeReady = dataMode === "live" || dataMode === "demo";
  const [store, setStore] = useState({ neighborhood: "Seongsu-dong, Seoul", business: "Cafe", area: 50, references: "" });
  const [photo, setPhoto] = useState(null);
  useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo]);
  const changeMode = value => { setMode(value); setResult(null); setError(""); };
  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP image under 8 MB."); event.target.value = ""; return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setPhoto({ url, width: img.naturalWidth, height: img.naturalHeight }); setError(""); };
    img.onerror = () => { URL.revokeObjectURL(url); setError("This image could not be opened. Try a JPG, PNG or WebP."); };
    img.src = url;
  }
  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw new Error("Server configuration unavailable.");
        return r.json();
      })
      .then((config) => {
        if (!["live", "demo"].includes(config.dataMode))
          throw new Error("Server configuration unavailable.");
        setDataMode(config.dataMode);
        setPeople((ps) => ps.map((p, i) => ({
          ...p,
          tastes: config.dataMode === "live"
            ? (i === 0 ? liveSampleA : liveSampleB)
            : (i === 0 ? sampleA : sampleB),
        })));
      })
      .catch(() => {
        setDataMode("unavailable");
        setError("Could not load the server mode. Reload to try again.");
      });
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
    if (!modeReady) return;
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
        body: JSON.stringify(mode === "storefront" ? {
          mode, ...store, references: store.references.split(",").map(x => x.trim()).filter(Boolean),
        } : { mode, room, people: people.slice(0, mode === "shared" ? 2 : 1) }),
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
    const text = b.mode === "storefront" ? [
      "TASTEROOM / STOREFRONT", `${result.mode.toUpperCase()} DATA · ${result.reasoning}`,
      b.title, b.story, "NAME IDEAS", ...b.names.map(n => `${n.name}: ${n.reason.text}`),
      "PALETTE", ...b.palette.map(p => `${p.name} ${p.hex}`), b.paletteReason.text,
      "MATERIALS", ...b.materials.map(m => `${m.name}: ${m.description}. ${m.reason.text}`),
      "SIGNATURE ZONE", b.furniture.text, b.furniture.reason.text,
      "LIGHTING", ...b.lighting.map(l => `${l.time}: ${l.kelvin}. ${l.description}`), b.lightingReason.text,
      ...[b.music, b.products, b.event].flatMap(x => [x.text, x.reason.text]),
      "AUDIENCE", b.audienceNote, ...b.audience.map(a => a.detail),
      "ROUGH BUDGET (USD)", ...b.budget.categories.map(c => `${c.category}: ${c.low}–${c.high}`),
      `Total: ${b.budget.low}–${b.budget.high}`, b.budget.note, b.budgetReason.text,
      "EVIDENCE", ...result.evidence.map(e => `${e.id}: ${e.name} ← ${e.entity} (${e.owner}); ${e.source}`),
    ].join("\n") : [
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
      ...b.shopping.map((s) => `☐ ${s.category}: ${s.item}. Why: ${s.reason.text} [${s.reason.evidence.join(", ")}]`),
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
              <span className="dot" /> TasteRoom — the Taste-to-Space agent
            </div>
            <h1>
              Your taste.
              <br />
              Your <em>space.</em>
            </h1>
            <p className="hero-description">
              Favorite movies, music, brands and places become an interior
              style brief, a color and material palette, and furniture and decor ideas.
              <br />
              <strong>Qloo finds cultural connections. See why each idea fits.</strong>
            </p>
            <button className="primary" disabled={busy} onClick={() => { changeMode("solo"); scrollToForm(); }}>
              Create my room brief <Arrow />
            </button>
            <div className="hero-foot">
              <span className="little-mark">✳</span>
              <span>
                Start with the culture you love.
                <br />
                Explore a personal room, a shared home or a storefront.
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <RoomArt direction="calm" room="Living room" />
            <div className="room-label">
              <span>
                <span className="dot" /> MY ROOM / CONCEPTUAL ILLUSTRATION
              </span>
              <span>STUDY Nº 001</span>
            </div>
            <div className="floating-note">
              <span>THE STARTING POINT</span>
              <p>
                Movies. Music. Places.
                <br />
                A room with your story.
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
            01 &nbsp; Bring your tastes or a location
            <br />
            02 &nbsp; Explore Qloo cultural signals
            <br />
            03 &nbsp; Build a space with a story
          </div>
        </div>
        <section className="studio" id="studio" ref={formRef}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">01 / THE INGREDIENTS</span>
              <h2>One agent. Three kinds of space.</h2>
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
                  : dataMode === "demo"
                    ? "Offline demo · fictional tastes and synthetic evidence."
                    : dataMode === "loading" ? "Checking the server mode…" : "Server mode unavailable."}
              </strong>
              <span>
                {dataMode === "live"
                  ? "Enter real films, artists, restaurants, places, books or brands. Your tastes are resolved and researched through Qloo."
                  : dataMode === "demo"
                    ? "No Qloo key is configured. These fixtures demonstrate the flow; they are not real Qloo discoveries."
                    : "The studio waits for its server configuration before sending your tastes."}
              </span>
            </div>
            <span className="demo-pill">
              {dataMode === "live"
                ? "SERVER KEY CONFIGURED"
                : dataMode === "demo" ? "SYNTHETIC OFFLINE DEMO" : "WAITING FOR SERVER"}
            </span>
          </div>
          <form onSubmit={submit}>
            <div className="form-top">
              <div className="mode-switch mode-cards" aria-label="Design mode">
                {[
                  ["solo", "My Room", "Your films, music and favorites → a personal interior brief."],
                  ["shared", "Shared Space", "Two taste profiles → common ground and personal corners."],
                  ["storefront", "Storefront", "An empty unit + area taste → a store with local character."],
                ].map(([value, title, description]) => <button type="button" key={value}
                  className={mode === value ? "active" : ""} aria-pressed={mode === value}
                  disabled={busy} onClick={() => changeMode(value)}>
                  <strong>{title} <span aria-hidden="true">↗</span></strong><span>{description}</span>
                  {value === "solo" && <small>TASTE-TO-SPACE</small>}
                </button>)}
              </div>
              {mode !== "storefront" && <label className="room-select">
                MAKE ROOM FOR
                <select value={room} onChange={(e) => setRoom(e.target.value)}>
                  <option>Living room</option>
                  <option>Bedroom</option>
                  <option>Home office</option>
                </select>
              </label>}
            </div>
            {mode === "storefront" ? <div className="store-inputs">
              <div className="space-reference">
                <StoreArt photo={photo?.url} />
                <label className="upload-label">Photo of your empty space
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} />
                </label>
                <p>{photo ? `${photo.width} × ${photo.height} px · preview only` : "Start with our original illustration, or choose your own photo."} Images stay in your browser. We do not analyze pixels, infer measurements or send photos to Qloo.</p>
                {photo && <button type="button" className="text-button" onClick={() => setPhoto(null)}>Use sample illustration ↗</button>}
              </div>
              <div className="store-fields">
                <span className="eyebrow">A NEIGHBORHOOD IS A STARTING POINT</span>
                <h3>Give this space a reason to exist.</h3>
                <label>Neighborhood / city<input required minLength="3" maxLength="160" value={store.neighborhood} onChange={e=>setStore({...store,neighborhood:e.target.value})} placeholder="Neighborhood, city" /></label>
                <div className="store-field-row">
                  <label>Business type<select value={store.business} onChange={e=>setStore({...store,business:e.target.value})}>{["Cafe","Bar","Bookstore","Boutique"].map(b=><option key={b}>{b}</option>)}</select></label>
                  <label>Assumed floor area (m²)<input type="number" required min="10" max="500" value={store.area} onChange={e=>setStore({...store,area:e.target.value})} /></label>
                </div>
                <label>Brand references (optional)<input maxLength="300" value={store.references} onChange={e=>setStore({...store,references:e.target.value})} placeholder={dataMode === "demo" ? "Field Notes Press" : "Up to 3 names, separated by commas"} /></label>
                <p className="input-hint">{dataMode === "demo" ? "Demo reference: Field Notes Press. All area and audience signals are fictional, even when you enter a real city." : "Qloo combines area affinity with your optional references, then returns audience affinities for the discovered brands."}</p>
                <p className="input-hint">For landlords, brokers, small founders and interior designers. The assumed area guides an illustrative USD budget, not a measured quote.</p>
              </div>
            </div> : <div className={`people-grid ${mode === "shared" ? "two" : ""}`}>
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
                    {modeReady && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          edit(i, "tastes", dataMode === "live"
                            ? (i === 0 ? liveSampleA : liveSampleB)
                            : (i === 0 ? sampleA : sampleB))
                        }
                      >
                        {dataMode === "live" ? "Use real sample ↗" : "Use fictional sample ↗"}
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
            </div>}
            {dataMode === "demo" && <datalist id="demo-tastes">
              {DEMO_TASTES.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.types[0].replace("urn:entity:", "")} · fictional demo taste
                </option>
              ))}
            </datalist>}
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
              <button className="primary" type="submit" disabled={busy || !modeReady}>
                {busy
                  ? "Connecting your taste…"
                  : mode === "storefront"
                    ? "Create store concept"
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
                    mode === "storefront" ? "Exploring area taste signals…" : "Resolving your cultural tastes…",
                    mode === "storefront" ? "Following local places and cultural affinities…" : "Exploring cross-domain affinities…",
                    mode === "shared"
                      ? "Comparing both worlds…"
                      : "Following the taste signals…",
                    mode === "storefront" ? "Composing your store concept…" : "Composing your room brief…",
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
              <span className="eyebrow">02 / {result.brief.mode === "storefront" ? "YOUR STOREFRONT CONCEPT" : "YOUR ROOM, DECODED"}</span>
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
                  {result.brief.mode === "storefront" ? <div className="store-result-pair"><StoreArt photo={photo?.url} /><StoreArt after direction={result.brief.direction} business={result.brief.business} /></div> : <RoomArt
                    direction={result.brief.direction}
                    room={result.brief.room}
                  />}
                  {result.brief.mode !== "storefront" && <span className="art-caption">
                    {result.brief.room.toUpperCase()} / CONCEPTUAL ILLUSTRATION
                    · NOT A RENDER
                  </span>}
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
                  <h3>{result.brief.mode === "storefront" ? "The signature zone." : "Give the room its rhythm."}</h3>
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
                {result.brief.mode === "storefront" && <>
                  <article className="furniture-card name-ideas">
                    <span className="eyebrow">A FIRST IMPRESSION</span><h3>Three names to try on.</h3>
                    {result.brief.names.map(n=><div key={n.name}><h4>{n.name}</h4>{trace(n.reason)}</div>)}
                  </article>
                  {[ ["Music direction", result.brief.music], ["Menu / product direction", result.brief.products], ["An opening worth visiting", result.brief.event] ].map(([title, choice])=><article className="furniture-card" key={title}><h3>{title}</h3><p>{choice.text}</p>{trace(choice.reason)}</article>)}
                  <article className="furniture-card audience-card"><span className="eyebrow">AUDIENCE / A HYPOTHESIS TO TEST</span><h3>Who might connect?</h3><p>{result.brief.audienceNote}</p>
                    {result.brief.audience.length ? result.brief.audience.map(a=><div key={a.id}><p>{a.detail}</p>{trace({text:"Audience affinity from an area-affinity brand, not a local census.",evidence:[a.id]})}</div>) : <p>No usable audience data returned. Validate with local visitors.</p>}
                  </article>
                  <article className="furniture-card budget-card"><span className="eyebrow">ROUGH ESTIMATE / NOT A QUOTE</span><h3>A starting budget.</h3><p>{result.brief.budget.note}</p>
                    <table><caption>Illustrative fit-out allowances · {result.brief.budget.area} m² · USD</caption><thead><tr><th scope="col">Category</th><th scope="col">Low</th><th scope="col">High</th></tr></thead><tbody>{result.brief.budget.categories.map(c=><tr key={c.category}><th scope="row">{c.category}</th><td>${c.low.toLocaleString("en-US")}</td><td>${c.high.toLocaleString("en-US")}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th><td>${result.brief.budget.low.toLocaleString("en-US")}</td><td>${result.brief.budget.high.toLocaleString("en-US")}</td></tr></tfoot></table>
                    {trace(result.brief.budgetReason)}
                  </article>
                </>}
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
                {result.brief.mode !== "storefront" && <article className="shopping-card">
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
                          <small style={{ textTransform: "none", letterSpacing: 0, lineHeight: 1.5, marginTop: 8 }}>
                            {s.reason.text} · {s.reason.evidence.join(", ")}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </article>}
              </div>
              <aside className="agent-panel">
                <div className="agent-panel-title">
                  <span className="dot" />
                  <h3>{result.brief.mode === "storefront" ? "Behind the concept" : "Behind the room"}</h3>
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
        <p>TasteRoom — the Taste-to-Space agent<br />By an architecture graduate · Industrial Engineer, Interior Architecture (Korea)</p>
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
              {selected.source && <><dt>Research parameters</dt><dd>{selected.source}</dd></>}
              {selected.detail && <><dt>Audience context</dt><dd>{selected.detail}</dd></>}
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
