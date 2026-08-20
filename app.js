import { ROOMS, ROOM_POSITIONS, FLOOR_PLAN_IMAGE, SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // keep in sync with the "photos" bucket's file_size_limit
const MAX_IMAGE_DIMENSION = 1600; // longest edge in px, after resize
const JPEG_QUALITY = 0.82;
const GALLERY_LIMIT = 60;
const PHOTOS_BUCKET = "photos";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Upload form (sidebar) ----------

const form = document.getElementById("upload-form");
const photoInput = document.getElementById("photo");
const preview = document.getElementById("preview");
const roomSelect = document.getElementById("room");
const submitBtn = document.getElementById("submit-btn");
const status = document.getElementById("status");

for (const room of ROOMS) {
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

    const { error: insertError } = await supabase.from("photos").insert({
      room,
      description,
      contributor: contributor || "Anonymous",
      image_url: urlData.publicUrl,
      storage_path: storagePath,
      uploaded_by: user.id,
    });
    if (insertError) throw insertError;

    form.reset();
    preview.hidden = true;
    setStatus("Thanks! Your photo was uploaded.", "success");
  } catch (err) {
    console.error(err);
    setStatus("Upload failed. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Sidebar collapse ----------

const dashboard = document.querySelector(".dashboard");
const sidebarToggle = document.getElementById("sidebar-toggle");

sidebarToggle.addEventListener("click", () => {
  const collapsed = dashboard.classList.toggle("sidebar-collapsed");
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
});

// ---------- Lightbox ----------

const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxClose = document.getElementById("lightbox-close");

function openLightbox(photo) {
  lightboxImage.src = photo.image_url;
  lightboxImage.alt = photo.description || photo.room;
  const parts = [photo.room, photo.contributor, photo.description].filter(Boolean);
  lightboxCaption.textContent = parts.join(" — ");
  lightbox.hidden = false;
}

lightboxClose.addEventListener("click", () => {
  lightbox.hidden = true;
});
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.hidden = true;
});

// ---------- Gallery slider ----------

const galleryTrack = document.getElementById("gallery-track");
const galleryEmpty = document.getElementById("gallery-empty");
const photoCountBadge = document.getElementById("photo-count");

document.querySelector(".gallery-prev").addEventListener("click", () => {
  galleryTrack.scrollBy({ left: -320, behavior: "smooth" });
});
document.querySelector(".gallery-next").addEventListener("click", () => {
  galleryTrack.scrollBy({ left: 320, behavior: "smooth" });
});

function renderGallery(photos) {
  galleryTrack.querySelectorAll(".gallery-item").forEach((el) => el.remove());
  galleryEmpty.hidden = photos.length > 0;

  for (const photo of photos) {
    const item = document.createElement("div");
    item.className = "gallery-item";

    const img = document.createElement("img");
    img.src = photo.image_url;
    img.alt = photo.description || photo.room;
    img.loading = "lazy";
    item.appendChild(img);

    const label = document.createElement("span");
    label.className = "gallery-item-room";
    label.textContent = photo.room;
    item.appendChild(label);

    item.addEventListener("click", () => openLightbox(photo));
    galleryTrack.appendChild(item);
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
