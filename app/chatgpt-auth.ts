// Compatibility export for existing imports. The implementation lives in src/lib.
export {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
  requireChatGPTUser,
  type ChatGPTUser,
} from "@/src/lib/auth/chatgpt-auth";
