#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "../../src/dsp/chord_pilot.c"

typedef struct { int dest; uint8_t bytes[4]; } Event;
static Event events[32768];
static int event_count, fail_on[3], fail_off[3], clock_status;
static double beat;
static host_api_v1_t host;
static plugin_api_v2_t *plugin;
static int groups;

static int record(int dest, const uint8_t *msg, int len) {
    int on = (msg[1] & 0xf0) == 0x90;
    assert(len == 4);
    if ((on && fail_on[dest]) || (!on && fail_off[dest])) return 0;
    assert(event_count < (int)(sizeof(events)/sizeof(events[0])));
    events[event_count].dest = dest;
    memcpy(events[event_count++].bytes,msg,4);
    return 4;
}
static int move_send(const uint8_t *msg,int len) { return record(MOVE,msg,len); }
static int usb_send(const uint8_t *msg,int len) { return record(USB,msg,len); }
static int chain_send(const uint8_t *msg,int len) { return record(CHAIN,msg,len); }
static int clock_get(void) { return clock_status; }
static double beat_get(void) { return beat; }
static void reset(void) {
    memset(pool,0,sizeof(pool));
    memset(&host,0,sizeof(host));
    memset(fail_on,0,sizeof(fail_on)); memset(fail_off,0,sizeof(fail_off));
    event_count = 0; beat = 0.; clock_status = MOVE_CLOCK_STATUS_STOPPED;
    host.api_version = 1; host.sample_rate = 1000;
    host.midi_inject_to_move = move_send;
    host.midi_send_external = usb_send; host.midi_send_internal = chain_send;
    host.get_clock_status = clock_get; host.get_beat_position = beat_get;
    plugin = move_plugin_init_v2(&host);
    assert(plugin && plugin->api_version == 2);
}
static void command(void *s,const char *json) { plugin->set_param(s,"command",json); }
static void tick(void *s,int frames) {
    int16_t audio[256];
    assert(frames <= 128);
    for (int i=0;i<256;i++) audio[i] = 123;
    plugin->render_block(s,audio,frames);
    for (int i=0;i<frames*2;i++) assert(audio[i] == 0);
}
static int count(int dest,int on,int note) {
    int n=0;
    for (int i=0;i<event_count;i++)
        n += (dest<0 || events[i].dest==dest) &&
             ((events[i].bytes[1]&0xf0)==(on?0x90:0x80)) &&
             (note<0 || events[i].bytes[2]==note);
    return n;
}
static void state_contains(void *s,const char *text) {
    char buf[512];
    assert(plugin->get_param(s,"state",buf,sizeof(buf))>0);
    if (!strstr(buf,text)) { fprintf(stderr,"Missing %s in %s\n",text,buf); assert(0); }
}
static int pressure_count(int dest,int note,int amount) {
    int n=0;
    for(int i=0;i<event_count;i++)n+=(dest<0||events[i].dest==dest) &&
        (events[i].bytes[1]&0xf0)==0xa0 && events[i].bytes[2]==note && events[i].bytes[3]==amount;
    return n;
}
static int midi_count(int dest,int status,int note) {
    int n=0;
    for(int i=0;i<event_count;i++) n+=(dest<0||events[i].dest==dest) &&
        events[i].bytes[1]==status && (note<0||events[i].bytes[2]==note);
    return n;
}
static void test_divisi_routes_and_release(void) {
    const uint8_t notes[8]={72,48,67,60,84,55,76,64};uint8_t channels[8];
    for(int base=0;base<16;base++)for(int n=1;n<=8;n++) {
        assert(divisi_channels(notes,n,base,1,channels)==(base+n<=16));
        if(base+n<=16)for(int i=0;i<n;i++)for(int j=0;j<n;j++)
            assert((channels[i]<channels[j])==(notes[i]<notes[j]));
        assert(divisi_channels(notes,n,base,0,channels));
        for(int i=0;i<n;i++)assert(channels[i]==base);
    }
    for(int route=0;route<4;route++) {
        reset();Pilot *s=plugin->create_instance("",0);char cmd[160];
        snprintf(cmd,sizeof(cmd),"{\"op\":\"on\",\"owner\":0,\"notes\":[67,60,64,71],\"channel\":2,\"route\":%d,\"divisi\":1}",route);
        command(s,cmd);
        for(int d=0;d<DESTS;d++) {
            int want=wanted_dest(route,d);
            assert(midi_count(d,0x92,60)==want && midi_count(d,0x93,64)==want);
            assert(midi_count(d,0x94,67)==want && midi_count(d,0x95,71)==want);
        }
        command(s,"{\"op\":\"hold\",\"owner\":0}");
        assert(count(-1,0,-1)==0);
        command(s,"{\"op\":\"off\",\"owner\":0}");
        for(int d=0;d<DESTS;d++) {
            int want=wanted_dest(route,d);
            assert(midi_count(d,0x82,60)==want && midi_count(d,0x83,64)==want);
            assert(midi_count(d,0x84,67)==want && midi_count(d,0x85,71)==want);
        }
        for(int i=0;i<CELLS;i++)assert(!s->pitches[i].used);
    }
    groups++;
}
static void test_divisi_revoice_and_shared_pressure(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67,71],\"divisi\":1,\"legato\":1}");
    command(s,"{\"op\":\"pressure\",\"owner\":0,\"pressure\":70}");
    assert(midi_count(MOVE,0xa3,71)==1);
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[67],\"channel\":2}");
    command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":90}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,67,71],\"divisi\":1,\"legato\":1}");
    assert(midi_count(MOVE,0x90,60)==1); // retained exact pitch/channel
    assert(midi_count(MOVE,0x81,64)==1 && midi_count(MOVE,0x83,71)==1);
    assert(midi_count(MOVE,0x91,67)==1 && midi_count(MOVE,0x92,71)==1);
    assert(midi_count(MOVE,0x82,67)==0); // melody still owns this address
    assert(pitch(s,MOVE,2,67,0)->pressure==90);
    command(s,"{\"op\":\"off\",\"owner\":8}");
    assert(midi_count(MOVE,0x82,67)==1);
    command(s,"{\"op\":\"kill\"}");
    for(int i=0;i<CELLS;i++)assert(!s->pitches[i].used);
    groups++;
}
static void test_divisi_strum_retry_and_boundaries(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"channel\":13,\"divisi\":1,\"strum_ms\":20,\"strum_dir\":1}");
    assert(midi_count(MOVE,0x9f,67)==1 && count(MOVE,1,-1)==1);
    tick(s,40);tick(s,1);assert(midi_count(MOVE,0x9d,60)==1 && midi_count(MOVE,0x9e,64)==1);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67,71],\"channel\":13,\"divisi\":1}");
    assert(s->error && s->voices[0].count==3); // reject atomically, never wrap
    fail_off[MOVE]=1;command(s,"{\"op\":\"off\",\"owner\":0}");
    assert(count(MOVE,0,-1)==0);fail_off[MOVE]=0;tick(s,1);
    assert(count(MOVE,0,-1)==3);
    fail_on[MOVE]=1;
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"channel\":8,\"divisi\":1}");
    assert(midi_count(MOVE,0x98,60)==0);fail_on[MOVE]=0;tick(s,1);
    assert(midi_count(MOVE,0x98,60)==1 && midi_count(MOVE,0x99,64)==1 && midi_count(MOVE,0x9a,67)==1);
    command(s,"{\"op\":\"off\",\"owner\":0}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"divisi\":1,\"strum_ms\":100}");
    int ons=count(MOVE,1,-1);command(s,"{\"op\":\"kill\"}");tick(s,128);tick(s,128);
    assert(count(MOVE,1,-1)==ons);
    groups++;
}
static void test_divisi_pedal_and_sequence(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"pedal\",\"owner\":0,\"route\":2,\"channel\":8,\"enabled\":1,\"divisi\":1}");
    for(int d=0;d<2;d++)for(int ch=8;ch<16;ch++)assert(s->pedal_sent[d][ch]);
    command(s,"{\"op\":\"pedal\",\"owner\":1,\"route\":2,\"channel\":10,\"enabled\":1}");
    command(s,"{\"op\":\"pedal\",\"owner\":0,\"route\":2,\"channel\":8,\"enabled\":0,\"divisi\":1}");
    for(int d=0;d<2;d++)for(int ch=8;ch<16;ch++)assert(s->pedal_sent[d][ch]==(ch==10));
    command(s,"{\"op\":\"panic\"}");
    command(s,"{\"op\":\"config\",\"divisi\":1,\"channel\":8}");assert(s->divisi);
    command(s,"{\"op\":\"config\",\"channel\":9}");assert(s->error && s->channel==8);
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67]}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;tick(s,1);
    assert(midi_count(MOVE,0x98,60)==1 && midi_count(MOVE,0x99,64)==1 && midi_count(MOVE,0x9a,67)==1);
    command(s,"{\"op\":\"config\",\"divisi\":0}");
    assert(midi_count(MOVE,0x88,60)==1 && midi_count(MOVE,0x89,64)==1 && midi_count(MOVE,0x8a,67)==1);
    plugin->destroy_instance(s);groups++;
}
static void test_pressure_routes_and_revoice(void) {
    for(int route=0;route<4;route++) {
        reset();void *s=plugin->create_instance("","");char cmd[160];
        snprintf(cmd,sizeof(cmd),"{\"op\":\"on\",\"owner\":8,\"notes\":[60],\"route\":%d,\"channel\":5}",route);command(s,cmd);
        command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":90}");
        for(int d=0;d<DESTS;d++)assert(pressure_count(d,60,90)==wanted_dest(route,d));
        for(int i=0;i<event_count;i++)if((events[i].bytes[1]&0xf0)==0xa0) {
            assert(events[i].bytes[1]==0xa5);assert(events[i].bytes[0]==(events[i].dest==CHAIN?0x0a:0x2a));
        }
        snprintf(cmd,sizeof(cmd),"{\"op\":\"on\",\"owner\":8,\"notes\":[62],\"route\":%d,\"channel\":5}",route);command(s,cmd);
        command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":90}");
        for(int d=0;d<DESTS;d++)assert(pressure_count(d,60,0)==wanted_dest(route,d));
        command(s,"{\"op\":\"kill\"}");
        for(int d=0;d<DESTS;d++)assert(pressure_count(d,62,0)==wanted_dest(route,d));
    }
    groups++;
}
static void test_ensemble_custom_channels(void) {
    for(int route=0;route<4;route++) {
        reset();Pilot *s=plugin->create_instance("",0);char cmd[220];
        snprintf(cmd,sizeof(cmd),"{\"op\":\"on\",\"owner\":0,\"notes\":[67,60,64,71],\"channel\":15,\"route\":%d,\"divisi\":1,\"channels\":[15,4,9,2,6,0,7,3]}",route);
        command(s,cmd);assert(!s->error);
        for(int d=0;d<DESTS;d++) {
            int want=wanted_dest(route,d);
            assert(midi_count(d,0x9f,60)==want && midi_count(d,0x94,64)==want);
            assert(midi_count(d,0x99,67)==want && midi_count(d,0x92,71)==want);
        }
        command(s,"{\"op\":\"pressure\",\"owner\":0,\"pressure\":90}");
        command(s,"{\"op\":\"off\",\"owner\":0}");
        for(int d=0;d<DESTS;d++) {
            int want=wanted_dest(route,d);
            assert(midi_count(d,0x8f,60)==want && midi_count(d,0x84,64)==want);
            assert(midi_count(d,0x89,67)==want && midi_count(d,0x82,71)==want);
        }
        for(int i=0;i<CELLS;i++)assert(!s->pitches[i].used);
    }
    groups++;
}
static void test_ensemble_pedal_remap_and_shared_channels(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"pedal\",\"owner\":0,\"enabled\":1,\"route\":0,\"channel\":15,\"divisi\":1,\"channels\":[15,4,4,15,4,4,15,15]}");
    assert(!s->error);
    for(int ch=0;ch<16;ch++)assert(s->pedal_sent[MOVE][ch]==(ch==15||ch==4));
    assert(midi_count(MOVE,0xbf,64)==1 && midi_count(MOVE,0xb4,64)==1);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"divisi\":1,\"channels\":[15,4,4,15,4,4,15,15]}");
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[64],\"channel\":4}");
    command(s,"{\"op\":\"pedal\",\"owner\":1,\"enabled\":1,\"route\":0,\"channel\":4}");
    command(s,"{\"op\":\"pedal\",\"owner\":0,\"enabled\":0,\"route\":0,\"channel\":15,\"divisi\":1,\"channels\":[15,4,4,15,4,4,15,15]}");
    assert(!s->pedal_sent[MOVE][15] && s->pedal_sent[MOVE][4]);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"legato\":1,\"divisi\":1,\"channels\":[1,2,3,4,5,6,7,8]}");
    assert(midi_count(MOVE,0x8f,60)==1 && midi_count(MOVE,0x84,67)==1 && midi_count(MOVE,0x84,64)==0);
    assert(midi_count(MOVE,0x91,60)==1 && midi_count(MOVE,0x92,64)==1 && midi_count(MOVE,0x93,67)==1);
    command(s,"{\"op\":\"kill\"}");for(int i=0;i<CELLS;i++)assert(!s->pitches[i].used);
    groups++;
}
static void test_ensemble_validation_loop_and_retry(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    const char *invalid[]={"[]","[1]","[0,1,2,3,4,5,6]","[0,1,2,3,4,5,6,16]","[0,1,2,3,4,5,6,-1]","[0,1,2,3,4,5,6,7,8]","[0,1,2,3,4,5,6,1.5]"};
    for(unsigned i=0;i<sizeof(invalid)/sizeof(invalid[0]);i++) {
        char cmd[180];snprintf(cmd,sizeof(cmd),"{\"op\":\"config\",\"divisi\":1,\"channels\":%s}",invalid[i]);
        command(s,cmd);assert(s->error && !s->divisi);
    }
    command(s,"{\"op\":\"config\",\"channel\":15,\"divisi\":1,\"channels\":[15,4,9,2,6,0,7,3]}");assert(!s->error);
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67]}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;tick(s,1);
    assert(midi_count(MOVE,0x9f,60)==1 && midi_count(MOVE,0x94,64)==1 && midi_count(MOVE,0x99,67)==1);
    fail_off[MOVE]=1;
    command(s,"{\"op\":\"config\",\"channels\":[1,2,3,4,5,6,7,8]}");
    assert(midi_count(MOVE,0x8f,60)==0);fail_off[MOVE]=0;tick(s,1);
    assert(midi_count(MOVE,0x8f,60)==1 && midi_count(MOVE,0x84,64)==1 && midi_count(MOVE,0x89,67)==1);
    command(s,"{\"op\":\"kill\"}");for(int i=0;i<CELLS;i++)assert(!s->pitches[i].used);
    groups++;
}
static void test_pressure_shared_pitch_and_hold(void) {
    reset();Pilot *s=plugin->create_instance("","");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60]}");
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[60]}");
    command(s,"{\"op\":\"on\",\"owner\":9,\"notes\":[60]}");
    command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":40}");
    command(s,"{\"op\":\"pressure\",\"owner\":9,\"pressure\":100}");
    command(s,"{\"op\":\"off\",\"owner\":9}");
    assert(pressure_count(MOVE,60,40)==2);assert(count(MOVE,0,60)==0);
    command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":0}");
    command(s,"{\"op\":\"hold\",\"owner\":8}");
    assert(pressure_count(MOVE,60,0)==1);assert(count(MOVE,0,60)==0);
    command(s,"{\"op\":\"off\",\"owner\":8}");assert(count(MOVE,0,60)==0);
    // The DSP clears pressure even if a client omits the explicit reset.
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[64],\"channel\":2}");
    command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":70}");
    command(s,"{\"op\":\"off\",\"owner\":8}");assert(pressure_count(MOVE,64,0)==1);
    assert(pitch(s,MOVE,0,60,0)->refs==1);groups++;
}
static void test_pressure_retries_validation_and_retrigger(void) {
    reset();Pilot *s=plugin->create_instance("","");
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[60]}");
    fail_off[MOVE]=1;
    command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":20}");
    command(s,"{\"op\":\"pressure\",\"owner\":8,\"pressure\":99}");
    assert(pressure_count(MOVE,60,99)==0);fail_off[MOVE]=0;tick(s,1);
    assert(pressure_count(MOVE,60,99)==1);assert(pressure_count(MOVE,60,20)==0);
    const char *bad[]={"{\"op\":\"pressure\",\"owner\":8}","{\"op\":\"pressure\",\"pressure\":7}",
      "{\"op\":\"pressure\",\"owner\":8,\"pressure\":128}","{\"op\":\"pressure\",\"owner\":8,\"pressure\":-1}",
      "{\"op\":\"pressure\",\"owner\":8,\"pressure\":4,\"pressure\":5}"};
    for(unsigned i=0;i<sizeof(bad)/sizeof(*bad);i++){command(s,bad[i]);assert(s->voices[8].pressure==99);}
    command(s,"{\"op\":\"on\",\"owner\":9,\"notes\":[60],\"retrigger\":1}");
    assert(pressure_count(MOVE,60,0)==1);assert(pressure_count(MOVE,60,99)==2);
    fail_off[MOVE]=1;command(s,"{\"op\":\"off\",\"owner\":8}");command(s,"{\"op\":\"off\",\"owner\":9}");
    assert(pitch(s,MOVE,0,60,0)!=NULL);fail_off[MOVE]=0;tick(s,1);
    assert(pressure_count(MOVE,60,0)==2);assert(pitch(s,MOVE,0,60,0)==NULL);groups++;
}
static void test_shared_ownership(void) {
    void *s;
    reset(); s=plugin->create_instance("","");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"velocity\":89}");
    command(s,"{\"op\":\"on\",\"owner\":1,\"notes\":[60,72]}");
    assert(count(MOVE,1,-1)==4 && count(MOVE,1,60)==1);
    assert(events[0].bytes[0]==0x29 && events[0].bytes[3]==89);
    command(s,"{\"op\":\"off\",\"owner\":0}");
    assert(count(MOVE,0,60)==0 && count(MOVE,0,-1)==2);
    command(s,"{\"op\":\"off\",\"owner\":1}");
    assert(count(MOVE,0,60)==1 && count(MOVE,0,-1)==4);
    state_contains(s,"\"active\":0"); state_contains(s,"\"sounding\":false");
    plugin->destroy_instance(s); groups++;
}
static void test_routes_and_reconfiguration(void) {
    void *s;
    reset(); s=plugin->create_instance("",0);
    command(s,"{\"op\":\"config\",\"route\":2,\"channel\":5}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60]}");
    assert(count(MOVE,1,60)==1 && count(USB,1,60)==1);
    assert(events[0].bytes[1]==0x95 && events[1].bytes[0]==0x29);
    command(s,"{\"op\":\"on\",\"owner\":1,\"notes\":[60],\"route\":3,\"channel\":6}");
    assert(count(CHAIN,1,60)==1 && events[2].bytes[0]==9 && events[2].bytes[1]==0x96);
    command(s,"{\"op\":\"config\",\"route\":1,\"channel\":7}");
    assert(count(-1,0,60)==3);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[62]}");
    assert(count(USB,1,62)==1 && events[event_count-1].bytes[1]==0x97);
    command(s,"{\"op\":\"config\",\"route\":0}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[64]}");
    command(s,"{\"op\":\"config\",\"move_available\":0}");
    assert(count(MOVE,0,64)==1);
    plugin->destroy_instance(s); groups++;
}
static void test_failed_delivery(void) {
    void *s;
    reset(); s=plugin->create_instance("",0);
    fail_on[MOVE]=1;
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"route\":2}");
    assert(count(MOVE,1,60)==0 && count(USB,1,60)==1);
    state_contains(s,"\"pending\":1");
    tick(s,10); assert(count(MOVE,1,60)==0);
    fail_on[MOVE]=0; tick(s,10); assert(count(MOVE,1,60)==1);
    fail_off[MOVE]=1;
    command(s,"{\"op\":\"off\",\"owner\":0}");
    assert(count(MOVE,0,60)==0 && count(USB,0,60)==1);
    state_contains(s,"\"pending\":1");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60]}");
    assert(count(MOVE,1,60)==1); /* failed off blocks reattack */
    fail_off[MOVE]=0; tick(s,10);
    assert(count(MOVE,0,60)==1 && count(MOVE,1,60)==2);
    command(s,"{\"op\":\"off\",\"owner\":0}");
    fail_on[MOVE]=1;
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[62]}");
    command(s,"{\"op\":\"off\",\"owner\":0}");
    fail_on[MOVE]=0; tick(s,10);
    assert(count(MOVE,1,62)==0 && count(MOVE,0,62)==0);
    plugin->destroy_instance(s); groups++;
}
static void test_strum_and_panic(void) {
    void *s;
    reset(); s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"strum_ms\":20}");
    assert(count(MOVE,1,-1)==1); state_contains(s,"\"pending\":2");
    tick(s,20); tick(s,0); assert(count(MOVE,1,-1)==2);
    command(s,"{\"op\":\"off\",\"owner\":0}");
    tick(s,100); tick(s,0);
    assert(count(MOVE,1,67)==0 && count(MOVE,0,-1)==2);
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"strum_ms\":100}");
    command(s,"{\"op\":\"panic\"}"); tick(s,100); tick(s,100); tick(s,0);
    assert(count(MOVE,1,67)==0); state_contains(s,"\"armed\":true");
    state_contains(s,"\"active\":0"); state_contains(s,"\"pending\":0");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[65,69,72],\"strum_ms\":20}");
    command(s,"{\"op\":\"config\",\"channel\":1}"); tick(s,100); tick(s,0);
    assert(count(MOVE,1,69)==0 && count(MOVE,1,72)==0);
    plugin->destroy_instance(s); groups++;
}
static void test_loop_transport_gate(void) {
    void *s;
    reset(); s=plugin->create_instance("",0);
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67]}");
    command(s,"{\"op\":\"slot\",\"index\":1,\"notes\":[62,65,69]}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    tick(s,10); assert(event_count==0); state_contains(s,"\"running\":false");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; beat=0.; tick(s,10);
    assert(count(MOVE,1,-1)==3); state_contains(s,"\"slot\":0");
    beat=.81; tick(s,10); assert(count(MOVE,0,-1)==3);
    state_contains(s,"\"slot\":0"); state_contains(s,"\"sounding\":false");
    beat=1.; tick(s,10); state_contains(s,"\"slot\":1");
    assert(count(MOVE,1,62)==1);
    beat=16.; tick(s,10); state_contains(s,"\"slot\":0"); state_contains(s,"\"cycle\":1");
    assert(count(MOVE,1,60)==2);
    command(s,"{\"op\":\"panic\"}"); tick(s,10);
    assert(count(MOVE,1,60)==2); state_contains(s,"\"armed\":true");
    clock_status=MOVE_CLOCK_STATUS_STOPPED; tick(s,10);
    state_contains(s,"\"slot\":-1"); state_contains(s,"\"running\":false");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; beat=.9; tick(s,10);
    assert(count(MOVE,1,60)==2); /* joining after gate does not strike */
    beat=0.; tick(s,10); assert(count(MOVE,1,60)==3); /* rewind */
    command(s,"{\"op\":\"arm\",\"enabled\":0}");
    state_contains(s,"\"sounding\":false"); state_contains(s,"\"slot\":-1");
    plugin->destroy_instance(s); groups++;
}
static void test_loop_rests_rates_clock(void) {
    void *s;
    reset(); s=plugin->create_instance("",0);
    clock_status=MOVE_CLOCK_STATUS_RUNNING;
    command(s,"{\"op\":\"arm\",\"enabled\":1}"); tick(s,10);
    state_contains(s,"\"running\":true");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60]}");
    command(s,"{\"op\":\"slot\",\"index\":3,\"notes\":[67]}");
    command(s,"{\"op\":\"config\",\"rate\":0,\"gate\":100}");
    tick(s,10); assert(count(MOVE,1,60)==1);
    beat=.25; tick(s,10); state_contains(s,"\"slot\":1"); state_contains(s,"\"sounding\":false");
    beat=.75; tick(s,10); assert(count(MOVE,1,67)==1);
    beat=4.; tick(s,10); state_contains(s,"\"cycle\":1"); assert(count(MOVE,1,60)==2);
    command(s,"{\"op\":\"slot\",\"index\":3,\"notes\":[]}");
    beat=4.25; tick(s,10); state_contains(s,"\"slot\":1"); /* deletion never shortens the loop */
    for(int rate=0;rate<5;rate++) {
        char cmd[100]; snprintf(cmd,sizeof(cmd),"{\"op\":\"config\",\"rate\":%d}",rate);
        command(s,cmd); beat=step_beats[rate]*80.; tick(s,10); state_contains(s,"\"cycle\":5");
    }
    beat=NAN; tick(s,10); state_contains(s,"\"running\":false");
    beat=-1.; tick(s,10); state_contains(s,"\"slot\":-1");
    beat=0.; clock_status=MOVE_CLOCK_STATUS_UNAVAILABLE; tick(s,10);
    state_contains(s,"\"running\":false");
    plugin->destroy_instance(s); groups++;
}
static void test_shared_loop_live(void) {
    void *s;
    reset(); s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60]}");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60]}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; tick(s,10);
    assert(count(MOVE,1,60)==1);
    beat=.9; tick(s,10); assert(count(MOVE,0,60)==0);
    command(s,"{\"op\":\"off\",\"owner\":0}"); assert(count(MOVE,0,60)==1);
    plugin->destroy_instance(s); groups++;
}
static void test_validation_echo_testnote(void) {
    static const char *bad[] = { "", "[]", "{}", "{\"op\":\"on\"}",
        "{\"op\":\"on\",\"owner\":41,\"notes\":[60]}",
        "{\"op\":\"slot\",\"index\":16,\"notes\":[60]}",
        "{\"op\":\"on\",\"owner\":0,\"notes\":[128]}",
        "{\"op\":\"on\",\"owner\":0,\"notes\":[1,2,3,4,5,6,7,8,9]}",
        "{\"op\":\"on\",\"owner\":0,\"notes\":[60,]}",
        "{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"channel\":16}",
        "{\"op\":\"on\",\"owner\":00,\"notes\":[60]}",
        "{\"op\":\"test\",\"velocity\":0}", "{\"op\":\"test\",\"op\":\"test\"}",
        "{\"op\":\"config\",\"gate\":0}", "{\"op\":\"config\",\"rate\":5}",
        "{\"op\":\"test\",\"unknown\":2}", "{\"op\":\"test\"} garbage",
        "{\"op\":\"test\",\"channel\":1.5}", "{\"op\":\"test\",\"channel\":1e1}" };
    void *s; char error[80]; uint8_t midi[4]={0x29,0x90,60,100};
    reset(); s=plugin->create_instance("",0);
    for (unsigned i=0;i<sizeof(bad)/sizeof(bad[0]);i++) {
        command(s,bad[i]); assert(plugin->get_error(s,error,sizeof(error))>0); assert(event_count==0);
    }
    command(s,0); assert(event_count==0);
    for (int source=0;source<=4;source++) {
        plugin->on_midi(s,midi,4,source); plugin->on_midi(s,midi+1,3,source);
    }
    assert(event_count==0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,60]}");
    assert(count(MOVE,1,60)==1); command(s,"{\"op\":\"off\",\"owner\":0}");
    assert(count(MOVE,0,60)==1);
    command(s,"{\"op\":\"test\",\"route\":1,\"channel\":3}");
    assert(count(USB,1,-1)==3 && plugin->get_error(s,error,sizeof(error))==0);
    for(int i=0;i<4;i++) tick(s,100);
    tick(s,0); assert(count(USB,0,-1)==3);
    { uint32_t rng=12345; char fuzz[129];
      for(int n=0;n<3000;n++) {
          for(int i=0;i<128;i++) { rng=rng*1664525u+1013904223u; fuzz[i]=(char)(32+(rng%95)); }
          fuzz[128]=0; command(s,fuzz);
      }
    }
    plugin->destroy_instance(s); groups++;
}
static void test_lifecycle_capabilities(void) {
    void *s[5]; char buf[128];
    reset(); assert(move_plugin_init_v2(0)==0); host.api_version=0;
    assert(move_plugin_init_v2(&host)==0); host.api_version=1;
    plugin=move_plugin_init_v2(&host);
    for(int i=0;i<4;i++) { s[i]=plugin->create_instance("",0); assert(s[i]); }
    s[4]=plugin->create_instance("",0); assert(!s[4]);
    command(s[0],"{\"op\":\"on\",\"owner\":0,\"notes\":[60]}");
    fail_off[MOVE]=1; plugin->destroy_instance(s[0]);
    assert(count(MOVE,0,60)==0 && !plugin->create_instance("",0));
    fail_off[MOVE]=0; tick(s[1],10); assert(count(MOVE,0,60)==1);
    s[0]=plugin->create_instance("",0); assert(s[0]);
    for(int i=0;i<4;i++) plugin->destroy_instance(s[i]);
    host.midi_inject_to_move=0; host.midi_send_external=0;
    host.midi_send_internal=0; host.get_clock_status=0; host.get_beat_position=0;
    plugin=move_plugin_init_v2(&host); s[0]=plugin->create_instance("",0);
    assert(plugin->get_param(s[0],"capabilities",buf,sizeof(buf))>0);
    assert(strstr(buf,"\"move\":false") && strstr(buf,"\"clock\":false"));
    command(s[0],"{\"op\":\"test\"}"); tick(s[0],10);
    state_contains(s[0],"\"sounding\":false");
    assert(plugin->get_param(s[0],"unknown",buf,sizeof(buf))==-1);
    assert(plugin->get_param(s[0],"state",buf,1)==0 && buf[0]==0);
    plugin->destroy_instance(s[0]); groups++;
}
static void test_legato_revoice_and_release(void) {
    reset(); void *s = plugin->create_instance("",0);
    command(s,"{\"op\":\"config\",\"legato\":1}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"route\":2}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,65,69],\"route\":2,\"strum_ms\":20}");
    assert(count(MOVE,1,60)==1 && count(MOVE,0,60)==0);
    assert(count(USB,1,60)==1 && count(USB,0,60)==0);
    assert(count(MOVE,0,64)==1 && count(MOVE,1,65)==0);
    tick(s,40); tick(s,0);
    assert(count(MOVE,1,65)==1 && count(MOVE,1,69)==1);
    command(s,"{\"op\":\"off\",\"owner\":0}");
    assert(count(MOVE,0,60)==1 && count(USB,0,60)==1);
    state_contains(s,"\"active\":0"); state_contains(s,"\"pending\":0");
    /* Changing destination must never carry old destination references. */
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"route\":2}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"route\":3}");
    assert(count(MOVE,0,60)==2 && count(USB,0,60)==2 && count(CHAIN,1,60)==1);
    command(s,"{\"op\":\"panic\"}");
    state_contains(s,"\"pending\":0");
    plugin->destroy_instance(s); groups++;
}

static void test_legato_loop_ties_rests_and_updates(void) {
    reset(); void *s = plugin->create_instance("",0);
    command(s,"{\"op\":\"config\",\"legato\":1,\"gate\":100}");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67]}");
    command(s,"{\"op\":\"slot\",\"index\":1,\"notes\":[60,65,69]}");
    command(s,"{\"op\":\"slot\",\"index\":3,\"notes\":[60,64,67]}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; tick(s,10);
    state_contains(s,"\"loop_sounding\":true");
    beat=1.; tick(s,10);
    assert(count(MOVE,1,60)==1 && count(MOVE,0,60)==0);
    assert(count(MOVE,0,64)==1 && count(MOVE,1,65)==1);
    /* Editing a sounding slot revoices it once. Re-sending it is inert. */
    command(s,"{\"op\":\"slot\",\"index\":1,\"notes\":[60,65,70]}");
    assert(count(MOVE,0,69)==1 && count(MOVE,1,70)==1);
    int before=event_count;
    command(s,"{\"op\":\"slot\",\"index\":1,\"notes\":[60,65,70]}");
    assert(event_count==before);
    beat=2.; tick(s,10); // rest
    assert(count(MOVE,0,60)==1); state_contains(s,"\"loop_sounding\":false");
    beat=3.; tick(s,10); assert(count(MOVE,1,60)==2);
    command(s,"{\"op\":\"config\",\"gate\":50}");
    beat=3.6; tick(s,10); assert(count(MOVE,0,60)==2);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[72]}");
    state_contains(s,"\"sounding\":true"); state_contains(s,"\"loop_sounding\":false");
    plugin->destroy_instance(s); groups++;
}

static void test_legato_failed_off_never_loses_reference(void) {
    reset(); void *s = plugin->create_instance("",0);
    command(s,"{\"op\":\"config\",\"legato\":1}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64]}");
    fail_off[MOVE]=1;
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,65]}");
    assert(count(MOVE,0,60)==0); state_contains(s,"\"pending\":1");
    command(s,"{\"op\":\"off\",\"owner\":0}");
    fail_off[MOVE]=0; tick(s,10);
    assert(count(MOVE,0,60)==1 && count(MOVE,0,64)==1 && count(MOVE,0,65)==1);
    state_contains(s,"\"pending\":0"); state_contains(s,"\"sounding\":false");
    plugin->destroy_instance(s); groups++;
}

static void test_melody_retrigger_shared_pitch(void) {
    reset(); void *s = plugin->create_instance("",0);
    command(s,"{\"op\":\"config\",\"legato\":1}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"route\":2}");
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[60],\"route\":2,\"velocity\":110,\"retrigger\":1}");
    assert(count(MOVE,1,60)==2 && count(MOVE,0,60)==1);
    assert(count(USB,1,60)==2 && count(USB,0,60)==1);
    int before=event_count;
    tick(s,100); tick(s,100); assert(event_count==before); // exactly one attack
    command(s,"{\"op\":\"off\",\"owner\":8}");
    assert(count(MOVE,0,60)==1); // chord still owns it
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[60],\"route\":2,\"retrigger\":1}");
    assert(count(MOVE,1,60)==3 && count(MOVE,0,60)==2);
    command(s,"{\"op\":\"off\",\"owner\":0}");
    assert(count(MOVE,0,60)==2); // melody still owns it
    command(s,"{\"op\":\"off\",\"owner\":8}");
    assert(count(MOVE,0,60)==3 && count(USB,0,60)==3);
    state_contains(s,"\"sounding\":false"); state_contains(s,"\"pending\":0");
    plugin->destroy_instance(s); groups++;
}

static void test_retrigger_channel_isolation_and_failure(void) {
    reset(); void *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"channel\":0}");
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[60],\"channel\":1,\"retrigger\":1}");
    assert(count(MOVE,1,60)==2 && count(MOVE,0,60)==0);
    assert(events[event_count-1].bytes[1]==0x91);
    command(s,"{\"op\":\"off\",\"owner\":8}");
    fail_off[MOVE]=1;
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[60],\"channel\":0,\"retrigger\":1}");
    int before=event_count; tick(s,10); assert(event_count==before);
    state_contains(s,"\"pending\":1");
    command(s,"{\"op\":\"off\",\"owner\":8}");
    fail_off[MOVE]=0; tick(s,10);
    assert(events[event_count-1].bytes[1]==0x90); // reattack only after off succeeds
    command(s,"{\"op\":\"off\",\"owner\":0}");
    state_contains(s,"\"pending\":0"); state_contains(s,"\"sounding\":false");
    plugin->destroy_instance(s); groups++;
}

static void test_loop_bass_routing_gate_and_toggle(void) {
    reset(); void *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"config\",\"bass_route\":3,\"bass_channel\":4,\"bass_velocity\":75}");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":36}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; tick(s,10);
    assert(count(MOVE,1,-1)==3 && count(CHAIN,1,36)==1);
    assert(events[event_count-1].bytes[1]==0x94 && events[event_count-1].bytes[3]==75);
    state_contains(s,"\"bass_sounding\":true");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":24}");
    assert(count(CHAIN,0,36)==1 && count(CHAIN,1,24)==1);
    assert(count(MOVE,1,60)==1); // changing only bass does not restrike chords
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":-1}");
    assert(count(CHAIN,0,24)==1); state_contains(s,"\"bass_sounding\":false");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":36}");
    beat=.9; tick(s,10);
    assert(count(CHAIN,0,36)==2); state_contains(s,"\"bass_sounding\":false");
    beat=16.; tick(s,10); state_contains(s,"\"bass_sounding\":true");
    clock_status=MOVE_CLOCK_STATUS_STOPPED; tick(s,10);
    state_contains(s,"\"sounding\":false"); state_contains(s,"\"pending\":0");
    plugin->destroy_instance(s); groups++;
}

static void test_latched_notes_clear_at_transport_boundary_and_unload(void) {
    reset(); void *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[72]}");
    command(s,"{\"op\":\"hold\",\"owner\":8}");
    tick(s,100); assert(count(MOVE,0,72)==0); // no running transport: stay held
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":36}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; tick(s,10);
    assert(count(MOVE,0,72)==1);
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[72]}");
    command(s,"{\"op\":\"hold\",\"owner\":8}");
    beat=1.; tick(s,10); assert(count(MOVE,0,72)==2);
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[72]}");
    command(s,"{\"op\":\"hold\",\"owner\":8}");
    plugin->destroy_instance(s);
    assert(count(MOVE,0,72)==3 && count(MOVE,1,36)==count(MOVE,0,36));
    groups++;
}

static void test_expanded_live_owners_are_isolated_from_loop_and_test(void) {
    reset(); void *instance=plugin->create_instance("",0);
    Pilot *s=instance;
    char json[128];
    for (int owner=0; owner<LIVE_OWNERS; owner++) {
        snprintf(json,sizeof(json),"{\"op\":\"on\",\"owner\":%d,\"notes\":[%d]}",owner,40+owner);
        command(s,json);
        assert(s->voices[owner].count==1);
    }
    state_contains(s,"\"active\":41");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[100,104,107],\"bass\":12}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; tick(s,10);
    command(s,"{\"op\":\"test\"}");
    state_contains(s,"\"active\":44");
    assert(s->voices[40].notes[0]==80);
    assert(s->voices[LOOP_OWNER].notes[0]==100);
    assert(s->voices[LOOP_BASS_OWNER].notes[0]==12);
    assert(s->voices[TEST_OWNER].notes[0]==60);
    command(s,"{\"op\":\"hold\",\"owner\":40}");
    beat=16.; tick(s,10);
    assert(!s->voices[40].count && count(MOVE,0,80)==1);
    assert(s->voices[39].count && s->voices[LOOP_OWNER].count);
    command(s,"{\"op\":\"panic\"}");
    state_contains(s,"\"active\":0"); state_contains(s,"\"pending\":0");
    for (int note=0; note<128; note++) assert(count(MOVE,1,note)==count(MOVE,0,note));
    plugin->destroy_instance(s); groups++;
}

static int cc_count(int dest, int channel, int control) {
    int n=0;
    for (int i=0;i<event_count;i++) n += events[i].dest==dest &&
        events[i].bytes[1]==(0xb0|channel) && events[i].bytes[2]==control && events[i].bytes[3]==0;
    return n;
}

static void test_kill_silences_only_used_channels_including_release_tails(void) {
    reset(); void *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"route\":2,\"channel\":2}");
    command(s,"{\"op\":\"off\",\"owner\":0}"); // no active voice, but a release tail can remain
    command(s,"{\"op\":\"on\",\"owner\":8,\"notes\":[72],\"route\":3,\"channel\":4}");
    command(s,"{\"op\":\"kill\"}");
    assert(count(-1,0,-1)==3);
    for (int d=0;d<3;d++) for (int ch=0;ch<16;ch++) {
        const int expected = d==CHAIN ? ch==4 : ch==2;
        assert(cc_count(d,ch,64)==expected);
        assert(cc_count(d,ch,123)==expected);
        assert(cc_count(d,ch,120)==expected);
    }
    for (int i=0;i<event_count;i++) if ((events[i].bytes[1]&0xf0)==0xb0)
        assert(events[i].bytes[0]==(events[i].dest==CHAIN ? 0x0b : 0x2b));
    state_contains(s,"\"active\":0"); state_contains(s,"\"pending\":0");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[62],\"channel\":2}");
    assert(count(MOVE,1,62)==1);
    plugin->destroy_instance(s); groups++;
}

static void test_kill_cancels_delayed_strum_loop_and_test(void) {
    reset(); void *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":36}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");
    clock_status=MOVE_CLOCK_STATUS_RUNNING; tick(s,10);
    command(s,"{\"op\":\"test\",\"route\":3}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[72,76,79],\"strum_ms\":100}");
    command(s,"{\"op\":\"kill\"}");
    const int ons=count(-1,1,-1);
    for (int i=0;i<10;i++) { beat+=1.; tick(s,100); }
    assert(count(-1,1,-1)==ons && count(MOVE,1,76)==0 && count(MOVE,1,79)==0);
    state_contains(s,"\"armed\":false"); state_contains(s,"\"running\":false");
    state_contains(s,"\"active\":0"); state_contains(s,"\"pending\":0");
    plugin->destroy_instance(s); groups++;
}

static void test_kill_retries_controllers_before_allowing_new_attacks(void) {
    reset(); void *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60]}");
    fail_off[MOVE]=1;
    command(s,"{\"op\":\"kill\"}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[62]}");
    tick(s,10); assert(count(MOVE,1,62)==0 && cc_count(MOVE,0,120)==0);
    fail_off[MOVE]=0; tick(s,10);
    assert(count(MOVE,0,60)==1 && cc_count(MOVE,0,120)==1 && count(MOVE,1,62)==1);
    int kill_at=-1, note_at=-1;
    for (int i=0;i<event_count;i++) {
        if (events[i].bytes[1]==0xb0 && events[i].bytes[2]==120) kill_at=i;
        if (events[i].bytes[1]==0x90 && events[i].bytes[2]==62) note_at=i;
    }
    assert(kill_at>=0 && note_at>kill_at);
    state_contains(s,"\"pending\":0");
    plugin->destroy_instance(s); groups++;
}

static void test_sixteen_slots_velocity_strum_and_frozen_legato(void) {
    reset(); Pilot *s=plugin->create_instance("",0);
    char json[180];
    command(s,"{\"op\":\"config\",\"gate\":100,\"legato\":0}");
    for (int i=0;i<STEPS;i++) {
        snprintf(json,sizeof(json),"{\"op\":\"slot\",\"index\":%d,\"notes\":[60,64],\"velocity\":%d,\"strum_ms\":20,\"legato\":1}",i,50+i);
        command(s,json);
    }
    clock_status=MOVE_CLOCK_STATUS_RUNNING;
    command(s,"{\"op\":\"arm\",\"enabled\":1}"); tick(s,1);
    assert(count(MOVE,1,60)==1 && count(MOVE,1,64)==0);
    tick(s,20); tick(s,0); assert(count(MOVE,1,64)==1);
    for(int i=1;i<STEPS;i++) { beat=i;tick(s,25);assert(s->slot==i);assert(s->voices[LOOP_OWNER].velocity==50+i); }
    // Frozen LEAD=ON ties common tones even though live LEAD is off.
    assert(count(MOVE,1,60)==1 && count(MOVE,0,60)==0);
    beat=16; tick(s,1);assert(s->slot==0 && s->cycle==1);
    command(s,"{\"op\":\"slot\",\"index\":15,\"notes\":[60,64],\"velocity\":127,\"strum_ms\":20,\"legato\":0}");
    command(s,"{\"op\":\"config\",\"legato\":1}");
    beat=31; tick(s,1);assert(s->slot==15 && s->voices[LOOP_OWNER].velocity==127);
    assert(count(MOVE,1,60)==2 && events[event_count-1].bytes[3]==127);
    command(s,"{\"op\":\"kill\"}");const int ons=count(MOVE,1,-1);
    tick(s,100);assert(count(MOVE,1,-1)==ons);state_contains(s,"\"active\":0");
    plugin->destroy_instance(s);groups++;
}

static void test_arp_clock_gate_directions_range(void) {
    reset(); Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"arp\",\"enabled\":1,\"channel\":3,\"route\":1,\"gate\":50}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");
    tick(s,0);assert(count(USB,1,-1)==0);
    clock_status=MOVE_CLOCK_STATUS_RUNNING;tick(s,0);assert(count(USB,1,60)==1);
    assert((events[event_count-1].bytes[1]&15)==3);
    beat=.125;tick(s,0);assert(count(USB,0,60)==1);
    beat=.25;tick(s,0);assert(count(USB,1,64)==1);
    beat=.5;tick(s,0);assert(count(USB,1,67)==1);
    command(s,"{\"op\":\"arp\",\"direction\":1,\"range\":2}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64]}");
    beat=.75;tick(s,0);assert(s->voices[ARP_OWNER].notes[0]==76);
    beat=1;tick(s,0);assert(s->voices[ARP_OWNER].notes[0]==72);
    command(s,"{\"op\":\"arp\",\"direction\":2,\"range\":1}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");
    int expected[]={60,64,67,64,60};
    for(int i=0;i<5;i++){beat=2+i*.25;tick(s,0);assert(s->voices[ARP_OWNER].notes[0]==expected[i]);}
    command(s,"{\"op\":\"arp\",\"direction\":3,\"range\":4}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[120,124,127]}");
    for(int i=0;i<30;i++){beat=4+i*.25;tick(s,0);int n=s->voices[ARP_OWNER].notes[0];assert(n==120||n==124||n==127);}
    clock_status=MOVE_CLOCK_STATUS_STOPPED;tick(s,0);assert(!s->voices[ARP_OWNER].count);
    plugin->destroy_instance(s);groups++;
}

static void test_arp_hold_swing_seek_kill_and_routing(void) {
    reset();Pilot *s=plugin->create_instance("",0);clock_status=MOVE_CLOCK_STATUS_RUNNING;
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67]}");
    command(s,"{\"op\":\"arp\",\"enabled\":1,\"hold\":1,\"swing\":50,\"gate\":100,\"route\":1}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");tick(s,0);
    beat=.25;tick(s,0);assert(count(USB,1,64)==0);
    beat=.375;tick(s,0);assert(count(USB,1,64)==1);
    command(s,"{\"op\":\"arpsrc\",\"notes\":[]}");
    beat=.5;tick(s,0);assert(count(USB,1,67)==1);
    command(s,"{\"op\":\"arp\",\"route\":3,\"channel\":5}");
    assert(!s->voices[ARP_OWNER].count);assert(s->voices[0].count==3);
    beat=.875;tick(s,0);assert(count(CHAIN,1,60)==1);
    beat=.01;tick(s,0);assert(s->voices[ARP_OWNER].notes[0]==60);
    command(s,"{\"op\":\"arp\",\"hold\":0}");tick(s,0);assert(!s->voices[ARP_OWNER].count);
    command(s,"{\"op\":\"arpsrc\",\"notes\":[62,65,69]}");tick(s,0);
    command(s,"{\"op\":\"kill\"}");int ons=count(-1,1,-1);
    beat=100;tick(s,0);assert(count(-1,1,-1)==ons);state_contains(s,"\"active\":0");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60]}");tick(s,0);assert(s->voices[ARP_OWNER].count==1);
    beat=NAN;tick(s,0);assert(!s->voices[ARP_OWNER].count);
    plugin->destroy_instance(s);groups++;
}

static void test_arp_follows_loop_independent_gate_and_rests(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"config\",\"gate\":10}");
    command(s,"{\"op\":\"arp\",\"enabled\":1,\"hold\":1,\"route\":1}");
    command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":35}");
    command(s,"{\"op\":\"slot\",\"index\":2,\"notes\":[65,69,72]}");
    command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;
    tick(s,0);assert(s->voices[ARP_OWNER].notes[0]==60);
    beat=.25;tick(s,0);assert(!s->voices[LOOP_OWNER].count);assert(s->voices[ARP_OWNER].notes[0]==64);
    beat=1;tick(s,0);assert(!s->voices[ARP_OWNER].count); // Empty slot ignores HOLD.
    beat=2;tick(s,0);assert(s->voices[ARP_OWNER].notes[0]==65);
    command(s,"{\"op\":\"arm\",\"enabled\":0}");tick(s,0);assert(!s->voices[ARP_OWNER].count);
    command(s,"{\"op\":\"arp\",\"range\":0}");assert(s->error);
    command(s,"{\"op\":\"arp\",\"swing\":51}");assert(s->error);
    plugin->destroy_instance(s);groups++;
}

static void test_arp_shared_pitch_and_failed_release(void) {
    reset();Pilot *s=plugin->create_instance("",0);clock_status=MOVE_CLOCK_STATUS_RUNNING;
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"route\":1,\"channel\":1}");
    command(s,"{\"op\":\"arp\",\"enabled\":1,\"route\":1,\"channel\":1}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60]}");tick(s,0);
    assert(count(USB,1,60)==2); // ARP retriggers even if the chord shares its channel.
    beat=.2;tick(s,0);assert(s->voices[0].count==1);
    Pitch *p=pitch(s,USB,1,60,0);assert(p && p->refs==1 && p->sent);
    command(s,"{\"op\":\"off\",\"owner\":0}");
    beat=.25;tick(s,0);fail_off[USB]=1;
    command(s,"{\"op\":\"arp\",\"route\":3}");
    assert(pending_count(s)>0);fail_off[USB]=0;tick(s,0);
    assert(s->voices[ARP_OWNER].route==3);
    command(s,"{\"op\":\"kill\"}");tick(s,0);assert(pending_count(s)==0);
    plugin->destroy_instance(s);groups++;
}

static void test_arp_diagnostics_and_clockless_probe(void) {
    reset();Pilot *s=plugin->create_instance("",0);char buf[256];
    command(s,"{\"op\":\"arp\",\"route\":1,\"channel\":4}");
    command(s,"{\"op\":\"arptest\"}");
    assert(count(USB,1,60)==1 && s->diag_generated==1 && s->diag_tx==1);
    assert((events[event_count-1].bytes[1]&15)==4);
    for(int i=0;i<5;i++)tick(s,100);
    assert(count(USB,0,60)==1 && !s->voices[TEST_OWNER].count);
    assert(plugin->get_param(s,"arp_diag",buf,sizeof(buf))>0);
    assert(strstr(buf,"\"sent\":60") && strstr(buf,"\"ch\":4") && strstr(buf,"\"clock\":0"));
    fail_on[USB]=1;command(s,"{\"op\":\"arptest\"}");
    assert(s->diag_generated==2 && s->diag_tx==1 && s->diag_failed>0);
    fail_on[USB]=0;tick(s,0);assert(s->diag_tx==2);
    command(s,"{\"op\":\"kill\"}");assert(!s->voices[TEST_OWNER].count);
    clock_status=MOVE_CLOCK_STATUS_RUNNING;beat=1;tick(s,100);beat=1.1;tick(s,100);
    plugin->get_param(s,"arp_diag",buf,sizeof(buf));assert(strstr(buf,"\"clock\":1"));
    for(int i=0;i<6;i++)tick(s,100);
    plugin->get_param(s,"arp_diag",buf,sizeof(buf));assert(strstr(buf,"\"clock\":0"));
    s->diag_generated=s->diag_tx=s->diag_failed=s->diag_blocks=s->arp_index=UINT32_MAX;
    int size=plugin->get_param(s,"arp_diag",buf,sizeof(buf));assert(size<255 && buf[size-1]=='}');
    plugin->destroy_instance(s);groups++;
}

static void test_arp_unavailable_status_with_advancing_beats(void) {
    for(int missing=0;missing<2;missing++) {
        reset();if(missing)host.get_clock_status=0;
        Pilot *s=plugin->create_instance("",0);
        clock_status=MOVE_CLOCK_STATUS_UNAVAILABLE;
        command(s,"{\"op\":\"arp\",\"enabled\":1,\"gate\":100,\"route\":1}");
        command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");
        tick(s,10);assert(s->diag_generated==0); // A static valid beat is insufficient.
        beat=.01;tick(s,10);assert(count(USB,1,60)==1);
        beat=.25;tick(s,10);assert(count(USB,1,64)==1);
        state_contains(s,"\"arp_status\":6");
        for(int i=0;i<6;i++)tick(s,100); // Stalled clock must release the gate.
        assert(!s->voices[ARP_OWNER].count);
        int before=count(USB,1,-1);tick(s,100);assert(count(USB,1,-1)==before);
        beat=.5;tick(s,10);assert(count(USB,1,-1)>before);
        beat=-1;tick(s,10);assert(!s->voices[ARP_OWNER].count);
        beat=NAN;tick(s,10);assert(!s->voices[ARP_OWNER].count);
        beat=1;tick(s,10);assert(!s->voices[ARP_OWNER].count);
        beat=1.01;tick(s,10);assert(s->voices[ARP_OWNER].count);
        if(!missing){clock_status=MOVE_CLOCK_STATUS_STOPPED;beat=1.25;tick(s,10);assert(!s->voices[ARP_OWNER].count);}
        command(s,"{\"op\":\"kill\"}");before=count(USB,1,-1);
        beat=2;tick(s,10);assert(count(USB,1,-1)==before);
        plugin->destroy_instance(s);
    }
    groups++;
}

static void test_free_arp_sample_clock(void) {
    for(int missing=0;missing<2;missing++) {
        reset(); if(missing){host.get_beat_position=0;host.get_clock_status=0;}
        Pilot *s=plugin->create_instance("",0);
        command(s,"{\"op\":\"arp\",\"enabled\":1,\"clock\":1,\"bpm\":120,\"gate\":50,\"route\":1}");
        tick(s,100);assert(count(USB,1,-1)==0);
        command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");
        tick(s,63);assert(count(USB,1,60)==1);state_contains(s,"\"arp_status\":6");
        tick(s,62);assert(count(USB,0,60)==1);
        tick(s,1);assert(count(USB,1,64)==1); // 125ms at 120 BPM / sixteenth
        command(s,"{\"op\":\"arpsrc\",\"notes\":[]}");
        assert(!s->voices[ARP_OWNER].count);
        int before=count(USB,1,-1);tick(s,128);assert(count(USB,1,-1)==before);
        command(s,"{\"op\":\"arp\",\"hold\":1}");
        command(s,"{\"op\":\"arpsrc\",\"notes\":[65,69,72]}");tick(s,125);
        assert(count(USB,1,65)==1);
        command(s,"{\"op\":\"arpsrc\",\"notes\":[]}");tick(s,1);
        assert(count(USB,1,69)==1);
        command(s,"{\"op\":\"arp\",\"clock\":0}");tick(s,100);assert(!s->voices[ARP_OWNER].count);
        command(s,"{\"op\":\"arp\",\"clock\":1,\"bpm\":60}");tick(s,125);
        before=count(USB,1,-1);tick(s,125);assert(count(USB,1,-1)==before);
        tick(s,1);assert(count(USB,1,-1)==before+1);
        command(s,"{\"op\":\"kill\"}");before=count(USB,1,-1);
        tick(s,128);tick(s,128);assert(count(USB,1,-1)==before);assert(!s->voices[ARP_OWNER].count);
        plugin->destroy_instance(s);
    }
    groups++;
}

static void test_free_arp_tempo_bounds_and_lifecycle(void) {
    reset();host.sample_rate=48000;Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"arp\",\"enabled\":1,\"clock\":1,\"bpm\":300,\"gate\":100,\"route\":1}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");
    for(int i=0;i<480;i++)tick(s,100); // one second, 20 sixteenth notes
    assert(count(USB,1,-1)==20);
    command(s,"{\"op\":\"arp\",\"bpm\":29}");assert(s->arp_bpm==300&&s->error);
    command(s,"{\"op\":\"arp\",\"clock\":2}");assert(s->arp_clock==1&&s->error);
    command(s,"{\"op\":\"arp\",\"bpm\":30}");tick(s,100);
    int before=count(USB,1,-1);for(int i=0;i<239;i++)tick(s,100);assert(count(USB,1,-1)==before);
    tick(s,100);assert(count(USB,1,-1)==before+1);
    command(s,"{\"op\":\"arp\",\"enabled\":0}");tick(s,100);assert(!s->voices[ARP_OWNER].count);
    command(s,"{\"op\":\"arp\",\"enabled\":1}");tick(s,100);assert(s->voices[ARP_OWNER].count);
    command(s,"{\"op\":\"panic\"}");before=count(USB,1,-1);tick(s,100);assert(count(USB,1,-1)==before);
    plugin->destroy_instance(s);groups++;
}

static void test_chord_pulses_gate_hold_and_clock(void) {
    for(int free_clock=0;free_clock<2;free_clock++) {
        reset();clock_status=free_clock?MOVE_CLOCK_STATUS_STOPPED:MOVE_CLOCK_STATUS_RUNNING;
        Pilot *s=plugin->create_instance("",0);
        command(s,"{\"op\":\"arp\",\"enabled\":1,\"direction\":4,\"range\":4,\"gate\":50,\"hold\":1,\"route\":1}");
        if(free_clock)command(s,"{\"op\":\"arp\",\"clock\":1}");
        command(s,"{\"op\":\"arpsrc\",\"notes\":[48,52,55,59,62,65,69,72]}");
        tick(s,63);assert(count(USB,1,-1)==8);assert(s->voices[ARP_OWNER].count==8);
        beat=.126;tick(s,62);assert(count(USB,0,-1)==8);
        beat=.25;tick(s,1);assert(count(USB,1,-1)==16);
        command(s,"{\"op\":\"arpsrc\",\"notes\":[]}");
        beat=.5;tick(s,124);tick(s,1);assert(count(USB,1,-1)==24);
        command(s,"{\"op\":\"arp\",\"hold\":0}");tick(s,1);assert(!s->voices[ARP_OWNER].count);
        int before=count(USB,1,-1);tick(s,128);assert(count(USB,1,-1)==before);
        plugin->destroy_instance(s);
    }
    groups++;
}

static void test_chord_pulses_shared_ownership_and_retry(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"route\":1,\"channel\":1}");tick(s,1);
    command(s,"{\"op\":\"arp\",\"enabled\":1,\"clock\":1,\"direction\":4,\"gate\":100,\"route\":1}");
    command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");tick(s,125);
    assert(count(USB,1,-1)==6);tick(s,1);assert(count(USB,1,-1)==9);
    command(s,"{\"op\":\"arpsrc\",\"notes\":[]}");tick(s,1);
    assert(s->voices[0].count==3);assert(!s->voices[ARP_OWNER].count);
    fail_off[USB]=1;command(s,"{\"op\":\"off\",\"owner\":0}");tick(s,1);
    assert(pending_count(s)>0);fail_off[USB]=0;tick(s,1);assert(pending_count(s)==0);
    command(s,"{\"op\":\"arpsrc\",\"notes\":[65,69,72]}");tick(s,1);
    command(s,"{\"op\":\"kill\"}");int before=count(USB,1,-1);
    tick(s,128);assert(count(USB,1,-1)==before);assert(!s->voices[ARP_OWNER].count);
    plugin->destroy_instance(s);groups++;
}

static void test_pedal_ownership_retry_and_shutdown(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    fail_off[USB]=1; // Test callback rejects controllers as well as note-offs.
    command(s,"{\"op\":\"pedal\",\"owner\":0,\"enabled\":1,\"route\":1,\"channel\":2}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"route\":1,\"channel\":2}");tick(s,1);
    assert(count(USB,1,60)==0);assert(pending_count(s)>0);
    fail_off[USB]=0;tick(s,1);
    assert(s->pedal_sent[USB][2]&&count(USB,1,60)==1);
    assert(events[0].bytes[2]==64&&events[0].bytes[3]==127);
    command(s,"{\"op\":\"off\",\"owner\":0}");tick(s,1);
    assert(count(USB,0,60)==1&&s->pedal_sent[USB][2]);
    command(s,"{\"op\":\"pedal\",\"owner\":1,\"enabled\":1,\"route\":1,\"channel\":2}");
    command(s,"{\"op\":\"pedal\",\"owner\":0,\"enabled\":0,\"route\":1,\"channel\":2}");
    assert(s->pedal_sent[USB][2]); // Another part still owns this channel pedal.
    fail_off[USB]=1;
    command(s,"{\"op\":\"pedal\",\"owner\":1,\"enabled\":0,\"route\":1,\"channel\":2}");
    command(s,"{\"op\":\"pedal\",\"owner\":1,\"enabled\":1,\"route\":1,\"channel\":2}");
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[65],\"route\":1,\"channel\":2}");tick(s,1);
    assert(count(USB,1,65)==0);int before=event_count;
    fail_off[USB]=0;tick(s,1);
    assert(events[before].bytes[2]==64&&events[before].bytes[3]==0);
    assert(events[before+1].bytes[2]==64&&events[before+1].bytes[3]==127);
    assert(count(USB,1,65)==1);
    fail_off[USB]=1;plugin->destroy_instance(s);assert(pending_count(s)>0);
    fail_off[USB]=0;Pilot *next=plugin->create_instance("",0);assert(!s->pedal_sent[USB][2]);
    plugin->destroy_instance(next);groups++;
}

static void test_pedal_both_routing_and_panic(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"pedal\",\"owner\":2,\"enabled\":1,\"route\":2,\"channel\":5}");
    assert(s->pedal_sent[MOVE][5]&&s->pedal_sent[USB][5]);
    command(s,"{\"op\":\"pedal\",\"owner\":2,\"enabled\":1,\"route\":3,\"channel\":6}");
    assert(!s->pedal_sent[MOVE][5]&&!s->pedal_sent[USB][5]&&s->pedal_sent[CHAIN][6]);
    command(s,"{\"op\":\"kill\"}");tick(s,1);
    assert(!s->pedal_sent[CHAIN][6]&&!s->pedal_want[CHAIN][6]);
    command(s,"{\"op\":\"pedal\",\"owner\":3,\"enabled\":1,\"route\":1,\"channel\":0}");assert(s->error);
    plugin->destroy_instance(s);groups++;
}

static void test_strum_planner_variation(void) {
    uint8_t notes[8]={72,48,67,52,59,55,62,65},vel[8];unsigned delay[8];uint32_t seed=17;
    strum_plan(notes,8,90,20,0,0,0,0,&seed,delay,vel);
    assert(delay[1]==0&&delay[3]==20&&delay[0]==140);
    strum_plan(notes,8,90,20,1,0,0,0,&seed,delay,vel);
    assert(delay[0]==0&&delay[1]==140);
    strum_plan(notes,8,90,20,2,0,0,1,&seed,delay,vel);
    assert(delay[0]==0);
    int changed=0;
    for(int run=0;run<1000;run++){
        strum_plan(notes,8,64,50,3,100,100,0,&seed,delay,vel);
        for(int i=0;i<8;i++){assert(delay[i]<=700);assert(vel[i]>=1&&vel[i]<=127);changed|=vel[i]!=64;
            for(int j=0;j<i;j++)assert(delay[i]!=delay[j]);}
    }
    assert(changed);
    strum_plan(notes,8,127,0,3,100,0,0,&seed,delay,vel);
    for(int i=0;i<8;i++)assert(delay[i]==0&&vel[i]==127);
    groups++;
}
static void test_strum_directions_delivery_and_cancel(void) {
    reset();Pilot *s=plugin->create_instance("",0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"route\":1,\"strum_ms\":20,\"strum_dir\":1}");
    tick(s,20);assert(count(USB,1,67)==1&&count(USB,1,60)==0);
    tick(s,20);assert(count(USB,1,64)==1);
    tick(s,1);assert(count(USB,1,60)==1);
    command(s,"{\"op\":\"off\",\"owner\":0}");tick(s,1);
    for(int n=0;n<2;n++){
        int before=event_count;
        command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"route\":1,\"strum_ms\":20,\"strum_dir\":2}");
        assert(events[before].bytes[2]==(n?67:60));
        command(s,"{\"op\":\"off\",\"owner\":0}");tick(s,1);
    }
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60,64,67],\"route\":1,\"strum_ms\":100,\"strum_dir\":3,\"strum_time\":100,\"strum_vel\":100}");
    command(s,"{\"op\":\"kill\"}");int before=count(USB,1,-1);
    for(int n=0;n<10;n++)tick(s,100);
    assert(count(USB,1,-1)==before&&pending_count(s)==0);
    command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[60],\"strum_dir\":4}");assert(s->error);
    plugin->destroy_instance(s);groups++;
}

static void test_seq_unknown_transport_advancing_clock(void) {
    for(int missing=0;missing<2;missing++) {
        reset(); if(missing)host.get_clock_status=0;
        clock_status=MOVE_CLOCK_STATUS_UNAVAILABLE;
        void *s=plugin->create_instance("",0);
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67]}");
        command(s,"{\"op\":\"slot\",\"index\":1,\"notes\":[62,65,69]}");
        command(s,"{\"op\":\"config\",\"rate\":2,\"gate\":100}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");
        tick(s,10);assert(count(MOVE,1,-1)==0);
        beat=.01;tick(s,10);assert(count(MOVE,1,60)==1);
        beat=step_beats[2]+.01;tick(s,10);assert(count(MOVE,1,62)==1);
        state_contains(s,"\"running\":true");
        for(int i=0;i<6;i++)tick(s,100);
        state_contains(s,"\"running\":false");state_contains(s,"\"active\":0");
        beat=0.;tick(s,10);assert(count(MOVE,1,60)==2);
        command(s,"{\"op\":\"arm\",\"enabled\":0}");
        const int sent=count(MOVE,1,-1);beat+=1.;tick(s,10);assert(count(MOVE,1,-1)==sent);
        command(s,"{\"op\":\"arm\",\"enabled\":1}");
        beat=NAN;tick(s,10);state_contains(s,"\"running\":false");
        if(!missing){clock_status=MOVE_CLOCK_STATUS_STOPPED;beat=2.;tick(s,10);assert(count(MOVE,1,-1)==sent);}
        plugin->destroy_instance(s);
    }
    groups++;
}
int main(void) {
    test_pressure_routes_and_revoice();test_pressure_shared_pitch_and_hold();test_pressure_retries_validation_and_retrigger();
    /* Timed events hold across empty cells, retain velocity, and preempt cleanly. */
    {
        reset();Pilot *s=plugin->create_instance("",0);clock_status=MOVE_CLOCK_STATUS_RUNNING;
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":36,\"duration\":4,\"velocity\":47}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");tick(s,1);
        assert(s->event_slot==0 && s->voices[LOOP_OWNER].velocity==47);
        for(int i=1;i<4;i++){beat=i+.9;tick(s,1);assert(s->event_slot==0 && s->voices[LOOP_OWNER].count==3);}
        assert(count(MOVE,1,60)==1 && count(MOVE,0,60)==0);
        beat=4.;tick(s,1);assert(s->event_slot==-1 && !s->voices[LOOP_OWNER].count && !s->voices[LOOP_BASS_OWNER].count);
        command(s,"{\"op\":\"slot\",\"index\":15,\"notes\":[65],\"duration\":3}");
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[]}");
        beat=15.;tick(s,1);beat=16.;tick(s,1);assert(s->slot==0 && s->event_slot==15 && count(MOVE,1,65)==1);
        beat=17.9;tick(s,1);assert(s->voices[LOOP_OWNER].count);
        beat=18.;tick(s,1);assert(!s->voices[LOOP_OWNER].count);
        beat=16.2;tick(s,1);assert(s->event_slot==15 && s->voices[LOOP_OWNER].count); /* seek into tail */
        command(s,"{\"op\":\"slot\",\"index\":1,\"notes\":[62],\"duration\":1}");
        beat=17.;tick(s,1);assert(s->event_slot==1 && s->voices[LOOP_OWNER].notes[0]==62);
        beat=18.;tick(s,1);assert(!s->voices[LOOP_OWNER].count); /* old event never resumes */
        command(s,"{\"op\":\"slot\",\"index\":1,\"notes\":[62],\"duration\":17}");assert(s->error);
        plugin->destroy_instance(s);groups++;
    }
    /* Record monitoring silences sequence output, not live chords or live ARP. */
    {
        reset();Pilot *s=plugin->create_instance("",0);clock_status=MOVE_CLOCK_STATUS_RUNNING;
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60],\"duration\":4}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");tick(s,1);
        command(s,"{\"op\":\"record\",\"enabled\":1}");assert(!s->voices[LOOP_OWNER].count);
        command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[72]}");
        command(s,"{\"op\":\"hold\",\"owner\":0}");
        command(s,"{\"op\":\"arp\",\"enabled\":1}");command(s,"{\"op\":\"arpsrc\",\"notes\":[72]}");
        beat=1.;tick(s,1);assert(s->voices[0].count && s->voices[ARP_OWNER].notes[0]==72 && !s->voices[LOOP_OWNER].count);
        command(s,"{\"op\":\"record\",\"enabled\":0}");beat=16.;tick(s,1);assert(s->voices[LOOP_OWNER].notes[0]==60);
        command(s,"{\"op\":\"kill\"}");assert(!s->recording && !s->running);
        plugin->destroy_instance(s);groups++;
    }
    /* Clock reads are fresh host timestamps, including before UI polls. */
    {
        reset();void *s=plugin->create_instance("",0);char buf[256];
        clock_status=MOVE_CLOCK_STATUS_RUNNING;beat=3.125;
        plugin->get_param(s,"clock",buf,sizeof(buf));assert(strstr(buf,"3.125000") && strstr(buf,"true"));
        clock_status=MOVE_CLOCK_STATUS_STOPPED;plugin->get_param(s,"clock",buf,sizeof(buf));assert(strstr(buf,"false"));
        beat=NAN;plugin->get_param(s,"clock",buf,sizeof(buf));assert(strstr(buf,"-1.000000"));
        plugin->get_param(s,"state",buf,sizeof(buf));assert(strchr(buf,'}') && strstr(buf,"\"event\":-1"));
        plugin->destroy_instance(s);groups++;
    }
    /* Empty grid advances at every rate without stealing live ARP/sustain. */
    for(int rate=0;rate<5;rate++) {
        reset();Pilot *s=plugin->create_instance("",0);char cmd[80];
        snprintf(cmd,sizeof(cmd),"{\"op\":\"config\",\"rate\":%d}",rate);command(s,cmd);
        command(s,"{\"op\":\"arp\",\"enabled\":1,\"hold\":1}");
        command(s,"{\"op\":\"arpsrc\",\"notes\":[60,64,67]}");
        command(s,"{\"op\":\"on\",\"owner\":0,\"notes\":[72]}");
        command(s,"{\"op\":\"hold\",\"owner\":0}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;
        for(int step=0;step<32;step++) {
            beat=step*step_beats[rate];tick(s,1);
            assert(s->running && s->slot==step%16 && s->cycle==step/16);
            assert(!s->voices[LOOP_OWNER].count && s->voices[0].count);
            assert(s->voices[ARP_OWNER].count);
        }
        plugin->destroy_instance(s);
    }
    groups++;
    /* Independent bass lane survives chord rests/gates, routes independently,
     * wraps without reviving preempted events, and stops safely for Record. */
    {
        reset();Pilot *s=plugin->create_instance("",0);
        command(s,"{\"op\":\"config\",\"bass_clip\":1,\"bass_channel\":3,\"bass_route\":1}");
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"duration\":1}");
        command(s,"{\"op\":\"bassslot\",\"index\":0,\"notes\":[36],\"duration\":4,\"velocity\":72}");
        command(s,"{\"op\":\"bassslot\",\"index\":2,\"notes\":[40],\"duration\":1,\"velocity\":63}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;
        beat=0;tick(s,1);assert(s->voices[LOOP_BASS_OWNER].notes[0]==36 && s->voices[LOOP_BASS_OWNER].count==1);
        assert(s->voices[LOOP_BASS_OWNER].channel==3 && s->voices[LOOP_BASS_OWNER].route==1 && s->voices[LOOP_BASS_OWNER].velocity==72);
        beat=1;tick(s,1);assert(!s->voices[LOOP_OWNER].count && s->voices[LOOP_BASS_OWNER].count==1);
        beat=2;tick(s,1);assert(s->voices[LOOP_BASS_OWNER].notes[0]==40);
        beat=3;tick(s,1);assert(!s->voices[LOOP_BASS_OWNER].count);
        beat=16;tick(s,1);assert(s->voices[LOOP_BASS_OWNER].notes[0]==36 && s->voices[LOOP_BASS_OWNER].count);
        command(s,"{\"op\":\"record\",\"enabled\":1}");tick(s,1);assert(!s->voices[LOOP_BASS_OWNER].count);
        command(s,"{\"op\":\"record\",\"enabled\":0}");tick(s,1);assert(s->voices[LOOP_BASS_OWNER].count);
        command(s,"{\"op\":\"bassslot\",\"index\":0,\"notes\":[]}");tick(s,1);assert(!s->voices[LOOP_BASS_OWNER].count);
        command(s,"{\"op\":\"kill\"}");assert(!s->running && !s->voices[LOOP_BASS_OWNER].count);
        plugin->destroy_instance(s);groups++;
    }
    /* Per-part Record never releases/retriggers the unarmed lane. ARP
     * remains attached to playback harmony during a bass-only take. */
    for(int part=1;part<=2;part++) {
        reset();Pilot *s=plugin->create_instance("",0);char cmd[90];
        command(s,"{\"op\":\"config\",\"bass_clip\":1,\"bass_channel\":3}");
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"duration\":8}");
        command(s,"{\"op\":\"slot\",\"index\":8,\"notes\":[65,69,72],\"duration\":8}");
        command(s,"{\"op\":\"bassslot\",\"index\":0,\"notes\":[36],\"duration\":8}");
        command(s,"{\"op\":\"bassslot\",\"index\":8,\"notes\":[41],\"duration\":8}");
        command(s,"{\"op\":\"arp\",\"enabled\":1,\"channel\":5,\"route\":1}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;
        beat=0;tick(s,1);int untouched=part==1?36:60;
        int ons=count(MOVE,1,untouched),offs=count(MOVE,0,untouched);
        snprintf(cmd,sizeof(cmd),"{\"op\":\"record\",\"enabled\":1,\"record_part\":%d}",part);command(s,cmd);
        beat=1;tick(s,1);
        assert(s->voices[part==1?LOOP_OWNER:LOOP_BASS_OWNER].count==0);
        assert(s->voices[part==1?LOOP_BASS_OWNER:LOOP_OWNER].count>0);
        assert(count(MOVE,1,untouched)==ons && count(MOVE,0,untouched)==offs);
        if(part==2)assert(s->arp_from_loop && s->arp_count>0);
        command(s,"{\"op\":\"record\",\"enabled\":0}");tick(s,1);
        assert(count(MOVE,1,untouched)==ons && count(MOVE,0,untouched)==offs);
        command(s,cmd);beat=8;tick(s,1);
        assert(s->voices[part==1?LOOP_BASS_OWNER:LOOP_OWNER].notes[0]==(part==1?41:65));
        assert(!s->voices[part==1?LOOP_OWNER:LOOP_BASS_OWNER].count);
        clock_status=MOVE_CLOCK_STATUS_STOPPED;tick(s,1);
        assert(!s->voices[LOOP_OWNER].count && !s->voices[LOOP_BASS_OWNER].count);
        command(s,"{\"op\":\"kill\"}");assert(!s->recording);
        plugin->destroy_instance(s);
    }
    groups++;
    /* FOLLOW bass can play from saved harmony while only chords are muted. */
    {
        reset();Pilot *s=plugin->create_instance("",0);
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60,64,67],\"bass\":36,\"duration\":4}");
        command(s,"{\"op\":\"record\",\"enabled\":1,\"record_part\":1}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;
        beat=0;tick(s,1);assert(!s->voices[LOOP_OWNER].count && s->voices[LOOP_BASS_OWNER].count);
        beat=4;tick(s,1);assert(!s->voices[LOOP_BASS_OWNER].count);
        plugin->destroy_instance(s);groups++;
    }
    /* Fractional attacks within one step, note duration, independent bass,
     * missed-event seeks (no catch-up bursts), loop wrap and clear/reload. */
    {
        reset();Pilot *s=plugin->create_instance("",0);char state[256];
        command(s,"{\"op\":\"config\",\"bass_clip\":1,\"bass_channel\":2}");
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60],\"at\":1000,\"len\":1000}");
        command(s,"{\"op\":\"slot\",\"index\":16,\"notes\":[64],\"at\":4000,\"len\":1000}");
        command(s,"{\"op\":\"slot\",\"index\":15,\"notes\":[67],\"at\":158000,\"len\":3000}");
        command(s,"{\"op\":\"bassslot\",\"index\":0,\"notes\":[36],\"at\":2000,\"len\":4000}");
        command(s,"{\"op\":\"arp\",\"enabled\":1,\"route\":1}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;
        beat=.09;tick(s,1);assert(count(MOVE,1,60)==0);
        beat=.1;tick(s,1);assert(count(MOVE,1,60)==1 && s->event_slot==0);unsigned serial=s->event_serial;
        beat=.15;tick(s,1);assert(count(MOVE,1,60)==1 && s->event_serial==serial);
        beat=.2;tick(s,1);assert(count(MOVE,0,60)==1 && s->voices[LOOP_BASS_OWNER].count);
        beat=.4;tick(s,1);assert(count(MOVE,1,64)==1 && s->event_slot==16 && s->arp_from_loop);
        beat=.5;tick(s,1);assert(count(MOVE,0,64)==1 && s->voices[LOOP_BASS_OWNER].count);
        beat=.6;tick(s,1);assert(!s->voices[LOOP_BASS_OWNER].count);
        beat=15.8;tick(s,1);assert(count(MOVE,1,67)==1);
        serial=s->event_serial;beat=16.05;tick(s,1);assert(s->voices[LOOP_OWNER].notes[0]==67 && s->event_serial==serial);
        beat=16.1;tick(s,1);assert(count(MOVE,0,67)==1 && count(MOVE,1,60)==2);
        beat=32.8;tick(s,1);assert(count(MOVE,1,64)==1 && !s->voices[LOOP_OWNER].count);
        beat=.4;tick(s,1);assert(count(MOVE,1,64)==2);
        plugin->get_param(s,"state",state,sizeof(state));assert(strstr(state,"\"event\":16") && state[strlen(state)-1]=='}');
        command(s,"{\"op\":\"cleargrid\"}");assert(!s->voices[LOOP_OWNER].count && !s->slots[16].count);
        tick(s,1);assert(s->event_slot==-1);
        plugin->destroy_instance(s);groups++;
    }
    /* Quantized collisions choose the latest captured event; lowering QNT
     * can recover both because the underlying slots retain both attacks. */
    {
        reset();Pilot *s=plugin->create_instance("",0);
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60],\"at\":0,\"len\":10000}");
        command(s,"{\"op\":\"slot\",\"index\":16,\"notes\":[64],\"at\":0,\"len\":10000}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");clock_status=MOVE_CLOCK_STATUS_RUNNING;
        beat=0;tick(s,1);assert(count(MOVE,1,60)==0 && count(MOVE,1,64)==1);
        command(s,"{\"op\":\"arm\",\"enabled\":0}");
        command(s,"{\"op\":\"slot\",\"index\":0,\"notes\":[60],\"at\":1000,\"len\":1000}");
        command(s,"{\"op\":\"slot\",\"index\":16,\"notes\":[64],\"at\":3000,\"len\":1000}");
        command(s,"{\"op\":\"arm\",\"enabled\":1}");beat=.1;tick(s,1);assert(count(MOVE,1,60)==1);
        beat=.3;tick(s,1);assert(count(MOVE,1,64)==2);
        command(s,"{\"op\":\"kill\"}");assert(!s->voices[LOOP_OWNER].count);
        plugin->destroy_instance(s);groups++;
    }
    test_divisi_routes_and_release();test_divisi_revoice_and_shared_pressure();
    test_ensemble_custom_channels();test_ensemble_pedal_remap_and_shared_channels();test_ensemble_validation_loop_and_retry();
    test_divisi_strum_retry_and_boundaries();test_divisi_pedal_and_sequence();
    test_seq_unknown_transport_advancing_clock();
    test_strum_planner_variation();test_strum_directions_delivery_and_cancel();
    test_pedal_ownership_retry_and_shutdown();test_pedal_both_routing_and_panic();
    test_chord_pulses_gate_hold_and_clock();test_chord_pulses_shared_ownership_and_retry();
    test_free_arp_sample_clock();test_free_arp_tempo_bounds_and_lifecycle();
    test_arp_unavailable_status_with_advancing_beats();
    test_arp_diagnostics_and_clockless_probe();
    test_arp_shared_pitch_and_failed_release();
    test_arp_clock_gate_directions_range();test_arp_hold_swing_seek_kill_and_routing();test_arp_follows_loop_independent_gate_and_rests();
    test_shared_ownership(); test_routes_and_reconfiguration(); test_failed_delivery();
    test_strum_and_panic(); test_loop_transport_gate(); test_loop_rests_rates_clock();
    test_shared_loop_live(); test_validation_echo_testnote(); test_lifecycle_capabilities();
    test_legato_revoice_and_release(); test_legato_loop_ties_rests_and_updates();
    test_legato_failed_off_never_loses_reference();
    test_melody_retrigger_shared_pitch(); test_retrigger_channel_isolation_and_failure();
    test_loop_bass_routing_gate_and_toggle(); test_latched_notes_clear_at_transport_boundary_and_unload();
    test_expanded_live_owners_are_isolated_from_loop_and_test();
    test_kill_silences_only_used_channels_including_release_tails();
    test_kill_cancels_delayed_strum_loop_and_test();
    test_kill_retries_controllers_before_allowing_new_attacks();
    test_sixteen_slots_velocity_strum_and_frozen_legato();
    printf("DSP: %d behavioral test groups passed (including 3000 malformed inputs).\n",groups);
    return 0;
}
