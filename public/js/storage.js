// Upload de fotos (avarias e recibos) pro Firebase Storage.
// Organização: {vehicleId}/{tripId}/{timestamp}-{nome}

import { storage } from './firebase-config.js';
import {
  ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// Pega coords atuais (ou null se negado/indisponível) — não bloqueia o upload
function getCoords() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

export async function uploadPhoto(file, vehicleId, tripId) {
  const coords = await getCoords();
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${vehicleId}/${tripId}/${Date.now()}-${safeName}`;

  const metadata = {
    contentType: file.type,
    customMetadata: {
      takenAt: new Date().toISOString(),
      ...(coords ? { lat: String(coords.lat), lng: String(coords.lng) } : {})
    }
  };

  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, metadata);
  return getDownloadURL(fileRef);
}

export async function uploadPhotos(files, vehicleId, tripId) {
  const urls = [];
  for (const file of files) {
    urls.push(await uploadPhoto(file, vehicleId, tripId));
  }
  return urls;
}
