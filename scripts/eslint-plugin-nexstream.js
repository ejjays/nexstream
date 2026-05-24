/**
 * @fileoverview Custom rules for Nexstream comment style
 */

import path from 'node:path';

const ACRONYMS = new Set([
  "JSON", "API", "URL", "DB", "UI", "ID", "SSE", "OPFS", "FFMPEG", 
  "JS", "TS", "CSS", "HTML", "GPU", "ISRC", "VITE", "CDN", "IP", 
  "TCP", "UDP", "SSRF", "IPv4", "IPv6", "IPs", "LD", "JSON-LD",
  "IIFE", "MSW", "OG", "HD", "E2E", "MD5", "SHA", "UI", "NEXSTREAM",
  "GETVIDEOINFO", "PASSTHROUGH", "RESPONSE", "URLS"
]);

const WHAT_WORDS = new Set([
  "sets", "assigns", "calls", "creates", "initializes", 
  "checks", "returns", "loops", "updates"
]);

const URL_REGEX = /https?:\/\/[^\s]+/g;
const CODE_REF_REGEX = /`[^`]+`/g;
const PUNCTUATION_REGEX = /[.,;:'"!?[\](){}]/g;

const nexstreamPlugin = {
  rules: {
    "no-raw-fetch": {
      meta: {
        type: "problem",
        docs: { description: "Force use of secureFetch instead of raw fetch" },
        messages: {
          useSecureFetch: "Raw fetch() is forbidden for security (SSRF). Use secureFetch() from src/utils/network/security.util.ts",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.name === "fetch") {
              const filename = context.filename || context.getFilename();
              if (filename.includes("security.util.ts")) return;
              if (filename.includes("tests/")) return; // allow in tests for now
              
              context.report({ node, messageId: "useSecureFetch" });
            }
          },
        };
      },
    },
    "no-raw-spawn": {
      meta: {
        type: "problem",
        docs: { description: "Force use of service wrappers instead of raw spawn" },
        messages: {
          useService: "Raw spawn() is forbidden. Use ytdlp.service.ts or other service-layer wrappers for process management.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.name === "spawn") {
              const filename = context.filename || context.getFilename();
              if (filename.includes("ytdlp.service.ts")) return;
              if (filename.includes("services/ytdlp/")) return;
              if (filename.includes("routes/remix.routes.ts")) return;
              if (filename.includes("utils/media/video.util.ts")) return;
              if (filename.includes("tests/")) return;
              
              context.report({ node, messageId: "useService" });
            }
          },
        };
      },
    },
    "nexstream-comments": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Enforce Nexstream comment style (Focus on 'why', not 'what')",
        },
        messages: {
          tooLong: "Comment is too long ({{count}} words). Keep it under 10 words and focus on 'why'.",
          isWhatComment: "Comment explains 'what' (mechanics). Use comments only for 'why' (intent). Flagged word: '{{word}}'",
          notLowercase: "Comment must be lowercase. Flagged word: '{{word}}' (Not in approved acronyms list).",
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;

        return {
          Program() {
            const comments = sourceCode.getAllComments();

            for (const comment of comments) {
              const rawText = comment.value.trim();

              if (
                !rawText ||
                rawText.startsWith("*") || 
                rawText.includes("eslint-") ||
                rawText.startsWith("!") ||
                rawText.startsWith("/") 
              ) {
                continue;
              }

              const cleanText = rawText
                .replace(URL_REGEX, "")
                .replace(CODE_REF_REGEX, "");

              const tokens = cleanText.split(/\s+/).map(w => w.replace(PUNCTUATION_REGEX, "")).filter(Boolean);
              
              if (tokens.length === 0) continue;

              if (tokens.length > 10) {
                context.report({
                  loc: comment.loc,
                  messageId: "tooLong",
                  data: { count: tokens.length },
                });
              }

              let hasWhatWord = false;
              let hasInvalidUppercase = false;

              for (const word of tokens) {
                if (!hasWhatWord && WHAT_WORDS.has(word.toLowerCase())) {
                  context.report({
                    loc: comment.loc,
                    messageId: "isWhatComment",
                    data: { word },
                  });
                  hasWhatWord = true;
                }

                if (!hasInvalidUppercase && /[A-Z]/.test(word)) {
                  if (!ACRONYMS.has(word)) {
                    context.report({
                      loc: comment.loc,
                      messageId: "notLowercase",
                      data: { word },
                    });
                    hasInvalidUppercase = true;
                  }
                }
              }
            }
          },
        };
      },
    },
  },
};

export default nexstreamPlugin;


