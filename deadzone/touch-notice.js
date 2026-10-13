/*
 * The desktop-only notice for phones and tablets (a touch screen and no mouse). It is a plain script, not part of the
 * game bundle, so it shows the moment the page is parsed instead of after the game has downloaded (the slowest part
 * on a phone), and its own styles put it above the loading screen (z-index 1000), which it leaves running underneath.
 * "Look around anyway" dismisses it for this tab.
 */
(function () {
  var touchOnly = false;
  try { touchOnly = matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches; } catch (e) { return; }
  if (!touchOnly) return;
  try { if (sessionStorage.getItem("deadzone.touch-ok")) return; } catch (e) { /* storage unavailable */ }
  var style = document.createElement("style");
  style.textContent =
    "#desktop-notice{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:24px 16px;background:#0e1316;color:#eef2f4;text-align:center;font-family:'Barlow Condensed','Barlow',system-ui,sans-serif}" +
    "#desktop-notice>div{max-width:420px;display:flex;flex-direction:column;align-items:center;gap:12px}" +
    "#desktop-notice .logo{font-weight:800;font-size:34px;letter-spacing:.08em}#desktop-notice .logo i{color:#f2b53c;font-style:normal;margin:0 2px}" +
    "#desktop-notice h2{margin:8px 0 0;font-weight:800;font-size:32px;line-height:1;letter-spacing:.08em;text-transform:uppercase}" +
    "#desktop-notice p{margin:0 0 8px;color:#9aa7ae;font-family:system-ui,sans-serif;font-size:15px;line-height:1.5}" +
    "#desktop-notice button{padding:12px 18px;border:1px solid rgba(238,242,244,.35);border-radius:4px;background:transparent;color:#eef2f4;font:700 16px 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}";
  document.head.appendChild(style);
  var notice = document.createElement("div");
  notice.id = "desktop-notice";
  notice.innerHTML = '<div><div class="logo"><span>DEAD</span><i>/</i><span>ZONE</span></div>' +
    "<h2>Desktop required</h2>" +
    "<p>The beta plays with a mouse and keyboard on a desktop or laptop (Chrome or Edge). Phone and tablet controls are coming after the beta.</p>" +
    '<button id="desktop-notice-ok" type="button">Look around anyway</button></div>';
  document.body.appendChild(notice);
  document.getElementById("desktop-notice-ok").onclick = function () {
    notice.remove();
    try { sessionStorage.setItem("deadzone.touch-ok", "1"); } catch (e) { /* storage unavailable */ }
  };
})();
