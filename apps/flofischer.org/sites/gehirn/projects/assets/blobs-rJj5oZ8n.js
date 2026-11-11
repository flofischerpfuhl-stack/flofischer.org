import{a as i,aL as p}from"./index-Cz3CU_oK.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=i("FileImage",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["circle",{cx:"10",cy:"12",r:"2",key:"737tya"}],["path",{d:"m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22",key:"wt3hpn"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=i("FileSpreadsheet",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M8 13h2",key:"yr2amv"}],["path",{d:"M14 13h2",key:"un5t4a"}],["path",{d:"M8 17h2",key:"2yhykz"}],["path",{d:"M14 17h2",key:"10kma7"}]]),u="bergwork-projects-blobs",s="blobs";let o=null;function h(){return o??(o=new Promise((a,t)=>{const e=indexedDB.open(u,1);e.onupgradeneeded=()=>e.result.createObjectStore(s),e.onsuccess=()=>a(e.result),e.onerror=()=>{o=null,t(e.error)}})),o}function c(a,t){return h().then(e=>new Promise((n,d)=>{const r=e.transaction(s,a),l=t(r.objectStore(s));r.oncomplete=()=>n(l?l.result:void 0),r.onerror=()=>d(r.error),r.onabort=()=>d(r.error)}))}async function k(a,t=p("blob")){const e={type:a.type,data:await a.arrayBuffer()};return await c("readwrite",n=>n.put(e,t)),t}async function w(a){const t=await c("readonly",e=>e.get(a));return t?new Blob([t.data],{type:t.type}):void 0}async function m(a){a.length&&await c("readwrite",t=>{for(const e of a)t.delete(e)})}export{f as F,b as a,m as d,w as g,k as p};
