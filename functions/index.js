const functions = require("firebase-functions");
const {setGlobalOptions} = functions;
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

setGlobalOptions({maxInstances: 10, region: "us-central1"});

admin.initializeApp();

const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_KEY = defineSecret("OPENAI_KEY");

/**
 * Parse the model output into an array of suggestion strings.
 */
function parseSuggestions(rawText) {
  if (!rawText || typeof rawText !== "string") return [];
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item)
        .slice(0, 3);
    }
  } catch (err) {
    logger.error("Failed to parse suggestions JSON", err);
  }
  return [];
}

async function replaceSuggestions(sessionId, suggestions, sourceMessageId) {
  const suggestionsRef = admin
    .firestore()
    .collection("sessions")
    .doc(sessionId)
    .collection("suggestions");

  const existing = await suggestionsRef.get();
  const batch = admin.firestore().batch();

  existing.forEach((doc) => {
    batch.delete(doc.ref);
  });

  suggestions.forEach((text) => {
    const docRef = suggestionsRef.doc();
    batch.set(docRef, {
      text,
      sourceMessageId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
}

exports.generateSuggestions = onDocumentCreated(
  {
    document: "sessions/{sessionId}/messages/{messageId}",
    secrets: [OPENAI_KEY]
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const role = (data?.role || "").toLowerCase();
    if (role !== "manager") return;

    const messageText = (data?.text || "").trim();
    if (!messageText) return;

    const apiKey = OPENAI_KEY.value() || process.env.OPENAI_KEY;
    if (!apiKey) {
      logger.error("OpenAI API key is not set in functions config (openai.key).");
      return;
    }

    const systemPrompt =
      "You draft short friendly quick replies for a digital worker controlled by a human. " +
      "Suggest 2 or 3 options. If clarification is needed, suggest a follow-up question. " +
      "Keep each reply under 15 words. Return a JSON array of strings only.";

    let suggestions = [];
    try {
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {role: "system", content: systemPrompt},
            {role: "user", content: messageText}
          ],
          max_output_tokens: 120
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error("OpenAI API error", {status: response.status, body: errText});
      } else {
        const payload = await response.json();
        const rawOutput =
          payload?.output_text ||
          payload?.output?.[0]?.content?.[0]?.text ||
          payload?.output?.text ||
          "";

        suggestions = parseSuggestions(rawOutput);
      }
    } catch (err) {
      logger.error("Failed to generate suggestions", err);
    }

    try {
      await replaceSuggestions(
        event.params.sessionId,
        suggestions,
        event.params.messageId
      );
      logger.info("Suggestions updated", {
        sessionId: event.params.sessionId,
        count: suggestions.length
      });
    } catch (err) {
      logger.error("Failed to write suggestions to Firestore", err);
    }
  }
);
