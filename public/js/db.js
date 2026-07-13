// Wrappers de Firestore (CRUD) — toda leitura/escrita passa por aqui.

import { db } from './firebase-config.js';
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

function snapToList(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ── Veículos ── */

export async function listVehicles({ activeOnly = false } = {}) {
  const parts = [collection(db, 'vehicles')];
  if (activeOnly) parts.push(where('active', '==', true));
  const snap = await getDocs(query(...parts));
  return snapToList(snap).sort((a, b) => (a.fleetNumber || '').localeCompare(b.fleetNumber || ''));
}

export async function getVehicle(vehicleId) {
  const snap = await getDoc(doc(db, 'vehicles', vehicleId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function createVehicle(data) {
  return addDoc(collection(db, 'vehicles'), { ...data, active: true, createdAt: serverTimestamp() });
}

export function updateVehicle(vehicleId, data) {
  return updateDoc(doc(db, 'vehicles', vehicleId), data);
}

/* ── Condutores ── */

export async function listDrivers() {
  const snap = await getDocs(collection(db, 'drivers'));
  return snapToList(snap).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function updateDriver(driverId, data) {
  return updateDoc(doc(db, 'drivers', driverId), data);
}

/* ── Turnos ── */

export async function getOpenTrip(driverId) {
  const snap = await getDocs(query(
    collection(db, 'trips'),
    where('driverId', '==', driverId),
    where('status', '==', 'open'),
    limit(1)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getTrip(tripId) {
  const snap = await getDoc(doc(db, 'trips', tripId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function createTrip(data) {
  return addDoc(collection(db, 'trips'), {
    ...data,
    status: 'open',
    endTime: null,
    kmEnd: null,
    fuelEnd: null,
    stops: [],
    expenses: [],
    totalExpenses: 0,
    createdAt: serverTimestamp(),
    closedAt: null
  });
}

export function updateTrip(tripId, data) {
  return updateDoc(doc(db, 'trips', tripId), data);
}

export function closeTrip(tripId, { kmEnd, fuelEnd }) {
  return updateDoc(doc(db, 'trips', tripId), {
    kmEnd,
    fuelEnd,
    status: 'closed',
    endTime: serverTimestamp(),
    closedAt: serverTimestamp()
  });
}

// Último turno fechado do veículo (pro handoff visual)
export async function getLastClosedTrip(vehicleId) {
  const snap = await getDocs(query(
    collection(db, 'trips'),
    where('vehicleId', '==', vehicleId),
    where('status', '==', 'closed'),
    orderBy('closedAt', 'desc'),
    limit(1)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// Histórico com filtros (admin)
export async function listTrips({ vehicleId = '', driverId = '', dateFrom = '', dateTo = '' } = {}) {
  const parts = [collection(db, 'trips')];
  if (vehicleId) parts.push(where('vehicleId', '==', vehicleId));
  if (driverId) parts.push(where('driverId', '==', driverId));
  if (dateFrom) parts.push(where('date', '>=', dateFrom));
  if (dateTo) parts.push(where('date', '<=', dateTo));
  parts.push(orderBy('date', 'desc'), limit(100));
  const snap = await getDocs(query(...parts));
  return snapToList(snap);
}

/* ── Avarias ── */

export function createDamage(data) {
  return addDoc(collection(db, 'damages'), {
    ...data,
    resolved: false,
    reportedAt: serverTimestamp()
  });
}

export async function listDamagesByVehicle(vehicleId, { max = 50 } = {}) {
  const snap = await getDocs(query(
    collection(db, 'damages'),
    where('vehicleId', '==', vehicleId),
    orderBy('reportedAt', 'desc'),
    limit(max)
  ));
  return snapToList(snap);
}

export async function listDamagesByTrip(tripId) {
  const snap = await getDocs(query(
    collection(db, 'damages'),
    where('tripId', '==', tripId)
  ));
  return snapToList(snap);
}

export function updateDamage(damageId, data) {
  return updateDoc(doc(db, 'damages', damageId), data);
}

export { serverTimestamp };
