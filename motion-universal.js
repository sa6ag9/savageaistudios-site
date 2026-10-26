/* Savage AI Studios universal motion layer v1.
 * For nested product, catalog and downloadable-book pages.
 * Progressive, reduced-motion- and data-saver-aware. No third-party libraries.
 */
(() => {
  "use strict";
  if (!document.body || document.body.classList.contains("motion-universal")) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const dataSaver = Boolean(navigator.connection && navigator.connection.saveData);
  document.body.classList.add("motion-universal");

  // Never hide content without support to reveal it; animations are visual-only.
  if (!reduced.matches && "IntersectionObserver" in window) {
    const nodes = [...document.querySelectorAll(
      "main .card, main .stats, main > section:not(:first-child) .wrap > h2, main > section:not(:first-child) .wrap > .lede, main > section:not(:first-child) .wrap > .note"
    )].filter(node => !node.closest(".motion-enter"));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("motion-visible");
        observer.unobserve(entry.target);
      }
    }, {threshold:0.08,rootMargin:"0px 0px -2% 0px"});
    for (const el of nodes) {el.classList.add("motion-enter");observer.observe(el)}
    // Accessibility control: a user enabling reduced motion while visiting sees content immediately.
    reduced.addEventListener?.("change", event => {
      if (event.matches) {
        observer.disconnect();
        for (const el of nodes) el.classList.add("motion-visible");
      }
    });
  }

  // Small, sparse starfield — no animation in reduced-motion or data-saving modes.
  if (reduced.matches || dataSaver) return;
  const host = document.querySelector("main > .hero, main > section:first-child");
  if (!host || !("IntersectionObserver" in window)) return;
  const canvas = document.createElement("canvas");
  canvas.className = "site-motion-canvas";
  canvas.setAttribute("aria-hidden","true");
  canvas.setAttribute("role","presentation");
  host.insertBefore(canvas,host.firstChild);
  const context = canvas.getContext("2d",{alpha:true});
  if (!context) {canvas.remove();return}
  const narrow = window.matchMedia("(max-width: 640px)");
  let width=0,height=0,points=[],alive=true,inView=false,frameId=0,lastFrame=0;
  const frameDuration = 1000/24;

  function resize() {
    const rect=host.getBoundingClientRect();
    const pixelRatio=Math.min(window.devicePixelRatio||1,1.5);
    width=Math.max(1,rect.width);
    height=Math.max(1,rect.height);
    canvas.width=Math.ceil(width*pixelRatio);
    canvas.height=Math.ceil(height*pixelRatio);
    context.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    const count=narrow.matches?15:28;
    points=Array.from({length:count},(_,i)=>({
      x:(i*.6180339%1)*width,
      y:(i*.381966%1)*height,
      speed:.09+(i%7)*.015,
      phase:i*.55,
      radius: .8+(i%3)*.4
    }));
  }
  resize();
  let resizeObserver=null;
  if ("ResizeObserver" in window) {
    resizeObserver=new ResizeObserver(resize);
    resizeObserver.observe(host);
  } else window.addEventListener("resize",resize,{passive:true});

  function draw(time) {
    frameId=0;
    if (!alive || !inView || document.hidden || reduced.matches) return;
    if (time-lastFrame>=frameDuration) {
      lastFrame=time;
      context.clearRect(0,0,width,height);
      const t=time*.0002;
      for (let i=0;i<points.length;i++) {
        const p=points[i];
        const x=p.x+Math.sin(t+p.phase)*Math.min(18,width*.03);
        const y=(p.y+t*90*p.speed)%height;
        context.beginPath();
        context.arc(x,y,p.radius,0,Math.PI*2);
        context.fillStyle=i%5===0?"rgba(103,235,237,.55)":"rgba(232,178,100,.36)";
        context.fill();
      }
    }
    frameId=requestAnimationFrame(draw);
  }
  function restart() {
    if (!alive || !inView || document.hidden || reduced.matches || frameId) return;
    frameId=requestAnimationFrame(draw);
  }
  const visibilityObserver=new IntersectionObserver(entries=>{
    inView=entries[0]?.isIntersecting===true;
    if (inView) restart();
    else if(frameId) {cancelAnimationFrame(frameId);frameId=0}
  },{threshold:0});
  visibilityObserver.observe(host);
  const onVisibility=()=>{if(!document.hidden)restart();else if(frameId){cancelAnimationFrame(frameId);frameId=0}};
  document.addEventListener("visibilitychange",onVisibility,{passive:true});
  reduced.addEventListener?.("change",event=>{
    if(event.matches) {
      alive=false;
      if(frameId) cancelAnimationFrame(frameId);
      frameId=0;
      visibilityObserver.disconnect();
      resizeObserver?.disconnect();
      canvas.remove();
    }
  });
})();
