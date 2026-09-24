export const HEADER_I18N = {
  fr: {
    tabFeed: "Feed",
    tabMoodboard: "Moodboard",
    tabSearch: "Search",
    tabForum: "Forum",
    tabProfile: "Profil",

    notifications: "Notifications",
    messages: "Messages",
    activity: "🔔 Activité",
    nothingNew: "Rien de nouveau pour l'instant.",
    markAllRead: "Tout marquer comme lu",

    gameInvite: (gameName, fromUser) => `🎮 ${gameName} — invitation de @${fromUser}`,
    gameInviteJoin: "Rejoindre",
    gameInviteDecline: "Refuser",
    gameNames: { chain: "LinkUp", timeline: "Timeline", cluescale: "Cluescale" },

    verb: (isMention, isThread) => isMention ? "t'a mentionné dans" : isThread ? "a répondu à" : "a commenté",
    place: (isMention, isThread, isMine) => isMention
      ? (isThread ? "un sujet" : "un post")
      : isThread
      ? (isMine ? "ton sujet" : "un sujet que tu suis")
      : (isMine ? "ton post" : "un post que tu suis"),
  },

  en: {
    tabFeed: "Feed",
    tabMoodboard: "Moodboard",
    tabSearch: "Search",
    tabForum: "Forum",
    tabProfile: "Profile",

    notifications: "Notifications",
    messages: "Messages",
    activity: "🔔 Activity",
    nothingNew: "Nothing new for now.",
    markAllRead: "Mark all as read",

    gameInvite: (gameName, fromUser) => `🎮 ${gameName} — invite from @${fromUser}`,
    gameInviteJoin: "Join",
    gameInviteDecline: "Decline",
    gameNames: { chain: "LinkUp", timeline: "Timeline", cluescale: "Cluescale" },

    verb: (isMention, isThread) => isMention ? "mentioned you in" : isThread ? "replied to" : "commented on",
    place: (isMention, isThread, isMine) => isMention
      ? (isThread ? "a thread" : "a post")
      : isThread
      ? (isMine ? "your thread" : "a thread you follow")
      : (isMine ? "your post" : "a post you follow"),
  },
};
