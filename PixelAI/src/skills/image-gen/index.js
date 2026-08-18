const BLOCKED_PATTERNS = [
  /\b(nsfw|nude|naked|porn|sex(ual)?|explicit|gore|violence|bloody|murder|kill|torture|behead)\b/i,
  /\b(hate\s+speech|racial\s+slur|ethnic\s+slur)\b/i,
  /\b(weapon|bomb|explosive|drug\s+paraphernalia)\b/i,
  /\b(child\s+abuse|csam|underage\s+nude)\b/i,
];

function containsBlockedContent(prompt) {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(prompt));
}

function extractPrompt(message, triggers) {
  let cleaned = message.trim();
  for (const trigger of triggers) {
    const regex = new RegExp(`^\\s*(?:please\\s+)?${escapeRegex(trigger)}\\s*[:\\-]?\\s*`, "i");
    cleaned = cleaned.replace(regex, "");
  }
  return cleaned.trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function generateWithStability(prompt, apiKey) {
  const response = await fetch(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        samples: 1,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const msg = body?.message || response.statusText;

    if (response.status === 400 && /content\s+policy/i.test(msg)) {
      throw new Error("CONTENT_POLICY");
    }
    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }
    throw new Error(`Stability API error (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const artifact = data?.artifacts?.[0];
  if (!artifact?.base64) {
    throw new Error("No image returned from Stability API");
  }
  return artifact.base64;
}

async function generateWithOpenAI(prompt, apiKey) {
  const response = await fetch(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const msg = body?.error?.message || response.statusText;

    if (response.status === 400 && /content[_\s]?policy|safety|violation/i.test(msg)) {
      throw new Error("CONTENT_POLICY");
    }
    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }
    throw new Error(`OpenAI API error (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const item = data?.data?.[0];
  if (!item?.b64_json) {
    throw new Error("No image returned from OpenAI API");
  }
  return item.b64_json;
}

const IMAGE_TRIGGERS = [
  "generate image",
  "create picture",
  "draw",
  "make image",
  "create image",
  "image of",
  "picture of",
  "illustration of",
  "artwork of",
];

export default {
  name: "image-gen",
  description: "Generate images from text descriptions using AI",
  triggers: IMAGE_TRIGGERS,

  async execute(message, context) {
    const prompt = extractPrompt(message, IMAGE_TRIGGERS);

    if (!prompt) {
      return {
        response:
          "What would you like me to generate? Describe the image and I'll create it for you.",
      };
    }

    if (prompt.split(/\s+/).length < 3) {
      return {
        response:
          "Could you describe the image in a bit more detail? A longer prompt produces better results.",
      };
    }

    if (containsBlockedContent(prompt)) {
      return {
        response:
          "I can't generate that image. Please describe something else that doesn't violate content policies.",
      };
    }

    const stabilityKey = process.env.STABILITY_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    let base64;
    let provider;

    try {
      if (stabilityKey) {
        base64 = await generateWithStability(prompt, stabilityKey);
        provider = "Stability AI";
      } else if (openaiKey) {
        base64 = await generateWithOpenAI(prompt, openaiKey);
        provider = "DALL-E 3";
      } else {
        return {
          response:
            "Image generation is not configured. Please set STABILITY_API_KEY or OPENAI_API_KEY.",
        };
      }
    } catch (err) {
      if (err.message === "CONTENT_POLICY") {
        return {
          response:
            "This prompt was flagged by the provider's content policy. Try rephrasing your request.",
        };
      }
      if (err.message === "RATE_LIMIT") {
        return {
          response:
            "Too many requests right now. Please try again in a moment.",
        };
      }
      console.error(`[image-gen] Generation failed (${provider ?? "unknown"}):`, err.message);
      return {
        response:
          "Something went wrong while generating the image. Please try again later.",
      };
    }

    const buffer = Buffer.from(base64, "base64");

    return {
      response: null,
      media: {
        type: "image",
        buffer,
        caption: `🎨 *Generated:* ${prompt}`,
      },
    };
  },

  isAvailable() {
    return !!(process.env.STABILITY_API_KEY || process.env.OPENAI_API_KEY);
  },
};
