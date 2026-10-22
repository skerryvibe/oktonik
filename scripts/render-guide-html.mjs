// Renders the Markdown user guide as one self-contained HTML page, with its
// SVG illustrations inlined, so testers can open it from the package or a
// chat attachment without a GitHub link. Handles the subset the guide uses.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const slug=text=>text.toLowerCase().replace(/[^a-z0-9 -]/g,'').replace(/ /g,'-');

function inline(text,base) {
  const code=[];
  let s=esc(text).replace(/`([^`]+)`/g,(_,c)=>`\u0000${code.push(c)-1}\u0000`);
  s=s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,src)=>{
    const svg=readFileSync(join(base,src));
    return `<img alt="${alt}" src="data:image/svg+xml;base64,${svg.toString('base64')}">`;
  });
  s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,href)=>href.startsWith('#')||/^https?:/.test(href)?`<a href="${href}">${label}</a>`:label);
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g,'$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>`<code>${code[i]}</code>`);
}

export function renderGuideHtml(path,version) {
  const base=dirname(path),lines=readFileSync(path,'utf8').split('\n'),out=[];
  let title='OKTONIK';
  for(let i=0;i<lines.length;) {
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    const heading=line.match(/^(#{1,3}) (.*)$/);
    if(heading){const level=heading[1].length;if(level===1)title=heading[2];
      out.push(`<h${level} id="${slug(heading[2])}">${inline(heading[2],base)}</h${level}>`);i++;continue;}
    if(line.startsWith('|')) {
      const rows=[];while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++]);
      const cells=r=>r.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      out.push('<table><thead><tr>'+cells(rows[0]).map(c=>`<th>${inline(c,base)}</th>`).join('')+'</tr></thead><tbody>'
        +rows.slice(2).map(r=>'<tr>'+cells(r).map(c=>`<td>${inline(c,base)}</td>`).join('')+'</tr>').join('')+'</tbody></table>');
      continue;
    }
    const item=/^(-|\d+\.) /;
    if(item.test(line)) {
      const ordered=/^\d/.test(line),items=[];
      while(i<lines.length&&(item.test(lines[i])||(/^\s+\S/.test(lines[i])&&items.length))) {
        if(item.test(lines[i]))items.push(lines[i].replace(item,''));else items[items.length-1]+=' '+lines[i].trim();i++;
      }
      const tag=ordered?'ol':'ul';out.push(`<${tag}>`+items.map(t=>`<li>${inline(t,base)}</li>`).join('')+`</${tag}>`);continue;
    }
    const para=[];
    do para.push(lines[i++]);while(i<lines.length&&lines[i].trim()&&!/^(#{1,3} |\||- |\d+\. )/.test(lines[i]));
    out.push('<p>'+para.map((l,j)=>inline(l.trimEnd(),base)+(l.endsWith('  ')&&j<para.length-1?'<br>':'')).join('\n')+'</p>');
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} ${esc(version)}</title>
<style>
:root{--bg:#fff;--fg:#1b2430;--muted:#5b6675;--line:#d9dee5;--accent:#2a6fdb;--code:#f2f4f7}
@media (prefers-color-scheme:dark){:root{--bg:#0f1620;--fg:#e6ebf1;--muted:#9aa6b4;--line:#2a3542;--accent:#7fb0ff;--code:#1b2633}}
body{background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,Arial,sans-serif;margin:0}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:2rem;margin:.2em 0}h2{margin-top:2em;padding-top:.6em;border-top:1px solid var(--line)}
a{color:var(--accent)}code{background:var(--code);padding:.1em .35em;border-radius:4px}
img{max-width:100%;height:auto;border-radius:12px;margin:8px 0}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;margin:12px 0}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{background:var(--code)}
.version{color:var(--muted)}
</style></head><body><main>
<p class="version">OKTONIK ${esc(version)}</p>
${out.join('\n')}
</main></body></html>
`;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {PRODUCT_VERSION}=await import('../src/profile.mjs');
  const root=fileURLToPath(new URL('../',import.meta.url));
  mkdirSync(join(root,'dist'),{recursive:true});
  const target=join(root,'dist',`oktonik-guide-${PRODUCT_VERSION}.html`);
  writeFileSync(target,renderGuideHtml(join(root,'docs/oktonik-public.md'),PRODUCT_VERSION));
  console.log('Wrote '+target);
}
