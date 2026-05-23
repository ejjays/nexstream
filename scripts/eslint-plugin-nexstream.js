/**
 * @fileoverview custom rules for comment style
 */

const nexstreamPlugin = {
  rules: {
    "nexstream-comments": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Enforce Nexstream comment style (3 words max, lowercase, uppercase acronyms)",
        },
        messages: {
          tooLong: "Comment must be 3 words or less. Found {{count}} words.",
          notLowercase: "Comment must be lowercase (except for uppercase acronyms).",
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;
        const acronyms = ["JSON", "API", "URL", "DB", "UI", "ID", "SSE", "OPFS", "FFMPEG", "JS", "TS", "CSS", "HTML", "GPU", "ISRC"];
        
        return {
          Program() {
            const comments = sourceCode.getAllComments();
            comments.forEach(comment => {
              const text = comment.value.trim();
              if (!text || text.includes("eslint-disable") || text.includes("eslint-enable")) return;

              // Rule: 3 words max
              const words = text.split(/\s+/).filter(w => w.length > 0);
              if (words.length > 3) {
                context.report({
                  loc: comment.loc,
                  messageId: "tooLong",
                  data: { count: words.length },
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
