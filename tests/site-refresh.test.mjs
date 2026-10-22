/* Source-level homepage regression checks.
 * Run: node --test tests/site-refresh.test.mjs
 * No network access or third-party dependencies required.
 * Static checks are NOT a substitute for visual, accessibility or payment E2E audits.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homepage = readFileSync(resolve(root,"index.html"),"utf8");
const stylesheet = readFileSync(resolve(root,"site-refresh.css"),"utf8");
const pageLinks = [...homepage.matchAll(/href=["']([^"']+)["']/g)].map(match=>match[1]);
const count = (needle) => (homepage.match(needle)||[]).length;

test("accessible HTML language and one H1",() => {
  assert.match(homepage,/<html lang="en">/);
  assert.equal(count(/<h1\b/g),1);
  assert.equal(count(/<main\b/g),1);
  assert.equal(count(/<\/main>/g),1);
  assert.match(homepage,/class="skip-link" href="#main"/);
  assert.match(homepage,/id="main"/);
});

test("mobile keyboard navigation is semantic",() => {
  assert.match(homepage,/<details class="mobile-menu">/);
  assert.match(homepage,/<summary aria-label="Toggle website navigation">/);
  assert.match(homepage,/aria-label="Mobile navigation"/);
  assert.match(homepage,/aria-label="Primary navigation"/);
});

test("homepage has a unique on-page target for every hash-only CTA",() => {
  for(const href of pageLinks.filter(href=>href.startsWith("#"))) {
    const target=href.slice(1);
    assert.match(homepage,new RegExp('id=["\\\']'+target+'["\\\']'),href);
  }
});

test("local linked content files exist",() => {
  for(const href of pageLinks) {
    if(/^(https?:|mailto:|tel:|#)/.test(href)) continue;
    const path = href.split("#")[0].split("?")[0];
    if(!path) continue;
    const file=path.endsWith("/")?path+"index.html":path;
    assert.ok(existsSync(resolve(root,file)), "Local link missing: "+href);
    if(href.includes("#")) {
      const fragment=href.split("#")[1];
      if(fragment) assert.match(readFileSync(resolve(root,file),"utf8"),new RegExp('id=["\\\']'+fragment+'["\\\']'),"Broken hash: "+href);
    }
  }
});

test("all five Bubble destinations remain reachable through page links",() => {
  for(const name of ["reviewloop","bookshield-barbers","chairconfirm","balloonboard","jobsaver"]) {
    assert.ok(pageLinks.includes("https://"+name+".bubbleapps.io"),name+" removed");
  }
});

test("contact, external Overmind, catalog and audits paths stay present",() => {
  for(const href of ["mailto:sa6ag9@ovmtruth.com","https://ovmtruth.com","work.html","work.html#audits","products/","coloring-books/","coding-blind.html"]) {
    assert.ok(pageLinks.includes(href),href);
  }
});

test("source design does not claim stale unsupported counts",() => {
  assert.doesNotMatch(homepage,/\b81 AI actors\b|\b33 GitHub repositories\b|\b14 products with live checkout\b/);
  assert.doesNotMatch(homepage,/data-count=["']81["']/);
});

test("search metadata points at the public studio domain",() => {
  assert.match(homepage,/<link rel="canonical" href="https:\/\/savageaistudios.com\/">/);
  assert.match(homepage,/<meta property="og:description"/);
  assert.match(homepage,/<meta name="description"/);
});

test("isolated styles load after preserved shared stylesheet",() => {
  const oldStyle=homepage.indexOf('href="style.css"');
  const refreshStyle=homepage.indexOf('href="site-refresh.css"');
  assert.ok(oldStyle>=0&&refreshStyle>oldStyle);
  assert.ok(stylesheet.startsWith("/* Savage AI Studios homepage refresh"));
  assert.match(homepage,/class="refresh-v3"/);
  assert.match(stylesheet,/\.refresh-v3 \.hero-grid/);
});

test("small screens, keyboard focus and reduced motion covered",() => {
  assert.match(stylesheet,/@media\(max-width:550px\)/);
  assert.match(stylesheet,/@media\(max-width:850px\)/);
  assert.match(stylesheet,/prefers-reduced-motion:reduce/);
  assert.match(stylesheet,/:focus-visible/);
  assert.equal((stylesheet.match(/\{/g)||[]).length,(stylesheet.match(/\}/g)||[]).length);
});

test("motion engine is unchanged and still available",() => {
  assert.match(homepage,/<script src="motion.js" defer><\/script>/);
  assert.ok(existsSync(resolve(root,"motion.js")));
  assert.match(homepage,/<canvas class="hero-canvas" aria-hidden="true"><\/canvas>/);
});

test("catalog category navigation and purchase URLs stay stable",() => {
  const catalog=readFileSync(resolve(root,"work.html"),"utf8");
  assert.match(catalog,/class="refresh-v3 catalog-refresh"/);
  assert.match(catalog,/<details class="mobile-menu">/);
  for(const section of ["software","audits","applications","sia-v6"]) {
    assert.ok(catalog.includes('id="'+section+'"'),"Missing catalog section: "+section);
  }
  const stripeLinks=[...catalog.matchAll(/href="(https:\/\/buy\.stripe\.com\/[^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(stripeLinks,["https://buy.stripe.com/28E7sKaxKagE8n00yY4Ni03","https://buy.stripe.com/3cI8wO9tG0G45aObdC4Ni0p","https://buy.stripe.com/cNicN4gW8ewUav8ftS4Ni02","https://buy.stripe.com/7sYaEWdJW9cAeLogxW4Ni01","https://buy.stripe.com/bJe9ASbBO60oeLobdC4Ni0q","https://buy.stripe.com/3cI14m21e74s7iWepO4Ni05","https://buy.stripe.com/bJeaEWcFSgF21YC0yY4Ni08","https://buy.stripe.com/4gM6oG0Xa3Sg7iW95u4Ni0d","https://buy.stripe.com/bJe14m49mgF29r481q4Ni06","https://buy.stripe.com/eVq28qbBO2OccDg2H64Ni07","https://buy.stripe.com/5kQaEW0XaewUav83La4Ni0a","https://buy.stripe.com/eVq14m35idsQ0UychG4Ni09","https://buy.stripe.com/4gMbJ0cFSfAY46K3La4Ni04","https://buy.stripe.com/28E3cu21e3SgbzcdlK4Ni00"]);
  assert.equal((catalog.match(/class="buy-btn" href=/g)||[]).length,15);
  assert.equal((catalog.match(/class="buy-btn" href="[^"]+" aria-label="/g)||[]).length,15);
  assert.doesNotMatch(catalog,/81 actors built|33 repositories|Eleven product families, every one/);
});
