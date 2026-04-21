# `@roostjs/ai/media`

Image generation, TTS, and transcription with a uniform builder shape.

## `Image.of(prompt)`

```ts
import { Image } from '@roostjs/ai/media/image';

const png = await Image.of('a happy dog')
  .square()
  .quality('high')
  .generate();

await Image.of('portrait')
  .portrait()
  .store({ bucket: 'R2_IMAGES', key: 'hero.png' });
```

Aspect shortcuts: `.square()`, `.portrait()`, `.landscape()`.

Queue for async work:

```ts
Image.of('poster')
  .queue()
  .then((img) => notifyUser(img.url));
```

## `Audio.of(text)`

```ts
import { Audio } from '@roostjs/ai/media/audio';

const mp3 = await Audio.of('Hello world')
  .female()
  .voice('warm')
  .instructions('Speak with enthusiasm')
  .generate();
```

## `Transcription.fromX()`

```ts
import { Transcription } from '@roostjs/ai/media/transcription';

const result = await Transcription.fromStorage('R2_AUDIO', 'call.wav')
  .diarize()
  .generate();

console.log(result.text);
console.log(result.segments);
```

Alternatives: `Transcription.fromPath('/tmp/a.wav')`, `Transcription.fromUpload(req.file())`.

## Fakes

```ts
Image.fake(); Audio.fake(); Transcription.fake();

Image.assertGenerated((r) => r.prompt.includes('dog'));
Audio.assertNothingGenerated();
Transcription.assertTranscribed();
```
