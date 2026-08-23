(()=>{var a={};a.id=542,a.ids=[542],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},3033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},4870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},6439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},6487:()=>{},7367:a=>{"use strict";a.exports=require("fs/promises")},8151:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>I,patchFetch:()=>H,routeModule:()=>D,serverHooks:()=>G,workAsyncStorage:()=>E,workUnitAsyncStorage:()=>F});var d={};c.r(d),c.d(d,{POST:()=>B});var e=c(5736),f=c(9117),g=c(4044),h=c(9326),i=c(2324),j=c(261),k=c(4290),l=c(5328),m=c(8928),n=c(6595),o=c(3421),p=c(7679),q=c(1681),r=c(3446),s=c(6439),t=c(1356),u=c(641),v=c(9646),w=c(7367),x=c(9902),y=c.n(x);let z=require("crypto");var A=c.n(z);async function B(a){try{var b,c,d;let e,{mode:f,formData:g,transcript:h}=await a.json(),i=A().randomBytes(4).toString("hex"),j=y().join(process.cwd(),"..","briefs");await (0,w.mkdir)(j,{recursive:!0}),e="quick"===f?await C(g,h):"research"===f?await (b=g,c=h,new Promise((a,d)=>{let e=b.matchTitle||b.teams||c||"",f=`
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent / "src"))

from pipeline.research import research_topic, synthesize_brief

form_data = json.loads(sys.argv[1])
topic = sys.argv[2]

findings = research_topic(topic, mode="enrich")
brief_md = synthesize_brief(form_data, findings, mode="enrich")
print(brief_md)
`,g=JSON.stringify(b),h=(0,v.spawn)("python",["-c",f,g,e]),i="",j="";h.stdout.on("data",a=>{i+=a.toString()}),h.stderr.on("data",a=>{j+=a.toString()}),h.on("close",d=>{0===d&&i.trim()?a(i.trim()):(console.error("Python research failed:",j),a(C(b,c).then(a=>a)))})})):await (d=g.matchTitle||"",new Promise((a,b)=>{let c=`
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent / "src"))

from pipeline.research import research_topic, synthesize_brief

topic = sys.argv[1]

findings = research_topic(topic, mode="full")
form_data = {
    "matchTitle": topic,
    "analysisAngle": "Topic research",
    "tone": "analytical",
    "cta": "Subscribe for more"
}
brief_md = synthesize_brief(form_data, findings, mode="full")
print(brief_md)
`,e=(0,v.spawn)("python",["-c",c,d]),f="",g="";e.stdout.on("data",a=>{f+=a.toString()}),e.stderr.on("data",a=>{g+=a.toString()}),e.on("close",c=>{0===c&&f.trim()?a(f.trim()):(console.error("Python topic research failed:",g),b(Error("Topic-only research failed")))})}));let k=y().join(j,`brief-${i}.md`);return await (0,w.writeFile)(k,e,"utf-8"),u.NextResponse.json({briefId:i,briefPath:`briefs/brief-${i}.md`,markdown:e})}catch(a){return console.error("Brief generation error:",a),u.NextResponse.json({error:"Brief generation failed"},{status:500})}}function C(a,b){let c=a.matchTitle||"Untitled Match Analysis",d=a.teams||"TBD",e=a.keyMoments||b||"No key moments provided",f=a.analysisAngle||"general",g=a.tone||"analytical",h=a.cta||"Subscribe for more analysis";return Promise.resolve(`# Content Brief: ${c}

## The Idea
**Core concept:** ${f}
**Match:** ${d}
**Tone:** ${g}

---

## Key Moments
${e}

---

## Script Outline

| # | Scene Title | Duration | Voiceover / On-screen Text | Visual Direction | Notes |
|---|-------------|----------|---------------------------|-----------------|-------|
| 1 | Hook | 0-8s | TODO: Add hook script | Match highlights | Opening scene |
| 2 | Analysis | 8-60s | TODO: Add analysis | Tactical graphics | Main content |
| 3 | CTA | 60-75s | ${h} | Channel logo | Closing |

---

## YouTube Metadata

**Title options:**
1. ${c}
2. TODO: Add alternative title

**Description:** TODO: Add description

**Tags:** ${d}, football, soccer, match analysis

---

**Generated:** ${new Date().toISOString()}
**Mode:** Quick Brief (no research)
`)}let D=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/brief/route",pathname:"/api/brief",filename:"route",bundlePath:"app/api/brief/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"C:\\Users\\PC\\Documents\\GitHub\\gh-ffyt\\web\\app\\api\\brief\\route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:E,workUnitAsyncStorage:F,serverHooks:G}=D;function H(){return(0,g.patchFetch)({workAsyncStorage:E,workUnitAsyncStorage:F})}async function I(a,b,c){var d;let e="/api/brief/route";"/index"===e&&(e="/");let g=await D.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:z,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,resolvedPathname:C}=g,E=(0,j.normalizeAppPath)(e),F=!!(y.dynamicRoutes[E]||y.routes[C]);if(F&&!x){let a=!!y.routes[C],b=y.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||D.isDev||x||(G="/index"===(G=C)?"/":G);let H=!0===D.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>D.onRequestError(a,b,d,z)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>D.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&A&&B&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await D.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:A})},z),b}},l=await D.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",A?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await D.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:A})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},8335:()=>{},9121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},9294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},9646:a=>{"use strict";a.exports=require("child_process")},9902:a=>{"use strict";a.exports=require("path")}};var b=require("../../../webpack-runtime.js");b.C(a);var c=b.X(0,[331,692],()=>b(b.s=8151));module.exports=c})();