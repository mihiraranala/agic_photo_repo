import { ROOMS, ROOM_POSITIONS, FLOOR_PLAN_IMAGE, SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
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

// ---------- Floor plan heatmap ----------

const floorplanImage = document.getElementById("floorplan-image");
const floorplanStage = document.getElementById("floorplan-stage");
const heatmapCanvas = document.getElementById("heatmap-canvas");
const heatmapCtx = heatmapCanvas.getContext("2d");

floorplanImage.src = FLOOR_PLAN_IMAGE;

let lastCounts = {};

function sizeCanvasToImage() {
  const stageRect = floorplanStage.getBoundingClientRect();
  const imgRect = floorplanImage.getBoundingClientRect();
  const width = imgRect.width;
  const height = imgRect.height;
  if (width === 0 || height === 0) return;

  heatmapCanvas.style.left = `${imgRect.left - stageRect.left}px`;
  heatmapCanvas.style.top = `${imgRect.top - stageRect.top}px`;
  heatmapCanvas.style.width = `${width}px`;
  heatmapCanvas.style.height = `${height}px`;

  const dpr = window.devicePixelRatio || 1;
  heatmapCanvas.width = width * dpr;
  heatmapCanvas.height = height * dpr;
  heatmapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawHeatmap(lastCounts);
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

floorplanImage.addEventListener("load", sizeCanvasToImage);
window.addEventListener("resize", sizeCanvasToImage);
if (window.ResizeObserver) {
  new ResizeObserver(sizeCanvasToImage).observe(floorplanStage);
}

// ---------- Live photos feed ----------

let photos = [];

function refresh() {
  photoCountBadge.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
  renderGallery(photos.slice(0, GALLERY_LIMIT));

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
