#ifndef OKTONIK_DIVISI_H
#define OKTONIK_DIVISI_H
#include <stdint.h>

/* Stable voice identity, not MIDI channel identity (channels may be shared).
 * History survives note release; the adapter resets it on STOP/routing changes.
 * Pure, bounded assignment: at most 256 masks x 8 notes x 8 voices. No heap,
 * octave displacement, dropped tones or assumptions about physical pads. */
typedef struct { uint8_t known, notes[8]; } EnsembleMemory;
static void ensemble_assign(EnsembleMemory *memory, const uint8_t *notes,
                            int count, uint8_t *voices) {
    int cost[256]; uint8_t parent[256], chosen[256], order[8];
    for(int i=0;i<count;i++) {
        int rank=0;
        for(int j=0;j<count;j++) if(notes[j]<notes[i]) rank++;
        order[rank]=(uint8_t)i;
    }
    for(int m=0;m<256;m++) {cost[m]=100000;parent[m]=chosen[m]=0;}
    cost[0]=0;
    for(int mask=0;mask<256;mask++) {
        int n=0;for(int v=0;v<8;v++)n+=!!(mask&(1<<v));
        if(n>=count || cost[mask]==100000)continue;
        for(int v=0;v<8;v++)if(!(mask&(1<<v))) {
            int distance=(int)notes[order[n]]-memory->notes[v];
            if(distance<0)distance=-distance;
            /* Prefer a previously used voice over opening a new one. */
            int next=mask|(1<<v), value=cost[mask]+((memory->known&(1<<v))?distance:128);
            if(value<cost[next]) {cost[next]=value;parent[next]=(uint8_t)mask;chosen[next]=(uint8_t)v;}
        }
    }
    int best=0;
    for(int m=1;m<256;m++) {
        int n=0;for(int v=0;v<8;v++)n+=!!(m&(1<<v));
        if(n==count && (!best || cost[m]<cost[best]))best=m;
    }
    for(int n=count-1;n>=0;n--) {
        int v=chosen[best],i=order[n];voices[i]=(uint8_t)v;
        memory->notes[v]=notes[i];memory->known|=(uint8_t)(1<<v);
        best=parent[best];
    }
}

/* Pitch-rank allocation, independent of Move, owners and MIDI transport.
 * Notes must be unique. Keep source order so strum plans remain unchanged.
 * Returns false instead of wrapping or dropping tones at the channel boundary. */
static int divisi_channels(const uint8_t *notes, int count, int first,
                           int enabled, uint8_t *channels) {
    if (first < 0 || first > 15 || count < 0 || count > 8 ||
        (enabled && first + count > 16)) return 0;
    for (int i=0;i<count;i++) {
        int rank=0;
        for (int j=0;j<count;j++) if (notes[j]<notes[i]) rank++;
        channels[i]=(uint8_t)(first+(enabled?rank:0));
    }
    return 1;
}
#endif
