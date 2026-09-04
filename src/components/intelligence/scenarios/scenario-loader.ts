import { SCENARIO_PRESETS, type ScenarioId } from "../config/scenario-config";

/**
 * Loads a real preset hazard image from public/presets/
 * Checks .jpg, .jpeg, .png, and .webp extensions automatically.
 */
export async function loadPresetImage(
  scenarioId: ScenarioId
): Promise<{ bitmap: ImageBitmap; url: string }> {
  const preset = SCENARIO_PRESETS.find((p) => p.id === scenarioId);
  if (!preset) {
    throw new Error(`Unknown scenario preset ID: ${scenarioId}`);
  }

  // Search all name candidates and extensions
  const nameCandidates = [
    preset.filename.replace(/\.[^/.]+$/, ""),
    ...preset.aliases,
    preset.id,
  ];
  const uniqueNames = Array.from(new Set(nameCandidates));
  const extensions = [".jpg", ".jpeg", ".png", ".webp"];

  for (const name of uniqueNames) {
    for (const ext of extensions) {
      const candidates = [`/presets/${name}${ext}`, `/${name}${ext}`];
      for (const candidateUrl of candidates) {
        try {
          const response = await fetch(candidateUrl);
          if (response.ok) {
            const blob = await response.blob();
            // Verify valid image content
            if (blob.size > 200) {
              const bitmap = await createImageBitmap(blob);
              return { bitmap, url: candidateUrl };
            }
          }
        } catch {
          // Continue to next candidate
        }
      }
    }
  }

  // Fallback: try primary imagePath directly
  try {
    const fallbackResponse = await fetch(preset.imagePath);
    if (fallbackResponse.ok) {
      const blob = await fallbackResponse.blob();
      if (blob.size > 200) {
        const bitmap = await createImageBitmap(blob);
        return { bitmap, url: preset.imagePath };
      }
    }
  } catch {
    // Continue to canvas fallback if image file is not yet copied into public/presets/
  }

  // Graceful fallback if image is missing from public/presets/
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(preset.label, 320, 220);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(`Add image: public/presets/${preset.filename}`, 320, 260);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error(`Failed to generate fallback for ${scenarioId}`));
        return;
      }
      const url = URL.createObjectURL(blob);
      const bitmap = await createImageBitmap(blob);
      resolve({ bitmap, url });
    }, "image/jpeg", 0.9);
  });
}
