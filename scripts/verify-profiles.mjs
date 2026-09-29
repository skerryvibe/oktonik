import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {moduleId,PRODUCT_VERSION} from '../src/profile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const profile of ['public','lab']){
  const id=moduleId(profile),archive=`${root}dist/oktonik-${profile}-${PRODUCT_VERSION}.tar.gz`;
  const read=name=>execFileSync('tar',['-xOf',archive,`${id}/${name}`]);
  const manifest=JSON.parse(read('module.json'));
  assert.equal(manifest.id,id);assert.equal(manifest.author,'Skerry Vibe');assert.equal(manifest.version,PRODUCT_VERSION);
  assert.match(read('profile.mjs').toString(),new RegExp(`BUILD_PROFILE = '${profile}'`));
  for(const file of ['ui.js','pilot.mjs','project.mjs','settings.mjs','theory.mjs','display.mjs','ideas.mjs','recording.mjs','timeline.mjs','bass-gesture.mjs'])assert.deepEqual(read(file),readFileSync(`${root}src/${file}`));
  for(const file of ['dsp.so','install-swap'])assert.deepEqual(read(file),readFileSync(`${root}dist/${file}`));
  console.log(`Verified ${id} ${PRODUCT_VERSION}`);
}
