import "server-only";

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { requireEnv } from "@/lib/env/server";

let openai: OpenAI | undefined;
let gemini: GoogleGenAI | undefined;

export function getOpenAIClient(): OpenAI {
  openai ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return openai;
}

export function getGeminiClient(): GoogleGenAI {
  gemini ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return gemini;
}
