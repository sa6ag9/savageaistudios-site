/* Savage AI Studios v2 — motion engine. Vanilla JS, no dependencies.
   Progressive enhancement only: if this file fails to load, all content
   stays visible (reveal-hiding is gated on the .js class added below)
   and every stat already shows its final number in the HTML. */
(function () {
  "use strict";
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduce = reducedMotion.matches;
  document.documentElement.classList.add("js");

  /* ---------- header shadow on scroll ---------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 12); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- smooth page-out transition on internal links ---------- */
  document.addEventListener("click", function (e) {
    if (reducedMotion.matches || e.defaultPrevented || e.button !== 0) return;
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || a.hasAttribute("download") ||
        (a.target && a.target !== "_self") ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var targetUrl;
    try { targetUrl = new URL(href, window.location.href); } catch (err) { return; }
    // Never hijack external links, checkout flows, mailto or non-web schemes.
    if (!/^https?:$/.test(targetUrl.protocol) ||
        targetUrl.origin !== window.location.origin) return;
    // Native in-page anchor navigation must preserve browser scrolling/history.
    if (targetUrl.pathname === window.location.pathname &&
        targetUrl.search === window.location.search && targetUrl.hash) return;
    e.preventDefault();
    document.body.classList.add("leaving");
    setTimeout(function () { window.location.href = targetUrl.href; }, 200);
  });

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  } else {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); ro.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    revealEls.forEach(function (el) { ro.observe(el); });
  }

  /* ---------- animated stat counters (final value already in HTML) ---------- */
  var counters = document.querySelectorAll("[data-count]");
  function runCounter(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    if (isNaN(target) || reduce) { el.textContent = target; return; }
    var start = null, dur = 1400;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window && !reduce) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { runCounter(en.target); co.unobserve(en.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---------- hover tilt + glow on cards (fine pointers only) ---------- */
  if (!reduce && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll(".tilt").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(800px) rotateY(" + (x * 7).toFixed(2) + "deg) rotateX(" + (-y * 7).toFixed(2) + "deg) translateY(-3px)";
      });
      card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    });
  }

  /* ---------- murmuration canvas in every page hero ----------
     Particles flock: separation / alignment / cohesion-lite, plus a
     slowly roaming attractor so the flock coheres into loose forms —
     Overmind's identity. Pauses off-screen and under reduced motion
     (single static frame). */
  document.querySelectorAll(".hero-canvas").forEach(function (canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var W = 0, H = 0, parts = [], running = false, t = 0;
    var rafId = 0, lastFrame = 0, visible = false;
    var N = window.innerWidth < 640 ? 55 : 110;

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      W = canvas.width = Math.max(300, Math.floor(r.width));
      H = canvas.height = Math.max(200, Math.floor(r.height));
    }
    function spawn(anywhere) {
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : -4,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 1.9 + 0.5,
        o: Math.random() * 0.55 + 0.2,
        electric: Math.random() < 0.22
      };
    }
    function init() {
      resize(); parts = [];
      for (var i = 0; i < N; i++) parts.push(spawn(true));
    }
    function drawFrame(staticOnly) {
      ctx.clearRect(0, 0, W, H);
      t += 0.0035;
      // roaming attractor — the point the flock coheres around
      var ax = W * (0.5 + 0.34 * Math.sin(t * 1.7));
      var ay = H * (0.46 + 0.30 * Math.cos(t * 2.3));
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!staticOnly) {
          var sx = 0, sy = 0, axv = 0, ayv = 0, n = 0;
          for (var j = 0; j < parts.length; j++) {
            if (j === i) continue;
            var q = parts[j], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
            if (d2 < 3600) { // within 60px — flock neighbour
              n++;
              axv += q.vx; ayv += q.vy;
              if (d2 < 400 && d2 > 0.01) { var d = Math.sqrt(d2); sx += (dx / d) * 0.02; sy += (dy / d) * 0.02; }
            }
          }
          if (n) { p.vx += (axv / n - p.vx) * 0.02; p.vy += (ayv / n - p.vy) * 0.02; p.vx += sx; p.vy += sy; }
          p.vx += (ax - p.x) * 0.00035; p.vy += (ay - p.y) * 0.00035;
          p.vx += (Math.random() - 0.5) * 0.01; p.vy += (Math.random() - 0.5) * 0.01;
          var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy), max = 1.15, min = 0.35;
          if (sp > max) { p.vx = p.vx / sp * max; p.vy = p.vy / sp * max; }
          if (sp < min && sp > 0.001) { p.vx = p.vx / sp * min; p.vy = p.vy / sp * min; }
          p.x += p.vx; p.y += p.vy;
          if (p.x < -12) p.x = W + 12; if (p.x > W + 12) p.x = -12;
          if (p.y < -12) p.y = H + 12; if (p.y > H + 12) p.y = -12;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.electric
          ? "rgba(89,230,255," + p.o.toFixed(2) + ")"
          : "rgba(232,178,100," + p.o.toFixed(2) + ")";
        ctx.fill();
      }
      // faint links between near neighbours — the flock reading as one organism
      ctx.lineWidth = 0.5;
      for (var a = 0; a < parts.length; a++) {
        for (var b = a + 1; b < parts.length; b++) {
          var dx2 = parts[a].x - parts[b].x, dy2 = parts[a].y - parts[b].y;
          var dd = dx2 * dx2 + dy2 * dy2;
          if (dd < 2600) {
            ctx.strokeStyle = "rgba(160,180,200," + (0.10 * (1 - dd / 2600)).toFixed(3) + ")";
            ctx.beginPath(); ctx.moveTo(parts[a].x, parts[a].y); ctx.lineTo(parts[b].x, parts[b].y); ctx.stroke();
          }
        }
      }
    }
    function loop(time) {
      rafId = 0;
      if (!running || document.hidden || reducedMotion.matches) return;
      // The canvas is O(N²): cap the expensive draw updates on mobile CPUs.
      var frameMs = window.innerWidth < 640 ? 1000 / 24 : 1000 / 30;
      if (!lastFrame || time - lastFrame >= frameMs) {
        drawFrame(false);
        lastFrame = time;
      }
      rafId = requestAnimationFrame(loop);
    }
    function syncMotion() {
      running = visible && !document.hidden && !reducedMotion.matches;
      if (!running && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (running && !rafId) rafId = requestAnimationFrame(loop);
    }

    init();
    window.addEventListener("resize", function () {
      init();
      if (reducedMotion.matches) drawFrame(true);
      lastFrame = 0;
    });
    document.addEventListener("visibilitychange", syncMotion);
    var onMotionChange = function () {
      if (reducedMotion.matches) drawFrame(true);
      syncMotion();
    };
    if (reducedMotion.addEventListener) {
      reducedMotion.addEventListener("change", onMotionChange);
    } else if (reducedMotion.addListener) {
      reducedMotion.addListener(onMotionChange);
    }
    if (reducedMotion.matches) drawFrame(true);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = !!entries[0].isIntersecting;
        syncMotion();
      }).observe(canvas);
    } else {
      visible = true;
      syncMotion();
    }
  });
})();
