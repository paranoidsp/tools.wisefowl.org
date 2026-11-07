/**
 * Explanations for every global setting (layer, transform, colour mapping,
 * analysis, scene, modulation). Shown as label tooltips and, in "Describe
 * settings" mode, printed under each control. Kept in one place so the
 * wording stays consistent; per-viz params carry their own hints.
 *
 * Style: say what changes on screen, teach the concept in a clause, 1–2
 * sentences. Ranges/defaults are added automatically for numbers.
 */

export const LAYER_HELP = {
  presets:
    'Ready-made settings for this visualization. Picking one replaces its parameters and modulation, but keeps blend, opacity and position.',
  reset:
    'Put every parameter back to its default and remove all modulation. Blend, opacity and transform stay as they are.',
  blend:
    'How this layer’s pixels combine with the layers below it. Hover each option to see what it does; Add and Screen suit glowing shapes on a dark stage.',
  opacity:
    'How strongly this layer shows over the ones below. 0% hides it without deleting it; lower it to let a background layer show through.',
  trails:
    'Instead of clearing each frame, this layer’s last image fades out slowly, so moving shapes leave trails. Only this layer smears; Scene → Trails smears everything.',
};

export const TRANSFORM_HELP = {
  x: 'Slides the layer left or right. ±1 moves its centre to the stage’s side edge.',
  y: 'Slides the layer up or down (positive is down). ±1 moves its centre to the top or bottom edge.',
  scale: 'Zooms the layer around its centre. Below 1× it shrinks and the background shows around it; above 1× it crops into the middle.',
  rotation:
    'Turns the whole layer around its centre. Try duplicating a layer, rotating the copy and blending it with Screen for symmetric patterns.',
};

export const COLOR_HELP = {
  mode:
    'The rule that turns a frequency or note into a colour. Every visualization asks this mapping for its colours, so changing it recolours the whole stage.',
  hueStart: 'Hue for the lowest frequencies (20 Hz), in degrees round the colour wheel: 0 red, 120 green, 240 blue.',
  hueEnd: 'Hue for the highest frequencies (20 kHz). Low → high sweeps from Hue start to here; swap the two to flip the direction.',
  gradient:
    'Low frequencies take the left end of the gradient and high ones the right, on a log scale. Edit the stops, or click a preset below to start from one.',
  saturation: 'How vivid the colours are. 0 turns everything grey; 1 is as vivid as the screen can show for each hue.',
  lightness:
    'Base brightness of the palette. 0.5 shows the mode’s own colours; lower fades toward black, higher washes toward white and loses colour.',
  levelToLight:
    'How much loudness drives brightness. At 0 quiet and loud sounds look equally bright; at 1 quiet parts fade to black and only strong ones glow.',
  gamma:
    'Bends palette position before the colour lookup: below 1 spends more of the palette on the low end, above 1 on the high end. Note colours in pitch modes don’t change.',
  a4:
    'The pitch of the A above middle C. Pitch modes and the Pitch readout use it to decide which note a frequency is; try 432 or 415 (baroque) for music tuned that way.',
};

export const ANALYSIS_HELP = {
  fftSize:
    'How many samples each analysis looks at (FFT: splitting sound into frequency bins). Bigger = finer pitch detail but slower to react; 4096 is a good balance. Low notes need big sizes to be told apart.',
  freqScale:
    'How bands are spaced from Min to Max freq. The ear hears pitch as ratios, not steps of Hz, so log-like scales give each octave fair room. Also places Brightness.',
  bands:
    'How many bars the spectrum is grouped into, for visualizations that draw bands. More = finer detail but thinner, jumpier bars. Very many bands with a small FFT just interpolate.',
  minFreq: 'Lowest frequency the bands, Brightness and Pitch range cover. Raise it to ignore rumble; most musical bass starts around 40 Hz.',
  maxFreq:
    'Highest frequency the bands cover. Most musical energy sits below 10 kHz, so lowering this gives the mids and highs more bands each.',
  smoothing:
    'The analyser blends each frequency bin with its previous frames (a smoothing time constant). Higher = calmer, slower spectrum; lower = twitchy and instant.',
  minDb:
    'The quietest level that shows, in decibels (dB: a log scale of level where 0 dB is the loudest possible). Anything quieter reads as 0. Lower it to reveal faint detail, and noise.',
  maxDb:
    'The level that reads as full (1). Lower it if the spectrum never reaches the top; raise it if everything sits pinned at maximum.',
  gain:
    'Multiplies every normalized value (spectrum, bands, loudness, bass…) after the dB mapping. Turn it up for quiet input such as a distant microphone.',
  beatSensitivity:
    'How easily a sudden jump in energy, mostly in the low end, counts as a beat (onset detection). Higher catches softer hits but adds false beats; watch the dot by Tempo.',
  beatDecay:
    'How long the Beat pulse takes to fall from 1 back to 0 after each hit. Short = sharp flashes; long = soft swells that can blur into the next beat.',
  featureSmoothing:
    'Extra smoothing on loudness, bass/mid/treble, flux, brightness and pitch so they glide instead of flicker. Doesn’t touch the spectrum or bands.',
};

export const FFT_OPTION_HINTS: Record<number, string> = {
  1024: '≈47 Hz bins, ≈21 ms window: snappy, but bass notes blur together.',
  2048: '≈23 Hz bins, ≈43 ms window: quick; fine for drums and rhythm.',
  4096: '≈12 Hz bins, ≈85 ms window: balanced detail and speed.',
  8192: '≈6 Hz bins, ≈170 ms window: tells bass notes apart, reacts later.',
  16384: '≈3 Hz bins, ≈340 ms window: finest pitch, visibly smeared in time.',
};

export const FREQ_SCALE_OPTIONS = [
  { value: 'log', label: 'Log', tip: 'Log: equal width per octave, like a piano keyboard. Best for music and pitch.' },
  { value: 'mel', label: 'Mel', tip: 'Mel: a perceptual pitch scale, near-linear below ~700 Hz and logarithmic above. Common in speech analysis.' },
  { value: 'bark', label: 'Bark', tip: 'Bark: follows the ear’s ~24 critical bands, where nearby sounds mask each other. Squeezes the highs.' },
  { value: 'linear', label: 'Lin', tip: 'Linear: equal Hz per band, like the raw FFT. Most bands go to treble and bass gets only a few.' },
] as const;

export const SCENE_HELP = {
  background:
    'Colour behind all layers. Trails fade toward it and blends like Multiply or Difference react to it, so it changes more than the empty areas.',
  aspect: 'The stage’s shape. Fill uses all the space; fixed ratios letterbox it, so recordings and snapshots come out at that shape.',
  renderScale:
    'Pixels drawn per screen pixel, as a multiple of your display’s devicePixelRatio (capped at 2 overall). Lower is faster and softer; higher is sharper.',
  trails:
    'Each frame paints the background only partly over the last, so everything leaves fading smears. Near 0.99 builds long light-painting streaks.',
  glow: 'Adds a blurred, slightly brightened copy of the stage back on top (Screen blend), so bright shapes bloom like lights in fog.',
  glowRadius: 'How far the glow spreads. Small = a tight halo; large = soft haze across the stage. Large radii can slow older machines.',
  vignette: 'Darkens the edges and corners toward black, drawing the eye to the centre like an old lens.',
  grain: 'Overlays flickering film-like noise. A little hides colour banding in dark gradients and makes the image feel analogue.',
};

export const ASPECT_OPTIONS = [
  { value: 'fill', label: 'Fill', tip: 'Use all the space the window gives the stage.' },
  { value: '16:9', label: '16:9', tip: 'Widescreen video: monitors, YouTube.' },
  { value: '1:1', label: '1:1', tip: 'Square: social posts, album art.' },
  { value: '9:16', label: '9:16', tip: 'Vertical: phones, Reels, Shorts.' },
  { value: '4:3', label: '4:3', tip: 'Classic TV and projector shape.' },
] as const;

export const MOD_HELP = {
  header: 'Modulation moves this value with the sound: value = base + amount × range × feature. Features run 0–1; the result stays within the range.',
  pick: 'Pick a source. Its live level shows in each meter; the slider value becomes the resting point the audio pushes from.',
  amount:
    'How far the feature pushes the value, as a share of the parameter’s full range. Negative amounts push it down instead of up.',
  smooth:
    'Slows the response so the value glides instead of jittering. 0 follows the feature instantly; near 0.99 changes take a second or two.',
};
