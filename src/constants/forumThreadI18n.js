export const FORUM_THREAD_I18N = {
  fr: {
    // NewThreadModal
    newThreadHeader: "➕ Nouveau sujet",
    titlePlaceholder: "Titre du sujet…",
    bodyPlaceholder: "De quoi veux-tu parler ? (@ pour mentionner)",
    imageUploading: "⏳ Upload…",
    imageChange: "🖼 Changer l'image",
    imageAdd: "🖼 Ajouter une image",
    tagsLabel: "Tags",
    tagsHint: (max) => `(optionnel, ${max} max)`,
    errRequired: "Titre et message obligatoires.",
    errCreate: "Impossible de publier — le forum n'est peut-être pas encore configuré côté base de données (voir supabase/forum_schema.sql).",
    publishing: "Publication…",
    publish: "Publier",

    // ThreadModal
    replyCount: (n) => `${n} réponse${n !== 1 ? "s" : ""}`,
    noReplies: "Aucune réponse pour l'instant — sois le premier·e.",
    replyPlaceholder: "Écrire une réponse… (@ pour mentionner)",
    errReply: "Impossible d'envoyer la réponse — le forum n'est peut-être pas encore configuré côté base de données.",
    sending: "Envoi…",
    reply: "Répondre",
  },

  en: {
    // NewThreadModal
    newThreadHeader: "➕ New topic",
    titlePlaceholder: "Topic title…",
    bodyPlaceholder: "What do you want to talk about? (@ to mention)",
    imageUploading: "⏳ Uploading…",
    imageChange: "🖼 Change image",
    imageAdd: "🖼 Add an image",
    tagsLabel: "Tags",
    tagsHint: (max) => `(optional, ${max} max)`,
    errRequired: "Title and message are required.",
    errCreate: "Couldn't publish — the forum may not be set up on the database side yet (see supabase/forum_schema.sql).",
    publishing: "Publishing…",
    publish: "Publish",

    // ThreadModal
    replyCount: (n) => `${n} repl${n !== 1 ? "ies" : "y"}`,
    noReplies: "No replies yet — be the first.",
    replyPlaceholder: "Write a reply… (@ to mention)",
    errReply: "Couldn't send the reply — the forum may not be set up on the database side yet.",
    sending: "Sending…",
    reply: "Reply",
  },
};
