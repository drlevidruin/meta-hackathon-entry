import { encodeWav } from './wav.js';

const byId = (id) => document.getElementById(id);
const chipsElement = byId('chips');
const recordButton = byId('record');
const actions = byId('actions');
const playButton = byId('play');
const againButton = byId('again');
const nextButton = byId('next');
const deleteButton = byId('delete-child');
const playback = byId('playback');
let clips = [];
let set;
let current = 0;
let busy = true;
let recording = false;
let recorder;
let stream;
let context;

function render() {
  const clip = clips[current];
  if (!clip) return;
  byId('hebrew').textContent = clip.hebrew;
  byId('say').textContent = clip.say;
  byId('planted').textContent = clip.planted;
  for (const [index, chip] of [...chipsElement.children].entries()) {
    chip.classList.toggle('done', clips[index].done);
    chip.setAttribute('aria-label', `${clips[index].name}${clips[index].done ? ', done' : ''}`);
    if (index === current) chip.setAttribute('aria-current', 'step');
    else chip.removeAttribute('aria-current');
    chip.disabled = busy || recording;
  }
  recordButton.disabled = busy;
  recordButton.classList.toggle('recording', recording);
  recordButton.setAttribute('aria-label', recording ? 'Stop' : 'Record');
  recordButton.setAttribute('aria-pressed', String(recording));
  actions.hidden = !clip.done;
  playButton.disabled = busy || recording;
  againButton.disabled = busy || recording;
  nextButton.disabled = busy || recording;
  deleteButton.disabled = busy || recording;
}

function jump(index) {
  if (busy || recording) return;
  playback.pause();
  playback.removeAttribute('src');
  playback.load();
  current = index;
  render();
  chipsElement.children[current].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function stopTracks() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
}

async function closeContext() {
  if (context && context.state !== 'closed') await context.close().catch(() => {});
  context = undefined;
}

async function saveRecording(chunks, clipIndex, mimeType) {
  stopTracks();
  recording = false;
  busy = true;
  render();
  try {
    const encoded = new Blob(chunks, { type: mimeType });
    const decoded = await context.decodeAudioData(await encoded.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.round(decoded.duration * 16000)), 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const mono = await offline.startRendering();
    const wav = encodeWav(mono.getChannelData(0));
    const response = await fetch(`/clip?name=${encodeURIComponent(clips[clipIndex].name)}`, {
      method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav,
    });
    if (!response.ok) throw new Error('save');
    clips[clipIndex].done = true;
  } catch {
    window.alert('Could not save the recording.');
  } finally {
    await closeContext();
    recorder = undefined;
    busy = false;
    render();
  }
}

async function startRecording() {
  if (busy || recording) return;
  playback.pause();
  busy = true;
  render();
  try {
    context = new AudioContext();
    await context.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
      .find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const clipIndex = current;
    let failed = false;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = async () => {
      failed = true;
      stopTracks();
      await closeContext();
      recording = false;
      busy = false;
      render();
      window.alert('Could not record audio.');
    };
    recorder.onstop = () => {
      if (!failed) void saveRecording(chunks, clipIndex, recorder.mimeType);
    };
    recorder.start();
    recording = true;
  } catch {
    stopTracks();
    await closeContext();
    window.alert('Could not access the microphone.');
  } finally {
    busy = false;
    render();
  }
}

recordButton.addEventListener('click', () => {
  if (busy) return;
  if (recording) {
    busy = true;
    render();
    recorder.stop();
  } else void startRecording();
});
againButton.addEventListener('click', () => { void startRecording(); });
nextButton.addEventListener('click', () => jump((current + 1) % clips.length));
playButton.addEventListener('click', async () => {
  playback.src = `/clip?name=${encodeURIComponent(clips[current].name)}`;
  try { await playback.play(); } catch { window.alert('Could not play the recording.'); }
});

deleteButton.addEventListener('click', async () => {
  if (busy || recording || !window.confirm('Delete child recordings?')) return;
  busy = true;
  render();
  try {
    const response = await fetch('/clips?set=child', { method: 'DELETE' });
    if (!response.ok) throw new Error('delete');
    if (set === 'child') {
      clips.forEach((clip) => { clip.done = false; });
      playback.pause();
      playback.removeAttribute('src');
      playback.load();
    }
  } catch {
    window.alert('Could not delete child recordings.');
  } finally {
    busy = false;
    render();
  }
});

window.addEventListener('pagehide', () => {
  if (recorder?.state === 'recording') {
    recorder.onstop = null;
    recorder.stop();
  }
  stopTracks();
  void closeContext();
});

try {
  const response = await fetch('/clips');
  if (!response.ok) throw new Error('load');
  ({ set, clips } = await response.json());
  for (const [index, clip] of clips.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = String(index + 1);
    button.title = clip.name;
    button.addEventListener('click', () => jump(index));
    chipsElement.append(button);
  }
  busy = false;
  const firstPending = clips.findIndex((clip) => !clip.done);
  jump(firstPending === -1 ? 0 : firstPending);
} catch {
  window.alert('Could not load the clips.');
}
