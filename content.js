// Gemini Message Navigator - DeepSeek-style sidebar
(function () {
  "use strict";

  // ========== Configuration ==========
  const DEBUG = false;
  const NAV_WIDTH_COLLAPSED = 8;   // thin bar when collapsed (wide enough to show dots)
  const NAV_WIDTH_EXPANDED = 220;  // expanded on hover
  const DEBOUNCE_MS = 600;

  // ========== State ==========
  let userMessages = [];
  let navRoot = null;
  let initialized = false;
  let scanTimer = null;
  let domObserver = null;

  // ========== Helpers ==========
  const log = DEBUG ? console.log.bind(console, "[GeminiNav]") : () => {};

  function isGeminiPage() {
    return window.location.hostname === "gemini.google.com";
  }

  // ========== Detection: use Gemini's own custom elements ==========
  function detectUserMessages() {
    // Gemini uses <user-query> custom elements for user turns
    const queries = document.querySelectorAll("user-query");
    const results = [];

    for (const el of queries) {
      // skip elements inside our own nav
      if (el.closest("#gemini-msg-nav")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height < 10 || rect.width < 50) continue;
      results.push(el);
    }

    // Deduplicate: remove elements that are ancestors of others
    const deduped = [];
    for (const el of results) {
      const isAncestor = deduped.some((d) => d.contains(el));
      const isDescendant = deduped.some((d) => el.contains(d));
      if (isAncestor) continue;
      if (isDescendant) {
        // replace ancestor with this (more specific)
        const idx = deduped.findIndex((d) => el.contains(d));
        if (idx >= 0) deduped.splice(idx, 1);
      }
      deduped.push(el);
    }

    log(`Found ${deduped.length} user-query elements`);
    return deduped;
  }

  // ========== Build nav DOM ==========
  function createNav() {
    if (navRoot) navRoot.remove();

    // --- outer container (like DeepSeek's ef46fbc6) ---
    navRoot = document.createElement("div");
    navRoot.id = "gemini-msg-nav";

    // --- inner scroller (like DeepSeek's fae5876e) ---
    const inner = document.createElement("div");
    inner.id = "gemini-nav-inner";

    const list = document.createElement("div");
    list.id = "gemini-nav-list";
    inner.appendChild(list);

    navRoot.appendChild(inner);
    document.body.appendChild(navRoot);

    // --- Inject styles once ---
    if (!document.getElementById("gemini-nav-styles")) {
      const style = document.createElement("style");
      style.id = "gemini-nav-styles";
      style.textContent = getStyles();
      document.head.appendChild(style);
    }

    // --- Hover: expand ---
    navRoot.addEventListener("mouseenter", () => {
      navRoot.classList.add("expanded");
    });
    navRoot.addEventListener("mouseleave", () => {
      navRoot.classList.remove("expanded");
    });

    // --- Drag support ---
    makeDraggable(navRoot);

    log("Nav created");
  }

  function getStyles() {
    return `
      #gemini-msg-nav {
        position: fixed;
        top: 50%;
        right: 12px;
        transform: translateY(-50%);
        z-index: 99999;
        width: ${NAV_WIDTH_COLLAPSED}px;
        max-height: calc(100vh - 200px);
        min-height: 60px;
        border-radius: 8px;
        transition: width 0.2s ease;
        cursor: default;
        user-select: none;
        display: flex;
        align-items: center;
      }
      #gemini-msg-nav.expanded {
        width: ${NAV_WIDTH_EXPANDED}px;
      }

      /* semi-transparent glass background (appears on expand) */
      #gemini-nav-inner {
        width: 100%;
        height: 100%;
        max-height: calc(100vh - 200px);
        min-height: 60px;
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: transparent;
        transition: background 0.2s ease, box-shadow 0.2s ease;
        border: 1px solid transparent;
        padding: 8px 0;
        box-sizing: border-box;
      }
      #gemini-msg-nav.expanded #gemini-nav-inner {
        background: rgba(255,255,255,0.72);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: none;
        border-color: transparent;
      }

      /* list */
      #gemini-nav-list {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0;
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        padding: 4px 0;
        scrollbar-width: none;
      }
      #gemini-nav-list::-webkit-scrollbar { display: none; }

      /* one message = one row — flex grow fills the bar height naturally */
      .gn-item {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex: 1 0 18px;          /* grow to fill space, min 18px */
        width: 100%;
        cursor: pointer;
        padding: 0;
        transition: flex-basis 0.15s ease;
      }
      #gemini-msg-nav.expanded .gn-item {
        flex: 1 0 33px;          /* taller touch target when expanded */
      }
      /* when items overflow, scroll instead of shrink */
      #gemini-nav-list.has-many .gn-item {
        flex: 0 0 18px;
      }
      #gemini-msg-nav.expanded #gemini-nav-list.has-many .gn-item {
        flex: 0 0 33px;
      }

      /* indicator dot / dash */
      .gn-dot {
        flex-shrink: 0;
        width: 4px;
        height: 4px;
        border-radius: 2px;
        background: rgba(0,0,0,0.20);
        margin-right: 2px;
        transition: all 0.15s ease;
      }
      .gn-item:hover .gn-dot {
        background: rgba(0,0,0,0.55);
        width: 10px;
      }
      .gn-item.active .gn-dot {
        background: #333;
        width: 12px;
        height: 6px;
        border-radius: 3px;
      }

      /* label — hidden when collapsed */
      .gn-label {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        line-height: 1;
        color: #444;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 170px;
        margin-right: 10px;
        opacity: 0;
        transition: opacity 0.1s ease;
        pointer-events: none;
      }
      #gemini-msg-nav.expanded .gn-label {
        opacity: 1;
      }

      /* empty state */
      .gn-empty {
        color: #999;
        font-size: 11px;
        text-align: center;
        padding: 8px 6px;
        opacity: 0;
        white-space: nowrap;
      }
      #gemini-msg-nav.expanded .gn-empty {
        opacity: 1;
      }

      /* highlight animation when scrolled to — subtle bg flash, no border */
      .gn-highlight-pulse {
        animation: gn-pulse 1.8s ease-out;
      }
      @keyframes gn-pulse {
        0%   { background-color: rgba(0,0,0,0.06); border-radius: 8px; }
        100% { background-color: transparent; }
      }

      /* dark mode */
      @media (prefers-color-scheme: dark) {
        #gemini-msg-nav.expanded #gemini-nav-inner {
          background: rgba(22,22,24,0.72);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: none;
          border-color: transparent;
        }
        .gn-dot { background: rgba(255,255,255,0.25); }
        .gn-item:hover .gn-dot { background: rgba(255,255,255,0.60); }
        .gn-item.active .gn-dot { background: #ddd; }
        .gn-label { color: #ccc; }
      }
    `;
  }

  // ========== Simple drag ==========
  function makeDraggable(el) {
    let dragging = false, startX, startY, startLeft, startTop;
    el.addEventListener("mousedown", (e) => {
      // only drag from the outer area, not when clicking items
      if (e.target !== el && e.target !== el.querySelector("#gemini-nav-inner")) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const r = el.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      el.style.transition = "none";
      el.style.right = "auto";
      el.style.left = startLeft + "px";
      el.style.top = startTop + "px";
      el.style.transform = "none";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = startLeft + (e.clientX - startX) + "px";
      el.style.top  = startTop  + (e.clientY - startY) + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = "";
    });
  }

  // ========== Render list ==========
  function renderList() {
    const listEl = document.getElementById("gemini-nav-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (userMessages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gn-empty";
      empty.textContent = "没有用户消息";
      listEl.appendChild(empty);
      return;
    }

    userMessages.forEach((msg, idx) => {
      const item = document.createElement("div");
      item.className = "gn-item";

      const label = document.createElement("span");
      label.className = "gn-label";
      label.textContent = (idx + 1) + ". " + msg.preview;

      const dot = document.createElement("span");
      dot.className = "gn-dot";

      item.appendChild(label);
      item.appendChild(dot);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        // mark active
        listEl.querySelectorAll(".gn-item").forEach((el) => el.classList.remove("active"));
        item.classList.add("active");
        scrollToMessage(msg.element);
      });

      listEl.appendChild(item);
    });

    // Mark list as "has-many" when items would overflow (prevents flex-grow squishing)
    requestAnimationFrame(() => {
      const inner = document.getElementById("gemini-nav-inner");
      if (!inner) return;
      const availH = inner.clientHeight - 16;
      const itemH = 18;
      const neededH = userMessages.length * itemH;
      if (neededH > availH) {
        listEl.classList.add("has-many");
      } else {
        listEl.classList.remove("has-many");
      }
    });
  }

  // ========== Scroll to message ==========
  function scrollToMessage(el) {
    if (!el || !document.body.contains(el)) return;
    // clear previous highlight
    document.querySelectorAll(".gn-highlight-pulse").forEach((e) => e.classList.remove("gn-highlight-pulse"));
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      el.classList.add("gn-highlight-pulse");
      setTimeout(() => el.classList.remove("gn-highlight-pulse"), 2000);
    }, 350);
  }

  // ========== Scan ==========
  let scanning = false;

  function scanAndRender() {
    if (scanning) return;
    scanning = true;
    try {
      const elements = detectUserMessages();
      userMessages = elements.map((el) => {
        const raw = el.textContent?.trim() || "";
        // strip Gemini UI labels like "你说", "You said", "User" etc.
        const text = raw
          .replace(/^你说[：:]\s*/i, "")
          .replace(/^\s*你说\s+/i, "")
          .replace(/^You\s+said[：:]\s*/i, "")
          .replace(/^User[：:]\s*/i, "")
          .replace(/^user[：:]\s*/i, "")
          .trim();
        return {
          element: el,
          text: text,
          preview: text.length > 40 ? text.substring(0, 40) + "…" : text,
        };
      });
      renderList();
    } finally {
      scanning = false;
    }
  }

  // ========== Observe DOM ==========
  function startObserver() {
    if (domObserver) domObserver.disconnect();
    domObserver = new MutationObserver((mutations) => {
      // skip if our own nav changed
      const hasRelevant = mutations.some((m) => {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && !node.closest?.("#gemini-msg-nav")) return true;
        }
        return false;
      });
      if (hasRelevant) {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scanAndRender, DEBOUNCE_MS);
      }
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Check if nav was removed from DOM
  setInterval(() => {
    if (navRoot && !document.body.contains(navRoot)) {
      log("Nav removed, re-attaching");
      document.body.appendChild(navRoot);
      scanAndRender();
    }
  }, 2000);

  // ========== Init ==========
  function init() {
    if (initialized) return;
    if (!isGeminiPage()) return;

    initialized = true;
    log("Init");

    createNav();
    startObserver();

    // initial scan after page settles
    setTimeout(scanAndRender, 1200);
    setTimeout(scanAndRender, 3500); // catch lazy-loaded content
  }

  // ========== Start ==========
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 800));
  } else {
    setTimeout(init, 800);
  }

  // Handle SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      initialized = false;
      userMessages = [];
      setTimeout(init, 2000);
    }
  }).observe(document, { subtree: true, childList: true });

  // Debug interface
  window.GeminiNavigator = {
    scan: scanAndRender,
    getMessages: () => userMessages,
    nav: () => navRoot,
  };
})();
