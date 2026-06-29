const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";
const SCOPES = "playlist-modify-private playlist-modify-public";
const STORAGE_KEY = "spotify3hour.form";
const TOKEN_KEY = "spotify3hour.token";
const PKCE_KEY = "spotify3hour.pkce";

const form = document.querySelector("#playlistForm");
const callbackNotice = document.querySelector("#callbackNotice");
const result = document.querySelector("#result");
const redirectUriEl = document.querySelector("#redirectUri");
const setupRedirectUriEl = document.querySelector("#setupRedirectUri");
const installButton = document.querySelector("#installButton");
const trackGroupsEl = document.querySelector("#trackGroups");

let deferredInstallPrompt = null;

function redirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function saveForm() {
  const data = getFormData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadForm() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const slots = savedSlots(data);
    slots.forEach((slot, slotIndex) => ensureSlotRows(slotIndex, Math.max(1, slot.length)));
    restoreSlotOrder(data.slotOrder);
    document.querySelector("#clientId").value = data.clientId || "";
    document.querySelector("#playlistName").value = data.playlistName || "3時間ループ";
    document.querySelector("#targetMinutes").value = data.targetMinutes || "180";
    document.querySelector("#bufferSeconds").value = data.bufferSeconds || "1";
    document.querySelector("#isPublic").checked = Boolean(data.isPublic);
    slots.forEach((slot, slotIndex) => {
      slotRows(slotIndex).forEach((row, rowIndex) => {
        row.querySelector("[name='trackUrl']").value = slot[rowIndex]?.url || "";
        row.querySelector("[name='duration']").value = slot[rowIndex]?.duration || "";
        setTrackArt(row, {
          title: slot[rowIndex]?.title || "",
          imageUrl: slot[rowIndex]?.imageUrl || "",
        });
      });
    });
    updateAllMoveButtons();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function updateClearButton(input) {
  const button = input.parentElement?.querySelector(".input-clear");
  if (button) button.hidden = !input.value;
}

function refreshClearButtons() {
  document.querySelectorAll(".clearable-input input").forEach(updateClearButton);
}

function installInputClearButton(input) {
  if (input.type === "checkbox") return;
  if (input.id === "clientId") return;
  if (input.closest(".clearable-input")) return;

  const wrapper = document.createElement("span");
  wrapper.className = "clearable-input";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "input-clear";
  button.textContent = "×";
  button.title = "入力を消去";
  button.setAttribute("aria-label", "入力を消去");
  button.hidden = !input.value;
  wrapper.appendChild(button);

  input.addEventListener("input", () => updateClearButton(input));
  button.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
}

function installInputClearButtons() {
  document.querySelectorAll("input:not([type='checkbox'])").forEach(installInputClearButton);
}

function normalizeDurationText(value) {
  const trimmed = value.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return trimmed;

  const secondsText = trimmed.length === 1 ? trimmed : trimmed.slice(-2);
  const minutesText = trimmed.length <= 2 ? "0" : trimmed.slice(0, -2);
  const seconds = Number(secondsText);
  if (seconds >= 60) return trimmed;

  return `${Number(minutesText)}:${String(seconds).padStart(2, "0")}`;
}

function normalizeDurationInput(input) {
  const normalized = normalizeDurationText(input.value);
  if (normalized !== input.value) {
    input.value = normalized;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function installDurationInput(input) {
  if (input.dataset.durationInstalled) return;
  input.dataset.durationInstalled = "true";
  input.addEventListener("blur", () => normalizeDurationInput(input));
}

function installDurationShorthand() {
  document.querySelectorAll("[name='duration']").forEach(installDurationInput);
}

function slotGroup(slotIndex) {
  return document.querySelector(`.track-group[data-slot="${slotIndex}"]`);
}

function slotGroups() {
  return Array.from(document.querySelectorAll(".track-group[data-slot]"));
}

function slotRows(slotIndex) {
  return Array.from(document.querySelectorAll(`.track-row[data-slot="${slotIndex}"]`));
}

function displaySlotNumber(slotIndex) {
  const index = slotGroups().indexOf(slotGroup(slotIndex));
  return index >= 0 ? index + 1 : slotIndex + 1;
}

function renumberSlotRows(slotIndex) {
  const rows = slotRows(slotIndex);
  const displayNumber = displaySlotNumber(slotIndex);
  rows.forEach((row, index) => {
    const trackLabel = row.querySelector("label:first-child");
    if (trackLabel?.firstChild) trackLabel.firstChild.textContent = `枠${displayNumber}-${index + 1}のURL`;
    const removeButton = row.querySelector(".remove-track");
    if (removeButton) removeButton.hidden = rows.length <= 1;
    const upButton = row.querySelector(".move-track[data-direction='-1']");
    const downButton = row.querySelector(".move-track[data-direction='1']");
    if (upButton) upButton.disabled = index === 0;
    if (downButton) downButton.disabled = index === rows.length - 1;
  });
}

function installTrackRowControls(row, slotIndex) {
  if (row.querySelector(".row-actions")) return;
  const controls = document.createElement("div");
  controls.className = "row-actions";
  controls.innerHTML = `
    <button type="button" class="icon-small move-track" data-direction="-1" title="上へ" aria-label="上へ">↑</button>
    <button type="button" class="icon-small move-track" data-direction="1" title="下へ" aria-label="下へ">↓</button>
    <button type="button" class="icon-small remove-track" title="この曲を削除" aria-label="この曲を削除">×</button>
  `;
  row.appendChild(controls);
  controls.querySelectorAll(".move-track").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.direction);
      moveTrackRow(row, slotIndex, direction);
    });
  });
  controls.querySelector(".remove-track").addEventListener("click", () => {
    if (slotRows(slotIndex).length <= 1) return;
    row.remove();
    renumberSlotRows(slotIndex);
    saveForm();
  });
}

function installTrackArt(row) {
  if (row.querySelector(".track-info")) return;
  const info = document.createElement("div");
  info.className = "track-info";
  info.setAttribute("aria-live", "polite");
  info.innerHTML = `
    <img class="track-art" alt="" hidden>
    <span class="track-message"></span>
  `;
  row.appendChild(info);
}

function installTrackRow(row, slotIndex) {
  row.querySelectorAll("input").forEach((input) => {
    installInputClearButton(input);
    if (input.name === "duration") installDurationInput(input);
  });
  installTrackRowControls(row, slotIndex);
  installTrackArt(row);
  const urlInput = row.querySelector("[name='trackUrl']");
  if (!urlInput.dataset.trackInfoInstalled) {
    urlInput.dataset.trackInfoInstalled = "true";
    urlInput.addEventListener("blur", () => refreshTrackInfoForRow(row, { silent: true }));
    urlInput.addEventListener("input", () => {
      if (!urlInput.value.trim()) setTrackArt(row, {});
    });
  }
}

function createTrackRow(slotIndex) {
  const row = document.createElement("div");
  row.className = "track-row";
  row.dataset.slot = String(slotIndex);
  row.innerHTML = `
    <label>
      枠${displaySlotNumber(slotIndex)}のURL
      <input name="trackUrl" required placeholder="https://open.spotify.com/track/...">
    </label>
    <label>
      長さ
      <input name="duration" placeholder="2:58">
    </label>
  `;
  installTrackRow(row, slotIndex);
  return row;
}

function ensureSlotRows(slotIndex, count) {
  const group = slotGroup(slotIndex);
  while (slotRows(slotIndex).length < count) {
    group.appendChild(createTrackRow(slotIndex));
  }
  while (slotRows(slotIndex).length > count && slotRows(slotIndex).length > 1) {
    slotRows(slotIndex).at(-1).remove();
  }
  renumberSlotRows(slotIndex);
}

function initializeTrackRows() {
  [0, 1, 2].forEach((slotIndex) => {
    slotRows(slotIndex).forEach((row) => installTrackRow(row, slotIndex));
    renumberSlotRows(slotIndex);
  });
  updateAllMoveButtons();
}

function moveTrackRow(row, slotIndex, direction) {
  const rows = slotRows(slotIndex);
  const index = rows.indexOf(row);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= rows.length) return;
  if (direction < 0) {
    rows[nextIndex].before(row);
  } else {
    rows[nextIndex].after(row);
  }
  renumberSlotRows(slotIndex);
  saveForm();
}

function restoreSlotOrder(slotOrder) {
  if (!Array.isArray(slotOrder)) return;
  const validOrder = slotOrder.map(Number).filter((slotIndex) => [0, 1, 2].includes(slotIndex));
  if (new Set(validOrder).size !== 3) return;
  validOrder.forEach((slotIndex) => {
    trackGroupsEl.appendChild(slotGroup(slotIndex));
  });
  trackGroupsEl.appendChild(document.querySelector(".loop-preview"));
  updateAllMoveButtons();
}

function moveSlot(group, direction) {
  const groups = slotGroups();
  const index = groups.indexOf(group);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= groups.length) return;
  if (direction < 0) {
    groups[nextIndex].before(group);
  } else {
    groups[nextIndex].after(group);
  }
  updateAllMoveButtons();
  saveForm();
}

function updateAllMoveButtons() {
  slotGroups().forEach((group, index, groups) => {
    const displayNumber = index + 1;
    const heading = group.querySelector("h3");
    const description = group.querySelector(".track-group-heading p");
    const addButton = group.querySelector(".add-track");
    if (heading) heading.textContent = `枠${displayNumber}`;
    if (description) description.textContent = `${displayNumber}番目に入ります。`;
    if (addButton) addButton.textContent = "追加";
    const leftButton = group.querySelector(".move-slot[data-direction='-1']");
    const rightButton = group.querySelector(".move-slot[data-direction='1']");
    if (leftButton) leftButton.disabled = index === 0;
    if (rightButton) rightButton.disabled = index === groups.length - 1;
  });
  [0, 1, 2].forEach(renumberSlotRows);
  updateLoopPreview();
}

function updateLoopPreview() {
  const preview = document.querySelector(".loop-preview");
  if (!preview) return;
  const labels = slotGroups().map((group) => {
    const slotIndex = Number(group.dataset.slot);
    return `枠${displaySlotNumber(slotIndex)}-1`;
  });
  preview.textContent = `再生順の例: ${labels.join(" → ")} → ${labels.map((label) => label.replace("-1", "-2")).join(" → ")}...`;
}

function savedSlots(data) {
  if (Array.isArray(data.slotsById)) {
    return [0, 1, 2].map((slotIndex) => data.slotsById[slotIndex] || []);
  }
  if (Array.isArray(data.slots)) {
    return [0, 1, 2].map((slotIndex) => data.slots[slotIndex] || []);
  }
  const urls = data.trackUrls || [];
  const durations = data.durations || [];
  return [
    [{ url: urls[0] || "", duration: durations[0] || "" }],
    [{ url: urls[1] || "", duration: durations[1] || "" }],
    urls.slice(2).map((url, index) => ({ url, duration: durations[index + 2] || "" })),
  ];
}

function readSlots() {
  return slotGroups().map((group) => Number(group.dataset.slot)).map((slotIndex) => (
    slotRows(slotIndex).map((row) => ({
      url: row.querySelector("[name='trackUrl']").value.trim(),
      duration: row.querySelector("[name='duration']").value.trim(),
      title: row.querySelector(".track-info")?.dataset.title || "",
      imageUrl: row.querySelector(".track-info")?.dataset.imageUrl || "",
    }))
  ));
}

function getFormData({ normalizeDurations = false } = {}) {
  if (normalizeDurations) {
    document.querySelectorAll("[name='duration']").forEach(normalizeDurationInput);
  }
  return {
    clientId: document.querySelector("#clientId").value.trim(),
    playlistName: document.querySelector("#playlistName").value.trim() || "3時間ループ",
    slots: readSlots(),
    slotsById: [0, 1, 2].map((slotIndex) => (
      slotRows(slotIndex).map((row) => ({
        url: row.querySelector("[name='trackUrl']").value.trim(),
        duration: row.querySelector("[name='duration']").value.trim(),
        title: row.querySelector(".track-info")?.dataset.title || "",
        imageUrl: row.querySelector(".track-info")?.dataset.imageUrl || "",
      }))
    )),
    slotOrder: slotGroups().map((group) => Number(group.dataset.slot)),
    trackUrls: Array.from(document.querySelectorAll("[name='trackUrl']")).map((input) => input.value.trim()),
    durations: Array.from(document.querySelectorAll("[name='duration']")).map((input) => input.value.trim()),
    targetMinutes: document.querySelector("#targetMinutes").value.trim() || "180",
    bufferSeconds: document.querySelector("#bufferSeconds").value.trim() || "1",
    isPublic: document.querySelector("#isPublic").checked,
  };
}

function parseTrackId(value) {
  if (value.startsWith("spotify:track:")) return value.split(":").pop();
  const match = value.match(/\/track\/([A-Za-z0-9]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9]{22}$/.test(value)) return value;
  throw new Error(`Spotifyの曲URLとして読み取れませんでした: ${value}`);
}

function parseDuration(value) {
  const trimmed = normalizeDurationText(value);
  const parts = trimmed.split(":").map((part) => Number(part));
  if (![2, 3].includes(parts.length) || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`曲の長さは 3:45 または 1:02:03 のように入力してください: ${value}`);
  }
  const [hours, minutes, seconds] = parts.length === 2 ? [0, parts[0], parts[1]] : parts;
  if (minutes >= 60 || seconds >= 60) throw new Error(`曲の長さが正しくありません: ${value}`);
  return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
}

function trackTitle(track) {
  const artists = (track.artists || []).map((artist) => artist.name).join(", ");
  return artists ? `${track.name} / ${artists}` : track.name;
}

function trackImageUrl(track) {
  return track.album?.images?.find((image) => image.width <= 300)?.url || track.album?.images?.at(-1)?.url || track.album?.images?.[0]?.url || "";
}

function setTrackArt(row, { title = "", imageUrl = "", message = "", isLoading = false, isMuted = false } = {}) {
  const info = row.querySelector(".track-info");
  if (!info) return;
  info.dataset.title = title || "";
  info.dataset.imageUrl = imageUrl || "";
  const image = info.querySelector(".track-art");
  const messageEl = info.querySelector(".track-message");
  if (image) {
    image.hidden = !imageUrl;
    image.src = imageUrl || "";
    image.alt = title ? `${title} のジャケット画像` : "";
    image.title = title || "";
  }
  if (messageEl) messageEl.textContent = message || (isLoading ? "ジャケット画像を取得中..." : "");
  info.classList.toggle("is-muted", Boolean(isMuted || isLoading));
  info.classList.toggle("has-art", Boolean(imageUrl));
}

function updateRowsFromTracks(tracks) {
  document.querySelectorAll(".track-row").forEach((row, index) => {
    const track = tracks[index];
    if (!track) return;
    setTrackArt(row, {
      title: trackTitle(track),
      imageUrl: trackImageUrl(track),
    });
  });
}

function msToHms(ms) {
  let seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildLoop(slots, targetMs, bufferMs) {
  const limitMs = targetMs - bufferMs;
  if (limitMs <= 0) throw new Error("余白は目標時間より短くしてください。");
  if (slots.some((slot) => !slot.length)) throw new Error("3つの枠にそれぞれ1曲以上入力してください。");
  const items = [];
  let totalMs = 0;
  let cycle = 0;

  while (true) {
    for (const slot of slots) {
      const track = slot[cycle % slot.length];
      if (totalMs + track.durationMs > limitMs) {
        if (!items.length) throw new Error("指定した目標時間内に曲が入りません。");
        return { items, totalMs };
      }
      items.push(track.uri);
      totalMs += track.durationMs;
    }
    cycle += 1;
  }
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", data);
}

function base64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => possible[value % possible.length]).join("");
}

async function startLogin() {
  const data = getFormData();
  if (!data.clientId) throw new Error("SpotifyのClient IDを入力してください。");
  saveForm();
  const verifier = randomString(96);
  const challenge = base64Url(await sha256(verifier));
  const state = randomString(32);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

  const params = new URLSearchParams({
    client_id: data.clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.assign(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
}

async function exchangeCode(code, state) {
  const pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY) || "{}");
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  if (!pkce.verifier || pkce.state !== state) throw new Error("Spotifyログインの確認に失敗しました。もう一度作成を押してください。");
  const body = new URLSearchParams({
    client_id: data.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: pkce.verifier,
  });
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || "Spotifyの認証トークン取得に失敗しました。");
  sessionStorage.removeItem(PKCE_KEY);
  const token = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in * 1000) - 30000,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  history.replaceState(null, "", redirectUri());
  return token.accessToken;
}

function getToken() {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const token = JSON.parse(raw);
    if (token.expiresAt <= Date.now()) return null;
    return token.accessToken;
  } catch {
    return null;
  }
}

async function spotifyFetch(path, options = {}) {
  const token = getToken();
  if (!token) {
    await startLogin();
    return null;
  }
  const response = await fetch(`${SPOTIFY_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = json.error?.message || json.error || `Spotify APIエラー ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return json;
}

async function lookupTracks(trackIds) {
  const response = await spotifyFetch(`/tracks?ids=${trackIds.join(",")}`);
  const tracks = response?.tracks || [];
  if (tracks.length !== trackIds.length || tracks.some((track) => !track)) {
    throw new Error("Spotifyからすべての曲情報を取得できませんでした。");
  }
  updateRowsFromTracks(tracks);
  saveForm();
  return tracks;
}

async function lookupDurations(trackIds) {
  try {
    const tracks = await lookupTracks(trackIds);
    const durations = tracks.map((track) => track.duration_ms);
    document.querySelectorAll("[name='duration']").forEach((input, index) => {
      const seconds = Math.round(durations[index] / 1000);
      input.value = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    });
    saveForm();
    return durations;
  } catch (error) {
    if (error.status === 403) {
      throw new Error("Spotifyが曲の長さの自動取得を拒否しました。すべての曲の長さを 3:45 のように手入力してください。");
    }
    throw error;
  }
}

async function refreshTrackInfoForRow(row, { silent = false } = {}) {
  const urlInput = row.querySelector("[name='trackUrl']");
  const value = urlInput.value.trim();
  if (!value) {
    setTrackArt(row, {});
    return;
  }
  if (!getToken()) {
    if (!silent) setTrackArt(row, { message: "Spotifyログイン後にジャケット画像を取得できます。", isMuted: true });
    return;
  }
  try {
    const trackId = parseTrackId(value);
    setTrackArt(row, { isLoading: true });
    const track = await spotifyFetch(`/tracks/${trackId}`);
    if (track) {
      setTrackArt(row, {
        title: trackTitle(track),
        imageUrl: trackImageUrl(track),
      });
      saveForm();
    }
  } catch (error) {
    if (!silent) setTrackArt(row, { message: "ジャケット画像を取得できませんでした。", isMuted: true });
  }
}

async function refreshAllTrackInfo({ silent = true } = {}) {
  if (!getToken()) return;
  const rows = Array.from(document.querySelectorAll(".track-row"));
  const ids = [];
  const indexes = [];
  rows.forEach((row, index) => {
    const value = row.querySelector("[name='trackUrl']").value.trim();
    if (!value) return;
    try {
      ids.push(parseTrackId(value));
      indexes.push(index);
    } catch {
      if (!silent) setTrackArt(row, { message: "Spotifyの曲URLとして読み取れませんでした。", isMuted: true });
    }
  });
  if (!ids.length) return;
  try {
    const response = await spotifyFetch(`/tracks?ids=${ids.join(",")}`);
    const tracks = response?.tracks || [];
    const rows = Array.from(document.querySelectorAll(".track-row"));
    tracks.forEach((track, resultIndex) => {
      if (track) {
        setTrackArt(rows[indexes[resultIndex]], {
          title: trackTitle(track),
          imageUrl: trackImageUrl(track),
        });
      }
    });
    saveForm();
  } catch {
    if (!silent) {
      indexes.forEach((index) => setTrackArt(rows[index], { message: "ジャケット画像を取得できませんでした。", isMuted: true }));
    }
  }
}

async function createPlaylist() {
  const data = getFormData({ normalizeDurations: true });
  saveForm();
  const trackIds = data.trackUrls.map(parseTrackId);
  const trackUris = trackIds.map((trackId) => `spotify:track:${trackId}`);
  const durationsMs = data.durations.every(Boolean)
    ? data.durations.map(parseDuration)
    : await lookupDurations(trackIds);
  if (data.durations.every(Boolean)) await refreshAllTrackInfo({ silent: true });
  const hydratedSlots = [];
  let flatIndex = 0;
  data.slots.forEach((slot) => {
    hydratedSlots.push(slot.map(() => {
      const track = {
        uri: trackUris[flatIndex],
        durationMs: durationsMs[flatIndex],
      };
      flatIndex += 1;
      return track;
    }));
  });
  const hasRotation = hydratedSlots.some((slot) => slot.length > 1);
  const { items, totalMs } = buildLoop(
    hydratedSlots,
    Math.round(Number(data.targetMinutes) * 60 * 1000),
    Math.round(Number(data.bufferSeconds) * 1000),
  );

  const playlist = await spotifyFetch("/me/playlists", {
    method: "POST",
    body: JSON.stringify({
      name: data.playlistName,
      public: Boolean(data.isPublic),
      description: `${hasRotation ? "3枠ローテーション" : "3曲ループ"}。長さ ${msToHms(totalMs)}、${items.length}件。`,
    }),
  });

  for (let start = 0; start < items.length; start += 100) {
    await spotifyFetch(`/playlists/${playlist.id}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: items.slice(start, start + 100) }),
    });
  }

  result.hidden = false;
  result.innerHTML = `
    <h2>プレイリストを作成しました</h2>
    <p><strong>${escapeHtml(playlist.name)}</strong></p>
    <p>${items.length}件 / ${msToHms(totalMs)}</p>
    <a class="button" href="${playlist.external_urls.spotify}" target="_blank" rel="noreferrer">Spotifyで開く</a>
  `;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function setBusy(isBusy) {
  const button = document.querySelector("#createButton");
  button.disabled = isBusy;
  button.textContent = isBusy ? "処理中..." : "プレイリストを作成";
}

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  if (error) {
    callbackNotice.hidden = false;
    callbackNotice.textContent = `Spotifyログインに失敗しました: ${error}`;
    history.replaceState(null, "", redirectUri());
    return;
  }
  if (!code) return;
  callbackNotice.hidden = false;
  callbackNotice.textContent = "Spotifyログインが完了しました。プレイリストを作成しています...";
  try {
    setBusy(true);
    await exchangeCode(code, state);
    await createPlaylist();
    callbackNotice.textContent = "完了しました。";
  } catch (err) {
    callbackNotice.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

redirectUriEl.textContent = redirectUri();
setupRedirectUriEl.textContent = redirectUri();
loadForm();
installInputClearButtons();
installDurationShorthand();
initializeTrackRows();
handleCallback();

form.addEventListener("input", saveForm);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setBusy(true);
    if (!getToken()) {
      await startLogin();
      return;
    }
    await createPlaylist();
  } catch (err) {
    result.hidden = false;
    result.innerHTML = `<h2>プレイリストを作成できませんでした</h2><p>${escapeHtml(err.message)}</p>`;
  } finally {
    setBusy(false);
  }
});

document.querySelector("#copyRedirect").addEventListener("click", async () => {
  await navigator.clipboard.writeText(redirectUri());
  document.querySelector("#copyRedirect").textContent = "コピーしました";
  setTimeout(() => {
    document.querySelector("#copyRedirect").textContent = "コピー";
  }, 1200);
});

trackGroupsEl.addEventListener("click", (event) => {
  const addButton = event.target.closest(".add-track");
  if (addButton) {
    const group = addButton.closest(".track-group");
    const slotIndex = Number(group.dataset.slot);
    group.appendChild(createTrackRow(slotIndex));
    renumberSlotRows(slotIndex);
    saveForm();
    slotRows(slotIndex).at(-1).querySelector("[name='trackUrl']").focus();
    return;
  }

  const moveSlotButton = event.target.closest(".move-slot");
  if (!moveSlotButton) return;
  const group = moveSlotButton.closest(".track-group");
  moveSlot(group, Number(moveSlotButton.dataset.direction));
});

document.querySelector("#clearTracksButton").addEventListener("click", () => {
  [0, 1, 2].forEach((slotIndex) => ensureSlotRows(slotIndex, 1));
  [0, 1, 2].forEach((slotIndex) => {
    trackGroupsEl.appendChild(slotGroup(slotIndex));
  });
  trackGroupsEl.appendChild(document.querySelector(".loop-preview"));
  updateAllMoveButtons();
  document.querySelectorAll("[name='trackUrl']").forEach((input) => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.querySelectorAll("[name='duration']").forEach((input) => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  result.hidden = true;
  saveForm();
});

document.querySelector("#resetButton").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  [0, 1, 2].forEach((slotIndex) => ensureSlotRows(slotIndex, 1));
  [0, 1, 2].forEach((slotIndex) => {
    trackGroupsEl.appendChild(slotGroup(slotIndex));
  });
  trackGroupsEl.appendChild(document.querySelector(".loop-preview"));
  updateAllMoveButtons();
  form.reset();
  document.querySelector("#playlistName").value = "3時間ループ";
  document.querySelector("#targetMinutes").value = "180";
  document.querySelector("#bufferSeconds").value = "1";
  result.hidden = true;
  refreshClearButtons();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
