import "server-only";

import { GoogleGenAI } from "@google/genai";

import { requireEnv } from "@/lib/env/server";

let client: GoogleGenAI | undefined;

export function getGeminiClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return client;
}
