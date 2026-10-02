export type YouTubePlayer = {
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

type YouTubeAPI = {
  Player: new (iframe: HTMLIFrameElement, options: {
    events: { onReady: (event: { target: YouTubePlayer }) => void };
  }) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YouTubeAPI> | null = null;

// Load once, on demand. The API's callback fires after its widget script is ready.
export function loadYouTubePlayer(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
      script.onerror = null;
      if (error) { script.remove(); loading = null; reject(error); }
      else resolve(window.YT!);
    };
    const ready = () => {
      if (!window.YT?.Player) return;
      finish();
      previous?.();
    };
    const timeout = setTimeout(() => finish(new Error("YouTube player API timed out")), 15000);
    window.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => finish(new Error("YouTube player API unavailable"));
    document.head.append(script);
  });
  return loading;
}
