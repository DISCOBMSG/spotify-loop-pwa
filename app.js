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
    document.querySelector("#clientId").value = data.clientId || "";
    document.querySelector("#playlistName").value = data.playlistName || "3時間ループ";
    document.querySelector("#targetMinutes").value = data.targetMinutes || "180";
    document.querySelector("#bufferSeconds").value = data.bufferSeconds || "1";
    document.querySelector("#isPublic").checked = Boolean(data.isPublic);
    document.querySelectorAll("[name='trackUrl']").forEach((input, index) => {
      input.value = data.trackUrls?.[index] || "";
    });
    document.querySelectorAll("[name='duration']").forEach((input, index) => {
      input.value = data.durations?.[index] || "";
    });
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

function installInputClearButtons() {
  document.querySelectorAll("input:not([type='checkbox'])").forEach((input) => {
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
  });
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

function installDurationShorthand() {
  document.querySelectorAll("[name='duration']").forEach((input) => {
    input.addEventListener("input", () => {
      if (/^\d{3,4}$/.test(input.value.trim())) normalizeDurationInput(input);
    });
    input.addEventListener("blur", () => normalizeDurationInput(input));
  });
}

function getFormData() {
  document.querySelectorAll("[name='duration']").forEach(normalizeDurationInput);
  return {
    clientId: document.querySelector("#clientId").value.trim(),
    playlistName: document.querySelector("#playlistName").value.trim() || "3時間ループ",
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

function msToHms(ms) {
  let seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildLoop(trackUris, durationsMs, targetMs, bufferMs) {
  const limitMs = targetMs - bufferMs;
  if (limitMs <= 0) throw new Error("余白は目標時間より短くしてください。");
  const items = [];
  let totalMs = 0;
  let index = 0;
  while (totalMs + durationsMs[index] <= limitMs) {
    items.push(trackUris[index]);
    totalMs += durationsMs[index];
    index = (index + 1) % trackUris.length;
  }
  if (!items.length) throw new Error("指定した目標時間内に曲が入りません。");
  return { items, totalMs };
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

async function lookupDurations(trackIds) {
  try {
    const response = await spotifyFetch(`/tracks?ids=${trackIds.join(",")}`);
    const tracks = response?.tracks || [];
    if (tracks.length !== 3 || tracks.some((track) => !track)) {
      throw new Error("Spotifyから3曲すべての情報を取得できませんでした。");
    }
    const durations = tracks.map((track) => track.duration_ms);
    document.querySelectorAll("[name='duration']").forEach((input, index) => {
      const seconds = Math.round(durations[index] / 1000);
      input.value = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    });
    saveForm();
    return durations;
  } catch (error) {
    if (error.status === 403) {
      throw new Error("Spotifyが曲の長さの自動取得を拒否しました。3曲すべての長さを 3:45 のように手入力してください。");
    }
    throw error;
  }
}

async function createPlaylist() {
  const data = getFormData();
  saveForm();
  const trackIds = data.trackUrls.map(parseTrackId);
  const trackUris = trackIds.map((trackId) => `spotify:track:${trackId}`);
  const durationsMs = data.durations.every(Boolean)
    ? data.durations.map(parseDuration)
    : await lookupDurations(trackIds);
  const { items, totalMs } = buildLoop(
    trackUris,
    durationsMs,
    Math.round(Number(data.targetMinutes) * 60 * 1000),
    Math.round(Number(data.bufferSeconds) * 1000),
  );

  const playlist = await spotifyFetch("/me/playlists", {
    method: "POST",
    body: JSON.stringify({
      name: data.playlistName,
      public: Boolean(data.isPublic),
      description: `3曲ループ。長さ ${msToHms(totalMs)}、${items.length}件。`,
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

document.querySelector("#clearTracksButton").addEventListener("click", () => {
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
