import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {PRODUCT_NAME,PRODUCT_VERSION,LAB_VERSION,PRODUCT_TAGLINE,moduleId} from '../src/profile.mjs';
import {renderGuideHtml} from './render-guide-html.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=['ui.js','display.mjs','pilot.mjs','capture.mjs','recording.mjs','timeline.mjs','clips.mjs','bass-gesture.mjs','smart-bass.mjs','project.mjs','settings.mjs','theory.mjs','chord-library.mjs','harmony-controls.mjs','ideas.mjs'];
assert.ok(!(process.argv.includes('--lab') && process.argv.includes('--public')), 'Choose one profile');
const profiles = process.argv.includes('--lab') ? ['lab'] : process.argv.includes('--public') ? ['public'] : ['public','lab'];
for(const profile of profiles) {
  const version = profile === 'lab' ? LAB_VERSION : PRODUCT_VERSION;
  const temp=mkdtempSync(join(root,'dist','oktonik-'+profile+'-'));
  const id=moduleId(profile);
  const stage=join(temp,id);mkdirSync(stage);
  const expected=new Map();
  function put(name,data){const bytes=Buffer.from(data);writeFileSync(join(stage,name),bytes);expected.set(name,bytes);}
  for(const file of files)put(file,readFileSync(join(root,'src',file)));
  put('profile.mjs',readFileSync(join(root,'src/profile.mjs'),'utf8').replace("BUILD_PROFILE = 'lab'",`BUILD_PROFILE = '${profile}'`).replace(`PRODUCT_VERSION = '${PRODUCT_VERSION}'`,`PRODUCT_VERSION = '${version}'`));
  const manifest=JSON.parse(readFileSync(join(root,'src/module.json'),'utf8'));
  Object.assign(manifest,{id,author:'Skerry Vibe',name:PRODUCT_NAME+(profile==='lab'?' Lab':''),abbrev:profile==='lab'?'OKTL':'OKTN',version,description:PRODUCT_TAGLINE});
  manifest.capabilities.suspend_self_managed=true;manifest.capabilities.button_passthrough=[86];
  put('module.json',JSON.stringify(manifest,null,2)+'\n');
  put('README.md',readFileSync(join(root,profile==='public'?'docs/install-public.md':'README.md')));
  if(profile==='public'){
    // The illustrated guide travels with the package and as its own file.
    const guide=renderGuideHtml(join(root,'docs/oktonik-public.md'),version);
    put('GUIDE.html',guide);writeFileSync(join(root,'dist',`oktonik-guide-${version}.html`),guide);
  }
  if(profile==='lab')put('LAB-TEST.md',readFileSync(join(root,'docs/lab-chain-test.md')));
  if(profile==='lab')put('harmony-palettes.md',readFileSync(join(root,'docs/harmony-palettes.md')));
  put('help.json',readFileSync(join(root,profile==='public'?'docs/help-public.json':'src/help.json')));
  put('LICENSE',readFileSync(join(root,'LICENSE')));
  put('NOTICE.md',readFileSync(join(root,'NOTICE.md')));
  for(const file of ['dsp.so','install-swap']) {
    copyFileSync(join(root,'dist',file),join(stage,file));expected.set(file,readFileSync(join(stage,file)));
  }
  const archive=join(root,'dist',`oktonik-${profile}-${version}.tar.gz`);
  execFileSync('tar',['-czf',archive,'-C',temp,id],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n').sort();
  assert.deepEqual(entries,[id+'/',...Array.from(expected.keys(),f=>id+'/'+f)].sort());
  for(const [name,bytes] of expected)assert.deepEqual(execFileSync('tar',['-xOf',archive,id+'/'+name]),bytes,name);
  console.log(`Verified ${profile}: ${archive}`);
  if(profile==='public')copyFileSync(archive,join(root,'dist','oktonik-module.tar.gz'));
}
