// Public configuration the client needs to know.
const ALLOWED_MODELS_DEFAULT = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
];

export default function handler(req, res) {
  const allowedModels = (process.env.ALLOWED_MODELS || ALLOWED_MODELS_DEFAULT.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    require_token: Boolean(process.env.ACCESS_TOKEN),
    allowed_models: allowedModels,
    default_model: allowedModels[0],
  });
}
