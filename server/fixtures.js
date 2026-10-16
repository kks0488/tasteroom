// Entirely fictional, original demo data. These UUIDs and tag IDs are not live Qloo IDs.
const tag = (name) => ({
  id: `urn:tag:style:tasteroom:${name.toLowerCase().replaceAll(" ", "_")}`,
  name,
  type: "urn:tag:style:tasteroom",
});
const quiet = ["Minimalism", "Ambient", "Craft", "Organic", "Warm"];
const expressive = ["Colorful", "Jazz", "Rhythm", "Warm"];
const make = (number, name, domain, names, group) => ({
  entity_id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  name,
  type: "urn:entity",
  subtype: `urn:entity:${domain}`,
  tags: names.map(tag),
  properties: { description: "Original synthetic TasteRoom demo entity." },
  group,
});

const inputs = [
  make(1, "The Quiet Atlas", "movie", quiet, "quiet"),
  make(2, "Low Tide Radio", "artist", quiet, "quiet"),
  make(3, "North Window House", "place", quiet, "quiet"),
  make(4, "Field Notes Press", "brand", quiet, "quiet"),
  make(5, "Paper Sun Parade", "movie", expressive, "expressive"),
  make(6, "Sunday Brass Club", "artist", expressive, "expressive"),
  make(7, "Clay Market Kitchen", "place", expressive, "expressive"),
  make(8, "Orchard After Hours", "book", expressive, "expressive"),
];

// id/types aliases are for the app's input catalog, not Qloo response fields.
export const DEMO_TASTES = inputs.map((entity) => ({
  ...entity,
  id: entity.entity_id,
  types: [entity.subtype],
}));

const recommendations = [
  make(11, "Grain & Loom Atelier", "brand", quiet, "quiet"),
  make(12, "Stillwater Objects", "brand", quiet, "quiet"),
  make(13, "Chromatic Hour Workshop", "brand", expressive, "expressive"),
  make(
    14,
    "Soft Geometry Works",
    "brand",
    ["Craft", "Warm", "Playful"],
    "shared",
  ),
  make(21, "Dawn Moss Conservatory", "place", quiet, "quiet"),
  make(22, "Tidefold Reading Room", "place", quiet, "quiet"),
  make(23, "Lantern Rhythm Hall", "place", expressive, "expressive"),
  make(
    24,
    "Gathered Light Courtyard",
    "place",
    ["Craft", "Warm", "Welcoming"],
    "shared",
  ),
  make(31, "Juniper Echo Ensemble", "artist", quiet, "quiet"),
  make(32, "Linen Moon Quartet", "artist", quiet, "quiet"),
  make(33, "Copper Carnival", "artist", expressive, "expressive"),
  make(34, "Amber Assembly", "artist", ["Craft", "Warm", "Rhythm"], "shared"),
  make(41, "The Patient Window", "book", quiet, "quiet"),
  make(42, "A Thousand Bright Corners", "book", expressive, "expressive"),
  make(
    43,
    "Rooms for Gathering",
    "book",
    ["Craft", "Warm", "Welcoming"],
    "shared",
  ),
];

function responseEntity(entity, affinity) {
  const { group, ...documented } = entity;
  return {
    ...documented,
    ...(affinity === undefined ? {} : { query: { affinity } }),
  };
}

export function searchFixture(query) {
  const normalized = query.toLowerCase().trim();
  return {
    success: true,
    duration: 0,
    results: inputs
      .filter((entity) => entity.name.toLowerCase().includes(normalized))
      .map((entity) => responseEntity(entity)),
  };
}

function scores(ids) {
  const selected = inputs.filter((entity) => ids.includes(entity.entity_id));
  const quietCount = selected.filter(
    (entity) => entity.group === "quiet",
  ).length;
  const expressiveCount = selected.filter(
    (entity) => entity.group === "expressive",
  ).length;
  const total = quietCount + expressiveCount || 1;
  return {
    quiet: quietCount / total,
    expressive: expressiveCount / total,
    shared: 0.72,
  };
}

export function insightsFixture(ids, type) {
  const weights = scores(ids);
  if (type === "urn:tag") {
    const selected = inputs.filter((entity) => ids.includes(entity.entity_id));
    const counts = new Map();
    for (const entity of selected)
      for (const item of entity.tags)
        counts.set(item.id, {
          ...item,
          count: (counts.get(item.id)?.count || 0) + 1,
        });
    const tags = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .map(({ id, name, type: subtype, count }) => ({
        tag_id: id,
        name,
        types: [...new Set(selected.map((entity) => entity.subtype))],
        subtype,
        tag_value: id,
        query: { affinity: count / (selected.length || 1) },
      }));
    return { success: true, results: { tags, duration: 0 } };
  }
  const entities = recommendations
    .filter((entity) => entity.subtype === type)
    .map((entity) =>
      responseEntity(
        entity,
        Number((0.35 + 0.6 * weights[entity.group]).toFixed(3)),
      ),
    )
    .sort((a, b) => b.query.affinity - a.query.affinity);
  return { success: true, results: { entities, duration: 0 } };
}

export function compareFixture(a, b) {
  const scoresA = new Map(
    insightsFixture(a, "urn:entity:brand").results.entities.map((entity) => [
      entity.entity_id,
      entity.query.affinity,
    ]),
  );
  const scoresB = new Map(
    insightsFixture(b, "urn:entity:brand").results.entities.map((entity) => [
      entity.entity_id,
      entity.query.affinity,
    ]),
  );
  const results = recommendations
    .filter((entity) => entity.subtype === "urn:entity:brand")
    .map((entity) =>
      responseEntity(
        entity,
        Math.min(scoresA.get(entity.entity_id), scoresB.get(entity.entity_id)),
      ),
    )
    .sort((x, y) => y.query.affinity - x.query.affinity);
  return { success: true, duration: 0, results };
}

// These are fictional affinities, not observations about a real neighborhood.
// Response envelope and entity/query fields follow the documented Insights API.
export function locationInsightsFixture(location, type, ids = []) {
  const label = typeof location === "string"
    ? location.trim().toLowerCase()
    : location.query?.trim().toLowerCase() || `${location.longitude},${location.latitude}`;
  const seed = [...label].reduce((sum, letter) => sum + letter.codePointAt(0), 0);
  const neighborhoodGroup = seed % 2 === 0 ? "quiet" : "expressive";
  const referenceWeights = scores(ids);
  const entities = recommendations
    .filter((entity) => entity.subtype === type)
    .map((entity) => {
      const locationWeight = entity.group === neighborhoodGroup ? 0.94
        : entity.group === "shared" ? 0.78 : 0.55;
      const affinity = ids.length
        ? locationWeight * 0.7 + (0.35 + referenceWeights[entity.group] * 0.6) * 0.3
        : locationWeight;
      return responseEntity(entity, Number(affinity.toFixed(3)));
    })
    .sort((a, b) => b.query.affinity - a.query.affinity);
  return { success: true, results: { entities }, duration: 0 };
}

// Qloo's demographic values are signed affinity scores, not population shares.
// The demographic cohort belongs to each selected taste entity, not the city.
export function demographicsFixture(ids) {
  return {
    success: true,
    results: {
      demographics: [...new Set(ids)].map((entity_id) => {
        const entity = [...inputs, ...recommendations].find((item) => item.entity_id === entity_id);
        const expressive = entity?.group === "expressive";
        return {
          entity_id,
          query: {
            age: {
              "24_and_younger": expressive ? 0.22 : -0.08,
              "25_to_29": expressive ? 0.43 : 0.18,
              "30_to_34": expressive ? 0.28 : 0.39,
              "35_to_44": expressive ? 0.06 : 0.27,
              "45_to_54": expressive ? -0.31 : -0.09,
              "55_and_older": expressive ? -0.24 : -0.28,
            },
            gender: { male: 0.04, female: -0.04 },
          },
        };
      }),
    },
    duration: 0,
  };
}
