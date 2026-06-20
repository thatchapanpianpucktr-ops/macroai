export const APIKEY_PROMPT_EVENT = "macroai:apikey-prompt";

/** Open the "add your Gemini key" popup from anywhere. */
export function openApiKeyPrompt() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APIKEY_PROMPT_EVENT));
  }
}
