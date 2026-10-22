// Portable clip storage. Transport, recording and hardware selection live outside.
// First stage exposes one selected clip per part; preserves other clips on save.
export const CLIP_PARTS=Object.freeze(['chord','bass','melody']);
export function normalizeClips(raw,legacy,normalizers,defaults={}) {
 const timing=c=>({rate:Number.isInteger(c?.rate)&&c.rate>=0&&c.rate<=4?c.rate:defaults.rate??2,
  quantize:Number.isInteger(c?.quantize)&&c.quantize>=0&&c.quantize<=100?c.quantize:defaults.quantize??100});
 const parts={};
 for(const part of CLIP_PARTS) {
  const source=raw?.version===1?raw.parts?.[part]:null;
  const ids=new Set();
  const clips=(Array.isArray(source?.clips)?source.clips:[]).slice(0,8).flatMap(c=>{
   if(!c || typeof c.id!=='string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(c.id) || ids.has(c.id))return [];
   ids.add(c.id);
   const length=[16,32,64].includes(c.length)?c.length:16;
   const tail=Array.from({length:64},(_,i)=>i>=length?normalizers[part](c.tail?.[i]):null);
   const extent=[16,32,64].includes(c.extent)&&c.extent>length?c.extent:tail.some(Boolean)?64:length;
   return [{id:c.id,length,...timing(c),events:Array.from({length},(_,i)=>normalizers[part](c.events?.[i])),...(tail.some(Boolean)?{tail}:{}),...(extent>length?{extent}:{})}];
  });
  if(!clips.length)clips.push({id:'clip-1',length:16,...timing(null),events:Array.from({length:16},(_,i)=>normalizers[part](legacy[part]?.[i]))});
  parts[part]={selected:clips.some(c=>c.id===source?.selected)?source.selected:clips[0].id,clips};
 }
 return {version:1,parts};
}
export function selectedClip(state,part) {
 const bank=state.parts[part];return bank.clips.find(c=>c.id===bank.selected);
}
export function ensureClip(state,part,index) {
 if(!CLIP_PARTS.includes(part)||!Number.isInteger(index)||index<0||index>7)return null;
 const bank=state.parts[part];
 while(bank.clips.length<=index) {
  let n=1;while(bank.clips.some(c=>c.id==='clip-'+n))n++;
  const source=selectedClip(state,part);
  bank.clips.push({id:'clip-'+n,length:16,rate:source?.rate??2,quantize:0,events:Array(16).fill(null)}); // new clips start unquantized
 }
 return bank.clips[index];
}
export function resizeClip(clip,length) {
 if(![16,32,64].includes(length))return false;
 const all=Array.from({length:64},(_,i)=>i<clip.length?clip.events[i]??null:clip.tail?.[i]??null);
 if(length+all.slice(0,length).reduce((n,c)=>n+(c?.more?.length||0),0)>128)return false;
 const extent=Math.max(clip.extent||clip.length,length);
 if(extent>length)clip.extent=extent;else delete clip.extent;
 clip.events.splice(0,clip.events.length,...all.slice(0,length));
 const tail=all.map((e,i)=>i>=length?e:null);
 if(tail.some(Boolean))clip.tail=tail;else delete clip.tail;
 clip.length=length;return true;
}
