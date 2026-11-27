import { useState, useEffect, useMemo, useRef } from "react"
import {
    getPlayerState,
    getQueue,
    getRecentlyPlayedTrack,
    playPause,
    seekToPosition,
    setShuffle,
    setRepeatMode,
    skipToNext,
    skipToPrevious,
} from "../utils/spotify"
import {
    FaSpotify,
    FaShuffle,
    FaForwardStep,
    FaBackwardStep,
    FaPause,
    FaPlay,
    FaRepeat,
    FaListUl,
    FaXmark,
} from "react-icons/fa6"
import { AnimatePresence, motion } from "framer-motion"
import { getReadableTextColor, applyOpacity } from "~/utils/colorUtils"
import {
    getValidSpotifyAccessToken,
    handleSpotifyCallback,
    logoutSpotify,
    startSpotifyLogin,
} from "../utils/spotifyAuth"
import { useToaster } from "./Toaster"
import { Vibrant } from "node-vibrant/browser"
import { oklch, formatRgb } from "culori"
import type { Oklch } from "culori"

interface Track {
    id?: string
    uri?: string
    title: string
    artist: string
    album: string
    coverUrl: string
    duration: number
    progress: number
}
interface QueueTrack {
    uri?: string
    title: string
    artist: string
    album: string
    coverUrl: string
}
function LiquidWaveOverlay({
    color,
    isPlaying,
    widthPercent,
}: {
    color: string
    isPlaying: boolean
    widthPercent: number
}) {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const path1Ref = useRef<SVGPathElement | null>(null)
    const path2Ref = useRef<SVGPathElement | null>(null)
    const ampRef = useRef(isPlaying ? 1 : 0)
    const isPlayingRef = useRef(isPlaying)
    isPlayingRef.current = isPlaying

    useEffect(() => {
        let rafId = 0
        let lastTs = performance.now()
        let phase = 0

        const H = 26

        // 5차 스무스스텝: 양끝 기울기(1차)와 곡률(2차) 모두 0으로 수렴해 꺾임 없이 유선형 접합
        const smootherstep = (edge0: number, edge1: number, x: number) => {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
            return t * t * t * (t * (t * 6 - 15) + 10)
        }

        const buildPath = (
            widthPx: number,
            wavelengthPx: number,
            phaseOffset: number,
            speed: number,
            heightScale: number,
            t: number,
            amp: number
        ) => {
            const steps = Math.max(64, Math.min(160, Math.round(widthPx / 4)))
            const fadePx = Math.min(96, widthPx * 0.28)
            const k = (Math.PI * 2) / wavelengthPx
            const pts: [number, number][] = []

            for (let i = 0; i <= steps; i++) {
                const u = i / steps
                const xPx = u * widthPx
                const xView = u * 400
                const edgeFade =
                    smootherstep(0, fadePx, xPx) * smootherstep(0, fadePx, widthPx - xPx)
                const primary = 0.5 + 0.5 * Math.sin(xPx * k - t * speed + phaseOffset)
                const secondary =
                    0.5 + 0.5 * Math.sin(xPx * (k * 0.53) - t * (speed * 0.65) + phaseOffset * 1.7)
                const h = (0.28 + 0.52 * primary + 0.2 * secondary) * heightScale
                const y = H - edgeFade * h * (H - 2) * amp
                pts.push([xView, y])
            }

            let d = `M 0 ${H + 1} L ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
            for (let i = 1; i < pts.length - 1; i++) {
                const midX = (pts[i][0] + pts[i + 1][0]) / 2
                const midY = (pts[i][1] + pts[i + 1][1]) / 2
                d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
            }
            const last = pts[pts.length - 1]
            d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)} L 400 ${H + 1} Z`
            return d
        }

        const loop = (now: number) => {
            const dt = Math.min((now - lastTs) / 1000, 0.05)
            lastTs = now

            const targetAmp = isPlayingRef.current ? 1 : 0
            ampRef.current += (targetAmp - ampRef.current) * Math.min(1, dt * 4)

            const widthPx = svgRef.current?.clientWidth ?? 0
            const widthGain = smootherstep(18, 120, widthPx)
            const effectiveAmp = ampRef.current * widthGain

            if (effectiveAmp > 0.004 && widthPx > 18) {
                phase += dt * 0.9
                if (path1Ref.current) {
                    path1Ref.current.setAttribute(
                        "d",
                        buildPath(widthPx, 175, 0, 1.35, 0.95, phase, effectiveAmp)
                    )
                }
                if (path2Ref.current) {
                    path2Ref.current.setAttribute(
                        "d",
                        buildPath(widthPx, 220, Math.PI, 0.95, 0.88, phase, effectiveAmp)
                    )
                }
            } else {
                const flat = `M 0 ${H + 2} L 400 ${H + 2} Z`
                if (path1Ref.current) path1Ref.current.setAttribute("d", flat)
                if (path2Ref.current) path2Ref.current.setAttribute("d", flat)
            }

            rafId = requestAnimationFrame(loop)
        }

        rafId = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(rafId)
    }, [])

    if (widthPercent <= 0.5) return null

    return (
        <svg
            ref={svgRef}
            viewBox="0 0 400 27"
            preserveAspectRatio="none"
            className="absolute left-[5px] bottom-[calc(50%+4px)] pointer-events-none overflow-visible"
            style={{
                width: `max(0px, calc(${widthPercent}% - 5px))`,
                height: "16px",
            }}
        >
            <path ref={path2Ref} fill={color} fillOpacity={0.42} />
            <path ref={path1Ref} fill={color} fillOpacity={0.84} />
        </svg>
    )
}

export function MusicPlayer() {
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
    const [accessToken, setAccessToken] = useState<string | null>(null)
    const [deviceName, setDeviceName] = useState("Device")
    const [queue, setQueue] = useState<QueueTrack[]>([])
    const { pushToast } = useToaster()
    const [shuffleOn, setShuffleOn] = useState(false)
    const [repeatMode, setRepeatModeState] = useState<"off" | "track" | "context">("off")
    const [recentTrack, setRecentTrack] = useState<Track | null>(null)
    const [accentColor, setAccentColor] = useState<string>("#838383")
    // 시간 보정
    const [progressBaseMs, setProgressBaseMs] = useState(0)
    const [progressSyncAt, setProgressSyncAt] = useState(0)
    const [displayProgressMs, setDisplayProgressMs] = useState(0)
    const [isSeeking, setIsSeeking] = useState(false)
    const [titleMarqueeOn, setTitleMarqueeOn] = useState(false)
    const [showPlaylist, setShowPlaylist] = useState(true)
    const progressBaseRef = useRef(0)
    const progressSyncAtRef = useRef(0)
    const displayProgressRef = useRef(0)
    const isPlayingRef = useRef(false)
    const lastTrackIdRef = useRef<string | undefined>(undefined)
    const seekCommittedPosRef = useRef<number | null>(null)
    const seekStartXRef = useRef<number | null>(null)
    const seekStartYRef = useRef<number | null>(null)
    const seekStartTimeRef = useRef<number | null>(null)
    const seekGestureLockRef = useRef<"undecided" | "horizontal" | "vertical">("undecided")
    const titleWrapRef = useRef<HTMLDivElement | null>(null)
    const titleMeasureRef = useRef<HTMLDivElement | null>(null)
    const titleMarqueeInnerRef = useRef<HTMLDivElement | null>(null)
    const titleMarqueeOffsetRef = useRef(0)
    const titleMarqueeLastTsRef = useRef<number | null>(null)
    const titleMarqueePauseUntilRef = useRef<number | null>(null)
    useEffect(() => {
        if (!currentTrack?.title) return
        let raf1 = 0
        let raf2 = 0
        const measure = () => {
            const wrap = titleWrapRef.current
            const text = titleMeasureRef.current
            if (!wrap || !text) return
            const wrapW = wrap.clientWidth
            const textW = text.scrollWidth
            const should = textW > wrapW + 4
            setTitleMarqueeOn((prev) => (prev === should ? prev : should))
        }
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(measure)
        })
        const ro = new ResizeObserver(() => measure())
        if (titleWrapRef.current) ro.observe(titleWrapRef.current)
        if (titleMeasureRef.current) ro.observe(titleMeasureRef.current)
        return () => {
            cancelAnimationFrame(raf1)
            cancelAnimationFrame(raf2)
            ro.disconnect()
        }
    }, [currentTrack?.title, titleMarqueeOn])
    useEffect(() => {
        const inner = titleMarqueeInnerRef.current
        if (!inner) return
        const prefersReduced =
            typeof window !== "undefined" &&
            "matchMedia" in window &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (prefersReduced || !titleMarqueeOn) {
            titleMarqueeOffsetRef.current = 0
            titleMarqueeLastTsRef.current = null
            titleMarqueePauseUntilRef.current = null
            inner.style.transform = "translateX(0px)"
            return
        }
        const SPEED_PX_PER_SEC = 70
        const GAP_PX = 64
        const PAUSE_MS = 3000
        titleMarqueeOffsetRef.current = 0
        titleMarqueeLastTsRef.current = null
        titleMarqueePauseUntilRef.current = performance.now() + PAUSE_MS
        inner.style.transform = "translateX(0px)"
        let raf = 0
        const tick = (ts: number) => {
            const innerEl = titleMarqueeInnerRef.current
            const firstBlock = titleMeasureRef.current
            if (!innerEl || !firstBlock) return
            const cycleW = firstBlock.scrollWidth + GAP_PX
            if (!Number.isFinite(cycleW) || cycleW <= 0) {
                raf = requestAnimationFrame(tick)
                return
            }
            const last = titleMarqueeLastTsRef.current ?? ts
            titleMarqueeLastTsRef.current = ts
            const pauseUntil = titleMarqueePauseUntilRef.current
            if (typeof pauseUntil === "number" && ts < pauseUntil) {
                raf = requestAnimationFrame(tick)
                return
            }
            const dtMs = ts - last
            const deltaPx = (dtMs / 1000) * SPEED_PX_PER_SEC
            let next = titleMarqueeOffsetRef.current + deltaPx
            if (next >= cycleW) {
                next = 0
                titleMarqueePauseUntilRef.current = ts + PAUSE_MS
            }
            titleMarqueeOffsetRef.current = next
            innerEl.style.transform = `translateX(${-next}px)`
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [titleMarqueeOn, currentTrack?.title])
    useEffect(() => {
        progressBaseRef.current = progressBaseMs
    }, [progressBaseMs])
    useEffect(() => {
        progressSyncAtRef.current = progressSyncAt
    }, [progressSyncAt])
    useEffect(() => {
        displayProgressRef.current = displayProgressMs
    }, [displayProgressMs])
    useEffect(() => {
        isPlayingRef.current = isPlaying
    }, [isPlaying])
    useEffect(() => {
        let mounted = true
        let intervalId: number | null = null
        const init = async () => {
            try {
                await handleSpotifyCallback().catch((e) => {
                    pushToast(e instanceof Error ? e.message : String(e), {
                        kind: "error",
                    })
                })
                const envToken = import.meta.env.VITE_SPOTIFY_ACCESS_TOKEN
                const token = (await getValidSpotifyAccessToken()) || envToken
                if (!mounted) return
                if (token) {
                    setAccessToken(token)
                    await Promise.all([loadCurrentTrack(token), loadQueue(token)])
                    intervalId = window.setInterval(async () => {
                        const valid = (await getValidSpotifyAccessToken()) || envToken
                        if (!valid) return
                        if (!mounted) return
                        setAccessToken(valid)
                        await Promise.all([loadCurrentTrack(valid), loadQueue(valid)])
                    }, 5000)
                    return
                }
                setCurrentTrack(null)
                setQueue([])
                setDeviceName("Spotify")
            } catch (e) {
                if (!mounted) return
                pushToast(e instanceof Error ? e.message : String(e), {
                    kind: "error",
                })
            }
        }
        const cleanupPromise = init()
        return () => {
            mounted = false
            if (intervalId) window.clearInterval(intervalId)
            void cleanupPromise
        }
    }, [])
    const mapSpotifyTrackToTrack = (t: any, progressMs: number): Track => {
        return {
            id: t?.id,
            uri: t?.uri,
            title: t?.name ?? "-",
            artist: Array.isArray(t?.artists)
                ? t.artists
                      .map((a: any) => a?.name)
                      .filter(Boolean)
                      .join(", ")
                : "-",
            album: t?.album?.name ?? "-",
            coverUrl: t?.album?.images?.[0]?.url ?? "",
            duration: Number(t?.duration_ms ?? 0),
            progress: Math.max(0, Math.floor(progressMs)),
        }
    }
    const loadRecent = async (token: string) => {
        const t = await getRecentlyPlayedTrack(token)
        if (!t) return
        setRecentTrack(mapSpotifyTrackToTrack(t, 0))
    }
    const loadCurrentTrack = async (token: string) => {
        const state = await getPlayerState(token)
        if (!state || !state.track) {
            setCurrentTrack(null)
            await loadRecent(token)
            return
        }
        {
            const now = Date.now()
            const incomingTrackId = state.track.id
            const trackChanged =
                typeof incomingTrackId === "string" && incomingTrackId !== lastTrackIdRef.current
            setCurrentTrack(mapSpotifyTrackToTrack(state.track, state.progress_ms))
            setIsPlaying(state.is_playing)
            setDeviceName(state.device?.name || "Device")
            if (typeof state.shuffle_state === "boolean") {
                setShuffleOn(state.shuffle_state)
            }
            if (state.repeat_state) {
                setRepeatModeState(state.repeat_state)
            }
            const serverMs = Math.max(0, Math.floor(state.progress_ms))
            const predictedMs =
                isPlayingRef.current && progressSyncAtRef.current
                    ? progressBaseRef.current + (now - progressSyncAtRef.current)
                    : serverMs
            const closeEnough = Math.abs(serverMs - predictedMs) <= 1200
            const nextBase =
                trackChanged || !state.is_playing || !closeEnough
                    ? serverMs
                    : Math.max(serverMs, Math.floor(predictedMs))
            lastTrackIdRef.current = incomingTrackId
            setProgressBaseMs(nextBase)
            setProgressSyncAt(now)
            setDisplayProgressMs(nextBase)
        }
    }
    const dominantColorCacheRef = useRef<Map<string, string>>(new Map())
    useEffect(() => {
        if (!currentTrack?.id || !currentTrack.coverUrl) return
        const trackId = currentTrack.id
        const coverUrl = currentTrack.coverUrl
        const cached = dominantColorCacheRef.current.get(trackId)
        if (cached) {
            setAccentColor(cached)
            return
        }
        let alive = true
        ;(async () => {
            const color = await extractDominantColor(coverUrl)
            if (!alive || !color) return
            dominantColorCacheRef.current.set(trackId, color)
            setAccentColor(color)
        })()
        return () => {
            alive = false
        }
    }, [currentTrack?.id])
    const waveMask =
        "linear-gradient(to right, transparent 0px, black 50px, black calc(100% - 50px), transparent 100%)"
    const waveBgUrls = useMemo(() => {
        const rgb = parseColorToRgb(accentColor)
        const highlightA = rgb ? lightenRgb(rgb, 0.42) : { r: 255, g: 255, b: 255 }
        const highlightB = rgb ? lightenRgb(rgb, 0.22) : { r: 240, g: 240, b: 240 }
        return {
            wave1: makeWaveDataUrl(`rgb(${highlightA.r}, ${highlightA.g}, ${highlightA.b})`, {
                amplitude: 7,
                opacity: 0.6,
                period: 125,
            }),
            wave2: makeWaveDataUrl(`rgb(${highlightB.r}, ${highlightB.g}, ${highlightB.b})`, {
                amplitude: 5,
                opacity: 0.5,
                period: 100,
            }),
        }
    }, [accentColor])
    const { playlistGradient, playlistRepresentative } = useMemo(() => {
        try {
            const base = oklch(accentColor) as any
            if (!base || typeof base.l !== "number") throw new Error("invalid base color")
            const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
            const a: Oklch = {
                mode: "oklch",
                l: clamp01(base.l + 0.06),
                c: Math.max(0, base.c * 0.9),
                h: base.h,
            }
            const b: Oklch = {
                mode: "oklch",
                l: clamp01(base.l + 0.18),
                c: Math.max(0, base.c * 0.7),
                h: base.h,
            }
            const aRgb = formatRgb(a)
            const bRgb = formatRgb(b)
            const grad = `linear-gradient(to bottom right, ${aRgb}, ${bRgb})`
            return { playlistGradient: grad, playlistRepresentative: aRgb }
        } catch {
            const rgb = parseColorToRgb(accentColor)
            if (!rgb) return { playlistGradient: "#b1b1b1", playlistRepresentative: "#b1b1b1" }
            const bg = lightenRgb(rgb, 0.2)
            const col = `rgb(${bg.r}, ${bg.g}, ${bg.b})`
            return { playlistGradient: col, playlistRepresentative: col }
        }
    }, [accentColor])

    //
    const textColor = getReadableTextColor(playlistRepresentative)
    useEffect(() => {
        if (!currentTrack) return
        if (isSeeking) return
        const tick = () => {
            if (!currentTrack) return
            if (!isPlaying) {
                setDisplayProgressMs(progressBaseMs)
                return
            }
            const next = progressBaseMs + (Date.now() - progressSyncAt)
            const clamped = Math.min(currentTrack.duration, Math.max(0, Math.floor(next)))
            setDisplayProgressMs(clamped)
        }
        tick()
        const id = window.setInterval(tick, 200)
        return () => window.clearInterval(id)
    }, [currentTrack, isPlaying, isSeeking, progressBaseMs, progressSyncAt])
    const loadQueue = async (token: string) => {
        const q = await getQueue(token)
        if (!q) return
        const mapped = (q.queue ?? []).slice(0, 12).map((t) => ({
            uri: t.uri,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            album: t.album.name,
            coverUrl: t.album.images[2]?.url || t.album.images[0]?.url || "",
        }))
        setQueue(mapped)
    }
    const handlePlayPause = async () => {
        if (accessToken) {
            const success = await playPause(accessToken, !isPlaying)
            if (success) {
                const now = Date.now()
                if (isPlaying) {
                    setProgressBaseMs(displayProgressMs)
                    setProgressSyncAt(now)
                } else {
                    setProgressBaseMs(displayProgressMs)
                    setProgressSyncAt(now)
                }
                setIsPlaying(!isPlaying)
            }
        } else {
            setIsPlaying(!isPlaying)
        }
    }
    const handleShuffle = async () => {
        if (!accessToken) return
        const next = !shuffleOn
        const ok = await setShuffle(accessToken, next)
        if (ok) setShuffleOn(next)
    }
    const handlePlayQueueItem = async (uri?: string) => {
        if (!accessToken || !uri) return
        const idx = queue.findIndex((q) => q.uri === uri)
        if (idx < 0) return
        for (let i = 0; i <= idx; i++) {
            await skipToNext(accessToken)
            await new Promise((r) => setTimeout(r, 200))
        }
        setTimeout(() => {
            void loadCurrentTrack(accessToken)
            void loadQueue(accessToken)
        }, 600)
    }
    const handleRepeat = async () => {
        if (!accessToken) return
        const nextMode =
            repeatMode === "off" ? "context" : repeatMode === "context" ? "track" : "off"
        const ok = await setRepeatMode(accessToken, nextMode)
        if (ok) setRepeatModeState(nextMode)
    }
    const handleNext = async () => {
        if (accessToken) {
            await skipToNext(accessToken)
            setTimeout(() => {
                void loadCurrentTrack(accessToken)
                void loadQueue(accessToken)
            }, 500)
        }
    }
    const handlePrevious = async () => {
        if (accessToken) {
            await skipToPrevious(accessToken)
            setTimeout(() => {
                void loadCurrentTrack(accessToken)
                void loadQueue(accessToken)
            }, 500)
        }
    }

    const updateSeekPreviewFromClientX = (clientX: number, rect: DOMRect) => {
        if (!currentTrack) return 0
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
        const pos = Math.round(ratio * currentTrack.duration)
        setDisplayProgressMs(pos)
        setProgressBaseMs(pos)
        setProgressSyncAt(Date.now())
        return pos
    }
    const handleSeekCommit = async (posMs: number) => {
        if (!accessToken) return
        const ok = await seekToPosition(accessToken, posMs)
        if (!ok) {
            void loadCurrentTrack(accessToken)
        }
    }
    if (!accessToken) {
        return (
            <div className="w-full h-full bg-gradient-to-br from-[#14171a] via-[#121214] to-[#0b0d0e] relative flex flex-col items-center justify-center gap-6 px-6 text-center overflow-hidden">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center">
                    <FaSpotify className="w-9 h-9 sm:w-11 sm:h-11 text-[#1DB954]" />
                </div>
                <div>
                    <h2 className="text-white text-2xl sm:text-3xl font-bold tracking-tight">
                        Spotify 연결
                    </h2>
                    <p className="mt-2 text-white/50 text-sm sm:text-base">
                        계정을 연결하면 재생 중인 음악과 플레이리스트를 제어할 수 있습니다
                    </p>
                </div>
                <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={async () => {
                        await logoutSpotify()
                        setAccessToken(null)
                        startSpotifyLogin()
                    }}
                    className="mt-1 flex items-center gap-3 px-7 py-3.5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-[0.98] text-black text-base sm:text-lg font-bold transition-all cursor-pointer"
                >
                    Spotify 로그인
                </button>
            </div>
        )
    }
    if (!currentTrack) {
        return (
            <div className="w-full h-full bg-[#161618] relative flex items-center justify-center overflow-hidden">
                {recentTrack ? (
                    <>
                        {recentTrack.coverUrl ? (
                            <div
                                className="absolute inset-0 bg-cover bg-center scale-110 blur-3xl opacity-45"
                                style={{
                                    backgroundImage: `url(${recentTrack.coverUrl})`,
                                }}
                            />
                        ) : null}
                        <div className="absolute inset-0 bg-black/45" />
                        <div className="relative z-10 max-w-[1100px] w-full px-8 sm:px-16 flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
                            {recentTrack.coverUrl && (
                                <img
                                    src={recentTrack.coverUrl}
                                    alt={recentTrack.album}
                                    className="w-48 h-48 sm:w-64 sm:h-64 rounded-3xl shadow-2xl object-cover ring-1 ring-white/15 shrink-0"
                                />
                            )}
                            <div className="min-w-0 text-center sm:text-left">
                                <div className="inline-flex items-center gap-2 text-white/70 text-xs sm:text-sm font-semibold mb-3">
                                    <FaSpotify className="w-5 h-5 text-[#1DB954]" />
                                    <span>최근 재생</span>
                                </div>
                                <div className="text-white text-[clamp(1.75rem,4vw,3.25rem)] font-bold leading-tight truncate">
                                    {recentTrack.title}
                                </div>
                                <div className="mt-2 text-white/65 text-base sm:text-xl font-medium truncate">
                                    {recentTrack.artist}
                                </div>
                                {accessToken && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await logoutSpotify()
                                            setAccessToken(null)
                                        }}
                                        className="mt-6 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold transition-colors cursor-pointer"
                                        aria-label="Logout"
                                    >
                                        로그아웃
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-white/50">
                        <FaSpotify className="w-10 h-10 opacity-60" />
                        <div className="text-lg font-medium">음악 재생 중이 아닙니다</div>
                    </div>
                )}
            </div>
        )
    }
    const progressPercent = (displayProgressMs / currentTrack.duration) * 100
    const currentTime = formatTime(displayProgressMs)
    const totalTime = formatTime(currentTrack.duration)
    const safeRatio = Number.isFinite(progressPercent)
        ? Math.min(100, Math.max(0, progressPercent))
        : 0
    const nextSong = queue[0]
    const listItems = queue.slice(0, 12)
    const nextSongLabel = nextSong ? truncateText(nextSong.title, 30) : "-"
    return (
        <div
            className="w-full h-full bg-[#121214] overflow-hidden relative select-none"
            data-disable-widget-swipe="true"
        >
            {/* 풀스크린 블러 앨범 배경 (재생 시 아주 느리게 유영) */}
            {currentTrack.coverUrl ? (
                <div
                    className="absolute inset-0 bg-cover bg-center blur-3xl opacity-55 ambient-bg-drift"
                    style={{
                        backgroundImage: `url(${currentTrack.coverUrl})`,
                        animationPlayState: isPlaying ? "running" : "paused",
                    }}
                />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-br from-black/45 via-black/35 to-black/65" />

            {/* 메인 풀페이지 레이아웃 */}
            <div className="relative z-10 h-full w-full max-w-[1440px] mx-auto px-6 sm:px-14 lg:px-20 py-14 sm:py-16 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-0">
                {/* 좌측(또는 중앙): Now Playing */}
                <div
                    className={`flex flex-col justify-center min-w-0 w-full flex-1 transition-all duration-300 ${
                        showPlaylist
                            ? "gap-6 max-w-[820px]"
                            : "gap-8 sm:gap-10 max-w-[1240px]"
                    }`}
                >
                    {/* 상단 디바이스 + 플레이리스트 토글 + 로그아웃 */}
                    <div
                        className="flex items-center justify-between gap-3"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2.5 text-white/85 min-w-0">
                            <FaSpotify className="w-6 h-6 text-[#1DB954] shrink-0" />
                            <span className="text-sm sm:text-base font-semibold truncate">
                                {deviceName}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowPlaylist((prev) => !prev)}
                                className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full ring-1 transition-colors cursor-pointer ${
                                    showPlaylist
                                        ? "bg-white text-neutral-950 ring-white"
                                        : "bg-white/10 hover:bg-white/15 text-white/80 hover:text-white ring-white/15"
                                }`}
                                aria-label={showPlaylist ? "플레이리스트 접기" : "플레이리스트 열기"}
                            >
                                <span>플레이리스트</span>
                            </button>
                            {accessToken ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        logoutSpotify()
                                        setAccessToken(null)
                                    }}
                                    className="text-white/60 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors cursor-pointer"
                                    aria-label="Logout"
                                >
                                    로그아웃
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {/* 앨범 아트 + 곡 정보 */}
                    <div
                        className={`flex items-center min-w-0 transition-all duration-300 ${
                            showPlaylist ? "gap-6 sm:gap-8" : "gap-7 sm:gap-12 lg:gap-14"
                        }`}
                    >
                        {currentTrack.coverUrl ? (
                            <img
                                src={currentTrack.coverUrl}
                                alt={currentTrack.album}
                                className={`rounded-3xl object-cover shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/15 shrink-0 transition-all duration-300 ${
                                    showPlaylist
                                        ? "w-28 h-28 sm:w-44 sm:h-44 lg:w-52 lg:h-52"
                                        : "w-36 h-36 sm:w-56 sm:h-56 lg:w-[min(44svh,360px)] lg:h-[min(44svh,360px)]"
                                }`}
                            />
                        ) : null}
                        <div className="min-w-0 flex-1">
                            <div
                                ref={titleWrapRef}
                                className={`text-white font-bold leading-tight overflow-hidden whitespace-nowrap transition-all duration-300 ${
                                    showPlaylist
                                        ? "text-[clamp(1.6rem,3.4vw,3rem)]"
                                        : "text-[clamp(2rem,4.5vw,4.25rem)]"
                                }`}
                            >
                                {titleMarqueeOn ? (
                                    <div className="marquee">
                                        <div ref={titleMarqueeInnerRef} className="marquee__inner">
                                            <div ref={titleMeasureRef} className="marquee__block">
                                                {currentTrack.title}
                                            </div>
                                            <div className="marquee__block" aria-hidden="true">
                                                {currentTrack.title}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div ref={titleMeasureRef} className="truncate">
                                        {currentTrack.title}
                                    </div>
                                )}
                            </div>
                            <div
                                className={`mt-2 sm:mt-3 text-white/75 font-semibold truncate transition-all duration-300 ${
                                    showPlaylist
                                        ? "text-[clamp(1rem,1.6vw,1.35rem)]"
                                        : "text-[clamp(1.2rem,2.2vw,1.9rem)]"
                                }`}
                            >
                                {currentTrack.artist}
                            </div>
                            <div
                                className={`mt-1.5 text-white/45 truncate transition-all duration-300 ${
                                    showPlaylist ? "text-xs sm:text-sm" : "text-sm sm:text-base"
                                }`}
                            >
                                {currentTrack.album}
                            </div>
                        </div>
                    </div>

                    {/* 프로그레스 바 (액체 물결 오버레이) */}
                    <div className="w-full pt-5">
                        <div className="relative h-6 flex items-center">
                            <LiquidWaveOverlay
                                color={accentColor}
                                isPlaying={isPlaying}
                                widthPercent={safeRatio}
                            />
                            <div className="relative w-full h-2.5 rounded-full bg-white/25 overflow-hidden">
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${safeRatio}%`,
                                        backgroundColor: accentColor,
                                    }}
                                />
                            </div>
                            <div
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full shadow-md ring-2 ring-black/15 pointer-events-none"
                                style={{
                                    left: `${safeRatio}%`,
                                    backgroundColor: accentColor,
                                }}
                            />
                            <div
                                className="absolute inset-0 cursor-pointer touch-pan-y"
                                style={{ touchAction: "pan-y" }}
                                onPointerDown={(e) => {
                                    e.stopPropagation()
                                    if (e.pointerType === "mouse") {
                                        e.preventDefault()
                                        ;(e.currentTarget as HTMLDivElement).setPointerCapture(
                                            e.pointerId
                                        )
                                        setIsSeeking(true)
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const pos = updateSeekPreviewFromClientX(e.clientX, rect)
                                        seekCommittedPosRef.current = pos
                                    } else {
                                        seekStartXRef.current = e.clientX
                                        seekStartYRef.current = e.clientY
                                        seekStartTimeRef.current = Date.now()
                                        seekGestureLockRef.current = "undecided"
                                    }
                                }}
                                onPointerMove={(e) => {
                                    if (e.pointerType === "mouse") {
                                        e.stopPropagation()
                                        if (!isSeeking) return
                                        e.preventDefault()
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        updateSeekPreviewFromClientX(e.clientX, rect)
                                    } else {
                                        if (seekStartXRef.current === null) return
                                        const dx = e.clientX - seekStartXRef.current
                                        const dy = e.clientY - (seekStartYRef.current ?? 0)
                                        if (
                                            seekGestureLockRef.current === "undecided" &&
                                            Math.abs(dx) > 10 &&
                                            Math.abs(dx) > Math.abs(dy) * 1.2
                                        ) {
                                            seekGestureLockRef.current = "horizontal"
                                            setIsSeeking(true)
                                            e.stopPropagation()
                                        }
                                        if (seekGestureLockRef.current === "horizontal") {
                                            e.stopPropagation()
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            updateSeekPreviewFromClientX(e.clientX, rect)
                                        }
                                    }
                                }}
                                onPointerUp={(e) => {
                                    e.stopPropagation()
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    if (isSeeking || e.pointerType === "mouse") {
                                        const pos = updateSeekPreviewFromClientX(e.clientX, rect)
                                        setIsSeeking(false)
                                        void handleSeekCommit(pos)
                                    }
                                    seekStartXRef.current = null
                                    seekCommittedPosRef.current = null
                                    seekGestureLockRef.current = "undecided"
                                }}
                                onPointerCancel={() => {
                                    setIsSeeking(false)
                                    seekCommittedPosRef.current = null
                                    seekStartXRef.current = null
                                    seekGestureLockRef.current = "undecided"
                                }}
                            />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs sm:text-sm font-semibold text-white/75 tabular-nums">
                            <span>{currentTime}</span>
                            <span>{totalTime}</span>
                        </div>
                    </div>

                    {/* 재생 컨트롤 */}
                    <div
                        className={`flex items-center justify-center pt-1 transition-all duration-300 ${
                            showPlaylist ? "gap-7 sm:gap-10" : "gap-9 sm:gap-14"
                        }`}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={handleShuffle}
                            className="text-white hover:scale-105 transition-transform cursor-pointer"
                            aria-label="Shuffle"
                            style={{ opacity: shuffleOn ? 1 : 0.45 }}
                        >
                            <FaShuffle
                                className={
                                    showPlaylist
                                        ? "w-6 h-6 sm:w-7 sm:h-7"
                                        : "w-7 h-7 sm:w-8 sm:h-8"
                                }
                            />
                        </button>
                        <button
                            type="button"
                            onClick={handlePrevious}
                            className="text-white hover:scale-105 transition-transform cursor-pointer"
                            aria-label="Previous"
                        >
                            <FaBackwardStep
                                className={
                                    showPlaylist
                                        ? "w-7 h-7 sm:w-8 sm:h-8"
                                        : "w-8 h-8 sm:w-10 sm:h-10"
                                }
                            />
                        </button>
                        <button
                            type="button"
                            onClick={handlePlayPause}
                            className={`rounded-full bg-white text-neutral-950 hover:scale-105 flex items-center justify-center shadow-xl transition-all cursor-pointer ${
                                showPlaylist
                                    ? "w-14 h-14 sm:w-16 sm:h-16"
                                    : "w-16 h-16 sm:w-20 sm:h-20"
                            }`}
                            aria-label={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? (
                                <FaPause
                                    className={
                                        showPlaylist
                                            ? "w-6 h-6 sm:w-7 sm:h-7"
                                            : "w-7 h-7 sm:w-8 sm:h-8"
                                    }
                                />
                            ) : (
                                <FaPlay
                                    className={`ml-0.5 ${
                                        showPlaylist
                                            ? "w-6 h-6 sm:w-7 sm:h-7"
                                            : "w-7 h-7 sm:w-8 sm:h-8"
                                    }`}
                                />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="text-white hover:scale-105 transition-transform cursor-pointer"
                            aria-label="Next"
                        >
                            <FaForwardStep
                                className={
                                    showPlaylist
                                        ? "w-7 h-7 sm:w-8 sm:h-8"
                                        : "w-8 h-8 sm:w-10 sm:h-10"
                                }
                            />
                        </button>
                        <button
                            type="button"
                            onClick={handleRepeat}
                            className="text-white hover:scale-105 transition-transform cursor-pointer relative"
                            aria-label="Repeat"
                            style={{ opacity: repeatMode === "off" ? 0.45 : 1 }}
                        >
                            <FaRepeat
                                className={
                                    showPlaylist
                                        ? "w-6 h-6 sm:w-7 sm:h-7"
                                        : "w-7 h-7 sm:w-8 sm:h-8"
                                }
                            />
                            {repeatMode === "track" && (
                                <span className="absolute -top-1.5 -right-2 text-[10px] font-bold bg-white text-black rounded-full w-4 h-4 flex items-center justify-center">
                                    1
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* 우측: Playlist / Up Next (접기/펼치기 가능) */}
                <AnimatePresence initial={false}>
                    {showPlaylist && (
                        <motion.div
                            initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                            animate={{ opacity: 1, width: "min(100%, 440px)", marginLeft: 48 }}
                            exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="shrink-0 overflow-hidden h-[300px] lg:h-full lg:max-h-[640px] max-lg:!ml-0 max-lg:!w-full"
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <motion.div
                                initial={{ x: 64 }}
                                animate={{ x: 0 }}
                                exit={{ x: 64 }}
                                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                className="w-full lg:w-[440px] h-full flex flex-col rounded-[32px] p-6 ring-1 ring-white/15 backdrop-blur-2xl overflow-hidden"
                                style={{
                                    backgroundImage: playlistGradient,
                                    backgroundColor: playlistRepresentative,
                                }}
                            >
                                <div className="flex items-center justify-between gap-3 pb-4 shrink-0">
                                    <div className="min-w-0">
                                        <div
                                            className="text-2xl font-bold leading-tight"
                                            style={{ color: textColor }}
                                        >
                                            Playlist
                                        </div>
                                        <div
                                            className="text-xs font-medium truncate mt-0.5"
                                            style={{ color: applyOpacity(textColor, 0.7).rgba }}
                                        >
                                            Next : {nextSongLabel}
                                        </div>
                                    </div>
                                    {/* <button
                                        type="button"
                                        aria-label="플레이리스트 접기"
                                        onClick={() => setShowPlaylist(false)}
                                        className="w-8 h-8 rounded-full bg-black/15 hover:bg-black/25 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                                        style={{ color: textColor }}
                                    >
                                        <FaXmark className="w-4 h-4" />
                                    </button> */}
                                </div>
                                <div
                                    className="flex-1 overflow-y-auto no-scrollbar space-y-3"
                                    style={{ WebkitOverflowScrolling: "touch" }}
                                >
                                    {listItems.map((t, idx) => (
                                        <div
                                            key={`${t.title}-${idx}`}
                                            className="flex items-center gap-3.5 p-2 rounded-2xl hover:bg-black/10 transition-colors cursor-pointer"
                                            role="button"
                                            aria-label={`Play ${t.title}`}
                                            onClick={() => void handlePlayQueueItem(t.uri)}
                                        >
                                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/20 shrink-0">
                                                {t.coverUrl ? (
                                                    <img
                                                        src={t.coverUrl}
                                                        alt={t.album}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : null}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div
                                                    className="text-base font-semibold leading-tight truncate"
                                                    style={{ color: textColor }}
                                                >
                                                    {t.title}
                                                </div>
                                                <div
                                                    className="mt-1 text-xs truncate"
                                                    style={{
                                                        color: applyOpacity(textColor, 0.7).rgba,
                                                    }}
                                                >
                                                    {t.artist}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
}
function truncateText(value: string, maxChars: number): string {
    const s = value ?? ""
    if (maxChars <= 0) return ""
    if (s.length <= maxChars) return s
    if (maxChars === 1) return "…"
    return `${s.slice(0, maxChars - 1)}…`
}
function makeWaveDataUrl(
    color: string,
    opts: {
        amplitude: number
        opacity: number
        period: number
    }
): string {
    const width = 120
    const height = 14
    const baseline = 9
    const amp = Math.max(0, opts.amplitude)
    const period = Math.max(4, Math.floor(opts.period))
    const opacity = Math.min(1, Math.max(0, opts.opacity))
    const d = buildWavePath({
        width,
        baseline,
        amplitude: amp,
        period,
    })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
<path d="${d} L${width} ${height} L0 ${height} Z" fill="${color}" opacity="${opacity}" />
</svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
function buildWavePath(opts: {
    width: number
    baseline: number
    amplitude: number
    period: number
}): string {
    const { width, baseline, amplitude, period } = opts
    const half = period / 2
    const quarter = period / 4
    let d = `M0 ${baseline}`
    let x = 0
    let up = true
    while (x < width) {
        const xCtrl = x + quarter
        const xEnd = x + half
        const yCtrl = baseline + (up ? -amplitude : amplitude)
        const endX = Math.min(width, xEnd)
        const ctrlX = Math.min(width, xCtrl)
        d += ` Q${ctrlX} ${yCtrl} ${endX} ${baseline}`
        x = xEnd
        up = !up
    }
    return d
}
function parseColorToRgb(color: string): {
    r: number
    g: number
    b: number
} | null {
    const trimmed = color.trim()
    const rgbMatch = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(trimmed)
    if (rgbMatch) {
        return {
            r: clamp255(Number(rgbMatch[1])),
            g: clamp255(Number(rgbMatch[2])),
            b: clamp255(Number(rgbMatch[3])),
        }
    }
    const hexMatch = /^#?([0-9a-f]{6})$/i.exec(trimmed)
    if (hexMatch) {
        const hex = hexMatch[1]
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        }
    }
    return null
}
function clamp255(n: number): number {
    return Math.min(255, Math.max(0, Math.floor(n)))
}
function lightenRgb(
    rgb: {
        r: number
        g: number
        b: number
    },
    amount: number
): { r: number; g: number; b: number } {
    const a = Math.min(1, Math.max(0, amount))
    return {
        r: clamp255(rgb.r + (255 - rgb.r) * a),
        g: clamp255(rgb.g + (255 - rgb.g) * a),
        b: clamp255(rgb.b + (255 - rgb.b) * a),
    }
}
export async function extractDominantColor(imageUrl: string): Promise<string | null> {
    try {
        try {
            const res = await fetch(imageUrl, {
                mode: "cors",
                cache: "force-cache",
            })
            if (res.ok) {
                const blob = await res.blob()
                const objectUrl = URL.createObjectURL(blob)
                try {
                    const palette = await new Vibrant(objectUrl).getPalette()
                    const rgb =
                        palette.Vibrant?.rgb ??
                        palette.Muted?.rgb ??
                        palette.LightVibrant?.rgb ??
                        palette.DarkVibrant?.rgb ??
                        palette.LightMuted?.rgb ??
                        palette.DarkMuted?.rgb ??
                        null
                    if (rgb) {
                        const [r, g, b] = rgb
                        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
                    }
                } finally {
                    URL.revokeObjectURL(objectUrl)
                }
            }
        } catch {
            // Vibrant 실패 → canvas fallback
        }
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image()
            el.crossOrigin = "anonymous"
            el.decoding = "async"
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error("image load failed"))
            el.src = imageUrl
        })
        const size = 32
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) return null
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        const counts = new Map<number, number>()
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3]
            if (a < 200) continue
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const max = Math.max(r, g, b)
            const min = Math.min(r, g, b)
            if (max < 20) continue
            if (min > 235) continue
            const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        let bestKey: number | null = null
        let bestCount = 0
        for (const [k, c] of counts) {
            if (c > bestCount) {
                bestKey = k
                bestCount = c
            }
        }
        if (bestKey == null) return null
        const r = ((bestKey >> 8) & 0x0f) * 16 + 8
        const g = ((bestKey >> 4) & 0x0f) * 16 + 8
        const b = (bestKey & 0x0f) * 16 + 8
        return `rgb(${r}, ${g}, ${b})`
    } catch {
        return null
    }
}
