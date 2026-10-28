// Lenovo IdeaPad Slim 5 14Q8X9 - Hardware & Peripheral Checkup Suite
let globalDiagnostics = null;
let interactiveState = {
  screenTested: false,
  keysTestedCount: 0,
  touchpadLeft: false,
  touchpadRight: false,
  touchpadMiddle: false,
  touchpadScroll: false,
  webcamTested: false,
  micPeakPercent: 0,
  speakersTested: false,
  checklist: {}
};

// 1. TAB NAVIGATION
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add("active");
  });
});

// 2. LOAD BACKEND TELEMETRY
async function loadDiagnostics(forceRefresh = false) {
  const alertsList = document.getElementById("alerts-list");
  if (forceRefresh) {
    alertsList.innerHTML = `<div class="loading-skeleton">Riscansione hardware WMI, SMART e Batteria in corso...</div>`;
  }
  try {
    const res = await fetch(`/api/diagnostics${forceRefresh ? "?refresh=1" : ""}`);
    const data = await res.json();
    globalDiagnostics = data;
    renderOverview(data);
    renderPeripherals(data);
  } catch (err) {
    alertsList.innerHTML = `<div class="alert-item danger"><strong>Errore comunicazione Backend</strong><span>${err.message}</span></div>`;
  }
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object" && Object.keys(v).length > 0) return [v];
  return [];
}

function addSpecRow(dl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value !== undefined && value !== null && value !== "" ? String(value) : "N/D";
  dl.appendChild(dt);
  dl.appendChild(dd);
}

function renderOverview(data) {
  const hw = data.hardware || {};
  const cs = hw.ComputerSystem || {};
  const prod = hw.Product || {};
  const bios = hw.BIOS || {};
  const os = hw.OS || {};
  const cpus = asArray(hw.CPUs);
  const cpu = cpus[0] || {};
  const bat = data.battery_report || {};

  // Score
  const scoreBadge = document.getElementById("score-badge");
  scoreBadge.textContent = `${data.score}`;
  scoreBadge.style.borderColor =
    data.score >= 85 ? "var(--ok)" : data.score >= 70 ? "var(--warn)" : "var(--danger)";

  // Alerts
  const alertsList = document.getElementById("alerts-list");
  alertsList.innerHTML = "";
  asArray(data.alerts).forEach((a) => {
    const div = document.createElement("div");
    div.className = `alert-item ${a.level}`;
    div.innerHTML = `<strong>${a.title}</strong><span>${a.detail}</span>`;
    alertsList.appendChild(div);
  });

  // System & CPU Specs
  document.getElementById("arch-badge").textContent = os.OSArchitecture || data.architecture_runtime || "WIN";
  const dlSys = document.getElementById("spec-system");
  dlSys.innerHTML = "";
  addSpecRow(dlSys, "Produttore", cs.Manufacturer || prod.Vendor);
  addSpecRow(dlSys, "Modello / Famiglia", `${cs.Model || ""} (${prod.Version || cs.SystemFamily || ""})`);
  addSpecRow(dlSys, "Numero Seriale", bios.SerialNumber || prod.IdentifyingNumber);
  addSpecRow(dlSys, "Versione BIOS", bios.SMBIOSBIOSVersion);
  addSpecRow(dlSys, "Processore (SoC)", cpu.Name);
  addSpecRow(dlSys, "Core / Thread", `${cpu.NumberOfCores || "?"} Core / ${cpu.NumberOfLogicalProcessors || "?"} Thread`);
  addSpecRow(dlSys, "Freq. Base / Max", cpu.MaxClockSpeed ? `${cpu.MaxClockSpeed} MHz` : "N/D");
  addSpecRow(dlSys, "Sistema Operativo", `${os.Caption || "Windows"} (Build ${os.BuildNumber || "?"})`);

  // Battery Specs
  const dlBat = document.getElementById("spec-battery");
  dlBat.innerHTML = "";
  const batBadge = document.getElementById("bat-verdict-badge");
  const batPctEl = document.getElementById("bat-health-pct");
  const batFillEl = document.getElementById("bat-health-fill");

  if (bat.present) {
    const health = bat.health_percent ?? 100;
    batPctEl.textContent = `${health}% (Usura: ${bat.wear_percent ?? 0}%)`;
    batFillEl.style.width = `${Math.min(100, health)}%`;
    batFillEl.style.background =
      health >= 85 ? "var(--ok)" : health >= 75 ? "var(--warn)" : "var(--danger)";
    batBadge.textContent = bat.status_verdict || "RILEVATA";
    batBadge.className = `badge ${health >= 85 ? "badge-ok" : health >= 75 ? "badge-warn" : "badge-danger"}`;

    addSpecRow(dlBat, "Capacita' Fabbrica", `${bat.design_capacity_mwh} mWh (${(bat.design_capacity_mwh / 1000).toFixed(1)} Wh)`);
    addSpecRow(dlBat, "Capacita' Attuale", `${bat.full_charge_capacity_mwh} mWh (${(bat.full_charge_capacity_mwh / 1000).toFixed(1)} Wh)`);
    addSpecRow(dlBat, "Salute / Usura", `Salute ${health}% • Usura ${bat.wear_percent ?? 0}%`);
    addSpecRow(dlBat, "Cicli di Carica", bat.cycle_count !== null && bat.cycle_count !== undefined ? bat.cycle_count : "Non esposto dal firmware");
    if (bat.voltage_mv) {
      addSpecRow(dlBat, "Tensione Attuale", `${(bat.voltage_mv / 1000).toFixed(2)} V (${bat.voltage_mv} mV)`);
    }
    if (bat.charge_rate_mw || bat.discharge_rate_mw) {
      const rateW = ((bat.charge_rate_mw || bat.discharge_rate_mw || 0) / 1000).toFixed(1);
      addSpecRow(dlBat, "Potenza Istantanea", `${rateW} W (${bat.charge_rate_mw ? "In carica" : "Scarica"})`);
    }
    addSpecRow(dlBat, "Chimica / Produttore", `${bat.chemistry || "LiP"} / ${bat.manufacturer || "OEM"}`);
    addSpecRow(dlBat, "Part ID / Seriale", `${bat.id || "OEM"} / ${bat.serial_number || "N/D"}`);
  } else {
    batPctEl.textContent = "Non rilevata";
    batFillEl.style.width = "0%";
    batBadge.textContent = "ASSENTE / DESKTOP";
    batBadge.className = "badge badge-warn";
    addSpecRow(dlBat, "Stato", "Nessuna batteria rilevata su questo sistema.");
  }

  // Disks & SMART
  const diskBox = document.getElementById("spec-disks");
  diskBox.innerHTML = "";
  const disks = asArray(hw.PhysicalDisks);
  const vols = asArray(hw.Volumes);
  const diskBadge = document.getElementById("disk-verdict-badge");
  const allHealthy = disks.every((d) => (d.HealthStatus || "").toUpperCase() === "HEALTHY");
  diskBadge.textContent = disks.length ? (allHealthy ? "SMART OK" : "ATTENZIONE") : "N/D";
  diskBadge.className = `badge ${allHealthy ? "badge-ok" : "badge-danger"}`;

  disks.forEach((d) => {
    const dl = document.createElement("dl");
    dl.className = "spec-list";
    dl.style.marginBottom = "0.75rem";
    addSpecRow(dl, "Modello Disco", `${d.FriendlyName} (${d.SizeGB} GB)`);
    addSpecRow(dl, "Bus / Tipo", `${d.BusType} / ${d.MediaType}`);
    addSpecRow(dl, "Salute SMART", `${d.HealthStatus} (${d.OperationalStatus})`);
    addSpecRow(dl, "Firmware", d.FirmwareVersion);
    if (d.TemperatureC !== null && d.TemperatureC !== undefined) {
      addSpecRow(dl, "Temperatura", `${d.TemperatureC} °C`);
    }
    if (d.PowerOnHours !== null && d.PowerOnHours !== undefined) {
      addSpecRow(dl, "Ore di Vita (POH)", `${d.PowerOnHours} ore (~${Math.round(d.PowerOnHours / 24)} giorni)`);
    }
    if (d.WearPercent !== null && d.WearPercent !== undefined) {
      addSpecRow(dl, "Usura SSD", `${d.WearPercent}%`);
    }
    diskBox.appendChild(dl);
  });

  vols.forEach((v) => {
    const p = document.createElement("div");
    p.className = "muted";
    p.style.marginTop = "0.3rem";
    p.innerHTML = `Partizione <strong>${v.DeviceID}</strong> (${v.FileSystem || "NTFS"}): liberi <strong>${v.FreeGB} GB</strong> su ${v.SizeGB} GB (${v.UsedPercent}% occupato)`;
    diskBox.appendChild(p);
  });

  // GPU, Display & RAM
  const dlGpu = document.getElementById("spec-gpu-ram");
  dlGpu.innerHTML = "";
  const gpus = asArray(hw.GPUs);
  gpus.forEach((g, idx) => {
    addSpecRow(dlGpu, `GPU #${idx + 1}`, g.Name);
    addSpecRow(dlGpu, "Driver GPU", g.DriverVersion);
    if (g.CurrentHorizontalResolution) {
      addSpecRow(dlGpu, "Risoluzione Attiva", `${g.CurrentHorizontalResolution} x ${g.CurrentVerticalResolution} @ ${g.CurrentRefreshRate || 60} Hz`);
    }
  });
  addSpecRow(dlGpu, "RAM Totale", `${data.live?.ram_total_gb || "?"} GB`);
  const ramSticks = asArray(hw.RAM);
  if (ramSticks.length > 0) {
    const speeds = ramSticks.map((r) => r.ConfiguredClockSpeed || r.Speed).filter(Boolean);
    addSpecRow(dlGpu, "Moduli / Velocita'", `${ramSticks.length} banchi @ ${speeds[0] || "LPDDR5x"} MT/s`);
  }

  // Security, TPM & License
  const dlSec = document.getElementById("spec-security");
  dlSec.innerHTML = "";
  const lic = hw.License || {};
  const tpm = hw.TPM || {};
  addSpecRow(dlSec, "Licenza Windows", lic.LicenseStatus === 1 ? `Attiva (${lic.Name})` : "Non attiva / Da verificare");
  addSpecRow(dlSec, "Product Key Finale", lic.PartialProductKey || "OEM BIOS Embedded");
  addSpecRow(dlSec, "TPM 2.0", tpm.IsActivated_InitialValue ? `Attivo (Spec: ${tpm.SpecVersion || "2.0"})` : "Non rilevato / Richiede privilegi");
  addSpecRow(dlSec, "UUID Scheda Madre", prod.UUID);

  // Originality & Replaced Parts Table
  const origWrap = document.getElementById("originality-table-wrap");
  const origBadge = document.getElementById("orig-summary-badge");
  const checks = asArray(data.originality_checks);
  if (origWrap) {
    const allOk = checks.every((c) => c.badge === "ok");
    origBadge.textContent = allOk ? "100% COMPONENTI ORIGINALI OEM" : "VERIFICA RICAMBI / OEM";
    origBadge.className = `badge ${allOk ? "badge-ok" : "badge-warn"}`;

    const rowsHtml = checks
      .map(
        (c) => `
      <tr>
        <td><strong>${c.component}</strong></td>
        <td>${c.detected}</td>
        <td class="muted">${c.expected}</td>
        <td><span class="badge badge-${c.badge}">${c.status}</span></td>
        <td class="muted">${c.note}</td>
      </tr>`
      )
      .join("");

    origWrap.innerHTML = `
      <table class="dev-table">
        <thead>
          <tr>
            <th>Componente</th>
            <th>Rilevato nel PC</th>
            <th>Specifica Originale Lenovo 14Q8X9</th>
            <th>Verdetto</th>
            <th>Dettagli Tecnici</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }
}

function renderPeripherals(data) {
  const hw = data.hardware || {};
  const errs = asArray(hw.DeviceErrors);
  const errBadge = document.getElementById("pnp-err-count");
  const errBox = document.getElementById("pnp-errors-box");

  errBadge.textContent = `${errs.length} anomalie`;
  errBadge.className = `badge ${errs.length === 0 ? "badge-ok" : "badge-warn"}`;

  if (errs.length === 0) {
    errBox.innerHTML = `<p class="muted" style="color:#4ade80;">✔ Tutte le periferiche PnP rispondono correttamente (nessun punto esclamativo giallo in Gestione Dispositivi).</p>`;
  } else {
    let rows = errs
      .map(
        (e) =>
          `<tr><td>${e.Class || "-"}</td><td><strong>${e.FriendlyName || e.InstanceId}</strong></td><td><span class="badge badge-warn">Codice ${e.ConfigManagerErrorCode} (${e.Status})</span></td></tr>`
      )
      .join("");
    errBox.innerHTML = `<table class="dev-table"><thead><tr><th>Classe</th><th>Dispositivo</th><th>Stato</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Subsystems
  const subs = hw.Subsystems || {};
  const categories = [
    { key: "NPU", title: "Acceleratore AI / Qualcomm Hexagon NPU" },
    { key: "NetworkBluetooth", title: "Schede di Rete Wi-Fi 7 & Bluetooth" },
    { key: "Cameras", title: "Fotocamere & Sensori Ottici" },
    { key: "Audio", title: "Controller Audio, Microfoni & Speaker" },
    { key: "Biometrics", title: "Sensori Biometrici (Impronte / Hello)" },
    { key: "USB", title: "Controller USB4 / Type-C & Host" },
  ];

  const grid = document.getElementById("subsystems-grid");
  grid.innerHTML = "";
  categories.forEach((cat) => {
    const items = asArray(subs[cat.key]);
    const card = document.createElement("div");
    card.className = "card";
    const listHtml =
      items.length === 0
        ? `<p class="muted">Nessun dispositivo specifico enumerato in questa classe.</p>`
        : `<table class="dev-table"><thead><tr><th>Nome Periferica</th><th>Stato</th></tr></thead><tbody>${items
            .map(
              (item) =>
                `<tr><td>${item.FriendlyName || "-"}</td><td><span class="badge ${
                  item.Status === "OK" ? "badge-ok" : "badge-warn"
                }">${item.Status || "OK"}</span></td></tr>`
            )
            .join("")}</tbody></table>`;
    card.innerHTML = `
      <div class="card-header">
        <h3>${cat.title}</h3>
        <span class="badge">${items.length} rilevati</span>
      </div>
      ${listHtml}
    `;
    grid.appendChild(card);
  });
}

// 3. LIVE TELEMETRY POLL
async function pollLive() {
  try {
    const res = await fetch("/api/live");
    const d = await res.json();
    document.getElementById("live-cpu").textContent = `CPU: ${d.cpu_percent ?? 0}%`;
    document.getElementById("live-ram").textContent = `RAM: ${d.ram_percent ?? 0}%`;
    if (d.battery_percent !== null && d.battery_percent !== undefined) {
      const plug = d.power_plugged ? "⚡" : "🔋";
      document.getElementById("live-bat").textContent = `${plug} ${d.battery_percent}%`;
    } else {
      document.getElementById("live-bat").textContent = `AC`;
    }
  } catch (_) {}
}
setInterval(pollLive, 2500);

// 4. DISPLAY DEAD PIXEL & OLED UNIFORMITY TESTER
const pixelModes = [
  { name: "Rosso Puro (Verifica sub-pixel rossi)", bg: "#ff0000" },
  { name: "Verde Puro (Verifica sub-pixel verdi)", bg: "#00ff00" },
  { name: "Blu Puro (Verifica sub-pixel blu)", bg: "#0000ff" },
  { name: "Bianco Puro (Verifica aloni, macchie o pixel morti neri)", bg: "#ffffff" },
  { name: "Nero Puro (Verifica stuck pixel accesi o backlight bleed)", bg: "#000000" },
  { name: "Grigio 20% OLED (Verifica uniformita' pannello e burn-in)", bg: "#333333" },
  { name: "Grigio 50% (Verifica banding)", bg: "#7f7f7f" },
];
let currentPixelIdx = 0;
const overlay = document.getElementById("pixel-overlay");
const modeLabel = document.getElementById("pixel-mode-label");

function applyPixelMode(idx) {
  currentPixelIdx = (idx + pixelModes.length) % pixelModes.length;
  const m = pixelModes[currentPixelIdx];
  overlay.style.background = m.bg;
  modeLabel.textContent = `${currentPixelIdx + 1}/${pixelModes.length} — ${m.name}`;
}

function startPixelTest(startColor = null) {
  overlay.classList.remove("hidden");
  if (overlay.requestFullscreen) {
    overlay.requestFullscreen().catch(() => {});
  }
  if (startColor) {
    overlay.style.background = startColor;
    modeLabel.textContent = `Colore selezionato: ${startColor}`;
  } else {
    applyPixelMode(0);
  }
  overlay.focus();
}

function stopPixelTest() {
  overlay.classList.add("hidden");
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

document.getElementById("btn-start-pixel").addEventListener("click", () => startPixelTest());
document.getElementById("btn-mark-screen-ok").addEventListener("click", (e) => {
  interactiveState.screenTested = true;
  e.target.textContent = "✔ Schermo Verificato OK";
});

document.querySelectorAll("#quick-swatches button").forEach((btn) => {
  btn.addEventListener("click", () => startPixelTest(btn.dataset.color));
});

overlay.addEventListener("click", () => applyPixelMode(currentPixelIdx + 1));
window.addEventListener("keydown", (e) => {
  if (!overlay.classList.contains("hidden")) {
    if (e.key === "Escape") {
      stopPixelTest();
    } else if (e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      applyPixelMode(currentPixelIdx + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyPixelMode(currentPixelIdx - 1);
    }
  }
});

// Update screen resolution badge
document.getElementById("screen-res-badge").textContent = `${window.screen.width}x${window.screen.height} (${window.devicePixelRatio}x DPR)`;

// 5. TOUCHPAD CANVAS TESTER
const padCanvas = document.getElementById("touchpad-canvas");
const padCtx = padCanvas.getContext("2d");
let lastPt = null;

padCanvas.addEventListener("mousemove", (e) => {
  const rect = padCanvas.getBoundingClientRect();
  const scaleX = padCanvas.width / rect.width;
  const scaleY = padCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  padCtx.strokeStyle = "#38bdf8";
  padCtx.lineWidth = 2.5;
  padCtx.lineCap = "round";
  padCtx.beginPath();
  if (lastPt) {
    padCtx.moveTo(lastPt.x, lastPt.y);
  } else {
    padCtx.moveTo(x, y);
  }
  padCtx.lineTo(x, y);
  padCtx.stroke();
  lastPt = { x, y };
});

padCanvas.addEventListener("mouseleave", () => {
  lastPt = null;
});

padCanvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  if (e.button === 0) {
    interactiveState.touchpadLeft = true;
    const el = document.getElementById("pad-left");
    el.textContent = "✔ Click SX: OK";
    el.classList.add("passed");
  } else if (e.button === 1) {
    interactiveState.touchpadMiddle = true;
    const el = document.getElementById("pad-middle");
    el.textContent = "✔ Click Centrale: OK";
    el.classList.add("passed");
  } else if (e.button === 2) {
    interactiveState.touchpadRight = true;
    const el = document.getElementById("pad-right");
    el.textContent = "✔ Click DX: OK";
    el.classList.add("passed");
  }
});

padCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

padCanvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  interactiveState.touchpadScroll = true;
  const el = document.getElementById("pad-scroll");
  el.textContent = `✔ Scroll 2 Dita: OK (ΔY ${Math.round(e.deltaY)})`;
  el.classList.add("passed");
});

document.getElementById("btn-clear-pad").addEventListener("click", () => {
  padCtx.clearRect(0, 0, padCanvas.width, padCanvas.height);
});

// 6. KEYBOARD MATRIX TESTER
const kbLayout = [
  [
    { code: "Escape", label: "Esc" },
    { code: "F1", label: "F1" },
    { code: "F2", label: "F2" },
    { code: "F3", label: "F3" },
    { code: "F4", label: "F4" },
    { code: "F5", label: "F5" },
    { code: "F6", label: "F6" },
    { code: "F7", label: "F7" },
    { code: "F8", label: "F8" },
    { code: "F9", label: "F9" },
    { code: "F10", label: "F10" },
    { code: "F11", label: "F11" },
    { code: "F12", label: "F12" },
    { code: "Insert", label: "Ins" },
    { code: "PrintScreen", label: "PrtSc" },
    { code: "Delete", label: "Canc" },
  ],
  [
    { code: "Backquote", label: "\\ |" },
    { code: "Digit1", label: "1" },
    { code: "Digit2", label: "2" },
    { code: "Digit3", label: "3" },
    { code: "Digit4", label: "4" },
    { code: "Digit5", label: "5" },
    { code: "Digit6", label: "6" },
    { code: "Digit7", label: "7" },
    { code: "Digit8", label: "8" },
    { code: "Digit9", label: "9" },
    { code: "Digit0", label: "0" },
    { code: "Minus", label: "' ?" },
    { code: "Equal", label: "ì ^" },
    { code: "Backspace", label: "Backspace", cls: "wide-20" },
  ],
  [
    { code: "Tab", label: "Tab", cls: "wide-15" },
    { code: "KeyQ", label: "Q" },
    { code: "KeyW", label: "W" },
    { code: "KeyE", label: "E" },
    { code: "KeyR", label: "R" },
    { code: "KeyT", label: "T" },
    { code: "KeyY", label: "Y" },
    { code: "KeyU", label: "U" },
    { code: "KeyI", label: "I" },
    { code: "KeyO", label: "O" },
    { code: "KeyP", label: "P" },
    { code: "BracketLeft", label: "è [" },
    { code: "BracketRight", label: "+ ]" },
    { code: "Enter", label: "Invio", cls: "wide-15" },
  ],
  [
    { code: "CapsLock", label: "BlocMaiusc", cls: "wide-20" },
    { code: "KeyA", label: "A" },
    { code: "KeyS", label: "S" },
    { code: "KeyD", label: "D" },
    { code: "KeyF", label: "F" },
    { code: "KeyG", label: "G" },
    { code: "KeyH", label: "H" },
    { code: "KeyJ", label: "J" },
    { code: "KeyK", label: "K" },
    { code: "KeyL", label: "L" },
    { code: "Semicolon", label: "ò @" },
    { code: "Quote", label: "à #" },
    { code: "Backslash", label: "ù §" },
  ],
  [
    { code: "ShiftLeft", label: "Shift SX", cls: "wide-15" },
    { code: "IntlBackslash", label: "< >" },
    { code: "KeyZ", label: "Z" },
    { code: "KeyX", label: "X" },
    { code: "KeyC", label: "C" },
    { code: "KeyV", label: "V" },
    { code: "KeyB", label: "B" },
    { code: "KeyN", label: "N" },
    { code: "KeyM", label: "M" },
    { code: "Comma", label: "," },
    { code: "Period", label: "." },
    { code: "Slash", label: "- _" },
    { code: "ShiftRight", label: "Shift DX", cls: "wide-25" },
  ],
  [
    { code: "ControlLeft", label: "Ctrl SX", cls: "wide-15" },
    { code: "MetaLeft", label: "Win" },
    { code: "AltLeft", label: "Alt" },
    { code: "Space", label: "Barra Spaziatrice", cls: "space" },
    { code: "AltRight", label: "AltGr" },
    { code: "ContextMenu", label: "Copilot/Menu" },
    { code: "ControlRight", label: "Ctrl DX" },
    { code: "ArrowLeft", label: "←" },
    { code: "ArrowUp", label: "↑" },
    { code: "ArrowDown", label: "↓" },
    { code: "ArrowRight", label: "→" },
  ],
];

const testedKeys = new Set();
const kbGrid = document.getElementById("keyboard-grid");

function buildKeyboard() {
  kbGrid.innerHTML = "";
  kbLayout.forEach((row) => {
    const rDiv = document.createElement("div");
    rDiv.className = "kb-row";
    row.forEach((k) => {
      const kDiv = document.createElement("div");
      kDiv.className = `kb-key ${k.cls || ""}`;
      kDiv.dataset.code = k.code;
      kDiv.textContent = k.label;
      rDiv.appendChild(kDiv);
    });
    kbGrid.appendChild(rDiv);
  });
}
buildKeyboard();

function handleKeyboardTestEvent(e) {
  const tabKb = document.getElementById("tab-display-kb");
  if (!tabKb || !tabKb.classList.contains("active") || !overlay.classList.contains("hidden")) return;

  // Blocca QUALSIASI azione predefinita del browser (F1-F12, F5 refresh, F11, F12 DevTools, Tab, Alt, Spazio, Backspace, Ctrl+R/W/T/F/S/P, ContextMenu, ecc.)
  e.preventDefault();
  e.stopPropagation();

  if (navigator.keyboard && typeof navigator.keyboard.lock === "function") {
    navigator.keyboard.lock().catch(() => {});
  }

  document.getElementById("last-key-code").textContent = `${e.key} (Code: ${e.code})`;
  const keyEl = kbGrid.querySelector(`[data-code="${e.code}"]`);
  if (keyEl) {
    if (e.type === "keydown") {
      keyEl.classList.add("active");
      keyEl.classList.add("tested");
    } else if (e.type === "keyup") {
      keyEl.classList.remove("active");
    }
  }
  if (e.type === "keydown") {
    testedKeys.add(e.code);
    interactiveState.keysTestedCount = testedKeys.size;
    document.getElementById("kb-counter").textContent = `${testedKeys.size} tasti verificati`;
  }
}

window.addEventListener("keydown", handleKeyboardTestEvent, { capture: true });
window.addEventListener("keyup", handleKeyboardTestEvent, { capture: true });

window.addEventListener(
  "contextmenu",
  (e) => {
    const tabKb = document.getElementById("tab-display-kb");
    if (tabKb && tabKb.classList.contains("active") && overlay.classList.contains("hidden")) {
      e.preventDefault();
    }
  },
  { capture: true }
);

document.getElementById("btn-reset-kb").addEventListener("click", () => {
  testedKeys.clear();
  interactiveState.keysTestedCount = 0;
  document.getElementById("kb-counter").textContent = "0 tasti verificati";
  kbGrid.querySelectorAll(".kb-key").forEach((el) => el.classList.remove("tested", "active"));
});

// 7. WEBCAM TESTER (LIVE + SNAPSHOT + 5s VIDEO/AUDIO RECORDING PLAYBACK)
let webcamStream = null;
const videoEl = document.getElementById("webcam-video");
const camPlaceholder = document.getElementById("webcam-placeholder");
const camBadge = document.getElementById("cam-status-badge");
const btnRecCam = document.getElementById("btn-rec-cam");
const btnSnapCam = document.getElementById("btn-snap-cam");
const camPlaybackBox = document.getElementById("cam-playback-box");
const camRecordedVideo = document.getElementById("cam-recorded-video");
const camSnapshotImg = document.getElementById("cam-snapshot-img");
const camPlaybackTitle = document.getElementById("cam-playback-title");

document.getElementById("btn-start-cam").addEventListener("click", async () => {
  try {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
    } catch (_) {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    }
    videoEl.srcObject = webcamStream;
    camPlaceholder.style.display = "none";
    document.getElementById("btn-stop-cam").disabled = false;
    btnRecCam.disabled = false;
    btnSnapCam.disabled = false;
    interactiveState.webcamTested = true;

    const track = webcamStream.getVideoTracks()[0];
    const settings = track.getSettings();
    camBadge.textContent = "Webcam Attiva";
    camBadge.className = "badge badge-ok";
    document.getElementById("cam-res-info").textContent = `${track.label} (${settings.width || "?"}x${settings.height || "?"} @ ${settings.frameRate || 30}fps)`;
  } catch (err) {
    camBadge.textContent = "Errore / Bloccata";
    camBadge.className = "badge badge-danger";
    camPlaceholder.textContent = `Impossibile accedere alla webcam: ${err.message}`;
  }
});

btnSnapCam.addEventListener("click", () => {
  if (!webcamStream) return;
  const c = document.createElement("canvas");
  c.width = videoEl.videoWidth || 1280;
  c.height = videoEl.videoHeight || 720;
  c.getContext("2d").drawImage(videoEl, 0, 0, c.width, c.height);
  camSnapshotImg.src = c.toDataURL("image/png");
  camPlaybackBox.style.display = "block";
  camRecordedVideo.style.display = "none";
  camRecordedVideo.pause();
  camSnapshotImg.style.display = "block";
  camPlaybackTitle.textContent = `📸 Foto Scattata (${c.width}x${c.height}) — Verifica nitidezza lente`;
});

btnRecCam.addEventListener("click", () => {
  if (!webcamStream) return;
  const chunks = [];
  let rec;
  try {
    rec = new MediaRecorder(webcamStream);
  } catch (err) {
    alert(`Registrazione video non supportata: ${err.message}`);
    return;
  }
  btnRecCam.disabled = true;
  let secLeft = 5;
  btnRecCam.textContent = `⏺️ Registrazione... (${secLeft}s)`;
  const timer = setInterval(() => {
    secLeft -= 1;
    if (secLeft > 0) {
      btnRecCam.textContent = `⏺️ Registrazione... (${secLeft}s)`;
    }
  }, 1000);

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    clearInterval(timer);
    btnRecCam.disabled = false;
    btnRecCam.textContent = "🔴 Registra Clip + Voce (5s)";
    const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
    const url = URL.createObjectURL(blob);
    camPlaybackBox.style.display = "block";
    camSnapshotImg.style.display = "none";
    camRecordedVideo.style.display = "block";
    camRecordedVideo.src = url;
    camPlaybackTitle.textContent = "🎬 Riproduzione Clip Video + Audio Registrata (5s):";
    camRecordedVideo.play().catch(() => {});
  };
  rec.start();
  setTimeout(() => {
    if (rec.state === "recording") rec.stop();
  }, 5000);
});

document.getElementById("btn-stop-cam").addEventListener("click", () => {
  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    webcamStream = null;
  }
  videoEl.srcObject = null;
  camPlaceholder.style.display = "block";
  camPlaceholder.textContent = "Webcam fermata.";
  document.getElementById("btn-stop-cam").disabled = true;
  btnRecCam.disabled = true;
  btnSnapCam.disabled = true;
});

// 8. STEREO SPEAKERS SYNTHESIZER (WEB AUDIO API)
function playStereoTone(panValue, isSweep = false) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();

  panner.pan.value = panValue;
  gain.gain.setValueAtTime(0.25, ctx.currentTime);

  if (isSweep) {
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 1.8);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.9);
    osc.connect(panner).connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.95);
  } else {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(panValue < 0 ? 440 : 660, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.connect(panner).connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.95);
  }

  interactiveState.speakersTested = true;
  const badge = document.getElementById("audio-status-badge");
  badge.textContent = "Audio Testato";
  badge.className = "badge badge-ok";
}

document.getElementById("btn-spk-left").addEventListener("click", () => playStereoTone(-1, false));
document.getElementById("btn-spk-right").addEventListener("click", () => playStereoTone(1, false));
document.getElementById("btn-spk-sweep").addEventListener("click", () => playStereoTone(0, true));

// 9. MICROPHONE FFT VISUALIZER + 4s VOICE RECORD & AUTO-PLAYBACK
let micStream = null;
let micAnimId = null;
let maxMicPeak = 0;
const btnRecMic = document.getElementById("btn-rec-mic");
const micPlaybackBox = document.getElementById("mic-playback-box");
const micRecordedAudio = document.getElementById("mic-recorded-audio");
const micRecStatus = document.getElementById("mic-rec-status");

function startMicTestRecording() {
  if (!micStream) return;
  const chunks = [];
  let rec;
  try {
    rec = new MediaRecorder(micStream);
  } catch (err) {
    alert(`Registrazione audio non supportata: ${err.message}`);
    return;
  }
  btnRecMic.disabled = true;
  let secLeft = 4;
  btnRecMic.textContent = `⏺️ Parla ora... (${secLeft}s)`;
  const timer = setInterval(() => {
    secLeft -= 1;
    if (secLeft > 0) {
      btnRecMic.textContent = `⏺️ Parla ora... (${secLeft}s)`;
    }
  }, 1000);

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    clearInterval(timer);
    btnRecMic.disabled = false;
    btnRecMic.textContent = "🔴 Registra & Riascolta (4s)";
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    const url = URL.createObjectURL(blob);
    micPlaybackBox.style.display = "block";
    micRecStatus.textContent = "🔊 Riproduzione della tua voce registrata (verifica pulizia e assenza fruscii):";
    micRecordedAudio.src = url;
    micRecordedAudio.play().catch(() => {});
  };
  rec.start();
  setTimeout(() => {
    if (rec.state === "recording") rec.stop();
  }, 4000);
}

document.getElementById("btn-start-mic").addEventListener("click", async () => {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const src = ctx.createMediaStreamSource(micStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);

    const bufLen = analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    const canvas = document.getElementById("mic-canvas");
    const cctx = canvas.getContext("2d");

    document.getElementById("btn-stop-mic").disabled = false;
    btnRecMic.disabled = false;

    function drawMic() {
      micAnimId = requestAnimationFrame(drawMic);
      analyser.getByteFrequencyData(dataArr);

      let sum = 0;
      for (let i = 0; i < bufLen; i++) sum += dataArr[i];
      const avg = Math.min(100, Math.round((sum / bufLen / 140) * 100));
      if (avg > maxMicPeak) maxMicPeak = avg;
      interactiveState.micPeakPercent = maxMicPeak;

      document.getElementById("mic-vol-label").textContent = `${avg}%`;
      document.getElementById("mic-peak-label").textContent = `${maxMicPeak}%`;

      cctx.fillStyle = "#090d14";
      cctx.fillRect(0, 0, canvas.width, canvas.height);

      const barW = (canvas.width / bufLen) * 2.2;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (dataArr[i] / 255) * canvas.height;
        cctx.fillStyle = barH > canvas.height * 0.6 ? "#22c55e" : "#38bdf8";
        cctx.fillRect(x, canvas.height - barH, barW, barH);
        x += barW + 1;
      }
    }
    drawMic();
    // Avvia subito una registrazione test di 4 secondi con riascolto automatico!
    startMicTestRecording();
  } catch (err) {
    alert(`Impossibile accedere al microfono: ${err.message}`);
  }
});

btnRecMic.addEventListener("click", () => startMicTestRecording());

document.getElementById("btn-stop-mic").addEventListener("click", () => {
  if (micAnimId) cancelAnimationFrame(micAnimId);
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  document.getElementById("btn-stop-mic").disabled = true;
  btnRecMic.disabled = true;
});

// 10. PHYSICAL CHECKLIST & EXPORT REPORT
document.querySelectorAll('#checklist-items input[type="checkbox"]').forEach((cb) => {
  cb.addEventListener("change", () => {
    interactiveState.checklist[cb.dataset.check] = cb.checked;
    const total = document.querySelectorAll('#checklist-items input[type="checkbox"]').length;
    const checked = document.querySelectorAll('#checklist-items input[type="checkbox"]:checked').length;
    document.getElementById("checklist-progress").textContent = `${checked} / ${total} completati`;
  });
});

document.getElementById("btn-refresh").addEventListener("click", () => loadDiagnostics(true));

document.getElementById("btn-export").addEventListener("click", () => {
  const report = {
    generated_at: new Date().toISOString(),
    target_device: "Lenovo IdeaPad Slim 5 14Q8X9 (Snapdragon X Plus)",
    system_diagnostics: globalDiagnostics,
    interactive_tests: interactiveState,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `checkup_lenovo_14Q8X9_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

// Initial load
loadDiagnostics(false);
pollLive();
