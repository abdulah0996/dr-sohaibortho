const OpenAIModule = require("openai");
const { config } = require("../config/env");
const { logError } = require("../utils/safeLogger");

const OpenAI = OpenAIModule.default || OpenAIModule;
const toFile = OpenAIModule.toFile || OpenAI.toFile;
const AUDIO_MIME_TYPES = Object.freeze([
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/wav", "audio/webm"
]);
const EXTENSIONS = Object.freeze({
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
  "audio/amr": "amr", "audio/wav": "wav", "audio/webm": "webm"
});
let testClient;

function setTranscriptionClientForTests(client) {
  if (config.nodeEnv !== "test") throw new Error("Transcription injection is only available in tests.");
  testClient = client;
}

function confidenceFromLogprobs(logprobs) {
  const values = (logprobs || []).map((item) => item.logprob).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + Math.exp(value), 0) / values.length;
}

function createTranscriptionService(deps = {}) {
  const enabled = deps.enabled ?? config.ai.enabled;
  const client = deps.client || testClient || (enabled && config.ai.apiKey ? new OpenAI({
    apiKey: config.ai.apiKey,
    timeout: config.ai.timeoutMs,
    maxRetries: config.ai.maxRetries
  }) : null);

  return async function transcribe({ buffer, mimeType }) {
    if (!client) return { ok: false, reason: "provider_unavailable" };
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > config.ai.maxAudioBytes || !AUDIO_MIME_TYPES.includes(mimeType)) {
      return { ok: false, reason: "invalid_audio" };
    }
    const startedAt = Date.now();
    try {
      const response = await client.audio.transcriptions.create({
        file: await toFile(buffer, `voice-note.${EXTENSIONS[mimeType] || "ogg"}`, { type: mimeType }),
        model: config.ai.transcriptionModel,
        response_format: "json",
        include: ["logprobs"],
        prompt: "A clinic appointment request in Urdu, Roman Urdu, English, or mixed language."
      });
      const text = String(response.text || "").trim().slice(0, 2000);
      const measured = confidenceFromLogprobs(response.logprobs);
      const confidence = measured ?? (text.length >= 3 ? 1 : 0);
      console.info("ai.transcription", {
        outcome: "success",
        latencyMs: Date.now() - startedAt,
        audioBytes: buffer.length,
        confidenceBucket: confidence < 0.55 ? "low" : confidence < 0.8 ? "medium" : "high",
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens
      });
      return { ok: Boolean(text), text, confidence };
    } catch (error) {
      logError("AI transcription failed", error, { latencyMs: Date.now() - startedAt, audioBytes: buffer.length });
      return { ok: false, reason: "provider_failure" };
    }
  };
}

module.exports = { AUDIO_MIME_TYPES, confidenceFromLogprobs, createTranscriptionService, setTranscriptionClientForTests };
