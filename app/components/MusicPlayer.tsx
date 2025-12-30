import { useState, useEffect, useMemo, useRef } from "react"

import {
    getPlayerState,
    getQueue,
    getRecentlyPlayedTrack,
    playPause,
    playTrackUris,
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
} from "react-icons/fa6"

import { getReadableTextColor, applyOpacity } from "~/utils/colorUtils"

import {
    getValidSpotifyAccessToken,
    handleSpotifyCallback,
    logoutSpotify,
    startSpotifyLogin,
} from "../utils/spotifyAuth"

import { useToaster } from "./Toaster"

import { Vibrant } from "node-vibrant/browser"

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

    // 5초사의 공백을 메우기 위한 진행 시간 보정

    const [progressBaseMs, setProgressBaseMs] = useState(0)

    const [progressSyncAt, setProgressSyncAt] = useState(0)

    const [displayProgressMs, setDisplayProgressMs] = useState(0)

    const [isSeeking, setIsSeeking] = useState(false)

    const [titleMarqueeOn, setTitleMarqueeOn] = useState(false)

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

    const playlistBgColor = useMemo(() => {
        const rgb = parseColorToRgb(accentColor)

        if (!rgb) return "#b1b1b1"

        const bg = lightenRgb(rgb, 0.2)

        return `rgb(${bg.r}, ${bg.g}, ${bg.b})`
    }, [accentColor])

    const textColor = getReadableTextColor(playlistBgColor)

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

    const handlePlayRecent = async () => {
        if (!accessToken || !recentTrack?.uri) return

        const state = await getPlayerState(accessToken)

        if (!state || !state.device) {
            pushToast(
                "재생 가능한 Spotify 디바이스가 없습니다. Spotify 앱을 켜고 재생을 시작해 주세요.",

                { kind: "error" }
            )

            return
        }

        const ok = await playTrackUris(accessToken, [recentTrack.uri])

        if (!ok) return

        setTimeout(() => {
            void loadCurrentTrack(accessToken)

            void loadQueue(accessToken)
        }, 600)
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
            <div className="w-[860px] h-[440px] bg-[#4b4b4b] rounded-[30px] flex items-center justify-center">
                <button
                    type="button"
                    onClick={() => {
                        logoutSpotify()

                        setAccessToken(null)

                        startSpotifyLogin()
                    }}
                    className="flex items-center gap-4 px-10 py-6 rounded-[24px] bg-[#30D866] text-[#000] text-2xl font-bold"
                >
                    <FaSpotify className="w-10 h-10" />
                    Spotify 로그인
                </button>
            </div>
        )
    }

    if (!currentTrack) {
        return (
            <div className="w-[860px] h-[440px] bg-[#4b4b4b] rounded-[30px] flex items-center justify-center">
                {recentTrack ? (
                    <div className="w-[860px] h-[440px] rounded-[26px] overflow-hidden relative">
                        {recentTrack.coverUrl ? (
                            <div
                                className="absolute inset-0 bg-cover bg-center"
                                style={{
                                    backgroundImage: `url(${recentTrack.coverUrl})`,
                                }}
                            />
                        ) : null}

                        <div className="absolute inset-0 bg-black/35" />

                        <div className="absolute left-[36px] top-[28px] flex items-center gap-3 text-white">
                            <FaSpotify className="w-7 h-7" />

                            <div className="text-[12px] font-bold">최근 재생</div>
                        </div>

                        <div className="absolute left-[36px] top-[86px]">
                            <div className="text-white text-[36px] font-normal leading-none">
                                {recentTrack.title}
                            </div>

                            <div className="mt-3 text-[#eee] text-[16px] font-bold leading-none">
                                {recentTrack.artist}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => void handlePlayRecent()}
                            className="absolute right-[10px] bottom-[10px] -translate-x-1/2 bg-[#30D866] -translate-y-1/2 w-[60px] h-[60px] rounded-full text-white"
                            aria-label="Play recent"
                        >
                            <FaPlay className="w-[30px] h-[30px] mx-auto text-black" />
                        </button>

                        {accessToken ? (
                            <button
                                type="button"
                                onClick={() => {
                                    logoutSpotify()

                                    setAccessToken(null)
                                }}
                                className="absolute top-[30px] right-[50px] text-white text-[12px] font-bold opacity-70"
                                aria-label="Logout"
                            >
                                로그아웃
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div className="text-white/60 text-lg">음악 재생 중이 아닙니다</div>
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

    const BAR_W = 760

    const KNOB = 22

    const barX = 50

    const knobLeft = barX + ((BAR_W - KNOB) * safeRatio) / 100

    const nextSong = queue[0]

    const listItems = queue.slice(0, 12)

    const nextSongLabel = nextSong ? truncateText(nextSong.title, 30) : "-"

    return (
        <div
            className="w-[860px] h-[440px] overflow-y-auto overflow-x-hidden no-scrollbar touch-pan-y select-none overscroll-x-none"
            data-disable-widget-swipe="true"
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
            <div className="relative w-[860px] h-[810px]">
                <div className="absolute left-0 top-0 w-[860px] h-[350px] rounded-[45px] overflow-hidden">
                    {currentTrack.coverUrl ? (
                        <div
                            className="absolute inset-0 bg-cover bg-center"
                            style={{
                                backgroundImage: `url(${currentTrack.coverUrl})`,
                            }}
                        />
                    ) : null}

                    <div className="absolute inset-0 bg-black/25" />

                    <div className="absolute left-[50px] top-[30px] flex items-center gap-1 text-white">
                        <FaSpotify className="w-5 h-5" />

                        <div className="text-[12px] font-bold">{deviceName}</div>
                    </div>

                    <div className="absolute left-[48px] top-[90px] w-[760px]">
                        <div
                            ref={titleWrapRef}
                            className="text-white text-[40px] font-normal leading-none overflow-hidden whitespace-nowrap"
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
                                <div ref={titleMeasureRef} className="whitespace-nowrap">
                                    {currentTrack.title}
                                </div>
                            )}
                        </div>

                        <div className="mt-3 text-[#eee] text-[16px] font-bold leading-none truncate">
                            {currentTrack.artist}
                        </div>
                    </div>

                    <div className="absolute left-0 top-[180px] w-full">
                        <div className="absolute left-[50px] top-[5px] h-[14px] w-[760px] rounded-[50px] border border-[rgba(0,0,0,0.12)] bg-[rgba(238,238,238,0.5)]" />

                        <div
                            className="absolute left-[50px] top-[5px] h-[14px] rounded-l-[50px]"
                            style={{
                                width: `${(BAR_W * safeRatio) / 100}px`,

                                backgroundColor: accentColor,
                            }}
                        />

                        <div
                            className={`absolute left-[50px] top-[-9px] h-[14px] pointer-events-none ${
                                isPlaying ? "wave-anim" : "opacity-0"
                            }`}
                            style={{
                                width: `${(BAR_W * safeRatio) / 100}px`,

                                backgroundImage: `url('${waveBgUrls.wave1}')`,

                                backgroundRepeat: "repeat-x",

                                backgroundSize: "120px 14px",

                                backgroundPositionY: "0px",

                                WebkitMaskImage: waveMask,

                                maskImage: waveMask,

                                WebkitMaskRepeat: "no-repeat",

                                maskRepeat: "no-repeat",

                                WebkitMaskSize: "100% 100%",

                                maskSize: "100% 100%",

                                animationDuration: "7.5s",
                            }}
                        />

                        <div
                            className={`absolute left-[50px] top-[-8px] h-[14px] pointer-events-none ${
                                isPlaying ? "wave-anim" : "opacity-0"
                            }`}
                            style={{
                                width: `${(BAR_W * safeRatio) / 100}px`,

                                backgroundImage: `url('${waveBgUrls.wave2}')`,

                                backgroundRepeat: "repeat-x",

                                backgroundSize: "120px 14px",

                                backgroundPositionY: "0px",

                                WebkitMaskImage: waveMask,

                                maskImage: waveMask,

                                WebkitMaskRepeat: "no-repeat",

                                maskRepeat: "no-repeat",

                                WebkitMaskSize: "100% 100%",

                                maskSize: "100% 100%",

                                animationDuration: "11s",
                            }}
                        />

                        <div
                            className="absolute top-0 h-[24px] w-[24px] rounded-full"
                            style={{ left: `${knobLeft - 5}px` }}
                        >
                            <div
                                className="w-full h-full rounded-full"
                                style={{ backgroundColor: accentColor }}
                            />
                        </div>

                        <div
                            className="absolute left-[50px] top-0 h-[22px] w-[760px] cursor-pointer touch-pan-y"
                            style={{ touchAction: "pan-y" }}
                            onPointerDown={(e) => {
                                if (e.pointerType === "mouse") {
                                    e.stopPropagation()

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

                                    const absDx = Math.abs(dx)

                                    const absDy = Math.abs(dy)

                                    const INTENT_PX = 10

                                    const DOMINANCE = 1.2

                                    if (seekGestureLockRef.current === "undecided") {
                                        if (absDx > INTENT_PX && absDx > absDy * DOMINANCE) {
                                            seekGestureLockRef.current = "horizontal"

                                            setIsSeeking(true)

                                            e.stopPropagation()

                                            if (e.cancelable) e.preventDefault()
                                            ;(e.currentTarget as HTMLDivElement).setPointerCapture(
                                                e.pointerId
                                            )
                                        } else if (absDy > INTENT_PX && absDy > absDx * DOMINANCE) {
                                            seekGestureLockRef.current = "vertical"
                                        }
                                    }

                                    if (seekGestureLockRef.current === "horizontal") {
                                        e.stopPropagation()

                                        if (e.cancelable) e.preventDefault()

                                        const rect = e.currentTarget.getBoundingClientRect()

                                        updateSeekPreviewFromClientX(e.clientX, rect)
                                    }
                                }
                            }}
                            onPointerUp={(e) => {
                                if (e.pointerType === "mouse") {
                                    e.stopPropagation()

                                    if (!isSeeking) return

                                    e.preventDefault()

                                    const rect = e.currentTarget.getBoundingClientRect()

                                    const pos = updateSeekPreviewFromClientX(e.clientX, rect)

                                    setIsSeeking(false)

                                    void handleSeekCommit(pos)

                                    seekCommittedPosRef.current = null
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect()

                                    if (seekGestureLockRef.current === "horizontal") {
                                        e.stopPropagation()

                                        if (e.cancelable) e.preventDefault()

                                        const pos = updateSeekPreviewFromClientX(e.clientX, rect)

                                        setIsSeeking(false)

                                        void handleSeekCommit(pos)
                                    } else {
                                        if (
                                            seekStartXRef.current !== null &&
                                            seekGestureLockRef.current !== "vertical"
                                        ) {
                                            const dx = e.clientX - seekStartXRef.current

                                            const dy = e.clientY - (seekStartYRef.current ?? 0)

                                            const dt = Date.now() - (seekStartTimeRef.current ?? 0)

                                            if (
                                                dt < 250 &&
                                                Math.abs(dx) < 10 &&
                                                Math.abs(dy) < 10
                                            ) {
                                                const pos = updateSeekPreviewFromClientX(
                                                    e.clientX,

                                                    rect
                                                )

                                                void handleSeekCommit(pos)
                                            }
                                        }
                                    }

                                    seekStartXRef.current = null

                                    seekCommittedPosRef.current = null

                                    seekGestureLockRef.current = "undecided"

                                    setIsSeeking(false)
                                }
                            }}
                            onPointerCancel={() => {
                                setIsSeeking(false)

                                seekCommittedPosRef.current = null

                                seekStartXRef.current = null

                                seekGestureLockRef.current = "undecided"
                            }}
                        />

                        <div className="absolute left-[50px] top-[34px] w-[323px] text-[#eee] text-[16px] font-bold">
                            {currentTime}
                        </div>

                        <div className="absolute left-[810px] top-[34px] w-[206px] -translate-x-full text-right text-[#eee] text-[16px] font-bold">
                            {totalTime}
                        </div>
                    </div>

                    <div className="absolute left-0 top-[260px] w-full h-[50px]">
                        <button
                            type="button"
                            onClick={handleShuffle}
                            className="absolute left-[144px] top-0 w-[50px] h-[50px] text-white"
                            aria-label="Shuffle"
                            style={{ opacity: shuffleOn ? 1 : 0.5 }}
                        >
                            <FaShuffle className="w-[40px] h-[40px]" />
                        </button>

                        <button
                            type="button"
                            onClick={handlePrevious}
                            className="absolute left-[275px] top-0 w-[50px] h-[50px] text-white"
                            aria-label="Previous"
                        >
                            <FaBackwardStep className="w-[40px] h-[40px]" />
                        </button>

                        <button
                            type="button"
                            onClick={handlePlayPause}
                            className="absolute left-[405px] top-0 w-[50px] h-[50px] text-white"
                            aria-label={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? (
                                <FaPause className="w-[40px] h-[40px]" />
                            ) : (
                                <FaPlay className="w-[40px] h-[40px]" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleNext}
                            className="absolute left-[535px] top-0 w-[50px] h-[50px] text-white"
                            aria-label="Next"
                        >
                            <FaForwardStep className="w-[40px] h-[40px]" />
                        </button>

                        <button
                            type="button"
                            onClick={handleRepeat}
                            className="absolute left-[665px] top-0 w-[50px] h-[50px] text-white flex items-center justify-center"
                            aria-label="Repeat"
                            style={{
                                opacity: repeatMode === "off" ? 0.5 : 1,

                                color: repeatMode === "off" ? "white" : "white",
                            }}
                        >
                            <div className="relative">
                                <FaRepeat className="w-[40px] h-[40px]" />

                                {repeatMode === "track" && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[14px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                        1
                                    </div>
                                )}
                            </div>
                        </button>
                    </div>

                    {accessToken ? (
                        <button
                            type="button"
                            onClick={() => {
                                logoutSpotify()

                                setAccessToken(null)
                            }}
                            className="absolute top-[30px] right-[50px] text-white text-[12px] font-bold opacity-70"
                            aria-label="Logout"
                        >
                            로그아웃
                        </button>
                    ) : null}
                </div>

                <div
                    className="absolute left-0 top-[375px] w-[860px] h-[400px] rounded-[45px]"
                    style={{ backgroundColor: playlistBgColor }}
                >
                    <div
                        className="absolute left-[50px] top-[22px] h-[40px] flex items-center"
                        style={{ color: textColor, fontSize: "32px", fontWeight: "bold" }}
                    >
                        Playlist
                    </div>

                    <div
                        className="absolute left-[810px] top-[22px] h-[40px] w-[616px] -translate-x-full flex items-center justify-end font-normal"
                        style={{ color: applyOpacity(textColor, 0.7).rgba, fontSize: "24px" }}
                    >
                        Next song : {nextSongLabel}
                    </div>

                    <div
                        className="absolute left-[50px] right-[50px] top-[90px] bottom-[24px] overflow-y-auto no-scrollbar"
                        style={{ WebkitOverflowScrolling: "touch" }}
                    >
                        <div className="space-y-5">
                            {listItems.map((t, idx) => (
                                <div
                                    key={`${t.title}-${idx}`}
                                    className="flex items-center cursor-pointer"
                                    role="button"
                                    aria-label={`Play ${t.title}`}
                                    onClick={() => void handlePlayQueueItem(t.uri)}
                                >
                                    <div className="w-[70px] h-[70px] rounded-[5px] overflow-hidden bg-white/30 shrink-0">
                                        {t.coverUrl ? (
                                            <img
                                                src={t.coverUrl}
                                                alt={t.album}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : null}
                                    </div>

                                    <div className="ml-[20px] min-w-0">
                                        <div
                                            className="text-[24px] font-normal leading-none truncate"
                                            style={{ color: textColor, fontWeight: 400 }}
                                        >
                                            {t.title}
                                        </div>

                                        <div
                                            className="mt-2 text-[16px] font-normal leading-none truncate"
                                            style={{ color: applyOpacity(textColor, 0.7).rgba }}
                                        >
                                            {t.artist}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
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

    opts: { amplitude: number; opacity: number; period: number }
): string {
    const width = 120

    const height = 14

    const baseline = 9

    const amp = Math.max(0, opts.amplitude)

    const period = Math.max(4, Math.floor(opts.period))

    const opacity = Math.min(1, Math.max(0, opts.opacity))

    const d = buildWavePath({ width, baseline, amplitude: amp, period })

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

function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
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
    rgb: { r: number; g: number; b: number },

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
