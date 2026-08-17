import { ROOMS, FIREBASE_CONFIG } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // keep in sync with storage.rules

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
