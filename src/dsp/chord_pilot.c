/* OKTONIK 0.1.0-rc.2 — independent MIDI performance engine.
 * Fixed storage and bounded work in every host callback. No audio synthesis.
 */
#include "host/plugin_api_v1.h"
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "strum.h"
#include "divisi.h"

enum { INSTANCES = 4, STEPS = 16, EVENTS = 128, CELL_TICKS=10000, LOOP_TICKS=160000, LIVE_OWNERS = 41, OWNERS = 45, LOOP_OWNER = 41, TEST_OWNER = 42, LOOP_BASS_OWNER = 43, ARP_OWNER = 44,
       NOTES = 8, CELLS = 1024, DESTS = 3, COMMAND_LIMIT = 1024 };
enum { MOVE = 0, USB = 1, CHAIN = 2 };
typedef struct {
    uint8_t used, dest, channel, note, velocity, sent, must_off, arp_pending;
    uint8_t pressure, pressure_sent;
    uint16_t refs;
} Pitch;
typedef struct {
    uint8_t count, route, channel, velocity, notes[NOTES], assigned[NOTES], struck[NOTES], retrigger, latched;
    uint64_t due[NOTES], expires;
    uint8_t velocities[NOTES];
    uint8_t pressure, channels[NOTES];
} Voice;
typedef struct { uint8_t count, notes[NOTES], velocity, strum, legato, strum_dir, strum_time, strum_vel, duration; int bass, timed, at, len; } Slot;
typedef struct {
    int used, retired;
    const host_api_v1_t *host;
    Pitch pitches[CELLS];
    Voice voices[OWNERS];
    Slot slots[EVENTS];
    Slot bass_slots[EVENTS];
    int bass_clip, bass_event;
    int64_t bass_start;
    uint16_t played_channels[DESTS];
    uint8_t kill_pending[DESTS][16];
    uint8_t pedal_want[DESTS][16], pedal_sent[DESTS][16], pedal_off[DESTS][16];
    uint64_t sample;
    uint32_t strum_seed; unsigned strum_alternate;
    int sample_rate, route, channel, rate, gate, move_available, legato, divisi;
    uint8_t divisi_map[NOTES]; int divisi_custom;
    int bass_route, bass_channel, bass_velocity;
    int armed, running, slot, cycle, loop_length;
    int event_slot, recording;
    unsigned event_serial;
    int64_t event_start;
    int64_t absolute_step;
    double last_beat;
    int arp_enabled, arp_rate, arp_direction, arp_range, arp_gate, arp_swing, arp_hold, arp_velocity, arp_route, arp_channel;
    uint8_t arp_live[NOTES], arp_notes[NOTES];
    int arp_live_count, arp_count, arp_live_down, arp_from_loop;
    int64_t arp_step;
    uint32_t arp_index, arp_random;
    double arp_last_beat;
    int arp_clock, arp_bpm;
    uint64_t arp_origin;
    uint32_t diag_blocks, diag_generated, diag_tx, diag_failed;
    int diag_note, diag_tx_note, diag_tx_route, diag_tx_channel, diag_clock_seen;
    double diag_beat;
    uint64_t diag_clock_sample;
    const char *error;
} Pilot;
static Pilot pool[INSTANCES];
static const host_api_v1_t *current_host;
static const double step_beats[5] = { .25, .5, 1., 2., 4. };

enum { F_OP, F_OWNER, F_NOTES, F_VELOCITY, F_ROUTE, F_CHANNEL,
       F_STRUM, F_INDEX, F_ENABLED, F_RATE, F_GATE, F_MOVE, F_LEGATO,
       F_RETRIGGER, F_BASS, F_BASS_ROUTE, F_BASS_CHANNEL, F_BASS_VELOCITY,
       F_DIRECTION, F_RANGE, F_SWING, F_HOLD, F_CLOCK, F_BPM, F_STRUM_DIR, F_STRUM_TIME, F_STRUM_VEL, F_DURATION, F_BASS_CLIP, F_RECORD_PART, F_AT, F_LEN, F_PRESSURE, F_DIVISI, F_CHANNELS, F_COUNT };
_Static_assert(F_COUNT<=64,"Command field mask capacity");
typedef struct {
    uint64_t fields;
    int values[F_COUNT];
    char op[12];
    uint8_t notes[NOTES];
    uint8_t channels[NOTES];
    int count;
} Command;
typedef struct { const char *s; int at, length; } Reader;

static void whitespace(Reader *r) {
    while (r->at < r->length && (r->s[r->at] == ' ' ||
           r->s[r->at] == '\n' || r->s[r->at] == '\t' ||
           r->s[r->at] == '\r')) r->at++;
}
static int take(Reader *r, char c) {
    whitespace(r);
    if (r->at >= r->length || r->s[r->at] != c) return 0;
    r->at++;
    return 1;
}
static int read_string(Reader *r, char *out, int size) {
    int n = 0;
    if (!take(r, '"')) return 0;
    while (r->at < r->length && r->s[r->at] != '"') {
        unsigned char c = (unsigned char)r->s[r->at++];
        if (c < 32 || c == '\\' || n + 1 >= size) return 0;
        out[n++] = (char)c;
    }
    out[n] = 0;
    return take(r, '"');
}
static int read_int(Reader *r, int *out) {
    int sign = 1, value = 0, digits = 0, leading_zero;
    whitespace(r);
    if (r->at < r->length && r->s[r->at] == '-') { sign = -1; r->at++; }
    leading_zero = r->at < r->length && r->s[r->at] == '0';
    while (r->at < r->length && r->s[r->at] >= '0' && r->s[r->at] <= '9') {
        if (++digits > 6 || (leading_zero && digits > 1)) return 0;
        value = value * 10 + r->s[r->at++] - '0';
    }
    if (!digits) return 0;
    *out = value * sign;
    return 1;
}
static int read_notes(Reader *r, Command *c) {
    int inputs = 0;
    if (!take(r, '[')) return 0;
    if (take(r, ']')) return 1;
    do {
        int value, duplicate = 0;
        if (++inputs > NOTES || !read_int(r, &value) || value < 0 || value > 127)
            return 0;
        for (int i = 0; i < c->count; i++) duplicate |= c->notes[i] == value;
        if (!duplicate) c->notes[c->count++] = (uint8_t)value;
        if (take(r, ']')) return 1;
    } while (take(r, ','));
    return 0;
}
static int parse_command(const char *json, Command *c) {
    static const char *keys[F_COUNT] = { "op", "owner", "notes", "velocity",
        "route", "channel", "strum_ms", "index", "enabled", "rate", "gate",
        "move_available", "legato", "retrigger", "bass", "bass_route", "bass_channel", "bass_velocity",
        "direction", "range", "swing", "hold", "clock", "bpm", "strum_dir", "strum_time", "strum_vel", "duration", "bass_clip", "record_part", "at", "len", "pressure", "divisi", "channels" };
    Reader r = { json, 0, 0 };
    if (!json) return 0;
    while (r.length < COMMAND_LIMIT && json[r.length]) r.length++;
    if (r.length == COMMAND_LIMIT) return 0;
    memset(c, 0, sizeof(*c));
    if (!take(&r, '{')) return 0;
    for (int field = 0; field < F_COUNT; field++) {
        char key[20];
        int id = -1;
        if (!read_string(&r, key, sizeof(key)) || !take(&r, ':')) return 0;
        for (int i = 0; i < F_COUNT; i++) if (!strcmp(key, keys[i])) id = i;
        if (id < 0 || (c->fields & (UINT64_C(1) << id))) return 0;
        c->fields |= UINT64_C(1) << id;
        if (id == F_OP) {
            if (!read_string(&r, c->op, sizeof(c->op))) return 0;
        } else if (id == F_NOTES) {
            if (!read_notes(&r, c)) return 0;
        } else if (id == F_CHANNELS) {
            if (!take(&r,'[')) return 0;
            for(int i=0;i<NOTES;i++) {
                int ch;
                if((i && !take(&r,',')) || !read_int(&r,&ch) || ch<0 || ch>15) return 0;
                c->channels[i]=(uint8_t)ch;
            }
            if(!take(&r,']'))return 0;
        } else if (!read_int(&r, &c->values[id])) return 0;
        if (take(&r, '}')) {
            whitespace(&r);
            return r.at == r.length && (c->fields & 1);
        }
        if (!take(&r, ',')) return 0;
    }
    return 0;
}
static int has(const Command *c, int field) { return !!(c->fields & (UINT64_C(1) << field)); }
static int value(const Command *c, int field, int fallback) {
    return has(c, field) ? c->values[field] : fallback;
}
static int valid_command(const Command *c) {
    static const int minima[F_COUNT] = {0,0,0,1,0,0,0,0,0,0,10,0,0,0,-1,0,0,1,0,1,0,0,0,30};
    static const int maxima[F_COUNT] = {0,LIVE_OWNERS-1,0,127,3,15,100,EVENTS-1,1,4,100,1,1,1,127,3,15,127,4,4,50,1,1,300,3,100,100,16,1,2,LOOP_TICKS-1,LOOP_TICKS,127,1};
    if(has(c,F_AT)!=has(c,F_LEN) || (has(c,F_LEN)&&!c->values[F_LEN]))return 0;
    if((!strcmp(c->op,"slot")||!strcmp(c->op,"bassslot")) && c->count && c->values[F_INDEX]>=STEPS && !has(c,F_AT))return 0;
    for (int i = F_OWNER; i < F_COUNT; i++)
        if (i != F_NOTES && i != F_CHANNELS && has(c, i) &&
            (c->values[i] < minima[i] || c->values[i] > maxima[i])) return 0;
    if (!strcmp(c->op, "on")) return has(c,F_OWNER) && has(c,F_NOTES) && c->count;
    if (!strcmp(c->op, "off")) return has(c,F_OWNER);
    if (!strcmp(c->op, "hold")) return has(c,F_OWNER);
    if (!strcmp(c->op, "pressure")) return has(c,F_OWNER) && has(c,F_PRESSURE);
    if (!strcmp(c->op, "slot")) return has(c,F_INDEX) && has(c,F_NOTES);
    if (!strcmp(c->op, "bassslot")) return has(c,F_INDEX) && has(c,F_NOTES) && c->count<=1;
    if (!strcmp(c->op, "arm")) return has(c,F_ENABLED);
    if (!strcmp(c->op, "record")) return has(c,F_ENABLED);
    if (!strcmp(c->op, "arpsrc")) return has(c,F_NOTES);
    if (!strcmp(c->op, "arp")) return 1;
    if (!strcmp(c->op,"pedal")) return has(c,F_OWNER) && c->values[F_OWNER]<3 && has(c,F_ROUTE) && has(c,F_CHANNEL) && has(c,F_ENABLED) &&
        (!value(c,F_DIVISI,0) || (c->values[F_OWNER]==0 && (has(c,F_CHANNELS) || c->values[F_CHANNEL]<=16-NOTES)));
    return !strcmp(c->op,"config") || !strcmp(c->op,"cleargrid") || !strcmp(c->op,"panic") || !strcmp(c->op,"kill") || !strcmp(c->op,"test") || !strcmp(c->op,"arptest");
}

static int supports(Pilot *s, int dest) {
    if (!s->host) return 0;
    if (dest == MOVE) return s->move_available && s->host->midi_inject_to_move;
    if (dest == USB) return s->host->midi_send_external != 0;
    return s->host->midi_send_internal != 0;
}
static int send_packet(Pilot *s, int dest, const uint8_t *packet) {
    /* Offs/controllers still reach the original output if Move is disabled. */
    if (!s->host) return 0;
    if (dest == MOVE && s->host->midi_inject_to_move)
        return s->host->midi_inject_to_move(packet,4) == 4;
    if (dest == USB && s->host->midi_send_external)
        return s->host->midi_send_external(packet,4) == 4;
    if (dest == CHAIN && s->host->midi_send_internal)
        return s->host->midi_send_internal(packet,4) == 4;
    return 0;
}
static int send_note(Pilot *s, Pitch *p, int on) {
    uint8_t packet[4] = { (uint8_t)((p->dest == CHAIN ? 0 : 0x20) | (on ? 9 : 8)),
        (uint8_t)((on ? 0x90 : 0x80) | p->channel), p->note,
        (uint8_t)(on ? p->velocity : 0) };
    int sent = send_packet(s,p->dest,packet);
    if (on && p->arp_pending) {
        if (sent) {
            s->diag_tx++; s->diag_tx_note = p->note;
            s->diag_tx_route = p->dest; s->diag_tx_channel = p->channel;
            p->arp_pending = 0;
        } else s->diag_failed++;
    }
    /* Retain channel history for release tails after individual note-offs. */
    if (on && sent) s->played_channels[p->dest] |= (uint16_t)(1u << p->channel);
    return sent;
}
static void service_kill(Pilot *s) {
    static const uint8_t controllers[3] = {64,123,120};
    for (int d = 0; d < DESTS; d++) for (int ch = 0; ch < 16; ch++) {
        for (int i = 0; i < 3; i++) if (s->kill_pending[d][ch] & (1u << i)) {
            uint8_t packet[4] = { (uint8_t)((d == CHAIN ? 0 : 0x20) | 0x0b),
                (uint8_t)(0xb0 | ch), controllers[i], 0 };
            if (!send_packet(s,d,packet)) break;
            s->kill_pending[d][ch] &= (uint8_t)~(1u << i);
        }
    }
}
static Pitch *pitch(Pilot *s, int dest, int channel, int note, int create) {
    Pitch *empty = 0;
    for (int i = 0; i < CELLS; i++) {
        Pitch *p = &s->pitches[i];
        if (p->used && p->dest == dest && p->channel == channel && p->note == note)
            return p;
        if (!p->used && !empty) empty = p;
    }
    if (!create || !empty) return 0;
    memset(empty, 0, sizeof(*empty));
    empty->used = 1; empty->dest = (uint8_t)dest;
    empty->channel = (uint8_t)channel; empty->note = (uint8_t)note;
    return empty;
}
static int wanted_dest(int route, int dest) {
    return (dest == MOVE && (route == 0 || route == 2)) ||
           (dest == USB && (route == 1 || route == 2)) ||
           (dest == CHAIN && route == 3);
}
/* Shared MIDI pitch/channel has one pressure value: strongest live owner wins.
 * Recompute only pitches touched by a changed owner, not a frame-wide scan. */
static void set_pressure(Pilot *s, int owner, int amount) {
    Voice *v = &s->voices[owner];
    if (v->pressure == amount) return;
    v->pressure = (uint8_t)amount;
    for (int n=0;n<v->count;n++) for (int d=0;d<DESTS;d++) if (v->assigned[n] & (1u<<d)) {
        Pitch *p = pitch(s,d,v->channels[n],v->notes[n],0);
        if (!p) continue;
        int maximum = 0;
        for (int o=0;o<OWNERS;o++) {
            Voice *other = &s->voices[o];
            if (other->pressure <= maximum) continue;
            for (int k=0;k<other->count;k++)
                if (other->channels[k]==p->channel && other->notes[k]==p->note && (other->assigned[k] & (1u<<d))) maximum=other->pressure;
        }
        p->pressure = (uint8_t)maximum;
    }
}
static int send_pressure(Pilot *s, Pitch *p, int amount) {
    uint8_t packet[4] = {(uint8_t)((p->dest==CHAIN?0:0x20)|0x0a),
        (uint8_t)(0xa0|p->channel),p->note,(uint8_t)amount};
    if (!send_packet(s,p->dest,packet)) return 0;
    p->pressure_sent = (uint8_t)amount;
    return 1;
}
static void release_voice(Pilot *s, int owner) {
    Voice *v = &s->voices[owner];
    set_pressure(s,owner,0);
    for (int i = 0; i < v->count; i++) {
        for (int d = 0; d < DESTS; d++) if (v->assigned[i] & (1u << d)) {
            Pitch *p = pitch(s,d,v->channels[i],v->notes[i],0);
            if (p && p->refs) {
                p->refs--;
                if (!p->refs && p->sent) p->must_off = 1;
            }
        }
    }
    memset(v,0,sizeof(*v));
}
static void reconcile(Pilot *s) {
    /* Offs have priority, including failed offs from a previous frame. */
    for (int i = 0; i < CELLS; i++) {
        Pitch *p = &s->pitches[i];
        if (!p->used) continue;
        // Reset before off/retrigger, including tails held by a receiver pedal.
        // On congestion retain the pending reset and retry before reattack.
        if (p->sent && (p->must_off || !p->refs) && p->pressure_sent &&
            !send_pressure(s,p,0)) continue;
        if (p->sent && (p->must_off || !p->refs) && send_note(s,p,0)) {
            p->sent = 0; p->must_off = 0;
        }
        // Reset even after note-off: a pedal/release tail may still sound.
        if (!p->refs && p->pressure_sent) send_pressure(s,p,0);
        if (!p->refs && !p->sent && !p->pressure_sent) p->used = 0;
    }
    service_kill(s);
    for (int d=0;d<DESTS;d++) for(int ch=0;ch<16;ch++) {
        uint8_t packet[4]={(uint8_t)((d==CHAIN?0:0x20)|0x0b),(uint8_t)(0xb0|ch),64,0};
        if(s->pedal_off[d][ch]) {
            if(!send_packet(s,d,packet)) continue;
            s->pedal_off[d][ch]=0;s->pedal_sent[d][ch]=0;
        }
        if(s->pedal_want[d][ch] && !s->pedal_sent[d][ch] && !s->kill_pending[d][ch]) {
            int old_off_pending=0;
            for(int i=0;i<CELLS;i++) {
                Pitch *p=&s->pitches[i];
                if(p->used && p->dest==d && p->channel==ch && p->sent && (p->must_off || !p->refs)) {old_off_pending=1;break;}
            }
            if(old_off_pending)continue; // Never catch a delayed old note-off in the new pedal period.
            packet[3]=127;
            if(send_packet(s,d,packet)) {s->pedal_sent[d][ch]=1;s->played_channels[d]|=(uint16_t)(1u<<ch);}
        }
    }
    for (int i = 0; i < CELLS; i++) {
        Pitch *p = &s->pitches[i];
        if (p->used && p->refs && !p->sent && !p->must_off &&
            !s->kill_pending[p->dest][p->channel] && !s->pedal_off[p->dest][p->channel] &&
            (!s->pedal_want[p->dest][p->channel] || s->pedal_sent[p->dest][p->channel]) && send_note(s,p,1))
            p->sent = 1;
        if (p->used && p->sent && p->refs && !p->must_off &&
            p->pressure != p->pressure_sent) send_pressure(s,p,p->pressure);
    }
}
static void service_voices(Pilot *s) {
    for (int owner = 0; owner < OWNERS; owner++) {
        Voice *v = &s->voices[owner];
        if (v->expires && s->sample >= v->expires) { release_voice(s,owner); continue; }
        for (int n = 0; n < v->count; n++) if (s->sample >= v->due[n]) {
            for (int d = 0; d < DESTS; d++) {
                Pitch *p;
                if (!wanted_dest(v->route,d) || !supports(s,d))
                    continue;
                if ((v->assigned[n] & (1u << d)) && (!v->retrigger || (v->struck[n] & (1u << d))))
                    continue;
                p = pitch(s,d,v->channels[n],v->notes[n],1);
                if (!p) { s->error = "MIDI voice capacity reached"; continue; }
                if (owner == ARP_OWNER || owner == TEST_OWNER) p->arp_pending = 1;
                if (!(v->assigned[n] & (1u << d))) {
                    p->refs++; p->velocity = v->velocities[n];
                    v->assigned[n] |= (uint8_t)(1u << d);
                    if (v->pressure > p->pressure) p->pressure = v->pressure;
                }
                if (v->retrigger && !(v->struck[n] & (1u << d))) {
                    /* One off/on cycle per destination for a deliberate new
                     * attack, even if another part owns this pitch. References
                     * remain intact, so melody release cannot cut the chord. */
                    if (p->sent) p->must_off = 1;
                    p->velocity = v->velocities[n];
                    v->struck[n] |= (uint8_t)(1u << d);
                }
            }
        }
    }
    reconcile(s);
}
static void start_pattern(Pilot *s, int owner, const uint8_t *notes, int count,
                        int velocity, int route, int channel, int strum, int duration_ms, int retrigger,
                        int direction,int timing,int dynamics,int divisi,const uint8_t *channel_map) {
    Voice *v;
    uint8_t retained[NOTES] = {0};
    uint8_t channels[NOTES];
    if (!divisi_channels(notes,count,divisi&&channel_map?0:channel,divisi,channels)) { s->error="Divisi channel range"; return; }
    if(divisi && channel_map)for(int i=0;i<count;i++)channels[i]=channel_map[channels[i]];
    v = &s->voices[owner];
    set_pressure(s,owner,0);
    if (s->legato && owner != TEST_OWNER && v->channel == channel && v->route == route) {
        for (int i = 0; i < count; i++) for (int j = 0; j < v->count; j++) {
            if (notes[i] == v->notes[j] && channels[i] == v->channels[j]) {
                retained[i] = v->assigned[j];
                /* Transfer existing references, without an off/on pair. */
                v->assigned[j] = 0;
            }
        }
    }
    release_voice(s,owner);
    reconcile(s);
    v = &s->voices[owner];
    v->count = (uint8_t)count; v->velocity = (uint8_t)velocity;
    v->route = (uint8_t)route; v->channel = (uint8_t)channel;
    v->retrigger = (uint8_t)retrigger;
    unsigned delays[NOTES];
    strum_plan(notes,count,velocity,strum,direction,timing,dynamics,s->strum_alternate,&s->strum_seed,delays,v->velocities);
    if(strum && count>1 && direction==2)s->strum_alternate++;
    for (int i = 0; i < count; i++) {
        v->notes[i] = notes[i];
        v->channels[i] = channels[i];
        v->assigned[i] = retained[i];
        v->due[i] = s->sample + (uint64_t)delays[i] * (unsigned)s->sample_rate / 1000;
    }
    if (duration_ms) v->expires = s->sample + (uint64_t)duration_ms * (unsigned)s->sample_rate / 1000;
    service_voices(s);
}
static void start_voice(Pilot *s,int owner,const uint8_t *notes,int count,int velocity,int route,int channel,int strum,int duration_ms,int retrigger) {
    start_pattern(s,owner,notes,count,velocity,route,channel,strum,duration_ms,retrigger,0,0,0,0,0);
}
static void panic(Pilot *s) {
    for(int d=0;d<DESTS;d++) for(int ch=0;ch<16;ch++) {
        s->pedal_want[d][ch]=0;
        if(s->pedal_sent[d][ch])s->pedal_off[d][ch]=1;
    }
    s->arp_live_count = s->arp_count = s->arp_live_down = 0;
    s->arp_step = -1; s->arp_index = 0;
    for (int o = 0; o < OWNERS; o++) release_voice(s,o);
    reconcile(s);
}
static void clear_latched(Pilot *s) {
    for (int owner = 0; owner < LIVE_OWNERS; owner++)
        if (s->voices[owner].latched) release_voice(s,owner);
}
static void release_loop(Pilot *s) {
    release_voice(s,LOOP_OWNER);
    if(!s->bass_clip) release_voice(s,LOOP_BASS_OWNER);
}
static void start_loop_bass(Pilot *s, Slot *slot) {
    if(s->bass_clip || (s->recording&2))return;
    if (slot->bass >= 0) {
        uint8_t bass = (uint8_t)slot->bass;
        start_voice(s,LOOP_BASS_OWNER,&bass,1,s->bass_velocity,s->bass_route,s->bass_channel,0,0,0);
    } else release_voice(s,LOOP_BASS_OWNER);
}
static void start_loop(Pilot *s, Slot *slot) {
    int live_legato = s->legato;
    s->legato = slot->legato;
    if(!(s->recording&1))start_pattern(s,LOOP_OWNER,slot->notes,slot->count,slot->velocity,s->route,s->channel,slot->strum,0,0,slot->strum_dir,slot->strum_time,slot->strum_vel,s->divisi,s->divisi_custom?s->divisi_map:0);
    start_loop_bass(s,slot);
    s->legato = live_legato;
}
static void stop_loop(Pilot *s) {
    if (s->running) clear_latched(s);
    release_loop(s);
    release_voice(s,LOOP_BASS_OWNER);s->bass_event=-1;s->bass_start=-1;
    s->running = 0; s->slot = -1; s->absolute_step = -1; s->last_beat = -1.;
    s->event_slot=-1;s->event_start=-1;
}
static int host_clock_ready(Pilot *s, double beat);
static int loop_has_chords(Pilot *s);
/* Bounded event scan at every audio block, not just integer step boundaries.
 * Expired recent attacks still supersede earlier ones (no implicit resume). */
static int timeline_event(Slot *slots, int64_t tick, int64_t *start) {
    int latest=-1;int64_t when=-1;
    const int64_t base=(tick/LOOP_TICKS)*LOOP_TICKS;
    for(int i=0;i<EVENTS;i++) {
        Slot *slot=&slots[i];if(!slot->count)continue;
        int64_t on=base+(slot->timed?slot->at:i*CELL_TICKS);
        if(on>tick)on-=LOOP_TICKS;
        if(on<0 || on<when)continue;
        latest=i;when=on;
    }
    if(latest>=0) {
        Slot *slot=&slots[latest];
        const int length=slot->timed?slot->len:slot->duration?slot->duration*CELL_TICKS:CELL_TICKS;
        if(tick>=when+length)latest=-1;
    }
    *start=latest>=0?when:-1;return latest;
}
static void update_loop(Pilot *s) {
    double beat, span;
    int64_t step;
    /* A position is a time cell, not a member of a compact chord list.
     * Empty cells are rests and an empty clip still has a moving playhead. */
    const int length = STEPS;
    if (length != s->loop_length) { stop_loop(s); s->loop_length = length; }
    if (!s->armed || !s->host || !s->host->get_beat_position) {
        stop_loop(s); return;
    }
    beat = s->host->get_beat_position();
    if (!host_clock_ready(s,beat)) { stop_loop(s); return; }
    /* Negatives, NaN and implausible values cannot enter integer conversion. */
    if (!(beat >= 0. && beat < 1.e12)) { stop_loop(s); return; }
    span = step_beats[s->rate];
    step = (int64_t)(beat / span);
    const int64_t tick=(int64_t)(beat/span*CELL_TICKS+0.00001);
    int64_t event_start;
    const int source=timeline_event(s->slots,tick,&event_start);
    const int event_changed=source!=s->event_slot || (source>=0 && event_start!=s->event_start);
    if (event_changed || step != s->absolute_step || beat < s->last_beat || !s->running) {
        Slot *slot=source>=0?&s->slots[source]:0;
        const int attack=event_changed || beat<s->last_beat || !s->running;
        if(attack && slot)s->event_serial=(s->event_serial+1)&65535u;
        if(attack && !s->recording && loop_has_chords(s))clear_latched(s);
        if (attack && (!slot || !slot->legato || (!slot->duration && s->gate < 100) || step != s->absolute_step + 1 || beat < s->last_beat))
            release_loop(s);
        s->absolute_step = step; s->slot = (int)(step % length);
        s->cycle = (int)((step / length) % 2147483647);
        s->running = 1;
        s->event_slot=source;s->event_start=event_start;
        /* Joining transport midway through a gated-off phase must stay silent. */
        if (attack && slot && (slot->timed || slot->duration || tick-event_start < s->gate*CELL_TICKS/100))
            start_loop(s,slot);
        else if(!slot) release_loop(s);
    }
    s->event_slot=source;s->event_start=event_start;
    if (source<0 || (!s->slots[source].timed && !s->slots[source].duration && tick-event_start>=s->gate*CELL_TICKS/100)) release_loop(s);
    s->last_beat = beat;
}
/* Clocked independently of chord gate/strum. Fixed-size range expansion;
 * transport seeks never emit a burst of missed notes. */
static int host_clock_ready(Pilot *s, double beat) {
    if (!(beat >= 0. && beat < 1.e12)) return 0;
    const int status = s->host && s->host->get_clock_status ? s->host->get_clock_status() : -1;
    if (status == MOVE_CLOCK_STATUS_RUNNING) return 1;
    if (status == MOVE_CLOCK_STATUS_STOPPED) return 0;
    /* Some overtake hosts expose advancing beats but no transport status.
     * Require observed progress, not just a nonnegative frozen position.
     * A frozen fallback clock releases the ARP within 500ms. */
    return (status == MOVE_CLOCK_STATUS_UNAVAILABLE || status == -1) &&
        s->diag_clock_seen && s->sample - s->diag_clock_sample < (unsigned)s->sample_rate / 2;
}
static int loop_has_chords(Pilot *s) {
    for(int i=0;i<EVENTS;i++)if(s->slots[i].count)return 1;
    return 0;
}
/* Separate onset/duration lane: chord rests and chord gate never end bass events. */
static void update_bass_loop(Pilot *s) {
    if(!s->bass_clip)return;
    if(!s->running || (s->recording&2)) {
        release_voice(s,LOOP_BASS_OWNER);s->bass_event=-1;s->bass_start=-1;return;
    }
    const int64_t tick=(int64_t)(s->last_beat/step_beats[s->rate]*CELL_TICKS+0.00001);
    int64_t start;
    int source=timeline_event(s->bass_slots,tick,&start);
    if(source!=s->bass_event || start!=s->bass_start) {
        release_voice(s,LOOP_BASS_OWNER);
        if(source>=0) {
            Slot *slot=&s->bass_slots[source];
            start_voice(s,LOOP_BASS_OWNER,slot->notes,1,slot->velocity,s->bass_route,s->bass_channel,0,0,0);
        }
    }
    s->bass_event=source;s->bass_start=start;
}
static void update_arp(Pilot *s) {
    uint8_t notes[NOTES * 4];
    const uint8_t *source = s->arp_live;
    int count = s->arp_live_count, total = 0;
    double beat, span, pair, offset, start, length;
    int64_t step;
    if (s->running && !(s->recording&1) && loop_has_chords(s)) {
        source = s->event_slot>=0?s->slots[s->event_slot].notes:s->arp_live;
        count = s->event_slot>=0?s->slots[s->event_slot].count:0;
        s->arp_from_loop = 1;
    } else if (s->arp_from_loop) {
        s->arp_from_loop = 0;
        if (!s->arp_live_down) s->arp_live_count = 0;
        count = s->arp_live_count;
    }
    beat = s->host && s->host->get_beat_position ? s->host->get_beat_position() : -1.;
    if (!s->arp_enabled || !count || (!s->arp_clock && !host_clock_ready(s,beat))) {
        release_voice(s,ARP_OWNER); s->arp_step = -1; s->arp_index = 0; s->arp_count = 0; return;
    }
    if (count != s->arp_count || memcmp(source,s->arp_notes,(unsigned)count)) {
        memcpy(s->arp_notes,source,(unsigned)count); s->arp_count = count;
        s->arp_index = 0; s->arp_step = -1; release_voice(s,ARP_OWNER);
        s->arp_origin = s->sample;
    }
    /* FREE starts at the first source attack and measures time in audio samples.
     * No UI timer or host transport is involved. New harmony restarts phase. */
    if (s->arp_clock) beat = (double)(s->sample - s->arp_origin) / s->sample_rate * s->arp_bpm / 60.;
    for (int octave = 0; octave < s->arp_range; octave++) for (int i = 0; i < count; i++) {
        int note = source[i] + octave * 12, duplicate = 0;
        for (int n = 0; n < total; n++) duplicate |= notes[n] == note;
        if (note <= 127 && !duplicate) notes[total++] = (uint8_t)note;
    }
    for (int i = 1; i < total; i++) {
        uint8_t note = notes[i]; int j = i;
        while (j > 0 && notes[j-1] > note) { notes[j] = notes[j-1]; j--; }
        notes[j] = note;
    }
    if (!total) { release_voice(s,ARP_OWNER); return; }
    span = step_beats[s->arp_rate]; pair = span * 2.;
    step = (int64_t)(beat / pair) * 2;
    start = (double)(step / 2) * pair; offset = beat - start;
    length = span * (1. + s->arp_swing / 100.);
    if (offset >= length) { step++; start += length; length = pair - length; }
    if (beat < s->arp_last_beat) { s->arp_step = -1; s->arp_index = 0; }
    if (step != s->arp_step) {
        unsigned index = s->arp_index++;
        s->arp_step = step; release_voice(s,ARP_OWNER);
        if (s->arp_direction == 1) index = (unsigned)total - 1 - index % (unsigned)total;
        else if (s->arp_direction == 2 && total > 1) {
            index %= (unsigned)(2 * total - 2);
            if (index >= (unsigned)total) index = (unsigned)(2 * total - 2) - index;
        } else if (s->arp_direction == 3) {
            s->arp_random = s->arp_random * 1664525u + 1013904223u; index = s->arp_random >> 8;
        }
        index %= (unsigned)total;
        if (beat - start < length * s->arp_gate / 100.) {
            s->diag_generated++; s->diag_note = notes[index];
            int legato = s->legato; s->legato = 0;
            /* CHORD pulses the source voicing, not the octave-expanded range.
             * The same owner, retry handling and gate apply to every note. */
            start_voice(s,ARP_OWNER,s->arp_direction == 4 ? source : &notes[index],s->arp_direction == 4 ? count : 1,
                        s->arp_velocity,s->arp_route,s->arp_channel,0,0,1);
            s->legato = legato;
        }
    }
    if (beat - start >= length * s->arp_gate / 100.) release_voice(s,ARP_OWNER);
    s->arp_last_beat = beat;
}
static int pending_count(Pilot *s) {
    int count = 0;
    for (int d = 0; d < DESTS; d++) for (int ch = 0; ch < 16; ch++)
        count += s->kill_pending[d][ch] != 0 || s->pedal_off[d][ch] || (!!s->pedal_want[d][ch] != !!s->pedal_sent[d][ch]);
    for (int i = 0; i < CELLS; i++) {
        Pitch *p = &s->pitches[i];
        count += p->used && (p->must_off || (!!p->refs != !!p->sent));
    }
    for (int o = 0; o < OWNERS; o++)
        for (int n = 0; n < s->voices[o].count; n++)
            count += s->voices[o].due[n] > s->sample;
    return count;
}

static void set_param(void *instance, const char *key, const char *json) {
    Pilot *s = instance;
    Command c;
    if (!s || !s->used || s->retired || !key || strcmp(key,"command")) return;
    if (!parse_command(json,&c) || !valid_command(&c)) { s->error = "Invalid command"; return; }
    s->error = 0;
    if (!strcmp(c.op,"pedal")) {
        const int bit=1<<c.values[F_OWNER];
        for(int d=0;d<DESTS;d++) for(int ch=0;ch<16;ch++) {
            int want=s->pedal_want[d][ch]&~bit;
            int selected=ch==c.values[F_CHANNEL];
            if(value(&c,F_DIVISI,0)) {
                selected=0;
                for(int i=0;i<NOTES;i++)selected|=ch==(has(&c,F_CHANNELS)?c.channels[i]:c.values[F_CHANNEL]+i);
            }
            if(c.values[F_ENABLED] && selected && wanted_dest(c.values[F_ROUTE],d) && supports(s,d))want|=bit;
            if(!want && s->pedal_sent[d][ch])s->pedal_off[d][ch]=1;
            s->pedal_want[d][ch]=(uint8_t)want;
        }
        reconcile(s);
    } else if (!strcmp(c.op,"arp")) {
        int enabled = value(&c,F_ENABLED,s->arp_enabled), rate = value(&c,F_RATE,s->arp_rate);
        int route = value(&c,F_ROUTE,s->arp_route), channel = value(&c,F_CHANNEL,s->arp_channel);
        int clock = value(&c,F_CLOCK,s->arp_clock), bpm = value(&c,F_BPM,s->arp_bpm);
        if (enabled != s->arp_enabled || rate != s->arp_rate || route != s->arp_route || channel != s->arp_channel || clock != s->arp_clock || bpm != s->arp_bpm) {
            release_voice(s,ARP_OWNER); s->arp_step = -1; s->arp_index = 0;
            s->arp_count = 0; s->arp_last_beat = -1.; s->arp_origin = s->sample;
        }
        s->arp_clock = clock; s->arp_bpm = bpm;
        s->arp_enabled = enabled; s->arp_rate = rate; s->arp_route = route; s->arp_channel = channel;
        s->arp_direction = value(&c,F_DIRECTION,s->arp_direction); s->arp_range = value(&c,F_RANGE,s->arp_range);
        s->arp_gate = value(&c,F_GATE,s->arp_gate); s->arp_swing = value(&c,F_SWING,s->arp_swing);
        s->arp_velocity = value(&c,F_VELOCITY,s->arp_velocity); s->arp_hold = value(&c,F_HOLD,s->arp_hold);
        if (!s->arp_hold && !s->arp_live_down) s->arp_live_count = 0;
    } else if (!strcmp(c.op,"arpsrc")) {
        s->arp_live_down = c.count > 0;
        if (c.count || !s->arp_hold || (has(&c,F_ENABLED) && !c.values[F_ENABLED])) {
            s->arp_live_count = c.count; memcpy(s->arp_live,c.notes,(unsigned)c.count);
            if (!c.count && !s->running) { release_voice(s,ARP_OWNER); s->arp_count = 0; }
        }
    } else if (!strcmp(c.op,"config")) {
        int route = value(&c,F_ROUTE,s->route), channel = value(&c,F_CHANNEL,s->channel);
        int divisi=value(&c,F_DIVISI,s->divisi);
        int map_changed=has(&c,F_CHANNELS) && (!s->divisi_custom || memcmp(s->divisi_map,c.channels,NOTES));
        if(divisi && !has(&c,F_CHANNELS) && !s->divisi_custom && channel>16-NOTES) {s->error="Divisi channel range";return;}
        int available = value(&c,F_MOVE,s->move_available), rate = value(&c,F_RATE,s->rate);
        if (route != s->route || channel != s->channel || available != s->move_available || divisi != s->divisi || (divisi && map_changed)) panic(s);
        if(has(&c,F_CHANNELS)){memcpy(s->divisi_map,c.channels,NOTES);s->divisi_custom=1;}
        s->divisi=divisi;
        if (rate != s->rate) stop_loop(s);
        s->route = route; s->channel = channel; s->move_available = available;
        s->rate = rate; s->gate = value(&c,F_GATE,s->gate);
        s->legato = value(&c,F_LEGATO,s->legato);
        int bass_route = value(&c,F_BASS_ROUTE,s->bass_route), bass_channel = value(&c,F_BASS_CHANNEL,s->bass_channel);
        int bass_clip=value(&c,F_BASS_CLIP,s->bass_clip);
        if (bass_route != s->bass_route || bass_channel != s->bass_channel || bass_clip!=s->bass_clip) {
            release_voice(s,LOOP_BASS_OWNER);s->bass_event=-1;s->bass_start=-1;
        }
        s->bass_clip=bass_clip;
        s->bass_route = bass_route; s->bass_channel = bass_channel;
        s->bass_velocity = value(&c,F_BASS_VELOCITY,s->bass_velocity);
    } else if (!strcmp(c.op,"on")) {
        int live_legato = s->legato;
        s->legato = value(&c,F_LEGATO,s->legato);
        start_pattern(s,c.values[F_OWNER],c.notes,c.count,value(&c,F_VELOCITY,100),
                    value(&c,F_ROUTE,s->route),value(&c,F_CHANNEL,s->channel),value(&c,F_STRUM,0),0,value(&c,F_RETRIGGER,0),
                    value(&c,F_STRUM_DIR,0),value(&c,F_STRUM_TIME,0),value(&c,F_STRUM_VEL,0),value(&c,F_DIVISI,0),has(&c,F_CHANNELS)?c.channels:0);
        s->legato = live_legato;
    } else if (!strcmp(c.op,"pressure")) {
        if (s->voices[c.values[F_OWNER]].count)
            set_pressure(s,c.values[F_OWNER],c.values[F_PRESSURE]);
    } else if (!strcmp(c.op,"off")) {
        release_voice(s,c.values[F_OWNER]);
    } else if (!strcmp(c.op,"hold")) {
        s->voices[c.values[F_OWNER]].latched = 1;
    } else if (!strcmp(c.op,"slot")) {
        Slot *slot = &s->slots[c.values[F_INDEX]];
        int bass = value(&c,F_BASS,-1);
        int changed = slot->count != c.count || memcmp(slot->notes,c.notes,(unsigned)c.count);
        int bass_changed = bass != slot->bass;
        slot->bass = bass;
        slot->strum = (uint8_t)value(&c,F_STRUM,0);
        slot->strum_dir=(uint8_t)value(&c,F_STRUM_DIR,0);slot->strum_time=(uint8_t)value(&c,F_STRUM_TIME,0);slot->strum_vel=(uint8_t)value(&c,F_STRUM_VEL,0);
        slot->legato = (uint8_t)value(&c,F_LEGATO,s->legato);
        slot->count = (uint8_t)c.count; slot->velocity = (uint8_t)value(&c,F_VELOCITY,100);
        slot->duration=(uint8_t)value(&c,F_DURATION,0);
        slot->timed=has(&c,F_AT);slot->at=value(&c,F_AT,0);slot->len=value(&c,F_LEN,0);
        memcpy(slot->notes,c.notes,(unsigned)c.count);
        if (!c.count && s->event_slot == c.values[F_INDEX]) release_loop(s);
        else if (changed && s->event_slot == c.values[F_INDEX] && s->voices[LOOP_OWNER].count)
            start_loop(s,slot);
        else if (bass_changed && s->event_slot == c.values[F_INDEX] && s->voices[LOOP_OWNER].count)
            start_loop_bass(s,slot);
    } else if (!strcmp(c.op,"bassslot")) {
        Slot *slot=&s->bass_slots[c.values[F_INDEX]];
        int changed=slot->count!=c.count || (c.count && slot->notes[0]!=c.notes[0]) || slot->duration!=value(&c,F_DURATION,1) || slot->velocity!=value(&c,F_VELOCITY,100) || slot->at!=value(&c,F_AT,0) || slot->len!=value(&c,F_LEN,0);
        slot->count=(uint8_t)c.count;slot->notes[0]=c.notes[0];
        slot->duration=(uint8_t)value(&c,F_DURATION,1);slot->velocity=(uint8_t)value(&c,F_VELOCITY,100);
        slot->timed=has(&c,F_AT);slot->at=value(&c,F_AT,0);slot->len=value(&c,F_LEN,0);
        if(changed && s->bass_event==c.values[F_INDEX]) {
            release_voice(s,LOOP_BASS_OWNER);s->bass_event=-1;s->bass_start=-1;
        }
    } else if (!strcmp(c.op,"cleargrid")) {
        stop_loop(s);memset(s->slots,0,sizeof(s->slots));memset(s->bass_slots,0,sizeof(s->bass_slots));
    } else if (!strcmp(c.op,"record")) {
        /* Bit 1 mutes captured chords, bit 2 captured bass. Unarmed lanes
         * retain ownership and phase, including when Record ends mid-note. */
        int part=value(&c,F_RECORD_PART,0);
        int next=c.values[F_ENABLED]?(part==1?1:part==2?2:3):0;
        if(next&1)release_voice(s,LOOP_OWNER);
        if((next|s->recording)&2) {
            release_voice(s,LOOP_BASS_OWNER);s->bass_event=-1;s->bass_start=-1;
        }
        s->recording=next;
    } else if (!strcmp(c.op,"arm")) {
        s->armed = c.values[F_ENABLED];
        if (!s->armed) stop_loop(s);
    } else if (!strcmp(c.op,"panic")) {
        /* Preserve arming and phase: do not retrigger this step after panic. */
        panic(s);
    } else if (!strcmp(c.op,"kill")) {
        /* Explicit STOP: no new loop/strum/test attacks after this command. */
        s->armed = 0;
        s->recording=0;
        stop_loop(s);
        panic(s);
        for (int d = 0; d < DESTS; d++) for (int ch = 0; ch < 16; ch++)
            if (s->played_channels[d] & (1u << ch)) s->kill_pending[d][ch] = 7;
    } else if (!strcmp(c.op,"arptest")) {
        const uint8_t note = 60;
        s->diag_generated++; s->diag_note = note;
        start_voice(s,TEST_OWNER,&note,1,100,s->arp_route,s->arp_channel,0,350,1);
    } else if (!strcmp(c.op,"test")) {
        static const uint8_t major[3] = {60,64,67};
        start_voice(s,TEST_OWNER,major,3,100,value(&c,F_ROUTE,s->route),
                    value(&c,F_CHANNEL,s->channel),0,350,0);
    }
    reconcile(s);
}
static int voice_sounding(Pilot *s, int owner) {
    Voice *v = &s->voices[owner];
    for (int i = 0; i < v->count; i++) for (int d = 0; d < DESTS; d++) {
        if (v->assigned[i] & (1u << d)) {
            Pitch *p = pitch(s,d,v->channels[i],v->notes[i],0);
            if (p && p->sent) return 1;
        }
    }
    return 0;
}
static int get_param(void *instance, const char *key, char *buf, int size) {
    Pilot *s = instance;
    int active = 0, sounding = 0, n;
    if (!s || !key || !buf || size <= 0) return -1;
    if (!strcmp(key,"clock")) {
        const double beat=s->host&&s->host->get_beat_position?s->host->get_beat_position():-1.;
        const int valid=beat>=0. && beat<1.e12;
        n=snprintf(buf,(unsigned)size,"{\"beat\":%.6f,\"ready\":%s}",valid?beat:-1.,valid&&host_clock_ready(s,beat)?"true":"false");
    } else if (!strcmp(key,"arp_diag")) {
        const int clock = s->host && s->host->get_clock_status ? s->host->get_clock_status() : -1;
        const int moving = s->diag_clock_seen && s->sample - s->diag_clock_sample < (unsigned)s->sample_rate / 2;
        const int count = s->running && !(s->recording&1) && loop_has_chords(s) ? (s->event_slot>=0?s->slots[s->event_slot].count:0) : s->arp_live_count;
        /* Separate bounded response: fits older hosts' 256-byte param buffer.
         * TX means host callback accepted a packet, not audible receipt. */
        n = snprintf(buf,(unsigned)size,
            "{\"on\":%d,\"play\":%d,\"clock\":%d,\"chord\":%d,\"step\":%u,\"gen\":%u,\"tx\":%u,\"fail\":%u,\"note\":%d,\"sent\":%d,\"dest\":%d,\"ch\":%d,\"out\":%d,\"channel\":%d,\"blocks\":%u,\"error\":%d}",
            s->arp_enabled,clock,moving,count,s->arp_index,s->diag_generated,s->diag_tx,s->diag_failed,
            s->diag_note,s->diag_tx_note,s->diag_tx_route,s->diag_tx_channel,s->arp_route,s->arp_channel,s->diag_blocks,s->error!=0);
    } else if (!strcmp(key,"capabilities")) {
        n = snprintf(buf,(unsigned)size,"{\"v\":1,\"move\":%s,\"usb\":%s,\"chain\":%s,\"clock\":%s}",
            supports(s,MOVE) ? "true" : "false", supports(s,USB) ? "true" : "false",
            supports(s,CHAIN) ? "true" : "false",
            s->host && s->host->get_clock_status && s->host->get_beat_position ? "true" : "false");
    } else if (!strcmp(key,"state")) {
        int arp_status = 6;
        if (!s->arp_enabled) arp_status = 0;
        else if (!s->arp_clock && (!s->host || !s->host->get_beat_position)) arp_status = 1;
        else if (!s->arp_clock && s->host->get_clock_status && s->host->get_clock_status() == MOVE_CLOCK_STATUS_STOPPED) arp_status = 2;
        else if (!s->arp_clock && !(s->host->get_beat_position() >= 0. && s->host->get_beat_position() < 1.e12)) arp_status = 7;
        else if (!s->arp_clock && !host_clock_ready(s,s->host->get_beat_position())) arp_status = 1;
        else if (!(s->running && !(s->recording&1) && loop_has_chords(s) ? (s->event_slot>=0?s->slots[s->event_slot].count:0) : s->arp_live_count)) arp_status = 3;
        else if (!(s->arp_route == 0 ? supports(s,MOVE) : s->arp_route == 1 ? supports(s,USB) :
                   s->arp_route == 2 ? supports(s,MOVE) || supports(s,USB) : supports(s,CHAIN))) arp_status = 4;
        else if (pending_count(s)) arp_status = 5;
        for (int o = 0; o < OWNERS; o++) active += !!s->voices[o].count;
        for (int i = 0; i < CELLS; i++) sounding |= s->pitches[i].used && s->pitches[i].sent;
        n = snprintf(buf,(unsigned)size,
            "{\"v\":1,\"armed\":%s,\"running\":%s,\"slot\":%d,\"cycle\":%d,\"sounding\":%s,\"active\":%d,\"pending\":%d,\"loop_sounding\":%s,\"bass_sounding\":%s,\"arp_status\":%d,\"event\":%d,\"be\":%d,\"es\":%u}",
            s->armed ? "true" : "false",s->running ? "true" : "false",s->slot,s->cycle,
            sounding ? "true" : "false",active,pending_count(s),voice_sounding(s,LOOP_OWNER) ? "true" : "false",
            voice_sounding(s,LOOP_BASS_OWNER) ? "true" : "false",arp_status,s->event_slot,s->bass_event,s->event_serial);
    } else return -1;
    return n >= size ? size - 1 : n;
}
static int get_error(void *instance, char *buf, int size) {
    Pilot *s = instance;
    int n;
    if (!buf || size <= 0) return 0;
    n = snprintf(buf,(unsigned)size,"%s",s && s->error ? s->error : "");
    return n >= size ? size - 1 : n;
}
static void on_midi(void *instance, const uint8_t *msg, int len, int source) {
    /* Pads are interpreted once by the UI. Never regenerate incoming notes,
     * including cable-2 echoes from Move, chain broadcasts, or USB input. */
    (void)instance; (void)msg; (void)len; (void)source;
}
static void reap_retired(void) {
    for (int i = 0; i < INSTANCES; i++) if (pool[i].used && pool[i].retired) {
        reconcile(&pool[i]);
        if (!pending_count(&pool[i])) { pool[i].used = 0; pool[i].retired = 0; }
    }
}
static void render_block(void *instance, int16_t *out, int frames) {
    Pilot *s = instance;
    if (frames < 0 || frames > 4096) return;
    if (out) memset(out,0,(unsigned)frames * 2 * sizeof(*out));
    if (!s || !s->used || s->retired) return;
    reap_retired();
    s->diag_blocks++;
    if (s->host && s->host->get_beat_position) {
        const double beat = s->host->get_beat_position();
        if (beat >= 0. && beat < 1.e12 && s->diag_beat >= 0. && beat != s->diag_beat) {
            s->diag_clock_sample = s->sample; s->diag_clock_seen = 1;
        }
        if (!(beat >= 0. && beat < 1.e12)) s->diag_clock_seen = 0;
        s->diag_beat = beat;
    }
    update_loop(s);
    update_bass_loop(s);
    update_arp(s);
    service_voices(s);
    s->sample += (unsigned)frames;
}
static void *create_instance(const char *dir, const char *defaults) {
    (void)dir; (void)defaults;
    reap_retired();
    for (int i = 0; i < INSTANCES; i++) if (!pool[i].used) {
        Pilot *s = &pool[i];
        memset(s,0,sizeof(*s));
        s->used = 1; s->host = current_host;
        s->sample_rate = current_host && current_host->sample_rate > 0 ? current_host->sample_rate : MOVE_SAMPLE_RATE;
        s->rate = 2; s->gate = 80; s->slot = -1; s->absolute_step = -1; s->last_beat = -1.;
        s->event_slot=-1;s->event_start=-1;
        s->bass_event=-1;s->bass_start=-1;
        s->move_available = current_host && current_host->midi_inject_to_move != 0;
        s->bass_velocity = 100;
        s->arp_range = 1; s->arp_gate = 70; s->arp_velocity = 100; s->arp_channel = 1;
        s->arp_step = -1; s->arp_last_beat = -1.; s->arp_random = 1;
        s->arp_bpm = 120;
        s->strum_seed = 17;
        s->diag_beat = -1.; s->diag_note = s->diag_tx_note = s->diag_tx_route = s->diag_tx_channel = -1;
        for (int slot = 0; slot < STEPS; slot++) s->slots[slot].bass = -1;
        return s;
    }
    return 0;
}
static void destroy_instance(void *instance) {
    Pilot *s = instance;
    if (!s || !s->used || s->retired) return;
    s->armed = 0;
    panic(s);
    /* Teardown cannot wait. Keep failed offs in the static pool; a surviving
     * instance render or subsequent create retries them before reusing storage.
     * A host unloading the .so while its MIDI queue stays full cannot guarantee
     * delivery; that is a host lifecycle limitation, not permission to block. */
    s->retired = 1;
    reap_retired();
}
static plugin_api_v2_t api = { MOVE_PLUGIN_API_VERSION_2, create_instance,
    destroy_instance, on_midi, set_param, get_param, get_error, render_block };
__attribute__((visibility("default")))
plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *host) {
    if (!host || host->api_version < MOVE_PLUGIN_API_VERSION) return 0;
    current_host = host;
    return &api;
}
