import { ROOMS, ROOM_POSITIONS, FLOOR_PLAN_IMAGE, FIREBASE_CONFIG } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // keep in sync with storage.rules
const GALLERY_LIMIT = 60;

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = photoInput.files[0];
  if (!file) {
    setStatus("Please choose a photo.", "error");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus("Photo is too large (max 15MB).", "error");
    return;
  }

  const room = roomSelect.value;
  const description = document.getElementById("description").value.trim();
  const contributor = document.getElementById("contributor").value.trim();

  submitBtn.disabled = true;
  setStatus("Uploading…");

  try {
    const user = await ensureSignedIn();

    const fileExt = file.name.split(".").pop() || "jpg";
    const storagePath = `photos/${user.uid}/${Date.now()}.${fileExt}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file, { contentType: file.type });
    const imageUrl = await getDownloadURL(storageRef);

    await addDoc(collection(db, "photos"), {
      room,
      description,
      contributor: contributor || "Anonymous",
      imageUrl,
      storagePath,
      uploadedBy: user.uid,
      createdAt: serverTimestamp(),
    });

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
  lightboxImage.src = photo.imageUrl;
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
    img.src = photo.imageUrl;
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

// No `limit` here: the heatmap needs a count of every submission, not
// just the most recent batch. The gallery slider below just shows the
// first GALLERY_LIMIT of them.
const photosQuery = query(collection(db, "photos"), orderBy("createdAt", "desc"));

onSnapshot(photosQuery, (snapshot) => {
  const photos = snapshot.docs.map((doc) => doc.data());

  photoCountBadge.textContent = `${snapshot.size} photo${snapshot.size === 1 ? "" : "s"}`;
  renderGallery(photos.slice(0, GALLERY_LIMIT));

  const counts = {};
  for (const photo of photos) {
    counts[photo.room] = (counts[photo.room] || 0) + 1;
  }
  drawHeatmap(counts);
});
