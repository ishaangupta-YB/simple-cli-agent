import "dotenv/config";
import { GoogleGenAI } from "@google/genai";


const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!;
const CF_GATEWAY_NAME = process.env.CF_GATEWAY_NAME!;
const CF_AIG_TOKEN = process.env.CF_AIG_TOKEN!;

if (!CF_ACCOUNT_ID || !CF_GATEWAY_NAME || !CF_AIG_TOKEN) {
    console.error("Missing required environment variables.");
    console.error("Required: CF_ACCOUNT_ID, CF_GATEWAY_NAME, CF_AIG_TOKEN");
    process.exit(1);
}

export const DEFAULT_MODEL = "gemini-2.5-flash";

export const client = new GoogleGenAI({
    apiKey: CF_AIG_TOKEN,
    httpOptions: {
        baseUrl: `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_NAME}/google-ai-studio`,
    }
});