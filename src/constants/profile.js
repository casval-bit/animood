export const DEFAULT_PROFILE = {
  id:"", name:"", avatar:"🎮", bio:"",
  avatar_base64: null,
  banner: null,           // Cloudinary URL for profile banner
  activeBadge: null,      // Selected badge id
  watched:[], statuses:{}, ratings:{},
  favorites:[null,null,null,null,null],
  highlights:[],
  hiddenCompleted:[], posts:[],
  customLists:[], pinnedList:null,
  anilistSubLists:{}, // { [malId]: string[] } — imported from AniList's custom (sub-)lists
};
