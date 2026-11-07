/**
 * Pre-flight checks and human explanations for audio file problems.
 *
 * Browsers only ever say "EncodingError: Unable to decode audio data", which
 * tells you nothing. This module checks what we can *before* decoding (empty,
 * obviously not audio, formats browsers never decode) and, when decoding does
 * fail, explains the likely reason for that particular file type.
 */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** Extensions browsers commonly decode (support varies a little by browser). */
export const AUDIO_EXTS = new Set(['mp3', 'wav', 'wave', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'mp4', 'm4v', 'webm', 'mov', 'aif', 'aiff', 'caf', 'weba', 'mka', 'mkv']);

/** Files we can tell are not decodable audio, with the reason why. */
const NEVER: Record<string, string> = {
  mid: 'MIDI files contain notes (which key, when, how hard), not recorded sound, so there is no waveform to analyse. Export the MIDI to WAV or MP3 from a music app first.',
  midi: 'MIDI files contain notes (which key, when, how hard), not recorded sound, so there is no waveform to analyse. Export the MIDI to WAV or MP3 from a music app first.',
  m4p: 'This is a DRM-protected iTunes purchase (.m4p). Browsers aren’t allowed to decode protected audio.',
  wma: 'Windows Media Audio (.wma) isn’t supported by any browser. Convert it to MP3, M4A or FLAC first.',
  ape: 'Monkey’s Audio (.ape) isn’t supported by browsers. Convert it to FLAC (also lossless) first.',
  alac: 'Apple Lossless isn’t decoded by most browsers. Convert it to FLAC (also lossless) first.',
  dsf: 'DSD audio (.dsf) isn’t supported by browsers. Convert it to FLAC or WAV first.',
  dff: 'DSD audio (.dff) isn’t supported by browsers. Convert it to FLAC or WAV first.',
  ra: 'RealAudio isn’t supported by browsers. Convert it to MP3 first.',
  amr: 'AMR voice recordings aren’t supported by most browsers. Convert to MP3 or M4A first.',
  m3u: 'This is a playlist: a list of file locations, not audio. Open one of the songs it lists instead.',
  m3u8: 'This is a playlist: a list of file locations, not audio. Open one of the songs it lists instead.',
  pls: 'This is a playlist: a list of file locations, not audio. Open one of the songs it lists instead.',
  cue: 'This is a CUE sheet (track timings for a CD rip), not audio. Open the audio file next to it instead.',
};

const KIND_NAMES: Record<string, string> = {
  pdf: 'a PDF document',
  png: 'an image',
  jpg: 'an image',
  jpeg: 'an image',
  gif: 'an image',
  webp: 'an image',
  svg: 'an image',
  txt: 'a text file',
  json: 'a JSON file (to open a saved project, use Import in the top bar)',
  zip: 'a zip archive (unzip it first, then open one of the audio files)',
  doc: 'a document',
  docx: 'a document',
};

/** Warn (but continue) above this; refuse above MAX. Decoded audio is ~10× the size of an MP3. */
const LARGE = 250 * 1024 ** 2;
const MAX = 1.5 * 1024 ** 3;

export interface PreCheck {
  ok: boolean;
  /** shown when ok is false */
  error?: string;
  /** shown as a non-blocking heads-up when ok is true */
  warning?: string;
}

export function preCheck(file: File): PreCheck {
  const ext = extOf(file.name);
  const name = `“${file.name}”`;
  if (file.size === 0)
    return {
      ok: false,
      error: `${name} is empty (0 bytes). If it’s in a cloud folder (Drive, iCloud, OneDrive), it may not be downloaded to this device yet.`,
    };
  if (NEVER[ext]) return { ok: false, error: `Can’t play ${name}. ${NEVER[ext]}` };
  const type = file.type;
  const isMedia = type.startsWith('audio/') || type.startsWith('video/') || AUDIO_EXTS.has(ext);
  if (!isMedia && (KIND_NAMES[ext] || /^(image|text)\//.test(type) || type === 'application/pdf')) {
    const what = KIND_NAMES[ext] ?? (type.startsWith('image/') ? 'an image' : type.startsWith('text/') ? 'a text file' : 'not an audio file');
    return { ok: false, error: `${name} is ${what}, not audio. Open an MP3, WAV, FLAC, OGG, Opus or M4A file.` };
  }
  if (file.size > MAX)
    return {
      ok: false,
      error: `${name} is ${formatBytes(file.size)}, too large to decode in the browser (it has to fit in memory uncompressed). Try a shorter excerpt or a compressed format.`,
    };
  const warning =
    file.size > LARGE ? `${name} is ${formatBytes(file.size)}; decoding a file this big can take a while and use a lot of memory.` : undefined;
  return { ok: true, warning };
}

/** Explain a failed `file.arrayBuffer()` (the browser couldn't read the bytes). */
export function explainReadError(file: File, e: unknown): string {
  const n = e instanceof DOMException ? e.name : '';
  const base = `Couldn’t read “${file.name}”`;
  if (n === 'NotFoundError') return `${base}: it was moved, renamed or deleted after you picked it. Pick it again.`;
  if (n === 'NotReadableError')
    return `${base}. The file may be locked by another app, or it’s a cloud placeholder (Drive, iCloud, OneDrive) that hasn’t been downloaded yet. Download it, then try again.`;
  if (e instanceof RangeError || n === 'QuotaExceededError') return `${base}: the browser ran out of memory. Try a smaller file.`;
  return `${base} (${e instanceof Error ? e.message : String(e)}).`;
}

/** Explain a failed `decodeAudioData` for this kind of file. */
export function explainDecodeError(file: File): string {
  const ext = extOf(file.name);
  const name = `“${file.name}”`;
  const size = formatBytes(file.size);
  const isFirefox = /firefox/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const byExt: Record<string, string> = {
    aif: isSafari ? '' : 'This browser can’t decode AIFF (Safari can). Convert it to WAV or FLAC, or try Safari.',
    aiff: isSafari ? '' : 'This browser can’t decode AIFF (Safari can). Convert it to WAV or FLAC, or try Safari.',
    m4a: 'M4A can hold AAC (plays everywhere) or Apple Lossless/ALAC (most browsers can’t decode it). If it came from iTunes/Music as “Lossless”, convert it to FLAC.',
    mp4: 'This video’s audio track may use a codec the browser can’t decode on its own (or it has no audio track at all).',
    mov: 'QuickTime files often use codecs browsers can’t decode. Export the audio as M4A or WAV.',
    mkv: 'Matroska files can hold many codecs; this one’s audio codec isn’t supported here.',
    opus: isSafari ? 'Older Safari versions can’t decode Opus. Update Safari or convert to M4A.' : '',
    ogg: isSafari ? 'Older Safari versions can’t decode Ogg Vorbis. Update Safari or convert to MP3/M4A.' : '',
    caf: isFirefox || !isSafari ? 'CAF (Core Audio Format) is mostly a Safari/Apple format. Convert it to WAV or M4A.' : '',
  };
  const specific = byExt[ext];
  const generic =
    'The file may be damaged or truncated (an incomplete download?), or use a codec this browser doesn’t support. If it plays in other apps, try converting it to MP3, WAV or FLAC.';
  return `Couldn’t decode ${name} (${size}${file.type ? `, ${file.type}` : ''}). ${specific || generic}`;
}

/** True if the decoded buffer is (near-)silent everywhere we look. */
export function isSilent(buf: AudioBuffer): boolean {
  const probes = 2048;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    const step = Math.max(1, Math.floor(d.length / probes));
    for (let i = 0; i < d.length; i += step) if (Math.abs(d[i]) > 1e-4) return false;
  }
  return true;
}
