const DB_NAME = 'imitatio-audio-v1';
const STORE = 'recordings';
const $ = (selector) => document.querySelector(selector);
const audio = $('#audio');
const reading = $('#reading');
const select = $('#chapterSelect');
let bookData;
let currentChapter;
let currentTrack;
let currentObjectURL;
let chapterList = [];
let downloading = false;

function keyFor(chapter) { return `${chapter.bookNumber}-${chapter.chapter}`; }
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function dbGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
async function dbDeleteAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
async function hasTrack(id) { return !!(await dbGet(id)); }

function initializeBook(data) {
  bookData = data;
  chapterList = Object.values(data.chapters).sort((a,b) => a.bookNumber-b.bookNumber || a.chapter-b.chapter);
  for (let bookNumber = 1; bookNumber <= 4; bookNumber++) {
    const group = document.createElement('optgroup');
    group.label = `Liber ${['I','II','III','IV'][bookNumber-1]}`;
    chapterList.filter(ch => ch.bookNumber === bookNumber).forEach(ch => {
      const option = document.createElement('option');
      option.value = keyFor(ch);
      option.textContent = `Caput ${ch.chapter} · ${ch.title}`;
      group.append(option);
    });
    select.append(group);
  }
  reading.replaceChildren();
  let lastBook = null;
  chapterList.forEach(ch => {
    if (lastBook !== ch.bookNumber) {
      lastBook = ch.bookNumber;
      const bookTitle = document.createElement('h2');
      bookTitle.className = 'book-divider';
      bookTitle.textContent = `Liber ${ch.book}`;
      reading.append(bookTitle);
    }
    const section = document.createElement('section');
    section.className = 'chapter-section';
    section.id = `chapter-${keyFor(ch)}`;
    section.dataset.chapterKey = keyFor(ch);
    section.dataset.track = ch.track;
    ch.elements.forEach(element => {
      const heading = document.createElement(element.tag);
      heading.innerHTML = element.html;
      section.append(heading);
    });
    reading.append(section);
  });
  currentChapter = chapterList[0];
  currentTrack = data.tracks.find(track => track.id === currentChapter.track);
  select.value = keyFor(currentChapter);
  setTrackSource(currentTrack, false);
  updateLocation();
  document.querySelectorAll('.chapter-section').forEach(section => sectionObserver.observe(section));
  refreshOfflineStatus();
}

function trackForChapter(chapter) { return bookData.tracks.find(track => track.id === chapter.track); }
function wordsForTrack(trackId) { return chapterList.filter(ch => ch.track === trackId); }
function updateLocation() {
  $('#playerLocation').textContent = `Liber ${currentChapter.book} · Caput ${currentChapter.chapter}`;
  select.value = keyFor(currentChapter);
}
function updateCurrentChapter(chapter, shouldScroll = false) {
  if (!chapter) return;
  currentChapter = chapter;
  updateLocation();
  if (shouldScroll) document.getElementById(`chapter-${keyFor(chapter)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function setTrackSource(track, seekStart = true, autoplay = false) {
  const playing = !audio.paused;
  const previousTime = audio.currentTime;
  currentTrack = track;
  audio.pause();
  if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
  currentObjectURL = null;
  hasTrack(track.id).then(blob => {
    if (currentTrack.id !== track.id) return;
    if (blob) {
      currentObjectURL = URL.createObjectURL(blob);
      audio.src = currentObjectURL;
      $('#playerMessage').textContent = 'Playing downloaded audio';
    } else {
      audio.src = track.audioURL;
      $('#playerMessage').textContent = 'LibriVox audio · Internet Archive';
    }
    audio.load();
    audio.addEventListener('loadedmetadata', function loaded() {
      audio.removeEventListener('loadedmetadata', loaded);
      audio.currentTime = seekStart && currentChapter.track === track.id ? (currentChapter.start || 0) : previousTime;
      if (playing || autoplay) audio.play().catch(showPlaybackError);
    });
  }).catch(showPlaybackError);
}
function navigateTo(chapter, autoplay = !audio.paused) {
  if (!chapter) return;
  const oldTrackID = currentTrack?.id;
  updateCurrentChapter(chapter, true);
  const targetTrack = trackForChapter(chapter);
  if (oldTrackID !== targetTrack.id) {
    setTrackSource(targetTrack, true, autoplay);
  } else {
    audio.currentTime = chapter.start || 0;
    if (autoplay) audio.play().catch(showPlaybackError);
  }
  if (autoplay) $('#playButton').textContent = 'Ⅱ';
}
function showPlaybackError(error) {
  console.error(error);
  $('#playerMessage').textContent = navigator.onLine ? 'Could not start audio. Tap play to retry.' : 'You’re offline. Download the audio first to listen offline.';
  $('#playButton').textContent = '▶';
}
function setActiveWord(chapter, seconds) {
  const words = chapter.words;
  let low = 0, high = words.length - 1, found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (words[mid].start != null && words[mid].start <= seconds) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  while (found >= 0 && words[found].end != null && seconds > words[found].end) found--;
  document.querySelectorAll('.word.current').forEach(node => node.classList.remove('current'));
  if (found < 0) return;
  let candidate = words[found];
  if (candidate.start == null || candidate.end == null || seconds > candidate.end + 0.8) {
    candidate = words.slice(0, found + 1).reverse().find(word => word.start != null && word.end != null && seconds >= word.start && seconds <= word.end + 0.8);
  }
  if (!candidate) return;
  document.querySelector(`#chapter-${chapter.bookNumber}-${chapter.chapter} .word[data-word-index="${candidate.wordIndex}"]`)?.classList.add('current');
}
function chapterAtTime(track, seconds) {
  const chapters = wordsForTrack(track.id);
  return chapters.slice().reverse().find(ch => seconds >= ch.start) || chapters[0];
}

const sectionObserver = new IntersectionObserver(entries => {
  const visible = entries.filter(e => e.isIntersecting).sort((a,b) => a.boundingClientRect.top-b.boundingClientRect.top)[0];
  if (!visible) return;
  const chapter = bookData?.chapters[visible.target.dataset.chapterKey];
  if (chapter) updateCurrentChapter(chapter, false);
}, { rootMargin: '-12% 0px -72% 0px' });

select.addEventListener('change', () => navigateTo(bookData.chapters[select.value], !audio.paused));
$('#playButton').addEventListener('click', async () => {
  if (audio.paused) {
    const targetTrack = trackForChapter(currentChapter);
    const chapterPositionIsCurrent = currentTrack?.id === targetTrack.id &&
      audio.currentTime >= currentChapter.start && audio.currentTime < currentChapter.end;
    if (!chapterPositionIsCurrent) {
      if (currentTrack?.id !== targetTrack.id) setTrackSource(targetTrack, true, true);
      else { audio.currentTime = currentChapter.start || 0; audio.play().catch(showPlaybackError); }
      return;
    }
    try { await audio.play(); $('#playButton').textContent = 'Ⅱ'; }
    catch (error) { showPlaybackError(error); }
  } else { audio.pause(); $('#playButton').textContent = '▶'; }
});
$('#previousButton').addEventListener('click', () => navigateTo(chapterList[Math.max(0, chapterList.findIndex(ch => keyFor(ch) === keyFor(currentChapter)) - 1)]));
$('#nextButton').addEventListener('click', () => navigateTo(chapterList[Math.min(chapterList.length - 1, chapterList.findIndex(ch => keyFor(ch) === keyFor(currentChapter)) + 1)]));
audio.addEventListener('play', () => { $('#playButton').textContent = 'Ⅱ'; });
audio.addEventListener('pause', () => { $('#playButton').textContent = '▶'; });
audio.addEventListener('timeupdate', () => {
  const chapter = chapterAtTime(currentTrack, audio.currentTime);
  if (chapter && keyFor(chapter) !== keyFor(currentChapter)) updateCurrentChapter(chapter, false);
  if (chapter) setActiveWord(chapter, audio.currentTime);
  $('#timeLabel').textContent = formatTime(audio.currentTime);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    $('#durationLabel').textContent = formatTime(audio.duration);
    $('#seekBar').value = String(Math.round(audio.currentTime / audio.duration * 1000));
  }
});
audio.addEventListener('ended', () => {
  const index = chapterList.findIndex(ch => keyFor(ch) === keyFor(currentChapter));
  if (index < chapterList.length - 1) navigateTo(chapterList[index + 1], true);
});
$('#seekBar').addEventListener('input', event => {
  if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value) / 1000 * audio.duration;
});

async function refreshOfflineStatus() {
  const present = [];
  for (const track of bookData.tracks) if (await hasTrack(track.id)) present.push(track.id);
  const status = $('#offlineStatus');
  if (present.length === bookData.tracks.length) {
    status.textContent = 'All audio is saved on this device for offline listening.';
    $('#offlineButton').textContent = 'Offline audio saved';
  } else if (present.length) {
    status.textContent = `${present.length} of 16 recordings saved for offline listening.`;
    $('#offlineButton').textContent = 'Manage offline audio';
  } else {
    status.textContent = 'Audio streams while you’re online.';
    $('#offlineButton').textContent = 'Download for offline';
  }
}
function estimateStorage() {
  const note = $('#storageNote');
  if (!navigator.storage?.estimate) { note.textContent = 'This device must have about 405 MB free. Browser storage limits vary.'; return; }
  navigator.storage.estimate().then(({quota, usage}) => {
    const freeMB = Math.max(0, (quota - usage) / 1048576);
    note.textContent = `About ${Math.round(freeMB)} MB browser storage available. This download uses about 405 MB.`;
  }).catch(() => { note.textContent = 'This device must have about 405 MB free. Browser storage limits vary.'; });
}
$('#offlineButton').addEventListener('click', () => { estimateStorage(); $('#downloadDialog').showModal(); });
$('#startDownload').addEventListener('click', async () => {
  if (downloading) return;
  downloading = true;
  const button = $('#startDownload'), progress = $('#downloadProgress'), details = $('#downloadDetails');
  button.disabled = true;
  let completed = 0;
  try {
    await navigator.storage?.persist?.();
    for (const track of bookData.tracks) {
      if (await hasTrack(track.id)) { completed++; progress.value = completed / bookData.tracks.length * 100; continue; }
      details.textContent = `Downloading recording ${track.id} of 16…`;
      const response = await fetch(track.audioURL, { mode: 'cors' });
      if (!response.ok) throw new Error(`Recording ${track.id} returned ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error(`Recording ${track.id} was empty`);
      await dbPut({ id: track.id, blob, savedAt: Date.now() });
      completed++;
      progress.value = completed / bookData.tracks.length * 100;
      details.textContent = `${completed} of 16 recordings downloaded · ${Math.round(blob.size / 1048576)} MB just saved`;
    }
    details.textContent = 'All 16 recordings are ready for offline listening on this device.';
    $('#offlineStatus').textContent = 'All audio is saved on this device for offline listening.';
    $('#offlineButton').textContent = 'Offline audio saved';
    if (currentTrack) setTrackSource(currentTrack, false);
  } catch (error) {
    console.error(error);
    details.textContent = `Download stopped: ${error.message}. Your completed recordings remain saved; tap download again to resume.`;
    refreshOfflineStatus();
  } finally { downloading = false; button.disabled = false; }
});
$('#removeDownload').addEventListener('click', async () => {
  await dbDeleteAll();
  if (currentObjectURL) { URL.revokeObjectURL(currentObjectURL); currentObjectURL = null; }
  setTrackSource(currentTrack, false);
  $('#downloadProgress').value = 0;
  $('#downloadDetails').textContent = 'Offline audio removed from this device.';
  refreshOfflineStatus();
});

fetch('./data/book.json').then(response => { if (!response.ok) throw new Error('Could not load book data'); return response.json(); })
  .then(initializeBook)
  .catch(error => { console.error(error); reading.innerHTML = '<p class="loading">The book could not load. Connect to the internet and reload this page.</p>'; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
