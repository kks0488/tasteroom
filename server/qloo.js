import {
  searchFixture,
  insightsFixture,
  compareFixture,
  locationInsightsFixture,
  demographicsFixture,
} from "./fixtures.js";

export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";
const SUPPORTED_TYPES = new Set([
  "urn:entity:brand",
  "urn:entity:artist",
  "urn:entity:place",
  "urn:entity:book",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:tv_show",
  "urn:entity:podcast",
  "urn:entity:locality",
  "urn:entity:videogame",
  "urn:tag",
]);

export class QlooError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "QlooError";
    this.status = status;
  }
}

function entityIds(ids) {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 10 ||
    ids.some(
      (id) =>
        typeof id !== "string" ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id),
    )
  ) {
    throw new QlooError("Provide between 1 and 10 resolved entity IDs.", 400);
  }
  return [...new Set(ids)].join(",");
}

// Location signals rank cross-domain taste. A location filter additionally scopes
// place results geographically; that filter is not supported for brands/artists.
export function buildLocationParams(
  location,
  { type = "urn:entity:brand", ids = [] } = {},
) {
  if (!SUPPORTED_TYPES.has(type) || type === "urn:tag")
    throw new QlooError("That location insight category is unavailable.", 400);
  const params = { "filter.type": type, take: "8" };
  const localPlaces = type === "urn:entity:place";
  const value = typeof location === "string" ? { query: location } : location;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new QlooError("Enter a neighborhood and city for this space.", 400);
  if (typeof value.query === "string" && value.query.trim()) {
    const query = value.query.trim();
    if (query.length > 160)
      throw new QlooError("Keep the neighborhood and city under 160 characters.", 400);
    params["signal.location.query"] = query;
    if (localPlaces) params["filter.location.query"] = query;
  } else {
    const { latitude, longitude } = value;
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    )
      throw new QlooError("Enter a neighborhood and city or valid coordinates.", 400);
    const point = `POINT(${longitude} ${latitude})`;
    params["signal.location"] = point;
    if (localPlaces) params["filter.location"] = point;
    // Leave radius unset by default so Qloo can use dynamic density discovery.
    if (value.radius !== undefined) {
      if (!Number.isInteger(value.radius) || value.radius <= 0 || value.radius > 100000)
        throw new QlooError("The location radius must be 1–100000 meters.", 400);
      params["signal.location.radius"] = String(value.radius);
      if (localPlaces) params["filter.location.radius"] = String(value.radius);
    }
  }
  if (!Array.isArray(ids))
    throw new QlooError("Provide resolved brand reference IDs.", 400);
  if (ids.length) params["signal.interests.entities"] = entityIds(ids);
  return params;
}

export class QlooClient {
  constructor({
    apiKey = process.env.QLOO_API_KEY,
    fetchImpl = fetch,
    onStep = () => {},
  } = {}) {
    this.apiKey = typeof apiKey === "string" ? apiKey.trim() : "";
    this.mode = this.apiKey ? "live" : "demo";
    this.fetchImpl = fetchImpl;
    this.onStep = onStep;
    this.cache = new Map();
    this.requestCount = 0;
  }

  async request(path, params, tool, detail, fixture) {
    const url = new URL(path, QLOO_BASE_URL);
    url.search = new URLSearchParams(params).toString();
    const cacheKey = url.toString();
    if (this.cache.has(cacheKey)) {
      this.onStep({ tool, detail, cached: true });
      return this.cache.get(cacheKey);
    }
    if (this.requestCount >= 32)
      throw new QlooError(
        "This room reached its research limit. Start a new room to continue.",
        429,
      );
    this.requestCount += 1;
    this.onStep({ tool, detail, cached: false });
    const pending = (async () => {
      if (this.mode === "demo") return fixture();
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          if (response.status === 429)
            throw new QlooError(
              "Qloo is rate limited. Please try this room again shortly.",
              429,
            );
          if (response.status === 401 || response.status === 403)
            throw new QlooError(
              "Qloo access is unavailable. Check the server API key and permitted entity types.",
              503,
            );
          throw new QlooError(
            "Qloo could not complete this research. Please try again.",
            502,
          );
        }
        const data = await response.json();
        if (
          !data ||
          data.success !== true ||
          !data.results ||
          typeof data.results !== "object"
        )
          throw new QlooError(
            "Qloo returned an incomplete response. Please try again.",
          );
        return data;
      } catch (error) {
        if (error instanceof QlooError) throw error;
        // Never expose fetch errors, upstream response bodies, URLs or credentials.
        throw new QlooError(
          "Qloo research timed out or could not connect. Please try again.",
          503,
        );
      }
    })();
    this.cache.set(cacheKey, pending);
    try {
      return await pending;
    } catch (error) {
      this.cache.delete(cacheKey);
      throw error;
    }
  }

  search(query) {
    if (typeof query !== "string" || !query.trim() || query.length > 120)
      throw new QlooError(
        "Enter a taste name between 1 and 120 characters.",
        400,
      );
    const text = query.trim();
    return this.request(
      "/search",
      { query: text, take: "5" },
      "qloo.search",
      `Resolve “${text}” to an entity`,
      () => searchFixture(text),
    );
  }

  insights(ids, type = "urn:entity:brand") {
    const entities = entityIds(ids);
    if (!SUPPORTED_TYPES.has(type))
      throw new QlooError("That insight category is unavailable.", 400);
    return this.request(
      "/v2/insights",
      { "filter.type": type, "signal.interests.entities": entities, take: "8" },
      "qloo.insights",
      `Explore ${type.replace("urn:entity:", "").replace("urn:", "")} affinities from ${ids.length} tastes`,
      () => insightsFixture(ids, type),
    );
  }

  locationInsights(location, type = "urn:entity:brand", ids = []) {
    const params = buildLocationParams(location, { type, ids });
    const label = params["signal.location.query"] || params["signal.location"];
    return this.request(
      "/v2/insights",
      params,
      "qloo.location-insights",
      `Explore ${type.replace("urn:entity:", "")} tastes around ${label}`,
      () => locationInsightsFixture(location, type, ids),
    );
  }

  demographics(ids) {
    const entities = entityIds(ids);
    return this.request(
      "/v2/insights",
      { "filter.type": "urn:demographics", "signal.interests.entities": entities },
      "qloo.demographics",
      `Explore audience age and gender affinities for ${ids.length} location-related tastes`,
      () => demographicsFixture(ids),
    );
  }

  compare(a, b) {
    const first = entityIds(a);
    const second = entityIds(b);
    // Official Analysis Compare path; /v2/insights/compare is not documented.
    return this.request(
      "/v2/analysis/compare",
      {
        "a.signal.interests.entities": first,
        "b.signal.interests.entities": second,
        "filter.type": "urn:entity:brand",
        take: "8",
      },
      "qloo.compare",
      `Find common brand affinities between ${a.length} and ${b.length} tastes`,
      () => compareFixture(a, b),
    );
  }
}
