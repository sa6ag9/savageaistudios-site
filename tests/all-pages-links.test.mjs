/* Exhaustive local route and fragment audit across the static website.
   No external requests and no payment interactions. */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,statSync,existsSync} from "node:fs";
import {resolve,relative,dirname,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
function collect(dir) {
  const results=[];
  for(const e of readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith(".")||["node_modules","tests","docs"].includes(e.name))continue;
    const path=resolve(dir,e.name);
    if(e.isDirectory()) results.push(...collect(path));
    else if(e.isFile()&&extname(path)===".html") results.push(path);
  }
  return results;
}
const pages=collect(root);
const ids=new Map();
function allIds(file) {
  if(!ids.has(file)){
    const s=readFileSync(file,"utf8");
    ids.set(file,new Set([...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1])));
  }
  return ids.get(file);
}

test("all 39 HTML pages have working local href/src paths and hash targets",()=>{
  assert.equal(pages.length,39,"Site page inventory changed—review coverage intentionally");
  let inspected=0;
  for(const page of pages){
    const content=readFileSync(page,"utf8");
    const local=relative(root,page);
    for(const [,url] of content.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)){
      if(/^(?:https?:|mailto:|tel:|sms:|data:|javascript:|\/\/)/i.test(url))continue;
      const parts=url.split("#");
      const pathPart=parts[0].split("?")[0];
      const fragment=parts.length>1?decodeURIComponent(parts[1]):"";
      if(!pathPart&&!fragment)continue;
      let dest=pathPart.startsWith("/")?resolve(root,"."+pathPart):resolve(dirname(page),decodeURIComponent(pathPart));
      if(!pathPart)dest=page;
      if(existsSync(dest)&&statSync(dest).isDirectory())dest=resolve(dest,"index.html");
      assert.ok(dest===root||dest.startsWith(root+sep),"Path escaped website root: "+local+" → "+url);
      assert.ok(existsSync(dest)&&statSync(dest).isFile(),"Broken local reference: "+local+" → "+url);
      if(fragment) assert.ok(allIds(dest).has(fragment),"Broken local fragment: "+local+" → "+url);
      inspected++;
    }
  }
  assert.ok(inspected>150,"Unexpectedly few local references inspected");
});

test("main-page modernized navigation uses one accessible mobile disclosure",()=>{
  for(const file of ["index.html","work.html","about.html","overmind.html","studio.html","coding-blind.html"]){
    const c=readFileSync(resolve(root,file),"utf8");
    assert.match(c,/class="refresh-v3(?: [^"]*)?"/);
    assert.match(c,/href="site-refresh.css"/);
    assert.equal((c.match(/<details class="mobile-menu">/g)||[]).length,1,file);
    assert.match(c,/aria-label="Mobile navigation"/);
    assert.match(c,/aria-label="Primary navigation"/);
    assert.match(c,/class="skip-link" href="#main"/);
    assert.match(c,/<main id="main">/);
  }
});
