(() => {
  "use strict";
  const C = window.KIK_CONFIG;
  const CATS = window.KIK_CATEGORIES;
  const DEMO = !(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const sb = DEMO ? null : window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);
  const REDIRECT = location.origin + location.pathname;
  let cameFromEmail = /access_token=|[?&]code=/.test(location.hash + location.search);

  let members = [];
  let session = null;
  let isMember = DEMO;         // demo viewers see contact details
  const markers = new Map();   // member id -> Leaflet marker
  const filters = { area: "", cat: "", sub: "", text: "" };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  function toast(msg, ms = 3800) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
  }
  function fillSelect(sel, items, placeholder) {
    sel.innerHTML = "";
    if (placeholder != null) sel.append(new Option(placeholder, ""));
    items.forEach(([label, value]) => sel.append(new Option(label, value)));
  }

  // ---------- map ----------
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  };
  // On desktop the search panel floats over the left of the map, so keep pins clear of it.
  const wide = () => matchMedia("(min-width: 821px)").matches;
  const fitPadding = () => (wide() ? { paddingTopLeft: [440, 40], paddingBottomRight: [40, 40] } : { padding: [30, 30] });
  const HOME = wide() ? [22, 15] : [22, 60];
  const map = L.map("map", { zoomControl: false, minZoom: 2, worldCopyJump: true }).setView(HOME, 2);
  L.control.zoom({ position: "topright" }).addTo(map);
  const base = isDark() ? "Dark_Gray" : "Light_Gray";
  L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${base}_Base/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 16, attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  }).addTo(map);
  L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${base}_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(map);
  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true,
    iconCreateFunction(c) {
      const n = c.getChildCount();
      const s = n < 10 ? 40 : n < 50 ? 48 : 58;
      return L.divIcon({ html: `<div class="cluster"><span>${n}</span></div>`, className: "cluster-icon", iconSize: [s, s] });
    },
  });
  map.addLayer(cluster);
  const PIN_PATH = "M16 1.5C8 1.5 2 7.6 2 15.3 2 25.2 16 38.5 16 38.5S30 25.2 30 15.3C30 7.6 24 1.5 16 1.5z";
  const pinIcon = (m, me) => L.divIcon({
    className: "pin-icon" + (me ? " me" : ""),
    html: `<svg class="pin" viewBox="0 0 32 40" style="--h:${catHue(m.category)}"><path d="${PIN_PATH}"/><circle cx="16" cy="15.3" r="5.2"/></svg>`,
    iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -34],
  });
  // Each business category gets its own hue, used on pins, avatars and tags.
  const CAT_KEYS = Object.keys(CATS);
  function catHue(c) { const i = CAT_KEYS.indexOf(c); return i < 0 ? 30 : Math.round((i * 137.5 + 28) % 360); }
  window.addEventListener("resize", debounce(() => map.invalidateSize(), 150));

  function popupHtml(m) {
    const digits = (p) => String(p || "").replace(/\D/g, "");
    const contact = isMember && m.phone
      ? `<div class="contact">
           <a class="wa" href="https://wa.me/${digits(m.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>
           <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>
           <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>
         </div>`
      : `<p class="locked">Sign in as a member to see contact details.</p>`;
    return `<div class="pop" style="--h:${catHue(m.category)}">
      <div class="pop-head"><span class="avatar lg">${esc(initials(m.full_name))}</span>
      <div><h3>${esc(m.full_name)}</h3>
      <p class="biz">${esc(m.business_name)}</p></div></div>
      <span class="tag">${esc(m.subcategory)}</span>
      <p class="where">${esc(m.place_label)}</p>
      ${contact}${m.sample ? '<p class="locked">Sample member (demo)</p>' : ""}
    </div>`;
  }

  // ---------- filtering ----------
  function matches(m) {
    if (filters.cat && m.category !== filters.cat) return false;
    if (filters.sub && m.subcategory !== filters.sub) return false;
    if (filters.area) {
      const hay = norm([m.place_label, m.locality, m.city, m.state, m.country].join(" "));
      if (!norm(filters.area).split(/[\s,]+/).filter(Boolean).every((t) => hay.includes(t))) return false;
    }
    if (filters.text) {
      const hay = norm([m.full_name, m.business_name, m.subcategory, m.category].join(" "));
      if (!norm(filters.text).split(/\s+/).filter(Boolean).every((t) => hay.includes(t))) return false;
    }
    return true;
  }
  const anyFilter = () => Object.values(filters).some(Boolean);

  function render({ fit = false } = {}) {
    const list = members.filter(matches);
    const myId = session?.user?.id;

    // stats (whole group)
    $("stat-members").textContent = members.length.toLocaleString("en-IN");
    $("stat-countries").textContent = new Set(members.map((m) => m.country)).size;
    $("stat-cities").textContent = new Set(members.map((m) => `${m.city}|${m.country}`)).size;

    // markers
    cluster.clearLayers(); markers.clear();
    const layers = list.map((m) => {
      const mk = L.marker([m.lat, m.lng], { icon: pinIcon(m, m.id === myId || m.mine), title: m.full_name });
      mk.bindPopup(() => popupHtml(m), { maxWidth: 300 });
      markers.set(m.id, mk);
      return mk;
    });
    cluster.addLayers(layers);
    if (fit && list.length) {
      if (anyFilter()) map.fitBounds(L.latLngBounds(list.map((m) => [m.lat, m.lng])).pad(0.2), { maxZoom: 11, ...fitPadding() });
      else fitAll();
    }

    // summary
    const bits = [filters.sub || filters.cat, filters.area && `in “${filters.area}”`, filters.text && `matching “${filters.text}”`].filter(Boolean);
    $("result-summary").textContent = `${list.length} member${list.length === 1 ? "" : "s"}${bits.length ? " · " + bits.join(" ") : ""}`;
    $("clear-filters").hidden = !anyFilter();

    // top areas among results: localities once you've narrowed to a city, otherwise cities
    const level = filters.area ? (m) => m.locality || m.city : (m) => m.city || m.country;
    const counts = {};
    list.forEach((m) => { const k = level(m); if (k) counts[k] = (counts[k] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    $("top-places").innerHTML = top.length > 1
      ? top.map(([k, n]) => `<button class="chip" type="button" data-area="${esc(k)}">${esc(k)}<b>${n}</b></button>`).join("")
      : "";

    // list
    const ol = $("results");
    if (!list.length) {
      ol.innerHTML = `<li class="empty">${members.length ? "No one matches these filters yet. Try a wider area or another profession." : "No one is on the map yet. Be the first!"}</li>`;
      return;
    }
    ol.innerHTML = list
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .slice(0, 300)
      .map((m) => `<li><button class="result" type="button" data-id="${esc(m.id)}">
          <span class="avatar" style="--h:${catHue(m.category)}" aria-hidden="true">${esc(initials(m.full_name))}</span>
          <span><span class="r-name">${esc(m.full_name)}</span>
          <span class="r-biz">${esc(m.business_name)}</span>
          <span class="r-meta">${esc(m.subcategory)} · ${esc([m.locality, m.city].filter(Boolean).join(", ") || m.country)}</span></span>
        </button></li>`)
      .join("");
  }

  function fitAll() {
    if (!members.length) return map.setView(HOME, 2);
    map.fitBounds(L.latLngBounds(members.map((m) => [m.lat, m.lng])).pad(0.1), { maxZoom: 4, ...fitPadding() });
  }

  function focusMember(id) {
    const mk = markers.get(id); if (!mk) return;
    if (matchMedia("(max-width: 820px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelectorAll(".result.active").forEach((b) => b.classList.remove("active"));
    document.querySelector(`.result[data-id="${CSS.escape(id)}"]`)?.classList.add("active");
    map.flyTo(mk.getLatLng(), Math.max(map.getZoom(), 12), { duration: 0.8 });
    map.once("moveend", () => cluster.zoomToShowLayer(mk, () => mk.openPopup()));
  }

  // ---------- search controls ----------
  fillSelect($("q-category"), Object.keys(CATS).map((c) => [c, c]), "All professions");
  $("q-category").addEventListener("change", (e) => {
    filters.cat = e.target.value; filters.sub = "";
    const sub = $("q-sub");
    fillSelect(sub, (CATS[filters.cat] || []).map((s) => [s, s]), "All");
    sub.disabled = !filters.cat;
    render({ fit: true });
  });
  $("q-sub").addEventListener("change", (e) => { filters.sub = e.target.value; render({ fit: true }); });
  $("q-area").addEventListener("input", debounce((e) => { filters.area = e.target.value.trim(); render({ fit: true }); }, 220));
  $("q-text").addEventListener("input", debounce((e) => { filters.text = e.target.value.trim(); render({ fit: true }); }, 220));
  $("clear-filters").addEventListener("click", () => {
    Object.keys(filters).forEach((k) => (filters[k] = ""));
    $("q-area").value = ""; $("q-text").value = ""; $("q-category").value = "";
    fillSelect($("q-sub"), [], "All"); $("q-sub").disabled = true;
    render({ fit: true });
  });
  $("top-places").addEventListener("click", (e) => {
    const b = e.target.closest("[data-area]"); if (!b) return;
    filters.area = b.dataset.area; $("q-area").value = filters.area; render({ fit: true });
  });
  $("results").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) focusMember(b.dataset.id); });

  function refreshAreaSuggestions() {
    const s = new Set();
    members.forEach((m) => [m.locality, m.city, m.state, m.country].forEach((v) => v && s.add(v)));
    $("area-suggestions").innerHTML = [...s].sort().map((v) => `<option value="${esc(v)}"></option>`).join("");
  }

  // ---------- data ----------
  async function fetchAll(table, columns) {
    const out = []; const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await sb.from(table).select(columns).range(from, from + page - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < page) return out;
    }
  }

  async function load() {
    if (DEMO) {
      // Sample members are only fetched in demo mode, so the live site never ships them.
      if (!window.KIK_DEMO_MEMBERS) {
        await new Promise((done) => { const s = document.createElement("script"); s.src = "js/demo-data.js"; s.onload = s.onerror = done; document.head.append(s); });
      }
      members = [...(window.KIK_DEMO_MEMBERS || []), ...(store.get("kik-demo-added") || [])];
    } else {
      try {
        let full = null;
        if (session) {
          const rows = await fetchAll("members", "*");
          if (rows.some((m) => m.id === session.user.id)) full = rows;
        }
        isMember = !!full;
        members = full || (await fetchAll("member_pins", "*"));
      } catch (err) {
        console.error(err);
        toast("Couldn't load the map data. Refresh to try again.");
      }
    }
    refreshAreaSuggestions();
    updateSessionUi();
    render();
    if (!load.fitted) { load.fitted = true; fitAll(); }
  }

  function updateSessionUi() {
    const signedIn = DEMO ? false : !!session;
    $("open-join").hidden = signedIn && isMember;
    $("open-signin").hidden = DEMO || signedIn;
    $("session-bar").hidden = !signedIn;
    if (signedIn) {
      $("session-text").textContent = isMember
        ? `Signed in · ${session.user.email}`
        : `Signed in as ${session.user.email}, but not on the map yet`;
    }
  }

  // ---------- auth ----------
  if (sb) {
    sb.auth.onAuthStateChange((event, s) => {
      session = s;
      if (!["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT"].includes(event)) return;
      // Supabase deadlocks if its own calls are awaited inside this callback, so defer.
      setTimeout(async () => {
        await load();
        if (cameFromEmail && session && isMember) {
          cameFromEmail = false;
          const me = members.find((m) => m.id === s.user.id);
          if (me) { toast(`You're on the map, ${me.full_name.split(" ")[0]}!`); setTimeout(() => focusMember(me.id), 400); }
        }
      }, 0);
    });
    $("signout").addEventListener("click", () => sb.auth.signOut());
  } else {
    $("demo-flag").hidden = false;
    load();
  }

  // ---------- dialog ----------
  const dlg = $("dlg");
  function openStep(step) {
    ["join-form", "signin-form", "sent"].forEach((id) => ($(id).hidden = id !== step));
    if (!dlg.open) dlg.showModal();
  }
  $("open-join").addEventListener("click", () => openStep("join-form"));
  $("open-signin").addEventListener("click", () => openStep("signin-form"));
  $("dlg-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  // Join form: pickers
  const dialOpts = window.KIK_DIAL_CODES.map(([name, code], i) => [`+${code} ${name}`, `${code}:${i}`]);
  fillSelect($("f-phone-cc"), dialOpts); fillSelect($("f-wa-cc"), dialOpts);
  fillSelect($("f-category"), Object.keys(CATS).map((c) => [c, c]), "Select…");
  $("f-category").addEventListener("change", (e) => {
    const sub = $("f-sub");
    fillSelect(sub, (CATS[e.target.value] || []).map((s) => [s, s]), e.target.value ? "Select…" : "Select category first");
    sub.disabled = !e.target.value;
  });
  $("f-wa-same").addEventListener("change", (e) => { $("wa-block").hidden = e.target.checked; });

  function toE164(ccValue, raw) {
    const cc = ccValue.split(":")[0];
    let d = String(raw || "").replace(/\D/g, "");
    if (d.startsWith(cc) && d.length > 10) d = d.slice(cc.length); // pasted with country code
    d = d.replace(/^0+/, "");
    const full = cc + d;
    return full.length >= 8 && full.length <= 15 && d.length >= 6 ? "+" + full : null;
  }

  // Location autocomplete (OpenStreetMap / Photon). Members must pick a suggestion.
  let picked = null; let placeResults = []; let activeIdx = -1;
  const PLACE_TYPES = new Set(["city", "town", "village", "district", "locality", "suburb", "county", "neighbourhood", "hamlet", "borough", "quarter", "state", "other"]);
  const placeInput = $("f-place"); const placeList = $("place-list");

  function parsePlace(f) {
    const p = f.properties;
    const type = p.type || p.osm_value;
    const isLocal = ["district", "locality", "suburb", "neighbourhood", "quarter", "borough", "hamlet"].includes(type);
    const city = ["city", "town", "village"].includes(type) ? p.name : (p.city || p.county || "");
    const locality = isLocal ? p.name : (p.district || p.locality || "");
    const parts = [locality, city, p.state, p.country].filter((v, i, a) => v && a.indexOf(v) === i);
    return {
      place_label: parts.join(", "), locality, city, state: p.state || "", country: p.country || "",
      country_code: (p.countrycode || "").toUpperCase(),
      lat: +f.geometry.coordinates[1].toFixed(5), lng: +f.geometry.coordinates[0].toFixed(5),
    };
  }
  function showPlaces() {
    placeList.innerHTML = placeResults.map((r, i) => {
      const [head, ...rest] = r.place_label.split(", ");
      return `<li role="option" id="pl-${i}" data-i="${i}" aria-selected="${i === activeIdx}">${esc(head)}<small>${esc(rest.join(", "))}</small></li>`;
    }).join("");
    placeList.hidden = !placeResults.length;
    placeInput.setAttribute("aria-expanded", String(!placeList.hidden));
    placeInput.setAttribute("aria-activedescendant", activeIdx >= 0 ? `pl-${activeIdx}` : "");
  }
  function choosePlace(i) {
    picked = placeResults[i]; if (!picked) return;
    placeInput.value = picked.place_label;
    $("place-picked").hidden = false; $("place-picked").textContent = `✓ ${picked.place_label}`;
    placeResults = []; activeIdx = -1; showPlaces();
  }
  const searchPlaces = debounce(async (q) => {
    if (q.length < 3) { placeResults = []; showPlaces(); return; }
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en`);
      const json = await res.json();
      const seen = new Set();
      placeResults = json.features
        .filter((f) => PLACE_TYPES.has(f.properties.type) && f.properties.country)
        .map(parsePlace)
        .filter((r) => !seen.has(r.place_label) && seen.add(r.place_label))
        .slice(0, 6);
      activeIdx = placeResults.length ? 0 : -1;
      showPlaces();
    } catch { placeResults = []; showPlaces(); }
  }, 300);
  placeInput.addEventListener("input", () => {
    picked = null; $("place-picked").hidden = true; searchPlaces(placeInput.value.trim());
  });
  placeInput.addEventListener("keydown", (e) => {
    if (placeList.hidden) return;
    if (e.key === "ArrowDown") { activeIdx = Math.min(activeIdx + 1, placeResults.length - 1); showPlaces(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { activeIdx = Math.max(activeIdx - 1, 0); showPlaces(); e.preventDefault(); }
    else if (e.key === "Enter") { choosePlace(activeIdx); e.preventDefault(); }
    else if (e.key === "Escape") { placeResults = []; showPlaces(); e.stopPropagation(); e.preventDefault(); }
  });
  placeList.addEventListener("mousedown", (e) => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); choosePlace(+li.dataset.i); } });
  placeInput.addEventListener("blur", () => setTimeout(() => { placeResults = []; showPlaces(); }, 120));

  // Submit
  let pendingDemo = null;
  $("join-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("join-error"); err.hidden = true;
    const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el?.focus(); };

    const full_name = $("f-name").value.trim().replace(/\s+/g, " ");
    const email = $("f-email").value.trim().toLowerCase();
    const phone = toE164($("f-phone-cc").value, $("f-phone").value);
    const whatsapp = $("f-wa-same").checked ? phone : toE164($("f-wa-cc").value, $("f-wa").value);
    const business_name = $("f-business").value.trim().replace(/\s+/g, " ");
    const category = $("f-category").value; const subcategory = $("f-sub").value;

    if (full_name.length < 2) return fail("Enter your full name.", $("f-name"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Enter a valid email address. That's where your confirmation link goes.", $("f-email"));
    if (!phone) return fail("Enter your phone number without the country code, e.g. 98765 43210.", $("f-phone"));
    if (!whatsapp) return fail("Enter your WhatsApp number, or tick “same as phone”.", $("f-wa"));
    if (business_name.length < 2) return fail("Enter your business or company name.", $("f-business"));
    if (!category) return fail("Pick a business category.", $("f-category"));
    if (!subcategory) return fail("Pick your speciality.", $("f-sub"));
    if (!picked) return fail("Start typing your area or city and choose it from the list.", placeInput);
    if (!$("f-consent").checked) return fail("Tick the consent box to be listed on the map.", $("f-consent"));

    const meta = { kik_signup: "true", full_name, phone, whatsapp, business_name, category, subcategory, ...picked };
    const btn = $("join-submit"); btn.disabled = true; btn.textContent = "Sending…";
    try {
      if (DEMO) {
        pendingDemo = { ...meta, id: "local-" + Date.now(), email, mine: true };
      } else {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: REDIRECT, shouldCreateUser: true, data: meta } });
        if (error) throw error;
      }
      $("sent-email").textContent = email;
      $("sent-copy").textContent = "Click it to confirm, and your pin will appear on the map.";
      $("demo-confirm").hidden = !DEMO;
      openStep("sent");
      $("join-form").reset(); picked = null; $("place-picked").hidden = true; $("wa-block").hidden = true;
      $("f-sub").disabled = true;
    } catch (ex) {
      fail(/rate|limit/i.test(ex.message) ? "Too many emails were requested just now. Wait a minute and try again." : `We couldn't send the email: ${ex.message}`);
    } finally {
      btn.disabled = false; btn.textContent = "Send my confirmation email";
    }
  });

  $("demo-confirm").addEventListener("click", () => {
    if (!pendingDemo) return;
    const added = [...(store.get("kik-demo-added") || []), pendingDemo];
    store.set("kik-demo-added", added);
    members.push(pendingDemo); refreshAreaSuggestions();
    $("clear-filters").click(); // re-renders with no filters so the new pin is visible
    dlg.close();
    toast(`Email confirmed. You're on the map, ${pendingDemo.full_name.split(" ")[0]}!`);
    const id = pendingDemo.id; pendingDemo = null;
    setTimeout(() => focusMember(id), 300);
  });

  $("signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("signin-error"); err.hidden = true;
    const email = $("s-email").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = "Enter a valid email address."; err.hidden = false; return; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: REDIRECT, shouldCreateUser: false } });
    if (error) {
      err.textContent = /signups not allowed|not found/i.test(error.message)
        ? "No member uses this email. Choose “Add me to the map” to join."
        : `We couldn't send the email: ${error.message}`;
      err.hidden = false; return;
    }
    $("sent-email").textContent = email;
    $("sent-copy").textContent = "Click it to sign in and see members' contact details.";
    $("demo-confirm").hidden = true;
    openStep("sent");
  });
})();
