import { useEffect, useState } from "react"
import { FaGoogle, FaSpotify } from "react-icons/fa6"
import {
    IoCheckmark,
    IoChevronForward,
    IoColorPaletteOutline,
    IoGridOutline,
    IoLocationOutline,
    IoSearch,
    IoSettingsOutline,
    IoTimeOutline,
    IoWarningOutline,
} from "react-icons/io5"
import {
    CLOCK_BACKGROUNDS,
    CLOCK_STYLES,
    Clock,
    getClockAppearance,
    getClockBackgroundCss,
    setClockAppearance,
    type ClockAppearance,
} from "./Clock"
import { DateDisplay } from "./DateDisplay"
import { getSafetyAlertEnabled, setSafetyAlertEnabled } from "./SafetyAlertOverlay"
import { fetchGoogleAuthStatus, logoutGoogle, type GoogleAuthStatus } from "../utils/schedule"
import {
    fetchSpotifyUserProfile,
    getCachedSpotifyUserProfile,
    isSpotifyConnected,
    logoutSpotify,
    startSpotifyLogin,
    type SpotifyUserProfile,
} from "../utils/spotifyAuth"
import {
    getLocationPreference,
    searchLocations,
    setLocationPreference,
    type LocationPreference,
    type LocationSearchResult,
} from "../utils/weather"

export function SettingPanel({
    isOpen,
    dragProgress,
    isDragging,
    onClose,
    onOpenWidgetEditor,
}: {
    isOpen: boolean
    dragProgress: number
    isDragging: boolean
    onClose: () => void
    onOpenWidgetEditor: () => void
}) {
    const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus>({
        connected: false,
        user: null,
    })
    const [spotifyConnected, setSpotifyConnected] = useState(false)
    const [spotifyUser, setSpotifyUser] = useState<SpotifyUserProfile | null>(() =>
        typeof window !== "undefined" ? getCachedSpotifyUserProfile() : null
    )
    const [locationPref, setLocationPref] = useState<LocationPreference>(() =>
        getLocationPreference()
    )
    const [locationQuery, setLocationQuery] = useState("")
    const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([])
    const [searchingLocation, setSearchingLocation] = useState(false)
    const [safetyAlertOn, setSafetyAlertOn] = useState<boolean>(() => getSafetyAlertEnabled())
    const [clockAppearance, setClockAppearanceState] = useState<ClockAppearance>(() =>
        getClockAppearance()
    )
    const [activeTab, setActiveTab] = useState<"general" | "clock">("general")

    useEffect(() => {
        const q = locationQuery.trim()
        if (!q) {
            setLocationResults([])
            setSearchingLocation(false)
            return
        }
        let active = true
        setSearchingLocation(true)
        const timer = window.setTimeout(async () => {
            const results = await searchLocations(q)
            if (!active) return
            setLocationResults(results)
            setSearchingLocation(false)
        }, 350)
        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [locationQuery])

    useEffect(() => {
        if (!isOpen && dragProgress <= 0) return
        setLocationPref(getLocationPreference())
        const connected = isSpotifyConnected()
        setSpotifyConnected(connected)
        if (connected) {
            void fetchSpotifyUserProfile().then((p) => {
                if (p) setSpotifyUser(p)
            })
        } else {
            setSpotifyUser(null)
        }
        void fetchGoogleAuthStatus().then(setGoogleAuth)
    }, [isOpen, dragProgress > 0])

    const handleGoogleLogout = async () => {
        await logoutGoogle()
        setGoogleAuth({ connected: false, user: null })
        try {
            localStorage.setItem(
                "dashboard.gauth.cache.v1",
                JSON.stringify({ connected: false, user: null })
            )
        } catch {
            // ignore
        }
    }

    const handleSpotifyLogout = () => {
        logoutSpotify()
        setSpotifyConnected(false)
        setSpotifyUser(null)
        try {
            localStorage.removeItem("dashboard.spotify.player.cache.v1")
        } catch {
            // ignore
        }
    }

    const handleSearchLocation = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!locationQuery.trim()) return
        setSearchingLocation(true)
        const results = await searchLocations(locationQuery)
        setLocationResults(results)
        setSearchingLocation(false)
    }

    const handleSelectLocation = (loc: LocationSearchResult) => {
        const next: LocationPreference = {
            mode: "manual",
            name: loc.name,
            lat: loc.lat,
            lon: loc.lon,
        }
        setLocationPreference(next)
        setLocationPref(next)
        setLocationQuery("")
        setLocationResults([])
    }

    const handleResetAutoLocation = () => {
        const next: LocationPreference = { mode: "auto" }
        setLocationPreference(next)
        setLocationPref(next)
        setLocationResults([])
    }

    const visible = isOpen || dragProgress > 0
    if (!visible) return null

    const translatePercent = (1 - dragProgress) * 100

    return (
        <div
            className="fixed inset-0 z-40 flex items-end"
            onPointerDown={(e) => {
                if (e.target === e.currentTarget && isOpen) {
                    onClose()
                }
            }}
        >
            {/* 배경 딤 */}
            <div
                onClick={() => isOpen && onClose()}
                className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                style={{
                    opacity: dragProgress,
                    transition: isDragging
                        ? "none"
                        : "opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
            />

            {/* 풀폭 바텀 시트 */}
            <div
                role="dialog"
                aria-label="설정"
                className="relative z-10 w-full max-h-[85svh] overflow-y-auto no-scrollbar rounded-t-[28px] bg-neutral-900/95 backdrop-blur-2xl border-t border-white/10 px-6 sm:px-12 pt-3 pb-10 text-white"
                style={{
                    transform: `translateY(${translatePercent}%)`,
                    transition: isDragging
                        ? "none"
                        : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
            >
                <div className="w-full">
                    {/* 핸들 */}
                    <div className="flex justify-center pb-5">
                        <div className="w-10 h-1 rounded-full bg-white/20" />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-stretch">
                        {/* 좌측 iPadOS 스타일 사이드바 메뉴 */}
                        <nav
                            aria-label="설정 카테고리"
                            className="w-full sm:w-56 shrink-0 flex sm:flex-col gap-1.5 sm:border-r sm:border-white/[0.08] sm:pr-6"
                        >
                            <div className="hidden sm:block text-xl font-bold text-white/95 px-3 pb-3">
                                설정
                            </div>
                            {(
                                [
                                    { id: "general", label: "일반", Icon: IoSettingsOutline },
                                    { id: "clock", label: "시계 · 배경", Icon: IoTimeOutline },
                                ] as const
                            ).map(({ id, label, Icon }) => {
                                const active = activeTab === id
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActiveTab(id)}
                                        className={`flex-1 sm:flex-none flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition cursor-pointer outline-none ${
                                            active
                                                ? "bg-[#0A84FF] text-white shadow-sm"
                                                : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        <span>{label}</span>
                                    </button>
                                )
                            })}
                        </nav>

                        {/* 우측 전체 폭 본문 */}
                        <div className="flex-1 min-w-0">
                            {activeTab === "general" ? (
                                <div className="space-y-6">
                                    {/* 계정 그룹 */}
                                    <div>
                                        <div className="text-[13px] font-medium text-white/45 px-3 pb-2">
                                            계정
                                        </div>
                                        <div className="rounded-2xl bg-white/[0.06] divide-y divide-white/[0.07] overflow-hidden">
                                            {/* Google */}
                                            <div className="flex items-center justify-between px-4 py-3.5">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <FaGoogle className="w-4 h-4 text-white/80 shrink-0" />
                                                    <span className="text-[15px] font-medium text-white/95">
                                                        Google 캘린더
                                                    </span>
                                                    {googleAuth.connected &&
                                                    googleAuth.user?.email ? (
                                                        <span className="text-[13px] text-white/45 truncate">
                                                            {googleAuth.user.email}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {googleAuth.connected ? (
                                                    <button
                                                        type="button"
                                                        onClick={handleGoogleLogout}
                                                        className="text-[13px] font-medium text-red-400 hover:text-red-300 transition cursor-pointer shrink-0"
                                                    >
                                                        로그아웃
                                                    </button>
                                                ) : (
                                                    <a
                                                        href="/auth/google"
                                                        className="text-[13px] font-medium text-[#0A84FF] hover:text-[#409CFF] transition shrink-0"
                                                    >
                                                        로그인
                                                    </a>
                                                )}
                                            </div>

                                            {/* Spotify */}
                                            <div className="flex items-center justify-between px-4 py-3.5">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <FaSpotify className="w-4 h-4 text-[#1DB954] shrink-0" />
                                                    <span className="text-[15px] font-medium text-white/95">
                                                        Spotify
                                                    </span>
                                                    {spotifyConnected &&
                                                    spotifyUser?.displayName ? (
                                                        <span className="text-[13px] text-white/45 truncate">
                                                            {spotifyUser.displayName}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {spotifyConnected ? (
                                                    <button
                                                        type="button"
                                                        onClick={handleSpotifyLogout}
                                                        className="text-[13px] font-medium text-red-400 hover:text-red-300 transition cursor-pointer shrink-0"
                                                    >
                                                        로그아웃
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => void startSpotifyLogin()}
                                                        className="text-[13px] font-medium text-[#0A84FF] hover:text-[#409CFF] transition cursor-pointer shrink-0"
                                                    >
                                                        로그인
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 위치 설정 */}
                                    <div>
                                        <div className="text-[13px] font-medium text-white/45 px-3 pb-2">
                                            날씨 위치
                                        </div>
                                        <div className="rounded-2xl bg-white/[0.06] divide-y divide-white/[0.07] overflow-hidden">
                                            <div className="flex items-center justify-between px-4 py-3">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <IoLocationOutline className="w-4 h-4 text-white/80 shrink-0" />
                                                    <span className="text-[15px] font-medium text-white/95">
                                                        {locationPref.mode === "manual"
                                                            ? locationPref.name
                                                            : "자동 위치"}
                                                    </span>
                                                </div>
                                                {locationPref.mode === "manual" ? (
                                                    <button
                                                        type="button"
                                                        onClick={handleResetAutoLocation}
                                                        className="text-[13px] font-medium text-[#0A84FF] hover:text-[#409CFF] transition cursor-pointer shrink-0"
                                                    >
                                                        자동으로 전환
                                                    </button>
                                                ) : null}
                                            </div>

                                            <form
                                                onSubmit={handleSearchLocation}
                                                className="flex items-center gap-2.5 px-4 py-2.5"
                                            >
                                                <IoSearch className="w-4 h-4 text-white/40 shrink-0" />
                                                <input
                                                    type="text"
                                                    placeholder="주소 또는 지역 입력"
                                                    value={locationQuery}
                                                    onChange={(e) =>
                                                        setLocationQuery(e.target.value)
                                                    }
                                                    className="flex-1 bg-transparent text-[14px] text-white placeholder-white/35 outline-none"
                                                />
                                                {searchingLocation ? (
                                                    <span className="text-[12px] text-white/45 shrink-0">
                                                        검색 중
                                                    </span>
                                                ) : null}
                                            </form>

                                            {locationResults.length > 0 ? (
                                                <div className="max-h-60 overflow-y-auto no-scrollbar divide-y divide-white/[0.05]">
                                                    {locationResults.map((loc, i) => (
                                                        <button
                                                            key={`${loc.lat}-${loc.lon}-${i}`}
                                                            type="button"
                                                            onClick={() =>
                                                                handleSelectLocation(loc)
                                                            }
                                                            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.06] transition cursor-pointer"
                                                        >
                                                            <span className="text-[13px] text-white/90 truncate">
                                                                {loc.name}
                                                            </span>
                                                            <span className="text-[11px] text-white/40 tabular-nums shrink-0 ml-2">
                                                                {loc.lat.toFixed(2)},{" "}
                                                                {loc.lon.toFixed(2)}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                    {/* 위젯 편집 & 재난 문자 */}
                                    <div className="rounded-2xl bg-white/[0.06] divide-y divide-white/[0.07] overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={onOpenWidgetEditor}
                                            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.04] transition cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <IoGridOutline className="w-4 h-4 text-white/80 shrink-0" />
                                                <span className="text-[15px] font-medium text-white/95">
                                                    위젯 편집
                                                </span>
                                            </div>
                                            <IoChevronForward className="w-4 h-4 text-white/30" />
                                        </button>
                                        <div className="flex items-center justify-between px-4 py-3.5">
                                            <div className="flex items-center gap-3.5">
                                                <IoWarningOutline className="w-4 h-4 text-red-400 shrink-0" />
                                                <span className="text-[15px] font-medium text-white/95">
                                                    재난 안전 문자 알림
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={safetyAlertOn}
                                                onClick={() => {
                                                    const next = !safetyAlertOn
                                                    setSafetyAlertOn(next)
                                                    setSafetyAlertEnabled(next)
                                                }}
                                                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                                                    safetyAlertOn ? "bg-[#0A84FF]" : "bg-white/15"
                                                }`}
                                            >
                                                <span
                                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                                        safetyAlertOn
                                                            ? "translate-x-5"
                                                            : "translate-x-0"
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* 실시간 시계 미리보기 */}
                                    <div
                                        className="w-full h-[250px] rounded-2xl ring-1 ring-white/15 px-6 flex flex-col items-center justify-center overflow-hidden transition-colors duration-300"
                                        style={{
                                            background: getClockBackgroundCss(clockAppearance),
                                        }}
                                    >
                                        <div className="w-full max-w-[360px] pointer-events-none flex flex-col items-center justify-center gap-3">
                                            <Clock />
                                            <div className="scale-[0.6] origin-center -my-2">
                                                <DateDisplay />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 시계 스타일 · 초 표시 · 배경 */}
                                    <div className="rounded-2xl bg-white/[0.06] divide-y divide-white/[0.07] overflow-hidden">
                                        <div className="px-4 py-3.5 space-y-2.5">
                                            <div className="flex items-center gap-3.5">
                                                <IoTimeOutline className="w-4 h-4 text-white/80 shrink-0" />
                                                <span className="text-[15px] font-medium text-white/95">
                                                    시계 스타일
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-4 gap-2">
                                                {CLOCK_STYLES.map((opt) => {
                                                    const active = clockAppearance.style === opt.id
                                                    return (
                                                        <button
                                                            key={opt.id}
                                                            type="button"
                                                            onClick={() =>
                                                                setClockAppearanceState(
                                                                    setClockAppearance({
                                                                        style: opt.id,
                                                                    })
                                                                )
                                                            }
                                                            className={`py-2 rounded-xl text-[13px] font-semibold transition cursor-pointer ${
                                                                active
                                                                    ? "bg-[#0A84FF] text-white shadow"
                                                                    : "bg-white/[0.06] text-white/75 hover:bg-white/[0.11]"
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between px-4 py-3.5">
                                            <div className="flex items-center gap-3.5">
                                                <IoTimeOutline className="w-4 h-4 text-white/80 shrink-0" />
                                                <span className="text-[15px] font-medium text-white/95">
                                                    시계 초 표시
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={clockAppearance.showSeconds}
                                                onClick={() =>
                                                    setClockAppearanceState(
                                                        setClockAppearance({
                                                            showSeconds:
                                                                !clockAppearance.showSeconds,
                                                        })
                                                    )
                                                }
                                                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                                                    clockAppearance.showSeconds
                                                        ? "bg-[#0A84FF]"
                                                        : "bg-white/15"
                                                }`}
                                            >
                                                <span
                                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                                        clockAppearance.showSeconds
                                                            ? "translate-x-5"
                                                            : "translate-x-0"
                                                    }`}
                                                />
                                            </button>
                                        </div>

                                        <div className="px-4 py-3.5 space-y-3">
                                            <div className="flex items-center gap-3.5">
                                                <IoColorPaletteOutline className="w-4 h-4 text-white/80 shrink-0" />
                                                <span className="text-[15px] font-medium text-white/95">
                                                    배경
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                                {CLOCK_BACKGROUNDS.map((bg) => {
                                                    const active =
                                                        clockAppearance.background === bg.id
                                                    return (
                                                        <button
                                                            key={bg.id}
                                                            type="button"
                                                            onClick={() =>
                                                                setClockAppearanceState(
                                                                    setClockAppearance({
                                                                        background: bg.id,
                                                                    })
                                                                )
                                                            }
                                                            className="flex flex-col items-center gap-1.5 cursor-pointer group"
                                                        >
                                                            <span
                                                                className={`w-full h-9 rounded-xl flex items-center justify-center ring-2 transition ${
                                                                    active
                                                                        ? "ring-[#0A84FF]"
                                                                        : "ring-white/15 group-hover:ring-white/35"
                                                                }`}
                                                                style={{ background: bg.swatch }}
                                                            >
                                                                {active ? (
                                                                    <IoCheckmark
                                                                        className={`w-4 h-4 drop-shadow ${
                                                                            bg.light
                                                                                ? "text-zinc-900"
                                                                                : "text-white"
                                                                        }`}
                                                                    />
                                                                ) : null}
                                                            </span>
                                                            <span className="text-[11px] text-white/70">
                                                                {bg.label}
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setClockAppearanceState(
                                                            setClockAppearance({
                                                                background: "custom",
                                                            })
                                                        )
                                                    }
                                                    className="flex flex-col items-center gap-1.5 cursor-pointer group"
                                                >
                                                    <span
                                                        className={`w-full h-9 rounded-xl flex items-center justify-center ring-2 transition ${
                                                            clockAppearance.background === "custom"
                                                                ? "ring-[#0A84FF]"
                                                                : "ring-white/15 group-hover:ring-white/35"
                                                        }`}
                                                        style={{
                                                            background:
                                                                clockAppearance.customBg.mode ===
                                                                "gradient"
                                                                    ? `linear-gradient(${clockAppearance.customBg.angle}deg, ${clockAppearance.customBg.color1}, ${clockAppearance.customBg.color2})`
                                                                    : clockAppearance.customBg
                                                                          .color1,
                                                        }}
                                                    >
                                                        <IoColorPaletteOutline className="w-4 h-4 text-white drop-shadow" />
                                                    </span>
                                                    <span className="text-[11px] text-white/70">
                                                        직접 지정
                                                    </span>
                                                </button>
                                            </div>

                                            {clockAppearance.background === "custom" ? (
                                                <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] p-3 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="inline-flex p-0.5 rounded-lg bg-white/[0.06]">
                                                            {(
                                                                [
                                                                    { id: "solid", label: "단색" },
                                                                    {
                                                                        id: "gradient",
                                                                        label: "그라데이션",
                                                                    },
                                                                ] as const
                                                            ).map((m) => (
                                                                <button
                                                                    key={m.id}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setClockAppearanceState(
                                                                            setClockAppearance({
                                                                                customBg: {
                                                                                    ...clockAppearance.customBg,
                                                                                    mode: m.id,
                                                                                },
                                                                            })
                                                                        )
                                                                    }
                                                                    className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                                                                        clockAppearance.customBg
                                                                            .mode === m.id
                                                                            ? "bg-[#0A84FF] text-white"
                                                                            : "text-white/60 hover:text-white"
                                                                    }`}
                                                                >
                                                                    {m.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        {clockAppearance.customBg.mode ===
                                                        "gradient" ? (
                                                            <div className="flex items-center gap-2 text-xs text-white/70">
                                                                <span>각도</span>
                                                                <input
                                                                    type="range"
                                                                    min={0}
                                                                    max={360}
                                                                    step={15}
                                                                    value={
                                                                        clockAppearance.customBg
                                                                            .angle
                                                                    }
                                                                    onChange={(e) =>
                                                                        setClockAppearanceState(
                                                                            setClockAppearance({
                                                                                customBg: {
                                                                                    ...clockAppearance.customBg,
                                                                                    angle: Number(
                                                                                        e.target
                                                                                            .value
                                                                                    ),
                                                                                },
                                                                            })
                                                                        )
                                                                    }
                                                                    className="w-24 accent-[#0A84FF] cursor-pointer"
                                                                />
                                                                <span className="tabular-nums w-9 text-right">
                                                                    {clockAppearance.customBg.angle}
                                                                    °
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white/85 cursor-pointer">
                                                            <input
                                                                type="color"
                                                                value={
                                                                    clockAppearance.customBg.color1
                                                                }
                                                                onChange={(e) =>
                                                                    setClockAppearanceState(
                                                                        setClockAppearance({
                                                                            customBg: {
                                                                                ...clockAppearance.customBg,
                                                                                color1: e.target
                                                                                    .value,
                                                                            },
                                                                        })
                                                                    )
                                                                }
                                                                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                                                            />
                                                            <span className="tabular-nums uppercase">
                                                                {clockAppearance.customBg.color1}
                                                            </span>
                                                        </label>

                                                        {clockAppearance.customBg.mode ===
                                                        "gradient" ? (
                                                            <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white/85 cursor-pointer">
                                                                <input
                                                                    type="color"
                                                                    value={
                                                                        clockAppearance.customBg
                                                                            .color2
                                                                    }
                                                                    onChange={(e) =>
                                                                        setClockAppearanceState(
                                                                            setClockAppearance({
                                                                                customBg: {
                                                                                    ...clockAppearance.customBg,
                                                                                    color2: e.target
                                                                                        .value,
                                                                                },
                                                                            })
                                                                        )
                                                                    }
                                                                    className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                                                                />
                                                                <span className="tabular-nums uppercase">
                                                                    {
                                                                        clockAppearance.customBg
                                                                            .color2
                                                                    }
                                                                </span>
                                                            </label>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
