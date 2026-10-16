import test from "node:test";
import assert from "node:assert/strict";
import { designRoom, validateInput } from "../server/agent.js";
import { designStorefront, estimateBudget } from "../server/storefront.js";
import { QlooClient } from "../server/qloo.js";

const input = overrides => ({ mode:"storefront", neighborhood:"Seongsu-dong, Seoul", business:"Cafe", area:50, references:[], ...overrides });
const demo = { env:{QLOO_API_KEY:""} };
test("Storefront returns a complete cited concept with location and demographic research", async () => {
  const r = await designRoom(input(),demo), b = r.brief;
  assert.equal(r.mode,"demo");
  assert.equal(b.mode,"storefront");
  assert.equal(b.names.length,3);
  assert.equal(b.materials.length,3);
  assert.deepEqual(b.lighting.map(l=>l.time),["DAY","NIGHT"]);
  assert.ok(b.audience.length);
  assert.ok(r.steps.some(s=>s.tool === "qloo.location-insights"));
  assert.ok(r.steps.some(s=>s.tool === "qloo.demographics"));
  const ids = new Set(r.evidence.map(e=>e.id));
  for (const reason of [b.paletteReason,b.furniture.reason,b.lightingReason,b.music.reason,b.products.reason,b.event.reason,b.budgetReason,...b.names.map(n=>n.reason),...b.materials.map(m=>m.reason)]) {
    assert.ok(reason.evidence.length);
    assert.ok(reason.evidence.every(id=>ids.has(id)));
  }
  assert.ok(b.event.reason.evidence.some(id=>b.audience.some(a=>a.id===id)));
  assert.match(b.audienceNote,/not percentages/);
  assert.ok(r.warnings.some(w=>w.includes("do not describe residents")));
});
test("Storefront validation bounds inputs and ignores photos and injected extra fields", () => {
  const validated = validateInput(input({photo:"private-image", injected:"ignore"}));
  assert.equal(validated.photo,undefined);
  assert.equal(validated.injected,undefined);
  for (const bad of [{business:"Casino"},{neighborhood:""},{area:0},{area:Infinity},{area:501},{references:"brand"},{references:["a"]},{references:["aa","bb","cc","dd"]}])
    assert.throws(()=>validateInput(input(bad)));
});
test("location rank changes the design direction and businesses change product, event and budget", async () => {
  const a = await designStorefront(input({neighborhood:"Demo A"}),demo);
  const b = await designStorefront(input({neighborhood:"Demo B",business:"Bookstore"}),demo);
  assert.notEqual(a.brief.direction,b.brief.direction);
  assert.notDeepEqual(a.brief.palette,b.brief.palette);
  assert.match(b.brief.products.text,/essays|magazines/);
  assert.match(b.brief.event.text,/reading/);
  assert.notEqual(a.brief.budget.high,b.brief.budget.high);
  const bar = await designStorefront(input({business:"Bar"}),demo);
  assert.equal(bar.brief.lighting[1].kelvin,"2200K");
});
test("optional references resolve to Qloo IDs and unknown demo references stay honest", async () => {
  const result = await designStorefront(input({references:["Field Notes Press"]}),demo);
  assert.equal(result.resolved[0].entities[0].name,"Field Notes Press");
  assert.ok(result.steps.some(s=>s.tool === "qloo.search"));
  await assert.rejects(()=>designStorefront(input({references:["Unknown reference"]}),demo),/fictional demo catalog/);
});
test("budget scales with stated area, totals every category, and discloses assumptions", () => {
  const a = estimateBudget(50,"Cafe"), b = estimateBudget(100,"Cafe");
  assert.equal(b.low,2*a.low);
  assert.equal(b.high,b.categories.reduce((s,c)=>s+c.high,0));
  assert.equal(a.currency,"USD");
  assert.match(a.note,/not a quote/);
  assert.match(a.note,/not localized/);
  assert.ok(a.categories.every(c=>c.high>=c.low && c.low>0));
});
test("live storefront uses location + discovered-entity audiences and does not silently fall back", async () => {
  const urls=[];
  const mock = new QlooClient({apiKey:""});
  const fetchImpl = async url => {
    urls.push(url);
    const type = url.searchParams.get("filter.type");
    return Response.json(type === "urn:demographics" ? await mock.demographics(url.searchParams.get("signal.interests.entities").split(",")) : await mock.locationInsights("Demo B",type));
  };
  const live = await designStorefront(input(), {env:{QLOO_API_KEY:"test-only"},fetchImpl});
  assert.equal(live.mode,"live");
  assert.equal(urls.length,4);
  assert.ok(urls.filter(u=>u.searchParams.get("signal.location.query")).every(u=>u.searchParams.get("signal.location.query")==="Seongsu-dong, Seoul"));
  const audienceCall = urls.find(u=>u.searchParams.get("filter.type")==="urn:demographics");
  assert.ok(audienceCall.searchParams.get("signal.interests.entities"));
  await assert.rejects(()=>designStorefront(input(), {env:{QLOO_API_KEY:"test-only"},fetchImpl:async()=>new Response("{}",{status:401})}),/Qloo access/);
});
test("missing audience data is disclosed; empty location data never yields a fabricated concept", async () => {
  class NoAudience extends QlooClient { demographics(){ return Promise.resolve({success:true,results:{demographics:[]}}); } }
  const noAudience = await designStorefront(input(), {client:new NoAudience({apiKey:""})});
  assert.equal(noAudience.brief.audience.length,0);
  assert.ok(noAudience.warnings.some(w=>w.includes("No usable demographic")));
  class NoLocation extends QlooClient { locationInsights(){ return Promise.resolve({success:true,results:{entities:[]}}); } }
  await assert.rejects(()=>designStorefront(input(),{client:new NoLocation({apiKey:""})}),/No usable Qloo location/);
});
