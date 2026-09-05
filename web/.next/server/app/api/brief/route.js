(()=>{var a={};a.id=542,a.ids=[542],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},3033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},3540:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>Q,patchFetch:()=>P,routeModule:()=>L,serverHooks:()=>O,workAsyncStorage:()=>M,workUnitAsyncStorage:()=>N});var d={};c.r(d),c.d(d,{POST:()=>J,dynamic:()=>I,runtime:()=>H});var e=c(5736),f=c(9117),g=c(4044),h=c(9326),i=c(2324),j=c(261),k=c(4290),l=c(5328),m=c(8928),n=c(6595),o=c(3421),p=c(7679),q=c(1681),r=c(3446),s=c(6439),t=c(1356),u=c(641),v=c(5511),w=c.n(v);let x=["reddit","fbref"];class y extends Error{}let z=["https://feeds.bbci.co.uk/sport/football/rss.xml","https://www.espn.com/espn/rss/soccer/news"];async function A(a,b,c=5){let d=a.join(" ")||"football",e=`https://www.reddit.com/r/soccer/search.json?q=${encodeURIComponent(d)}&restrict_sr=1&sort=new&limit=${c}`,f=[],g=[];try{let a=await b(e,{headers:{"User-Agent":"md2yt-research/1.0 (by /u/md2yt)"}});if(!a.ok)return{sources:f,observations:g};let c=await a.json();for(let a of c?.data?.children??[]){let b=a?.data;if(!b?.id||!b?.title)continue;let c=`reddit_thread_${b.id}`;f.push({id:c,kind:"reddit_thread",url:`https://reddit.com${b.permalink??""}`,title:b.title}),b.selftext&&b.selftext.length>20?g.push({sourceId:c,text:b.selftext.slice(0,300)}):g.push({sourceId:c,text:b.title})}}catch{}return{sources:f,observations:g}}async function B(a,b,c=z){let d=[],e=[],f=a.map(a=>a.toLowerCase());for(let a of c)try{let c=await b(a);if(!c.ok)continue;let g=await c.text();for(let a of function(a){let b=[];for(let c of a.match(/<item[\s\S]*?<\/item>/g)??[])b.push({title:C(c,"title"),link:C(c,"link"),description:C(c,"description")});return b}(g)){let b=`${a.title} ${a.description}`.toLowerCase();if(f.length>0&&!f.some(a=>b.includes(a)))continue;let c=`rss_article_${function(a){let b=0;for(let c=0;c<a.length;c++)b=(b<<5)-b+a.charCodeAt(c)|0;return Math.abs(b).toString(16)}(a.link||a.title)}`;d.push({id:c,kind:"rss_article",url:a.link,title:a.title}),e.push({sourceId:c,text:`${a.title}: ${a.description}`.slice(0,300)})}}catch{}return{sources:d,observations:e}}function C(a,b){let c=a.match(RegExp(`<${b}[^>]*>([\\s\\S]*?)<\\/${b}>`,"i"));return c?c[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/,"$1").replace(/<[^>]+>/g,"").trim():""}async function D(a,b=fetch){let[d,e]=await Promise.all([A(a,b),B(a,b)]),f=[...d.sources,...e.sources],g=[...d.observations,...e.observations],h=new Date().toISOString();return{bundleKind:"reddit",sources:f,observations:g,retrievedAt:h,snapshotId:function(a,b,d){if(!x.includes(a))throw new y(`unknown bundle_kind ${a}, expected one of ${x.join(", ")}`);let e=(function(a){let{createHash:b}=c(5511);return b("sha256").update(a).digest("hex")})(JSON.stringify({bundle_kind:a,source_ids:[...b].sort(),retrieved_at:d})).slice(0,32);return`ev_${a}_${e}`}("reddit",f.map(a=>a.id),h)}}function E(a,b,c=fetch){let d=b?"https://openrouter.ai/api/v1/chat/completions":"https://api.openai.com/v1/chat/completions",e=b?"google/gemini-2.0-flash-001":"gpt-4o-mini";return{name:"openrouter",async generateText(f,g){let h=[...g?.system?[{role:"system",content:g.system}]:[],{role:"user",content:f}],i=await c(d,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${a}`},body:JSON.stringify({model:e,messages:h,temperature:.7,max_tokens:1800})});if(!i.ok){let a=await i.text().catch(()=>"");throw Error(`${b?"OpenRouter":"OpenAI"} request failed: ${i.status} ${a.slice(0,200)}`)}let j=await i.json(),k=j?.choices?.[0]?.message?.content;if("string"!=typeof k||0===k.length)throw Error(`${b?"OpenRouter":"OpenAI"} response had no content`);return k}}}class F extends Error{}async function G(a,b,c,d){let e=await a.generateText(b,d);try{return c(e)}catch(h){let f=`${b}

Your previous response failed validation with this error:
${h instanceof Error?h.message:String(h)}

Your previous response was:
${e.slice(0,1e3)}

Fix the issue and respond again, following the required format exactly.`,g=await a.generateText(f,d);try{return c(g)}catch(a){throw new F(`Generation failed validation twice. Last error: ${a instanceof Error?a.message:String(a)}`)}}}let H="nodejs",I="force-dynamic";async function J(a){try{let b,{mode:c,formData:d,transcript:e}=await a.json(),f=w().randomBytes(4).toString("hex"),g="",h=function(a=fetch,b=process.env){return b.GEMINI_API_KEY?function(a,b=fetch){return{name:"gemini",async generateText(c,d){let e={contents:[{role:"user",parts:[{text:c}]}]};d?.system&&(e.systemInstruction={parts:[{text:d.system}]});let f=await b(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${a}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!f.ok){let a=await f.text().catch(()=>"");throw Error(`Gemini request failed: ${f.status} ${a.slice(0,200)}`)}let g=await f.json(),h=g?.candidates?.[0]?.content?.parts?.[0]?.text;if("string"!=typeof h||0===h.length)throw Error("Gemini response had no text content");return h}}}(b.GEMINI_API_KEY,a):b.OMNIROUTE_API_KEY||b.OPENROUTER_API_KEY?E(b.OMNIROUTE_API_KEY||b.OPENROUTER_API_KEY,!0,a):b.OPENAI_API_KEY?E(b.OPENAI_API_KEY,!1,a):null}();if(h&&("research"===c||"topic-only"===c))try{g=await K({provider:h,mode:c,formData:d,transcript:e})}catch(a){console.warn("LLM enrichment failed after retry, falling back to grounded research:",a)}if(!(g&&g.includes("## Hook")&&g.includes("## Scene"))){let a=(d.teams||"").split(",").map(a=>a.trim()).filter(Boolean);try{b=await D(a)}catch(a){console.warn("Research bundle fetch failed, falling back with no grounded facts:",a)}}let i=function({briefId:a,mode:b,formData:c,transcript:d,enrichedContent:e,researchBundle:f}){if(e&&e.includes("## Hook")&&e.includes("## Scene"))return e;let g=c.matchTitle||d?.slice(0,40)||"Match Breakdown",h=c.teams||"Team A vs Team B",i=c.keyMoments||d||"Key tactical moments.",j=c.analysisAngle||"defensive-collapse",k=c.tone||"analytical",l=c.cta||"Which team should we break down next? Subscribe for more tactical analysis!",m=h.split(",").map(a=>a.trim()),n=m[0]||"Home Team",o=m[1]||"Away Team",p=j.toUpperCase().replace(/-/g," "),q=f?.sources??[],r=f?.observations??[],s=r[0]?.text?.replace(/\n/g," ").slice(0,140),t=r[1]?.text?.replace(/\n/g," ").slice(0,140),u=s?`"${s}"`:`"${i.slice(0,120).replace(/\n/g," ")}"`,v=t?`Reported context: "${t}" — verify tactical specifics against FBref before finalizing the script.`:"TODO: NEEDS VERIFICATION — no grounded source found for a tactical claim here. Pull FBref/Transfermarkt stats before writing this scene's voiceover.";return`# 🎬 Content Brief: ${g}

> **Brief ID:** ${a}
> **Mode:** ${b} | **Tone:** ${k}

## The Idea
**Core concept:** ${j} — tactical breakdown of ${h}.
**Unique angle:** ${g}. Focusing on key momentum swings and structural failures.
**Why now:** Trending match discussion following recent performance.

## Hook
**Kind:** hook
**Duration:** 8s
**Query:** football stadium crowd floodlights
**Top label:** LIVE BREAKDOWN
**Bottom label:** ${h.toUpperCase()}
**Pill:** TACTICAL
**Eyebrow:** // MATCH ANALYSIS
**Headline:** THE <accent>${p}</accent>
**Subhead:** // HOW THE MATCH WAS LOST IN 90 MINUTES
**Voiceover:** "${g}. When the final whistle blew, nobody expected this tactical collapse."

## Scene 1 — The Turning Point
**Kind:** record
**Duration:** 10s
**Query:** stopwatch timer referee whistle
**Top label:** 01 — TURNING POINT
**Bottom label:** STATISTICAL IMPACT
**Pill:** LIVE
**Eyebrow:** // THE SHIFT
**Name:** ${q.length>0?"SOURCE SIGNAL":"NEEDS VERIFICATION"}
**Counter label:** SOURCES REFERENCED
**Counter num:** ${q.length}
**Counter suffix:** ${q.length>0?"fan/media sources found this week":"no sources found — verify manually"}
**Voiceover:** ${u}

## Scene 2 — Tactical Breakdown
**Kind:** split
**Variant:** side-by-side
**Duration:** 14s
**Query:** football tactics board diagram
**Top label:** 02 — TACTICAL ANALYSIS
**Bottom label:** NEEDS VERIFICATION
**Eyebrow:** // SYSTEM FAILURE
**Headline:** TACTICAL <accent>READ</accent>
**Body:** ${v}
**Image query:** football tactics heatmap
**Voiceover:** "TODO: NEEDS VERIFICATION — write this voiceover from a confirmed FBref/Transfermarkt stat, not from an assumption."

## Scene 3 — Key Performers
**Kind:** grid
**Duration:** 12s
**Query:** football celebration team
**Top label:** 03 — KEY PERFORMERS
**Bottom label:** MATCH IMPACT
**Headline:** MATCH <accent>FACTORS</accent>
**Cards:**
- ⚽ | ${n.toUpperCase()} | Key Tactics | "TODO: NEEDS VERIFICATION"
- 🛡️ | ${o.toUpperCase()} | Defensive Line | "TODO: NEEDS VERIFICATION"
- 🎯 | MATCH VERDICT | Key Moment | "${j.replace(/-/g," ")}"
**Voiceover:** "TODO: NEEDS VERIFICATION — confirm standout performers via FBref before writing this voiceover."

## Scene 4 — Takeaways
**Kind:** list
**Duration:** 12s
**Query:** football stadium tunnel entrance
**Top label:** 04 — VERDICT
**Bottom label:** LESSONS
**Eyebrow:** // KEY FACTORS
**Headline:** THREE <accent>LESSONS</accent>
**Items:**
- TODO: NEEDS VERIFICATION — first takeaway, ground it in a real stat or quote
- TODO: NEEDS VERIFICATION — second takeaway
- TODO: NEEDS VERIFICATION — third takeaway
**Voiceover:** "TODO: NEEDS VERIFICATION — three takeaways, each grounded in a checked source."

## Scene 5 — Outro & CTA
**Kind:** quote
**Duration:** 8s
**Query:** football fans cheering stadium
**Top label:** 05 — COMMUNITY
**Bottom label:** JOIN THE DISCUSSION
**Eyebrow:** // YOUR TURN
**Quote:** "Who was most to blame for this outcome?"
**Attribution:** LEAVE A COMMENT BELOW
**Sub:** ${l}
**Voiceover:** "${l}"

## YouTube Metadata
**Title options:**
1. ${g}: Tactical Breakdown
2. ${h}: The Tactical Collapse Explained
3. Why ${h} Lost Control of the Match

**Description:**
Deep dive tactical analysis into ${h}.
Analyzing key moments: ${i.slice(0,150)}.

Subscribe for more tactical football breakdowns!

**Tags:** ${m.join(", ")}, football analysis, tactical breakdown, soccer stats

**Category:** Sports

## Research Sources
${q.length>0?q.map(a=>`- [${a.kind}] ${a.title} — ${a.url}`).join("\n"):"No sources were fetched — every NEEDS VERIFICATION marker above must be resolved manually before this brief is used."}

**Snapshot ID:** ${f?.snapshotId??"none"}
`}({briefId:f,mode:c,formData:d,transcript:e,enrichedContent:g,researchBundle:b});return u.NextResponse.json({briefId:f,markdown:i})}catch(a){return console.error("Brief generation error:",a),u.NextResponse.json({error:a?.message||"Brief generation failed"},{status:500})}}async function K({provider:a,mode:b,formData:c,transcript:d}){let e=`You are an elite YouTube football tactical analyst and video script writer for MD2YT.
Your job is to generate a production-ready Markdown video content brief for a fast-paced 60-120 second YouTube video.

The Markdown brief MUST follow this EXACT structure with proper markdown headers and bold field labels:

# 🎬 Content Brief: [Title]

## The Idea
**Core concept:** [1 sentence concept]
**Unique angle:** [Tactical perspective]
**Why now:** [Current context]

## Hook
**Kind:** hook
**Duration:** 8s
**Query:** football stadium crowd floodlights
**Top label:** LIVE ANALYZER
**Bottom label:** [MATCH TITLE]
**Pill:** TACTICAL
**Eyebrow:** // MATCH BREAKDOWN
**Headline:** [PUNCHY 2-4 WORD HEADLINE WITH <accent>KEY WORD</accent>]
**Subhead:** // [ONE LINE SUBHEAD]
**Voiceover:** [8-second opening hook voiceover sentence landing the core premise]

## Scene 1 — The Turning Point
**Kind:** record
**Duration:** 10s
**Query:** football stopwatch timer
**Top label:** 01 — THE COUNT
**Bottom label:** IMPACT STAT
**Pill:** LIVE
**Eyebrow:** // KEY NUMBERS
**Name:** [KEY METRIC OR MOMENT]
**Counter label:** [STAT LABEL]
**Counter num:** [NUMBER]
**Counter suffix:** [CONTEXT SUFFIX]
**Voiceover:** [10-second voiceover explaining the stat and its significance]

## Scene 2 — Tactical Breakdown
**Kind:** split
**Variant:** side-by-side
**Duration:** 14s
**Query:** football tactics board motion
**Top label:** 02 — BREAKDOWN
**Bottom label:** STRUCTURAL FAILURE
**Eyebrow:** // TACTICAL SHIFT
**Headline:** [TACTICAL HEADLINE WITH <accent>ACCENT</accent>]
**Body:** [2-sentence explanation of what failed tactically]
**Image query:** football tactical formation graphic
**Voiceover:** [14-second voiceover detailing the tactical shift or defensive failure]

## Scene 3 — Key Performers
**Kind:** grid
**Duration:** 14s
**Query:** football player action shot
**Top label:** 03 — LINEUP
**Bottom label:** KEY IMPACT
**Headline:** KEY <accent>PERFORMERS</accent>
**Cards:**
- ⚽ | ATTACK | [Player/Unit 1] | "[Key Stat or Quote 1]"
- 🛡️ | DEFENSE | [Player/Unit 2] | "[Key Stat or Quote 2]"
- 🎯 | MIDFIELD | [Player/Unit 3] | "[Key Stat or Quote 3]"
**Voiceover:** [14-second voiceover highlighting key individual performances]

## Scene 4 — Takeaways
**Kind:** list
**Duration:** 12s
**Query:** football stadium tunnel
**Top label:** 04 — VERDICT
**Bottom label:** LESSONS
**Eyebrow:** // KEY FACTORS
**Headline:** THREE <accent>LESSONS</accent>
**Items:**
- [Takeaway 1]
- [Takeaway 2]
- [Takeaway 3]
**Voiceover:** [12-second voiceover walking through the three key takeaways]

## Scene 5 — Outro & CTA
**Kind:** quote
**Duration:** 10s
**Query:** football fans cheering stadium
**Top label:** 05 — COMMUNITY
**Bottom label:** JOIN DISCUSSION
**Eyebrow:** // YOUR TURN
**Quote:** "[Engaging question for comments]"
**Attribution:** LEAVE A COMMENT BELOW
**Sub:** Subscribe for weekly tactical breakdowns
**Voiceover:** [10-second voiceover asking the audience for their thoughts and giving CTA]

## YouTube Metadata
**Title options:**
1. [Catchy Title 1]
2. [Tactical Title 2]
3. [Question Title 3]

**Description:**
[2-3 paragraph YouTube video description with chapter breakdown]

**Tags:** football, tactical breakdown, soccer, match analysis, [team1], [team2]

**Category:** Sports

Strictly output ONLY valid Markdown text following this structure. Do NOT wrap output in triple backtick markdown blocks.`,f=`Generate a complete MD2YT brief for:
Match/Topic: ${c.matchTitle||c.teams||"Match Breakdown"}
Teams: ${c.teams||"Team A vs Team B"}
Key Moments/Observations: ${c.keyMoments||d||"Detailed tactical breakdown"}
Analysis Angle: ${c.analysisAngle||"defensive-collapse"}
Tone: ${c.tone||"analytical"}
CTA: ${c.cta||"Subscribe for more tactical breakdowns!"}`;return await G(a,f,a=>{let b=a.replace(/^```markdown\n?/,"").replace(/^```\n?/,"").replace(/\n?```$/,"").trim();if(!b.includes("## Hook")||!b.includes("## Scene"))throw Error("Response is missing required '## Hook' and '## Scene' sections");return b},{system:e})}let L=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/brief/route",pathname:"/api/brief",filename:"route",bundlePath:"app/api/brief/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"C:\\Users\\PC\\Documents\\GitHub\\gh-ffyt\\web\\app\\api\\brief\\route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:M,workUnitAsyncStorage:N,serverHooks:O}=L;function P(){return(0,g.patchFetch)({workAsyncStorage:M,workUnitAsyncStorage:N})}async function Q(a,b,c){var d;let e="/api/brief/route";"/index"===e&&(e="/");let g=await L.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:z,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,resolvedPathname:C}=g,D=(0,j.normalizeAppPath)(e),E=!!(y.dynamicRoutes[D]||y.routes[C]);if(E&&!x){let a=!!y.routes[C],b=y.dynamicRoutes[D];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let F=null;!E||L.isDev||x||(F="/index"===(F=C)?"/":F);let G=!0===L.isDev||!E,H=E&&!G,I=a.method||"GET",J=(0,i.getTracer)(),K=J.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:G,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:H,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>L.onRequestError(a,b,d,z)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>L.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=J.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${I} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${I} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&A&&B&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!E)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await L.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:H,isOnDemandRevalidate:A})},z),b}},l=await L.handleResponse({req:a,nextConfig:w,cacheKey:F,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,responseGenerator:k,waitUntil:c.waitUntil});if(!E)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",A?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&E||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};K?await g(K):await J.withPropagatedContext(a.headers,()=>J.trace(m.BaseServerSpan.handleRequest,{spanName:`${I} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":I,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await L.onRequestError(a,b,{routerKind:"App Router",routePath:D,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:H,isOnDemandRevalidate:A})}),E)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},4870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5511:a=>{"use strict";a.exports=require("crypto")},6439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},6487:()=>{},8335:()=>{},9121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},9294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")}};var b=require("../../../webpack-runtime.js");b.C(a);var c=b.X(0,[331,692],()=>b(b.s=3540));module.exports=c})();