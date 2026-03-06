import{c as b,j as e,r as x}from"./index-CuQE8y5z.js";/**
 * @license lucide-react v0.378.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=b("Download",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]]);/**
 * @license lucide-react v0.378.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=b("LayoutPanelLeft",[["rect",{width:"7",height:"18",x:"3",y:"3",rx:"1",key:"2obqm"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1",key:"6d4xhi"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1",key:"nxv5o0"}]]),S=({value:c,label:o})=>{if(c==null)return e.jsx("div",{style:{width:"100%",fontSize:12,color:"#9ca3af",lineHeight:1.2},children:"N/A"});const s=Math.max(0,Math.min(1,c)),p=(s*100).toFixed(0);let h="#f87171";return s>.7?h="#34d399":s>=.4&&(h="#fbbf24"),e.jsxs("div",{style:{width:"100%"},children:[e.jsx("div",{style:{width:"100%",height:8,borderRadius:4,background:"var(--surface-alt, #1a2234)",overflow:"hidden"},children:e.jsx("div",{style:{width:`${s*100}%`,height:"100%",borderRadius:4,background:h}})}),e.jsx("div",{style:{marginTop:6,fontSize:12,lineHeight:1.2},children:o?`${o}: ${p}%`:`${p}%`})]})};function L({results:c}){const o=x.useMemo(()=>{const t=new Map;for(const n of c){if(typeof n.runId!="number")continue;const l=t.get(n.runId)??[];l.push(n),t.set(n.runId,l)}return t},[c]),s=x.useMemo(()=>Array.from(o.keys()).sort((t,n)=>t-n),[o]),[p,h]=x.useState(s.length>0?s[s.length-1]:null),[r,R]=x.useState(!1),[y,w]=x.useState(s.length>1?s[s.length-2]:null),d=p!==null&&o.has(p)?p:s.length>0?s[s.length-1]:null,m=t=>{if(t===null)return{providerResults:[],synthesisResult:void 0};const n=o.get(t)??[];return{providerResults:n.filter(l=>(l.provider??"").toLowerCase()!=="synthesis"),synthesisResult:n.find(l=>(l.provider??"").toLowerCase()==="synthesis")}},f=m(d),u=r?m(y):null,C=()=>{var g,j;let t=`# Consilium Run #${d}

`;for(const a of f.providerResults)t+=`## ${a.provider} (Confidence: ${((g=a.confidence)==null?void 0:g.toFixed(2))??"N/A"})

`,t+=`${a.result}

`;if(f.synthesisResult&&(t+=`## Synthesis

${f.synthesisResult.result}

`),r&&u){t+=`---

# Compared with Run #${y}

`;for(const a of u.providerResults)t+=`## ${a.provider} (Confidence: ${((j=a.confidence)==null?void 0:j.toFixed(2))??"N/A"})

`,t+=`${a.result}

`;u.synthesisResult&&(t+=`## Synthesis

${u.synthesisResult.result}

`)}const n=new Blob([t],{type:"text/markdown"}),l=URL.createObjectURL(n),i=document.createElement("a");i.href=l,i.download=`consilium_run_${d}${r?"_vs_"+y:""}.md`,document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(l)},v=(t,n,l)=>e.jsxs("div",{style:{display:"grid",gap:16},children:[e.jsxs("h4",{style:{margin:0,color:"var(--muted)"},children:[l," Запуск #",t]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:16},children:n.providerResults.map((i,g)=>e.jsxs("article",{className:"telemetry-card",style:{display:"grid",gap:10,padding:12},children:[e.jsxs("header",{style:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline"},children:[e.jsx("strong",{children:i.provider??"Неизвестный провайдер"}),e.jsx("span",{style:{opacity:.8,fontSize:12},children:i.time??"-"})]}),e.jsx(S,{value:i.confidence,label:"Уверенность"}),e.jsx("pre",{style:{margin:0,whiteSpace:"pre-wrap",maxHeight:300,overflowY:"auto",background:"var(--surface)",padding:10,borderRadius:8},children:i.result??""})]},`${i.provider}-${i.runId}-${g}`))}),n.synthesisResult&&e.jsxs("section",{className:"telemetry-card",style:{padding:12},children:[e.jsxs("header",{style:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline",marginBottom:10},children:[e.jsx("strong",{children:n.synthesisResult.provider??"synthesis"}),e.jsx("span",{style:{opacity:.8,fontSize:12},children:n.synthesisResult.time??"-"})]}),e.jsx("pre",{style:{margin:0,whiteSpace:"pre-wrap",maxHeight:300,overflowY:"auto",background:"var(--surface)",padding:10,borderRadius:8},children:n.synthesisResult.result??""})]})]});return e.jsxs("div",{className:"panel",style:{display:"grid",gap:16},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[e.jsx("label",{htmlFor:"consilium-run-filter",style:{fontWeight:600,fontSize:13},children:"Основной запуск:"}),e.jsx("select",{id:"consilium-run-filter",value:d??"",onChange:t=>h(Number(t.target.value)),disabled:s.length===0,style:{padding:"4px 8px",fontSize:13},children:s.map(t=>e.jsxs("option",{value:t,children:["Запуск #",t]},t))})]}),r&&e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,marginLeft:16},children:[e.jsx("label",{htmlFor:"consilium-run-compare",style:{fontWeight:600,fontSize:13,color:"var(--primary)"},children:"Сравнить с:"}),e.jsx("select",{id:"consilium-run-compare",value:y??"",onChange:t=>w(Number(t.target.value)),disabled:s.length<2,style:{padding:"4px 8px",fontSize:13},children:s.filter(t=>t!==d).map(t=>e.jsxs("option",{value:t,children:["Запуск #",t]},t))})]})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[e.jsxs("button",{type:"button",onClick:()=>R(!r),style:{display:"flex",alignItems:"center",gap:6,background:r?"var(--primary)":"transparent",color:r?"white":"var(--text)",border:r?"1px solid var(--primary)":"1px solid var(--border)",fontSize:12,padding:"6px 10px"},children:[e.jsx($,{size:14})," Compare"]}),e.jsxs("button",{type:"button",onClick:C,disabled:!d,style:{display:"flex",alignItems:"center",gap:6,background:"var(--surface-alt)",color:"var(--text)",border:"1px solid var(--border)",fontSize:12,padding:"6px 10px"},children:[e.jsx(k,{size:14})," Export MD"]})]})]}),e.jsxs("div",{style:{display:"flex",flexDirection:r?"row":"column",gap:24},children:[e.jsx("div",{style:{flex:1,minWidth:0},children:v(d,f,r?"A:":"")}),r&&u&&e.jsx("div",{style:{flex:1,minWidth:0,paddingLeft:24,borderLeft:"1px solid var(--border)"},children:v(y,u,"B:")})]})]})}export{L as C};
