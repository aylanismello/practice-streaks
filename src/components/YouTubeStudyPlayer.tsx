"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface YouTubePlayerInstance {
  destroy: () => void;
  getCurrentTime: () => number;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: (event: { target: YouTubePlayerInstance }) => void;
        onError?: () => void;
      };
    }
  ) => YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const priorReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      priorReady?.();
      if (window.YT) resolve(window.YT);
    };

    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

export interface YouTubeStudyPlayerHandle {
  currentTime: () => number;
  seekTo: (seconds: number) => void;
}

export const YouTubeStudyPlayer = forwardRef<YouTubeStudyPlayerHandle, { videoId: string }>(
  function YouTubeStudyPlayer({ videoId }, ref) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YouTubePlayerInstance | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [playerError, setPlayerError] = useState(false);

    useImperativeHandle(ref, () => ({
      currentTime: () => playerRef.current?.getCurrentTime() ?? currentTime,
      seekTo: (seconds: number) => {
        playerRef.current?.seekTo(seconds, true);
        playerRef.current?.playVideo();
      },
    }), [currentTime]);

    useEffect(() => {
      let cancelled = false;
      let poll: ReturnType<typeof setInterval> | null = null;
      setCurrentTime(0);
      setPlayerError(false);

      loadYouTubeApi().then((YT) => {
        if (cancelled || !hostRef.current) return;
        playerRef.current?.destroy();
        playerRef.current = new YT.Player(hostRef.current, {
          videoId,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: ({ target }) => {
              playerRef.current = target;
              poll = setInterval(() => {
                const time = target.getCurrentTime();
                if (Number.isFinite(time)) setCurrentTime(time);
              }, 500);
            },
            onError: () => setPlayerError(true),
          },
        });
      });

      return () => {
        cancelled = true;
        if (poll) clearInterval(poll);
        playerRef.current?.destroy();
        playerRef.current = null;
      };
    }, [videoId]);

    return (
      <div>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <div ref={hostRef} className="h-full w-full" />
        </div>
        {playerError && (
          <div className="mt-2 text-xs text-amber-400">
            YouTube could not play this video here. Use the external link while its visibility finishes updating.
          </div>
        )}
      </div>
    );
  }
);
