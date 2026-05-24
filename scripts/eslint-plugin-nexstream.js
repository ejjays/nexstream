/**
 * @fileoverview custom rules for comment style
 */

const nexstreamPlugin = {
  rules: {
    "nexstream-comments": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Enforce Nexstream comment style (Focus on 'why', not 'what')",
        },
        messages: {
          tooLong: "Comment is too long ({{count}} words). Keep it under 10 words and focus on 'why', not 'what'.",
          isWhatComment: "Comment explains 'what' the code does (mechanics). Senior code should be self-documenting; use comments only for 'why' (intent/context).",
          notLowercase: "Comment must be lowercase (except for uppercase acronyms).",
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;
        const acronyms = ["JSON", "API", "URL", "DB", "UI", "ID", "SSE", "OPFS", "FFMPEG", "JS", "TS", "CSS", "HTML", "GPU", "ISRC", "VITE", "CDN", "IP", "TCP", "UDP", "SSRF"];
        const whatWords = ["sets", "assigns", "calls", "creates", "initializes", "checks", "returns", "loops", "updates"];
        
        return {
          Program() {
            const comments = sourceCode.getAllComments();
            comments.forEach(comment => {
              const text = comment.value.trim();
              if (!text || text.includes("eslint-disable") || text.includes("eslint-enable") || text.startsWith("!") || text.startsWith("/")) return;

              const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
              
              // Rule: 10 words max (gives room for 'why')
              if (words.length > 10) {
                context.report({
                  loc: comment.loc,
                  messageId: "tooLong",
                  data: { count: words.length },
                });
              }

              // Rule: Flag 'what' comments
              if (words.some(w => whatWords.includes(w))) {
                context.report({
                  loc: comment.loc,
                  messageId: "isWhatComment",
                });
              }

              // Rule: lowercase except acronyms
              let checkText = text;
              acronyms.forEach(a => {
                checkText = checkText.split(a).join("");
              });

              if (/[A-Z]/.test(checkText)) {
                context.report({
                  loc: comment.loc,
                  messageId: "notLowercase",
                });
              }
            });
          },
        };
      },
    },
  },
};

export default nexstreamPlugin;

