import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {moduleId,PRODUCT_VERSION,LAB_VERSION} from '../src/profile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
assert.ok(!(process.argv.includes('--lab') && process.argv.includes('--public')), 'Choose one profile');
for(const profile of process.argv.includes('--lab') ? ['lab'] : process.argv.includes('--public') ? ['public'] : ['public','lab']){
  const version=profile==='lab'?LAB_VERSION:PRODUCT_VERSION;
  const id=moduleId(profile),archive=`${root}dist/oktonik-${profile}-${version}.tar.gz`;
  const read=name=>execFileSync('tar',['-xOf',archive,`${id}/${name}`]);
  const manifest=JSON.parse(read('module.json'));
  assert.equal(manifest.id,id);assert.equal(manifest.author,'Skerry Vibe');assert.equal(manifest.version,version);
  assert.match(read('profile.mjs').toString(),new RegExp(`BUILD_PROFILE = '${profile}'`));
  for(const file of ['ui.js','pilot.mjs','project.mjs','settings.mjs','theory.mjs','display.mjs','ideas.mjs','recording.mjs','timeline.mjs','bass-gesture.mjs'])assert.deepEqual(read(file),readFileSync(`${root}src/${file}`));
  for(const file of ['dsp.so','install-swap'])assert.deepEqual(read(file),readFileSync(`${root}dist/${file}`));
  if(profile==='public')assert.deepEqual(readFileSync(`${root}dist/oktonik-module.tar.gz`),readFileSync(archive));
  console.log(`Verified ${id} ${version}`);
}
