import { useState, useRef, useEffect } from "react";
import { BACKEND_URL } from "../lib/config";
import { getSanitizedFilename } from "../lib/utils";
import { useProgress } from "./useProgress";
import { useSSE, handleSseMessage } from "./useSSE";
import { useNativeBridge } from "./useNativeBridge";
import { muxVideoAudio, transcodeToMp3 } from "../lib/muxer";

const generateUUID = () => {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.randomUUID
  ) {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const useMediaConverter = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [targetProgress, setTargetProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [subStatus, setSubStatus] = useState("");
  const [desktopLogs, setDesktopLogs] = useState([]);
  const [pendingSubStatuses, setPendingSubStatuses] = useState([]);
  const [videoTitle, setVideoTitle] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("mp4");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [isSpotifySession, setIsSpotifySession] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerData, setPlayerData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const titleRef = useRef("");

  const { progress, setProgress } = useProgress(
    loading,
    status,
    targetProgress,
    setTargetProgress,
  );
  const { readSse } = useSSE();

  const { requestClipboard, triggerMobileDownload } = useNativeBridge({
    setUrl,
    setLoading,
    setError,
    setProgress,
    setTargetProgress,
    setStatus,
    setSubStatus,
    setDesktopLogs,
    setPendingSubStatuses,
    setVideoTitle,
    setIsPickerOpen,
    setVideoData,
    setIsSpotifySession,
    setShowPlayer,
    setPlayerData,
    isPickerOpen,
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (pendingSubStatuses.length === 0) return;
    const nextStatus = pendingSubStatuses[0];
    if (nextStatus.startsWith("RECEIVING DATA:")) {
      setSubStatus(nextStatus);
      setPendingSubStatuses((prev) => prev.slice(1));
      return;
    }
    const timer = setTimeout(() => {
      setSubStatus(nextStatus);
      setPendingSubStatuses((prev) => prev.slice(1));
    }, 750);
    return () => clearTimeout(timer);
  }, [pendingSubStatuses, subStatus]);

  useEffect(() => {
    if (url.toLowerCase().includes("spotify.com")) {
      setSelectedFormat("mp3");
    }
  }, [url]);

  useEffect(() => {
    if (videoData?.previewUrl && videoData?.title && isPickerOpen) {
      if (!playerData || playerData.previewUrl !== videoData.previewUrl) {
        setPlayerData({
          title: videoData.title,
          artist: videoData.artist,
          imageUrl: videoData.cover,
          previewUrl: videoData.previewUrl,
        });
        setShowPlayer(true);
      }
    }
  }, [videoData?.previewUrl, videoData?.title, isPickerOpen, playerData]);

  const handleDownloadTrigger = async (e, overrideUrl) => {
    if (e) e.preventDefault();
    const finalUrl = overrideUrl || url;
    if (!finalUrl) {
      setError("Please enter a YouTube URL");
      return;
    }
    setLoading(true);
    setError("");
    setProgress(0);
    setTargetProgress(1);
    const isSpotify = finalUrl.toLowerCase().includes("spotify.com");
    setIsSpotifySession(isSpotify);
    if (isSpotify && !finalUrl.toLowerCase().includes("/track/")) {
      setError(
        "Please use a direct Spotify track link. Artist, Album, and Playlist links are not supported.",
      );
      setLoading(false);
      return;
    }
    setStatus("fetching_info");
    setPendingSubStatuses(["Connecting to API network..."]);
    setSubStatus("");
    setDesktopLogs(["Connecting to API network..."]);
    const clientId = generateUUID();
    const sseUrl = `${BACKEND_URL}/events?id=${clientId}`;
    readSse(
      sseUrl,
      (data) =>
        handleSseMessage(data, finalUrl, {
          setStatus,
          setVideoData,
          setIsPickerOpen,
          setPendingSubStatuses,
          setDesktopLogs,
          setTargetProgress,
          setProgress,
          setSubStatus,
        }),
      () => setError("Progress stream disconnected"),
    );
    try {
      await new Promise((r) => setTimeout(r, 500));
      const response = await fetch(
        `${BACKEND_URL}/info?url=${encodeURIComponent(finalUrl)}&id=${clientId}`,
        {
          headers: {
            "ngrok-skip-browser-warning": "true",
            "bypass-tunnel-reminder": "true",
          },
        },
      );
      if (!response.ok) throw new Error("Failed to fetch video details");
      const data = await response.json();
      setVideoData((prev) => ({
        ...prev,
        ...data,
        isPartial: !(data.formats && data.formats.length > 0),
        previewUrl:
          data.previewUrl ||
          data.spotifyMetadata?.previewUrl ||
          prev?.previewUrl,
      }));
      if (isSpotify) {
        setSelectedFormat("mp3");
        const spotify = data.spotifyMetadata;
        if (spotify?.previewUrl && !playerData) {
          setPlayerData({
            title: spotify.title,
            artist: spotify.artist,
            imageUrl: spotify.cover || spotify.imageUrl || data.cover,
            previewUrl: spotify.previewUrl,
          });
          setShowPlayer(true);
        }
      }
      
      const isFullData = data.formats && data.formats.length > 0;
      if (isFullData) {
        setTargetProgress(90);
        setProgress(90);
      } else {
        setTargetProgress(90);
      }

      setIsPickerOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (formatId, metadataOverrides = {}) => {
    if (loading && status === "downloading") return;
    setIsPickerOpen(false);
    setLoading(true);
    setError("");
    setStatus("initializing");
    setTargetProgress(5);
    setPendingSubStatuses(["Resolving High-Speed Stream Manifests..."]);
    setSubStatus("");
    setDesktopLogs([]);

    const finalTitle = metadataOverrides.title || videoData?.title || "";
    const artist = metadataOverrides.artist || videoData?.artist || "";
    setVideoTitle(finalTitle);
    titleRef.current = finalTitle;

    const clientId = generateUUID();
    let clientMuxSuccessful = false;

    const reportEME = async (event, data = {}) => {
      fetch(`${BACKEND_URL}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ event, data, clientId })
      }).catch(() => {});
    };

    try {
      const isSecure = window.isSecureContext;
      const hasSharedBuffer = typeof window.SharedArrayBuffer !== "undefined";
      
      setDesktopLogs(prev => [...prev, `[System] Checking engine compatibility...`]);
      setDesktopLogs(prev => [...prev, `[System] Secure Context: ${isSecure ? "YES" : "NO"}`]);
      setDesktopLogs(prev => [...prev, `[System] SharedArrayBuffer: ${hasSharedBuffer ? "YES" : "NO"}`]);

      const engineStatus = `[System] EME_STATUS: Secure Context (${isSecure ? "YES" : "NO"}), SharedArrayBuffer (${hasSharedBuffer ? "YES" : "NO"})`;
      setDesktopLogs(prev => [...prev, engineStatus]);

      if (!isSecure || !hasSharedBuffer) {
        reportEME('BYPASS', { reason: 'ENV_INCOMPATIBLE', isSecure, hasSharedBuffer });
        throw new Error("ENVIRONMENT_INCOMPATIBLE");
      }

      setDesktopLogs(prev => [...prev, `[System] Edge Muxing Engine: INITIALIZING...`]);
      reportEME('START', { url });

      const params = new URLSearchParams({
        url,
        id: clientId,
        formatId,
        targetUrl: videoData?.targetUrl || videoData?.spotifyMetadata?.targetUrl || "",
      });

      const selectedOption = (
        selectedFormat === "mp4" ? videoData?.formats : videoData?.audioFormats
      )?.find((f) => f.format_id === formatId);
      const videoHeight = selectedOption?.height || 0;

      const MAX_CLIENT_SIDE_RESOLUTION = 1080; 

      if (videoHeight > MAX_CLIENT_SIDE_RESOLUTION) {
        reportEME('BYPASS', { reason: 'RESOLUTION_TOO_HIGH', height: videoHeight });
        throw new Error("RESOLUTION_TOO_HIGH");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const urlResponse = await fetch(`${BACKEND_URL}/stream-urls?${params}`, {
        signal: controller.signal,
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });
      clearTimeout(timeoutId);

      if (urlResponse.ok) {
        const { videoUrl, audioUrl, filename } = await urlResponse.json();

        const onProgress = (s, p, extra) => {
          setStatus(s);
          setTargetProgress(p);
          if (extra.subStatus) setSubStatus(extra.subStatus);
          if (extra.subStatus) setDesktopLogs(prev => [...prev, extra.subStatus]);
        };

        const onLog = (msg) => setDesktopLogs(prev => [...prev, msg]);

        let blob;
        const proxyUrl = (u) => `${BACKEND_URL}/proxy?url=${encodeURIComponent(u)}`;
        const isVideo = selectedFormat === "mp4" || filename.endsWith(".mp4") || filename.endsWith(".webm");

        const fetchOptions = {
          headers: {
            "ngrok-skip-browser-warning": "true",
          },
        };

        if (isVideo && videoUrl && audioUrl) {
          blob = await muxVideoAudio(proxyUrl(videoUrl), proxyUrl(audioUrl), filename, onProgress, onLog, fetchOptions);
        } else if (selectedFormat === "mp3" && (audioUrl || videoUrl)) {
          blob = await transcodeToMp3(proxyUrl(audioUrl || videoUrl), filename.replace(".mp4", ".mp3").replace(".webm", ".mp3"), onProgress, onLog, fetchOptions);
        }

        if (blob) {
          setDesktopLogs(prev => [...prev, "[System] Edge Muxing Engine: SUCCESS. Saving to device..."]);
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = filename.replace(selectedFormat === "mp3" ? ".mp4" : ".none", selectedFormat === "mp3" ? ".mp3" : "").replace(selectedFormat === "mp3" ? ".webm" : ".none", selectedFormat === "mp3" ? ".mp3" : "");
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(downloadUrl);

          setTargetProgress(100);
          setProgress(100);
          setStatus("completed");
          setSubStatus("DOWNLOAD_READY_IN_BROWSER");
          setLoading(false);
          clientMuxSuccessful = true;
          reportEME('SUCCESS', { filename, size: blob.size });
          return;
        }
      }
    } catch (err) {
      let reason = "Muxer resolution failed";
      if (err.message === "ENVIRONMENT_INCOMPATIBLE") {
        reason = "Environment optimized for server-side";
      } else if (err.message.includes("FFmpeg load timeout")) {
        reason = "FFmpeg WASM load timed out";
      } else if (err.message === "RESOLUTION_TOO_HIGH") {
        reason = "Resolution too high for client-side";
      } else {
        reportEME('ERROR', { message: err.message });
      }
      setDesktopLogs(prev => [...prev, `[System] Edge Muxing Engine: BYPASSED (${reason})`]);
    }

    if (clientMuxSuccessful) return;

    setTargetProgress(10); 
    setPendingSubStatuses(["Connecting to Cloud Orchestrator..."]);
    setDesktopLogs(prev => [...prev, "[System] Falling back to server-side engine..."]);

    readSse(
      `${BACKEND_URL}/events?id=${clientId}`,
      (data) => {
        if (data.status === "error") {
          setError(data.message);
          setLoading(false);
          return;
        }
        if (data.status) setStatus(data.status);
        if (data.subStatus) {
          if (data.subStatus.startsWith("STREAM ESTABLISHED")) {
            setSubStatus(data.subStatus);
            setProgress(100);
            setTargetProgress(100);
          } else {
            setPendingSubStatuses((prev) => [...prev, data.subStatus]);
          }
          setDesktopLogs((prev) => [...prev, data.subStatus]);
        }
        if (data.details) setDesktopLogs((prev) => [...prev, data.details]);
        if (data.progress !== undefined) {
          setTargetProgress((prev) => Math.max(prev, data.progress));
          if (data.progress === 100) {
            setProgress(100);
            setTargetProgress(100);
          }
        }
        if (data.title && !metadataOverrides.title) {
          setVideoTitle(data.title);
          titleRef.current = data.title;
        }
        if (data.status === "downloading" && data.progress === 100) {
          setProgress(100);
          setTargetProgress(100);
          setTimeout(() => {
            setLoading(false);
            setStatus("completed");
          }, 800);
        }
      },
      (err) => {}
    );

    try {
      const selectedOption = (
        selectedFormat === "mp4" ? videoData?.formats : videoData?.audioFormats
      )?.find((f) => f.format_id === formatId);
      const finalFormatParam =
        selectedOption?.extension ||
        (formatId === "mp3" ? "mp3" : selectedFormat);
      const queryParams = new URLSearchParams({
        url,
        id: clientId,
        format: finalFormatParam,
        formatId,
        filesize: selectedOption?.filesize || "",
        title: finalTitle,
        artist,
        album: metadataOverrides.album || videoData?.album || "",
        year: videoData?.spotifyMetadata?.year || "",
        targetUrl:
          videoData?.targetUrl || videoData?.spotifyMetadata?.targetUrl || "",
      });
      const downloadUrl = `${BACKEND_URL}/convert?${queryParams.toString()}`;
      if (window.ReactNativeWebView) {
        const fileName = getSanitizedFilename(
          finalTitle,
          artist,
          finalFormatParam,
          url.includes("spotify.com"),
        );
        triggerMobileDownload({
          url: downloadUrl,
          fileName,
          mimeType: finalFormatParam === "mp3" ? "audio/mpeg" : "video/mp4",
        });
        return;
      }
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute(
        "download",
        getSanitizedFilename(
          finalTitle,
          artist,
          finalFormatParam,
          url.includes("spotify.com"),
        ),
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };


  const handlePaste = async () => {
    if (!requestClipboard()) {
      try {
        const text = await navigator.clipboard.readText();
        setUrl(text);
      } catch (err) {
      }
    }
  };

  return {
    url,
    setUrl,
    loading,
    error,
    progress,
    status,
    subStatus,
    desktopLogs,
    videoTitle,
    selectedFormat,
    setSelectedFormat,
    isPickerOpen,
    setIsPickerOpen,
    videoData,
    showPlayer,
    setShowPlayer,
    playerData,
    isMobile,
    isSpotifySession,
    handleDownloadTrigger,
    handleDownload,
    handlePaste,
  };
};