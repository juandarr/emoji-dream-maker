export class YouTubeError extends Error {
  constructor(public reason: "setup" | "credentials" | "quota" | "timeout" | "network", message: string) {
    super(message);
  }
}
