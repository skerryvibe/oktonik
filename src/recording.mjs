// Portable, monophonic chord-take capture. Beats come from the host adapter,
// never UI tick counts or wall time. Original chord payload is not interpreted.
export const STEP_BEATS = Object.freeze([.25,.5,1,2,4]);
export function createChordRecorder({preserveTiming=false}={}) {
  let take=null,lastBeat=null;
  function finish(beat) {
    if(!take)return null;
    const current=take;take=null;
    const end=Number.isFinite(beat)&&beat>=current.beat?beat:current.beat;
    const steps=Math.max(1,Math.min(16,Math.round(end/current.span)-current.start));
    const position=current.beat/current.span;
    return {index:preserveTiming?Math.floor(position)%16:current.start%16,payload:current.payload,timing:{steps,velocity:current.velocity},
      ...(preserveTiming?{position,performance:{start:position%16,duration:Math.max(.0001,Math.min(16,(end-current.beat)/current.span))}}:{})};
  }
  return {
    start(owner,beat,rate,payload,velocity) {
      if(!Number.isFinite(beat)||beat<0||beat>=1e12)return null;
      const previous=finish(beat),span=STEP_BEATS[rate]||1;
      take={owner,beat,span,start:Math.round(beat/span),payload,velocity:Math.max(1,Math.min(127,Number.isFinite(velocity)?Math.round(velocity):100))};
      lastBeat=beat;return previous;
    },
    release(owner,beat=lastBeat){return take?.owner===owner?finish(beat):null;},
    observe(beat,ready) {
      let ended=null;
      if(take&&(!ready||!Number.isFinite(beat)||beat<lastBeat))
        ended=finish(Number.isFinite(beat)&&beat>=lastBeat?beat:lastBeat);
      if(ready&&Number.isFinite(beat))lastBeat=beat;
      return ended;
    },
    stop(beat=lastBeat){return finish(beat);},
    inspect(){return take?{owner:take.owner,beat:take.beat}:null;},
  };
}
