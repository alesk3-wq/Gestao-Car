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

// Redimensiona (máx. 1600px no lado maior) e reexporta como JPEG antes do
// upload, pra economizar Storage — fotos de celular costumam vir na casa
// dos 3-8MB e não precisam disso pra ficarem legíveis no app/PDF.
// Se o navegador não suportar createImageBitmap, ou o resultado não ficar
// menor que o original, sobe o arquivo original sem risco.
async function compressImage(file, { maxSize = 1600, quality = 0.75 } = {}) {
  if (!file.type.startsWith('image/') || !('createImageBitmap' in window)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch (e) {
    console.error('Erro ao comprimir imagem, enviando original:', e);
    return file;
  }
}

export async function uploadPhoto(file, vehicleId, tripId) {
  const [compressed, coords] = await Promise.all([compressImage(file), getCoords()]);
  const safeName = compressed.name.replace(/[^\w.\-]/g, '_');
  const path = `${vehicleId}/${tripId}/${Date.now()}-${safeName}`;

  const metadata = {
    contentType: compressed.type,
    customMetadata: {
      takenAt: new Date().toISOString(),
      ...(coords ? { lat: String(coords.lat), lng: String(coords.lng) } : {})
    }
  };

  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, compressed, metadata);
  return getDownloadURL(fileRef);
}

export async function uploadPhotos(files, vehicleId, tripId) {
  const urls = [];
  for (const file of files) {
    urls.push(await uploadPhoto(file, vehicleId, tripId));
  }
  return urls;
}
