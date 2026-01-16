import "dotenv/config";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!;
const CF_GATEWAY_NAME = process.env.CF_GATEWAY_NAME!;
const CF_AIG_TOKEN = process.env.CF_AIG_TOKEN!;

if (!CF_ACCOUNT_ID || !CF_GATEWAY_NAME || !CF_AIG_TOKEN) {
    console.error("Missing required environment variables.");
    console.error("Required: CF_ACCOUNT_ID, CF_GATEWAY_NAME, CF_AIG_TOKEN");
    process.exit(1);
}


// import OpenAI from "openai";

// const client = new OpenAI({
//     apiKey: CF_AIG_TOKEN,
//     baseURL: `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_NAME}/compat`,
// });

// const response = await client.chat.completions.create({
//     model: "google-ai-studio/gemini-2.5-pro",
//     messages: [{ role: "user", content: "Hello, world!" }],
// });

// console.log(response.choices[0].message.content);


import { ContentListUnion, GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: CF_AIG_TOKEN,
    httpOptions: {
        baseUrl: `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_NAME}/google-ai-studio`,
    }
});

const contents: ContentListUnion = "What is Cloudflare?";

const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents,
    config: {
        systemInstruction: "You are a helpful assistant.",
    }
});


console.log(response);