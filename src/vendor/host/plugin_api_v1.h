/* Schwung stable plugin ABI, declarations adapted from:
 * https://github.com/charlesvestal/schwung/blob/main/src/host/plugin_api_v1.h
 * Copyright (c) 2025-2026 Charles Vestal. MIT License.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * ALL callbacks, including create/destroy/set/get, execute on the realtime SPI
 * thread. No allocation/free, file I/O, logging, locks, or unbounded work.
 * Send callbacks take USB-MIDI packets and return 4 if queued, 0 on failure.
 * Injection cable 2 targets a Move instrument by receive channel and may echo
 * to USB-A. Cable 0 is the hardware surface. Guard optional host callbacks.
 */
#ifndef MOVE_PLUGIN_API_V1_H
#define MOVE_PLUGIN_API_V1_H
#include <stdint.h>
#define MOVE_PLUGIN_API_VERSION 1
#define MOVE_PLUGIN_API_VERSION_2 2
#define MOVE_SAMPLE_RATE 44100
#define MOVE_FRAMES_PER_BLOCK 128
#define MOVE_AUDIO_OUT_OFFSET 256
#define MOVE_AUDIO_IN_OFFSET (2048 + 256)
#define MOVE_AUDIO_BYTES_PER_BLOCK 512
#define MOVE_MIDI_SOURCE_INTERNAL 0
#define MOVE_MIDI_SOURCE_EXTERNAL 2
#define MOVE_MIDI_SOURCE_HOST 3
#define MOVE_MIDI_SOURCE_FX_BROADCAST 4
#define MOVE_CLOCK_STATUS_UNAVAILABLE 0
#define MOVE_CLOCK_STATUS_STOPPED 1
#define MOVE_CLOCK_STATUS_RUNNING 2
typedef int (*move_mod_emit_value_fn)(void *, const char *, const char *,
    const char *, float, float, float, int, int);
typedef void (*move_mod_clear_source_fn)(void *, const char *);
typedef struct host_api_v1 {
    uint32_t api_version;
    int sample_rate, frames_per_block;
    uint8_t *mapped_memory;
    int audio_out_offset, audio_in_offset;
    void (*log)(const char *);
    int (*midi_send_internal)(const uint8_t *, int);
    int (*midi_send_external)(const uint8_t *, int);
    int (*get_clock_status)(void);
    move_mod_emit_value_fn mod_emit_value;
    move_mod_clear_source_fn mod_clear_source;
    void *mod_host_ctx;
    float (*get_bpm)(void);
    int (*midi_inject_to_move)(const uint8_t *, int);
    int (*slot_recv_channel)(void *);
    double (*get_beat_position)(void);
    void *reserved[8];
} host_api_v1_t;
typedef struct plugin_api_v1 {
    uint32_t api_version;
    int (*on_load)(const char *, const char *);
    void (*on_unload)(void);
    void (*on_midi)(const uint8_t *, int, int);
    void (*set_param)(const char *, const char *);
    int (*get_param)(const char *, char *, int);
    int (*get_error)(char *, int);
    void (*render_block)(int16_t *, int);
} plugin_api_v1_t;
typedef struct plugin_api_v2 {
    uint32_t api_version;
    void *(*create_instance)(const char *, const char *);
    void (*destroy_instance)(void *);
    void (*on_midi)(void *, const uint8_t *, int, int);
    void (*set_param)(void *, const char *, const char *);
    int (*get_param)(void *, const char *, char *, int);
    int (*get_error)(void *, char *, int);
    void (*render_block)(void *, int16_t *, int);
} plugin_api_v2_t;
typedef plugin_api_v1_t *(*move_plugin_init_v1_fn)(const host_api_v1_t *);
typedef plugin_api_v2_t *(*move_plugin_init_v2_fn)(const host_api_v1_t *);
#define MOVE_PLUGIN_INIT_SYMBOL "move_plugin_init_v1"
#define MOVE_PLUGIN_INIT_V2_SYMBOL "move_plugin_init_v2"
#endif
