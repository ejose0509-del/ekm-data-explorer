// ---------- Private autosave: work is kept automatically, readable only by the person who made it ----------
// Three places, all private to the user: this browser's storage (small projects), this browser's IndexedDB (large
// projects), and, inside Claude, the person's own storage area data/users/<id>, which nobody else can read,
// including the page owner. Nothing is ever shared unless the person shares it explicitly.
var AUTO = {savedAt: "", where: "", cloudAt: "", cloudMsg: "", timer: null, cloudTimer: null, lastCloud: "", confirmDelete: false, CLOUD_MAX: 8e6};
try { if (localStorage.getItem("ekm-remember") === null) PROJECT.remember = true; } catch (e) {}   // on by default; "off" is remembered

// ---- IndexedDB for projects too large for localStorage ----
function idb(mode, fn) {
  return new Promise(function (ok, no) {
    var req; try { req = indexedDB.open("ekm", 1); } catch (e) { no(e); return; }
    req.onupgradeneeded = function () { req.result.createObjectStore("projects"); };
    req.onerror = function () { no(req.error); };
    req.onsuccess = function () { var db = req.result, tx = db.transaction("projects", mode), st2 = tx.objectStore("projects"), r = fn(st2); tx.oncomplete = function () { db.close(); ok(r && r.result); }; tx.onerror = function () { db.close(); no(tx.error); }; };
  });
}
var _cacheProjectA = cacheProject;
cacheProject = function () {
  var before = PROJECT.last;
  _cacheProjectA();
  if (!PROJECT.remember) return;
  var full = /unavailable or full/.test(PROJECT.storageMessage || "");
  if (!full && PROJECT.last !== before && /Saved in this browser/.test(PROJECT.storageMessage || "")) { AUTO.savedAt = new Date().toISOString(); AUTO.where = "this browser"; try { localStorage.setItem("ekm-project-saved-at", AUTO.savedAt); localStorage.removeItem("ekm-project-in-idb"); } catch (e) {} }
  if (full) {   // too big for localStorage: keep it in IndexedDB instead (debounced; snapshots of large projects are slow)
    clearTimeout(AUTO.timer);
    AUTO.timer = setTimeout(function () {
      var text; try { text = JSON.stringify(projectSnapshot()); } catch (e) { return; }
      if (text === AUTO.idbText) { PROJECT.storageMessage = "Saved automatically in this browser. Only you can see it."; return; }
      var at = new Date().toISOString();
      idb("readwrite", function (s) { return s.put({text: text, savedAt: at}, "current"); }).then(function () { AUTO.savedAt = at; AUTO.idbText = text; AUTO.where = "this browser (large-project storage)"; PROJECT.storageMessage = "Saved automatically in this browser. Only you can see it."; try { localStorage.setItem("ekm-project-in-idb", at); localStorage.removeItem(PROJECT.key); } catch (e) {} if (st.tab === "settings") render(); })
        .catch(function () { PROJECT.storageMessage = "This browser has no room left to keep the project. Save a project file to keep your work."; });
    }, 1500);
  }
  scheduleCloud();
};
// A large project saved in IndexedDB is restored after the page starts
function restoreFromIdb() {
  var mark = null; try { mark = localStorage.getItem("ekm-project-in-idb"); } catch (e) {}
  if (!mark || A.sets.length || !PROJECT.remember) return;
  idb("readonly", function (s) { return s.get("current"); }).then(function (v) { if (!v || A.sets.length) return; try { restoreProject(JSON.parse(v.text)); AUTO.savedAt = v.savedAt; AUTO.where = "this browser (large-project storage)"; render(); } catch (e) {} }).catch(function () {});
}
setTimeout(restoreFromIdb, 0);

// ---- Private cloud copy inside Claude: data/users/<id>, readable only by this person ----
function cloudReady() { return ST.on && ST.db && ST.uid; }
function scheduleCloud() {
  if (!cloudReady() || !PROJECT.remember) return;
  clearTimeout(AUTO.cloudTimer);
  AUTO.cloudTimer = setTimeout(saveCloud, 4000);
}
function saveCloud() {
  if (!cloudReady() || !PROJECT.remember) return;
  var text; try { text = JSON.stringify(projectSnapshot()); } catch (e) { return; }
  if (text === AUTO.lastCloud) return;
  if (text.length > AUTO.CLOUD_MAX) { AUTO.cloudMsg = "This project is " + (text.length / 1e6).toFixed(1) + " MB, over the 8 MB limit for your private Claude storage. It is still saved in this browser."; return; }
  var col2 = ST.db.collection("data/users/" + ST.uid), parts = [], CH = 180000, at = new Date().toISOString();
  for (var i = 0; i < text.length; i += CH) parts.push(text.slice(i, i + CH));
  Promise.all(parts.map(function (p, k) { return col2.doc("project_p" + k).set({kind: "project-part", part: p}); }))
    .then(function () { return col2.doc("project").set({kind: "project", parts: parts.length, savedAt: at, size: text.length}); })
    .then(function () { AUTO.lastCloud = text; AUTO.cloudAt = at; AUTO.cloudMsg = ""; if (st.tab === "settings") render(); })
    .catch(function () { AUTO.cloudMsg = "Could not reach your private Claude storage just now. Your work is still saved in this browser."; });
}
// When the page opens in Claude with nothing saved in this browser, bring back the private cloud copy
function restoreCloud() {
  if (!cloudReady() || !PROJECT.remember) return;
  var col2 = ST.db.collection("data/users/" + ST.uid);
  col2.doc("project").get().then(function (m) {
    if (!m.exists) return; var meta = m.data() || {}, local = ""; try { local = localStorage.getItem("ekm-project-saved-at") || localStorage.getItem("ekm-project-in-idb") || ""; } catch (e) {}
    AUTO.cloudAt = meta.savedAt || "";
    if (local && local >= meta.savedAt && A.sets.length) return;   // this browser already has the newer copy
    return Promise.all(Array.apply(null, Array(meta.parts || 0)).map(function (_, k) { return col2.doc("project_p" + k).get(); })).then(function (snaps) {
      var text = snaps.map(function (s) { return s.exists ? String((s.data() || {}).part || "") : ""; }).join("");
      restoreProject(JSON.parse(text)); AUTO.lastCloud = text; PROJECT.message = "Your work was restored from your private storage."; render();
    });
  }).catch(function () {});
}
(function waitForStorage(tries) { if (ST.on) { restoreCloud(); return; } if (tries > 40) return; setTimeout(function () { waitForStorage(tries + 1); }, 250); })(0);

// ---- Delete everything saved for this person ----
function deleteSaved() {
  PROJECT.remember = false;
  try { localStorage.setItem("ekm-remember", "off"); localStorage.removeItem(PROJECT.key); localStorage.removeItem("ekm-project-saved-at"); localStorage.removeItem("ekm-project-in-idb"); Object.keys(localStorage).filter(function (k) { return k.indexOf(PROJECT.key + "-draft-") === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  idb("readwrite", function (s) { return s.delete("current"); }).catch(function () {});
  var done = function () { AUTO.savedAt = ""; AUTO.cloudAt = ""; AUTO.lastCloud = ""; AUTO.confirmDelete = false; PROJECT.storageMessage = "Saved copies deleted. Your current tab is unchanged; automatic saving is off."; auditLog("Deleted saved copies", null, cloudReady() ? "browser and private Claude storage" : "this browser"); render(); };
  if (!cloudReady()) { done(); return; }
  var col2 = ST.db.collection("data/users/" + ST.uid);
  col2.doc("project").get().then(function (m) { var n = m.exists ? (m.data() || {}).parts || 0 : 0, ops = [col2.doc("project").delete()]; for (var k = 0; k < n; k++) ops.push(col2.doc("project_p" + k).delete()); return Promise.all(ops); }).then(done, done);
}

// ---- Settings: the autosave section replaces the plain "keep in this browser" checkbox ----
function when(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString([], {hour: "2-digit", minute: "2-digit", day: "numeric", month: "short"}); }
function autosaveSection() {
  var on = PROJECT.remember, cloud = cloudReady();
  return '<section class="set-sec" aria-labelledby="s-save"><h2 id="s-save">Save my work automatically</h2>' +
    '<label class="chk"><input type="checkbox" data-autosave="1"' + (on ? " checked" : "") + "> Keep my datasets, results and report automatically</label>" +
    '<p class="count">Private: only you can open what is saved. Other users cannot, and neither can the owner of this page. ' + (cloud ? "It is kept in this browser and in your own private Claude storage, so it follows you to other devices where you use Claude." : "It is kept in this browser on this device. To keep a copy elsewhere, save a project file.") + "</p>" +
    (on ? '<p class="count" role="status">' + (AUTO.savedAt ? "Last saved " + esc(when(AUTO.savedAt)) + " in " + esc(AUTO.where || "this browser") + "." : "Saves as soon as you add or change something.") + (cloud && AUTO.cloudAt ? " Private Claude copy: " + esc(when(AUTO.cloudAt)) + "." : "") + "</p>" : '<p class="warn">Automatic saving is off. Save a project file before closing the page, or your work will be lost.</p>') +
    (AUTO.cloudMsg ? '<p class="warn">' + esc(AUTO.cloudMsg) + "</p>" : "") +
    '<p class="count">Patient data: EKM never sends your data anywhere you have not chosen. Remove names and other identifiers before analysis where you can, and follow your institution\'s data rules.</p>' +
    (AUTO.confirmDelete ? '<div class="slot"><span class="warn">Delete every saved copy' + (cloud ? " (browser and private Claude storage)" : "") + '? Your open work stays until you close the page.</span><button type="button" class="btn" data-autodel="yes">Delete saved copies</button><button type="button" class="btn" data-autodel="no">Keep them</button></div>' : '<div class="slot"><button type="button" class="btn" data-autodel="ask">Delete my saved copies</button></div>') + "</section>";
}
var _settingsViewA = VIEWS.settings;
VIEWS.settings = function () {
  var h = _settingsViewA();
  h = h.replace(/<label class="chk"><input type="checkbox" id="project-remember"[^>]*> Keep my project in this browser between visits<\/label>/, "").replace(/<div class="slot"><button type="button" class="btn" data-project-clear="1">[^<]*<\/button><\/div>/, "");
  return h.replace(/(<section class="set-sec" aria-labelledby="s-read">)/, autosaveSection() + "$1");
};
view.addEventListener("change", function (e) {
  var t = e.target; if (!t.dataset || !t.dataset.autosave) return;
  PROJECT.remember = t.checked; try { localStorage.setItem("ekm-remember", t.checked ? "on" : "off"); } catch (err) {}
  auditLog(t.checked ? "Turned on automatic saving" : "Turned off automatic saving", null, ""); if (t.checked) { PROJECT.base = null; cacheProject(); saveCloud(); } render(); refocus("[data-autosave]");
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button[data-autodel]"); if (!b) return;
  if (b.dataset.autodel === "ask") { AUTO.confirmDelete = true; render(); refocus('[data-autodel="no"]'); }
  else if (b.dataset.autodel === "no") { AUTO.confirmDelete = false; render(); }
  else deleteSaved();
});
