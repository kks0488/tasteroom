import { QlooClient } from "./qloo.js";

export const BUSINESS_TYPES = ["Cafe", "Bar", "Bookstore", "Boutique"];
export function validateStorefront(raw) {
  if (typeof raw.neighborhood !== "string" || raw.neighborhood.trim().length < 3 || raw.neighborhood.length > 160)
    throw new Error("Add a neighborhood and city (3–160 characters).");
  if (!BUSINESS_TYPES.includes(raw.business)) throw new Error("Choose an available business type.");
  const area = Number(raw.area ?? 50);
  if (!Number.isFinite(area) || area < 10 || area > 500) throw new Error("Use an assumed area between 10 and 500 m².");
  const references = raw.references ?? [];
  if (!Array.isArray(references) || references.length > 3 || references.some(x => typeof x !== "string" || x.trim().length < 2 || x.length > 100))
    throw new Error("Use up to three brand references, each 2–100 characters.");
  return { mode: "storefront", neighborhood: raw.neighborhood.trim(), business: raw.business, area, references: [...new Set(references.map(x => x.trim()))] };
}
const entitiesOf = r => Array.isArray(r?.results) ? r.results : r?.results?.entities || [];
const idOf = e => e.entity_id || e.id;
const ageLabels = { "24_and_younger": "24 and younger", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55 and older" };
const themes = {
  calm: {
    label: "A slower corner of the city.",
    palette: [["Warm chalk", "#E9E1D0"], ["Sage", "#869071"], ["Oak", "#AE8B62"], ["Forest ink", "#3F5046"]],
    materials: [["Matte oak", "Repairable slatted joinery and rounded edges", "wood"], ["Limewash", "Soft mineral finish on the feature wall", "stone"], ["Woven linen", "Acoustic drapery and textured upholstery", "linen"]],
    names: ["Still & Stem", "The Slow Corner", "Common Grain"],
    music: "Gentle ambient textures and acoustic instrumentals; keep volume low enough for conversation.",
    zone: "A window-side discovery bench: one long oak surface, movable stools and a small rotating local-maker display.",
  },
  warm: {
    label: "A little rhythm. A local ritual.",
    palette: [["Soft plaster", "#E8CEAD"], ["Terracotta", "#B3684A"], ["Honey", "#C59B50"], ["Plum ink", "#62474D"]],
    materials: [["Oiled walnut", "Rounded counter and tactile display ledges", "wood"], ["Glazed clay", "Small tiles at the counter front", "stone"], ["Woven wool", "Durable upholstery and acoustic panels", "linen"]],
    names: ["Clay & Chorus", "The Amber Hour", "Gathering Notes"],
    music: "Warm jazz instrumentals and mellow rhythmic sets; use a properly licensed music service for public playback.",
    zone: "A terracotta gathering counter with a rotating maker shelf: a memorable focal point that also supports solo visits.",
  },
};
const productDirections = {
  Cafe: ["A short seasonal drinks menu, two house infusions and a small bakery collaboration.", "Seasonal espresso drinks, a toasted-grain signature and a rotating pastry collaboration."],
  Bar: ["A concise botanical drinks menu with equally considered alcohol-free options.", "A short seasonal cocktail list, an alcohol-free signature and small sharing plates."],
  Bookstore: ["Independent essays, place-based writing and a tactile reading table with staff notes.", "Art, music and independent magazines with a rotating small-press discovery table."],
  Boutique: ["A small edit of repairable everyday objects, natural textiles and local craft.", "Expressive ceramics, warm textiles and rotating small-batch maker collections."],
};

// USD planning allowances chosen by TasteRoom, not Qloo pricing or contractor quotes.
export function estimateBudget(area, business) {
  const hospitality = business === "Cafe" || business === "Bar";
  const categories = [
    ["Surfaces & finishes", 160, 300], ["Joinery & furniture", 180, 360],
    ["Lighting & electrical", 90, 180], ["Equipment & display", hospitality ? 220 : 90, hospitality ? 480 : 190],
    ["Design & contingency", 130, 260],
  ].map(([category, low, high]) => ({ category, low: Math.round(area * low), high: Math.round(area * high) }));
  return { currency: "USD", area, categories, low: categories.reduce((s,c)=>s+c.low,0), high: categories.reduce((s,c)=>s+c.high,0),
    note: `Rough planning estimate, not a quote. Assumes ${area} m², an existing serviced shell and a mid-range finish. USD allowances are illustrative and not localized market rates. Excludes lease/deposit, taxes, permits, structural works, major HVAC/plumbing, stock and operating costs. Obtain local surveys and contractor quotes.` };
}

export async function designStorefront(raw, { client, env = process.env, fetchImpl = fetch } = {}) {
  const input = validateStorefront(raw), steps = [], warnings = [];
  const onStep = step => steps.push({ ...step, index: steps.length + 1 });
  client ||= new QlooClient({ apiKey: env.QLOO_API_KEY, fetchImpl, onStep });
  const references = await Promise.all(input.references.map(async name => {
    const candidates = entitiesOf(await client.search(name));
    const match = candidates.find(e=>e.name?.toLowerCase() === name.toLowerCase()) || candidates[0];
    if (!match) throw new Error(client.mode === "demo" ? `“${name}” is outside the fictional demo catalog. Use sample brand references or clear the optional field.` : `No Qloo match for “${name}”. Try a more specific reference.`);
    if (match.name?.toLowerCase() !== name.toLowerCase()) warnings.push(`Resolved “${name}” to “${match.name}”. Refine the reference if needed.`);
    return match;
  }));
  const records = await Promise.all(["brand", "place", "artist"].map(async domain => ({
    domain, response: await client.locationInsights(input.neighborhood, `urn:entity:${domain}`, references.map(idOf)),
  })));
  const evidence = records.flatMap(({domain,response}) => entitiesOf(response).slice(0,4).filter(e=>e.name && idOf(e)).map(e=>({
    key:idOf(e), entityId:idOf(e), name:e.name, entity:e.name, domain:`urn:entity:${domain}`,
    owner:`Area affinity · ${input.neighborhood}`, tags:e.tags || [], affinity:e.query?.affinity,
    source: domain === "place" ? "signal.location.query + filter.location.query" : "signal.location.query",
  }))).map((e,i)=>({...e,id:`S${i+1}`}));
  if (!evidence.length) throw new Error("No usable Qloo location affinities returned. Try a broader neighborhood or city.");
  const brands = evidence.filter(e=>e.domain === "urn:entity:brand");
  let audience = [];
  if (brands.length) {
    const response = await client.demographics(brands.map(e=>e.entityId));
    audience = (response?.results?.demographics || []).flatMap(d => {
      const anchor = brands.find(e=>e.entityId === d.entity_id);
      if (!anchor) return [];
      const ranked = Object.entries(d.query?.age || {}).filter(([key,value])=>ageLabels[key] && Number.isFinite(value)).sort((a,b)=>b[1]-a[1]);
      if (!ranked.length) return [];
      const [bucket, affinity] = ranked[0];
      const entry = { id:`S${evidence.length+1}`, key:`${d.entity_id}:age:${bucket}`, entityId:d.entity_id,
        name:`${anchor.name} · age ${ageLabels[bucket]}`, entity:anchor.name, domain:"Qloo demographic affinity", owner:"Audience of area-affinity brands",
        source:"filter.type=urn:demographics + signal.interests.entities", affinity,
        detail:`Strongest returned age bucket: ${ageLabels[bucket]} (signed affinity ${affinity}). This describes an affinity entity's audience, not the neighborhood population.` };
      evidence.push(entry);
      return [entry];
    });
  }
  if (!audience.length) warnings.push("No usable demographic affinities were returned. Audience hypotheses need local customer research.");
  if (client.mode === "demo") warnings.push("Synthetic location and audience fixtures illustrate the workflow; they do not describe residents of this neighborhood. Different location text does not create real local knowledge.");
  const text = records.flatMap(r=>entitiesOf(r.response).slice(0,1)).flatMap(e=>[e.name,...(e.tags || []).map(t=>t.name)]).join(" ").toLowerCase();
  const warm = (text.match(/jazz|color|rhythm|clay|warm|express/g)||[]).length > (text.match(/ambient|minimal|slow|quiet|organic|craft/g)||[]).length;
  const direction = warm ? "warm" : "calm", theme = themes[direction];
  const reason = (interpretation, index = 0, includeAudience = false) => {
    const anchor = evidence.filter(e=>e.domain.startsWith("urn:entity:"))[index % (evidence.length-audience.length)];
    return {text:`${anchor.name} is a returned area-affinity signal. ${interpretation} TasteRoom interprets this cultural relationship; Qloo does not measure interior or commercial performance.${includeAudience && audience.length ? " Audience affinity informs a cohort to test with, not a claim about who lives here." : ""}`, evidence:[anchor.id,...(includeAudience && audience.length ? [audience[0].id] : [])]};
  };
  const brief = {
    mode:"storefront", title:theme.label, story:`A ${input.business.toLowerCase()} concept for ${input.neighborhood}, built from area taste signals.`, direction,
    business:input.business, neighborhood:input.neighborhood, room:input.business,
    names:theme.names.map((name,i)=>({name,reason:reason("A tactile, culturally resonant name sets the concept's tone. Check local name availability before use.",i)})),
    palette:theme.palette.map(([name,hex])=>({name,hex})), paletteReason:reason("Translate the area's cultural character into a balanced, recognizable palette."),
    materials:theme.materials.map(([name,description,texture],i)=>({name,description,texture,reason:reason("Use texture and finish to carry the cultural character into the space.",i+1)})),
    furniture:{text:`${theme.zone} Keep circulation clear; confirm accessibility and services with a measured site survey.`,reason:reason("Make one signature zone the anchor for the customer experience.",1,true)},
    lighting:[{time:"DAY",name:"Open & discover",kelvin:"3000K",description:"Daylight first, shaded task light at the counter, and clear product illumination."},{time:"NIGHT",name:"Gather & linger",kelvin:input.business === "Bar" ? "2200K" : "2700K",description:"Dimmable pendants and warm wall wash; keep entrances, tasks and exits clearly lit."}],
    lightingReason:reason("Use two lighting scenes to express the concept across the day.",2),
    music:{text:theme.music,reason:reason("Translate the returned artist and cultural affinities into a sonic direction, rather than copying a playlist.",8)},
    products:{text:productDirections[input.business][warm?1:0],reason:reason("Test a small product edit before committing to a full inventory or menu.",3)},
    event:{text:input.business === "Bookstore" ? "A small-press reading evening with a local-maker table and visitor voting for the next reading theme." : input.business === "Boutique" ? "A local-maker open studio: limited demonstrations, feedback cards and a preview of the first small collection." : "A neighborhood preview with a short tasting flight, a local-maker table and visitor feedback on the signature offering.",reason:reason("Use a small opening event to validate this taste hypothesis with actual visitors.",4,true)},
    audience, audienceNote:"Demographic results describe affinity audiences of brands returned by location research. Signed affinity scores are not percentages, footfall, census data or a sales forecast. All visitors are welcome.",
    budget:estimateBudget(input.area,input.business), budgetReason:reason("The concept establishes a scope for these TasteRoom planning allowances. Budget values are independent assumptions, not Qloo cost data."),
  };
  onStep({tool:"compose_storefront",detail:`Deterministic concept composed from ${evidence.length} area and audience signals.`});
  return { mode:client.mode, reasoning:"Deterministic storefront planner", brief, evidence, comparison:null,
    resolved:[{name:input.neighborhood, entities:references.map(e=>({id:idOf(e),name:e.name,type:e.subtype}))}], steps, warnings };
}
