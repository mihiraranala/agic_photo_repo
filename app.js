import {
  ROOMS,
  ROOM_POSITIONS,
  ROOM_SHAPES,
  ROOM_CATEGORIES,
  MAP_CONTEXT,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // keep in sync with the "photos" bucket's file_size_limit
const MAX_IMAGE_DIMENSION = 1600; // longest edge in px, after resize
const JPEG_QUALITY = 0.82;
const GALLERY_LIMIT = 60;
const PHOTOS_BUCKET = "photos";
const UPLOAD_COOLDOWN_MS = 15 * 1000; // client-side friction only — the real cap is the rate limit in submit_photo()
const ACCESS_CODE_STORAGE_KEY = "conferenceAccessCode";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Upload form (sidebar) ----------

const form = document.getElementById("upload-form");
const photoInput = document.getElementById("photo");
const preview = document.getElementById("preview");
const roomSelect = document.getElementById("room");
const submitBtn = document.getElementById("submit-btn");
const status = document.getElementById("status");
const honeypot = document.getElementById("website");
const accessCodeInput = document.getElementById("access-code");

let lastSubmitAt = 0;

const savedAccessCode = localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
if (savedAccessCode) accessCodeInput.value = savedAccessCode;

for (const room of [...ROOMS].sort((a, b) => a.localeCompare(b))) {
  const option = document.createElement("option");
  option.value = room;
  option.textContent = room;
  roomSelect.appendChild(option);
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) {
    preview.hidden = true;
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
});

function setStatus(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}

async function ensureSignedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

// Downscales + re-encodes the photo before upload. Phone camera photos are
// routinely 8-12MB, which would blow past MAX_FILE_BYTES and be slow for
// every dashboard viewer to load — shrinking to a sane display size fixes
// both at once.
async function compressImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  // Honeypot: a real visitor can't see or fill this field in, so a
  // non-empty value means a bot auto-filled the whole form. Bail out
  // silently — no error message, so a scripted bot gets no signal that
  // it was caught and no reason to adapt.
  if (honeypot.value) {
    return;
  }

  const msSinceLastSubmit = Date.now() - lastSubmitAt;
  if (msSinceLastSubmit < UPLOAD_COOLDOWN_MS) {
    const secondsLeft = Math.ceil((UPLOAD_COOLDOWN_MS - msSinceLastSubmit) / 1000);
    setStatus(`Please wait ${secondsLeft}s before uploading another photo.`, "error");
    return;
  }

  const accessCode = accessCodeInput.value.trim();
  if (!accessCode) {
    setStatus("Please enter the conference code.", "error");
    return;
  }

  const file = photoInput.files[0];
  if (!file) {
    setStatus("Please choose a photo.", "error");
    return;
  }

  const room = roomSelect.value;
  const description = document.getElementById("description").value.trim();
  const contributor = document.getElementById("contributor").value.trim();

  submitBtn.disabled = true;
  setStatus("Compressing photo…");

  try {
    const compressed = await compressImage(file);

    if (compressed.size > MAX_FILE_BYTES) {
      setStatus("Photo is too large even after compression. Try a different photo.", "error");
      submitBtn.disabled = false;
      return;
    }

    setStatus("Uploading…");

    const user = await ensureSignedIn();

    const storagePath = `${user.id}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(storagePath, compressed, { contentType: "image/jpeg" });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);

    // submit_photo() is the only way a photos row gets created — it
    // checks the conference code and rate limit server-side (see
    // supabase/schema.sql), so this can't be bypassed by calling the
    // Supabase API directly and skipping this file entirely.
    const { error: submitError } = await supabase.rpc("submit_photo", {
      p_room: room,
      p_description: description,
      p_contributor: contributor || "Anonymous",
      p_image_url: urlData.publicUrl,
      p_storage_path: storagePath,
      p_access_code: accessCode,
    });

    if (submitError) {
      if (submitError.code === "EV001") {
        setStatus("Incorrect conference code — check the code from event signage.", "error");
        return;
      }
      if (submitError.code === "EV002") {
        setStatus("You've hit the upload limit for now — please wait a bit and try again.", "error");
        return;
      }
      throw submitError;
    }

    localStorage.setItem(ACCESS_CODE_STORAGE_KEY, accessCode);
    lastSubmitAt = Date.now();
    form.reset();
    preview.hidden = true;
    accessCodeInput.value = accessCode; // form.reset() clears this too — restore it so repeat uploaders don't retype it
    setStatus("Thanks! Your photo was uploaded.", "success");
  } catch (err) {
    console.error(err);
    setStatus("Upload failed. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Share button ----------

const SHARE_MESSAGE = "Come join the AGIC fun";

const shareBtn = document.getElementById("share-btn");
const shareMenu = document.getElementById("share-menu");
const shareTextLink = document.getElementById("share-text-link");
const shareEmailLink = document.getElementById("share-email-link");

const shareUrl = window.location.href;
shareTextLink.href = `sms:?&body=${encodeURIComponent(`${SHARE_MESSAGE} ${shareUrl}`)}`;
shareEmailLink.href = `mailto:?subject=${encodeURIComponent(SHARE_MESSAGE)}&body=${encodeURIComponent(`${SHARE_MESSAGE}\n\n${shareUrl}`)}`;

shareBtn.addEventListener("click", async () => {
  // Prefer the native share sheet (lets the user pick Messages, Mail, or
  // any other app) where the browser supports it; fall back to the
  // text/email dropdown otherwise.
  if (navigator.share) {
    try {
      await navigator.share({ title: "AGIC Education and Training Symposium", text: SHARE_MESSAGE, url: shareUrl });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // user dismissed the share sheet
    }
  }
  shareMenu.hidden = !shareMenu.hidden;
});

document.addEventListener("click", (event) => {
  if (!shareMenu.hidden && !event.target.closest(".share-controls")) {
    shareMenu.hidden = true;
  }
});

// ---------- Sidebar collapse ----------

const dashboard = document.querySelector(".dashboard");
const sidebarToggle = document.getElementById("sidebar-toggle");

sidebarToggle.addEventListener("click", () => {
  const collapsed = dashboard.classList.toggle("sidebar-collapsed");
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
});

// ---------- Admin mode ----------
// Admins are regular (non-anonymous) Supabase Auth users promoted via
// SQL — see the "Admin delete access" section of supabase/schema.sql.
// Delete permission itself is enforced there (RLS checking the signed
// JWT's app_metadata.is_admin); this is just the UI on top of it.

const adminLoginToggle = document.getElementById("admin-login-toggle");
const adminLoginForm = document.getElementById("admin-login-form");
const adminEmailInput = document.getElementById("admin-email");
const adminPasswordInput = document.getElementById("admin-password");
const adminStatus = document.getElementById("admin-status");
const adminEmailLabel = document.getElementById("admin-email-label");
const adminLogoutBtn = document.getElementById("admin-logout");

let isAdmin = false;

function setAdminUI(session) {
  isAdmin = Boolean(session?.user?.app_metadata?.is_admin);
  adminLoginToggle.hidden = isAdmin;
  adminLoginForm.hidden = true;
  adminStatus.hidden = !isAdmin;
  if (isAdmin) adminEmailLabel.textContent = session.user.email;
  refresh();
}

adminLoginToggle.addEventListener("click", () => {
  adminLoginForm.hidden = !adminLoginForm.hidden;
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: adminEmailInput.value.trim(),
    password: adminPasswordInput.value,
  });
  if (error) {
    alert("Admin sign-in failed: " + error.message);
    return;
  }
  adminLoginForm.reset();
  setAdminUI(data.session);
});

adminLogoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setAdminUI(null);
});

// Fires on load with any persisted session (anonymous or admin), and on
// every future sign-in/out — keeps isAdmin correct without a separate
// initial getSession() check.
supabase.auth.onAuthStateChange((_event, session) => {
  setAdminUI(session);
});

async function deletePhoto(photo) {
  if (!confirm("Delete this photo? This can't be undone.")) return;

  const { error: deleteError } = await supabase.from("photos").delete().eq("id", photo.id);
  if (deleteError) {
    console.error(deleteError);
    alert("Couldn't delete the photo: " + deleteError.message);
    return;
  }

  // Best-effort cleanup — if this fails, the file is just an orphaned,
  // invisible blob (nothing reads Storage directly), not worth blocking
  // the moderation action on. The realtime DELETE event above already
  // removes the photo from every connected dashboard's view.
  const { error: removeError } = await supabase.storage.from(PHOTOS_BUCKET).remove([photo.storage_path]);
  if (removeError) console.error(removeError);
}

// ---------- Lightbox ----------

const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxClose = document.getElementById("lightbox-close");
const lightboxDelete = document.getElementById("lightbox-delete");

function openLightbox(photo) {
  lightboxImage.src = photo.image_url;
  lightboxImage.alt = photo.description || photo.room;
  const uploadedAt = photo.created_at
    ? new Date(photo.created_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const parts = [photo.room, photo.contributor, photo.description, uploadedAt].filter(Boolean);
  lightboxCaption.textContent = parts.join(" — ");
  lightboxDelete.hidden = !isAdmin;
  lightboxDelete.onclick = () => {
    lightbox.hidden = true;
    deletePhoto(photo);
  };
  lightbox.hidden = false;
}

lightboxClose.addEventListener("click", () => {
  lightbox.hidden = true;
});
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.hidden = true;
});

// ---------- Gallery slider ----------

const gallerySlider = document.getElementById("gallery-slider");
const galleryTrack = document.getElementById("gallery-track");
const galleryEmpty = document.getElementById("gallery-empty");
const photoCountBadge = document.getElementById("photo-count");

const MARQUEE_SPEED_PX_PER_SEC = 25; // slow, readable pace

document.querySelector(".gallery-prev").addEventListener("click", () => {
  galleryTrack.scrollBy({ left: -320, behavior: "smooth" });
});
document.querySelector(".gallery-next").addEventListener("click", () => {
  galleryTrack.scrollBy({ left: 320, behavior: "smooth" });
});

function buildGalleryItem(photo) {
  const item = document.createElement("div");
  item.className = "gallery-item";
  // Exposed on the DOM (not just fetched into `photos`) so future
  // chronological filtering/mapping can query it directly off the
  // rendered gallery items.
  if (photo.created_at) item.dataset.createdAt = photo.created_at;

  const img = document.createElement("img");
  img.src = photo.image_url;
  img.alt = photo.description || photo.room;
  img.loading = "lazy";
  item.appendChild(img);

  const label = document.createElement("span");
  label.className = "gallery-item-room";
  label.textContent = photo.room;
  item.appendChild(label);

  if (isAdmin) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "gallery-item-delete";
    deleteBtn.setAttribute("aria-label", "Delete photo");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation(); // don't also open the lightbox
      deletePhoto(photo);
    });
    item.appendChild(deleteBtn);
  }

  item.addEventListener("click", () => openLightbox(photo));
  return item;
}

function renderGallery(photos) {
  gallerySlider.classList.remove("marquee");
  galleryTrack.classList.remove("marquee");
  galleryTrack.style.removeProperty("--marquee-duration");
  galleryTrack.querySelectorAll(".gallery-item").forEach((el) => el.remove());
  galleryEmpty.hidden = photos.length > 0;

  for (const photo of photos) {
    galleryTrack.appendChild(buildGalleryItem(photo));
  }

  // If the photos overflow the visible strip, switch to a slow
  // right-to-left marquee instead of requiring manual scrolling. The
  // track is doubled up so translateX(-50%) loops seamlessly.
  const overflows = galleryTrack.scrollWidth > galleryTrack.clientWidth + 1;
  if (overflows && photos.length > 0) {
    const singleSetWidth = galleryTrack.scrollWidth;
    for (const photo of photos) {
      galleryTrack.appendChild(buildGalleryItem(photo));
    }
    galleryTrack.style.setProperty("--marquee-duration", `${singleSetWidth / MARQUEE_SPEED_PX_PER_SEC}s`);
    gallerySlider.classList.add("marquee");
    galleryTrack.classList.add("marquee");
  }
}

// ---------- Floor plan (CSS-built) ----------

const floorplanMap = document.getElementById("floorplan-map");
const floorplanStage = document.getElementById("floorplan-stage");
const floorplanZoom = document.getElementById("floorplan-zoom");
const floorplanMarkers = document.getElementById("floorplan-markers");
const heatmapCanvas = document.getElementById("heatmap-canvas");
const heatmapCtx = heatmapCanvas.getContext("2d");

// Builds the venue floor plan itself from ROOM_SHAPES/MAP_CONTEXT
// (config.js) as absolutely-positioned divs — a static layout, so this
// only needs to run once at startup, before the first
// sizeOverlaysToMap() call.
function renderFloorPlanMap() {
  const legend = document.createElement("div");
  legend.className = "map-legend";
  for (const { key, label } of ROOM_CATEGORIES) {
    const row = document.createElement("div");
    row.className = "map-legend-row";
    const swatch = document.createElement("span");
    swatch.className = `map-legend-swatch cat-${key}`;
    row.appendChild(swatch);
    const text = document.createElement("span");
    text.textContent = label;
    row.appendChild(text);
    legend.appendChild(row);
  }
  floorplanMap.appendChild(legend);

  for (const room of ROOMS) {
    const shape = ROOM_SHAPES[room];
    if (!shape) continue; // e.g. Registration, drawn as a pin below instead
    const el = document.createElement("div");
    el.className = `map-room cat-${shape.category}`;
    el.style.left = `${shape.left}%`;
    el.style.top = `${shape.top}%`;
    el.style.width = `${shape.width}%`;
    el.style.height = `${shape.height}%`;
    el.textContent = room;
    floorplanMap.appendChild(el);
  }

  for (const item of MAP_CONTEXT) {
    const el = document.createElement("div");
    el.style.left = `${item.left}%`;
    el.style.top = `${item.top}%`;
    el.style.width = `${item.width}%`;
    el.style.height = `${item.height}%`;

    if (item.type === "arrow") {
      el.className = `map-context map-arrow arrow-${item.direction}`;
      const glyph = document.createElement("span");
      glyph.textContent = item.direction === "left" ? "←" : "→";
      const text = document.createElement("span");
      text.textContent = item.label;
      el.append(glyph, text);
    } else {
      el.className = item.type === "icon" ? "map-context map-icon" : "map-context map-box";
      const glyph = document.createElement("span");
      glyph.className = "map-icon-glyph";
      glyph.textContent = item.icon;
      const text = document.createElement("span");
      text.textContent = item.label;
      el.append(glyph, text);
    }
    floorplanMap.appendChild(el);
  }

  const registrationPos = ROOM_POSITIONS.Registration;
  if (registrationPos) {
    const pin = document.createElement("div");
    pin.className = "map-registration-pin";
    pin.style.left = `${registrationPos.x}%`;
    pin.style.top = `${registrationPos.y}%`;
    const dot = document.createElement("span");
    dot.className = "pin-dot";
    const text = document.createElement("span");
    text.textContent = "Registration";
    pin.append(dot, text);
    floorplanMap.appendChild(pin);
  }
}

renderFloorPlanMap();

let lastCounts = {};

// The map div has no intrinsic size (its children are all absolutely
// positioned, so they don't contribute to layout) and .floorplan-zoom's
// transform doesn't affect the untransformed box it's centered in, so
// this sizes .floorplan-map itself — replicating the object-fit:contain
// letterboxing the original <img> got for free from its natural size.
// Only depends on the stage's own size (not zoom/pan), so it only needs
// to re-run on actual resizes, not on every zoom/pan tick.
const MAP_ASPECT_RATIO = 1545 / 2000;

function sizeFloorplanMap() {
  const stageRect = floorplanStage.getBoundingClientRect();
  const availWidth = stageRect.width;
  const availHeight = stageRect.height;
  if (availWidth === 0 || availHeight === 0) return;

  let width = availWidth;
  let height = width / MAP_ASPECT_RATIO;
  if (height > availHeight) {
    height = availHeight;
    width = height * MAP_ASPECT_RATIO;
  }
  floorplanMap.style.width = `${width}px`;
  floorplanMap.style.height = `${height}px`;

  sizeOverlaysToMap();
}

// Sizes/positions the heatmap canvas and the marker layer to exactly
// overlay the rendered floor plan map. Both are siblings of the
// transformed .floorplan-zoom wrapper (not children of it), so their CSS
// pixel dimensions already reflect the current zoom/pan — no extra
// transform math needed here, just re-measure after every change.
function sizeOverlaysToMap() {
  const stageRect = floorplanStage.getBoundingClientRect();
  const mapRect = floorplanMap.getBoundingClientRect();
  const width = mapRect.width;
  const height = mapRect.height;
  if (width === 0 || height === 0) return;

  const left = mapRect.left - stageRect.left;
  const top = mapRect.top - stageRect.top;

  for (const el of [heatmapCanvas, floorplanMarkers]) {
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }

  const dpr = window.devicePixelRatio || 1;
  heatmapCanvas.width = width * dpr;
  heatmapCanvas.height = height * dpr;
  heatmapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawHeatmap(lastCounts);
}

// ---------- Floor plan zoom & pan ----------
// Below MARKER_ZOOM_THRESHOLD the room heatmap (aggregate, non-interactive)
// is shown; above it, individual clickable photo markers take over so a
// zoomed-in viewer can tap a specific photo instead of a room-level blob.

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const MARKER_ZOOM_THRESHOLD = 1.6;

let zoomScale = 1;
let panX = 0;
let panY = 0;

function clampPan() {
  const stageRect = floorplanStage.getBoundingClientRect();
  const minX = Math.min(0, stageRect.width * (1 - zoomScale));
  const minY = Math.min(0, stageRect.height * (1 - zoomScale));
  panX = Math.min(0, Math.max(minX, panX));
  panY = Math.min(0, Math.max(minY, panY));
}

function applyZoomTransform() {
  clampPan();
  floorplanZoom.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  floorplanStage.classList.toggle("zoomed-in", zoomScale > MARKER_ZOOM_THRESHOLD);
  floorplanStage.classList.toggle("can-pan", zoomScale > MIN_ZOOM);
  sizeOverlaysToMap();
}

// Zooms to newScale while keeping the content under (cx, cy) — stage-
// relative coordinates — fixed on screen, the way map UIs zoom under the cursor.
function zoomAt(cx, cy, newScale) {
  newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
  if (newScale === zoomScale) return;
  const ratio = newScale / zoomScale;
  panX = cx - ratio * (cx - panX);
  panY = cy - ratio * (cy - panY);
  zoomScale = newScale;
  applyZoomTransform();
}

function stagePoint(clientX, clientY) {
  const stageRect = floorplanStage.getBoundingClientRect();
  return { x: clientX - stageRect.left, y: clientY - stageRect.top };
}

floorplanStage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const { x, y } = stagePoint(event.clientX, event.clientY);
    zoomAt(x, y, zoomScale * (1 - event.deltaY * 0.0015));
  },
  { passive: false }
);

floorplanStage.addEventListener("dblclick", (event) => {
  const { x, y } = stagePoint(event.clientX, event.clientY);
  zoomAt(x, y, zoomScale < MAX_ZOOM ? zoomScale + 1.5 : 1);
});

document.getElementById("zoom-in").addEventListener("click", () => {
  const stageRect = floorplanStage.getBoundingClientRect();
  zoomAt(stageRect.width / 2, stageRect.height / 2, zoomScale + 1);
});
document.getElementById("zoom-out").addEventListener("click", () => {
  const stageRect = floorplanStage.getBoundingClientRect();
  zoomAt(stageRect.width / 2, stageRect.height / 2, zoomScale - 1);
});
document.getElementById("zoom-reset").addEventListener("click", () => {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  applyZoomTransform();
});

// Mouse drag-to-pan. Tracks whether the pointer actually moved so a plain
// click (no drag) still reaches a marker underneath instead of being
// swallowed by the pan handling.
let dragging = false;
let dragMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;

floorplanStage.addEventListener("mousedown", (event) => {
  if (zoomScale <= MIN_ZOOM) return;
  dragging = true;
  dragMoved = false;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  panStartX = panX;
  panStartY = panY;
  floorplanStage.classList.add("panning");
});

window.addEventListener("mousemove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
  panX = panStartX + dx;
  panY = panStartY + dy;
  applyZoomTransform();
});

window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  floorplanStage.classList.remove("panning");
});

// Swallow the click that follows a drag so releasing over a marker
// doesn't also open its lightbox.
floorplanMarkers.addEventListener(
  "click",
  (event) => {
    if (dragMoved) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  },
  true
);

// Touch: one finger pans (when zoomed in), two fingers pinch-zoom.
function touchDistance(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

let touchState = null;

floorplanStage.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length === 2) {
      const [t1, t2] = event.touches;
      const mid = stagePoint((t1.clientX + t2.clientX) / 2, (t1.clientY + t2.clientY) / 2);
      touchState = {
        mode: "pinch",
        startDist: touchDistance(t1, t2),
        startScale: zoomScale,
        startPanX: panX,
        startPanY: panY,
        midX: mid.x,
        midY: mid.y,
      };
    } else if (event.touches.length === 1 && zoomScale > MIN_ZOOM) {
      touchState = {
        mode: "pan",
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        startPanX: panX,
        startPanY: panY,
      };
    }
  },
  { passive: true }
);

floorplanStage.addEventListener(
  "touchmove",
  (event) => {
    if (!touchState) return;
    if (touchState.mode === "pinch" && event.touches.length === 2) {
      event.preventDefault();
      const [t1, t2] = event.touches;
      const newScale = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, touchState.startScale * (touchDistance(t1, t2) / touchState.startDist))
      );
      const ratio = newScale / touchState.startScale;
      panX = touchState.midX - ratio * (touchState.midX - touchState.startPanX);
      panY = touchState.midY - ratio * (touchState.midY - touchState.startPanY);
      zoomScale = newScale;
      applyZoomTransform();
    } else if (touchState.mode === "pan" && event.touches.length === 1) {
      event.preventDefault();
      panX = touchState.startPanX + (event.touches[0].clientX - touchState.startX);
      panY = touchState.startPanY + (event.touches[0].clientY - touchState.startY);
      applyZoomTransform();
    }
  },
  { passive: false }
);

floorplanStage.addEventListener("touchend", () => {
  touchState = null;
});

// ---------- Floor plan photo markers (zoomed-in mode) ----------

// Multiple photos tagged to the same room share one ROOM_POSITIONS point;
// spread them in a small ring (in image-percent units, so it scales with
// zoom) so each stays individually clickable instead of stacking exactly.
function markerOffsetsFor(count) {
  if (count <= 1) return [{ dx: 0, dy: 0 }];
  const radius = 2 + Math.min(count, 12) * 0.3;
  const offsets = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    offsets.push({ dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) });
  }
  return offsets;
}

function renderPhotoMarkers(photos) {
  floorplanMarkers.innerHTML = "";

  const byRoom = {};
  for (const photo of photos) {
    (byRoom[photo.room] ||= []).push(photo);
  }

  for (const room of Object.keys(byRoom)) {
    const pos = ROOM_POSITIONS[room];
    if (!pos) continue;

    const roomPhotos = byRoom[room];
    const offsets = markerOffsetsFor(roomPhotos.length);
    roomPhotos.forEach((photo, i) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "floorplan-marker";
      marker.style.left = `${pos.x + offsets[i].dx}%`;
      marker.style.top = `${pos.y + offsets[i].dy}%`;
      marker.setAttribute("aria-label", `View photo from ${room}`);
      marker.addEventListener("click", () => openLightbox(photo));
      floorplanMarkers.appendChild(marker);
    });
  }
}

// Cold -> hot colormap, matching the gradient bar in the panel header's
// legend: blue -> cyan -> green -> yellow -> red.
const HEAT_COLOR_STOPS = [
  [0, 46, 92, 220],
  [0.25, 36, 209, 196],
  [0.5, 87, 227, 76],
  [0.75, 244, 225, 43],
  [1, 255, 60, 40],
];

function heatColorAt(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < HEAT_COLOR_STOPS.length - 1; i++) {
    const [ta, ra, ga, ba] = HEAT_COLOR_STOPS[i];
    const [tb, rb, gb, bb] = HEAT_COLOR_STOPS[i + 1];
    if (t >= ta && t <= tb) {
      const lt = (t - ta) / (tb - ta || 1);
      return [ra + (rb - ra) * lt, ga + (gb - ga) * lt, ba + (bb - ba) * lt];
    }
  }
  return HEAT_COLOR_STOPS[HEAT_COLOR_STOPS.length - 1].slice(1);
}

function drawHeatmap(counts) {
  lastCounts = counts;
  const width = heatmapCanvas.clientWidth;
  const height = heatmapCanvas.clientHeight;
  if (width === 0 || height === 0) return;

  heatmapCtx.clearRect(0, 0, width, height);

  // Rooms sit close together on a real floor plan (e.g. adjacent ballroom
  // sections), so blobs stay small relative to the image to avoid one
  // room's glow swallowing its neighbor's.
  const maxCount = Math.max(1, ...Object.values(counts));
  const baseRadius = Math.min(width, height) * 0.05;

  for (const room of ROOMS) {
    const pos = ROOM_POSITIONS[room];
    const count = counts[room] || 0;
    if (!pos || count === 0) continue;

    const intensity = count / maxCount;
    const x = (pos.x / 100) * width;
    const y = (pos.y / 100) * height;
    const radius = baseRadius * (0.7 + 0.5 * intensity);
    const [r, g, b] = heatColorAt(intensity);

    const gradient = heatmapCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.85)`);
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    heatmapCtx.fillStyle = gradient;
    heatmapCtx.beginPath();
    heatmapCtx.arc(x, y, radius, 0, Math.PI * 2);
    heatmapCtx.fill();

    heatmapCtx.font = "700 11px sans-serif";
    heatmapCtx.fillStyle = "#fff";
    heatmapCtx.textAlign = "center";
    heatmapCtx.textBaseline = "middle";
    heatmapCtx.fillText(String(count), x, y);
  }
}

sizeFloorplanMap();
window.addEventListener("resize", sizeFloorplanMap);
if (window.ResizeObserver) {
  new ResizeObserver(sizeFloorplanMap).observe(floorplanStage);
}

// ---------- Live photos feed ----------

let photos = [];

function refresh() {
  photoCountBadge.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
  renderGallery(photos.slice(0, GALLERY_LIMIT));
  renderPhotoMarkers(photos);

  const counts = {};
  for (const photo of photos) {
    counts[photo.room] = (counts[photo.room] || 0) + 1;
  }
  drawHeatmap(counts);
}

async function loadPhotos() {
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }
  photos = data;
  refresh();
}

// One initial fetch, then apply realtime deltas in place — avoids
// re-reading the whole table every time anyone uploads a photo.
supabase
  .channel("photos-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, (payload) => {
    if (payload.eventType === "INSERT") {
      photos = [payload.new, ...photos];
    } else if (payload.eventType === "UPDATE") {
      photos = photos.map((p) => (p.id === payload.new.id ? payload.new : p));
    } else if (payload.eventType === "DELETE") {
      photos = photos.filter((p) => p.id !== payload.old.id);
    }
    refresh();
  })
  .subscribe();

loadPhotos();

// Re-check overflow (and thus marquee on/off) when the gallery's
// available width changes, e.g. the sidebar collapsing or a resize.
let galleryResizeTimer;
new ResizeObserver(() => {
  clearTimeout(galleryResizeTimer);
  galleryResizeTimer = setTimeout(() => renderGallery(photos.slice(0, GALLERY_LIMIT)), 150);
}).observe(gallerySlider);
