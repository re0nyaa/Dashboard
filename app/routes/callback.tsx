import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { handleSpotifyCallback } from "../utils/spotifyAuth"

export default function Callback() {
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        const run = async () => {
            try {
                await handleSpotifyCallback()
            } catch (e) {
                if (!active) return
                setError(e instanceof Error ? e.message : String(e))
                setTimeout(() => {
                    navigate("/", { replace: true })
                }, 5000)
                return
            }
            if (!active) return
            navigate("/", { replace: true })
        }
        void run()
        return () => {
            active = false
        }
    }, [navigate])

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <div className="text-center space-y-3">
                <div className="text-2xl font-bold">Connecting to Spotify…</div>
                <div className="text-sm text-white/70">
                    이 창은 잠시 후 자동으로 닫히거나 홈으로 이동합니다.
                </div>
                {error ? <div className="text-red-400 text-sm">{error}</div> : null}
            </div>
        </div>
    )
}
