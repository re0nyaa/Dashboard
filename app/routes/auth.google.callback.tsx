import { useEffect } from "react"
import { useLoaderData, useNavigate } from "react-router"
import {
    buildClearAuthCookies,
    buildTokenCookies,
    COOKIE_STATE,
    exchangeGoogleCode,
    parseCookies,
} from "../utils/googleAuth.server"

export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const error = url.searchParams.get("error")

    if (error || !code) {
        return Response.json({ ok: false, error: error ?? "missing_code" })
    }

    const cookies = parseCookies(request.headers.get("cookie"))
    if (!cookies[COOKIE_STATE] || cookies[COOKIE_STATE] !== state) {
        return Response.json({ ok: false, error: "invalid_state" })
    }

    try {
        const tokens = await exchangeGoogleCode(code, request.url)
        const headers = new Headers()
        for (const c of buildClearAuthCookies()) headers.append("Set-Cookie", c)
        for (const c of buildTokenCookies(tokens)) headers.append("Set-Cookie", c)
        return Response.json({ ok: true, error: null }, { headers })
    } catch (e) {
        const msg = e instanceof Error ? e.message : "token_exchange_failed"
        return Response.json({ ok: false, error: msg })
    }
}

export default function GoogleCallback() {
    const navigate = useNavigate()
    const data = useLoaderData<typeof loader>() as { ok: boolean; error: string | null }

    useEffect(() => {
        const timer = window.setTimeout(
            () => {
                navigate("/", { replace: true })
            },
            data.ok ? 600 : 2500
        )
        return () => window.clearTimeout(timer)
    }, [data.ok, navigate])

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <div className="text-center space-y-3">
                <div className="text-2xl font-bold">Connecting to Google…</div>
                <div className="text-sm text-white/70">
                    이 창은 잠시 후 자동으로 닫히거나 홈으로 이동합니다.
                </div>
                {data.error ? <div className="text-red-400 text-sm">{data.error}</div> : null}
            </div>
        </div>
    )
}
