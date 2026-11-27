import { useEffect, useState } from "react"
import { FaGoogle, FaSpotify } from "react-icons/fa6"
import { IoChevronForward, IoGridOutline } from "react-icons/io5"
import {
    fetchGoogleAuthStatus,
    logoutGoogle,
    type GoogleAuthStatus,
} from "../utils/schedule"
import {
    isSpotifyConnected,
    logoutSpotify,
    startSpotifyLogin,
} from "../utils/spotifyAuth"

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

    useEffect(() => {
        if (!isOpen && dragProgress <= 0) return
        setSpotifyConnected(isSpotifyConnected())
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
        try {
            localStorage.removeItem("dashboard.spotify.player.cache.v1")
        } catch {
            // ignore
        }
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
                    transition: isDragging ? "none" : "opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
            />

            {/* 풀폭 바텀 시트 */}
            <div
                role="dialog"
                aria-label="설정"
                className="relative z-10 w-full rounded-t-[28px] bg-neutral-900/95 backdrop-blur-2xl border-t border-white/10 px-6 sm:px-12 pt-3 pb-10 text-white"
                style={{
                    transform: `translateY(${translatePercent}%)`,
                    transition: isDragging
                        ? "none"
                        : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
            >
                <div className="w-full max-w-3xl mx-auto">
                    {/* 핸들 */}
                    <div className="flex justify-center pb-5">
                        <div className="w-10 h-1 rounded-full bg-white/20" />
                    </div>

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
                                        {googleAuth.connected && googleAuth.user?.email ? (
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
                                        <span className="text-[13px] text-white/45">
                                            {spotifyConnected ? "연결됨" : "연결 안 됨"}
                                        </span>
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

                        {/* 위젯 편집 */}
                        <div className="rounded-2xl bg-white/[0.06] overflow-hidden">
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
