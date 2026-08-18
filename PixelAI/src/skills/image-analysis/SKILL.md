# Image Analysis Skill

Analyze and describe images sent by users via WhatsApp.

## Trigger

This skill does not activate on text messages. It is invoked by the **media-handler** when a user sends an image attachment.

## Behavior

1. Reads the image from `context.imageBuffer` (Buffer) or `context.imagePath` (file path).
2. Takes the user's accompanying text as the analysis question, defaulting to *"Describe this image in detail."*.
3. Sends the image as a base64-encoded payload to the **OpenAI GPT-4o** vision endpoint.
4. Returns the analysis prefixed with `🖼️ *Image Analysis:*`.

## Required Environment Variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Auth token for the OpenAI Chat Completions API (GPT-4o vision). |

Without this key the skill responds with a setup instruction instead of analyzing.

## Output Format

```
🖼️ *Image Analysis:*

<model response here>
```

## Error Handling

- Missing image buffer — returns a prompt asking the user to send an image.
- Missing API key — returns setup instructions.
- API / network failure — logs the error and returns a user-friendly fallback message.
