/* Pure fixed-size attack planner: no host, MIDI or display dependencies. */
static unsigned strum_random(uint32_t *seed) {
    *seed=*seed*1664525u+1013904223u;return *seed>>8;
}
static void strum_plan(const uint8_t *notes,int count,int velocity,int gap,int direction,
                       int timing,int dynamics,unsigned alternate,uint32_t *seed,
                       unsigned *delay,uint8_t *velocities) {
    int order[8];unsigned time=0;
    for(int i=0;i<count;i++)order[i]=i;
    for(int i=1;i<count;i++){int n=order[i],j=i;while(j>0&&notes[order[j-1]]>notes[n]){order[j]=order[j-1];j--;}order[j]=n;}
    if(direction==1||(direction==2&&(alternate&1))) {
        for(int i=0;i<count/2;i++){int n=order[i];order[i]=order[count-1-i];order[count-1-i]=n;}
    } else if(direction==3) {
        for(int i=count-1;i>0;i--){int j=(int)(strum_random(seed)%(unsigned)(i+1)),n=order[i];order[i]=order[j];order[j]=n;}
    }
    for(int rank=0;rank<count;rank++) {
        int i=order[rank],v=velocity;
        if(rank){int spacing=gap;if(timing&&gap){spacing+=gap*((int)(strum_random(seed)%201)-100)*timing/10000;if(spacing<1)spacing=1;}time+=(unsigned)spacing;}
        if(dynamics)v+=velocity*((int)(strum_random(seed)%201)-100)*dynamics/10000;
        if(v<1)v=1;if(v>127)v=127;
        delay[i]=time;velocities[i]=(uint8_t)v;
    }
}
