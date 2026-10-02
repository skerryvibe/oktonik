#ifndef OKTONIK_DIVISI_H
#define OKTONIK_DIVISI_H
#include <stdint.h>

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
