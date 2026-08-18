# image-gen

Generate images from text descriptions using AI image generation APIs.

## Overview

| Property     | Value                                                      |
| ------------ | ---------------------------------------------------------- |
| **Name**     | `image-gen`                                                |
| **Type**     | Skill                                                      |
| **Triggers** | `generate image`, `create picture`, `draw`, `make image`, `create image`, `image of`, `picture of`, `illustration of`, `artwork of` |
| **Export**   | ES module default export                                   |

## Environment Variables

| Variable              | Required | Description                          |
| --------------------- | -------- | ------------------------------------ |
| `STABILITY_API_KEY`   | One of*  | Stability AI API key (SDXL 1.0)     |
| `OPENAI_API_KEY`      | One of*  | OpenAI API key for DALL-E 3          |

\* At least one API key must be configured. Stability AI is preferred; OpenAI serves as a fallback.

## Usage

Send a message containing one of the trigger phrases followed by a description:

```
generate image a cat wearing a top hat sitting on a throne
draw a futuristic cityscape at sunset
picture of a serene Japanese garden with cherry blossoms
create image pixel art of a retro video game character
```

The skill returns a generated image with the prompt as the caption.

## Behavior

1. **Prompt extraction** — Trigger phrases are stripped from the beginning of the message to isolate the image description.
2. **Minimum length** — If the extracted prompt is fewer than 3 words, the bot requests more detail.
3. **Safety filter** — Prompts matching blocked content patterns (violence, NSFW, hate speech, weapons, CSAM) are refused before any API call.
4. **Provider selection** — Stability AI is used when `STABILITY_API_KEY` is set. If not, OpenAI DALL-E 3 is used when `OPENAI_API_KEY` is set. If neither is available, the user is informed.
5. **Error handling** — Content policy violations and rate limits produce user-friendly messages. Other errors are logged internally and surfaced gracefully.
6. **Availability** — `isAvailable()` returns `true` only when at least one API key is present in the environment.

## Response Format

```js
{
  response: null,
  media: {
    type: "image",
    buffer: Buffer,         // PNG image data
    caption: "🎨 *Generated:* <prompt>"
  }
}
```

On error or missing prompt, `response` contains a text message and `media` is omitted.

## API Details

### Stability AI (preferred)

- **Endpoint:** `POST https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image`
- **Model:** SDXL 1.0
- **Image size:** 1024×1024
- **Auth:** `Bearer <STABILITY_API_KEY>`

### OpenAI DALL-E 3 (fallback)

- **Endpoint:** `POST https://api.openai.com/v1/images/generations`
- **Model:** `dall-e-3`
- **Image size:** 1024×1024
- **Auth:** `Bearer <OPENAI_API_KEY>`

## Integration Example

```js
import imageGen from "./skills/image-gen/index.js";

const message = "generate image a cyberpunk street market";
const result = await imageGen.execute(message, {});

if (result.media) {
  await whatsappClient.sendMessage(chatId, result.media.buffer, {
    caption: result.media.caption,
  });
} else {
  await whatsappClient.sendMessage(chatId, result.response);
}
```

## Safety

Prompts are checked against regex patterns before any external API call. Blocked categories include:

- Explicit/NSFW content
- Violence and gore
- Hate speech and slurs
- Weapons and explosives
- Child sexual abuse material

Users receive a clear refusal message and are invited to rephrase.
